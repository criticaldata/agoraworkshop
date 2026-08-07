import { createHash } from 'node:crypto';

/**
 * Canonical serialization: object keys sorted recursively, array order preserved,
 * no insignificant whitespace. Two configs that are semantically identical must
 * produce byte-identical output, and any change to an experimental parameter must
 * change the bytes.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) continue;
    out[key] = canonicalValue(entry);
  }
  return out;
}

export function configHash(config: unknown): string {
  const digest = createHash('sha256').update(canonicalize(config), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/** Deep-freezes the config so a run cannot mutate its own experimental conditions. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return Object.freeze(value);
}
