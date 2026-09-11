(() => {
  const DEFAULT_CENTER = [-34.831, -58.946];
  const BOUNDS = [[-35.22, -59.32], [-34.48, -58.38]];
  let map;
  let marker;
  let archivePromise;

  class MemoryPmtilesSource {
    constructor(key, data) { this.key = key; this.data = data; }
    getKey() { return this.key; }
    async getBytes(offset, length, signal) {
      if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError');
      return { data: this.data.slice(offset, offset + length) };
    }
  }

  function field(id) { return document.getElementById(id); }
  function coordinate(id) {
    const value = Number(String(field(id)?.value || '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }
  function setStatus(message, state = '') {
    const status = field('news-event-map-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }
  function drawMarker(lat, lon, focus = false) {
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    marker ||= window.L.circleMarker([lat, lon], {
      radius: 9, color: '#fff', weight: 2, fillColor: '#e9c46a', fillOpacity: 1,
    }).addTo(map);
    marker.setLatLng([lat, lon]);
    if (focus) map.setView([lat, lon], Math.max(map.getZoom(), 13));
    setStatus(`Punto seleccionado: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 'ready');
  }
  function writeLocation(lat, lon) {
    field('news-event-lat').value = lat.toFixed(7);
    field('news-event-lon').value = lon.toFixed(7);
    field('news-event-show-map').checked = true;
    drawMarker(lat, lon);
    field('news-event-lat').dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function archive() {
    archivePromise ||= fetch('/maps/villars-region.pmtiles')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return new window.pmtiles.PMTiles(new MemoryPmtilesSource(response.url, await response.arrayBuffer()));
      });
    return archivePromise;
  }
  async function initialize() {
    const container = field('news-event-map');
    if (!container || map) {
      map?.invalidateSize();
      return;
    }
    setStatus('Cargando la cartografía local…', 'loading');
    try {
      const mapArchive = await archive();
      map = window.L.map(container, { center: DEFAULT_CENTER, zoom: 11, minZoom: 8, maxZoom: 14 });
      window.protomapsL.leafletLayer({
        url: mapArchive,
        flavor: 'dark',
        lang: 'es',
        noWrap: true,
        minZoom: 8,
        maxZoom: 14,
        maxDataZoom: 14,
        bounds: BOUNDS,
        attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on('click', ({ latlng }) => writeLocation(latlng.lat, latlng.lng));
      const lat = coordinate('news-event-lat');
      const lon = coordinate('news-event-lon');
      if (lat !== null && lon !== null) drawMarker(lat, lon, true);
      else setStatus('Hacé clic para marcar la ubicación.', 'ready');
      setTimeout(() => map.invalidateSize(), 0);
    } catch (error) {
      console.error('No se pudo abrir el mapa local del editor.', error);
      setStatus('No se pudo abrir el mapa local. Todavía podés escribir latitud y longitud.', 'error');
    }
  }
  function syncInputs() {
    const lat = coordinate('news-event-lat');
    const lon = coordinate('news-event-lon');
    if (lat !== null && lon !== null) drawMarker(lat, lon, true);
  }
  function clearLocation() {
    field('news-event-lat').value = '';
    field('news-event-lon').value = '';
    field('news-event-show-map').checked = false;
    if (marker) { marker.remove(); marker = undefined; }
    setStatus('Ubicación quitada. Hacé clic en el mapa para elegir otra.', 'ready');
  }

  window.eventMapPicker = { initialize, syncInputs, clearLocation };
  document.addEventListener('event-editor-toggle', (event) => {
    if (event.detail?.enabled) initialize();
  });
  document.addEventListener('DOMContentLoaded', () => {
    field('news-event-lat')?.addEventListener('change', syncInputs);
    field('news-event-lon')?.addEventListener('change', syncInputs);
    field('news-event-clear-location')?.addEventListener('click', clearLocation);
  });
})();
