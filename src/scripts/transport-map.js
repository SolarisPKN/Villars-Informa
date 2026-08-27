import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PMTiles } from 'pmtiles';
import mapData from '../data/transport-map.json';

const liveSnapshotUrl = import.meta.env.PUBLIC_TRANSPORT_LIVE_URL || 'https://transport-data.solarispkn.com.ar/current.json';
const STALE_AFTER_MS = 120_000;
const UNAVAILABLE_AFTER_MS = 600_000;
let leafletRendererPromise;
let mapArchivePromise;
let map;
let liveLayer;
let pollTimer;
let pollingController;
let lastEtag;
let baseMapState = 'loading';
let liveStatus = { message: 'Conectando con el snapshot de posiciones…', state: 'loading' };

class MemoryPmtilesSource {
  constructor(key, data) {
    this.key = key;
    this.data = data;
  }

  getKey() {
    return this.key;
  }

  async getBytes(offset, length, signal) {
    if (signal?.aborted) throw new DOMException('La carga del mapa fue cancelada', 'AbortError');
    return { data: this.data.slice(offset, offset + length) };
  }
}

function loadLeafletRenderer() {
  if (!leafletRendererPromise) {
    window.L = L;
    leafletRendererPromise = import('protomaps-leaflet');
  }
  return leafletRendererPromise;
}

async function loadMapArchive(url) {
  if (!mapArchivePromise) {
    mapArchivePromise = fetch(url, { cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo descargar la cartografía: HTTP ' + response.status);
        return new PMTiles(new MemoryPmtilesSource(url, await response.arrayBuffer()));
      })
      .catch((error) => {
        mapArchivePromise = undefined;
        throw error;
      });
  }
  return mapArchivePromise;
}

function renderStatus() {
  const node = document.querySelector('[data-live-map-status]');
  if (!node) return;
  if (baseMapState === 'loading') {
    node.textContent = 'Cargando la cartografía local…';
    node.dataset.state = 'loading';
    return;
  }
  if (baseMapState === 'error') {
    node.textContent = 'No se pudo abrir la cartografía local. Los horarios siguen disponibles.';
    node.dataset.state = 'error';
    return;
  }
  node.textContent = liveStatus.message;
  node.dataset.state = liveStatus.state;
}

function setLiveStatus(message, state = 'static') {
  liveStatus = { message, state };
  renderStatus();
}

function liveFeatures(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.vehicles)) throw new Error('Formato de posiciones no reconocido');
  const now = Date.now();
  const snapshotAt = new Date(snapshot.generatedAt).getTime();
  const snapshotStale = !Number.isFinite(snapshotAt) || now - snapshotAt > STALE_AFTER_MS;
  return snapshot.vehicles
    .filter((vehicle) => {
      if (!Number.isFinite(vehicle.lon) || !Number.isFinite(vehicle.lat)) return false;
      const updatedAt = new Date(vehicle.updatedAt || snapshot.generatedAt).getTime();
      return Number.isFinite(updatedAt) && now - updatedAt <= UNAVAILABLE_AFTER_MS;
    })
    .map((vehicle) => ({
      type: 'Feature',
      properties: {
        id: vehicle.vehicleId,
        mode: vehicle.mode,
        label: vehicle.label || vehicle.routeId || (vehicle.mode === 'train' ? 'Tren' : 'Colectivo'),
        positionKind: vehicle.positionKind || 'unknown',
        stale: Boolean(vehicle.stale) || snapshotStale || now - new Date(vehicle.updatedAt || snapshot.generatedAt).getTime() > STALE_AFTER_MS,
        updatedAt: vehicle.updatedAt || snapshot.generatedAt,
      },
      geometry: { type: 'Point', coordinates: [vehicle.lon, vehicle.lat] },
    }));
}

function popupContent(properties, kind) {
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  const description = document.createElement('span');
  heading.textContent = properties.name || properties.label || 'Transporte';
  if (kind === 'live') {
    description.textContent = `${properties.positionKind === 'predicted' ? 'Posición estimada' : 'Posición informada'}${properties.stale ? ' · dato demorado' : ''}`;
  } else {
    description.textContent = properties.mode === 'train' ? 'Estación ferroviaria' : 'Parada del colectivo 322';
  }
  content.append(heading, document.createElement('br'), description);
  return content;
}

function markerStyle(feature, live = false) {
  const isTrain = feature?.properties?.mode === 'train';
  return {
    radius: live ? 8 : 5,
    color: live ? '#ffffff' : '#2c2119',
    weight: live ? 2 : 1.5,
    fillColor: isTrain ? (live ? '#f4a261' : '#e9c46a') : (live ? '#219ebc' : '#8ecae6'),
    fillOpacity: live && feature?.properties?.stale ? 0.4 : 0.95,
  };
}

function replaceLiveFeatures(features) {
  if (!liveLayer) return;
  liveLayer.clearLayers();
  liveLayer.addData({ type: 'FeatureCollection', features });
}

async function updateLiveLayer() {
  if (!liveSnapshotUrl || !liveLayer || document.hidden) return;
  pollingController?.abort();
  pollingController = new AbortController();
  try {
    const headers = lastEtag ? { 'If-None-Match': lastEtag } : undefined;
    const response = await fetch(liveSnapshotUrl, { headers, signal: pollingController.signal });
    if (response.status === 304) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lastEtag = response.headers.get('etag') || lastEtag;
    const snapshot = await response.json();
    const snapshotAt = new Date(snapshot.generatedAt).getTime();
    const snapshotAge = Date.now() - snapshotAt;
    const features = liveFeatures(snapshot);
    replaceLiveFeatures(features);
    const generatedAt = new Date(snapshot.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    if (!Number.isFinite(snapshotAt) || snapshotAge > UNAVAILABLE_AFTER_MS || snapshot.status === 'unavailable') {
      replaceLiveFeatures([]);
      setLiveStatus('Las posiciones en vivo están temporalmente no disponibles; el mapa y los horarios programados siguen activos.', 'error');
    } else if (snapshot.status === 'degraded' || snapshotAge > STALE_AFTER_MS || features.some(({ properties }) => properties.stale)) {
      setLiveStatus(features.length
        ? `${features.length} unidades con datos demorados · última consulta a las ${generatedAt}`
        : `Seguimiento parcial sin unidades informadas · consulta de las ${generatedAt}`,
      'stale');
    } else {
      setLiveStatus(features.length
        ? `${features.length} unidades informadas · snapshot de las ${generatedAt}`
        : `Sin unidades informadas por los proveedores · consulta de las ${generatedAt}`,
      features.length ? 'live' : 'empty');
    }
  } catch (error) {
    if (error.name !== 'AbortError') setLiveStatus('El seguimiento en vivo no respondió; el mapa y los horarios programados siguen disponibles.', 'error');
  }
}

function addTransportLayers() {
  L.geoJSON(mapData.routes, {
    style: (feature) => ({
      color: feature?.properties?.mode === 'train' ? '#e9c46a' : '#6fb7ff',
      weight: feature?.properties?.mode === 'train' ? 4 : 3,
      opacity: 0.95,
    }),
  }).addTo(map);

  L.geoJSON(mapData.stops, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, markerStyle(feature)),
    onEachFeature: (feature, layer) => layer.bindPopup(() => popupContent(feature.properties || {}, 'stop')),
  }).addTo(map);

  liveLayer = L.geoJSON({ type: 'FeatureCollection', features: [] }, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, markerStyle(feature, true)),
    onEachFeature: (feature, layer) => layer.bindPopup(() => popupContent(feature.properties || {}, 'live')),
  }).addTo(map);
}

async function initTransportMap() {
  const container = document.querySelector('[data-transport-map]');
  if (!(container instanceof HTMLElement)) return;
  map?.remove();
  liveLayer = undefined;
  baseMapState = 'loading';
  renderStatus();

  const mapArchiveUrl = new URL('/maps/villars-region.pmtiles', window.location.origin).href;
  let archive;
  let leafletLayer;
  try {
    [archive, { leafletLayer }] = await Promise.all([loadMapArchive(mapArchiveUrl), loadLeafletRenderer()]);
  } catch (error) {
    console.error('No se pudo preparar la cartografía local.', error);
    baseMapState = 'error';
    renderStatus();
    return;
  }
  if (!container.isConnected) return;

  map = L.map(container, {
    center: [mapData.center[1], mapData.center[0]],
    zoom: 10,
    minZoom: 8,
    maxZoom: 14,
    zoomControl: true,
    attributionControl: true,
  });

  const baseLayer = leafletLayer({
    url: archive,
    flavor: 'dark',
    lang: 'es',
    noWrap: true,
    minZoom: 8,
    maxZoom: 14,
    maxDataZoom: 14,
    bounds: [[-34.98, -59.18], [-34.48, -58.60]],
    attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  baseLayer.once('load', () => {
    baseMapState = 'ready';
    renderStatus();
  });
  baseLayer.on('tileerror', (event) => {
    console.error('No se pudo cargar una tesela de la cartografía local.', event.error);
    if (baseMapState !== 'ready') {
      baseMapState = 'error';
      renderStatus();
    }
  });
  baseLayer.addTo(map);
  addTransportLayers();

  if (liveSnapshotUrl) {
    updateLiveLayer();
    pollTimer = window.setInterval(updateLiveLayer, 60_000);
  } else {
    setLiveStatus('Mapa autocontenido activo. La capa de posiciones queda lista para conectar al Worker de Cloudflare.', 'static');
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLiveLayer(); });
document.addEventListener('astro:page-load', initTransportMap);
document.addEventListener('astro:before-swap', () => {
  window.clearInterval(pollTimer);
  pollingController?.abort();
  map?.remove();
  map = undefined;
  liveLayer = undefined;
});
