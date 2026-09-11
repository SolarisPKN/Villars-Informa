import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PMTiles } from 'pmtiles';

const BOUNDS = [[-35.22, -59.32], [-34.48, -58.38]];
const maps = new Map();
let archivePromise;
let rendererPromise;

class MemoryPmtilesSource {
  constructor(key, data) { this.key = key; this.data = data; }
  getKey() { return this.key; }
  async getBytes(offset, length, signal) {
    if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
    return { data: this.data.slice(offset, offset + length) };
  }
}

function loadArchive() {
  const url = new URL('/maps/villars-region.pmtiles', window.location.origin).href;
  archivePromise ||= fetch(url, { cache: 'force-cache' }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new PMTiles(new MemoryPmtilesSource(url, await response.arrayBuffer()));
  });
  return archivePromise;
}

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
    const [archive, { leafletLayer }] = await Promise.all([loadArchive(), loadRenderer()]);
    if (!container.isConnected) return;
    const map = L.map(container, { center: [lat, lon], zoom: 13, minZoom: 8, maxZoom: 14 });
    maps.set(container, map);
    leafletLayer({
      url: archive,
      flavor: 'dark',
      lang: 'es',
      noWrap: true,
      minZoom: 8,
      maxZoom: 14,
      maxDataZoom: 14,
      bounds: BOUNDS,
      attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
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
  for (const map of maps.values()) map.remove();
  maps.clear();
});
