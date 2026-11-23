// Build a private, byte-identical read projection from the immutable R1 source.
// Its input is the captured product epoch. No review records enter this build.
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {gunzipSync, gzipSync} from 'node:zlib';
import {epochFragmentsGzip, epochIndexGzip, epochMetadata} from '../../src/server/r3-ui/r1-e8e12588-history.gen.mjs';
import {recordBucket} from '../../src/server/r1-recorded-bucket.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function unpack(base64, expected) {
  const bytes = gunzipSync(Buffer.from(base64, 'base64'));
  if (digest(bytes) !== expected) throw Error('Unexpected R1 source digest');
  return JSON.parse(bytes);
}
const archive = unpack(epochIndexGzip, epochMetadata.indexSha256);
const fragments = unpack(epochFragmentsGzip, epochMetadata.fragmentsSha256);
const nodes = new Map();
function expand(id) {
  if (nodes.has(id)) return nodes.get(id);
  const [kind, raw] = archive.nodes[id];
  const value = kind === 'object' ? Object.fromEntries(raw.map(([name, child]) => [name, expand(child)]))
    : kind === 'array' ? raw.map(expand) : kind === 'null' ? null : raw;
  nodes.set(id, value);
  return value;
}
const buckets = Array.from({length: 16}, () => ({records: {}, fragments: {}}));
const used = new Map();
for (const [key, id] of Object.entries(archive.records)) {
  const bucket = recordBucket(key.split('|')[0]);
  const record = expand(id);
  buckets[bucket].records[key] = record;
  for (const recipe of [...Object.values(record.fields), archive.replayRecipe]) {
    for (const fragment of recipe) {
      if (typeof fragment !== 'number') continue;
      if (!used.has(fragment)) used.set(fragment, new Set());
      used.get(fragment).add(bucket);
    }
  }
}
const shared = {};
for (const [id, owners] of used) {
  const pool = owners.size === 1 ? buckets[owners.values().next().value].fragments : shared;
  pool[id] = fragments[id];
}
const output = new URL('../../public/ia/research-releases/r1-recorded/', import.meta.url);
await mkdir(output, {recursive: true});
async function save(value) {
  const bytes = gzipSync(JSON.stringify(value), {level: 9});
  const hash = digest(bytes);
  await writeFile(new URL(hash + '.json.gz', output), bytes);
  return hash;
}
const manifest = {
  archivedSource: {epoch: epochMetadata.epoch, commit: epochMetadata.commit, tree: epochMetadata.tree},
  widths: epochMetadata.widths,
  replayRecipe: archive.replayRecipe,
  shared: await save(shared),
  buckets: await Promise.all(buckets.map(save))
};
await writeFile(new URL('../../src/server/r1-recorded-index.gen.mjs', import.meta.url),
  '// Generated from the frozen R1 capture by scripts/r3/prepare-r1-delivery.mjs.\nexport const r1Recorded = ' + JSON.stringify(manifest) + ';\n');
