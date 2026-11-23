// Keep all widths and states for one screen in a single immutable lookup.
export function recordBucket(id) {
  let hash = 2166136261;
  for (const char of id.split('/')[0]) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0 & 15;
}
