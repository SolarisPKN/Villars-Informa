import { createHash } from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function canonicalJsonSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
