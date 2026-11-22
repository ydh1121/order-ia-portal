import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {quoteFiles} from '../src/server/r3-product-sources.mjs';
import {extendQuoteSource} from '../src/server/r3-product-extensions.mjs';
import {getResearchQuoteSource,getResearchQuoteIntegrationSource} from '../src/server/research-app/quote-source-adapter.mjs';
const {build}=createRequire(new URL('./build-tools/package.json',import.meta.url))('esbuild');
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const code="export * from './src/server/research-app/quote-repository.mjs';export * from './src/server/research-app/saved-quote-panel.mjs';export {createResearchQuoteTransport} from './src/server/research-app/quote-workspace.mjs';export * as regularStorage from '/ia/research-assets/web/storage.mjs';";
const compiled=await build({stdin:{contents:code,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',globalName:'RepositoryTest',target:'es2022',logLevel:'silent',plugins:[{
  name:'sealed-regular-storage',setup(builder){
    builder.onResolve({filter:/^\/ia\/research-assets\//},args=>({path:args.path.slice('/ia/research-assets/'.length),namespace:'regular'}));
    builder.onResolve({filter:/^\./,namespace:'regular'},args=>({path:posix.normalize(posix.join(posix.dirname(args.importer),args.path)),namespace:'regular'}));
    builder.onLoad({filter:/.*/,namespace:'regular'},args=>({contents:args.path==='research/quote-integrations.mjs'?getResearchQuoteIntegrationSource():getResearchQuoteSource(args.path,extendQuoteSource(args.path,gunzipSync(Buffer.from(quoteFiles[args.path],'base64')).toString())),loader:'js'}));
  }
}]});
const clone=value=>JSON.parse(JSON.stringify(value));
const input=name=>({lines:[],locations:[{id:'site-1',name}],allocations:[],current:null,open:'q3',allocationRevision:0});
function setup(){
  const dom=new JSDOM('<!doctype html><html><body><main id="panel"></main></body></html>',{url:'https://research.example/ia?view=research-r3',runScripts:'outside-only'}),window=dom.window,calls=[];
  Object.defineProperty(window,'crypto',{value:webcrypto});window.structuredClone=value=>window.JSON.parse(window.JSON.stringify(value));window.TextEncoder=TextEncoder;window.Response=Response;window.Request=Request;
  const tails=new Map();window.navigator.locks={request(name,_options,callback){const pending=(tails.get(name)||Promise.resolve()).then(()=>callback({name}));tails.set(name,pending.catch(()=>{}));return pending;}};
  window.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response('asset');};window.eval(compiled.outputFiles[0].text);
  return {window,dom,calls,api:window.RepositoryTest,close:()=>window.close()};
}
async function writeCurrent(f,repository,mode,value){
  const store=f.api.regularStorage.createBrowserStorage({...repository.storageOptions,...(mode==='simple'?{key:'order_simple_prework_0581'}:{})}),before=await store.load();
  const result=await store.commit(f.window.structuredClone(value),{expectedRevision:before.revision,expectedToken:before.versionToken,transactionId:webcrypto.randomUUID()});assert.equal(result.ok,true,JSON.stringify(result));return result;
}

test('repository reads the original mode stores across remount and its sync mirror never touches regular or other research keys',async()=>{
  const f=setup();try{
    const a=await f.api.createResearchQuoteRepository({window:f.window,namespace:'research:v1'});
    f.window.localStorage.setItem('order_q1_q4_v1','regular sentinel');f.window.sessionStorage.setItem('order_v015R2_draft','legacy sentinel');
    await writeCurrent(f,a,'simple',input('현재 간편 입력'));
    assert.deepEqual(clone((await a.list()).map(record=>[record.mode,record.hasInput])),[['simple',true],['detailed',false]]);
    const command=f.window.structuredClone({expectedRevision:0,requestKey:webcrypto.randomUUID(),data:input('연구 상세 mirror')});
    const first=await a.request('/drafts/detailed',command),retry=await a.request('/drafts/detailed',command);
    assert.equal(first.revision,1);assert.deepEqual(clone(retry),clone(first));assert.equal((await a.read('detailed')).hasInput,false);
    await assert.rejects(a.request('/drafts/detailed',f.window.structuredClone({...command,requestKey:webcrypto.randomUUID(),data:input('stale overwrite')})),error=>error.status===409);
    await assert.rejects(a.request('/drafts/detailed',f.window.structuredClone({...command,expectedRevision:1,requestKey:webcrypto.randomUUID(),data:{unexpected:'schema'}})),error=>error.status===422);
    a.dispose();const restored=await f.api.createResearchQuoteRepository({window:f.window,namespace:'research:v1'}),isolated=await f.api.createResearchQuoteRepository({window:f.window,namespace:'research:v1:fixtures'});
    assert.equal((await restored.read('simple')).data.locations[0].name,'현재 간편 입력');assert.equal((await restored.request('/drafts/detailed')).data.locations[0].name,'연구 상세 mirror');assert.ok((await isolated.list()).every(record=>!record.hasInput));
    assert.equal(f.window.localStorage.getItem('order_q1_q4_v1'),'regular sentinel');assert.equal(f.window.sessionStorage.getItem('order_v015R2_draft'),'legacy sentinel');
    assert.ok(Object.keys(f.window.localStorage).filter(key=>key!=='order_q1_q4_v1').every(key=>key.startsWith('order.app.research:v1:')));assert.equal(f.calls.length,0);
    await assert.rejects(a.request('/drafts/simple'),error=>error.name==='AbortError');restored.dispose();isolated.dispose();
  }finally{f.close();}
});

test('quote transport maps only declared read endpoints to the injected fixture and refuses native regular API access',async()=>{
  const f=setup();try{
    const calls=[],context={endpoints:{role:'/__qa_fixture/role',price:'/__qa_fixture/price'}},adapter={context,ready:Promise.resolve(),
      async roleRequest(path,body){calls.push({family:'role',path,body});return {businesses:[{id:'research-site'}]};},
      async priceRequest(path,body){calls.push({family:'price',path,body});throw Object.assign(Error('QA_FIXTURE_UNSUPPORTED'),{status:501});}};
    const fetch=f.api.createResearchQuoteTransport(f.window,{adapter,fetcher:f.window.fetch});
    assert.equal((await (await fetch('/__qa_fixture/role/businesses')).json()).businesses[0].id,'research-site');assert.equal((await fetch('/__qa_fixture/price/quote?id=research-only')).status,501);
    for(const [url,method]of [['/api/ia/product/drafts/simple','POST'],['/api/ia/r3-role/businesses','GET'],['/api/ia/r3-price/quote?id=regular','GET'],['/api/order/features','GET'],['/__qa_fixture/role/businesses','POST'],['https://outside.example/ia/research-assets/web/app.mjs','GET'],['/ia/research-assets/web/app.mjs','POST']])await assert.rejects(fetch(url,{method,body:method==='POST'?'{}':undefined}),/APPLICATION_TRANSPORT_REQUIRED/);
    assert.equal(f.calls.length,0);assert.deepEqual(calls,[{family:'role',path:'/businesses',body:null},{family:'price',path:'/quote?id=research-only',body:null}]);
    assert.equal(await (await fetch('/ia/research-assets/web/app.mjs')).text(),'asset');assert.equal(f.calls.length,1);
    const aborted=new f.window.AbortController();aborted.abort();await assert.rejects(fetch('/__qa_fixture/role/businesses',{signal:aborted.signal}),error=>error.name==='AbortError');assert.equal(calls.length,2);
  }finally{f.close();}
});

test('saved quote panel lists only actual regular mode drafts and forwards the storage revision to the original restoration owner',async()=>{
  const f=setup();let panel;try{
    const repository=await f.api.createResearchQuoteRepository({window:f.window,namespace:'research:panel'}),opened=[];
    await writeCurrent(f,repository,'detailed',input('상세 사업장'));
    panel=f.api.mountResearchSavedQuotePanel({container:f.window.document.getElementById('panel'),repository,onOpenDraft:async record=>{opened.push(clone(record));return {ok:false,status:'CONFLICT'};}});
    assert.equal(await panel.ready,true);assert.equal(f.window.document.querySelectorAll('[data-quote-draft-mode]').length,2);
    const simple=f.window.document.querySelector('[data-open-quote-draft="simple"]'),detailed=f.window.document.querySelector('[data-open-quote-draft="detailed"]');
    assert.equal(simple.textContent,'새로 시작하기');assert.equal(detailed.textContent,'이어서 작성하기');detailed.click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(opened.length,1);assert.equal(opened[0].data.locations[0].name,'상세 사업장');assert.equal(opened[0].revision,1);assert.match(opened[0].versionToken,/^[a-f0-9]{64}$/);assert.match(f.window.document.querySelector('[role=status]').textContent,/내용이 바뀌었어요/);
    assert.equal(f.calls.length,0);panel();assert.equal(f.window.document.querySelectorAll('[data-open-quote-draft]').length,0);repository.dispose();
  }finally{panel?.();f.close();}
});
