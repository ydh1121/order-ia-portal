import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto, createHash} from 'node:crypto';
import {mountNotificationPush} from '../src/server/research-app/notification-push-ui.mjs';
import {notificationSettingsBootstrap} from '../src/server/notification-settings-bootstrap.mjs';

const {JSDOM} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, label) {const end = Date.now() + 2000; while (!predicate() && Date.now() < end) await tick(); assert.ok(predicate(), label);}
const copy = value => JSON.parse(JSON.stringify(value));

async function fixture(t, {mode = 'product', permission = 'default', failFirst = false} = {}) {
  const dom = new JSDOM('<main></main>', {url: 'https://product.invalid/ia?view=product-r3', pretendToBeVisual: true, runScripts: 'outside-only'}), w = dom.window;
  Object.defineProperty(w, 'isSecureContext', {value: true}); Object.defineProperty(w, 'crypto', {value: webcrypto}); w.TextEncoder = TextEncoder;
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
  const calls = [], browser = {permission: 0, register: 0, subscribe: 0, unsubscribe: 0, reads: 0};
  let currentPermission = permission, subscription = null, posts = 0;
  w.Notification = {get permission() {return currentPermission;}, requestPermission: () => {browser.permission++; currentPermission = permission === 'denied' ? 'denied' : 'granted'; return Promise.resolve(currentPermission);}};
  w.PushManager = function() {};
  const value = {endpoint: 'https://fcm.googleapis.com/fcm/send/ui-test', expirationTime: null, keys: {p256dh: publicKey, auth: Buffer.alloc(16, 1).toString('base64url')}};
  const makeSubscription = () => ({...value, options: {applicationServerKey: Buffer.from(publicKey, 'base64url')}, toJSON: () => copy(value), async unsubscribe() {browser.unsubscribe++; subscription = null; return true;}});
  const registration = {active: {scriptURL: 'https://product.invalid/order-notifications-sw.js'}, pushManager: {
    async getSubscription() {browser.reads++; return subscription;}, async subscribe(options) {browser.subscribe++; assert.equal(options.userVisibleOnly, true); assert.deepEqual(Buffer.from(options.applicationServerKey), Buffer.from(publicKey, 'base64url')); subscription = makeSubscription(); return subscription;}
  }};
  Object.defineProperty(w.navigator, 'serviceWorker', {value: {async getRegistration() {browser.reads++; return registration;}, async register() {browser.register++; return registration;}, ready: Promise.resolve(registration)}});
  const config = {available: true, publicKey, serviceWorker: '/order-notifications-sw.js', registrations: []};
  const adapter = {context: {mode, actor: {id: 'alice', authenticated: true}}, async request(path, body) {
    calls.push({path, body: body ? copy(body) : null}); assert.equal(path, '/notification-push'); if (!body) return copy(config);
    posts++; if (failFirst && posts === 1) throw Error('NETWORK_FAILED');
    const id = body.id || createHash('sha256').update(body.subscription.endpoint).digest('hex');
    const result = {id, revision: body.expectedRevision + 1, active: body.action === 'subscribe', updatedAt: new Date().toISOString(), expiresAt: null, keyCurrent: true};
    config.registrations = [...config.registrations.filter(item => item.id !== id), result]; return copy(result);
  }};
  const container = w.document.querySelector('main'), dispose = mountNotificationPush({container, adapter});
  t.after(() => {dispose(); w.close();}); await dispose.ready;
  const button = () => container.querySelector('[data-notification-push-toggle]'), state = () => container.querySelector('[data-notification-push]').dataset.pushState;
  return {w, container, adapter, calls, browser, config, button, state, dispose};
}

test('device permission is requested only by the explicit product click, separate from reading preferences', async t => {
  const f = await fixture(t); assert.equal(f.calls.length, 1); assert.equal(f.browser.permission, 0); assert.equal(f.browser.subscribe, 0); assert.equal(f.browser.register, 0);
  assert.equal(f.state(), 'off'); f.button().click(); assert.equal(f.browser.permission, 1, 'requestPermission is invoked in the click turn');
  await until(() => f.state() === 'registered', 'server acknowledges device registration');
  assert.equal(f.browser.subscribe, 1); assert.equal(f.calls.filter(c => c.body).length, 1);
  assert.equal(f.calls[1].body.consent, 'granted'); assert.equal(f.calls.some(c => c.path === '/notification-preferences'), false);
  f.button().click(); await until(() => f.state() === 'off', 'explicit device disconnect is acknowledged');
  assert.equal(f.browser.unsubscribe, 1); assert.equal(f.browser.permission, 1); assert.equal(f.calls.at(-1).body.action, 'unsubscribe');
});

test('denied permission does not register a service worker, create a subscription or post consent', async t => {
  const f = await fixture(t, {permission: 'denied'}); assert.equal(f.state(), 'denied'); assert.equal(f.button().disabled, true);
  f.button().click(); await tick(); assert.equal(f.browser.permission, 0); assert.equal(f.browser.subscribe, 0); assert.equal(f.browser.register, 0); assert.equal(f.calls.filter(c => c.body).length, 0);
});

test('disposing the view while permission is pending does not create an orphan subscription', async t => {
  const f = await fixture(t); let finish;
  f.w.Notification.requestPermission = () => {f.browser.permission++; return new Promise(resolve => {finish = resolve;});};
  f.button().click(); assert.equal(f.browser.permission, 1); f.dispose(); finish('granted'); await tick(); await tick();
  assert.equal(f.browser.register, 0); assert.equal(f.browser.subscribe, 0); assert.equal(f.calls.filter(c => c.body).length, 0);
});

test('research fixture and isolated lab never touch browser permission, subscriptions, device storage or real push APIs', async t => {
  for (const mode of ['qa-fixture', 'lab', 'research-fixture']) {
    const f = await fixture(t, {mode}); assert.equal(f.state(), 'review'); assert.equal(f.button().disabled, true);
    f.button().click(); await tick(); assert.deepEqual(f.calls, []); assert.deepEqual(f.browser, {permission: 0, register: 0, subscribe: 0, unsubscribe: 0, reads: 0});
    assert.equal(f.w.localStorage.length, 0);
  }
});

test('failed acknowledgement retains the browser subscription and retries the same idempotency key', async t => {
  const f = await fixture(t, {failFirst: true}); f.button().click();
  await until(() => f.calls.filter(c => c.body).length === 1 && !f.button().disabled, 'failed write retains a retry');
  assert.equal(f.state(), 'off'); assert.match(f.container.textContent, /연결을 확인하지 못했어요/);
  const first = f.calls.find(c => c.body).body; f.button().click(); await until(() => f.state() === 'registered', 'retried acknowledgement');
  assert.equal(f.browser.subscribe, 1); assert.equal(f.browser.permission, 1);
  const writes = f.calls.filter(c => c.body); assert.deepEqual(writes[1].body, first);
});

test('the product bootstrap mounts the same consent and push functions with all dependencies intact', async t => {
  const f = await fixture(t, {mode: 'qa-fixture'}); f.dispose();
  f.w.eval(notificationSettingsBootstrap());
  const adapter = {context: {mode: 'qa-fixture', actor: {id: 'qa', authenticated: true}}, request: async path => {
    assert.equal(path, '/notification-preferences'); return {revision: 0, updatedAt: null, preferences: {price: false, news: false, benefits: false}, delivery: {webPush: false}};
  }};
  const dispose = f.w.ORDER_NOTIFICATION_SETTINGS.mount({container: f.container, adapter}); t.after(dispose); await dispose.ready;
  assert.equal(f.container.querySelectorAll('[data-notification-preference]').length, 3);
  assert.equal(f.container.querySelector('[data-notification-push]').dataset.pushState, 'review');
  assert.equal(f.browser.permission, 0); assert.equal(f.browser.subscribe, 0);
});

test('service worker deduplicates visible retries and opens only the authenticated product inbox', async () => {
  const handlers = {}, shown = [], opened = [], records = new Map(), cache = {
    async match(key) {return records.get(key.url);}, async put(key, value) {records.set(key.url, value);}, async delete(key) {return records.delete(key.url);}, async keys() {return [...records.keys()].map(key => new Request(key));}
  };
  const self = {location: {origin: 'https://product.invalid'}, addEventListener: (type, handler) => {handlers[type] = handler;},
    skipWaiting: async () => {}, registration: {showNotification: async (title, options) => shown.push({title, options})}, clients: {claim: async () => {}, matchAll: async () => [], openWindow: async url => opened.push(url)}};
  const context = vm.createContext({self, caches: {open: async () => cache}, Request, Response, URL, Promise, Set});
  vm.runInContext(await readFile(new URL('../public/order-notifications-sw.js', import.meta.url), 'utf8'), context);
  const payload = {version: 1, id: 'a'.repeat(32), title: '오더 · 시세 알림', body: '새 알림이 있어요.', url: '/ia?view=product-r3&screen=profile&state=notification'};
  async function push(data) {let promise; handlers.push({data: {json: () => data}, waitUntil: value => {promise = value;}}); await promise;}
  await Promise.all([push(payload), push(payload)]); await push(payload); assert.equal(shown.length, 1); assert.equal(shown[0].options.renotify, false); assert.equal(shown[0].options.tag, payload.id);
  await push({...payload, id: 'b'.repeat(32), url: 'https://evil.invalid'}); assert.equal(shown.length, 1);
  let clicked; handlers.notificationclick({notification: {data: {url: payload.url}, close() {}}, waitUntil: value => {clicked = value;}}); await clicked;
  assert.deepEqual(opened, ['https://product.invalid' + payload.url]); assert.equal('fetch' in handlers, false, 'the worker does not intercept API or product requests');
});
