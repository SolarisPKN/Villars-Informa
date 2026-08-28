import transportData from '../data/transport-schedules.json';
import { destinationsFrom, directionsFor, formatMinutes, nextServiceForRoute, stationScheduleGrid, weekdayNames } from '../utils/transport-services.js';

const scheduleDays = [
  { key: 'weekday', label: 'Lunes a viernes' },
  { key: 'saturday', label: 'Sábados' },
  { key: 'sunday', label: 'Domingos' },
];
let controller;
const villarsRoutes = transportData.routes.filter((route) => destinationsFrom(route).length > 0);

function formattedTime(minutes) {
  const formatted = formatMinutes(minutes);
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(formatted.value));
  if (formatted.nextDay) {
    const note = document.createElement('small');
    note.textContent = '+1 día';
    fragment.append(note);
  }
  return fragment;
}

function createScheduleSection(route, day, direction) {
  const grid = stationScheduleGrid(route, day.key, direction);
  const section = document.createElement('section');
  section.className = 'schedule-block';
  section.dataset.scheduleDay = day.key;

  const header = document.createElement('div');
  header.className = 'schedule-block-heading';
  const heading = document.createElement('h3');
  heading.textContent = day.label;
  const summary = document.createElement('span');
  summary.textContent = grid.services.length ? `${grid.services.length} formaciones` : 'Sin servicios';
  header.append(heading, summary);

  const scroll = document.createElement('div');
  scroll.className = 'schedule-table-scroll';
  const table = document.createElement('table');
  table.className = 'schedule-table';
  const caption = document.createElement('caption');
  caption.textContent = `${route.branch || route.name} · ${day.label} · Hacia ${direction}`;
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const stationHeading = document.createElement('th');
  stationHeading.scope = 'col';
  stationHeading.className = 'station-column';
  stationHeading.textContent = 'Estación';
  headRow.append(stationHeading);

  for (const service of grid.services) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    const number = document.createElement('span');
    number.textContent = service.name;
    const destination = document.createElement('small');
    destination.textContent = `hasta ${service.destination}`;
    cell.append(number, destination);
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement('tbody');
  for (const station of grid.stations) {
    const row = document.createElement('tr');
    if (station.normalizedName === 'villars') row.classList.add('villars-row');
    const stationCell = document.createElement('th');
    stationCell.scope = 'row';
    stationCell.className = 'station-column';
    const stationName = document.createElement('span');
    stationName.textContent = station.name;
    stationCell.append(stationName);
    if (station.normalizedName === 'villars') {
      const here = document.createElement('small');
      here.textContent = 'Estás acá';
      stationCell.append(here);
    }
    row.append(stationCell);

    station.stops.forEach((stop, index) => {
      const cell = document.createElement('td');
      if (stop) {
        cell.append(formattedTime(stop.minutes));
        const service = grid.services[index];
        cell.title = `Formación ${service.name}: ${station.name} ${formatMinutes(stop.minutes).value}, hasta ${service.destination}`;
      } else {
        cell.className = 'empty-time';
        cell.textContent = '—';
        cell.title = 'Esta formación no pasa por la estación';
      }
      row.append(cell);
    });
    body.append(row);
  }

  if (grid.stations.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'no-services';
    cell.colSpan = Math.max(1, grid.services.length + 1);
    cell.textContent = 'No hay servicios informados para este día y sentido.';
    row.append(cell);
    body.append(row);
  }

  table.append(caption, head, body);
  scroll.append(table);
  section.append(header, scroll);
  return section;
}

function initTransport() {
  controller?.abort();
  controller = new AbortController();
  const root = document.querySelector('[data-transport-app]');
  const tabs = [...(root?.querySelectorAll('[data-service-tab]') || [])];
  const sections = root?.querySelector('[data-schedule-sections]');
  const directionSelect = root?.querySelector('[data-direction-select]');
  if (!(root instanceof HTMLElement) || !(sections instanceof HTMLElement) || !(directionSelect instanceof HTMLSelectElement) || tabs.length === 0) return;

  const setText = (selector, value) => {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  };

  const render = (routeId, requestedDirection) => {
    const route = villarsRoutes.find((item) => item.id === routeId) || villarsRoutes[0];
    if (!route) return;
    const directions = directionsFor(route);
    const direction = directions.some(({ key }) => key === requestedDirection) ? requestedDirection : directions[0]?.key;
    if (!direction) return;

    tabs.forEach((tab) => {
      const active = tab.dataset.serviceTab === route.id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    directionSelect.replaceChildren(...directions.map(({ key, label }) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      option.selected = key === direction;
      return option;
    }));
    sections.setAttribute('aria-label', `Horarios de ${route.branch || route.name}, hacia ${direction}`);
    sections.replaceChildren(...scheduleDays.map((day) => createScheduleSection(route, day, direction)));

    const next = nextServiceForRoute(route, transportData.timezone);
    if (next) {
      const formatted = formatMinutes(next.minutes);
      const waitHours = Math.floor(next.difference / 60);
      const waitMinutes = next.difference % 60;
      setText('[data-next-service]', `${weekdayNames[next.weekday]} ${next.date} · ${formatted.value}`);
      setText('[data-next-detail]', `Hacia ${next.destination} · en ${waitHours ? `${waitHours} h ` : ''}${waitMinutes} min`);
    } else {
      setText('[data-next-service]', 'Sin servicio');
      setText('[data-next-detail]', 'No se encontraron salidas desde Villars en los próximos siete días.');
    }

    setText('[data-route-type]', route.type === 'bus' ? 'Colectivo' : 'Tren');
    setText('[data-schedule-title]', `Todos los horarios de ${route.branch || route.name}`);
    setText('[data-company]', route.company || 'No informado');
    setText('[data-update-method]', route.schedules[0]?.updateMethod || 'No informado');
    setText('[data-validity]', route.validFrom
      ? `Vigencia informada desde ${new Date(`${route.validFrom}T12:00:00`).toLocaleDateString('es-AR')}`
      : 'Sin vigencia informada');
    const operatorLink = root.querySelector('[data-operator-link]');
    if (operatorLink instanceof HTMLAnchorElement) operatorLink.href = route.websiteUrl || route.sourceUrl || transportData.source.repository;
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => render(tab.dataset.serviceTab), { signal: controller.signal });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const target = tabs[(index + offset + tabs.length) % tabs.length];
      target.focus();
      render(target.dataset.serviceTab);
    }, { signal: controller.signal });
  });
  directionSelect.addEventListener('change', () => {
    const activeRoute = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.serviceTab;
    render(activeRoute, directionSelect.value);
  }, { signal: controller.signal });
  render(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.serviceTab);
}

document.addEventListener('astro:page-load', initTransport);
document.addEventListener('astro:before-swap', () => controller?.abort());
