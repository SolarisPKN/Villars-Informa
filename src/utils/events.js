const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function argentinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function dateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const candidate = String(value || '').slice(0, 10);
  return DATE_KEY.test(candidate) ? candidate : '';
}

export function addCalendarDays(value, amount) {
  const key = dateKey(value);
  if (!key) return '';
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function eventBucket({ start, end }, today = argentinaDateKey()) {
  const startKey = dateKey(start);
  if (!startKey) return 'invalid';
  const endKey = dateKey(end) || startKey;
  return today > addCalendarDays(endKey, 1) ? 'past' : 'upcoming';
}
