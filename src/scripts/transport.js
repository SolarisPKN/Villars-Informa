import transportData from '../data/transport-schedules.json';
import { formatMinutes, nextServiceForRoute, scheduleGrid, weekdayNames } from '../utils/transport-services.js';

const scheduleDays = [
  { key: 'weekday', label: 'Lunes a viernes' },
  { key: 'saturday', label: 'Sábados' },
  { key: 'sunday', label: 'Domingos' },
];
let controller;
const villarsRoutes = transportData.routes.filter((route) => scheduleGrid(route, 'weekday').columns.length > 0);

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

function createScheduleSection(route, day) {
  const grid = scheduleGrid(route, day.key);
  const section = document.createElement('section');
  section.className = 'schedule-block';
  section.dataset.scheduleDay = day.key;

  const header = document.createElement('div');
  header.className = 'schedule-block-heading';
  const heading = document.createElement('h3');
  heading.textContent = day.label;
  const total = grid.columns.reduce((count, column) => count + column.departures.length, 0);
  const summary = document.createElement('span');
  summary.textContent = total ? `${total} salidas desde Villars` : 'Sin salidas desde Villars';
  header.append(heading, summary);

  const scroll = document.createElement('div');
  scroll.className = 'schedule-table-scroll';
  const table = document.createElement('table');
  table.className = 'schedule-table';
  const caption = document.createElement('caption');
  caption.textContent = `${route.branch || route.name} · ${day.label}`;
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const orderHeading = document.createElement('th');
  orderHeading.scope = 'col';
  orderHeading.textContent = 'Salida';
  headRow.append(orderHeading);
  for (const { destination } of grid.columns) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = `Hacia ${destination}`;
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement('tbody');
  grid.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const order = document.createElement('th');
    order.scope = 'row';
    order.textContent = String(index + 1).padStart(2, '0');
    tr.append(order);
    row.forEach((departure) => {
      const cell = document.createElement('td');
      if (departure) {
        cell.append(formattedTime(departure.minutes));
        cell.title = `Servicio ${departure.service.name || index + 1}`;
      } else {
        cell.className = 'empty-time';
        cell.textContent = '—';
      }
      tr.append(cell);
    });
    body.append(tr);
  });
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
  if (!(root instanceof HTMLElement) || !(sections instanceof HTMLElement) || tabs.length === 0) return;

  const setText = (selector, value) => {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  };

  const render = (routeId) => {
    const route = villarsRoutes.find((item) => item.id === routeId) || villarsRoutes[0];
    if (!route) return;
    tabs.forEach((tab) => {
      const active = tab.dataset.serviceTab === route.id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    sections.setAttribute('aria-label', `Horarios de ${route.branch || route.name}`);
    sections.replaceChildren(...scheduleDays.map((day) => createScheduleSection(route, day)));

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
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const target = tabs[(index + direction + tabs.length) % tabs.length];
      target.focus();
      render(target.dataset.serviceTab);
    }, { signal: controller.signal });
  });
  render(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.serviceTab);
}

document.addEventListener('astro:page-load', initTransport);
document.addEventListener('astro:before-swap', () => controller?.abort());
