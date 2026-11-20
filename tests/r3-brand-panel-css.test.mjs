import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {cssGzip,cssHash} from '../src/server/r3-ui/catalog.gen.mjs';
import {brandPanelUiCss,brandPanelUiSource} from '../src/server/order-engine/browser/brand-panel-ui.gen.mjs';
import {brandAccountMenuCss} from '../src/server/order-engine/browser/brand-account-menu.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url)),{parse}=require('rrweb-cssom'),{JSDOM}=require('jsdom');
test('every copied canonical UI selector stays inside the account panel; animations and tokens cannot leak globally',()=>{
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(brandPanelUiSource.sourceSha256,cssHash);assert.equal(hash(brandPanelUiCss),brandPanelUiSource.sha256);
  assert.equal(hash(gunzipSync(Buffer.from(cssGzip,'base64'))),cssHash);
  let rules=0,animations=0;
  function walk(list){for(const rule of list){
    if(rule.type===1){assert.ok(rule.selectorText.startsWith('.obm-panel.ds'),rule.selectorText);assert.doesNotMatch(rule.selectorText,/:root|(^|,)\s*(?:html|body)\b/);rules++;}
    else if(rule.type===7){assert.ok(rule.name.startsWith('obm-ui-'));animations++;}
    else{assert.ok([4,12,17].includes(rule.type));walk(rule.cssRules);}
  }}
  walk(parse(brandPanelUiCss).cssRules);assert.equal(rules,brandPanelUiSource.styleRuleCount);assert.equal(animations,brandPanelUiSource.animationCount);
  for(const selector of ['.obm-panel.ds .field','.obm-panel.ds .btn','.obm-panel.ds .sr-only','.obm-panel.ds .t-input'])assert.ok(brandPanelUiCss.includes(selector),selector);
  assert.match(brandPanelUiCss,/prefers-reduced-motion/);
});
test('loading panel styles preserves existing quote controls and keeps canonical panel button geometry',()=>{
  const originalCss=gunzipSync(Buffer.from(cssGzip,'base64')).toString();
  const reference=new JSDOM('<style>'+originalCss+'</style><main class="ds"><button class="btn primary">저장</button></main>');
  const doc=new JSDOM('<style>.btn{min-height:17px;border-radius:3px;font-weight:400}body{background:rgb(1,2,3)}</style><main class="ds" id="quote"><button class="btn primary" id="outside">견적</button></main><div class="obm-panel ds"><button class="btn primary" id="inside">저장</button></div>');
  const before=doc.window.getComputedStyle(doc.window.document.querySelector('#outside')),old=[before.minHeight,before.borderRadius,before.fontWeight],background=doc.window.getComputedStyle(doc.window.document.body).backgroundColor;
  const style=doc.window.document.createElement('style');style.textContent=brandPanelUiCss+'\n'+brandAccountMenuCss;doc.window.document.head.append(style);
  const after=doc.window.getComputedStyle(doc.window.document.querySelector('#outside'));assert.deepEqual([after.minHeight,after.borderRadius,after.fontWeight],old);assert.equal(doc.window.getComputedStyle(doc.window.document.body).backgroundColor,background);
  const canonical=reference.window.getComputedStyle(reference.window.document.querySelector('button')),inside=doc.window.getComputedStyle(doc.window.document.querySelector('#inside'));
  assert.deepEqual([inside.minHeight,inside.borderRadius,inside.fontWeight],[canonical.minHeight,canonical.borderRadius,canonical.fontWeight]);
  const panel=doc.window.getComputedStyle(doc.window.document.querySelector('.obm-panel'));assert.equal(panel.position,'fixed');assert.equal(panel.minHeight,'0');reference.window.close();doc.window.close();
});
