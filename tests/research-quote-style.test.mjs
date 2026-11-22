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
  const withoutFilter=values=>values.map(states=>states.map(({filter,...value})=>value));
  assert.deepEqual(withoutFilter(after),withoutFilter(before),'active/inactive/entering/leaving geometry and transition ownership stay with the regular stylesheet');
  assert.equal(dom.window.getComputedStyle(other).filter,otherBefore,'catalog motion outside the quote retains its original filter');
 }finally{dom.window.close();}
});
