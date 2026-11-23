import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {readReviewedEpochArtifact} from '../src/server/r3-qa-epoch-history.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {r1Recorded} from '../src/server/r1-recorded-index.gen.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
import {handleIaRequest} from '../src/server/router.mjs';

const origin = 'https://order.example';
const prefix = '/ia/research-releases/r1-recorded/';
const directory = new URL('../public' + prefix, import.meta.url);
const capsule = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/r1-reviewed-e8e12588.capture.json.gz', import.meta.url))));
const approved = new Set([r1Recorded.shared, ...r1Recorded.buckets].map(value => value + '.json.gz'));
async function verifiedBinding(request) {
  const url = new URL(request.url), name = url.pathname.slice(prefix.length);
  assert.equal(url.origin, origin); assert.ok(url.pathname.startsWith(prefix));
  assert.ok(approved.has(name)); assert.equal(request.method, 'GET');
  return new Response(await readFile(new URL(name, directory)));
}
const fresh = key => import('../src/server/r1-recorded-delivery.mjs?' + key);
const args = target => [[target.screen, target.state, target.variant].join('/'), target.viewport, target.artifactHash];

test('private R1 lookup preserves complete response bytes for the readable source targets and all 27 prior misses', async () => {
  const {serveDeliveredRecordedArtifact: serve} = await fresh('parity');
  const env = {ASSETS: {fetch: verifiedBinding}};
  assert.deepEqual((await readdir(directory)).sort(), [...approved].sort());
  for (const {target} of capsule.targetChecks) {
    const parameters = args(target);
    const original = await readReviewedEpochArtifact(...parameters);
    const actual = await serve(...parameters, env, origin);
    assert.equal(JSON.stringify(actual), JSON.stringify({...original.artifact, replayFrame: original.replayFrame, archivedSource: original.archivedSource}));
  }
  for (const {target} of capsule.unavailableTargets) assert.equal(await serve(...args(target), env, origin), null);
  assert.equal(capsule.targetChecks.length, 212);
  assert.equal(capsule.unavailableTargets.length, 27);
});

test('all 207 prior-r3 refresh URLs return the exact historical wire response without recording metadata', async () => {
  const {serveDeliveredRecordedArtifact: serve} = await fresh('refresh');
  const env = {ASSETS: {fetch: verifiedBinding}};
  let checked = 0, checkedCurrentMiss = false;
  for (const digest of r1Recorded.buckets) {
    const {records} = JSON.parse(gunzipSync(await readFile(new URL(digest + '.json.gz', directory))));
    for (const [key, record] of Object.entries(records)) {
      const [id, width, hash] = key.split('|');
      if (record.metadata.version !== 'prior-r3') {
        if (!checkedCurrentMiss) assert.equal(await serve(id, Number(width), hash, env, origin, 'prior-r3'), null);
        checkedCurrentMiss = true;
        continue;
      }
      const url = new URL('/api/ia/r3-qa/artifact', origin);
      url.search = new URLSearchParams({id, width, artifactHash: hash, version: 'prior-r3'});
      const raw = await serveR3Artifact(new Request(url), {});
      const projected = await serve(id, Number(width), hash, env, origin, 'prior-r3');
      assert.equal(raw.status, 200);
      assert.equal(JSON.stringify(projected), await raw.text());
      ++checked;
    }
  }
  assert.equal(checked, 207); assert.ok(checkedCurrentMiss);
});

test('corrupt private data cannot populate the cache, and overlapping reads use their own request bindings', async () => {
  const {serveDeliveredRecordedArtifact: serve} = await fresh('retry');
  const target = args(capsule.targetChecks[0].target);
  await assert.rejects(serve(...target, {ASSETS: {fetch: async () => new Response('wrong bytes')}}, origin), /integrity/);
  const calls = [[], []];
  let arrived = 0, open;
  const latch = new Promise(resolve => { open = resolve; });
  const requests = calls.map(reads => serve(...target, {ASSETS: {async fetch(request) {
    reads.push(request.url);
    if (reads.length === 1) { if (++arrived === 2) open(); await latch; }
    return verifiedBinding(request);
  }}}, origin));
  const [a, b] = await Promise.all(requests);
  assert.deepEqual(a,b); assert.ok(a?.exportHash);
  assert.ok(calls.every(reads => reads.length > 0));
});

test('direct R1 capsule HTTP reads and anonymous artifact requests cannot reach the static binding', async () => {
  let reads = 0;
  const env = {ASSETS: {fetch() { ++reads; throw Error('unexpected read'); }}};
  for (const method of ['GET', 'HEAD']) {
    const res = await onRequest({request: new Request(origin + prefix + r1Recorded.shared + '.json.gz', {method}), env});
    assert.equal(res.status, 404);
  }
  const [id,width,artifactHash] = args(capsule.targetChecks[0].target);
  const url = new URL('/api/ia/r3-qa/artifact', origin);
  url.search = new URLSearchParams({id,width,artifactHash,version:'recorded'});
  assert.equal((await handleIaRequest(new Request(url), env)).status, 403);
  assert.equal(reads, 0);
});
