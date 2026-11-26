// Native-renderer fixture only. No real permission, service worker, API or
// provider is reachable from this isolated page.
import {mountResearchNotifications} from '../../src/server/research-app/notifications.mjs';
import {researchNotificationsCss} from '../../src/server/research-app/notifications-style.mjs';
import {productFontCss} from '../../src/server/product-fonts.mjs';
import {createCommonMotion} from '../../src/server/r3-common-motion.mjs';

const style = document.createElement('style');
style.textContent = productFontCss + researchNotificationsCss + `
  *{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#f5f4f1;color:#252820;font-family:Pretendard,sans-serif}
  main{margin:auto;max-width:560px;padding:24px;background:#fff;border-radius:24px}
  .fixture-label{margin:0 auto 16px;max-width:560px;font-size:12px;color:#65685f}
  button,select,input{font:inherit}@media(max-width:480px){main{padding:20px 16px}}
`;
document.head.append(style);
// Product pages install this shared owner before mounting their controls.
// Include its real track/thumb paint in the isolated renderer as well.
createCommonMotion(window);
const mode = new URL(location.href).searchParams.get('mode') === 'qa-fixture' ? 'qa-fixture' : 'product';
const trace = window.notificationFixture = {mode, calls: [], clicks: [], permission: 0, register: 0, subscribe: 0, unsubscribe: 0, deviceReads: 0, storage: 0, ready: false};
const copy = value => JSON.parse(JSON.stringify(value));
const publicKey = btoa(String.fromCharCode(4, ...Array(64).fill(7))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const auth = btoa(String.fromCharCode(...Array(16).fill(1))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
let permission = 'default', subscription = null, registered = false;
const value = {endpoint: 'https://fcm.googleapis.com/fcm/send/isolated-ui-fixture', expirationTime: null, keys: {p256dh: publicKey, auth}};
Object.defineProperty(window, 'Notification', {configurable: true, value: {
  get permission() {return permission;}, requestPermission() {trace.permission++; permission = 'granted'; return Promise.resolve(permission);}
}});
Object.defineProperty(window, 'PushManager', {configurable: true, value: function() {}});
const registration = {active: {scriptURL: location.origin + '/order-notifications-sw.js'}, pushManager: {
  async getSubscription() {trace.deviceReads++; return subscription;},
  async subscribe(options) {
    trace.subscribe++; if (options.userVisibleOnly !== true) throw Error('USER_VISIBLE_ONLY_REQUIRED');
    subscription = {...value, options, toJSON: () => copy(value), async unsubscribe() {trace.unsubscribe++; subscription = null; return true;}};
    return subscription;
  }
}};
Object.defineProperty(navigator, 'serviceWorker', {configurable: true, value: {
  async getRegistration() {trace.deviceReads++; return registered ? registration : null;},
  async register(path, options) {
    if (path !== '/order-notifications-sw.js' || options.scope !== '/') throw Error('UNEXPECTED_WORKER');
    trace.register++; registered = true; return registration;
  }, ready: Promise.resolve(registration)
}});
for (const method of ['getItem', 'setItem', 'removeItem']) {
  const original = Storage.prototype[method];
  Storage.prototype[method] = function(...args) {trace.storage++; return original.apply(this, args);};
}
const config = {available: true, publicKey, serviceWorker: '/order-notifications-sw.js', registrations: []};
const preferences = {revision: 0, updatedAt: null, preferences: {price: false, news: false, benefits: false}, delivery: {webPush: false}};
const createdAt = new Date(Date.now() - 600000).toISOString();
const items = [{id: 'fixture-price', revision: 1, readAt: null, createdAt, title: '공급 단가가 변경됐어요', body: '예시 상품의 승인 단가가 적용됐어요. 단가표에서 변경 내용을 확인해 주세요.', category: 'price'}];
const adapter = {context: {mode, actor: {id: 'native-fixture-member', authenticated: true}}, async request(path, body) {
  trace.calls.push({path, body: body ? copy(body) : null});
  if (path === '/notification-preferences') {
    if (body) {preferences.revision++; preferences.updatedAt = new Date().toISOString(); preferences.preferences = copy(body.preferences);}
    return copy(preferences);
  }
  if (path === '/notifications') {
    if (!body) return {items: copy(items)};
    const item = items.find(row => row.id === body.id); if (!item || body.action !== 'read') throw Error('BAD_FIXTURE_COMMAND');
    item.readAt = new Date().toISOString(); item.revision++; return {id: item.id, revision: item.revision, readAt: item.readAt};
  }
  if (path !== '/notification-push' || mode !== 'product') throw Error('UNEXPECTED_DEVICE_API');
  if (!body) return copy(config);
  const id = body.id || Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.subscription.endpoint))), value => value.toString(16).padStart(2, '0')).join('');
  const result = {id, revision: body.expectedRevision + 1, active: body.action === 'subscribe', updatedAt: new Date().toISOString(), expiresAt: null, keyCurrent: true};
  config.registrations = [...config.registrations.filter(row => row.id !== id), result];
  return copy(result);
}};
document.addEventListener('click', event => trace.clicks.push({trusted: event.isTrusted, tag: event.target.tagName,
  preference: event.target.dataset.notificationPreference || null, device: event.target.hasAttribute('data-notification-push-toggle')}), true);
const label = document.createElement('p'); label.className = 'fixture-label';
label.textContent = mode === 'product' ? '제품 공용 컴포넌트 · 권한 및 응답 fixture' : 'QA fixture · 실제 기기 알림 미등록'; document.body.append(label);
const main = document.createElement('main'); document.body.append(main);
const dispose = mountResearchNotifications({container: main, adapter, mode: 'full'});
window.disposeNotificationFixture = dispose;
await dispose.ready;
await document.fonts.ready;
trace.ready = true;
