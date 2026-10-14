import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedPhoneSet, assessStatus, normalizePhone, statusKey, trimmedText, STATUS_LIFETIME_MS } from '../tools/health-status/logic.mjs';

const nowMs = new Date('2026-10-14T15:00:00Z').getTime();
const makeStatus = (createdAtMs, id = 'status-id') => ({
  id: { _serialized: id }, timestamp: Math.floor(createdAtMs / 1000), fromMe: false,
});

test('allowlist is explicit, exact and requires valid numbers', () => {
  assert.throws(() => allowedPhoneSet(''));
  assert.throws(() => allowedPhoneSet('123'));
  const allowed = allowedPhoneSet('+54 9 11 2345 6789, 54911 5678-0000');
  assert.equal(allowed.size, 2);
  assert.ok(allowed.has('5491123456789'));
  assert.ok(!allowed.has('5491123456790'));
  assert.equal(normalizePhone('+54 9 11 2345 6789'), '5491123456789');
});

test('24h applies to actual publication timestamp, not collection time', () => {
  const recent = assessStatus(makeStatus(nowMs - 4 * 60 * 60 * 1000), nowMs);
  assert.ok(recent.eligible);
  assert.equal(new Date(recent.expiresAt).getTime() - new Date(recent.createdAt).getTime(), STATUS_LIFETIME_MS);
  const expired = assessStatus(makeStatus(nowMs - STATUS_LIFETIME_MS), nowMs);
  assert.equal(expired.eligible, false);
  assert.equal(expired.reason, 'status-expired');
  const future = assessStatus(makeStatus(nowMs + 7 * 60 * 1000), nowMs);
  assert.equal(future.reason, 'future-timestamp');
});

test('invalid messages and own statuses are discarded', () => {
  assert.equal(assessStatus({ timestamp: 1000 }, nowMs).eligible, false);
  const own = { ...makeStatus(nowMs), fromMe: true };
  assert.equal(assessStatus(own, nowMs).reason, 'own-status');
});

test('status deduplication uses stable cryptographic keys', () => {
  const a = statusKey('5491123456789', 'abc');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, statusKey('+54 9 11 2345 6789', 'abc'));
  assert.notEqual(a, statusKey('5491123456789', 'xyz'));
  assert.notEqual(a, statusKey('5491123456790', 'abc'));
  assert.throws(() => statusKey('', 'abc'));
});

test('text is bounded; the collector never automatically publishes', async () => {
  assert.equal(trimmedText(' test\0 content  '), 'test content');
  assert.equal(trimmedText('x'.repeat(6000)).length, 1600);
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('../tools/health-status/run.mjs', import.meta.url), 'utf8');
  assert.match(script, /WA_STATUS_CONSENT/);
  assert.match(script, /pending-human-review/);
  assert.match(script, /publishingAuthorized: false/);
  assert.match(script, /WA_STATE_DIR/);
  assert.doesNotMatch(script, /git\s+push|github\.com\/repos/);
});
