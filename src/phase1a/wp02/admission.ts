const canonicalWp01Admissions = new WeakSet<object>();

/** Internal handoff used by the validated WP01 adapter. */
export function markCanonicalWp01Admission<T extends object>(manifest: T): T {
  canonicalWp01Admissions.add(manifest);
  return manifest;
}

/** Runtime guard; deliberately not re-exported by the public WP02 index. */
export function hasCanonicalWp01Admission(manifest: object): boolean {
  return canonicalWp01Admissions.has(manifest);
}
