import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountResearchNotifications, formatNotificationTime, notificationCategory} from '../src/server/research-app/notifications.mjs';
import {mountResearchAccountPanel} from '../src/server/research-app/account-panels.mjs';
const {JSDOM} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
const now = Date.parse('2026-11-23T05:00:00Z');
const notice = (index, extra = {}) => ({id: `notice-${index}`, revision: 1, title: `알림 ${index}`, body: `내용 ${index}`, createdAt: new Date(now - index * 60_000).toISOString(), readAt: null, ...extra});
function fixture(items, extra = {}) {
  const dom = new JSDOM('<main></main>', {url: 'https://research.example', pretendToBeVisual: true});
  const container = dom.window.document.querySelector('main'), calls = [], unread = [], openings = [];
  const adapter = {request: async (path, body, signal) => {calls.push({path, body, signal}); return body ? {id: body.id, revision: body.expectedRevision + 1, readAt: new Date(now).toISOString()} : {items};}, ...extra.adapter};
  const dispose = mountResearchNotifications({container, adapter, now: () => now, setUnread: count => unread.push(count), onOpenAll: () => openings.push(true), ...extra});
  return {dom, container, adapter, calls, unread, openings, dispose, close() {dispose(); dom.window.close();}};
}

test('notification labels use the sent time with Korean relative windows and a 24-hour clock', () => {
  assert.equal(formatNotificationTime(new Date(now - 59_000).toISOString(), now).label, '지금');
  assert.equal(formatNotificationTime(new Date(now - 60_000).toISOString(), now).label, '1분 전');
  assert.equal(formatNotificationTime(new Date(now - 3_600_000).toISOString(), now).label, '1시간 전');
  assert.equal(formatNotificationTime(new Date(now - 23 * 3_600_000).toISOString(), now).label, '23시간 전');
  assert.equal(formatNotificationTime('2026-11-22T05:00:00Z', now).label, '14:00');
  const value = formatNotificationTime('2026-11-22T15:05:00Z', now + 86_400_000);
  assert.equal(value.label, '00:05'); assert.match(value.full, /2026.*11.*23.*00:05/); assert.equal(value.iso, '2026-11-22T15:05:00.000Z');
  assert.deepEqual(formatNotificationTime('not-a-date', now), {label: '', full: '', iso: ''});
});

test('account preview shows the three latest two-line messages and only navigates when more is requested', async () => {
  const items = [notice(7), notice(0, {title: '<img src=x onerror=alert(1)>', body: '첫 줄\n둘째 줄'}), notice(4), notice(1, {readAt: '2026-11-23T04:59:59Z'})];
  const f = fixture(items);
  try {
    assert.equal(await f.dispose.ready, true);
    const rows = [...f.container.querySelectorAll('[data-notification-id]')];
    assert.deepEqual(rows.map(row => row.dataset.notificationId), ['notice-0', 'notice-1', 'notice-4']);
    assert.ok(rows.every(row => row.children.length === 2)); assert.equal(f.container.querySelector('img'), null);
    assert.equal(rows[0].querySelector('time').textContent, '지금'); assert.match(rows[1].querySelector('time').title, /^발송 /);
    assert.equal(rows[1].querySelector('time').dateTime, items[3].createdAt);
    assert.deepEqual(f.unread, [3]); assert.equal(f.calls.filter(call => call.body).length, 0);
    assert.equal(f.container.querySelector('[data-action="research-read-notification"]'), null);
    f.container.querySelector('[data-action="research-all-notifications"]').click();
    assert.deepEqual(f.openings, [true]); assert.equal(f.calls.filter(call => call.body).length, 0);
  } finally {f.close();}
});

test('an empty preview still opens the full notification page and its reception settings', async () => {
  const f = fixture([]);
  try {
    assert.equal(await f.dispose.ready, true); assert.match(f.container.textContent, /새 알림이 없어요/);
    f.container.querySelector('[data-action="research-all-notifications"]').click();
    assert.deepEqual(f.openings, [true]); assert.equal(f.calls.filter(call => call.body).length, 0);
  } finally {f.close();}
});

test('notification controls keep unique native identities across preview, full page and list rerenders', async () => {
  const common={title:'같은 알림 제목',body:'같은 알림 내용',createdAt:new Date(now).toISOString()};
  const items=[notice(0,{...common,id:'notice / one'}),notice(1,{...common,id:'notice %2F one'})];
  const f=fixture(items),full=f.dom.window.document.createElement('section');f.dom.window.document.body.append(full);
  const disposeFull=mountResearchNotifications({container:full,adapter:f.adapter,mode:'full',now:()=>now});
  try {
    await Promise.all([f.dispose.ready,disposeFull.ready]);
    const rows=[...f.dom.window.document.querySelectorAll('[data-notification-id]')],identities=rows.map(row=>row.id);
    assert.equal(rows.length,4);assert.ok(identities.every(Boolean),'each repeated control needs its own native identity');
    assert.equal(new Set(identities).size,4,'preview and full page may coexist in the retained application');
    for(const row of rows)assert.equal(f.dom.window.document.getElementById(row.id),row);
    const previewIds=[...f.container.querySelectorAll('[data-notification-id]')].map(row=>row.id),fullIds=[...full.querySelectorAll('[data-notification-id]')].map(row=>row.id);
    const selected=f.container.querySelector('[data-notification-id]');selected.click();await tick();
    f.container.querySelector('[data-action="research-notification-back"]').click();
    assert.deepEqual([...f.container.querySelectorAll('[data-notification-id]')].map(row=>row.id),previewIds,'list return must preserve stored location identities');
    assert.equal(f.dom.window.document.activeElement.id,previewIds[0]);
    const filter=full.querySelector('[data-notification-filter]');filter.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
    assert.deepEqual([...full.querySelectorAll('[data-notification-id]')].map(row=>row.id),fullIds,'an ordinary list repaint must not regenerate identities');
    assert.equal(f.calls.filter(call=>call.body).length,1,'only the explicit notification open marks its own message read');
  } finally {disposeFull();f.close();}
});

test('full page progressively reveals messages and opens a full body before confirming that single read', async () => {
  const items = Array.from({length: 45}, (_, index) => notice(index, index === 21 ? {body: '첫 단락\n\n둘째 단락을 줄 제한 없이 읽어요.'} : {}));
  const f = fixture(items, {mode: 'full'});
  try {
    await f.dispose.ready;
    assert.equal(f.container.querySelector('h1').textContent, '알림');
    assert.equal(f.container.querySelectorAll('[data-notification-id]').length, 20);
    f.container.querySelector('[data-action="research-more-notifications"]').click();
    assert.equal(f.container.querySelectorAll('[data-notification-id]').length, 40);
    assert.equal(f.dom.window.document.activeElement.dataset.notificationId, 'notice-20');
    const row = f.container.querySelector('[data-notification-id="notice-21"]'), sent = row.querySelector('time').dateTime;
    row.click(); await tick();
    const detail = f.container.querySelector('[data-notification-detail="notice-21"]');
    assert.equal(detail.querySelector('.research-notification-body').textContent, items[21].body);
    assert.equal(detail.querySelector('time').dateTime, sent, 'reading must not change the displayed delivery time');
    assert.deepEqual(f.calls.filter(call => call.body).map(call => call.body.id), ['notice-21']);
    assert.deepEqual(f.unread, [45, 44]);
    f.container.querySelector('[data-action="research-notification-back"]').click();
    assert.equal(f.container.querySelector('[data-notification-id="notice-21"]').dataset.read, 'true');
    assert.equal(f.dom.window.document.activeElement.dataset.notificationId, 'notice-21');
    f.container.querySelector('[data-action="research-more-notifications"]').click();
    assert.equal(f.container.querySelectorAll('[data-notification-id]').length, 45);
    assert.equal(f.container.querySelector('[data-action="research-more-notifications"]'), null);
  } finally {f.close();}
});

test('failed or mismatched read responses retain unread state and the identical retry request', async () => {
  let finish; const calls = [], counts = [];
  const f = fixture([notice(0)], {adapter: {request(path, body, signal) {calls.push({path, body, signal}); return body ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({items: [notice(0)]});}}, setUnread: count => counts.push(count)});
  try {
    await f.dispose.ready; const row = f.container.querySelector('[data-notification-id]'); row.click(); row.click();
    assert.equal(calls.filter(call => call.body).length, 1); assert.deepEqual(counts, [1]);
    finish({id: 'another-notice', revision: 2, readAt: new Date(now).toISOString()}); await tick();
    assert.deepEqual(counts, [1]); const first = calls.at(-1).body;
    f.container.querySelector('[data-action="research-retry-notification"]').click(); assert.deepEqual(calls.at(-1).body, first);
    finish({id: 'notice-0', revision: 2, readAt: new Date(now).toISOString()}); await tick();
    assert.deepEqual(counts, [1, 0]); assert.equal(f.container.querySelector('[data-action="research-retry-notification"]'), null);
    f.container.querySelector('[data-action="research-notification-back"]').click(); f.container.querySelector('[data-notification-id]').click();
    assert.equal(calls.filter(call => call.body).length, 2, 'already confirmed reads are not sent again');
  } finally {f.close();}
});

test('full inbox filters declared message types and existing purchase events without inventing type from prose', async () => {
  const f = fixture([notice(0, {category: 'price'}), notice(1, {route: 'purchases', status: 'DISPATCHED'}), notice(2, {route: 'purchases', status: 'PAID'}), notice(3, {title: '가격이라는 단어만 있는 소식'})], {mode: 'full'});
  try {
    await f.dispose.ready;
    assert.equal(notificationCategory({title: '배송 완료'}), 'other');
    const select = f.container.querySelector('[data-notification-filter]'); select.value = 'price'; select.dispatchEvent(new f.dom.window.Event('change', {bubbles: true}));
    assert.deepEqual([...f.container.querySelectorAll('[data-notification-id]')].map(row => row.dataset.notificationId), ['notice-0']);
    let filter = f.container.querySelector('[data-notification-filter]'); filter.value = 'delivery'; filter.dispatchEvent(new f.dom.window.Event('change', {bubbles: true}));
    assert.deepEqual([...f.container.querySelectorAll('[data-notification-id]')].map(row => row.dataset.notificationId), ['notice-1']);
    filter = f.container.querySelector('[data-notification-filter]'); filter.value = 'benefit'; filter.dispatchEvent(new f.dom.window.Event('change', {bubbles: true}));
    assert.match(f.container.textContent, /혜택 알림이 없어요/); assert.equal(f.calls.filter(call => call.body).length, 0);
    assert.deepEqual(f.unread, [4]);
  } finally {f.close();}
});

test('leaving a notification view aborts its request and ignores a later confirmation', async () => {
  let finish; const calls = [], counts = [];
  const f = fixture([notice(0)], {adapter: {request(path, body, signal) {calls.push({body, signal}); return body ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({items: [notice(0)]});}}, setUnread: count => counts.push(count)});
  try {
    await f.dispose.ready; f.container.querySelector('[data-notification-id]').click(); f.dispose();
    assert.equal(calls.at(-1).signal.aborted, true);
    finish({id: 'notice-0', revision: 2, readAt: new Date(now).toISOString()}); await tick();
    assert.deepEqual(counts, [1]); assert.equal(f.container.childElementCount, 0);
  } finally {f.close();}
});

test('invalid lists offer a real retry without claiming an empty inbox or marking messages read', async () => {
  let attempt = 0;
  const f = fixture([], {adapter: {async request() {attempt++; return {items: attempt === 1 ? [notice(0), notice(0)] : []};}}});
  try {
    assert.equal(await f.dispose.ready, false); assert.doesNotMatch(f.container.textContent, /새 알림이 없어요/);
    f.container.querySelector('[data-action="research-retry-notifications"]').click(); await tick();
    assert.equal(attempt, 2); assert.match(f.container.textContent, /새 알림이 없어요/);
  } finally {f.close();}
});

test('the existing account stack sends its more action to the full notification route', async () => {
  const dom = new JSDOM('<main></main>', {url: 'https://research.example'}), navigations = [];
  const dispose = mountResearchAccountPanel({id: 'notifications', container: dom.window.document.querySelector('main'), services: {}, adapter: {request: async () => ({items: [notice(0), notice(1), notice(2), notice(3)]})}, onNavigate: route => navigations.push(route)});
  try {
    await dispose.ready; dom.window.document.querySelector('[data-action="research-all-notifications"]').click();
    assert.deepEqual(navigations, [{screen: 'notifications', state: 'list'}]);
  } finally {dispose(); dom.window.close();}
});
