// A pinned QA response contains immutable release content. Authorization is
// performed by the router before it asks for a record or reads a private part.
import {reviewedDelivery} from './reviewed-delivery-index.gen.mjs';
import {digest, readVerifiedPart} from './private-review-part.mjs';

const recent = new Map();
const encoder = new TextEncoder();
async function part(binding, origin, hash) {
  if (recent.has(hash)) return recent.get(hash);
  // Cache only completed, verified data. Cloudflare streams and pending
  // operations belong to the request that opened them.
  const value = await readVerifiedPart(binding, origin, 'reviewed-recorded', hash);
  recent.set(hash, value);
  if (recent.size > 5) recent.delete(recent.keys().next().value);
  return value;
}
async function record(id, width, hash, env, origin) {
  if (!env?.ASSETS || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const shard = Number.parseInt(hash.slice(0, 2), 16) >>> 2, key = [id, width, hash].join('|');
  for (const layer of [reviewedDelivery.records, reviewedDelivery.additionalRecords]) {
    const bucket = await part(env.ASSETS, origin, layer[shard]);
    if (Object.hasOwn(bucket, key)) return bucket[key];
  }
  return null;
}
export async function isDeliveredReviewedTarget(id, width, hash, env, origin) {
  return Boolean(await record(id, width, hash, env, origin));
}
export async function serveDeliveredReviewedArtifact(id, width, hash, env, origin) {
  const saved = await record(id, width, hash, env, origin);
  if (!saved) return null;
  const [epoch, metadata, fields, order] = saved;
  const source = reviewedDelivery.sources[epoch];
  const needed = new Set();
  for (const recipe of Object.values(fields)) {
    for (const item of recipe) if (typeof item === 'number') needed.add(item >>> 10);
  }
  if (!fields.replayFrame && !metadata.replayFrame) needed.add(source.replay >>> 10);
  const parts = new Map(await Promise.all([...needed].map(async index =>
    [index, await part(env.ASSETS, origin, reviewedDelivery.fragments[index])])));
  const fragment = code => parts.get(code >>> 10)[code & 1023];
  const values = {...metadata};
  for (const [name, recipe] of Object.entries(fields)) {
    values[name] = recipe.map(item => typeof item === 'number' ? fragment(item) : JSON.stringify(item.json).replaceAll('<', '\\u003c')).join('');
  }
  values.exportHash = await digest(encoder.encode(values.editable));
  const artifact = Object.fromEntries(order.map(name => [name, values[name]]));
  return {...artifact, replayFrame: artifact.replayFrame || fragment(source.replay), archivedSource: source.archivedSource};
}
