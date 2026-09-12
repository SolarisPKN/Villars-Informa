import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import baseMapData from '../data/transport-map.json';
import route136Config from '../data/transport-136-villars.json';
import transportData from '../data/transport-schedules.json';
import { route136MapFeatures } from '../utils/transport-route-model.js';
import { featureIsVisible, filtersForSelection, routeFamily, vehicleDirection, vehicleDirectionVariant } from '../utils/transport-map-live.js';
import { buildPredictedLiveFeatures, ObservationHistory } from '../utils/transport-live-predictor.js';
import { addProvincialPmtiles } from '../utils/provincial-pmtiles.js';

const route136Features = route136MapFeatures(route136Config);
const mapData = {
  ...baseMapData,
  routes: {
    ...baseMapData.routes,
    features: [...baseMapData.routes.features, route136Features.route],
  },
  stops: {
    ...baseMapData.stops,
    features: [...baseMapData.stops.features, ...route136Features.stops],
  },
};

const scheduleRoutes = new Map(transportData.routes.map((route) => [route.id, route]));
const liveSnapshotUrl = import.meta.env.PUBLIC_TRANSPORT_LIVE_URL || 'https://transport-data.solarispkn.com.ar/current.json';
const mapManifestUrl = import.meta.env.PUBLIC_PM_TILES_MANIFEST_URL || '/maps/buenos-aires/manifest.json';
const STALE_AFTER_MS = 6 * 60_000;
const UNAVAILABLE_AFTER_MS = 15 * 60_000;
let leafletRendererPromise;
let map;
let baseMapController;
let liveLayer;
let routeLayer;
let stopLayer;
let filterController;
let currentLiveFeatures = [];
let pollTimer;
let motionTimer;
let pollingController;
let lastEtag;
let baseMapState = 'loading';
let liveStatus = { message: 'Conectando con el snapshot de posiciones…', state: 'loading' };
let hasAutoFocusedLive = false;
let activeSelection;
let latestSnapshot;
const observationHistory = new ObservationHistory(4);

function loadLeafletRenderer() {
  if (!leafletRendererPromise) {
    window.L = L;
    leafletRendererPromise = import('protomaps-leaflet');
  }
  return leafletRendererPromise;
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

function routeSelectionFromControls() {
  const routeSelect = document.querySelector('[data-route-select]');
  if (!(routeSelect instanceof HTMLSelectElement)) return null;
  const route = scheduleRoutes.get(routeSelect.value);
  if (!route) return null;
  return {
    mode: route.type,
    routeId: route.id,
    lineKey: route.lineKey,
    label: route.lineLabel || route.branch || route.name,
    directions: [...new Set(route.schedules.map(({ direction }) => direction).filter(Boolean))],
  };
}

function liveFeatures(snapshot) {
  return buildPredictedLiveFeatures({ schedules: transportData, mapData, snapshot, date: new Date(), history: observationHistory });
}

function selectedFilters(selector, dataKey) {
  return new Set([...document.querySelectorAll(selector)]
    .filter((input) => input instanceof HTMLInputElement && input.checked && !input.disabled)
    .map((input) => input.dataset[dataKey]));
}

function currentFilterState() {
  activeSelection ||= routeSelectionFromControls();
  return filtersForSelection(activeSelection, selectedFilters('[data-map-layer]', 'mapLayer'));
}

function updateMapSelectionSummary() {
  const selection = activeSelection || routeSelectionFromControls();
  const mode = document.querySelector('[data-map-selection-mode]');
  const route = document.querySelector('[data-map-selection-route]');
  const blue = document.querySelector('[data-map-direction-blue]');
  const orange = document.querySelector('[data-map-direction-orange]');
  if (mode) mode.textContent = selection?.mode === 'bus' ? 'Colectivos' : 'Trenes';
  if (route) route.textContent = selection?.label || 'Recorrido no seleccionado';
  if (blue) blue.textContent = selection?.directions?.[0] ? `Azul · hacia ${selection.directions[0]}` : 'Azul · sentido A';
  if (orange) orange.textContent = selection?.directions?.[1] ? `Naranja · hacia ${selection.directions[1]}` : 'Naranja · sentido opuesto';
}

function focusSelectedRoute() {
  if (!map) return;
  const filters = currentFilterState();
  const features = [
    ...mapData.routes.features.filter((feature) => featureIsVisible(feature, filters)),
    ...mapData.stops.features.filter((feature) => featureIsVisible(feature, filters)),
  ];
  if (features.length === 0) return;
  const bounds = L.geoJSON({ type: 'FeatureCollection', features }).getBounds();
  if (!bounds.isValid()) return;
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12, animate: true });
  hasAutoFocusedLive = true;
}

function applyRouteSelection(event) {
  const detail = event?.detail;
  if (!detail?.mode || !detail?.lineKey) return;
  const changed = detail.mode !== activeSelection?.mode
    || detail.lineKey !== activeSelection?.lineKey
    || detail.routeId !== activeSelection?.routeId;
  activeSelection = {
    mode: detail.mode,
    routeId: detail.routeId || null,
    lineKey: detail.lineKey,
    label: detail.label || detail.lineKey,
    directions: Array.isArray(detail.directions) ? detail.directions.filter(Boolean) : [],
  };
  updateMapSelectionSummary();
  renderFilteredLayers();
  if (changed) focusSelectedRoute();
}

function renderFilteredLayers() {
  const filters = currentFilterState();
  if (routeLayer) {
    routeLayer.clearLayers();
    if (filters.layers.has('routes')) {
      routeLayer.addData({
        type: 'FeatureCollection',
        features: mapData.routes.features.filter((feature) => featureIsVisible(feature, filters)),
      });
    }
  }
  if (stopLayer) {
    stopLayer.clearLayers();
    if (filters.layers.has('stops')) {
      stopLayer.addData({
        type: 'FeatureCollection',
        features: mapData.stops.features.filter((feature) => featureIsVisible(feature, filters)),
      });
    }
  }
  if (liveLayer) {
    liveLayer.clearLayers();
    if (filters.layers.has('positions')) {
      liveLayer.addData({
        type: 'FeatureCollection',
        features: currentLiveFeatures.filter((feature) => featureIsVisible(feature, filters)),
      });
    }
  }
  updateLiveFocusControl();
}

function visibleLiveFeatures() {
  const filters = currentFilterState();
  if (!filters.layers.has('positions')) return [];
  return currentLiveFeatures.filter((feature) => featureIsVisible(feature, filters));
}

function updateLiveFocusControl() {
  const button = document.querySelector('[data-map-focus-live]');
  const count = document.querySelector('[data-map-live-count]');
  const visible = visibleLiveFeatures();
  if (button instanceof HTMLButtonElement) button.disabled = visible.length === 0;
  if (count) count.textContent = String(visible.length);
}

function focusLivePositions() {
  if (!map) return;
  const visible = visibleLiveFeatures();
  if (visible.length === 0) return;
  const points = visible.map(({ geometry }) => L.latLng(geometry.coordinates[1], geometry.coordinates[0]));
  if (points.length === 1) {
    map.setView(points[0], Math.max(map.getZoom(), 11), { animate: true });
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 12, animate: true });
  }
}

function bindMapFilters() {
  filterController?.abort();
  filterController = new AbortController();
  document.querySelectorAll('[data-map-layer]').forEach((input) => {
    if (input instanceof HTMLInputElement && !input.disabled) {
      input.addEventListener('change', renderFilteredLayers, { signal: filterController.signal });
    }
  });
  const focusButton = document.querySelector('[data-map-focus-live]');
  if (focusButton instanceof HTMLButtonElement) {
    focusButton.addEventListener('click', focusLivePositions, { signal: filterController.signal });
  }
}


function popupContent(properties, kind) {
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  const description = document.createElement('span');
  heading.textContent = properties.name || properties.label || 'Transporte';
  if (kind === 'live') {
    const segment = properties.fromStop && properties.toStop
      ? ` entre ${properties.fromStop} y ${properties.toStop}`
      : '';
    const source = properties.positionKind === 'schedule-estimated'
      ? `Estimación por cronograma${segment}`
      : properties.positionKind === 'gps-corrected' ? 'Estimación corregida con GPS' : 'GPS informado';
    const direction = vehicleDirection({ properties });
    const delay = Number(properties.delaySeconds);
    description.textContent = `${source}${direction ? ` · Sentido: hacia ${direction}` : ' · Sentido no informado'}${Number.isFinite(delay) && delay >= 60 ? ` · demora +${Math.round(delay / 60)} min` : ''}${properties.cancelled ? ' · CANCELADO' : ''}${properties.stale ? ' · dato live demorado' : ''}`;
  } else {
    const family = routeFamily({ properties });
    description.textContent = properties.mode === 'train' ? 'Estación ferroviaria' : `Parada del colectivo ${family.startsWith('136') ? '136' : '322'}`;
  }
  content.append(heading, document.createElement('br'), description);
  return content;
}

function markerStyle(feature, live = false) {
  const isTrain = feature?.properties?.mode === 'train';
  const isPredicted = live && feature?.properties?.positionKind !== 'gps';
  return {
    radius: live ? 8 : 5,
    color: live ? '#ffffff' : '#2c2119',
    weight: live ? 2 : 1.5,
    fillColor: isPredicted ? '#ffb703' : (isTrain ? (live ? '#f4a261' : '#e9c46a') : (live ? '#219ebc' : '#8ecae6')),
    dashArray: isPredicted ? '3 3' : null,
    fillOpacity: live && feature?.properties?.stale ? 0.4 : 0.95,
  };
}

function vehicleMarkerIcon(feature) {
  const isTrain = feature?.properties?.mode === 'train';
  const isPredicted = feature?.properties?.positionKind !== 'gps';
  const directionVariant = vehicleDirectionVariant(feature);
  const color = directionVariant === 'blue' ? '#2376d8' : directionVariant === 'orange' ? '#ed7a32' : '#78838f';
  const glyph = isTrain
    ? '<path d="M7 3h10c2.2 0 4 1.8 4 4v8c0 2-1.5 3.7-3.4 4l2.1 2.1-1.4 1.4-2.2-2.2H7.9l-2.2 2.2-1.4-1.4L6.4 19A4 4 0 0 1 3 15V7c0-2.2 1.8-4 4-4Zm0 3a1 1 0 0 0-1 1v5h12V7a1 1 0 0 0-1-1H7Zm1 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>'
    : '<path d="M6 3h12c2.2 0 4 1.8 4 4v10c0 1.5-1 2.7-2.4 3L18 22h-2l-1-2H9l-1 2H6l-1.6-2A3.1 3.1 0 0 1 2 17V7c0-2.2 1.8-4 4-4Zm0 3a1 1 0 0 0-1 1v5h14V7a1 1 0 0 0-1-1H6Zm1 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>';
  const stateClass = [
    `direction-${directionVariant}`,
    isPredicted ? 'is-estimated' : 'is-observed',
    feature?.properties?.stale ? 'is-stale' : '',
  ].filter(Boolean).join(' ');
  return L.divIcon({
    className: 'transport-vehicle-icon',
    html: `<span class="transport-vehicle-pin ${stateClass}" style="--vehicle-color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glyph}</svg></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function replaceLiveFeatures(features) {
  currentLiveFeatures = features;
  renderFilteredLayers();
  if (!hasAutoFocusedLive && map && features.length > 0) {
    const bounds = map.getBounds();
    const anyVisibleInViewport = visibleLiveFeatures().some(({ geometry }) => (
      bounds.contains(L.latLng(geometry.coordinates[1], geometry.coordinates[0]))
    ));
    if (!anyVisibleInViewport) focusLivePositions();
    hasAutoFocusedLive = true;
  }
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
    if (![1, 2].includes(snapshot?.schemaVersion)) throw new Error('Schema live no reconocido');
    latestSnapshot = snapshot;
    document.dispatchEvent(new CustomEvent('transport-live-update', { detail: snapshot }));
    const snapshotDateValue = snapshot.updatedAt || snapshot.generatedAt;
    const snapshotAt = new Date(snapshotDateValue).getTime();
    const snapshotAge = Date.now() - snapshotAt;
    const features = liveFeatures(snapshot);
    const observedCount = features.filter(({ properties }) => properties.positionKind === 'gps').length;
    const correctedCount = features.filter(({ properties }) => properties.positionKind === 'gps-corrected').length;
    const predictedCount = features.filter(({ properties }) => properties.positionKind === 'schedule-estimated').length;
    const countLabel = [
      observedCount ? `${observedCount} con GPS` : '',
      correctedCount ? `${correctedCount} corregidas con GPS` : '',
      predictedCount ? `${predictedCount} por cronograma` : '',
    ].filter(Boolean).join(' · ');
    replaceLiveFeatures(features);
    const generatedDate = new Date(snapshotDateValue);
    const generatedAt = generatedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const generatedLabel = Number.isFinite(snapshotAt)
      ? generatedDate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'desconocido';
    const groups = snapshot.schemaVersion === 2 ? [snapshot.trains, snapshot.buses] : [{ status: snapshot.status }];
    const unavailable = groups.every((group) => group?.status === 'unavailable');
    const degraded = groups.some((group) => group?.status === 'degraded' || group?.status === 'unavailable');
    if (!Number.isFinite(snapshotAt) || snapshotAge > UNAVAILABLE_AFTER_MS || unavailable) {
      setLiveStatus(`Realtime interrumpido · último dato ${generatedLabel}. ${predictedCount} servicios siguen estimados por cronograma.`, 'error');
    } else if (degraded || snapshotAge > STALE_AFTER_MS || features.some(({ properties }) => properties.stale)) {
      setLiveStatus(features.length
        ? `${countLabel || `${features.length} posiciones`} con datos demorados · última consulta a las ${generatedAt}`
        : `Seguimiento parcial sin unidades informadas · consulta de las ${generatedAt}`,
      'stale');
    } else {
      setLiveStatus(features.length
        ? `${countLabel || `${features.length} posiciones`} · snapshot de las ${generatedAt}`
        : `Sin unidades informadas por los proveedores · consulta de las ${generatedAt}`,
      features.length ? 'live' : 'empty');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      replaceLiveFeatures(liveFeatures(latestSnapshot));
      setLiveStatus('El realtime no respondió; las unidades previstas siguen moviéndose por cronograma.', 'error');
    }
  }
}

function addTransportLayers() {
  routeLayer = L.geoJSON({ type: 'FeatureCollection', features: [] }, {
    style: (feature) => ({
      color: feature?.properties?.mode === 'train'
        ? '#e9c46a'
        : routeFamily(feature).startsWith('136') ? '#f28c45' : '#6fb7ff',
      weight: feature?.properties?.mode === 'train' ? 4 : 3,
      opacity: 0.95,
    }),
  }).addTo(map);

  stopLayer = L.geoJSON({ type: 'FeatureCollection', features: [] }, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, markerStyle(feature)),
    onEachFeature: (feature, layer) => layer.bindPopup(() => popupContent(feature.properties || {}, 'stop')),
  }).addTo(map);

  liveLayer = L.geoJSON({ type: 'FeatureCollection', features: [] }, {
    pointToLayer: (feature, latlng) => L.marker(latlng, {
      icon: vehicleMarkerIcon(feature),
      keyboard: true,
      title: feature?.properties?.label || 'Transporte',
    }),
    onEachFeature: (feature, layer) => layer.bindPopup(() => popupContent(feature.properties || {}, 'live')),
  }).addTo(map);
  renderFilteredLayers();
  updateMapSelectionSummary();
  focusSelectedRoute();
}

async function initTransportMap() {
  const container = document.querySelector('[data-transport-map]');
  if (!(container instanceof HTMLElement)) return;
  baseMapController?.destroy();
  baseMapController = undefined;
  map?.remove();
  liveLayer = undefined;
  routeLayer = undefined;
  stopLayer = undefined;
  currentLiveFeatures = [];
  hasAutoFocusedLive = false;
  activeSelection ||= routeSelectionFromControls();
  baseMapState = 'loading';
  renderStatus();

  let leafletLayer;
  try {
    ({ leafletLayer } = await loadLeafletRenderer());
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
    minZoom: 5,
    maxZoom: 18,
    zoomControl: true,
    attributionControl: true,
  });

  try {
    baseMapController = await addProvincialPmtiles({
      map,
      leafletLayer,
      manifestUrl: mapManifestUrl,
      fallbackUrl: '/maps/villars-region.pmtiles',
      onTileError: (event) => console.error('No se pudo cargar una tesela de la cartografía local.', event.error),
    });
    baseMapState = 'ready';
    if (baseMapController.mode === 'regional-fallback') console.warn('Se usa el mapa regional de emergencia.', baseMapController.error);
    renderStatus();
  } catch (error) {
    console.error('No se pudo preparar ninguna cartografía local.', error);
    baseMapState = 'error';
    renderStatus();
  }
  addTransportLayers();
  bindMapFilters();
  replaceLiveFeatures(liveFeatures(latestSnapshot));
  motionTimer = window.setInterval(() => replaceLiveFeatures(liveFeatures(latestSnapshot)), 1_000);

  if (liveSnapshotUrl) {
    updateLiveLayer();
    pollTimer = window.setInterval(updateLiveLayer, 60_000);
  } else {
    setLiveStatus('Mapa autocontenido activo. La capa de posiciones queda lista para conectar al Worker de Cloudflare.', 'static');
  }
}

document.addEventListener('transport-route-selection', applyRouteSelection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLiveLayer(); });
document.addEventListener('astro:page-load', initTransportMap);
document.addEventListener('astro:before-swap', () => {
  window.clearInterval(pollTimer);
  window.clearInterval(motionTimer);
  pollingController?.abort();
  baseMapController?.destroy();
  baseMapController = undefined;
  map?.remove();
  map = undefined;
  liveLayer = undefined;
  routeLayer = undefined;
  stopLayer = undefined;
  currentLiveFeatures = [];
  hasAutoFocusedLive = false;
  activeSelection = undefined;
  filterController?.abort();
});
