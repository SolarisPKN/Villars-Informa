import transportData from '../data/transport-schedules.json';
import { destinationsFrom, directionsFor, formatMinutes, scheduleServiceKey, stationScheduleGrid, upcomingServicesForDirection, weekdayNames } from '../utils/transport-services.js';

const scheduleDays = [
  { key: 'weekday', label: 'Lunes a viernes' },
  { key: 'saturday', label: 'Sábados' },
  { key: 'sunday', label: 'Domingos' },
];
let controller;
let refreshTimer;
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

function waitLabel(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  return `${days ? `${days} d ` : ''}${hours ? `${hours} h ` : ''}${remainingMinutes} min`;
}

function createScheduleSection(route, day, direction, highlights) {
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
  const formationHeading = document.createElement('th');
  formationHeading.scope = 'col';
  formationHeading.className = 'formation-column';
  formationHeading.textContent = 'Formación';
  headRow.append(formationHeading);

  for (const station of grid.stations) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    if (station.normalizedName === 'villars') cell.classList.add('villars-column');
    const name = document.createElement('span');
    name.textContent = station.name;
    cell.append(name);
    if (station.normalizedName === 'villars') {
      const here = document.createElement('small');
      here.textContent = 'Estás acá';
      cell.append(here);
    }
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement('tbody');
  grid.services.forEach((service, serviceIndex) => {
    const row = document.createElement('tr');
    const serviceKey = scheduleServiceKey(day.key, direction, service);
    row.dataset.serviceKey = serviceKey;
    const rank = highlights.get(serviceKey);
    if (rank === 0) row.classList.add('next-service-row');
    if (rank === 1) row.classList.add('following-service-row');

    const serviceCell = document.createElement('th');
    serviceCell.scope = 'row';
    serviceCell.className = 'formation-column';
    const number = document.createElement('span');
    number.textContent = service.name;
    const destination = document.createElement('small');
    destination.textContent = `hasta ${service.destination}`;
    serviceCell.append(number, destination);
    if (rank === 0 || rank === 1) {
      const badge = document.createElement('span');
      badge.className = 'service-rank';
      badge.textContent = rank === 0 ? 'Próxima' : 'Después';
      serviceCell.append(badge);
    }
    row.append(serviceCell);

    grid.stations.forEach((station) => {
      const stop = station.stops[serviceIndex];
      const cell = document.createElement('td');
      if (station.normalizedName === 'villars') cell.classList.add('villars-column');
      if (stop) {
        cell.append(formattedTime(stop.minutes));
        cell.title = `Formación ${service.name}: ${station.name} ${formatMinutes(stop.minutes).value}, hasta ${service.destination}`;
      } else {
        cell.classList.add('empty-time');
        cell.textContent = '—';
        cell.title = 'Esta formación no pasa por la estación';
      }
      row.append(cell);
    });
    body.append(row);
  });

  if (grid.services.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'no-services';
    cell.colSpan = Math.max(1, grid.stations.length + 1);
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
  if (refreshTimer) window.clearInterval(refreshTimer);
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

    const upcoming = upcomingServicesForDirection(route, direction, transportData.timezone);
    const highlights = new Map(upcoming.map(({ key }, index) => [key, index]));
    sections.setAttribute('aria-label', `Horarios de ${route.branch || route.name}, hacia ${direction}`);
    sections.replaceChildren(...scheduleDays.map((day) => createScheduleSection(route, day, direction, highlights)));

    const next = upcoming[0];
    if (next) {
      const formatted = formatMinutes(next.stop.minutes);
      setText('[data-next-service]', `${weekdayNames[next.weekday]} ${next.date} · ${formatted.value}`);
      setText('[data-next-detail]', `Formación ${next.service.name} hacia ${next.service.destination} · en ${waitLabel(next.difference)}`);
    } else {
      setText('[data-next-service]', 'Sin servicio');
      setText('[data-next-detail]', 'No se encontraron formaciones por Villars en este sentido durante los próximos siete días.');
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

  const renderCurrentSelection = () => {
    const activeRoute = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.serviceTab;
    render(activeRoute, directionSelect.value);
  };
  render(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.serviceTab);
  refreshTimer = window.setInterval(renderCurrentSelection, 60_000);
}

document.addEventListener('astro:page-load', initTransport);
document.addEventListener('astro:before-swap', () => {
  controller?.abort();
  if (refreshTimer) window.clearInterval(refreshTimer);
});
