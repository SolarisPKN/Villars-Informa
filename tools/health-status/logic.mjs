import { createHash } from 'node:crypto';

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// Compare exact phone numbers, not profile names. Never discover/ingest arbitrary contacts.
export function normalizePhone(value) {
  return String(value || '').replace(/\\D/g, '');
}

export function allowedPhoneSet(raw) {
  const values = String(raw || '').split(',').map(normalizePhone).filter(Boolean);
  if (!values.length || values.some((value) => value.length < 9 || value.length > 15)) {
    throw new Error('Configure WA_ALLOWED_CONTACTS with approved WhatsApp phone numbers including country code.');
  }
  return new Set(values);
}

export function statusKey(phone, messageId) {
  if (!normalizePhone(phone) || !String(messageId || '').trim()) {
    throw new Error('Status must have a phone and a stable WhatsApp message ID.');
  }
  return createHash('sha256').update(normalizePhone(phone) + ':' + messageId).digest('hex');
}

export function assessStatus(message, nowMs = Date.now()) {
  const timestampSeconds = Number(message?.timestamp);
  const messageId = message?.id?._serialized;
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0 || !messageId) {
    return { eligible: false, reason: 'missing-timestamp-or-id' };
  }
  const createdAtMs = timestampSeconds * 1000;
  const expiresAtMs = createdAtMs + STATUS_LIFETIME_MS;
  if (createdAtMs > nowMs + FUTURE_SKEW_MS) return { eligible: false, reason: 'future-timestamp' };
  if (nowMs >= expiresAtMs) return { eligible: false, reason: 'status-expired' };
  if (message.fromMe) return { eligible: false, reason: 'own-status' };
  return { eligible: true, createdAt: new Date(createdAtMs).toISOString(), expiresAt: new Date(expiresAtMs).toISOString(), messageId };
}

export function trimmedText(value) {
  return String(value || '').replace(/\\u0000/g, '').trim().slice(0, 1600);
}
