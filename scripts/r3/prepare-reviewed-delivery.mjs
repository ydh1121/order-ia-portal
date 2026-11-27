// Materialize the frozen successor epochs' recipes once, without bundling their
// full key tables or rebuilding an ancestor chain to display a single old pin.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createReviewedEpochReader as reader} from '../../src/server/r3-qa-epoch-history.mjs';
import * as r1 from '../../src/server/r3-ui/r1-e8e12588-history.gen.mjs';
import * as nine from '../../src/server/r3-ui/r3-af5ece3e-history.gen.mjs';
import * as ten from '../../src/server/r3-ui/r3-e5f97029-history.gen.mjs';
import * as eleven from '../../src/server/r3-ui/r3-a36b41e2-history.gen.mjs';
import * as thirteen from '../../src/server/r3-ui/r3-7da1ad50-history.gen.mjs';
import * as twentySeven from '../../src/server/r3-ui/r3-69779df0-history.gen.mjs';
import * as publishedPr31 from '../../src/server/r3-ui/r3-reviewed-227aa-history.gen.mjs';
import * as publishedPr33 from '../../src/server/r3-ui/r3-reviewed-bed73995-history.gen.mjs';
import * as existing from '../../src/server/reviewed-delivery-index.gen.mjs';

const output = new URL('../../public/ia/research-releases/reviewed-recorded/', import.meta.url);
const check = process.argv.includes('--check');
if (!check) await mkdir(output, {recursive: true});
async function writePart(value) {
  const bytes = gzipSync(JSON.stringify(value), {level: 9});
  const digest = createHash('sha256').update(bytes).digest('hex');
  const file = new URL(digest + '.json.gz', output);
  try {
    if (!(await readFile(file)).equals(bytes)) throw Error('Immutable reviewed part changed');
  } catch (error) {
    if (error.code !== 'ENOENT' || check) throw error;
    await writeFile(file, bytes, {flag: 'wx'});
  }
  return digest;
}

const previous = reader(nine), later = reader(eleven, previous);
const priceArchive = reader(twentySeven), pr31Archive = reader(publishedPr31, priceArchive);
const pr33Archive = reader(publishedPr33, pr31Archive);
const epochs = [previous, reader(ten, previous), later, reader(thirteen, later), priceArchive, pr31Archive, pr33Archive];
const seen = new Set(await reader(r1).keys());
const recordBuckets = () => Array.from({length: 64}, () => Object.create(null));
const records = recordBuckets(), additionalRecords = recordBuckets(), exactRecords = new Map();
const fragments = [], identifiers = new Map();
let partBytes = 0;
// Codes encode a part number and a slot. A request reads only the distinct
// parts used by its recipe. Shared content is interned across captured epochs.
function intern(value) {
  if (identifiers.has(value)) return identifiers.get(value);
  const bytes = Buffer.byteLength(value);
  if (!fragments.length || fragments.at(-1).length === 1024 || partBytes + bytes > 400000) {
    fragments.push([]);
    partBytes = 0;
  }
  const part = fragments.at(-1);
  const code = (fragments.length - 1) * 1024 + part.length;
  part.push(value);
  partBytes += bytes;
  identifiers.set(value, code);
  return code;
}
const sources = [];
for (const epoch of epochs) {
  // A successor starts a new part; no prior fragment part is rewritten merely
  // to fill its remaining capacity with newly captured historical content.
  if (epoch === priceArchive || epoch === pr31Archive || epoch === pr33Archive) partBytes = Infinity;
  // Keep already published record buckets byte-identical when a successor adds pins.
  const destination = epoch === pr31Archive ? additionalRecords : records;
  const {epoch: name, commit, tree} = epoch.metadata;
  const source = {archivedSource: {epoch: name, commit, tree}};
  if (epoch === pr33Archive) source.exactResponse = true;
  const values = await epoch.parts();
  const codes = values.map(intern);
  const epochIndex = sources.push(source) - 1;
  for (const key of await epoch.keys()) {
    if (seen.has(key)) continue; // Original readers resolve the earliest match.
    seen.add(key);
    const [id, width, hash] = key.split('|');
    const raw = await epoch.rawRecordKey(key);
    if (!source.exactResponse && source.replay === undefined && !raw.fields.replayFrame && !raw.metadata.replayFrame) {
      const saved = await epoch.artifact(id, Number(width), hash);
      source.replay = intern(saved.replayFrame);
    }
    const fields = Object.fromEntries(Object.entries(raw.fields).map(([field, recipe]) =>
      [field, recipe.map(item => typeof item === 'number' ? codes[item] : item)]));
    let bucket = destination[Number.parseInt(hash.slice(0, 2), 16) >>> 2];
    if (source.exactResponse) {
      if (!exactRecords.has(id)) exactRecords.set(id, Object.create(null));
      bucket = exactRecords.get(id);
    }
    bucket[key] = [epochIndex, raw.metadata, fields, raw.propertyOrder];
  }
}
const manifest = {sources, fragments: [], records: [], additionalRecords: [], exactRecords: {}};
for (const part of fragments) manifest.fragments.push(await writePart(part));
for (const bucket of records) manifest.records.push(await writePart(bucket));
for (const bucket of additionalRecords) manifest.additionalRecords.push(await writePart(bucket));
for (const [id, bucket] of exactRecords) manifest.exactRecords[id] = await writePart(bucket);
const activeParts = new Set([...manifest.fragments, ...manifest.records, ...manifest.additionalRecords, ...Object.values(manifest.exactRecords)]);
const retained = [...new Set([...existing.reviewedDelivery.fragments, ...existing.reviewedDelivery.records, ...(existing.reviewedDelivery.additionalRecords || []), ...Object.values(existing.reviewedDelivery.exactRecords || {}), ...(existing.retainedReviewedParts || [])])].filter(hash => !activeParts.has(hash)).sort();
const file = new URL('../../src/server/reviewed-delivery-index.gen.mjs', import.meta.url);
// Build/audit-only retained hashes are a separate export. Serving the current
// index does not bundle the archive inventory into the Pages Worker.
const source = '// Generated by scripts/r3/prepare-reviewed-delivery.mjs.\nexport const reviewedDelivery = ' + JSON.stringify(manifest) + ';\nexport const retainedReviewedParts = ' + JSON.stringify(retained) + ';\n';
if (check) {
  if (await readFile(file, 'utf8') !== source) throw Error('Reviewed delivery index needs regeneration');
} else await writeFile(file, source);
const allRecordBuckets = [...records, ...additionalRecords, ...exactRecords.values()];
console.log(JSON.stringify({records: allRecordBuckets.reduce((n, bucket) => n + Object.keys(bucket).length, 0), recordParts: allRecordBuckets.length, fragmentParts: fragments.length, retainedParts: retained.length, checked: check}));
