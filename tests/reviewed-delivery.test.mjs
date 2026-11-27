import assert from 'node:assert/strict';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewedDelivery} from '../src/server/reviewed-delivery-index.gen.mjs';
import {isDeliveredReviewedTarget,serveDeliveredReviewedArtifact} from '../src/server/reviewed-delivery.mjs';
import {serveDeliveredQaArtifact,isDeliveredReviewTarget} from '../src/server/r3-qa-delivery.mjs';
import {readReviewedEpochArtifact,createReviewedEpochReader} from '../src/server/r3-qa-epoch-history.mjs';
import * as twentySeven from '../src/server/r3-ui/r3-69779df0-history.gen.mjs';
import * as publishedPr31 from '../src/server/r3-ui/r3-reviewed-227aa-history.gen.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';

const directory = new URL('../public/ia/research-releases/reviewed-recorded/', import.meta.url);
const origin = 'https://order.example';
const env = {ASSETS: createPrivateResearchAssets()};
const unpack = async file => JSON.parse(gunzipSync(await readFile(file)));
const release27 = createReviewedEpochReader(twentySeven);
const release31 = createReviewedEpochReader(publishedPr31, release27);

test('all frozen successor epochs retain earliest-match precedence and original response bytes', async () => {
  const epochs = ['r1-reviewed-e8e12588', 'reviewed-af5ece3e', 'reviewed-e5f97029', 'reviewed-a36b41e2', 'reviewed-7da1ad50', 'reviewed-69779df0', 'reviewed-227aa'];
  const expected = new Map();
  for (const name of epochs) {
    const capture = await unpack(new URL('./fixtures/' + name + '.capture.json.gz', import.meta.url));
    for (const key of Object.keys(capture.captures)) if (!expected.has(key)) expected.set(key, capture.epoch);
  }
  const observed = new Set(), examples = new Set();
  for (const [index, digest] of [...reviewedDelivery.records.entries(), ...reviewedDelivery.additionalRecords.entries()]) {
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
      const capture = [release27, release31].find(reader => reader.metadata.epoch === source.archivedSource.epoch);
      const old = capture ? await capture.artifact(id, Number(width), hash) : await readReviewedEpochArtifact(id, Number(width), hash);
      const projected = await serveDeliveredReviewedArtifact(id, Number(width), hash, env, origin);
      assert.equal(JSON.stringify(projected), JSON.stringify({...old.artifact, replayFrame: old.replayFrame, archivedSource: old.archivedSource}));
    }
  }
  assert.equal(examples.size, 6);
  assert.deepEqual(observed, new Set([...expected].filter(([, epoch]) => epoch !== 'r1-e8e12588-20261120').map(([key]) => key)));
});

test('all 1220 pre-refactor wrapper and price identities retain exact base response bytes and remain known targets', async () => {
  const capture = await unpack(new URL('./fixtures/reviewed-69779df0.capture.json.gz', import.meta.url));
  assert.equal(capture.commit, '69779df034a3ed544c8962926def1c8f104178a9');
  assert.equal(capture.tree, '04313c6f1b94228589f79a340ee45c9b0b26a902');
  assert.equal(capture.scope, 'explicit-review-targets');
  assert.equal(capture.targetChecks.length, 1220);
  assert.equal(capture.targetChecks.filter(row => row.kind === 'prior-price-content').length, 90);
  assert.equal(capture.targetChecks.filter(row => row.kind === 'prior-qa-wrapper').length, 1130);
  const digest = value => createHash('sha256').update(value).digest('hex');
  let fixedPrice;
  async function verify(item, version = 'recorded') {
    const {target} = item, id = [target.screen, target.state, target.variant].join('/');
    const key = [id, target.viewport, target.artifactHash].join('|');
    assert.equal(item.sourceResponseSha256, capture.captures[key]);
    const url = new URL('/api/ia/r3-qa/artifact', origin);
    url.search = new URLSearchParams({id, width: target.viewport, version, artifactHash: target.artifactHash});
    const response = await serveDeliveredQaArtifact(new Request(url), env);
    assert.equal(response.status, 200, key);
    const projected = await response.json();
    const record = await release27.rawRecordKey(key);
    // The delivery envelope adds provenance/replay metadata. Every property of
    // the captured response retains its original order and exact byte digest.
    const original = Object.fromEntries(record.propertyOrder.map(name => [name, projected[name]]));
    assert.equal(digest(JSON.stringify(original)), item.sourceResponseSha256, key);
    assert.equal(projected.archivedSource.commit, capture.commit);
    assert.equal(projected.archivedSource.tree, capture.tree);
    assert.equal(await isDeliveredReviewTarget(target, item.release, env, origin), true, key);
    if (target.artifactHash === 'a88c8035b29c0cf1f9991b667b5be273a33a2e072b0600b12d36f81380b1711a') {
      assert.match(original.html, /<title>단가표 · 소비자 판매가<\/title>/);
      assert.equal(original.application, undefined);
      fixedPrice = item;
    }
  }
  for (const item of capture.targetChecks) await verify(item);
  assert.ok(fixedPrice);
  await verify(fixedPrice, 'current');
  await verify(capture.targetChecks[0], 'current');
  for (const target of [
    {...fixedPrice.target, viewport: 319},
    {...fixedPrice.target, artifactHash: '0'.repeat(64)},
    {...fixedPrice.target, mode: 'detailed'},
  ]) assert.equal(await isDeliveredReviewTarget(target, 'MSG0585-R3', env, origin), false);
});

test('the published PR31 wrappers and source documents remain bound to their issued URL and bytes', async () => {
  const snapshot = await unpack(new URL('./fixtures/reviewed-227aa.capture.json.gz', import.meta.url));
  assert.equal(snapshot.commit, '089fff674567f08164260517a20b99ce2730d7f6');
  assert.equal(snapshot.tree, '562fd734d8bfec1fdde02cc727225e2c7e051a3f');
  const issued = Object.entries(snapshot.captures);
  assert.equal(issued.length, 1240);
  const families = new Set();
  for (const [key, digest] of issued) {
    const [id, w, hash] = key.split('|'), width = Number(w);
    assert.ok(await isDeliveredReviewedTarget(id,width,hash,env,origin),key);
    if (width !== 390) continue;
    const [screen,state,variant] = id.split('/');
    families.add(id);
    const request = new URL('/api/ia/r3-qa/artifact',origin);
    request.search = new URLSearchParams({id,width,version:'recorded',artifactHash:hash});
    const response = await serveDeliveredQaArtifact(new Request(request),env);
    assert.equal(response.status,200,key);
    const replay = await response.json();
    const {propertyOrder} = await release31.rawRecordKey(key);
    const original = Object.fromEntries(propertyOrder.map(field => [field,replay[field]]));
    assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),digest,key);
    assert.equal(replay.archivedSource.commit,snapshot.commit);
    assert.ok(await isDeliveredReviewTarget({screen,state,variant,viewport:width,artifactHash:hash},'MSG0585-R3',env,origin),key);
  }
  assert.equal(families.size,122);
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
