import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash, webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {quoteFiles} from '../src/server/r3-product-sources.mjs';
import {regularContactModuleSource, regularServiceSourceIdentity} from '../src/server/research-app/regular-service-assets.mjs';
import {createRegularServices} from '../src/server/research-app/regular-services.mjs';
import {mountResearchAccountPanel} from '../src/server/research-app/account-panels.mjs';
import {runtimes} from '../src/server/product-ui/runtime.gen.mjs';
import {getResearchBusinessPanelSource, getResearchBusinessPanelMarkup} from '../src/server/research-app/business-panel-source.mjs';
import {mountResearchBusinessPanel} from '../src/server/research-app/business-panel.mjs';
import {businessDirectoryPanelMarkup} from '../src/server/product-ui/business-directory.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {createSavedBusinessBridge, mountSavedBusinessPicker} from '../src/server/r3-saved-business-client.mjs';
import {projectSavedBusiness} from '../src/server/r3-business-directory.mjs';
const {JSDOM} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = path => gunzipSync(Buffer.from(quoteFiles[path], 'base64')).toString();
const directory = await mkdtemp(join(tmpdir(), 'order-regular-services-'));
const sourcePaths = Object.keys(quoteFiles).filter(path => path.startsWith('src/engine/') && path.endsWith('.mjs'))
  .concat(['web/address-contract.mjs', 'web/address-service.mjs', 'web/address-ui.mjs', 'web/region-reference.mjs']);
for (const path of sourcePaths) {await mkdir(dirname(join(directory, path)), {recursive: true}); await writeFile(join(directory, path), text(path));}
const generated = await regularContactModuleSource();
await mkdir(join(directory, 'bridge'), {recursive: true});
await writeFile(join(directory, 'bridge/contact-ui.mjs'), generated.split('\n').map(line => line.startsWith('import ') ? line.replaceAll('/ia/research-assets/', pathToFileURL(directory + '/').href) : line).join('\n'));
await writeFile(join(directory, 'bridge/business-directory.mjs'), await getResearchBusinessPanelSource());
const loadModule = path => import(pathToFileURL(join(directory, path)).href);
const iana = await loadModule('src/engine/adapters/iana-browser.mjs');
const envelope = JSON.parse(text('assets/iana-reference.json'));
const reference = await iana.verifyBrowserIana(envelope, {crypto: webcrypto});
after(() => rm(directory, {recursive: true, force: true}));

function json(value, status = 200) {return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});}
function doh(url, {ttl = 60, nullMx = false} = {}) {
  const request = new URL(url), name = request.searchParams.get('name'), kind = request.searchParams.get('type');
  const type = {MX: 15, A: 1, AAAA: 28}[kind];
  const data = kind === 'MX' ? nullMx ? '0 .' : '10 mail.example.com.' : kind === 'A' ? '192.0.2.10' : '2001:db8::10';
  return json({Status: 0, Question: [{name, type}], Answer: [{name, type, TTL: ttl, data}]});
}
async function setup(extra = {}) {
  const dom = new JSDOM('<form><input id="email" name="email" type="email" required><input id="phone" name="phone" type="tel" required><input id="query"><input id="road"><input id="postal"><input id="detail"><input id="dropoff"></form>', {url: 'https://research.example', pretendToBeVisual: true, runScripts: 'outside-only'});
  const previous = Object.fromEntries(['document', 'window', 'CustomEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.document = dom.window.document; globalThis.window = dom.window; globalThis.CustomEvent = dom.window.CustomEvent;
  const clock = {value: Date.parse(reference.collectedAt) + 1000}, calls = [];
  const fetcher = extra.fetcher ?? (async (url, init) => {calls.push({url, init}); return doh(url);});
  const services = await createRegularServices({document: dom.window.document, origin: dom.window.location.origin,
    crypto: webcrypto, now: () => clock.value, referenceProvider: {get: async () => reference},
    loadModule, fetcher, dns: {provider: 'cloudflare', retries: 0}, ...extra});
  return {dom, window: dom.window, document: dom.window.document, services, clock, calls,
    input: id => dom.window.document.getElementById(id),
    address: () => Object.fromEntries(['query', 'road', 'postal', 'detail', 'dropoff'].map(id => [id, dom.window.document.getElementById(id)])),
    close() {services.dispose(); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }}
  };
}

test('bridge identifies exact sealed inputs and preserves original editing/proof functions', async () => {
  const identity = await regularServiceSourceIdentity();
  assert.equal(identity.commit, 'fd2ecddf71bf0548099bcc728219eac0d9d7da46');
  for (const source of identity.sources) assert.equal(source.servedSealedSha256, createHash('sha256').update(text(source.path)).digest('hex'));
  const contact = identity.sources.find(source => source.path === 'web/contact-ui.mjs');
  assert.notEqual(contact.originalSha256, contact.servedSealedSha256);
  for (const source of identity.sources.filter(source => source.path !== 'web/contact-ui.mjs')) assert.equal(source.originalSha256, source.servedSealedSha256);
  const original = text('web/contact-ui.mjs');
  for (const [start, end] of [[' function editAllowed(', ' function parse('], [' function project(', ' function peek('],
    [' function isCurrent(', ' async function validate('], [' async function check(', ' function changed('],
    [' function acceptedValue(', " listen(input,'beforeinput'"]]) {
    const startAt = original.indexOf(start), endAt = original.indexOf(end.replace(' listen(input,', ' input.addEventListener('), startAt);
    assert.ok(startAt >= 0 && endAt > startAt, start); assert.ok(generated.includes(original.slice(startAt, endAt)), start);
  }
  assert.ok(!generated.includes('window.ORDER_QA')); assert.ok(!generated.includes('qa-review-runtime'));
});

test('phone uses the regular segmented DOM/caret/IME adapter and one owner across forms and globals', async () => {
  const f = await setup(); try {
    const release = f.services.installRegularGlobals(f.window), input = f.input('phone');
    const originalControl = f.window.OrderPhone.mount(input), phone = f.services.mountPhone(input);
    assert.equal(f.window.OrderPhone.instance(input), originalControl); assert.equal(f.document.querySelectorAll('.ui-phone-shell').length, 1);
    phone.set('02-1234-5678'); assert.equal(phone.commit().ok, true); assert.equal(phone.get(), '02-1234-5678');
    assert.deepEqual(phone.read().contract, originalControl.contract());
    const saved = phone.snapshot(); phone.set('02-12'); assert.equal(phone.commit().ok, false); phone.restore(saved); assert.equal(phone.commit().ok, true);
    const first = originalControl.parts[0]; first.focus(); first.setSelectionRange(1, 1);
    const before = phone.get(); first.dispatchEvent(new f.window.CompositionEvent('compositionstart', {bubbles: true}));
    first.value = '0한2'; first.dispatchEvent(new f.window.InputEvent('input', {bubbles: true, data: '한', isComposing: true}));
    first.dispatchEvent(new f.window.CompositionEvent('compositionend', {bubbles: true, data: '한'}));
    assert.equal(phone.get(), before); assert.equal(first.selectionStart, 1);
    phone.set('legacy unavailable'); assert.equal(phone.get(), 'legacy unavailable'); assert.equal(phone.commit().ok, false);
    phone.dispose(); assert.equal(f.document.querySelectorAll('.ui-phone-shell').length, 0);
    const remounted = f.services.mountPhone(input); remounted.set('010-1234-5678'); assert.equal(remounted.commit().ok, true);
    release(); assert.equal(f.window.OrderPhone, undefined);
  } finally {f.close();}
});

test('email proof gates actual commit, expires with clock, preserves local case and invalidates on edit/cancel', async () => {
  const f = await setup(); try {
    const email = f.services.mountEmail(f.input('email'), {autoValidate: false});
    email.set('Case.Tag+test@example.com'); assert.equal(email.read().valid, false); assert.equal(email.proof(), null);
    const saved = email.snapshot(), committed = await email.commit();
    assert.equal(committed.ok, true); assert.equal(committed.value, 'Case.Tag+test@example.com');
    assert.equal(committed.proof.engineResult.status, 'VALID'); assert.equal(committed.ownershipVerified, false);
    assert.ok(f.calls.length >= 2); assert.ok(f.calls.every(({url}) => !url.includes('Case.Tag') && !url.includes('%40')));
    f.clock.value += 61000; assert.equal(email.proof(), null); assert.equal(email.read().valid, false);
    email.restore(saved); assert.equal(email.get(), saved.value); assert.equal(email.proof(), null);
    await email.validate(); assert.ok(email.proof()); email.cancel(); assert.equal(email.proof(), null);
    email.set('a..b@example.com'); assert.equal((await email.commit()).ok, false); assert.ok(email.error());
    email.dispose(); assert.equal(f.document.querySelectorAll('.ui-email-field').length, 0);
    assert.equal(f.input('email').type, 'email'); assert.equal(f.services.mountEmail(f.input('email')).get(), 'a..b@example.com');
  } finally {f.close();}
});

test('zero TTL evidence belongs to the active validation and late responses cannot revive disposed forms', async () => {
  const f = await setup({fetcher: async url => doh(url, {ttl: 0})}); try {
    const email = f.services.mountEmail(f.input('email'), {autoValidate: false}); email.set('a@example.com');
    const first = await email.commit(); assert.equal(first.ok, true); assert.equal(first.proof.currentValidationOnly, true);
    email.cancel(); assert.equal(email.proof(), null); assert.equal(email.read().valid, false);
  } finally {f.close();}
  const pending = [];
  const g = await setup({fetcher: (url, init) => new Promise(resolve => pending.push({url, init, resolve}))}); try {
    const email = g.services.mountEmail(g.input('email'), {autoValidate: false}); email.set('a@example.com');
    const validation = email.validate(); while (!pending.length) await tick();
    email.set('b@other.com'); assert.ok(pending[0].init.signal.aborted);
    email.dispose(); for (const request of pending) request.resolve(doh(request.url));
    const result = await validation; assert.equal(result.valid, false); assert.equal(result.discarded, true);
    assert.equal(g.input('email').value, 'b@other.com'); assert.equal(g.input('email').getAttribute('aria-busy'), null);
  } finally {g.close();}
});

test('IANA fixed-path policy is retained while only the transport maps to the research asset', async () => {
  const calls = [];
  const f = await setup({referenceProvider: undefined, fetcher: async (url, init) => {
    calls.push({url, init}); if (new URL(url).pathname === '/ia/research-assets/assets/iana-reference.json') return json(envelope);
    return doh(url);
  }}); try {
    const email = f.services.mountEmail(f.input('email'), {autoValidate: false}); email.set('case@example.com');
    assert.equal((await email.commit()).ok, true);
    const ianaCalls = calls.filter(({url}) => new URL(url).hostname === 'research.example');
    assert.equal(ianaCalls.length, 1); assert.equal(new URL(ianaCalls[0].url).pathname, '/ia/research-assets/assets/iana-reference.json');
    assert.equal(ianaCalls[0].init.credentials, 'same-origin');
  } finally {f.close();}
});

const juso = (id = '1111111111111111111111111', road = '서울특별시 중구 세종대로 1') => ({road, postal: '04524', jibun: '서울 중구 1', region: '서울특별시', providerId: id, addressProvider: 'JUSO'});
test('address transport absence stays unavailable; stored text never acquires provider provenance', async () => {
  const f = await setup(); try {
    const field = f.services.mountAddress(f.address(), {autoSearch: false, value: {road: '옛 주소', detail: '2층'}});
    assert.equal(field.commit().ok, false); assert.equal(field.read().addressStatus.state, 'UNVERIFIED');
    const result = await field.search(); assert.equal(result.reason, 'NOT_CONFIGURED'); assert.equal(field.read().providerConnected, false);
    assert.match(field.error(), /아직 연결/); assert.equal(f.calls.length, 0);
    field.restore({value: {road: '옛 주소', postal: '04524', detail: '2층'}, proof: {verified: true}});
    assert.equal(field.commit().ok, false); assert.equal(field.get().providerId, '');
  } finally {f.close();}
});

test('address reuses strict search and selection contracts, preserves same-base details and rejects stale results', async () => {
  let candidate = juso(), hold = null; const calls = [];
  const f = await setup({address: {fetcher: async (url, init) => {
    calls.push({url, init}); const body = JSON.parse(init.body);
    if (body.query === '지연 검색') return new Promise(resolve => {hold = resolve;});
    return json({version: 1, status: 'OK', reason: 'RESULTS', items: [candidate], page: body.page, total: 1, hasMore: false});
  }}}); try {
    const field = f.services.mountAddress(f.address(), {autoSearch: false, value: {...juso(), detail: '2층', dropoff: '정문'}});
    assert.equal(field.commit().ok, true); await field.search(); assert.equal(await field.choose(0), true);
    assert.equal(field.get().detail, '2층'); assert.equal(field.get().dropoff, '정문');
    candidate = juso('2222222222222222222222222', '서울특별시 중구 세종대로 2');
    f.input('query').value = '새 주소'; f.input('query').dispatchEvent(new f.window.Event('input', {bubbles: true}));
    assert.equal(field.commit().ok, false); await field.search(); assert.equal(await field.choose(0), true);
    assert.equal(field.get().detail, ''); assert.equal(field.get().dropoff, ''); assert.equal(field.commit().ok, true);
    f.input('query').value = '지연 검색'; const pending = field.search(); while (!hold) await tick();
    f.input('query').value = '다른 검색'; f.input('query').dispatchEvent(new f.window.Event('input', {bubbles: true}));
    hold(json({version: 1, status: 'OK', reason: 'RESULTS', items: [juso()], page: 1, total: 1, hasMore: false}));
    assert.equal((await pending).discarded, true); assert.equal(field.options().length, 0); assert.equal(field.commit().ok, false);
    assert.equal(new URL(calls[0].url).pathname, '/api/address/search'); assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(field.read().ownershipVerified, false);
  } finally {f.close();}
});

test('place selection requires original resolve contract; form aggregate never treats UI success as ownership', async () => {
  const place = {kind: 'PLACE', placeId: '1234', name: '오더 사무실', road: '서울특별시 중구 세종대로 1', jibun: '', page: 1, addressProvider: 'KAKAO'};
  const selected = {...juso(), addressProvider: 'KAKAO', providerId: 'KAKAO:v1:' + 'a'.repeat(64)};
  const actions = [];
  const f = await setup({address: {fetcher: async (_url, init) => {
    const body = JSON.parse(init.body); actions.push(body);
    if (body.action === 'resolve') return json({version: 3, status: 'OK', reason: 'RESOLVED', placeId: place.placeId, item: selected});
    return json({version: 3, status: 'OK', reason: 'RESULTS', items: [place], page: 1, total: 1, hasMore: false,
      sources: {address: {total: 0, pageable: 0, hasMore: false}, place: {total: 1, pageable: 1, hasMore: false}}});
  }}}); try {
    const form = f.services.mountForm(f.document.querySelector('form'), {email: {autoValidate: false}, address: f.address(), addressOptions: {autoSearch: false}});
    form.restore({email: 'a@example.com', phone: '010-1234-5678', address: {road: '오더 사무실'}});
    const address = form.controls.get('address'); await address.search(); assert.equal(address.commit().ok, false);
    assert.equal(await address.choose(0), true); assert.equal(actions[1].action, 'resolve');
    const result = await form.commit(); assert.equal(result.ok, true); assert.equal(result.ownershipVerified, false);
    assert.equal(result.values.email, 'a@example.com'); assert.equal(result.values.phone, '010-1234-5678');
    assert.equal(result.values.address.providerId, selected.providerId);
    const saved = form.snapshot(); assert.equal(Object.hasOwn(saved.email, 'proof'), false);
    form.dispose(); assert.equal(f.services.inspect().mountedFields, 0);
  } finally {f.close();}
});

test('global restoration and repeated observer mounts cannot leave extra owners or stale installed globals', async () => {
  const f = await setup(); try {
    const previous = {mount() {}}, external = {changed: true}; f.window.OrderPhone = previous;
    const release = f.services.installRegularGlobals(f.window); assert.equal(f.services.installRegularGlobals(f.window), release);
    release(); const activeRelease = f.services.installRegularGlobals(f.window); release(); assert.notEqual(f.window.OrderPhone, previous);
    const phone = f.services.mountPhone(f.input('phone')); phone.set('010-1234-5678');
    const parts = [...f.document.querySelectorAll('.ui-phone-part')];
    for (const input of parts) assert.equal(f.services.mountPhone(input), phone);
    f.window.OrderEmailUI.mount(f.input('email'));
    const form = f.services.mountForm(f.document.querySelector('form'));
    assert.equal(form.controls.size, 2); assert.equal(f.document.querySelectorAll('.ui-phone-shell').length, 1);
    assert.equal(f.document.querySelectorAll('.ui-email-field').length, 1);
    assert.equal(f.services.installRegularGlobals(f.window), activeRelease); f.window.OrderEmail = external; f.services.dispose();
    assert.equal(f.window.OrderPhone, previous); assert.equal(f.window.OrderEmail, external); assert.equal(f.window.OrderEmailUI, undefined);
  } finally {f.close();}
});

test('active composition and external address cancellation cannot be committed as finished input', async () => {
  let requested = false;
  const f = await setup({address: {fetcher: () => {requested = true; return new Promise(() => {});}}}); try {
    const email = f.services.mountEmail(f.input('email'), {autoValidate: false}); email.set('a@example.com');
    f.input('email').dispatchEvent(new f.window.CompositionEvent('compositionstart', {bubbles: true}));
    assert.equal((await email.commit()).ok, false); assert.equal(f.calls.length, 0);
    f.input('email').dispatchEvent(new f.window.CompositionEvent('compositionend', {bubbles: true}));
    const phone = f.services.mountPhone(f.input('phone')); phone.set('010-1234-5678');
    f.input('phone').dispatchEvent(new f.window.CompositionEvent('compositionstart', {bubbles: true}));
    assert.equal(phone.commit().ok, false);
    f.input('phone').dispatchEvent(new f.window.CompositionEvent('compositionend', {bubbles: true}));
    const field = f.services.mountAddress(f.address(), {autoSearch: false}); f.input('query').value = '주소 검색';
    const abort = new AbortController(), pending = field.search({signal: abort.signal}); while (!requested) await tick();
    abort.abort(); assert.equal((await pending).discarded, true); assert.equal(field.read().pending, false); assert.equal(f.input('query').getAttribute('aria-busy'), 'false');
  } finally {f.close();}
});

test('conflicting DNS providers and stale IANA references remain unverified rather than creating a success', async () => {
  const f = await setup({dns: {providers: ['cloudflare', 'google'], retries: 0}, fetcher: async url => doh(url, {nullMx: new URL(url).hostname === 'dns.google'})}); try {
    const email = f.services.mountEmail(f.input('email'), {autoValidate: false}); email.set('a@example.com');
    const result = await email.commit(); assert.equal(result.ok, false); assert.equal(result.result.status, 'UNKNOWN'); assert.equal(email.proof(), null);
  } finally {f.close();}
  let requests = 0;
  const g = await setup({referenceProvider: {get: async () => ({...reference, collectedAt: '2020-01-01T00:00:00.000Z', sourceUpdatedAt: '2020-01-01T00:00:00.000Z'})}, fetcher: async () => {requests++; throw Error('Unexpected DNS');}}); try {
    const email = g.services.mountEmail(g.input('email'), {autoValidate: false}); email.set('a@example.com');
    assert.equal((await email.commit()).ok, false); assert.equal(requests, 0); assert.equal(email.proof(), null);
  } finally {g.close();}
});

function panelFixture(f, profile = {}) {
  f.window.eval(runtimes.accountFeedback);
  const container = f.document.createElement('div'); f.document.body.append(container);
  const calls = [], current = {revision: 4, state: 'ACTIVE', profile: {name: '기존 이름', phone: '010-1234-5678', email: 'member@example.com', connections: [], ...profile}};
  const adapter = {message: error => error.message === 'REVISION_CONFLICT' ? '다른 창에서 먼저 변경됐어요.' : '요청을 처리하지 못했어요.',
    async request(path, body, signal) {
      calls.push({path, body, signal}); if (!body) return structuredClone(current);
      assert.equal(path, '/account'); assert.equal(body.action, 'update'); assert.equal(body.expectedRevision, current.revision);
      assert.deepEqual(Object.keys(body.profile).sort(), ['name', 'phone']);
      current.profile = {...current.profile, name: body.profile.name.trim(), phone: body.profile.phone.trim()}; current.revision++;
      return structuredClone(current);
    }};
  return {container, current, calls, adapter};
}

test('research profile persists full regular phone values with the exact existing revision contract', async () => {
  const f = await setup(); let dispose;
  try {
    const p = panelFixture(f); dispose = mountResearchAccountPanel({id: 'profile.personal', container: p.container, adapter: p.adapter, services: f.services});
    assert.equal(await dispose.ready, true);
    const name = p.container.querySelector('[name="name"]'), primary = p.container.querySelector('[name="phone"]');
    const email = p.container.querySelector('[name="email"]');
    assert.equal(primary.value, '010'); assert.equal(email.readOnly, true);
    const paste = new f.window.Event('paste', {bubbles: true, cancelable: true}); Object.defineProperty(paste, 'clipboardData', {value: {getData: () => 'changed@example.com'}});
    email.dispatchEvent(paste); email.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    assert.equal(email.value, 'member@example.com'); assert.equal(p.container.querySelectorAll('[data-email-suggestion]').length, 0);
    name.value = ' 새 이름 '; p.container.querySelector('[data-action="research-save-profile"]').click(); await tick();
    const saved = p.calls.find(call => call.body); assert.equal(saved.body.expectedRevision, 4); assert.equal(saved.body.profile.phone, '010-1234-5678');
    assert.ok(saved.body.requestKey); assert.equal(p.current.revision, 5); assert.equal(p.current.profile.name, '새 이름');
    assert.match(p.container.textContent, /저장했어요/); assert.equal(f.calls.length, 0, 'readonly profile email does not cause a domain request');
    f.services.mountPhone(primary).set('02-1234-5678'); p.container.querySelector('[data-action="research-save-profile"]').click(); await tick();
    assert.equal(p.calls.at(-1).body.expectedRevision, 5); assert.equal(p.calls.at(-1).body.profile.phone, '02-1234-5678');
  } finally {dispose?.(); f.close();}
});

test('profile double clicks, in-flight edits and panel exit cannot turn an old response into a new save', async () => {
  const f = await setup(); let dispose, finish;
  try {
    const p = panelFixture(f), request = p.adapter.request;
    p.adapter.request = (path, body, signal) => body ? (p.calls.push({path, body, signal}), new Promise(resolve => {finish = resolve;})) : request(path, body, signal);
    dispose = mountResearchAccountPanel({id: 'profile.personal', container: p.container, adapter: p.adapter, services: f.services}); await dispose.ready;
    const name = p.container.querySelector('[name="name"]'), save = p.container.querySelector('[data-action="research-save-profile"]');
    name.value = '첫 저장'; save.click(); save.click(); await tick(); assert.equal(p.calls.filter(call => call.body).length, 1);
    name.value = '나중 입력'; finish({revision: 5, state: 'ACTIVE', profile: {...p.current.profile, name: '첫 저장'}}); await tick();
    assert.equal(name.value, '나중 입력'); assert.match(p.container.textContent, /새로 입력한 내용은 아직 저장/);
    save.click(); await tick(); const last = p.calls.at(-1); dispose(); assert.equal(last.signal.aborted, true);
    finish({revision: 6, state: 'ACTIVE', profile: {...p.current.profile, name: '나중 입력'}}); await tick(); assert.equal(p.container.childElementCount, 0);
    assert.equal(f.services.inspect().mountedFields, 0);
  } finally {dispose?.(); f.close();}
});

test('account and connections panels reuse account reads without inventing email or OAuth mutations', async () => {
  const f = await setup(); const cleanups = [];
  try {
    const p = panelFixture(f, {connections: [{provider: 'kakao', email: 'kept@example.com'}, '<img src=x onerror=alert(1)>']}), pushed = [];
    const account = mountResearchAccountPanel({id: 'profile.account', container: p.container, adapter: p.adapter, services: f.services, push: (...args) => pushed.push(args)}); cleanups.push(account); await account.ready;
    p.container.querySelector('[data-action="research-open-personal"]').click(); assert.deepEqual(pushed[0], ['profile.personal', '개인 정보']);
    assert.match(p.container.textContent, /이메일 변경 기능은 아직 연결/); account();
    const connections = mountResearchAccountPanel({id: 'profile.connections', container: p.container, adapter: p.adapter, services: f.services}); cleanups.push(connections); await connections.ready;
    assert.match(p.container.textContent, /카카오/); assert.match(p.container.textContent, /계정 연결·해제 기능은 아직 연결/);
    assert.equal(p.container.querySelector('img'), null); assert.equal(p.calls.some(call => call.body), false); assert.equal(f.calls.length, 0);
  } finally {for (const dispose of cleanups) dispose(); f.close();}
});

test('notification read state changes only after a matching server revision and retries retain the request key', async () => {
  const f = await setup(); let dispose, finish;
  try {
    const p = panelFixture(f), calls = [], unread = [], item = {id: 'notice-1', revision: 3, title: '알림', body: '확인할 내용', createdAt: '2026-11-22T00:00:00Z', readAt: null};
    const adapter = {message: () => '다시 시도해 주세요.', request(path, body, signal) {
      assert.equal(path, '/notifications'); calls.push({body, signal});
      return body ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({items: [structuredClone(item)]});
    }};
    dispose = mountResearchAccountPanel({id: 'notifications', container: p.container, adapter, services: f.services, setUnread: count => unread.push(count)}); await dispose.ready;
    const card = p.container.querySelector('[data-notification-id]'), read = p.container.querySelector('[data-action="research-read-notification"]');
    read.click(); read.click(); assert.equal(calls.filter(call => call.body).length, 1); assert.equal(card.dataset.read, 'false');
    finish({id: item.id, revision: 4}); await tick(); assert.equal(card.dataset.read, 'false'); assert.deepEqual(unread, [1]);
    const requestKey = calls.at(-1).body.requestKey; read.click(); assert.equal(calls.at(-1).body.requestKey, requestKey); assert.equal(calls.at(-1).body.expectedRevision, 3);
    finish({id: item.id, revision: 4, readAt: '2026-11-22T01:00:00Z'}); await tick();
    assert.equal(card.dataset.read, 'true'); assert.deepEqual(unread, [1, 0]); assert.equal(card.querySelector('button'), null);
  } finally {dispose?.(); f.close();}
});

test('releasing a quote subtree cancels raw regular email owners while root globals and parent fields survive', async () => {
  const pending = []; let hold = true;
  const f = await setup({fetcher: (url, init) => hold ? new Promise(resolve => pending.push({url, init, resolve})) : Promise.resolve(doh(url))});
  try {
    f.services.installRegularGlobals(f.window); const parent = f.services.mountPhone(f.input('phone')); parent.set('010-1234-5678');
    const child = f.document.createElement('section'); child.innerHTML = '<input id="quote-email">'; f.document.body.append(child);
    const input = child.querySelector('input'), email = f.window.OrderEmailUI.mount(input); input.value = 'a@example.com';
    const checking = email.check(); while (!pending.length) await tick();
    f.services.releaseWithin(child); assert.equal(f.window.OrderEmailUI.instance(input), undefined);
    assert.equal((await checking).discarded, true); assert.equal(f.services.hasRegularGlobals(f.window), true); assert.equal(parent.get(), '010-1234-5678');
    hold = false; for (const item of pending) item.resolve(doh(item.url));
    child.innerHTML = '<input id="new-quote-email">'; const fresh = f.window.OrderEmailUI.mount(child.querySelector('input')); child.querySelector('input').value = 'b@example.com';
    assert.equal((await fresh.check()).state, 'MX_ROUTE_FOUND'); f.services.releaseWithin(child);
    assert.equal(f.services.inspect().contact.mountedEmails, 0); assert.equal(f.services.inspect().mountedFields, 1);
  } finally {f.close();}
});

test('business source adapter preserves original markup and works after the actual browser bundler serialization', async () => {
  assert.equal(getResearchBusinessPanelMarkup(), businessDirectoryPanelMarkup());
  const {build} = createRequire(new URL('./build-tools/package.json', import.meta.url))('esbuild');
  const output = await build({entryPoints: [new URL('../src/server/research-app/business-panel-source.mjs', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', keepNames: true, write: false});
  const bundled = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
  const browser = await import('data:text/javascript;base64,' + Buffer.from(await bundled.getResearchBusinessPanelSource()).toString('base64'));
  assert.equal(browser.BUSINESS_PANEL_MARKUP, businessDirectoryPanelMarkup());
  assert.notEqual(browser.BUSINESS_SOURCE_IDENTITY.originalControllerSha256, browser.BUSINESS_SOURCE_IDENTITY.researchControllerSha256);
  assert.throws(() => browser.bootResearchBusinessDirectory(() => {}, {}, {}), /RESEARCH_BUSINESS_ADAPTER_REQUIRED/);
});

async function until(check) {
  for (let turn = 0; turn < 120; turn++) {if (check()) return; await tick();}
  assert.ok(check(), 'expected asynchronous state');
}

test('business initial add/detail/edit select only explicit records through the original dirty-aware actions', async () => {
  const f = await setup(); let dispose;
  try {
    const b = businessFixture(f), profile = name => ({name, contactPhone: '01012345678', storePhone: '', email: '', road: '', postal: '', detail: '', dropoff: '', regionSelection: null});
    b.adapter.fixture.configure({data: {businesses: [{id: 'record-a', revision: 2, profile: profile('첫 사업장')}, {id: 'record-b', revision: 5, profile: profile('선택 사업장')}]}});
    let confirmations = 0;
    const args = {container: b.container, adapter: b.adapter, services: f.services, loadModule, ask: () => {confirmations++; return false;}};
    dispose = mountResearchBusinessPanel({...args, initialState: 'edit', businessId: 'record-b'}); assert.equal(await dispose.ready, true);
    assert.equal(b.field('name').value, '선택 사업장'); assert.equal(f.services.mountPhone(b.field('contactPhone')).get(), '010-1234-5678'); assert.equal(dispose.dirty(), false);
    b.field('name').value = '작성 중'; b.container.querySelector('[data-business-id="record-a"]').click(); await tick();
    assert.equal(confirmations, 1); assert.equal(b.field('name').value, '작성 중', 'the existing confirmation prevents losing the open record draft'); dispose();
    dispose = mountResearchBusinessPanel({...args, initialState: 'add', businessId: 'record-b'}); await dispose.ready; assert.equal(b.field('name').value, ''); assert.equal(dispose.dirty(), false); dispose();
    dispose = mountResearchBusinessPanel({...args, initialState: 'detail', businessId: 'missing'}); await dispose.ready; assert.equal(b.field('name').value, ''); assert.match(b.status(), /찾지 못했어요/); dispose();
    dispose = mountResearchBusinessPanel({...args, initialState: 'edit'}); await dispose.ready; assert.equal(b.field('name').value, ''); assert.match(b.status(), /목록에서.*선택/);
    assert.equal(b.adapter.fixture.inspect().calls.some(call => call.method === 'POST'), false, 'opening a requested state must not save or invent a selected record');
  } finally {dispose?.(); f.close();}
});

test('business beforeLeave uses the panel confirmation, cancels by Escape and never disposes an unaccepted draft', async () => {
  const f = await setup(); let dispose;
  try {
    const b = businessFixture(f); dispose = mountResearchBusinessPanel({container: b.container, adapter: b.adapter, services: f.services, loadModule}); await dispose.ready;
    assert.equal(await dispose.beforeLeave({reason: 'close'}), true); b.field('name').value = '미저장 사업장';
    const cancelled = dispose.beforeLeave({reason: 'close'}), cancel = b.container.querySelector('[data-action="research-business-cancel"]');
    assert.ok(cancel); cancel.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    assert.equal(await cancelled, false); assert.equal(b.field('name').value, '미저장 사업장'); assert.equal(dispose.dirty(), true); assert.equal(b.container.querySelector('[role=alertdialog]'), null);
    const visiblePanel = f.document.createElement('section'); f.document.body.append(visiblePanel); b.container.remove();
    const accepted = dispose.beforeLeave({reason: 'close', confirmationContainer: visiblePanel});
    assert.ok(visiblePanel.querySelector('[role=alertdialog]'), 'a retained hidden ancestor asks on the visible stack page');
    visiblePanel.querySelector('[data-action="research-business-confirm"]').click();
    assert.equal(await accepted, true); assert.equal(b.field('name').value, '미저장 사업장', 'the caller disposes only after permission resolves');
    assert.equal(b.adapter.fixture.inspect().calls.some(call => call.method === 'POST'), false);
  } finally {dispose?.(); f.close();}
});
function businessFixture(f) {
  const w = f.window; w.eval(runtimes.accountFeedback); w.structuredClone = structuredClone;
  Object.defineProperty(w, 'crypto', {value: webcrypto});
  w.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  const install = function(context, options) {
    window.ORDER_APP_CONTEXT = context; window.ORDER_BRAND_ACCOUNT_CONTEXT = {};
    return {context, ready: Promise.resolve(), async roleRequest(path, body, signal) {
      const response = await options.fetch(context.endpoints.role + path, {method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, signal});
      const data = await response.json(); if (!response.ok) throw Error(data.error); return data;
    }};
  };
  const adapter = w.eval('(' + browserFunction(installQaFixtureAdapter) + ')({screen:"store-settings",state:"default",fixture:{persona:"buyer",authenticated:true,data:{businesses:[]}}},' + browserFunction(install) + ')');
  const container = f.document.createElement('div'); f.document.body.append(container);
  return {adapter, container, field: name => container.querySelector('[data-business-ref="business-' + name + '"]'),
    form: () => container.querySelector('[data-business-ref="business-form"]'), status: () => container.querySelector('[data-business-ref="business-status"]').textContent,
    submit() {this.form().dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));}};
}

test('business management saves full controllers and the original Q3 picker consumes the same adapter record', async () => {
  const f = await setup({address: {fetcher: async (_url, init) => json({version: 1, status: 'OK', reason: 'RESULTS', items: [juso()], page: JSON.parse(init.body).page, total: 1, hasMore: false})}});
  let dispose, adapter;
  try {
    const b = businessFixture(f); adapter = b.adapter;
    dispose = mountResearchBusinessPanel({container: b.container, adapter, services: f.services, loadModule}); assert.equal(await dispose.ready, true);
    b.field('name').value = '연구 매장'; f.services.mountPhone(b.field('contactPhone')).set('010-1234-5678'); f.services.mountPhone(b.field('storePhone')).set('02-1234-5678');
    f.services.mountEmail(b.field('email')).set('Case@example.com', {validate: false});
    const address = f.services.mountAddress({query: b.field('road')}); b.field('road').value = '서울 주소'; await address.search(); await address.choose(0); b.field('detail').value = '2층'; b.field('dropoff').value = '정문';
    assert.equal(dispose.dirty(), true); b.submit(); await until(() => b.status().includes('저장했습니다'));
    const rows = (await adapter.roleRequest('/businesses')).businesses; assert.equal(rows.length, 1);
    assert.equal(rows[0].profile.contactPhone, '010-1234-5678'); assert.equal(rows[0].profile.storePhone, '02-1234-5678'); assert.equal(rows[0].profile.email, 'Case@example.com');
    assert.equal(rows[0].profile.providerId, juso().providerId); assert.equal(rows[0].profile.addressProvider, 'JUSO');
    assert.equal(projectSavedBusiness(rows[0].profile).detail, '2층'); assert.equal(dispose.dirty(), false);
    let state = {locations: [], lines: [{id: 'kept-line'}], allocations: [{id: 'kept-allocation'}]};
    const app = {savedBusinessBridge: createSavedBusinessBridge({getState: () => state, guard: () => true,
      save: async (next, {canCommit}) => {assert.equal(canCommit(), true); state = structuredClone(next); return {ok: true};}, render() {},
      blankSite: () => ({status: 'NONE'}), addressFields: f.services.core.address.addressFields, addressStatus: f.services.core.address.addressStatus, simpleMode: false})};
    const anchor = f.document.createElement('div'); anchor.id = 'q3-sites'; f.document.body.append(anchor);
    const closers = new WeakMap();
    f.window.OrderModalShell = {bind(dialog, close) {closers.set(dialog, close);}, open(dialog) {dialog.open = true;}, close(dialog) {dialog.open = false;}, requestClose(dialog) {closers.get(dialog)?.();}};
    f.window.OrderCopyDialog = {create() {const dialog = f.document.createElement('dialog'); dialog.innerHTML = '<div class="qa-copy-accordion-area"></div><div data-copy-preview></div><div class="qa-copy-target-heading"></div><div class="qa-copy-targets"></div><p role="status"></p><button data-copy-cancel></button><button data-copy-apply></button>'; return dialog;}};
    f.window.fetch = async url => {assert.equal(String(url), adapter.context.endpoints.role + '/businesses'); return json(await adapter.roleRequest('/businesses'));};
    const picker = f.window.eval('(' + browserFunction(mountSavedBusinessPicker) + ')')(app); await picker.trigger.onclick();
    const checkbox = picker.dialog.querySelector('input'); assert.equal(checkbox.value, rows[0].id); checkbox.checked = true; checkbox.dispatchEvent(new f.window.Event('change', {bubbles: true}));
    await picker.dialog.querySelector('[data-copy-apply]').onclick();
    assert.equal(state.locations[0].contactPhone, '010-1234-5678'); assert.equal(state.locations[0].storePhone, '02-1234-5678'); assert.equal(state.locations[0].providerId, juso().providerId);
    assert.equal(state.locations[0].basicInfoDraft, true); assert.equal(state.locations[0].status, 'NONE'); assert.equal(state.lines[0].id, 'kept-line'); assert.equal(state.allocations[0].id, 'kept-allocation');
  } finally {dispose?.(); adapter?.fixture.dispose(); f.close();}
});

test('business retry/revision and dirty restoration keep original behavior after segmented input installation', async () => {
  const f = await setup(); let dispose, adapter;
  try {
    const b = businessFixture(f); adapter = b.adapter; const original = adapter.roleRequest, sent = []; let lose = true;
    adapter.roleRequest = async (path, body, signal) => {if (body) sent.push(structuredClone(body)); const result = await original(path, body, signal); if (body && lose) {lose = false; throw Error('OFFLINE_AFTER_COMMIT');} return result;};
    dispose = mountResearchBusinessPanel({container: b.container, adapter, services: f.services, loadModule, ask: () => true}); await dispose.ready;
    b.field('name').value = '재시도 매장'; f.services.mountPhone(b.field('storePhone')).set('010-1234-5678'); b.submit(); await until(() => b.status().includes('확인하지 못했습니다'));
    assert.equal(b.field('name').value, '재시도 매장'); assert.equal(dispose.dirty(), true); assert.equal(dispose.pending(), false);
    b.submit(); await until(() => b.status().includes('저장했습니다')); assert.deepEqual(sent[0], sent[1]);
    let stored = (await adapter.roleRequest('/businesses')).businesses[0]; assert.equal(stored.revision, 1);
    stored = {...stored, revision: 2, profile: {...stored.profile, name: '다른 창', storePhone: '01012345678'}}; adapter.fixture.configure({data: {businesses: [stored]}});
    b.field('name').value = '내 입력'; b.submit(); await until(() => b.status().includes('다른 탭'));
    assert.equal(sent.at(-1).expectedRevision, 1); assert.equal(b.field('name').value, '내 입력'); assert.equal(dispose.dirty(), true);
    b.container.querySelector('[data-business-ref="business-refresh"]').click(); await until(() => b.status().includes('새로 불러왔습니다')); assert.equal(b.field('name').value, '내 입력');
    b.container.querySelector('.business-card').click(); await tick(); assert.equal(b.field('name').value, '다른 창');
    assert.equal(f.services.mountPhone(b.field('storePhone')).get(), '010-1234-5678'); assert.equal(dispose.dirty(), false, 'formatting on restore is not an unsaved user edit');
  } finally {dispose?.(); adapter?.fixture.dispose(); f.close();}
});

test('business save blocks unselected addresses, owns asynchronous validation, and aborts before any write', async () => {
  const requests = []; let holdDns = true;
  const f = await setup({fetcher: (url, init) => holdDns ? new Promise(resolve => requests.push({url, init, resolve})) : Promise.resolve(doh(url))}); let dispose, adapter;
  try {
    const b = businessFixture(f); adapter = b.adapter; const original = adapter.roleRequest, posts = [];
    adapter.roleRequest = (path, body, signal) => {if (body) posts.push(body); return original(path, body, signal);};
    dispose = mountResearchBusinessPanel({container: b.container, adapter, services: f.services, loadModule}); await dispose.ready;
    b.field('name').value = '검증 매장'; b.field('road').value = '검색하지 않은 주소'; b.field('road').dispatchEvent(new f.window.Event('input', {bubbles: true}));
    b.submit(); await until(() => b.status().includes('검색 결과')); assert.equal(posts.length, 0);
    b.container.querySelector('[data-action="research-business-address-clear"]').click();
    f.services.mountPhone(b.field('contactPhone')).set('010-1234-5678');
    const email = f.services.mountEmail(b.field('email')); email.set('a@example.com', {validate: false}); b.submit(); await until(() => requests.length > 0);
    assert.equal(dispose.pending(), true); assert.equal(await dispose.beforeLeave({reason: 'close'}), false); assert.match(b.status(), /저장 결과/);
    b.container.querySelector('[data-business-ref="business-add"]').click(); assert.equal(b.field('name').value, '검증 매장');
    b.field('contactPhone').dispatchEvent(new f.window.CompositionEvent('compositionstart', {bubbles: true}));
    holdDns = false; for (const item of requests) item.resolve(doh(item.url)); await until(() => !dispose.pending());
    assert.equal(posts.length, 0); assert.match(b.status(), /확인 중 입력이 바뀌었습니다/);
    b.field('contactPhone').dispatchEvent(new f.window.CompositionEvent('compositionend', {bubbles: true}));
    holdDns = true; const count = requests.length; email.set('b@other.com', {validate: false}); b.submit(); await until(() => requests.length > count);
    dispose(); for (const item of requests) item.resolve(doh(item.url)); await tick();
    assert.equal(posts.length, 0); assert.equal(b.container.childElementCount, 0); assert.equal(f.services.inspect().mountedFields, 0); assert.equal(f.services.inspect().contact.mountedEmails, 0);
  } finally {dispose?.(); adapter?.fixture.dispose(); f.close();}
});
