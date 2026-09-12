(() => {
  const DEFAULT_CENTER = [-34.831, -58.946];
  const BOUNDS = [[-41.2, -63.5], [-33.15, -56.55]];
  let map;
  let marker;
  let basemapPromise;
  const partyLayers = new Map();

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
    if (focus) map.setView([lat, lon], Math.max(map.getZoom(), 16));
    setStatus(`Punto seleccionado: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 'ready');
  }
  function writeLocation(lat, lon) {
    field('news-event-lat').value = lat.toFixed(7);
    field('news-event-lon').value = lon.toFixed(7);
    field('news-event-show-map').checked = true;
    drawMarker(lat, lon);
    field('news-event-lat').dispatchEvent(new Event('input', { bubbles: true }));
  }
  function intersects(left, right) {
    return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
  }
  function tileLayer(source, maxDataZoom, minZoom, maxZoom) {
    return window.protomapsL.leafletLayer({
      url: source,
      flavor: 'dark',
      lang: 'es',
      noWrap: true,
      minZoom,
      maxZoom,
      maxDataZoom,
      bounds: BOUNDS,
      attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
  }
  async function addParty(manifestUrl, party) {
    if (partyLayers.has(party.id)) return;
    const source = new window.pmtiles.PMTiles(new URL(party.file, manifestUrl).href);
    const header = await source.getHeader();
    if (!map || partyLayers.has(party.id)) return;
    const layer = tileLayer(source, Math.min(15, Number(header.maxZoom)), 10, 18).addTo(map);
    partyLayers.set(party.id, layer);
  }
  async function syncParties(manifestUrl, manifest) {
    if (!map) return;
    const bounds = map.getBounds();
    const viewport = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const wanted = map.getZoom() >= 10
      ? new Set(manifest.parties.filter((party) => intersects(party.bounds, viewport)).map((party) => party.id))
      : new Set();
    for (const [id, layer] of partyLayers) if (!wanted.has(id)) { layer.remove(); partyLayers.delete(id); }
    await Promise.all(manifest.parties.filter((party) => wanted.has(party.id)).map((party) => addParty(manifestUrl, party)));
  }
  async function addBasemap() {
    basemapPromise ||= (async () => {
      try {
        const manifestUrl = new URL('/maps/buenos-aires/manifest.json', location.href).href;
        const response = await fetch(manifestUrl, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
        const manifest = await response.json();
        if (manifest.schemaVersion !== 1 || !manifest.overview?.file || !Array.isArray(manifest.parties)) throw new Error('Manifest inválido');
        const overview = new window.pmtiles.PMTiles(new URL(manifest.overview.file, manifestUrl).href);
        const header = await overview.getHeader();
        tileLayer(overview, Math.min(9, Number(header.maxZoom)), 5, 9).addTo(map);
        map.on('moveend zoomend', () => syncParties(manifestUrl, manifest));
        await syncParties(manifestUrl, manifest);
        return;
      } catch (error) {
        console.warn('Se usa el PMTiles regional de respaldo en el editor.', error);
        const source = new window.pmtiles.PMTiles('/maps/villars-region.pmtiles');
        const header = await source.getHeader();
        tileLayer(source, Math.min(15, Number(header.maxZoom || 14)), 5, 18).addTo(map);
      }
    })();
    return basemapPromise;
  }
  async function initialize() {
    const container = field('news-event-map');
    if (!container || map) {
      map?.invalidateSize();
      return;
    }
    setStatus('Cargando la cartografía local…', 'loading');
    try {
      map = window.L.map(container, { center: DEFAULT_CENTER, zoom: 11, minZoom: 5, maxZoom: 18 });
      await addBasemap();
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
