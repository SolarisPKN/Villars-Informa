import transportData from '../data/transport-schedules.json';

let controller;
const villarsRoutes = transportData.routes.filter((route) => route.schedules.some((schedule) => schedule.stations.some((station) => station.normalizedName === 'villars')));
const serviceDays = ['sunday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'saturday'];
const weekdayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const formatMinutes = (minutes) => { const clock = minutes % 1440; return { value: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`, nextDay: minutes >= 1440 }; };
function argentinaNow() {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: transportData.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const indices = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: indices[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function nextService(route, direction) {
  const now = argentinaNow(); let closest;
  for (let offset = -1; offset <= 7; offset += 1) {
    const weekday = (now.weekday + offset + 7) % 7; const dayKey = serviceDays[weekday];
    for (const schedule of route.schedules.filter((item) => item.day.key === dayKey && item.direction === direction)) {
      const station = schedule.stations.find((item) => item.normalizedName === 'villars');
      for (const minutes of station?.times || []) { const difference = offset * 1440 + minutes - now.minutes; if (difference < 0 || (closest && difference >= closest.difference)) continue; closest = { difference, minutes, weekday }; }
    }
  }
  return closest;
}
function initTransport() {
  controller?.abort(); controller = new AbortController();
  const root = document.querySelector('[data-transport-app]'); const routeSelect = root?.querySelector('[data-route-select]'); const daySelect = root?.querySelector('[data-day-select]'); const directionSelect = root?.querySelector('[data-direction-select]');
  if (!(root instanceof HTMLElement) || !(routeSelect instanceof HTMLSelectElement) || !(daySelect instanceof HTMLSelectElement) || !(directionSelect instanceof HTMLSelectElement)) return;
  const setText = (selector, value) => { const node = root.querySelector(selector); if (node) node.textContent = value; };
  const render = () => {
    const route = villarsRoutes.find((item) => item.id === routeSelect.value) || villarsRoutes[0]; const currentDirection = directionSelect.value; const directions = [...new Set(route.schedules.map((schedule) => schedule.direction))];
    if (directionSelect.dataset.route !== route.id) { directionSelect.replaceChildren(...directions.map((direction) => { const option = document.createElement('option'); option.value = direction; option.textContent = `Hacia ${direction}`; return option; })); directionSelect.dataset.route = route.id; if (directions.includes(currentDirection)) directionSelect.value = currentDirection; }
    const direction = directionSelect.value; const schedule = route.schedules.find((item) => item.day.key === daySelect.value && item.direction === direction); const station = schedule?.stations.find((item) => item.normalizedName === 'villars');
    const timeGrid = root.querySelector('[data-time-grid]'); const empty = root.querySelector('[data-empty-schedule]');
    if (timeGrid instanceof HTMLElement) timeGrid.replaceChildren(...(station?.times || []).map((minutes) => { const chip = document.createElement('span'); chip.className = 'time-chip'; const formatted = formatMinutes(minutes); chip.append(document.createTextNode(formatted.value)); if (formatted.nextDay) { const note = document.createElement('small'); note.textContent = '+1 día'; chip.append(note); } return chip; }));
    if (empty instanceof HTMLElement) empty.hidden = Boolean(station?.times.length);
    setText('[data-route-type]', route.type === 'bus' ? 'Colectivo' : 'Tren'); setText('[data-schedule-title]', `Salidas desde Villars hacia ${direction}`); setText('[data-company]', route.company || 'No informado'); setText('[data-update-method]', schedule?.updateMethod || 'No informado');
    setText('[data-validity]', route.validFrom ? `Vigencia informada desde ${new Date(`${route.validFrom}T12:00:00`).toLocaleDateString('es-AR')}` : 'Sin vigencia informada');
    const operatorLink = root.querySelector('[data-operator-link]'); if (operatorLink instanceof HTMLAnchorElement) operatorLink.href = route.websiteUrl || route.sourceUrl || transportData.source.repository;
    const next = nextService(route, direction);
    if (next) { const formatted = formatMinutes(next.minutes); setText('[data-next-service]', `${formatted.value}${formatted.nextDay ? ' (+1 día)' : ''}`); const waitHours = Math.floor(next.difference / 60); const waitMinutes = next.difference % 60; setText('[data-next-detail]', `${weekdayNames[next.weekday]}, hacia ${direction} · en ${waitHours ? `${waitHours} h ` : ''}${waitMinutes} min`); }
    else { setText('[data-next-service]', 'Sin datos'); setText('[data-next-detail]', 'No se encontró otro servicio programado en los próximos siete días.'); }
  };
  daySelect.value = serviceDays[argentinaNow().weekday];
  routeSelect.addEventListener('change', render, { signal: controller.signal }); daySelect.addEventListener('change', render, { signal: controller.signal }); directionSelect.addEventListener('change', render, { signal: controller.signal }); render();
}
document.addEventListener('astro:page-load', initTransport);
document.addEventListener('astro:before-swap', () => controller?.abort());
