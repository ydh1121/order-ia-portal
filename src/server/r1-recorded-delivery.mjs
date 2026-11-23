import {digest, readVerifiedPart} from './private-review-part.mjs';
import {recordBucket} from './r1-recorded-bucket.mjs';
import {r1Recorded} from './r1-recorded-index.gen.mjs';

const cache = new Map();
const encoder = new TextEncoder();
async function part(binding, origin, hash) {
  if (cache.has(hash)) {
    const previous = cache.get(hash);
    cache.delete(hash);
    cache.set(hash, previous);
    return previous;
  }
  // Workers tie streams and binding promises to the request that initiated them.
  // Cache only verified plain data so overlapping cold requests remain independent.
  const value = await readVerifiedPart(binding, origin, 'r1-recorded', hash);
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
