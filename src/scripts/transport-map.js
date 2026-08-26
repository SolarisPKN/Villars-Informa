import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DARK, layers } from '@protomaps/basemaps';
import { PMTiles, Protocol } from 'pmtiles';
import mapData from '../data/transport-map.json';

const liveSnapshotUrl = import.meta.env.PUBLIC_TRANSPORT_LIVE_URL || '';
const protocol = new Protocol();
let protocolRegistered = false;
let map;
let pollTimer;
let pollingController;
let lastEtag;

function setStatus(message, state = 'static') {
  const node = document.querySelector('[data-live-map-status]');
  if (node) {
    node.textContent = message;
    node.dataset.state = state;
  }
}

function liveFeatures(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.vehicles)) throw new Error('Formato de posiciones no reconocido');
  return snapshot.vehicles
    .filter((vehicle) => Number.isFinite(vehicle.lon) && Number.isFinite(vehicle.lat))
    .map((vehicle) => ({
      type: 'Feature',
      properties: {
        id: vehicle.vehicleId,
        mode: vehicle.mode,
        label: vehicle.label || vehicle.routeId || (vehicle.mode === 'train' ? 'Tren' : 'Colectivo'),
        positionKind: vehicle.positionKind || 'unknown',
        stale: Boolean(vehicle.stale),
        updatedAt: vehicle.updatedAt || snapshot.generatedAt,
      },
      geometry: { type: 'Point', coordinates: [vehicle.lon, vehicle.lat] },
    }));
}

async function updateLiveLayer() {
  if (!liveSnapshotUrl || !map?.getSource('live-vehicles') || document.hidden) return;
  pollingController?.abort();
  pollingController = new AbortController();
  try {
    const headers = lastEtag ? { 'If-None-Match': lastEtag } : undefined;
    const response = await fetch(liveSnapshotUrl, { headers, signal: pollingController.signal });
    if (response.status === 304) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lastEtag = response.headers.get('etag') || lastEtag;
    const snapshot = await response.json();
    const features = liveFeatures(snapshot);
    map.getSource('live-vehicles').setData({ type: 'FeatureCollection', features });
    const generatedAt = new Date(snapshot.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setStatus(features.length
      ? `${features.length} unidades informadas · snapshot de las ${generatedAt}`
      : `Sin unidades informadas por los proveedores · consulta de las ${generatedAt}`,
    features.length ? 'live' : 'empty');
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('El seguimiento en vivo no respondió; el mapa y los horarios programados siguen disponibles.', 'error');
  }
}

function addTransportLayers() {
  map.addSource('transport-routes', { type: 'geojson', data: mapData.routes });
  map.addLayer({
    id: 'transport-routes-shadow',
    type: 'line',
    source: 'transport-routes',
    paint: { 'line-color': '#160f0b', 'line-width': 8, 'line-opacity': 0.65 },
  });
  map.addLayer({
    id: 'transport-routes',
    type: 'line',
    source: 'transport-routes',
    paint: {
      'line-color': ['match', ['get', 'mode'], 'train', '#e9c46a', '#6fb7ff'],
      'line-width': ['match', ['get', 'mode'], 'train', 4, 3],
      'line-opacity': 0.9,
    },
  });
  map.addSource('transport-stops', { type: 'geojson', data: mapData.stops });
  map.addLayer({
    id: 'transport-stops',
    type: 'circle',
    source: 'transport-stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 5],
      'circle-color': ['match', ['get', 'mode'], 'train', '#e9c46a', '#8ecae6'],
      'circle-stroke-color': '#2c2119',
      'circle-stroke-width': 1.5,
    },
  });
  map.addSource('live-vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'live-vehicles',
    type: 'circle',
    source: 'live-vehicles',
    paint: {
      'circle-radius': 8,
      'circle-color': ['match', ['get', 'mode'], 'train', '#f4a261', '#219ebc'],
      'circle-opacity': ['case', ['get', 'stale'], 0.4, 1],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  const popup = (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const title = feature.properties.name || feature.properties.label || 'Transporte';
    const detail = feature.layer.id === 'live-vehicles'
      ? `${feature.properties.positionKind === 'predicted' ? 'Posición estimada' : 'Posición informada'}${feature.properties.stale ? ' · dato demorado' : ''}`
      : feature.properties.mode === 'train' ? 'Estación ferroviaria' : 'Parada del colectivo 322';
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    const description = document.createElement('span');
    heading.textContent = title;
    description.textContent = detail;
    content.append(heading, document.createElement('br'), description);
    new maplibregl.Popup({ offset: 12 }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
  };
  for (const layerId of ['transport-stops', 'live-vehicles']) {
    map.on('click', layerId, popup);
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  }
}

function initTransportMap() {
  const container = document.querySelector('[data-transport-map]');
  if (!(container instanceof HTMLElement)) return;
  map?.remove();
  if (!protocolRegistered) {
    maplibregl.addProtocol('pmtiles', protocol.tilev4);
    protocolRegistered = true;
  }
  const mapArchiveUrl = new URL('/maps/villars-region.pmtiles', window.location.origin).href;
  protocol.add(new PMTiles(mapArchiveUrl));
  map = new maplibregl.Map({
    container,
    center: mapData.center,
    zoom: 9.5,
    minZoom: 8,
    maxZoom: 14,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        protomaps: {
          type: 'vector',
          url: `pmtiles://${mapArchiveUrl}`,
          attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: layers('protomaps', DARK),
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.on('error', (event) => {
    console.error('No se pudo cargar una capa del mapa de transporte.', event.error);
    setStatus('No se pudo abrir la cartografía local. Los horarios siguen disponibles.', 'error');
  });
  let layersAdded = false;
  const mapReady = () => {
    if (layersAdded) return;
    layersAdded = true;
    addTransportLayers();
    if (liveSnapshotUrl) {
      setStatus('Conectando con el snapshot de posiciones…', 'loading');
      updateLiveLayer();
      pollTimer = window.setInterval(updateLiveLayer, 60_000);
    } else {
      setStatus('Mapa autocontenido activo. La capa de posiciones queda lista para conectar al Worker de Cloudflare.', 'static');
    }
  };
  map.on('style.load', mapReady);
  if (map.isStyleLoaded()) mapReady();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLiveLayer(); });
document.addEventListener('astro:page-load', initTransportMap);
document.addEventListener('astro:before-swap', () => {
  window.clearInterval(pollTimer);
  pollingController?.abort();
  map?.remove();
  map = undefined;
});
