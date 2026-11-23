import {recordBucket} from './r1-recorded-bucket.mjs';
import {r1Recorded} from './r1-recorded-index.gen.mjs';

const cache = new Map();
const encoder = new TextEncoder();
async function digest(bytes) {
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(sum, byte => byte.toString(16).padStart(2, '0')).join('');
}
async function loadPart(binding, origin, hash) {
  const url = new URL('/ia/research-releases/r1-recorded/' + hash + '.json.gz', origin);
  const response = await binding.fetch(new Request(url, {redirect: 'manual', headers: {'Accept-Encoding': 'identity'}}));
  if (response.status !== 200 || response.redirected) throw Error('Missing immutable R1 delivery part');
  const bytes = await response.arrayBuffer();
  if (await digest(bytes) !== hash) throw Error('R1 delivery integrity mismatch');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}
async function part(binding, origin, hash) {
  if (cache.has(hash)) {
    const previous = cache.get(hash);
    cache.delete(hash);
    cache.set(hash, previous);
    return previous;
  }
  // Workers tie streams and binding promises to the request that initiated them.
  // Cache only verified plain data so overlapping cold requests remain independent.
  const value = await loadPart(binding, origin, hash);
  cache.set(hash, value);
  if (cache.size > 3) cache.delete(cache.keys().next().value);
  return value;
}
// Called by the already-authorized artifact API for an explicit recorded identity.
// A miss belongs to the remaining archive chain; it must keep its original result.
export async function serveDeliveredRecordedArtifact(id, width, hash, env, origin, version = 'recorded') {
  if (!env?.ASSETS || typeof id !== 'string' || !/^[\w-]+\/[\w-]+\/[\w-]+$/.test(id) ||
      !r1Recorded.widths.includes(width) || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const bucket = await part(env.ASSETS, origin, r1Recorded.buckets[recordBucket(id)]);
  const key = [id, width, hash].join('|');
  if (!Object.hasOwn(bucket.records, key)) return null;
  const record = bucket.records[key];
  // The host normalizes a recorded original to its source version on refresh.
  // Only the 207 historical prior-r3 records have that exact wire representation.
  if (version === 'prior-r3' && record.metadata.version !== 'prior-r3') return null;
  const shared = await part(env.ASSETS, origin, r1Recorded.shared);
  const join = recipe => recipe.map(item => typeof item === 'number'
    ? bucket.fragments[item] ?? shared[item]
    : JSON.stringify(item.json).replaceAll('<', '\\u003c')).join('');
  const fields = {...record.metadata};
  for (const [name, recipe] of Object.entries(record.fields)) fields[name] = join(recipe);
  fields.exportHash = await digest(encoder.encode(fields.editable));
  const artifact = Object.fromEntries(record.propertyOrder.map(name => [name, fields[name]]));
  const result = {...artifact, replayFrame: artifact.replayFrame || join(r1Recorded.replayRecipe)};
  if (version !== 'prior-r3') result.archivedSource = r1Recorded.archivedSource;
  return result;
}
