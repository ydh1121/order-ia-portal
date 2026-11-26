import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createCommonControlPaint} from '../src/server/r3-common-motion.mjs';
import {getProductUiBootstrap} from '../src/server/product-ui/bootstrap.gen.mjs';
import {researchAssets} from '../src/server/research-app/assets.gen.mjs';
import {mountNotificationPreferences} from '../src/server/research-app/notification-preferences-ui.mjs';
import {mountResearchArrowMotion} from '../src/server/research-app/interaction-polish.mjs';
import {mountResearchNotifications} from '../src/server/research-app/notifications.mjs';

const {JSDOM} = createRequire(new URL('./build-tools/package.json', import.meta.url))('jsdom');
const paintModule = gunzipSync(Buffer.from(researchAssets['r3-common-motion.mjs'], 'base64'));
const {createCommonControlPaint:createServedControlPaint} = await import('data:text/javascript;base64,' + paintModule.toString('base64'));

function fixture(t, html) {
  const dom = new JSDOM(html, {url:'https://research.invalid', runScripts:'outside-only', pretendToBeVisual:true});
  const window = dom.window, document = window.document;
  window.matchMedia = () => ({matches:true, addEventListener(){}, removeEventListener(){}});
  const cleanups = [];
  t.after(() => {for (const dispose of cleanups.reverse()) dispose(); window.ORDER_COMMON_MOTION?.destroy(); window.close();});
  return {window, document, cleanups, bootstrap(){window.eval(getProductUiBootstrap().script);}};
}

test('one paint change reaches persisted button and native preference switches across serialized and ESM consumers', async t => {
  const f = fixture(t, '<button id="persisted">저장 설정</button><main></main>');
  f.bootstrap();
  const paint = createCommonControlPaint(f.document), original = paint.switchTrack;
  assert.equal(paint, f.window.ORDER_COMMON_CONTROL_PAINT);
  assert.equal(createServedControlPaint(f.document), paint, 'the actual research asset shares the frozen bootstrap owner');
  // Change only the canonical factory. A consumer-local renderer would miss it.
  paint.switchTrack = () => {const track = original(); track.dataset.sharedPaintProof = 'switch'; return track;};
  const button = f.document.querySelector('#persisted');
  f.cleanups.push(f.window.ORDER_COMMON_MOTION.persistedSwitch(button, {value:false, save:async value => ({value})}).destroy);
  const preferences = mountNotificationPreferences({container:f.document.querySelector('main'), adapter:{request:async () => ({revision:0, updatedAt:null, preferences:{price:false,news:false,benefits:false}})}});
  f.cleanups.push(preferences); await preferences.ready;
  const tracks = [...f.document.querySelectorAll('.r3-switch-track')];
  assert.equal(tracks.length, 4);
  assert.ok(tracks.every(track => track.dataset.sharedPaintProof === 'switch'));
  assert.ok(tracks.every(track => track.getAttribute('aria-hidden') === 'true' && track.children.length === 1 && track.firstElementChild.className === 'r3-switch-thumb'));
  assert.deepEqual(tracks.map(track => {
    const outer = f.window.getComputedStyle(track), thumb = f.window.getComputedStyle(track.firstElementChild);
    return [outer.width, outer.height, thumb.width, thumb.height];
  }), Array.from({length:4}, () => ['36px','22px','16px','16px']));
  assert.equal(button.getAttribute('role'), 'switch');
  assert.deepEqual([...f.document.querySelectorAll('input')].map(input => [input.type,input.name,input.getAttribute('role')]), [['checkbox','price','switch'],['checkbox','news','switch'],['checkbox','benefits','switch']]);
});

test('one chevron change reaches every live consumer while each caller keeps its original SVG variant', async t => {
  const f = fixture(t, '<main id="order-single"><button data-app-back>이전</button></main><section id="admin"><nav data-pm-nav><a href="#home">현황</a></nav><button data-pm-learn>자세히</button></section><section id="notifications"></section>');
  const paint = createServedControlPaint(f.document), original = paint.chevron;
  assert.equal(createCommonControlPaint(f.document), paint, 'the served export runs without a surrounding motion initializer');
  paint.chevron = options => {const svg = original(options); svg.dataset.sharedPaintProof = 'chevron'; return svg;};
  f.bootstrap();
  assert.equal(f.window.ORDER_COMMON_CONTROL_PAINT, paint, 'the frozen bootstrap reuses the ESM paint owner');
  f.cleanups.push(mountResearchArrowMotion(f.document));
  f.cleanups.push(f.window.ORDER_ADMIN_MOTION.mount(f.document.querySelector('#admin'), {reduced:() => true}).destroy);
  const now = '2026-11-26T00:00:00.000Z';
  const item = {id:'shared-paint-notice',revision:1,title:'공통 모듈 검증',body:'로컬 계약 검증',createdAt:now,readAt:now};
  const reader = mountResearchNotifications({container:f.document.querySelector('#notifications'), adapter:{request:async () => ({items:[item]})}, now:() => Date.parse(now)});
  f.cleanups.push(reader); assert.equal(await reader.ready, true);
  f.document.querySelector('[data-notification-id]').click();
  const variants = [
    ['#order-single .t-learn-chevron svg', '20','1.7','round','round','false'],
    ['.research-notification-back-direction svg', '20','1.8','round',null,null],
    ['#admin nav .t-learn-chevron svg', '16','1.5',null,null,null],
    ['#admin [data-pm-learn] .t-learn-chevron svg', '16','1.5',null,null,null],
  ];
  for (const [selector,size,stroke,linecap,linejoin,focusable] of variants) {
    const svg = f.document.querySelector(selector); assert.ok(svg, selector);
    assert.equal(svg.dataset.sharedPaintProof, 'chevron', selector);
    assert.deepEqual(['width','height','viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','focusable'].map(name => svg.getAttribute(name)), [size,size,'0 0 16 16','none','currentColor',stroke,linecap,linejoin,focusable], selector);
    assert.deepEqual([...svg.children].map(path => [path.getAttribute('class'),path.getAttribute('d')]), [['t-learn-arm t-learn-arm-top','M6 4L10 8'],['t-learn-arm t-learn-arm-bot','M10 8L6 12']]);
  }
});
