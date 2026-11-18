import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderR3ProductPage,r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {quoteCommit,quoteSourceHashes} from '../src/server/r3-product-sources.mjs';
import {onRequest} from '../functions/ia/[[path]].js';

const prefix='/ia/r3-product/';
const nonce='nonceForPrivateReview';
const partition=html=>html.match(/data-r3-quote-partition="([a-f0-9]{64})"/)[1];

test('private product modes mount the real static template, sealed commit, scoped scripts and QA return',async()=>{
 for(const mode of ['simple','detailed']){
  const html=await renderR3ProductPage(nonce,mode,'opaque-checker');
  assert.match(quoteCommit,/^[a-f0-9]{40}$/);assert.ok(html.includes('data-r3-quote-commit="'+quoteCommit+'"'));
  assert.ok(html.includes('data-r3-quote-mode="'+mode+'"'));
  assert.ok(html.includes('nonce="'+nonce+'" type="module" src="'+prefix+'web/main.mjs"'));
  assert.match(html,/href="\/ia\?view=qa-lab"/);assert.ok(html.includes('id="quote-mode-switch"'));
  assert.ok(html.includes('data-code1-jelly="v2"'));assert.ok(html.includes('id="section-q4"'));
  assert.doesNotMatch(html,/opaque-checker|qa-lab-fixture|application\/importmap|<iframe/i);
 }
 await assert.rejects(()=>renderR3ProductPage('"><script>','simple','owner'));
 await assert.rejects(()=>renderR3ProductPage(nonce,'simple',''));
});

test('anonymous modes and every private module require an authenticated OWNER',async()=>{
 for(const path of ['/ia?view=simple-r3','/ia?view=detailed-r3',prefix+'web/main.mjs',prefix+'assets/iana-reference.json']){
  const response=await onRequest({request:new Request('https://review.invalid'+path),env:{}});
  if(path.startsWith(prefix))assert.equal(response.status,403);
  else{assert.equal(response.status,302);assert.match(response.headers.get('Location'),/returnView=(simple|detailed)-r3$/);}
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(await response.text(),'');
 }
});

test('transitive imports stay inside the private inventory and unknown paths return no data',async()=>{
 const pending=['web/main.mjs'],visited=new Set();
 while(pending.length){
  const path=pending.pop();if(visited.has(path))continue;visited.add(path);
  const response=r3ProductAsset(prefix+path);assert.equal(response.status,200,path);assert.equal(response.headers.get('content-type'),'text/javascript; charset=utf-8');
  const body=await response.text();
  for(const match of body.matchAll(/(?:import|export)\s*[^;'"]*?\sfrom\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)){
   const spec=match[1]||match[2];assert.match(spec,/^\.\.?\//);
   const url=new URL(spec,'https://review.invalid'+prefix+path);
   assert.ok(url.pathname.startsWith(prefix));pending.push(url.pathname.slice(prefix.length));
  }
 }
 assert.ok(visited.size>30);assert.ok(visited.has('web/quote-mode-switch.mjs'));
 for(const path of ['test/fixtures/qa-lab.mjs','build-identity.json','reference-pricebook.json','__proto__','web/../index.html','web/assets/CODE1_jelly_interactive.svg']){
  assert.equal(r3ProductAsset(prefix+path).status,404);
 }
 assert.equal((await r3ProductAsset(prefix+'assets/iana-reference.json').json()).manifest.version,'2026111800');
});

test('sealed production writer preserves per-mode confirmed data, across new instances, per owner',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'order-r3-product-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const key of Object.keys(quoteSourceHashes).filter(path=>path.endsWith('.mjs'))){
  const dst=join(directory,key);await mkdir(dirname(dst),{recursive:true});await writeFile(dst,await r3ProductAsset(prefix+key).text());
 }
 const {createBrowserStorage,emptyStoredPayload}=await import(pathToFileURL(join(directory,'web/storage.mjs')));
 const values=new Map(),store={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},locks={request:async(_name,_opt,fn)=>fn({})};
 const actor0=partition(await renderR3ProductPage(nonce,'simple','owner-A')),actor1=partition(await renderR3ProductPage(nonce,'simple','owner-B'));
 assert.notEqual(actor0,actor1);
 const previous=globalThis.document;t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 function writer(owner,{simple=false}={}){
  globalThis.document={documentElement:{dataset:{r3QuotePartition:owner}}};
  return createBrowserStorage({localStorage:store,sessionStorage:store,locks,crypto:globalThis.crypto,...(simple?{key:'order_simple_prework_0581'}:{})});
 }
 const simple=writer(actor0,{simple:true}),old=await simple.load();
 const data={...emptyStoredPayload(),lines:[{id:'egg1',housing:'1',size:'대란',pack:'30',qty:'6050',price:''}],current:'egg1'};
 const write=await simple.commit(data,{expectedRevision:old.revision,expectedToken:old.versionToken,transactionId:'r3-private-test'});
 assert.equal(write.ok,true);assert.equal(write.changed,true);
 assert.equal((await writer(actor0,{simple:true}).load()).data.lines[0].qty,'6050');
 assert.equal((await writer(actor0).load()).data.lines.length,0);
 assert.equal((await writer(actor1,{simple:true}).load()).data.lines.length,0);
 assert.equal(values.has('order_simple_prework_0581'),false);assert.equal(values.has('order_q1_q4_v1'),false);
});
