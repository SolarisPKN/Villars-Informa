import { PMTiles } from 'pmtiles';

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
  const response = await fetchImpl(absolute, { headers: { Accept: 'application/json' }, cache: 'force-cache' });
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

async function archiveLayer(leafletLayer, fileUrl, options) {
  const archive = new PMTiles(fileUrl);
  const header = await archive.getHeader();
  return {
    header,
    layer: leafletLayer({
      ...DEFAULT_OPTIONS,
      ...options,
      url: archive,
      maxDataZoom: Math.min(Number(options.maxDataZoom), Number(header.maxZoom)),
    }),
  };
}

export async function addProvincialPmtiles({
  map,
  leafletLayer,
  manifestUrl = '/maps/buenos-aires/manifest.json',
  fallbackUrl = '/maps/villars-region.pmtiles',
  onTileError = () => {},
} = {}) {
  try {
    const loaded = await readProvinceMapManifest(manifestUrl);
    const common = { bounds: [[loaded.manifest.bounds[1], loaded.manifest.bounds[0]], [loaded.manifest.bounds[3], loaded.manifest.bounds[2]]] };
    const overview = await archiveLayer(leafletLayer, resolveFile(loaded.url, loaded.manifest.overview.file), {
      ...common,
      minZoom: 5,
      maxZoom: 9,
      maxDataZoom: 9,
    });
    overview.layer.on('tileerror', onTileError).addTo(map);
    const partyLayers = new Map();
    let generation = 0;

    async function update() {
      const currentGeneration = ++generation;
      const wanted = map.getZoom() >= 10
        ? new Set(partiesForViewport(loaded.manifest, viewportBounds(map)).map(({ id }) => id))
        : new Set();
      for (const [id, entry] of partyLayers) {
        if (!wanted.has(id)) {
          map.removeLayer(entry.layer);
          partyLayers.delete(id);
        }
      }
      const missing = loaded.manifest.parties.filter((party) => wanted.has(party.id) && !partyLayers.has(party.id));
      await Promise.all(missing.map(async (party) => {
        const entry = await archiveLayer(leafletLayer, resolveFile(loaded.url, party.file), {
          ...common,
          minZoom: 10,
          maxZoom: Number(loaded.manifest.maxVisualZoom || 18),
          maxDataZoom: Number(loaded.manifest.maxDataZoom || 15),
        });
        if (currentGeneration !== generation || !wanted.has(party.id)) return;
        entry.layer.on('tileerror', onTileError).addTo(map);
        partyLayers.set(party.id, entry);
      }));
    }

    map.on('moveend zoomend', update);
    await update();
    return {
      mode: 'parties',
      manifest: loaded.manifest,
      destroy() {
        generation += 1;
        map.off('moveend zoomend', update);
        map.removeLayer(overview.layer);
        for (const { layer } of partyLayers.values()) map.removeLayer(layer);
        partyLayers.clear();
      },
    };
  } catch (manifestError) {
    const absoluteFallback = new URL(fallbackUrl, globalThis.location?.href || 'http://localhost/').href;
    const fallback = await archiveLayer(leafletLayer, absoluteFallback, { minZoom: 5, maxZoom: 18, maxDataZoom: 14 });
    fallback.layer.on('tileerror', onTileError).addTo(map);
    return {
      mode: 'regional-fallback',
      error: manifestError,
      destroy() { map.removeLayer(fallback.layer); },
    };
  }
}
