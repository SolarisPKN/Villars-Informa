import transportData from '../data/transport-schedules.json';
import { argentinaNow, departuresFor, destinationsFrom, formatMinutes, nextService, serviceDays, weekdayNames } from '../utils/transport-services.js';

let controller;
const villarsRoutes = transportData.routes.filter((route) => destinationsFrom(route).length > 0);

function initTransport() {
  controller?.abort();
  controller = new AbortController();
  const root = document.querySelector('[data-transport-app]');
  const routeSelect = root?.querySelector('[data-route-select]');
  const daySelect = root?.querySelector('[data-day-select]');
  const destinationSelect = root?.querySelector('[data-direction-select]');
  if (!(root instanceof HTMLElement) || !(routeSelect instanceof HTMLSelectElement) || !(daySelect instanceof HTMLSelectElement) || !(destinationSelect instanceof HTMLSelectElement)) return;

  const setText = (selector, value) => {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  };

  const render = () => {
    const route = villarsRoutes.find((item) => item.id === routeSelect.value) || villarsRoutes[0];
    const previousDestination = destinationSelect.value;
    const destinations = destinationsFrom(route);
    if (destinationSelect.dataset.route !== route.id) {
      destinationSelect.replaceChildren(...destinations.map((destination) => {
        const option = document.createElement('option');
        option.value = destination;
        option.textContent = destination;
        return option;
      }));
      destinationSelect.dataset.route = route.id;
      if (destinations.includes(previousDestination)) destinationSelect.value = previousDestination;
    }

    const destination = destinationSelect.value;
    const departures = departuresFor(route, daySelect.value, destination);
    const schedule = departures[0]?.schedule || route.schedules.find((item) => item.day.key === daySelect.value);
    const timeGrid = root.querySelector('[data-time-grid]');
    const empty = root.querySelector('[data-empty-schedule]');
    if (timeGrid instanceof HTMLElement) {
      timeGrid.replaceChildren(...departures.map(({ minutes }) => {
        const chip = document.createElement('span');
        chip.className = 'time-chip';
        const formatted = formatMinutes(minutes);
        chip.append(document.createTextNode(formatted.value));
        if (formatted.nextDay) {
          const note = document.createElement('small');
          note.textContent = '+1 día';
          chip.append(note);
        }
        return chip;
      }));
    }

    const next = nextService(route, destination, transportData.timezone);
    if (empty instanceof HTMLElement) {
      empty.hidden = departures.length > 0;
      empty.textContent = next
        ? `No hay servicios hacia ${destination} para el día elegido. El próximo sale el ${weekdayNames[next.weekday]} ${next.date} a las ${formatMinutes(next.minutes).value}.`
        : `No hay servicios programados hacia ${destination} en los próximos siete días.`;
    }

    setText('[data-route-type]', route.type === 'bus' ? 'Colectivo' : 'Tren');
    setText('[data-schedule-title]', `Salidas reales desde Villars con destino ${destination}`);
    setText('[data-company]', route.company || 'No informado');
    setText('[data-update-method]', schedule?.updateMethod || 'No informado');
    setText('[data-validity]', route.validFrom
      ? `Vigencia informada desde ${new Date(`${route.validFrom}T12:00:00`).toLocaleDateString('es-AR')}`
      : 'Sin vigencia informada');
    const operatorLink = root.querySelector('[data-operator-link]');
    if (operatorLink instanceof HTMLAnchorElement) operatorLink.href = route.websiteUrl || route.sourceUrl || transportData.source.repository;

    if (next) {
      const formatted = formatMinutes(next.minutes);
      const waitHours = Math.floor(next.difference / 60);
      const waitMinutes = next.difference % 60;
      setText('[data-next-service]', `${weekdayNames[next.weekday]} ${next.date} · ${formatted.value}`);
      setText('[data-next-detail]', `Destino ${destination} · en ${waitHours ? `${waitHours} h ` : ''}${waitMinutes} min`);
    } else {
      setText('[data-next-service]', 'Sin servicio');
      setText('[data-next-detail]', `No se encontró una formación que salga de Villars y termine en ${destination}.`);
    }
  };

  daySelect.value = serviceDays[argentinaNow(transportData.timezone).weekday];
  routeSelect.addEventListener('change', render, { signal: controller.signal });
  daySelect.addEventListener('change', render, { signal: controller.signal });
  destinationSelect.addEventListener('change', render, { signal: controller.signal });
  render();
}

document.addEventListener('astro:page-load', initTransport);
document.addEventListener('astro:before-swap', () => controller?.abort());
