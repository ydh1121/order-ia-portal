import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signedWorkspace, issueExampleQuote} from './r3-business-identities.fixture.mjs';
import {pushBase64, pushDigest} from '../src/server/notification-push-crypto.mjs';
import {deliverNotificationOutbox, processNotificationWork, scheduleNotificationWork} from '../src/server/notification-push.mjs';
import {materializePriceNotifications} from '../src/server/notification-price-events.mjs';

const command = (action, expectedRevision = 0, extra = {}) => ({action, expectedRevision, requestKey: crypto.randomUUID(), ...extra});
async function fixture(t) {
  const w = signedWorkspace(); t.after(() => w.db.close());
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  Object.assign(w.env, {ORDER_WEB_PUSH_ENABLED: 'true', ORDER_WEB_PUSH_PUBLIC_KEY: pushBase64(await crypto.subtle.exportKey('raw', pair.publicKey)),
    ORDER_WEB_PUSH_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), ORDER_WEB_PUSH_SUBJECT: 'mailto:push-test@example.invalid'});
  const client = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const subscription = {endpoint: 'https://fcm.googleapis.com/fcm/send/' + crypto.randomUUID(), expirationTime: null,
    keys: {p256dh: pushBase64(await crypto.subtle.exportKey('raw', client.publicKey)), auth: pushBase64(crypto.getRandomValues(new Uint8Array(16)))}};
  const subscribe = (who = 'personal-member', value = subscription, revision = 0) => command('subscribe', revision, {subscription: value, consent: 'granted', applicationServerKey: w.env.ORDER_WEB_PUSH_PUBLIC_KEY});
  const request = async (who, body, csrf) => {const r = await w.request(who, '/api/ia/product/notification-push', body, csrf ? {csrf} : {}); return {status: r.status, body: await r.json()};};
  const consent = async (who, preferences = {price: false, news: true, benefits: false}, revision = 0) => {
    const r = await w.request(who, '/api/ia/product/notification-preferences', command('update', revision, {preferences})); assert.equal(r.status, 200, await r.clone().text()); return r.json();
  };
  const register = async (who = 'personal-member', value = subscription) => {const result = await request(who, subscribe(who, value)); assert.equal(result.status, 200, JSON.stringify(result)); return result.body;};
  const enqueue = (who = 'personal-member', id = crypto.randomUUID(), data = {category: 'news', title: '비공개 계정 이름', body: '비공개 사업장·가격 정보'}, now = new Date(Date.now() + 1000).toISOString()) => {
    w.db.prepare('INSERT INTO order_notification(id,actor_id,revision,data_json,created_at) VALUES(?,?,1,?,?)').run(id, who, JSON.stringify(data), now); return {id, now};
  };
  return {...w, rawRequest: w.request, store: w.env.ORDER_QA_DB, subscription, subscribe, request, consent, register, enqueue};
}

test('read does not subscribe; own explicit registration is idempotent, CSRF protected and actor private', async t => {
  const f = await fixture(t), initial = await f.request('personal-member');
  assert.equal(initial.status, 200); assert.equal(initial.body.available, true); assert.deepEqual(initial.body.registrations, []);
  assert.equal(JSON.stringify(initial).includes(JSON.parse(f.env.ORDER_WEB_PUSH_PRIVATE_JWK).d), false);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_subscription').get().n, 0);
  const body = f.subscribe(); assert.equal((await f.request('personal-member', body, 'wrong')).status, 403);
  const saved = await f.request('personal-member', body); assert.equal(saved.status, 200); assert.equal(saved.body.active, true);
  assert.deepEqual(await f.request('personal-member', body), saved);
  assert.equal((await f.request('another-member', f.subscribe('another-member'))).body.error, 'PUSH_SUBSCRIPTION_BOUND');
  assert.deepEqual((await f.request('another-member')).body.registrations, []);
  assert.equal((await f.request('personal-member', {...body, consent: 'denied'})).body.error, 'IDEMPOTENCY_CONFLICT');
  const preferences = (await f.request('personal-member')).body;
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_operation_event WHERE kind=?').get('notification-push').n, 1);
  assert.equal(preferences.registrations.length, 1); assert.equal('endpoint' in preferences.registrations[0], false);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_notification_preference').get().n, 0, 'device permission does not imply price/news/benefits consent');
});

test('unconfigured service and invalid subscriptions never store capabilities or alter preferences', async t => {
  const f = await fixture(t);
  for (const patch of [{consent: 'denied'}, {actorId: 'another'}, {applicationServerKey: 'wrong'}, {subscription: {...f.subscription, endpoint: 'https://127.0.0.1/admin'}}, {subscription: {...f.subscription, keys: {p256dh: 'x', auth: 'y'}}}]) assert.equal((await f.request('personal-member', {...f.subscribe(), ...patch})).status, 400);
  f.env.ORDER_WEB_PUSH_ENABLED = 'false';
  assert.equal((await f.request('personal-member')).body.available, false);
  assert.equal((await f.request('personal-member', f.subscribe())).body.error, 'PUSH_NOT_CONFIGURED');
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_subscription').get().n, 0);
  assert.equal((await f.request('personal-member', undefined)).status, 200);
  const blocked = await f.request('buyer', command('unsubscribe', 1, {id: await pushDigest(f.subscription.endpoint)})); assert.equal(blocked.status, 404);
});

test('only new consented notices enqueue; subscribe, migration and enabling later never backfill history', async t => {
  const f = await fixture(t); await f.consent('personal-member');
  f.enqueue('personal-member', 'before-device'); await f.register();
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_delivery').get().n, 0);
  f.enqueue('personal-member', 'after-device'); assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_delivery').get().n, 1);
  f.enqueue('another-member', 'other-actor');
  f.enqueue('personal-member', 'price-not-consented', {category: 'price', title: '가격', body: '가격'});
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_delivery').get().n, 1);
  await f.consent('personal-member', {price: true, news: true, benefits: false}, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_delivery').get().n, 1);
});

test('unsubscribe and consent withdrawal cancel pending delivery and cannot revoke another person', async t => {
  const f = await fixture(t); await f.consent('personal-member'); const saved = await f.register(); const notice = f.enqueue();
  assert.equal((await f.request('another-member', command('unsubscribe', 1, {id: saved.id}))).body.error, 'PUSH_SUBSCRIPTION_BOUND');
  await f.consent('personal-member', {price: false, news: false, benefits: false}, 1);
  assert.equal(f.db.prepare('SELECT state FROM order_push_delivery').get().state, 'cancelled');
  const body = command('unsubscribe', 1, {id: saved.id}), result = await f.request('personal-member', body); assert.equal(result.body.active, false);
  assert.deepEqual(await f.request('personal-member', body), result);
  const row = f.db.prepare('SELECT * FROM order_push_subscription').get(); assert.equal(row.endpoint, null); assert.equal(row.auth, null); assert.equal(row.active, 0);
  let sends = 0; const run = await deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher: async () => {sends++; return new Response(null, {status: 201});}});
  assert.equal(sends, 0); assert.equal(run.attempted, 0);
});

test('account withdrawal revokes device capabilities and all pending sends', async t => {
  const f = await fixture(t); await f.consent('personal-member'); await f.register(); const notice = f.enqueue();
  f.db.prepare('INSERT INTO order_account VALUES(?,1,?,?,?)').run('personal-member', 'ACTIVE', '{}', notice.now);
  f.db.prepare("UPDATE order_account SET state='WITHDRAWN',revision=2 WHERE actor_id=?").run('personal-member');
  assert.equal(f.db.prepare('SELECT active FROM order_push_subscription').get().active, 0);
  assert.equal(f.db.prepare('SELECT state FROM order_push_delivery').get().state, 'cancelled');
  assert.equal((await f.request('personal-member', f.subscribe())).status, 403);
});

test('concurrent drains send a notice once and record provider acceptance without changing read state', async t => {
  const f = await fixture(t); await f.consent('personal-member'); await f.register(); const notice = f.enqueue();
  const calls = [], fetcher = async (url, settings) => {calls.push({url, settings}); await new Promise(resolve => setImmediate(resolve)); return new Response(null, {status: 201});};
  const results = await Promise.all([deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher}), deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher})]);
  assert.equal(calls.length, 1); assert.equal(results.reduce((n, r) => n + r.accepted, 0), 1);
  assert.equal(calls[0].settings.redirect, 'error'); assert.equal(calls[0].settings.headers['Content-Encoding'], 'aes128gcm');
  assert.match(calls[0].settings.headers.Authorization, /^vapid t=/); assert.match(calls[0].settings.headers.Topic, /^[a-f0-9]{32}$/);
  assert.equal(Buffer.from(calls[0].settings.body).includes(Buffer.from('비공개')), false);
  assert.equal(f.db.prepare('SELECT state FROM order_push_delivery').get().state, 'accepted');
  assert.equal(f.db.prepare('SELECT read_at FROM order_notification').get().read_at, null);
  await deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher}); assert.equal(calls.length, 1);
});

test('provider rate limit/backoff retries reuse the topic; gone endpoints purge keys and cancel pending sends', async t => {
  const f = await fixture(t); await f.consent('personal-member'); await f.register(); const notice = f.enqueue();
  const topics = [], rateLimited = async (_url, options) => {topics.push(options.headers.Topic); return new Response(null, {status: 429, headers: {'Retry-After': '120'}});};
  assert.equal((await deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher: rateLimited})).retry, 1);
  const queued = f.db.prepare('SELECT * FROM order_push_delivery').get(); assert.equal(Date.parse(queued.next_attempt_at) - Date.parse(notice.now), 120000);
  await deliverNotificationOutbox(f.store, f.env, {now: notice.now, fetcher: rateLimited}); assert.equal(topics.length, 1);
  const accepted = async (_url, options) => {topics.push(options.headers.Topic); return new Response(null, {status: 201});};
  await deliverNotificationOutbox(f.store, f.env, {now: queued.next_attempt_at, fetcher: accepted}); assert.equal(topics[0], topics[1]);
  const next = f.enqueue('personal-member', 'gone', undefined, new Date(Date.parse(queued.next_attempt_at) + 1).toISOString());
  await deliverNotificationOutbox(f.store, f.env, {now: next.now, fetcher: async () => new Response(null, {status: 410})});
  const subscription = f.db.prepare('SELECT * FROM order_push_subscription').get(); assert.equal(subscription.active, 0); assert.equal(subscription.endpoint, null); assert.equal(subscription.p256dh, null); assert.equal(subscription.auth, null);
  assert.equal(f.db.prepare('SELECT state,last_error FROM order_push_delivery WHERE notification_id=?').get('gone').last_error, 'SUBSCRIPTION_EXPIRED');
});

test('provider rejection is terminal and a timeout is not claimed as delivery', async t => {
  const f = await fixture(t); await f.consent('personal-member'); await f.register(); const first = f.enqueue('personal-member', 'reject');
  await deliverNotificationOutbox(f.store, f.env, {now: first.now, fetcher: async () => new Response(null, {status: 403})});
  assert.deepEqual({...f.db.prepare('SELECT state,last_error,accepted_at FROM order_push_delivery').get()}, {state: 'failed', last_error: 'PROVIDER_REJECTED', accepted_at: null});
  const second = f.enqueue('personal-member', 'timeout');
  await deliverNotificationOutbox(f.store, f.env, {now: second.now, fetcher: async () => {throw Error('transport failed');}});
  assert.deepEqual({...f.db.prepare('SELECT state,last_error,accepted_at FROM order_push_delivery WHERE notification_id=?').get('timeout')}, {state: 'retry', last_error: 'PROVIDER_UNCONFIRMED', accepted_at: null});
});

test('new approved effective supplier prices notify only opted-in eligible roles and do not replay old approvals', async t => {
  const f = await fixture(t), price = {price: true, news: false, benefits: false};
  for (const actor of ['buyer', 'buyer2', 'supplier', 'operator', 'personal-member']) await f.consent(actor, price);
  await f.register('buyer'); await issueExampleQuote({...f, request: f.rawRequest});
  const now = new Date(Date.now() + 1000).toISOString(); assert.equal(f.db.prepare('SELECT count(*) n FROM order_notification_price_event').get().n, 1);
  await materializePriceNotifications(f.store, now); await materializePriceNotifications(f.store, now);
  const notices = f.db.prepare("SELECT actor_id,data_json FROM order_notification WHERE json_extract(data_json,'$.category')='price' ORDER BY actor_id").all();
  assert.deepEqual(notices.map(row => row.actor_id), ['buyer', 'operator', 'supplier']);
  assert.equal(JSON.parse(notices[0].data_json).source.kind, 'approved-price');
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_push_delivery').get().n, 1);
  f.db.prepare("UPDATE r3_membership SET active=0 WHERE actor_id='buyer'").run();
  let sends = 0; await deliverNotificationOutbox(f.store, f.env, {now, fetcher: async () => {sends++; return new Response(null, {status: 201});}});
  assert.equal(sends, 0); assert.equal(f.db.prepare('SELECT state FROM order_push_delivery').get().state, 'cancelled');
  f.db.exec('DROP TRIGGER order_notification_new_price; DROP TABLE order_notification_price_event;');
  f.db.exec(readFileSync(new URL('../migrations/0019_notification_push.sql', import.meta.url), 'utf8'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_notification_price_event').get().n, 0, 'migration never backfills historical price approvals');
});

test('future or stale price events cannot create early or bulk late alerts, and owner drain is protected', async t => {
  const f = await fixture(t); await f.consent('buyer', {price: true, news: false, benefits: false}); await issueExampleQuote({...f, request: f.rawRequest});
  const future = new Date(Date.now() + 86400000).toISOString(), current = new Date().toISOString();
  f.db.prepare('UPDATE order_notification_price_event SET available_at=?').run(future);
  assert.deepEqual(await materializePriceNotifications(f.store, current), {processed: 0, cancelled: 0});
  f.db.prepare('UPDATE order_notification_price_event SET available_at=?').run(new Date(Date.now() - 2 * 86400000).toISOString());
  const result = await materializePriceNotifications(f.store, current); assert.equal(result.cancelled, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM order_notification WHERE json_extract(data_json,'$.category')='price'").get().n, 0);
  const deniedAdmin = await f.rawRequest('buyer', '/api/ia/product/notification-push/drain', command('drain'));
  assert.equal(deniedAdmin.status, 403);
  assert.equal(scheduleNotificationWork(f.env, undefined), false, 'no untracked outbound work without the Pages lifetime');
  const withoutProvider = {...f.env, ORDER_WEB_PUSH_ENABLED: 'false'}; const safe = await processNotificationWork(withoutProvider, {now: current, fetcher: async () => {throw Error('must not send');}});
  assert.equal(safe.push.configured, false); assert.equal(safe.push.attempted, 0);
});
