import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {cssGzip} from '../src/server/product-ui/catalog.gen.mjs';
import {quoteFiles} from '../src/server/r3-product-sources.mjs';
import {getResearchQuoteMarkup} from '../src/server/research-app/quote-source-adapter.mjs';
import {researchQuoteCss} from '../src/server/research-app/quote-style.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const inflate=value=>gunzipSync(Buffer.from(value,'base64')).toString();

test('composed quote route pages exclude catalog blur while preserving original route states and unrelated motion',()=>{
 // Read the actual route rules. Leave unrelated modern CSS and reduced-motion
 // media rules out of this DOM cascade check; native media/layout stays in CI.
 const catalogRules=[...inflate(cssGzip).matchAll(/(?:^|\n)(\.t-page-slide[^{}]*\{[^{}]*\})/g)].map(match=>match[1]).join('\n');
 const regularRules=[...inflate(quoteFiles['web/styles.css']).matchAll(/(?:^|\n)((?:#app\.t-page-slide[^{}]*|\.t-page-slide)\{[^{}]*\})/g)].map(match=>match[1]).join('\n');
 assert.match(catalogRules,/filter: blur/);assert.match(regularRules,/> \.t-page\.active/);
 const sample='<div class="t-page-slide" data-page="1"><section class="t-page" data-page-id="2" id="unrelated-page"></section></div>';
 const dom=new JSDOM('<!doctype html><style>'+catalogRules+'\n'+regularRules+'</style><section id="order-app-quote"><div data-research-quote>'+getResearchQuoteMarkup()+'</div></section>'+sample);
 try{
  const {document}=dom.window,pages=['page-home','page-form','page-result'].map(id=>document.getElementById(id));
  const states=['','active','entering','leaving'],properties=['position','visibility','opacity','pointerEvents','transform','transition','display'];
  const inspect=()=>pages.map(page=>states.map(state=>{
   page.classList.remove('active','entering','leaving');if(state)page.classList.add(state);
   const css=dom.window.getComputedStyle(page);return {filter:css.filter,...Object.fromEntries(properties.map(key=>[key,css[key]]))};
  }));
  const before=inspect(),other=document.getElementById('unrelated-page'),otherBefore=dom.window.getComputedStyle(other).filter;
  assert.ok(before.every(values=>values.every(value=>value.filter.includes('blur('))),'the original composed rules reproduce the leaked filter');
  const correction=document.createElement('style');correction.textContent=researchQuoteCss;document.head.append(correction);
  const after=inspect();
  assert.ok(after.every(values=>values.every(value=>value.filter==='none')));
  assert.equal(dom.window.getComputedStyle(document.getElementById('quote-mode-switch')).display,'none','C622 removes the duplicate form switch while retaining its regular command binding');
  const withoutFilter=values=>values.map(states=>states.map(({filter,...value})=>value));
  assert.deepEqual(withoutFilter(after),withoutFilter(before),'active/inactive/entering/leaving geometry and transition ownership stay with the regular stylesheet');
  assert.equal(dom.window.getComputedStyle(other).filter,otherBefore,'catalog motion outside the quote retains its original filter');
 }finally{dom.window.close();}
});

test('research quote cards, add regions and egg choices override the current regular rules only inside the quote workspace',()=>{
 const regular=inflate(quoteFiles['web/styles.css']);
 const relevant=[...regular.matchAll(/(?:^|\n)((?:\.sku-editor \.q1-egg|\.subaction|\.t-acc\[data-status="active"\])\{[^{}]*\})/g)].map(match=>match[1]).join('\n');
 assert.match(relevant,/stroke:#aeb4be/);assert.match(relevant,/fill:#f3eee4/);
 const egg='<div class="sku-editor"><button class="pick" aria-pressed="false"><svg class="q1-egg"></svg></button><button class="pick" aria-pressed="true"><svg class="q1-egg"></svg></button></div>';
 const dom=new JSDOM('<!doctype html><style>'+relevant+'\n'+researchQuoteCss+'</style><section id="order-app-quote"><div data-research-quote><section id="page-form"><div class="stack"><section class="t-acc" data-status="active"><button class="accordion-trigger">품목</button></section></div><button id="add-line" class="subaction">계란 추가</button><button id="add-site" class="subaction">+ 사업장 추가</button>'+egg+'<button id="q3-next" hidden>완료</button><button id="q4-next" hidden>완료</button></section></div></section><section id="unrelated">'+egg+'</section>');
 try{
  const w=dom.window,d=w.document,scope=d.querySelector('[data-research-quote]');
  assert.equal(w.getComputedStyle(d.querySelector('#page-form')).backgroundColor,'rgb(255, 255, 255)');
  assert.equal(w.getComputedStyle(scope.querySelector('.t-acc')).borderWidth,'0px');
  assert.notEqual(w.getComputedStyle(scope.querySelector('.t-acc')).boxShadow,'none','white accordions retain depth on the white page');
  assert.match(w.getComputedStyle(scope.querySelector('.t-acc')).boxShadow,/12px/);
  for(const id of ['add-line','add-site']){const css=w.getComputedStyle(d.getElementById(id));assert.equal(css.width,'100%');assert.equal(css.minHeight,'60px');assert.equal(css.borderStyle,'dashed');}
  assert.equal(w.getComputedStyle(scope.querySelector('[aria-pressed=false] .q1-egg')).fill,'#bfc7d1');
  assert.equal(w.getComputedStyle(scope.querySelector('[aria-pressed=true] .q1-egg')).fill,'white');
  for(const element of scope.querySelectorAll('.q1-egg'))assert.equal(w.getComputedStyle(element).stroke,'none');
  assert.equal(w.getComputedStyle(d.querySelector('#unrelated .q1-egg')).stroke,'#aeb4be');
  for(const id of ['q3-next','q4-next'])assert.equal(w.getComputedStyle(d.getElementById(id)).display,'none');
 }finally{dom.window.close();}
});

test('Q1 errors highlight individual choices while saved purchase tags stay one row and use the original action surface',()=>{
 const dom=new JSDOM('<!doctype html><style>'+researchQuoteCss+'</style><section id="order-app-quote"><div data-research-quote><section id="page-form"><div class="stack"><section id="section-q1" class="t-acc" data-order-error-stage="true"><button class="accordion-trigger"><span class="stage-check"></span><span class="qcopy"><strong>계란 규격</strong></span><span class="t-acc-chevron"></span></button><div class="sku-editor"><div class="picks" aria-invalid="true"><button class="pick" aria-invalid="true">1번</button><button class="pick" aria-invalid="true">2번</button></div></div><div id="added-lines"><div class="sku-entry" data-saved-row><div class="sku-entry-copy"><div class="sku-name">1번 · 대란 · 30구</div><div class="saved-quantity-tags"><span>월 100판</span><span>월 구매액 500,000원</span></div></div><div class="saved-row-actions"><button class="code1-text-action">수정</button><button class="code1-text-action">삭제</button></div></div></div></section></div></section></div></section>');
 try{
  const w=dom.window,d=w.document,group=d.querySelector('.picks'),choice=group.querySelector('.pick'),tags=d.querySelector('.saved-quantity-tags');
  assert.equal(w.getComputedStyle(group).borderWidth,'0px');assert.equal(w.getComputedStyle(group).boxShadow,'none');
  assert.equal(w.getComputedStyle(choice).borderWidth,'1px');assert.equal(w.getComputedStyle(choice).borderStyle,'solid');
  assert.equal(w.getComputedStyle(tags).flexWrap,'nowrap');assert.equal(w.getComputedStyle(d.querySelector('.sku-entry-copy')).alignContent,'center');
  assert.equal(d.querySelectorAll('.saved-quantity-tags button').length,0,'quantity tags never acquire dismiss controls');
 }finally{dom.window.close();}
});
