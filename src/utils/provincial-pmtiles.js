import { PMTiles } from 'pmtiles';
import { openPmtilesSource } from './pmtiles-source.js';

const DEFAULT_OPTIONS = {
  flavor: 'dark',
  lang: 'es',
  noWrap: true,
  minZoom: 5,
  maxZoom: 18,
  attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

function validBounds(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite);
}

export function boundsIntersect(left, right) {
  return validBounds(left) && validBounds(right)
    && left[0] <= right[2] && left[2] >= right[0]
    && left[1] <= right[3] && left[3] >= right[1];
}

function viewportBounds(map) {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function resolveFile(manifestUrl, file) {
  return new URL(String(file), manifestUrl).href;
}

export async function readProvinceMapManifest(url, fetchImpl = fetch) {
  const absolute = new URL(url, globalThis.location?.href || 'http://localhost/').href;
  const response = await fetchImpl(absolute, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Manifest PMTiles HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest?.schemaVersion !== 1 || !manifest.overview?.file || !Array.isArray(manifest.parties) || !validBounds(manifest.bounds)) {
    throw new Error('Manifest PMTiles provincial inválido.');
  }
  for (const party of manifest.parties) {
    if (!party?.id || !party?.file || !validBounds(party.bounds)) throw new Error('Partido inválido en manifest PMTiles.');
  }
  return { manifest, url: absolute };
}

export function partiesForViewport(manifest, bounds) {
  return manifest.parties.filter((party) => boundsIntersect(party.bounds, bounds));
}

// Protomaps works with 512px data tiles by default (levelDiff=1).
// An archive starting at source z10 first becomes visible at display z11.
export const PARTY_MIN_DISPLAY_ZOOM = 11;
// The 14 MB local PMTiles archive covers all transport services around Villars
// without swapping municipal tile layers as the map pans or zooms.
export const REGIONAL_DETAIL_BOUNDS = [-59.32, -35.22, -58.38, -34.48];

export function boundsContain(container, inner) {
  return validBounds(container) && validBounds(inner)
    && container[0] <= inner[0] && container[1] <= inner[1]
    && container[2] >= inner[2] && container[3] >= inner[3];
}
const MAX_CACHED_PARTY_LAYERS = 12;
const LOAD_CONCURRENCY = 3;

export function latLngBoundsFromGeoBounds(bounds) {
  if (!validBounds(bounds)) throw new Error('Invalid PMTiles geographic bounds');
  return [[bounds[1], bounds[0]], [bounds[3], bounds[2]]];
}

async function archiveLayer(leafletLayer, fileUrl, options, expectedBytes, transparent = false) {
  const opened = await openPmtilesSource(fileUrl, { expectedBytes });
  const archive = new PMTiles(opened.source);
  const header = await archive.getHeader();
  const layer = leafletLayer({
    ...DEFAULT_OPTIONS,
    ...options,
    url: archive,
    maxDataZoom: Math.min(Number(options.maxDataZoom), Number(header.maxZoom)),
  });
  // protomaps-leaflet 5.x paints a full opaque background for EACH layer
  // when "flavor" is set. A separate background per partido hides all the
  // previously rendered neighboring partidos, including on empty tiles.
  // Keep its paint/label rules, but make individual partido canvases transparent.
  if (transparent) layer.backgroundColor = undefined;
  return { header, deliveryMode: opened.mode, layer };
}

export async function addProvincialPmtiles({
  map,
  leafletLayer,
  manifestUrl = '/maps/buenos-aires/manifest.json',
  fallbackUrl = '/maps/villars-region.pmtiles',
  regionalDetailBounds = REGIONAL_DETAIL_BOUNDS,
  onTileError = () => {},
  onTileRecovered = () => {},
  manifestLoader = readProvinceMapManifest,
  archiveLayerFactory = archiveLayer,
} = {}) {
  try {
    const loaded = await manifestLoader(manifestUrl);
    const provinceBounds = latLngBoundsFromGeoBounds(loaded.manifest.bounds);
    // Never remove the overview on zoom: it provides continuous ground below
    // partido detail, while partido files download or near archive boundaries.
    const overview = await archiveLayerFactory(
      leafletLayer,
      resolveFile(loaded.url, loaded.manifest.overview.file),
      { bounds: provinceBounds, minZoom: 5, maxZoom: 18, maxDataZoom: 9 },
      loaded.manifest.overview.bytes,
      false,
    );
    overview.layer.on('tileerror', onTileError).on('load', onTileRecovered).addTo(map);

    const active = new Map();
    // A limited, reusable layer cache prevents downloading the same large
    // archive again each time someone pans across a municipality border.
    const cache = new Map();
    let generation = 0;
    let destroyed = false;
    let regionalTask;
    let regionalActive = false;

    function trimCache() {
      for (const id of cache.keys()) {
        if (cache.size <= MAX_CACHED_PARTY_LAYERS) break;
        if (!active.has(id)) cache.delete(id);
      }
    }

    function getParty(party) {
      let task = cache.get(party.id);
      if (task) {
        cache.delete(party.id);
        cache.set(party.id, task);
        return task;
      }
      task = archiveLayerFactory(
        leafletLayer,
        resolveFile(loaded.url, party.file),
        {
          bounds: latLngBoundsFromGeoBounds(party.bounds),
          minZoom: PARTY_MIN_DISPLAY_ZOOM,
          maxZoom: Number(loaded.manifest.maxVisualZoom || 18),
          maxDataZoom: Number(loaded.manifest.maxDataZoom || 15),
        },
        party.bytes,
        true,
      ).then((entry) => {
        entry.layer.on('tileerror', onTileError).on('load', onTileRecovered);
        return entry;
      }).catch((error) => {
        // Failed downloads are retryable, not cached as permanent blank regions.
        if (cache.get(party.id) === task) cache.delete(party.id);
        throw error;
      });
      cache.set(party.id, task);
      trimCache();
      return task;
    }

    function regionalLayer() {
      if (!regionalTask) {
        regionalTask = archiveLayerFactory(
          leafletLayer, new URL(fallbackUrl, loaded.url).href,
          { bounds: latLngBoundsFromGeoBounds(regionalDetailBounds),
            minZoom: PARTY_MIN_DISPLAY_ZOOM, maxZoom: 18, maxDataZoom: 14 },
          undefined, true,
        ).then((entry) => {
          entry.layer.on('tileerror', onTileError).on('load', onTileRecovered);
          return entry;
        }).catch((error) => {
          regionalTask = undefined;
          throw error;
        });
      }
      return regionalTask;
    }

    async function update() {
      const currentGeneration = ++generation;
      const bounds = viewportBounds(map);
      const detailed = map.getZoom() >= PARTY_MIN_DISPLAY_ZOOM;
      // Keep regional layer mounted once loaded. Mounting/unmounting Canvas
      // tile layers while Leaflet is animating a zoom can leave gray/blank
      // canvases, even when the PMTiles bytes are valid. Its own geographic
      // bounds and minZoom prevent requests outside the covered region.
      const intersectsRegional = detailed && validBounds(regionalDetailBounds)
        && boundsIntersect(regionalDetailBounds, bounds);
      let regionalReady = regionalActive;
      if (intersectsRegional && !regionalActive) {
        try {
          const entry = await regionalLayer();
          if (destroyed || currentGeneration !== generation) return;
          entry.layer.addTo(map);
          regionalActive = true;
          regionalReady = true;
        } catch (error) {
          if (!destroyed && currentGeneration === generation) onTileError({ error, file: fallbackUrl });
        }
      }
      // At regional edges load the surrounding municipalities without first
      // removing the regional tiles. Never take away coverage before the
      // replacement is available.
      const fullyRegional = regionalReady && boundsContain(regionalDetailBounds, bounds);
      const wanted = detailed && !fullyRegional
        ? new Set(partiesForViewport(loaded.manifest, bounds).map(({ id }) => id))
        : new Set();

      for (const [id, entry] of active) {
        if (!wanted.has(id)) {
          map.removeLayer(entry.layer);
          active.delete(id);
        }
      }
      trimCache();

      const missing = loaded.manifest.parties.filter(
        (party) => wanted.has(party.id) && !active.has(party.id),
      );
      // Panning cancels the remaining batches; otherwise a fast pan at z11
      // can fetch tens of HTTP-200 archives for a viewport no longer visible.
      for (let i = 0; i < missing.length; i += LOAD_CONCURRENCY) {
        if (destroyed || currentGeneration !== generation) return;
        await Promise.all(missing.slice(i, i + LOAD_CONCURRENCY).map(async (party) => {
          try {
            const entry = await getParty(party);
            if (destroyed || currentGeneration !== generation || !wanted.has(party.id)) return;
            if (!active.has(party.id)) {
              entry.layer.addTo(map);
              active.set(party.id, entry);
            }
          } catch (error) {
            if (!destroyed && currentGeneration === generation) {
              onTileError({ error, file: party.file });
            }
          }
        }));
      }
      trimCache();
      // On failure, overview remains visible; do NOT remove the whole map.
    }

    const handleMove = () => { void update().catch((error) => onTileError({ error })); };
    map.on('moveend zoomend', handleMove);
    try {
      await update();
    } catch (error) {
      map.off('moveend zoomend', handleMove);
      map.removeLayer(overview.layer);
      for (const { layer } of active.values()) map.removeLayer(layer);
      cache.clear();
      if (regionalActive && regionalTask) {
        const entry = await regionalTask;
        map.removeLayer(entry.layer);
      }
      throw error;
    }

    return {
      mode: 'parties',
      deliveryMode: overview.deliveryMode,
      manifest: loaded.manifest,
      destroy() {
        destroyed = true;
        generation += 1;
        map.off('moveend zoomend', handleMove);
        map.removeLayer(overview.layer);
        for (const { layer } of active.values()) map.removeLayer(layer);
        active.clear();
        if (regionalActive && regionalTask) {
          void regionalTask.then((entry) => map.removeLayer(entry.layer));
        }
        regionalActive = false;
        regionalTask = undefined;
        cache.clear();
      },
    };
  } catch (manifestError) {
    const absoluteFallback = new URL(fallbackUrl, globalThis.location?.href || 'http://localhost/').href;
    const fallback = await archiveLayerFactory(
      leafletLayer, absoluteFallback,
      { minZoom: 5, maxZoom: 18, maxDataZoom: 14 },
    );
    fallback.layer.on('tileerror', onTileError).on('load', onTileRecovered).addTo(map);
    return {
      mode: 'regional-fallback',
      error: manifestError,
      destroy() { map.removeLayer(fallback.layer); },
    };
  }
}
