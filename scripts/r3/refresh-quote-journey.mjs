import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import * as data from '../../src/server/r3-ui/catalog.gen.mjs';
import {runtimes,frameCode} from '../../src/server/r3-ui/runtime.gen.mjs';
import {inputJourney,mountInputJourney} from './authored/quote-journey.mjs';
import {bootQaHost} from '../../src/server/r3-ui/host.mjs';
import {installReviewQuote,reviewQuoteFixture} from './authored/quote-result-fixture.mjs';
import {mountMagneticAction} from '../../src/server/order-engine/browser/magnetic-action.mjs';
import * as productSources from '../../src/server/r3-product-sources.mjs';
import {mountQuoteResult,quoteResultScreenCss} from '../../src/server/order-engine/browser/quote-result-screen.mjs';

const require=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const read=relative=>readFile(new URL(relative,import.meta.url),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const resultsOnly=process.argv.includes('--current-results-only');
if(typeof productSources.productBrandRuntime!=='string'||!productSources.productBrandRuntime.includes('OrderProductBrand'))throw Error('Seal the verified canonical product brand before refreshing result consumers.');
const [style,question]=await Promise.all(['quote-journey.css','quote-question-polish.css'].map(f=>read('./authored/'+f)));
const frames={...data.frames};
const modules={...(resultsOnly?{}:{quoteJourney:'('+mountInputJourney.toString()+')();'}),sharedQuoteResult:productSources.productBrandRuntime+'\nwindow.OrderProductBrand=OrderProductBrand;window.OrderMagneticAction=('+mountMagneticAction.toString()+');('+installReviewQuote.toString()+')('+mountQuoteResult.toString()+','+reviewQuoteFixture.toString()+');'};

function staticResult(state){
  const dom=new JSDOM('<div id="order-single" class="qa-screen" data-motion="on"><style>'+quoteResultScreenCss+'</style><div data-review-result data-quote-fixture="figma-20261118"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,root=w.document.querySelector('#order-single');
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const wrap=root.querySelector('[data-review-result]');wrap.dataset.view=state;
  w.eval(modules.sharedQuoteResult);
  const dispose=w.ORDER_DESIGN_MODULES[0].mount(root,state,{select(){}});
  const html=root.outerHTML;
  dispose?.();dom.window.close();
  return html;
}
const bodies=new Map();
const catalog=data.catalog.map(row=>{
  const isQuestion=['q1','q3','q4'].includes(row.screen),isInput=['q2','quote-review'].includes(row.screen),isResult=row.screen==='quote-result';
  if(resultsOnly&&!isResult)return row;
  if(!isQuestion&&!isInput&&!isResult)return row;
  const old=gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
  const head=old.match(/<header class="page-head">[\s\S]*?<\/header>/)?.[0];
  if(isInput&&!head)throw Error('Missing Order brand in '+row.id);
  if(isResult&&!bodies.has(row.state))bodies.set(row.state,staticResult(row.state));
  const body=isResult?bodies.get(row.state):isQuestion?old.replace(/<style id="r3-question-polish">[\s\S]*?<\/style>/,'')
    .replace('</main>','<style id="r3-question-polish">'+question+'</style></main>'):
    '<main id="order-single" class="qa-screen ds" data-motion="on"><style id="r3-journey">'+style+'</style><section class="page journey-page">'+head+inputJourney(row.screen,row.state)+'</section></main>';
  const current=digest(body),family=isResult?'sharedQuoteResult':isInput?'quoteJourney':row.runtimeFamily;
  const scriptHash=digest(frameCode.replace(/^function /,'')+(modules[family]||runtimes[family]||''));
  frames[current]=gzipSync(body).toString('base64');
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,digest([row.id,'current',current,data.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:true,runtimeFamily:family};
});
// Retain previous frame bytes. Immutable history modules own their old scripts
// and source hashes; this refresh changes only the selected current consumers.
for(const [file,changes] of [['catalog',{frames,catalog}],['runtime',{runtimes:{...runtimes,...modules},...(resultsOnly?{}:{hostCode:bootQaHost.toString()})}]]){
  const path=new URL('../../src/server/r3-ui/'+file+'.gen.mjs',import.meta.url);
  const next=(await readFile(path,'utf8')).split('\n').map(line=>{
    const name=/^export const (\w+)=/.exec(line)?.[1];
    return Object.hasOwn(changes,name)?'export const '+name+'='+JSON.stringify(changes[name])+';':line;
  }).join('\n');
  await writeFile(path,next);
}
console.log(JSON.stringify({scope:resultsOnly?'current-quote-results':'quote-journey',changedRows:catalog.filter((row,index)=>row.current!==data.catalog[index].current).length,retainedFrameBodies:Object.keys(data.frames).length}));
