import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addProvincialPmtiles } from '../utils/provincial-pmtiles.js';

const maps = new Map();
const basemaps = new Map();
let rendererPromise;

function loadRenderer() {
  window.L = L;
  rendererPromise ||= import('protomaps-leaflet');
  return rendererPromise;
}

async function initialize(container) {
  if (maps.has(container)) return;
  const lat = Number(container.dataset.lat);
  const lon = Number(container.dataset.lon);
  const place = container.dataset.place || 'Ubicación del evento';
  const status = container.parentElement?.querySelector('[data-event-map-status]');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (status) { status.textContent = 'La ubicación publicada no es válida.'; status.dataset.state = 'error'; }
    return;
  }
  try {
    const { leafletLayer } = await loadRenderer();
    if (!container.isConnected) return;
    const map = L.map(container, { center: [lat, lon], zoom: 16, minZoom: 5, maxZoom: 18 });
    maps.set(container, map);
    const baseMap = await addProvincialPmtiles({
      map,
      leafletLayer,
      manifestUrl: import.meta.env.PUBLIC_PM_TILES_MANIFEST_URL || '/maps/buenos-aires/manifest.json',
      fallbackUrl: '/maps/villars-region.pmtiles',
      onTileError: (event) => console.error('No se pudo cargar una tesela del mapa del evento.', event.error),
    });
    basemaps.set(container, baseMap);
    const marker = L.circleMarker([lat, lon], {
      radius: 10, color: '#fff', weight: 2, fillColor: '#e9c46a', fillOpacity: 1,
    }).addTo(map);
    const popup = document.createElement('strong');
    popup.textContent = place;
    marker.bindPopup(popup).openPopup();
    if (status) { status.textContent = 'Mapa local interactivo · acercá, alejá o movelo libremente.'; status.dataset.state = 'ready'; }
  } catch (error) {
    console.error('No se pudo cargar el mapa del evento.', error);
    if (status) { status.textContent = 'El mapa local no respondió. Usá el botón para abrir la ubicación.'; status.dataset.state = 'error'; }
  }
}

function initEventMaps() {
  document.querySelectorAll('[data-event-map]').forEach((container) => {
    if (container instanceof HTMLElement) initialize(container);
  });
}

document.addEventListener('astro:page-load', initEventMaps);
document.addEventListener('astro:before-swap', () => {
  for (const [container, map] of maps) {
    basemaps.get(container)?.destroy();
    map.remove();
  }
  maps.clear();
  basemaps.clear();
});
