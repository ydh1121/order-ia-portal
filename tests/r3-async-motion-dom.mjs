// Local integration for promise settlement, retries and retention; no network or real workspace.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {signedWorkspace,origin} from './r3-business-identities.fixture.mjs';
const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const fixture=signedWorkspace({emptyPriceCatalog:true});
const dom=new JSDOM(renderR3PricePage('motion-test-only'),{url:origin+'/ia?view=pricing-r3',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
const w=dom.window,doc=w.document,$=selector=>doc.querySelector(selector),events=[];
const wait=async(predicate,description)=>{for(let i=0;i<180;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(description+' · '+$('#notice').textContent);};
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.crypto.randomUUID=()=>crypto.randomUUID();w.confirm=()=>true;w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;
doc.addEventListener('r3:async-state',e=>events.push({element:e.target.id||e.target.dataset.action,...e.detail}));
let gate=null,queued=null;
w.fetch=async(url,options={})=>{
 const headers=new Headers(options.headers);headers.set('Cf-Access-Jwt-Assertion',fixture.assertion('supplier'));
 if(options.method==='POST')headers.set('Origin',origin);
 const perform=()=>handleIaRequest(new Request(new URL(url,origin),{...options,signal:undefined,headers}),fixture.env,{fetcher:fixture.certs});
 if(gate?.(url,options)){const promise=new Promise((resolve,reject)=>{queued={pass:()=>perform().then(resolve,reject),fail:()=>resolve(Response.json({error:'SERVICE_UNAVAILABLE'},{status:503}))};});return promise;}
 return perform();
};
try{
 gate=url=>url.endsWith('/desk');
 for(const script of doc.scripts)w.eval(script.textContent);
 await wait(()=>queued,'initial read');assert.equal($('#price-workspace').dataset.asyncRegion,'pending');
 gate=null;queued.pass();
 await wait(()=>!$('#registerProduct').disabled&&!$('#price-registration').hidden,'registration form');
 for(const [id,value] of Object.entries({setupSupplier:'검수 공급처',setupOrigin:'검수 출고장',setupProduct:'검수 계란',setupShell:'4',setupPack:'30'}))$('#'+id).value=value;
 $('#registerProduct').click();await wait(()=>$('#notice').textContent.includes('새 가격표에 단가'),'first registration');
 const cell=$('#matrix input[data-r="0"][data-c="2"]');
 cell.value='1250';cell.dispatchEvent(new w.Event('input',{bubbles:true}));
 const button=$('[data-action=save]');gate=(url,options)=>url.endsWith('/version')&&options.method==='POST';queued=null;
 button.click();await wait(()=>queued,'version POST');assert.equal(button.dataset.asyncPhase,'pending');
 button.click();assert.equal(events.filter(e=>e.element==='save').length,1);queued.pass();
 await wait(()=>$('#current').textContent.includes('r1')&&!button.disabled,'saved r1');
 assert.equal(cell,$('#matrix input[data-r="0"][data-c="2"]'));
 $('#shippingTab').click();$('#groupBasis').value='SITE';$('#groupBasis').dispatchEvent(new w.Event('input',{bubbles:true}));
 queued=null;button.click();await wait(()=>queued,'freight POST');queued.fail();
 await wait(()=>button.dataset.asyncPhase==='error'&&!button.disabled,'error with draft preserved');assert.equal($('#groupBasis').value,'SITE');
 queued=null;button.click();await wait(()=>queued,'freight retry');queued.pass();
 await wait(()=>$('#current').textContent.includes('r2')&&!button.disabled,'saved r2');
 const phases=events.filter(e=>e.element==='save');
 assert.deepEqual(phases.map(e=>e.phase),['pending','success','pending','error','pending','success']);
 assert.equal(phases[2].requestId,phases[4].requestId);
 assert.equal($('#groupBasis').value,'SITE');
 const output=new URL('../artifacts/motion-live/price/',import.meta.url);mkdirSync(output,{recursive:true});
 writeFileSync(new URL('dom-receipt.json',output),JSON.stringify({source:'normal price HTML, signed in-process SQLite fixture, JSDOM; no live writes',phases,retainedMatrixCell:true,serverRevision:2},null,2));
 console.log('PASS: actual rendered desk, response phases, persistent matrix cell, freight failure, same-key retry and r2.');
}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
