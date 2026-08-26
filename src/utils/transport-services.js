export const serviceDays = ['sunday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'saturday'];
export const weekdayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function formatMinutes(minutes) {
  const clock = minutes % 1440;
  return {
    value: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
    nextDay: minutes >= 1440,
  };
}

export function argentinaNow(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  const indices = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: indices[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function villarsDeparture(service, destination, stationName = 'villars') {
  if (service.destination !== destination) return undefined;
  const index = service.stops.findIndex((stop) => stop.normalizedStation === stationName);
  if (index < 0 || index >= service.stops.length - 1) return undefined;
  return service.stops[index];
}

export function destinationsFrom(route, stationName = 'villars') {
  const destinations = new Set();
  for (const schedule of route.schedules) {
    for (const service of schedule.services || []) {
      if (villarsDeparture(service, service.destination, stationName)) destinations.add(service.destination);
    }
  }
  return [...destinations].sort((left, right) => left.localeCompare(right, 'es'));
}

export function departuresFor(route, dayKey, destination, stationName = 'villars') {
  const departures = [];
  for (const schedule of route.schedules.filter((item) => item.day.key === dayKey)) {
    for (const service of schedule.services || []) {
      const stop = villarsDeparture(service, destination, stationName);
      if (stop) departures.push({ minutes: stop.minutes, schedule, service });
    }
  }
  return departures.sort((left, right) => left.minutes - right.minutes);
}

export function nextService(route, destination, timezone, date = new Date()) {
  const now = argentinaNow(timezone, date);
  let closest;
  for (let offset = -1; offset <= 7; offset += 1) {
    const serviceWeekday = (now.weekday + offset + 7) % 7;
    const dayKey = serviceDays[serviceWeekday];
    for (const departure of departuresFor(route, dayKey, destination)) {
      const difference = offset * 1440 + departure.minutes - now.minutes;
      if (difference < 0 || (closest && difference >= closest.difference)) continue;
      const nextDayOffset = Math.floor(departure.minutes / 1440);
      const calendarDate = new Date(`${now.date}T12:00:00Z`);
      calendarDate.setUTCDate(calendarDate.getUTCDate() + offset + nextDayOffset);
      closest = {
        ...departure,
        difference,
        weekday: (serviceWeekday + nextDayOffset) % 7,
        date: calendarDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }),
      };
    }
  }
  return closest;
}
