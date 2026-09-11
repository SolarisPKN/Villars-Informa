import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays, dateKey, eventBucket } from '../src/utils/events.js';

test('la agenda conserva el evento durante el día posterior y luego lo archiva', () => {
  const event = { start: '2026-09-15', end: '2026-09-15' };
  assert.equal(eventBucket(event, '2026-09-15'), 'upcoming');
  assert.equal(eventBucket(event, '2026-09-16'), 'upcoming');
  assert.equal(eventBucket(event, '2026-09-17'), 'past');
});

test('la agenda respeta eventos de varios días y fechas UTC de Astro', () => {
  assert.equal(dateKey(new Date('2026-09-20T00:00:00.000Z')), '2026-09-20');
  assert.equal(addCalendarDays('2026-09-30', 1), '2026-10-01');
  assert.equal(eventBucket({ start: '2026-09-20', end: '2026-09-22' }, '2026-09-23'), 'upcoming');
  assert.equal(eventBucket({ start: '2026-09-20', end: '2026-09-22' }, '2026-09-24'), 'past');
  assert.equal(eventBucket({ start: '' }, '2026-09-24'), 'invalid');
});
