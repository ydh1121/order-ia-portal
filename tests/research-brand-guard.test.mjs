import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createOrderBrand} from '../src/server/order-engine/browser/brand.mjs';
import {brandAccountMenuCss} from '../src/server/order-engine/browser/brand-account-menu.mjs';
import {researchBrandSource} from '../src/server/research-app/brand-source-adapter.mjs';
const {JSDOM} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const original = await readFile(new URL('../src/server/order-engine/browser/brand-account-menu.mjs', import.meta.url), 'utf8');
const research = await import('data:text/javascript;base64,' + Buffer.from(researchBrandSource(original)).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, beforeLeave) {
  const dom = new JSDOM('<main id="order-single"><header></header><input id="parent-draft" value="parent"><button id="outside">Outside</button></main>', {pretendToBeVisual: true}), w = dom.window, doc = w.document;
  w.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  const brand = createOrderBrand(doc); doc.querySelector('header').append(brand);
  const entries = [], api = research.mountBrandAccountMenu(brand, {authenticated: true, reducedMotion: true, jelly: {}, renderPanel({id, container, signal}) {
    const input = doc.createElement('input'); input.value = 'dirty-' + id; container.append(input);
    const entry = {id, input, signal, disposed: 0}; entries.push(entry);
    const dispose = () => {entry.disposed++;}; dispose.beforeLeave = context => beforeLeave(entry, context); return dispose;
  }});
  t.after(() => {api.destroy(); w.close();});
  api.open('manage.business'); await tick(); await tick();
  return {w, doc, brand, api, entries};
}

test('the research guard preserves canonical CSS and rejects a changed source seam', () => {
  assert.equal(research.brandAccountMenuCss, brandAccountMenuCss);
  assert.throws(() => researchBrandSource(original.replace('function pop(settings={})', 'function changedPop(settings={})')), /RESEARCH_BRAND_SOURCE_CHANGED/);
  assert.equal(original.includes('requestClose'), false, 'the canonical source is not edited');
});

test('the research menu starts at the logo ink and expands below the unchanged application header', async t => {
  const f=await fixture(t,()=>true),header=f.doc.querySelector('header');
  header.id='order-app-header';
  header.getBoundingClientRect=()=>({left:0,top:0,right:390,bottom:78,width:390,height:78});
  Object.defineProperty(f.w,'innerWidth',{value:390});Object.defineProperty(f.w,'innerHeight',{value:844});
  f.api.trigger.getBoundingClientRect=()=>({left:310,top:18,right:370,bottom:62,width:60,height:44});
  const boxes=[
    {left:314.125,top:29.25,right:334.875,bottom:50,width:20.75,height:20.75},
    {left:329.875,top:29.25,right:350.625,bottom:50,width:20.75,height:20.75},
    {left:345.5,top:29.25,right:366.25,bottom:50,width:20.75,height:20.75}
  ];
  [...f.api.trigger.querySelectorAll('g > path')].forEach((path,index)=>{path.getBoundingClientRect=()=>boxes[index];});
  await f.api.requestClose({immediate:true});f.api.open();await tick();
  const panel=f.api.panel,value=key=>parseFloat(panel.style.getPropertyValue(key));
  assert.equal(parseFloat(panel.style.top),86,'the expanded menu leaves all header controls above it');
  assert.equal(parseFloat(panel.style.top)+value('--obm-start-y'),29.25,'the closed surface retains the actual logo top');
  assert.equal(parseFloat(panel.style.left)+value('--obm-open-w')+value('--obm-start-x'),366.25,'the closed surface retains the actual logo right');
  assert.equal(value('--obm-closed-w'),52.125);assert.equal(value('--obm-closed-h'),20.75,'the ink, not the hit box, defines the starting shape');
  assert.deepEqual(header.getBoundingClientRect(),{left:0,top:0,right:390,bottom:78,width:390,height:78});
  await f.api.requestClose({immediate:true});header.removeAttribute('id');f.api.open();await tick();
  assert.equal(parseFloat(panel.style.top),29.25,'a non-application host keeps its canonical ink-top placement');
});

test('close waits for the panel guard, coalesces repeated dismissal and preserves cancelled input', async t => {
  const decisions = [], f = await fixture(t, () => new Promise(resolve => decisions.push(resolve))), entry = f.entries[0], parent = f.doc.getElementById('parent-draft');
  const pending = f.api.requestClose({immediate: true}); await tick();
  f.api.close({immediate: true}); f.api.close(); await tick();
  assert.equal(decisions.length, 1); assert.equal(f.api.inspect().phase, 'open'); assert.equal(entry.disposed, 0); assert.equal(entry.input.value, 'dirty-manage.business');
  decisions.shift()(false); assert.equal(await pending, false); assert.equal(entry.input.isConnected, true); assert.equal(entry.signal.aborted, false);
  const accepted = f.api.requestClose({immediate: true}); await tick(); decisions.shift()(true); assert.equal(await accepted, true);
  assert.equal(f.api.inspect().phase, 'closed'); assert.equal(entry.disposed, 1); assert.equal(entry.signal.aborted, true); assert.equal(parent.value, 'parent');
  assert.equal(await f.api.requestClose({immediate: true}), true, 'an already closed menu does not ask twice');
});

test('outside pointer, Escape, Back and an edge swipe all retain a vetoed business page', async t => {
  let allowed = false, checks = 0; const f = await fixture(t, () => {checks++; return allowed;}), entry = f.entries[0];
  f.doc.getElementById('outside').dispatchEvent(new f.w.MouseEvent('pointerdown', {bubbles: true})); await tick();
  f.api.panel.dispatchEvent(new f.w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await tick();
  f.api.back(); await tick(); assert.equal(checks, 3); assert.equal(entry.input.isConnected, true); assert.equal(entry.disposed, 0);
  const slider = f.api.panel.querySelector('.obm-stack'); slider.getBoundingClientRect = () => ({left: 0, top: 0, width: 320, height: 400, right: 320, bottom: 400});
  for (const [type, x] of [['pointerdown', 2], ['pointermove', 180], ['pointerup', 210]]) {
    const event = new f.w.MouseEvent(type, {button: 0, clientX: x, clientY: 30, bubbles: true, cancelable: true}); Object.defineProperty(event, 'pointerId', {value: 1}); Object.defineProperty(event, 'isPrimary', {value: true}); slider.dispatchEvent(event);
  }
  await tick(); assert.equal(checks, 4); assert.equal(f.api.inspect().page, 'manage.business'); assert.equal(entry.input.value, 'dirty-manage.business'); assert.equal(entry.disposed, 0);
  allowed = true; assert.equal(await f.api.requestBack(), true); assert.equal(f.api.inspect().page, 'root'); assert.equal(entry.disposed, 1);
});

test('closing checks retained ancestor pages and late permission cannot dispose a replacement or destroyed menu', async t => {
  let allowBusiness = false; const f = await fixture(t, entry => entry.id === 'manage.business' ? allowBusiness : true), business = f.entries[0];
  f.api.show('manage.payments'); await tick(); await tick();
  assert.equal(await f.api.requestClose({immediate: true}), false); assert.equal(business.signal.aborted, false); assert.equal(business.disposed, 0); assert.equal(f.api.inspect().page, 'manage.payments');
  assert.equal(await f.api.requestBack(), true); assert.equal(f.api.inspect().page, 'manage.business'); assert.equal(business.input.isConnected, true); assert.equal(business.input.value, 'dirty-manage.business');
  let resolve; f.api.update({beforeLeave: () => new Promise(done => {resolve = done;})}); allowBusiness = true;
  const pending = f.api.requestClose({immediate: true}); await tick(); f.api.destroy(); resolve(true); assert.equal(await pending, false); assert.equal(business.disposed, 1); assert.equal(f.doc.getElementById('parent-draft').value, 'parent');
});

test('access updates await guarded stack cleanup and stop on pending or cancelled business input', async t => {
  let saving = true; const checks = [], decisions = [];
  const f = await fixture(t, (entry, context) => {
    checks.push([entry.id, context.reason]);
    if (entry.id !== 'manage.business') return true;
    if (saving) return false;
    return new Promise(resolve => decisions.push(resolve));
  }), business = f.entries[0];
  f.api.show('manage.payments'); await tick(); await tick(); const payments = f.entries[1];
  const revoke = () => runInNewContext('api.update({canAccess: id => id !== "manage"})', {api: f.api}, {timeout: 500});
  // A timeout also makes the old synchronous while/pop regression fail without
  // hanging the Node runner while the asynchronous panel guard waits.
  revoke(); revoke(); await tick(); await tick();
  assert.deepEqual(checks, [['manage.payments', 'access'], ['manage.business', 'access']]);
  assert.equal(payments.disposed, 1); assert.equal(payments.signal.aborted, true);
  assert.equal(f.api.inspect().page, 'manage.business'); assert.equal(business.disposed, 0);
  assert.equal(business.signal.aborted, false); assert.equal(business.input.value, 'dirty-manage.business');
  assert.equal(f.api.show('manage.payments'), false, 'revoked access still prevents opening another protected page');
  await tick(); assert.equal(checks.length, 2, 'a pending save veto does not restart the cleanup loop');

  saving = false; revoke(); revoke(); await tick(); assert.equal(decisions.length, 1);
  decisions.shift()(false); await tick(); await tick();
  assert.equal(business.input.isConnected, true); assert.equal(business.disposed, 0);
  assert.equal(checks.length, 3, 'cancelling does not repeatedly ask to discard the same draft');

  revoke(); await tick(); decisions.shift()(true); await tick(); await tick();
  assert.deepEqual(f.api.inspect().stack, ['root']); assert.equal(business.disposed, 1);
  assert.equal(f.api.panel.querySelector('[data-obm-item="manage"]').hidden, true);
  assert.equal(business.signal.aborted, true); assert.equal(f.doc.getElementById('parent-draft').value, 'parent');
});

test('restored access invalidates a late discard approval without approving the next user dismissal', async t => {
  const decisions = [], f = await fixture(t, () => new Promise(resolve => decisions.push(resolve))), entry = f.entries[0];
  runInNewContext('api.update({canAccess: id => id !== "manage.business"})', {api: f.api}, {timeout: 500});
  await tick(); assert.equal(decisions.length, 1);
  f.api.update({canAccess: () => true}); decisions.shift()(true); await tick(); await tick();
  assert.equal(f.api.inspect().page, 'manage.business'); assert.equal(entry.disposed, 0);
  assert.equal(entry.input.value, 'dirty-manage.business'); assert.equal(entry.signal.aborted, false);
  const dismissed = f.api.requestBack(); await tick();
  assert.equal(decisions.length, 1, 'an obsolete access cleanup must not mark the draft as approved for later disposal');
  decisions.shift()(false); assert.equal(await dismissed, false); assert.equal(entry.input.isConnected, true);
});
