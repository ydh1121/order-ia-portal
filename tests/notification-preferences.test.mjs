import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProductOperations} from '../src/server/product-operations.mjs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';

const now = '2026-11-23T05:00:00.000Z';
const off = () => ({price: false, news: false, benefits: false});
const command = (preferences = off(), expectedRevision = 0) => ({action: 'update', expectedRevision, requestKey: crypto.randomUUID(), preferences});
function workspace(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const name of ['0017_product_operations', '0018_notification_preferences']) sqlite.exec(readFileSync(new URL('../migrations/' + name + '.sql', import.meta.url), 'utf8'));
  const prepare = (query, params = []) => ({query, params, bind: (...args) => prepare(query, args), first: async () => sqlite.prepare(query).get(...params) || null,
    all: async () => ({results: sqlite.prepare(query).all(...params)}), run: async () => ({meta: {changes: Number(sqlite.prepare(query).run(...params).changes)}})});
  const db = {prepare, async batch(statements) {sqlite.exec('BEGIN'); try {const result = statements.map(statement => ({meta: {changes: Number(sqlite.prepare(statement.query).run(...statement.params).changes)}})); sqlite.exec('COMMIT'); return result;} catch (error) {sqlite.exec('ROLLBACK'); throw error;}}};
  async function request(actorId = 'alice', body, method = body ? 'POST' : 'GET') {
    const request = new Request('https://product.test/api/ia/product/notification-preferences', {method, ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
    const result = await handleProductOperations({request, env: {ORDER_PRODUCT_DB: db}, actor: actorId ? {id: actorId, role: 'BUSINESS'} : null, path: '/notification-preferences', clock: () => now});
    return {status: result.status, body: await result.json()};
  }
  return {sqlite, request};
}

test('notification consent GET defaults to off without creating rows or commercial permissions', async t => {
  const w = workspace(t);
  assert.deepEqual(await w.request(), {status: 200, body: {revision: 0, preferences: off(), updatedAt: null, delivery: {webPush: false}}});
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_notification_preference').get().n, 0);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_operation_event').get().n, 0);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_account').get().n, 0);
});

test('explicit consent updates are atomic, revision checked, idempotent and private to the actor', async t => {
  const w = workspace(t), body = command({price: true, news: false, benefits: true});
  const saved = await w.request('alice', body);
  assert.deepEqual(saved, {status: 200, body: {revision: 1, preferences: body.preferences, updatedAt: now, delivery: {webPush: false}}});
  assert.deepEqual(await w.request('alice', body), saved);
  assert.deepEqual(await w.request('alice'), saved);
  assert.deepEqual((await w.request('bob')).body.preferences, off());
  assert.equal((await w.request('alice', {...body, preferences: off()})).body.error, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await w.request('alice', command(off()))).body.error, 'REVISION_CONFLICT');
  const second = await w.request('alice', command(off(), 1)); assert.equal(second.status, 200); assert.equal(second.body.revision, 2);
  const bob = await w.request('bob', {...body, preferences: {price: false, news: true, benefits: false}}); assert.equal(bob.status, 200); assert.equal(bob.body.revision, 1);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_operation_event WHERE actor_id=?').get('alice').n, 2);
  const audit = w.sqlite.prepare('SELECT kind,entity_id,request_hash FROM order_operation_event WHERE actor_id=? AND request_key=?').get('alice', body.requestKey);
  assert.equal(audit.kind, 'notification-preference'); assert.equal(audit.entity_id, 'alice'); assert.match(audit.request_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual((await w.request('alice')).body.preferences, off());
});

test('concurrent consent changes cannot overwrite another confirmed revision', async t => {
  const w = workspace(t), outcomes = await Promise.all([w.request('alice', command({price: true, news: false, benefits: false})), w.request('alice', command({price: false, news: true, benefits: false}))]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
  const accepted = outcomes.find(result => result.status === 200);
  assert.deepEqual((await w.request('alice')).body, accepted.body);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_operation_event').get().n, 1);
});

test('unknown fields, malformed consent, missing actors and withdrawn accounts cannot save', async t => {
  const w = workspace(t);
  for (const preferences of [null, [], {price: true, news: false}, {price: 1, news: false, benefits: false}, {...off(), actor: 'bob'}]) {
    const result = await w.request('alice', command(preferences)); assert.equal(result.status, 400, JSON.stringify(result));
  }
  for (const patch of [{actorId: 'bob'}, {action: 'subscribe'}, {expectedRevision: -1}, {requestKey: ''}]) assert.equal((await w.request('alice', {...command(), ...patch})).status, 400);
  assert.equal((await w.request(null, command())).status, 403);
  assert.equal((await w.request('alice', undefined, 'DELETE')).status, 405);
  w.sqlite.prepare('INSERT INTO order_account VALUES(?,1,?,?,?)').run('alice', 'WITHDRAWN', '{}', now);
  assert.equal((await w.request('alice')).body.error, 'ACCOUNT_WITHDRAWN'); assert.equal((await w.request('alice', command())).status, 403);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_notification_preference').get().n, 0);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_operation_event').get().n, 0);
});

test('migration rejects missing or nonboolean consent fields without seeding data', t => {
  const w = workspace(t), insert = w.sqlite.prepare('INSERT INTO order_notification_preference VALUES(?,1,?,?)');
  for (const invalid of [{}, {price: false, news: false}, {price: 0, news: false, benefits: false}, {price: null, news: false, benefits: false}]) assert.throws(() => insert.run('alice', JSON.stringify(invalid), now), /CHECK constraint failed/);
  assert.equal(w.sqlite.prepare('SELECT count(*) n FROM order_notification_preference').get().n, 0);
});

test('authenticated personal endpoint permits a member without business grants and enforces token-bound CSRF', async t => {
  const w = signedWorkspace(); t.after(() => w.db.close());
  const path = '/api/ia/product/notification-preferences';
  assert.equal(w.db.prepare('SELECT count(*) n FROM r3_membership WHERE actor_id=?').get('personal-member').n, 0);
  const initial = await w.request('personal-member', path); assert.equal(initial.status, 200); assert.deepEqual((await initial.json()).preferences, off());
  const denied = await w.request('personal-member', path, command({price: true, news: false, benefits: false}), {csrf: 'incorrect'}); assert.equal(denied.status, 403);
  assert.equal(w.db.prepare('SELECT count(*) n FROM order_notification_preference').get().n, 0);
  const body = command({price: true, news: false, benefits: false}), saved = await w.request('personal-member', path, body);
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json())); assert.equal((await saved.json()).revision, 1);
  assert.deepEqual((await (await w.request('another-member', path)).json()).preferences, off());
  assert.equal(w.db.prepare('SELECT count(*) n FROM r3_membership WHERE actor_id=?').get('personal-member').n, 0);
});
