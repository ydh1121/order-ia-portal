import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountNotificationPreferences} from '../src/server/research-app/notification-preferences-ui.mjs';
import {researchNotificationFixtureSource} from '../src/server/research-app/notification-fixture-source.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {getResearchInspectorPanelsModule} from '../src/server/research-app/inspector-panels-source.mjs';

const {JSDOM, VirtualConsole} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const copy = value => JSON.parse(JSON.stringify(value));
const contract = value => {const {fixture, ...body} = copy(value); assert.equal(fixture.kind, 'dummy'); assert.equal(fixture.commercial, false); return body;};
const now = '2026-11-23T05:00:00.000Z';
const off = () => ({price: false, news: false, benefits: false});
const result = (preferences = off(), revision = 0) => ({preferences, revision, updatedAt: revision ? now : null, delivery: {webPush: false}});
const command = (preferences = off(), expectedRevision = 0) => ({action: 'update', expectedRevision, requestKey: crypto.randomUUID(), preferences});
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, label) {const deadline = performance.now() + 3000; while (!predicate() && performance.now() < deadline) await tick(); assert.ok(predicate(), label);}

async function fixture(t, serializedSource = null) {
  let network = 0, storage = 0; const errors = [], console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM('<main></main>', {url: 'https://review.invalid/ia/research', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console}), w = dom.window;
  w.fetch = () => {network++; throw Error('External network is forbidden in this fixture');};
  Object.defineProperty(w, 'sessionStorage', {get() {storage++; throw Error('Persistent session storage is forbidden in this fixture');}});
  w.postMessage = () => {};
  const source = serializedSource || researchNotificationFixtureSource(browserFunction(installQaFixtureAdapter));
  w.eval('window.adapter=(' + source + ')({screen:"notifications",state:"list",fixture:{persona:"buyer",authenticated:true}},(' + browserFunction(installProductAdapter) + '));');
  const adapter = w.adapter; await adapter.ready;
  t.after(() => {adapter.fixture.dispose(); w.close(); assert.equal(network, 0); assert.equal(storage, 0); assert.deepEqual(errors, []);});
  return {w, adapter};
}

test('notification fixture extension survives actual Worker-style bundling before browser serialization', async t => {
  const {build} = createRequire(new URL('./build-tools/package.json', import.meta.url))('esbuild');
  const contents = `import {researchNotificationFixtureSource} from './src/server/research-app/notification-fixture-source.mjs';
    import {installQaFixtureAdapter} from './src/server/r3-ui/qa-fixture-adapter.mjs';
    import {browserFunction} from './src/server/browser-source.mjs';
    export const source=researchNotificationFixtureSource(browserFunction(installQaFixtureAdapter));`;
  const built = await build({stdin: {contents, resolveDir: fileURLToPath(new URL('../', import.meta.url))}, bundle: true, platform: 'browser', format: 'esm', keepNames: true, write: false, logLevel: 'silent'});
  const module = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const {adapter} = await fixture(t, module.source);
  assert.deepEqual(contract(await adapter.request('/notification-preferences')), result());
  const body = command({price: true, news: false, benefits: true}), saved = await adapter.request('/notification-preferences', body);
  assert.equal(saved.revision, 1); assert.deepEqual(copy(saved.preferences), body.preferences);
  assert.deepEqual(copy(await adapter.request('/notification-preferences', body)), copy(saved));
  assert.equal((await adapter.request('/notifications')).items.length, 2, 'the original notification transport remains available');
});

test('research notification settings use the same consent validation, revision and actor-private replay contract', async t => {
  const {adapter} = await fixture(t), body = command({price: true, news: false, benefits: true});
  assert.deepEqual(contract(await adapter.request('/notification-preferences')), result());
  assert.deepEqual(copy(adapter.fixture.inspect().data.notificationPreferences), {});
  const saved = await adapter.request('/notification-preferences', body);
  assert.equal(saved.revision, 1); assert.deepEqual(copy(saved.preferences), body.preferences); assert.equal(saved.delivery.webPush, false);
  assert.deepEqual(copy(await adapter.request('/notification-preferences', body)), copy(saved));
  await assert.rejects(adapter.request('/notification-preferences', {...body, preferences: off()}), error => error.message === 'IDEMPOTENCY_CONFLICT');
  await assert.rejects(adapter.request('/notification-preferences', command(off())), error => error.message === 'REVISION_CONFLICT');
  await assert.rejects(adapter.request('/notification-preferences', {...command(off(), 1), actorId: 'another'}), error => error.message === 'INVALID_NOTIFICATION_PREFERENCES');
  adapter.fixture.configure({persona: 'supplier'}); assert.deepEqual(contract(await adapter.request('/notification-preferences')), result());
  const supplier = await adapter.request('/notification-preferences', {...body, preferences: {price: false, news: true, benefits: false}}); assert.equal(supplier.revision, 1);
  adapter.fixture.configure({persona: 'buyer'}); assert.deepEqual(copy(await adapter.request('/notification-preferences')), copy(saved));
  adapter.fixture.configure({authenticated: false});
  await assert.rejects(adapter.request('/notification-preferences', body), error => error.message === 'AUTHENTICATION_REQUIRED', 'a cached write must still require authentication');
  await assert.rejects(adapter.request('/notification-preferences'), error => error.message === 'AUTHENTICATION_REQUIRED');
});

test('research notification settings honor loading, cancellation and error scenarios without manufacturing saves', async t => {
  const {adapter, w} = await fixture(t); adapter.fixture.configure({scenario: 'loading'});
  const controller = new w.AbortController(), pending = adapter.request('/notification-preferences', command({price: true, news: false, benefits: false}), controller.signal);
  const cancelled = assert.rejects(pending, error => error.name === 'AbortError');
  await until(() => adapter.fixture.inspect().pending === 1, 'preference save waits for fixture release'); controller.abort(); await cancelled;
  assert.deepEqual(copy(adapter.fixture.inspect().data.notificationPreferences), {});
  const read = adapter.request('/notification-preferences'); await until(() => adapter.fixture.inspect().pending === 1, 'preference read waits');
  adapter.fixture.releasePending(); assert.deepEqual(contract(await read), result());
  adapter.fixture.configure({scenario: 'error'});
  await assert.rejects(adapter.request('/notification-preferences', command()), error => error.message === 'QA_FIXTURE_ERROR');
  assert.deepEqual(copy(adapter.fixture.inspect().data.notificationPreferences), {});
});

test('existing account access keeps personal and business stack pages available while restricting the operator dashboard', async t => {
  const {adapter, w} = await fixture(t);
  for (const persona of ['buyer', 'supplier', 'operator']) {
    adapter.fixture.configure({persona});
    for (const id of ['profile.personal', 'profile.account', 'profile.connections', 'manage.business', 'manage.business.members', 'notifications']) assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.canAccess(id), true, persona + ':' + id);
    assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.canAccess('manage.dashboard'), persona === 'operator');
  }
  assert.equal(adapter.fixture.inspect().calls.some(call => call.method === 'POST'), false);
});

function ui(t, implementation) {
  const dom = new JSDOM('<main></main>', {url: 'https://product.invalid', pretendToBeVisual: true}), w = dom.window, calls = [];
  const container = w.document.querySelector('main');
  const adapter = {request: async (path, body, signal) => {calls.push({path, body, signal}); return implementation ? implementation(path, body, signal) : body ? result(body.preferences, body.expectedRevision + 1) : result();}};
  const dispose = mountNotificationPreferences({container, adapter}); t.after(() => {dispose(); w.close();});
  const details = container.querySelector('details');
  const open = async () => {details.open = true; details.dispatchEvent(new w.Event('toggle')); await dispose.ready;};
  const change = (key, checked) => {const input = container.querySelector('[data-notification-preference="' + key + '"]'); input.checked = checked; input.dispatchEvent(new w.Event('change', {bubbles: true})); return input;};
  const status = () => container.querySelector('[role=status]').textContent;
  return {dom, w, calls, container, details, open, change, status, dispose};
}

test('settings load only on opening and never opt the person in until an explicit change is confirmed', async t => {
  const f = ui(t); assert.equal(f.calls.length, 0); await f.open();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body, null);
  assert.ok([...f.container.querySelectorAll('input')].every(input => input.checked === false));
  f.details.open = false; f.details.open = true; f.details.dispatchEvent(new f.w.Event('toggle')); await tick(); assert.equal(f.calls.length, 1);
  f.change('price', true); await until(() => f.status() === '수신 설정을 저장했어요.', 'explicit preference is confirmed');
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].body.preferences, {price: true, news: false, benefits: false});
  assert.equal(f.calls[1].body.expectedRevision, 0); assert.match(f.calls[1].body.requestKey, /^[\w-]+$/);
  assert.match(f.container.textContent, /웹 푸시 발송은 아직 연결되지/);
});

test('failed or invalid save acknowledgements keep the draft and reuse the exact idempotency key for retry', async t => {
  let writes = 0; const f = ui(t, (path, body) => {
    if (!body) return result(); writes++;
    return writes === 1 ? {...result(body.preferences, 1), updatedAt: null} : result(body.preferences, 1);
  });
  await f.open(); f.change('benefits', true); await until(() => !f.container.querySelector('[data-notification-preferences-retry]').hidden, 'invalid acknowledgement offers retry');
  assert.match(f.status(), /저장 결과를 확인하지 못했어요/); assert.equal(f.container.querySelector('[name=benefits]').checked, true);
  const first = copy(f.calls.at(-1).body); f.container.querySelector('[data-notification-preferences-retry]').click();
  await until(() => f.status() === '수신 설정을 저장했어요.', 'retry result confirmed'); assert.deepEqual(f.calls.at(-1).body, first); assert.equal(writes, 2);
});

test('concurrent edits reload the latest values, preserve only the changed toggle and require another explicit save', async t => {
  let reads = 0, writes = 0;
  const f = ui(t, (path, body) => {
    if (!body) return ++reads === 1 ? result() : result({price: false, news: true, benefits: false}, 1);
    if (++writes === 1) throw Error('REVISION_CONFLICT'); return result(body.preferences, body.expectedRevision + 1);
  });
  await f.open(); f.change('price', true); await until(() => !f.container.querySelector('[data-notification-preferences-reload]').hidden, 'revision conflict offers reload');
  f.container.querySelector('[data-notification-preferences-reload]').click(); await f.dispose.ready;
  assert.equal(f.container.querySelector('[name=price]').checked, true); assert.equal(f.container.querySelector('[name=news]').checked, true); assert.equal(writes, 1);
  assert.match(f.status(), /아직 저장하지 않았어요/);
  f.container.querySelector('[data-notification-preferences-retry]').click(); await until(() => f.status() === '수신 설정을 저장했어요.', 'merged draft confirmed');
  assert.equal(f.calls.at(-1).body.expectedRevision, 1); assert.deepEqual(f.calls.at(-1).body.preferences, {price: true, news: true, benefits: false});
});

test('pending saves reject duplicate submissions and disposed settings ignore late responses', async t => {
  let finish; const f = ui(t, (path, body) => body ? new Promise(resolve => {finish = resolve;}) : result());
  await f.open(); const input = f.change('price', true); input.dispatchEvent(new f.w.Event('change', {bubbles: true}));
  assert.equal(f.calls.filter(call => call.body).length, 1); assert.equal(f.container.querySelector('fieldset').disabled, true);
  const signal = f.calls.at(-1).signal; f.dispose(); assert.equal(signal.aborted, true); finish(result({price: true, news: false, benefits: false}, 1)); await tick();
  assert.equal(f.container.children.length, 0);
});

test('malformed GET cannot expose false defaults as a loaded preference and retries without writing', async t => {
  let reads = 0; const f = ui(t, () => ++reads === 1 ? {revision: 0, preferences: {price: true}, updatedAt: null} : result());
  await f.open(); assert.equal(f.container.querySelector('fieldset').hidden, true); assert.equal(f.calls.filter(call => call.body).length, 0);
  f.container.querySelector('[data-notification-preferences-retry]').click(); await f.dispose.ready;
  assert.equal(f.container.querySelector('fieldset').hidden, false); assert.ok([...f.container.querySelectorAll('input')].every(input => !input.checked)); assert.equal(f.calls.filter(call => call.body).length, 0);
});

test('browser asset selection excludes source adapters and every published module imports only published browser modules', async () => {
  const repository = fileURLToPath(new URL('../', import.meta.url)), source = await readFile(new URL('../scripts/build-research-app.mjs', import.meta.url), 'utf8');
  const selection = source.slice(source.indexOf('const serverOnly='), source.indexOf('const sources='));
  assert.ok(selection.startsWith('const serverOnly=') && selection.includes('const files='));
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const files = await new AsyncFunction('directory', 'readdir', selection + '\nreturn files;')(path.join(repository, 'src/server/research-app'), readdir);
  const publicFiles = new Set(files.map(([, file]) => path.resolve(repository, file))), names = files.map(([name]) => name);
  // This existing virtual browser module is served as a serialized module by
  // page.mjs, rather than copied from a physical browser source file.
  const virtual = new Map([[path.join(repository, 'src/server/research-app/inspector-panels.mjs'), getResearchInspectorPanelsModule()]]);
  for (const file of virtual.keys()) publicFiles.add(file);
  assert.ok(!names.includes('research/notification-fixture-source.mjs')); assert.ok(!names.includes('research/onboarding-polish.mjs'));
  for (const name of ['notifications', 'notification-preferences-ui', 'notification-preferences-contract', 'interaction-polish']) assert.ok(names.includes('research/' + name + '.mjs'), name);
  for (const file of publicFiles) {
    const code = virtual.get(file) || await readFile(file, 'utf8');
    for (const match of code.matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('.'), path.basename(file) + ' must not import a server or package dependency: ' + match[1]);
      assert.ok(publicFiles.has(path.resolve(path.dirname(file), match[1])), path.basename(file) + ' imports an unpublished/server module: ' + match[1]);
    }
  }
  assert.throws(() => researchNotificationFixtureSource('function changed(){}'), /RESEARCH_NOTIFICATION_FIXTURE_SOURCE_CHANGED/);
});
