import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {mountResearchScenePanel} from '../src/server/research-app/scene-panels.mjs';
import {installProductUiRegistry} from '../src/server/product-ui/bootstrap.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';
const {JSDOM, VirtualConsole} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(check) {const end = Date.now() + 5000; while (!check() && Date.now() < end) await tick(); assert.ok(check(), 'the real module must complete its response');}
function setup(t) {
  const failures = [], vc = new VirtualConsole(); vc.on('jsdomError', error => {if (error.type !== 'css parsing') failures.push(error.message);});
  const dom = new JSDOM('<main id="order-single"><header id="parent-header"><span class="brand" data-order-brand-source="canonical">Order.</span></header><section id="parent-page"><input name="draft" value="kept"></section><section id="panel"></section></main>', {url: 'https://research.test/ia?view=research-r3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc});
  const w = dom.window, doc = w.document, container = doc.getElementById('panel'), header = doc.getElementById('parent-header'), parent = doc.getElementById('parent-page');
  Object.defineProperty(w, 'crypto', {value: webcrypto}); w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  w.ResizeObserver = class {observe() {} disconnect() {}}; w.IntersectionObserver = class {observe() {} disconnect() {}};
  w.HTMLElement.prototype.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLElement.prototype.animate = () => ({finished: Promise.resolve(), cancel() {}, pause() {}, play() {}});
  w.fetch = () => {throw Error('The scene panel must use its injected adapter');};
  const released = [], services = {releaseWithin(root) {released.push(root);}}, active = [];
  installProductUiRegistry(w);
  t.after(() => {for (const dispose of active) dispose(); w.dispatchEvent(new w.Event('pagehide')); dom.window.close();});
  const mount = options => {const dispose = mountResearchScenePanel({container, services, ...options}); active.push(dispose); return dispose;};
  const unchanged = () => {assert.equal(doc.getElementById('parent-header'), header); assert.equal(doc.getElementById('parent-page'), parent); assert.equal(parent.querySelector('input').value, 'kept'); assert.equal(doc.querySelectorAll('#order-single').length, 1); assert.equal(doc.querySelectorAll('[data-order-brand-source="canonical"]').length, 1); assert.deepEqual(failures, []);};
  return {w, doc, container, parent, services, released, mount, unchanged};
}
async function authored(view, screen, state) {
  const source = await researchScene(screen, state, 'email'), previous = view.w.ORDER_DESIGN_MODULES;
  view.w.ORDER_DESIGN_MODULES = [];
  try {view.w.eval(source.mount); return {scene: {screen: source.row.screen, state: source.row.state, variant: 'email', html: source.html, styles: []}, module: view.w.ORDER_DESIGN_MODULES.find(module => module.id === screen)};}
  finally {view.w.ORDER_DESIGN_MODULES = previous;}
}

test('a scene panel keeps the parent and scopes labels, SVG references and the original runtime lifetime', async t => {
  const v = setup(t), parentSignal = new v.w.AbortController(); let calls = 0, disposed = 0, sharedDisposed = 0, localSignal;
  v.w.QAUI = {sharedMount(root) {assert.ok(root.querySelector('input')); return () => {sharedDisposed++;};}};
  const scene = {screen: 'settings', state: 'normal', html: '<main id="order-single" class="qa-screen"><header class="page-head"><div class="brand" data-order-brand-source="canonical">duplicate</div></header><label for="email" aria-describedby="help">Email<input id="email" name="email" aria-describedby="help"></label><p id="help">Help</p><svg><defs><clipPath id="cut"><path/></clipPath></defs><g clip-path="url(#cut)"/></svg><button data-action="save">Save</button></main>'};
  const module = {id: 'settings', mount(root, state, api) {localSignal = api.signal; assert.equal(state, 'normal'); assert.equal(api.mode, 'product'); assert.equal(api.module, module); root.querySelector('[data-action=save]').addEventListener('click', () => {calls++;}, {signal: api.signal}); return () => {disposed++;};}};
  const panel = v.mount({scene: Promise.resolve(scene), module: () => Promise.resolve(module), signal: parentSignal.signal, api: {mode: 'review'}});
  assert.equal(await panel.ready, true); assert.notEqual(localSignal, parentSignal.signal);
  const root = v.container.firstElementChild, input = root.querySelector('input'), label = root.querySelector('label');
  assert.notEqual(input.id, 'email'); assert.equal(label.htmlFor, input.id); assert.equal(input.getAttribute('aria-describedby'), root.querySelector('p').id);
  assert.equal(root.querySelector('g').getAttribute('clip-path'), 'url(#' + root.querySelector('clipPath').id + ')');
  assert.equal(root.querySelector('.page-head,.brand'), null); assert.equal(root.dataset.researchSceneConnection, 'connected');
  const button = root.querySelector('button'); button.click(); assert.equal(calls, 1); v.unchanged();
  parentSignal.abort(); panel(); button.click(); assert.equal(calls, 1); assert.equal(disposed, 1); assert.equal(sharedDisposed, 1); assert.equal(localSignal.aborted, true); assert.deepEqual(v.released, [root]); v.unchanged();
});

test('hardcoded selector IDs remain usable and a parent collision fails without mounting the wrong element', async t => {
  const v = setup(t); let writes = 0;
  const scene = {screen: 'settings', state: 'normal', html: '<label for="hardcoded">Value<input id="hardcoded"></label>'};
  const module = {id: 'settings', mount(root) {root.querySelector('#hardcoded').value = 'actual'; writes++; return () => {};}};
  let panel = v.mount({scene, module}); assert.equal(await panel.ready, true); assert.equal(v.container.querySelector('input').id, 'hardcoded'); assert.equal(v.container.querySelector('label').htmlFor, 'hardcoded'); panel();
  const parentInput = v.doc.createElement('input'); parentInput.id = 'hardcoded'; parentInput.value = 'parent'; v.parent.append(parentInput);
  panel = v.mount({scene, module}); assert.equal(await panel.ready, false); assert.equal(writes, 1); assert.equal(parentInput.value, 'parent'); assert.match(panel.inspect().error, /HARDCODED_ID_COLLISION/); assert.equal(v.container.firstElementChild.dataset.researchSceneConnection, 'unconnected'); v.unchanged();
  panel(); parentInput.remove();
  panel = v.mount({scene: {...scene, html: scene.html + '<input id="hardcoded">'}, module});
  assert.equal(await panel.ready, false); assert.match(panel.inspect().error, /DUPLICATE_ID/); assert.equal(writes, 1); assert.equal(v.container.querySelectorAll('#hardcoded').length, 0); v.unchanged();
});

test('late scene loading and a throwing module cannot leave active listeners or replace the retained parent', async t => {
  const v = setup(t); let resolve, mounted = 0;
  const source = new Promise(done => {resolve = done;}), module = {id: 'settings', mount() {mounted++; return () => {};}};
  let panel = v.mount({scene: source, module}); panel(); resolve({screen: 'settings', state: 'normal', html: '<button>Late</button>'}); assert.equal(await panel.ready, false); assert.equal(mounted, 0); assert.equal(v.container.childNodes.length, 0);
  let clicks = 0, failedSignal;
  panel = v.mount({scene: {screen: 'settings', state: 'normal', html: '<button>Partial</button>'}, module: {id: 'settings', mount(root, _state, api) {failedSignal = api.signal; root.querySelector('button').addEventListener('click', () => {clicks++;}, {signal: api.signal}); throw Error('MODULE_FAILED');}}});
  assert.equal(await panel.ready, false); v.container.querySelector('button').click(); assert.equal(clicks, 0); assert.equal(failedSignal.aborted, true); assert.equal(panel.inspect().error, 'MODULE_FAILED'); v.unchanged();
});

test('the actual authored pass grid and deck run inside the panel without simulating receipt in product mode', async t => {
  const v = setup(t), source = await authored(v, 'passes', 'grid'), notices = [];
  assert.equal(source.module.id, 'passes');
  const panel = v.mount({...source, api: {reduced: () => true, select() {assert.fail('changing grid or deck does not replace its parent');}, toast: message => notices.push(message)}});
  assert.equal(await panel.ready, true); const root = v.container.firstElementChild, stage = root.querySelector('.pass-stage'), cards = [...stage.children];
  assert.ok(cards.length > 1); root.querySelector('[data-view=deck]').click(); assert.equal(stage.classList.contains('is-deck'), true); assert.deepEqual([...stage.children], cards);
  root.querySelector('[data-action=deck-next]').click(); assert.match(root.querySelector('.deck-position').textContent, /^2\s*\//);
  root.querySelector('[data-view=grid]').click(); assert.equal(stage.classList.contains('is-deck'), false);
  for (const card of cards) {card.click(); if (root.querySelector('[data-action=tear-ticket]')) break; root.querySelector('[data-action=close-ticket]').click();}
  root.querySelector('[data-action=tear-ticket]').click(); root.querySelector('[data-action=confirm-tear]').click();
  assert.ok(notices.some(message => message.includes('연결되지'))); assert.equal(root.querySelectorAll('.ticket-received').length, 0);
  v.unchanged(); panel(); assert.equal(v.w.ORDER_PRODUCT_UI.inspect(root), null); assert.ok(v.released.includes(root)); v.unchanged();
});

test('the actual withdrawal scene waits for its injected account handler and keeps the original parent', async t => {
  const v = setup(t), source = await authored(v, 'account-settings', 'withdraw'), lab = await createProductUiLab(), calls = [];
  t.after(() => lab.close()); assert.equal(source.module.id, 'account-settings');
  const adapter = lab.adapter('buyer'), panel = v.mount({...source, api: {adapter, reduced: () => true, select: (...args) => calls.push(args)}});
  assert.equal(await panel.ready, true); const root = v.container.firstElementChild;
  for (const [name, value] of [['withdraw-phrase', '회원탈퇴'], ['withdraw-reason', 'other'], ['withdraw-note', '다음에 다시 가입할게요']]) {const field = root.querySelector('[name=' + name + ']'); field.value = value; field.dispatchEvent(new v.w.Event('input', {bubbles: true}));}
  await until(() => !root.querySelector('[data-withdraw-start]').disabled);
  root.querySelector('[data-withdraw-start]').click(); root.querySelector('[data-withdraw-confirm]').click(); assert.deepEqual(calls, []);
  await until(() => calls.length > 0); assert.deepEqual(calls, [['account-settings', 'closed']]); assert.equal(adapter.calls.find(call => call.body?.action === 'withdraw').body.phrase, '회원탈퇴'); v.unchanged(); panel();
});

test('missing descriptors preserve the selected real scene and expose unconnected state instead of substituting another workflow', async t => {
  const v = setup(t);
  for (const [screen, state] of [['account-settings', 'normal'], ['saved-quote', 'list'], ['saved-quote', 'detail'], ['delivery-schedule', 'calendar'], ['delivery-schedule', 'detail']]) {
    const source = await authored(v, screen, state), panel = v.mount({scene: source.scene});
    assert.equal(await panel.ready, false); const root = v.container.firstElementChild;
    assert.equal(root.dataset.appScreen, screen); assert.equal(root.dataset.appState, state); assert.equal(root.dataset.researchSceneConnection, 'unconnected'); assert.equal(panel.inspect().error, 'RESEARCH_PANEL_RUNTIME_MISSING');
    assert.equal(root.querySelector('[data-app-screen="admin-shipments"],[data-app-screen="delivery-request"]'), null);
    const form = v.doc.createElement('form'); root.append(form); const submit = new v.w.Event('submit', {bubbles: true, cancelable: true}); form.dispatchEvent(submit); assert.equal(submit.defaultPrevented, true);
    v.unchanged(); panel();
  }
});
