import assert from 'node:assert/strict';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {reviewedDelivery} from '../src/server/reviewed-delivery-index.gen.mjs';
import {serveDeliveredReviewedArtifact} from '../src/server/reviewed-delivery.mjs';
import {serveDeliveredQaArtifact} from '../src/server/r3-qa-delivery.mjs';
import {readReviewedEpochArtifact} from '../src/server/r3-qa-epoch-history.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';

const directory = new URL('../public/ia/research-releases/reviewed-recorded/', import.meta.url);
const origin = 'https://order.example';
const env = {ASSETS: createPrivateResearchAssets()};
const unpack = async file => JSON.parse(gunzipSync(await readFile(file)));

test('all four frozen successor epochs retain earliest-match precedence and original response bytes', async () => {
  const epochs = ['r1-reviewed-e8e12588', 'reviewed-af5ece3e', 'reviewed-e5f97029', 'reviewed-a36b41e2', 'reviewed-7da1ad50'];
  const expected = new Map();
  for (const name of epochs) {
    const capture = await unpack(new URL('./fixtures/' + name + '.capture.json.gz', import.meta.url));
    for (const key of Object.keys(capture.captures)) if (!expected.has(key)) expected.set(key, capture.epoch);
  }
  const observed = new Set(), examples = new Set();
  for (const [index, digest] of reviewedDelivery.records.entries()) {
    const records = await unpack(new URL(digest + '.json.gz', directory));
    for (const [key, row] of Object.entries(records)) {
      const [id, width, hash] = key.split('|');
      const source = reviewedDelivery.sources[row[0]];
      assert.equal(expected.get(key), source.archivedSource.epoch);
      assert.equal(Number.parseInt(hash.slice(0, 2), 16) >>> 2, index);
      assert.equal(observed.has(key), false);
      observed.add(key);
      if (examples.has(row[0])) continue;
      examples.add(row[0]);
      const old = await readReviewedEpochArtifact(id, Number(width), hash);
      const projected = await serveDeliveredReviewedArtifact(id, Number(width), hash, env, origin);
      assert.equal(JSON.stringify(projected), JSON.stringify({...old.artifact, replayFrame: old.replayFrame, archivedSource: old.archivedSource}));
    }
  }
  assert.equal(examples.size, 4);
  assert.deepEqual(observed, new Set([...expected].filter(([, epoch]) => epoch !== 'r1-e8e12588-20261120').map(([key]) => key)));
});

test('unresolved compact login pin opens through the private delivery path with exact response bytes', async () => {
  const id = 'login/empty/compact', width = 390;
  const hash = '6df5ad91b0725e4280d55d76960d2015dd63905df00dab2f9d4fdd04aa3a1e6d';
  const source = await readReviewedEpochArtifact(id, width, hash);
  assert.equal(source.archivedSource.epoch, 'release13-7da1ad50');
  const url = new URL('/api/ia/r3-qa/artifact', origin);
  url.search = new URLSearchParams({id, width, version: 'recorded', artifactHash: hash});
  const response = await serveDeliveredQaArtifact(new Request(url), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), JSON.stringify({...source.artifact, replayFrame: source.replayFrame, archivedSource: source.archivedSource}));
});
