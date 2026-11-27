import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {saveBusiness,readSavedBusinesses,projectSavedBusiness} from '../src/server/r3-business-directory.mjs';
import {createSavedBusinessBridge} from '../src/server/r3-saved-business-client.mjs';
import {bootBusinessDirectory,renderBusinessDirectory} from '../src/server/r3-business-directory-page.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/0015_r3_saved_businesses.sql',import.meta.url),'utf8'));
 return {sql,prepare(query){
  const statement=sql.prepare(query);
  return {bind(...args){return {run:async()=>statement.run(...args),first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)})};}};
 }};
}
const profile={name:'검증 사업장',road:'테스트 소재지',postal:'12345',detail:'2층',contactName:'담당자',contactPhone:'01000000000',email:'qa@example.invalid',dropoff:'입구 오른쪽'};
const command=(changes={})=>({id:'business-0001',requestKey:crypto.randomUUID(),expectedRevision:0,deleted:false,profile,...changes});

test('saved business revisions are actor-private, atomic, replay-safe and never create commercial grants',async()=>{
 const db=database(),first=command();const a=await saveBusiness(db,'actor-a',first);assert.equal(a.status,200);assert.deepEqual(await saveBusiness(db,'actor-a',first),a);
 assert.equal((await readSavedBusinesses(db,'actor-b')).length,0);
 assert.equal((await saveBusiness(db,'actor-b',command({expectedRevision:1}))).status,409);
 assert.equal((await saveBusiness(db,'actor-a',{...first,profile:{...profile,name:'다른 내용'}})).status,409);
 const results=await Promise.all([saveBusiness(db,'actor-a',command({expectedRevision:1,profile:{...profile,name:'새 명칭'}})),saveBusiness(db,'actor-a',command({expectedRevision:1,profile:{...profile,name:'경합 명칭'}}))]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const current=(await readSavedBusinesses(db,'actor-a'))[0];assert.equal(current.revision,2);
 const deleted=await saveBusiness(db,'actor-a',command({expectedRevision:2,profile:current.profile,deleted:true}));assert.equal(deleted.status,200);assert.equal((await readSavedBusinesses(db,'actor-a')).length,0);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM r3_saved_business_revision').get().n,3);
 assert.equal(db.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('r3_membership','r3_business_site')").get().n,0);
});
test('business profile accepts only bounded input fields, rejects forged authorization and incomplete address provenance',()=>{
 assert.equal(projectSavedBusiness(profile).name,profile.name);
 for(const extra of [{verified:true},{role:'OPERATOR'},{name:''},{name:'a\u0000b'},{postal:'123'},{email:'bad'},{addressProvider:'JUSO',providerId:'forged'},{regionSelection:{rootCode:'11'}}])assert.throws(()=>projectSavedBusiness({...profile,...extra}));
});
test('detailed Q3 adds saved input once, preserves all existing orders and never grants verification',async()=>{
 let state={lines:[{id:'egg-1'}],locations:[{id:'local',name:'작성 중인 기존 사업장'}],allocations:[{id:'a',locationId:'local'}]},rendered=0;
 const base=JSON.stringify(state),bridge=createSavedBusinessBridge({getState:()=>state,guard:()=>true,save:async(value,{canCommit})=>{assert.equal(canCommit(),true);state=structuredClone(value);return {ok:true};},render:()=>rendered++,blankSite:()=>({status:'NONE'}),addressFields:p=>({road:p.road,dropoff:p.dropoff}),addressStatus:()=>({state:'UNVERIFIED'}),simpleMode:false});
 const row={id:'business-0001',profile};assert.equal((await bridge.load([row])).ok,true);assert.equal(state.locations.length,2);assert.deepEqual(state.allocations,JSON.parse(base).allocations);assert.deepEqual(state.lines,JSON.parse(base).lines);assert.equal(state.locations[1].basicInfoDraft,true);assert.equal(state.locations[1].status,'NONE');
 assert.equal((await bridge.load([{...row,profile:{...profile,name:'최신 명칭'}}])).ok,true);assert.equal(state.locations.length,2);assert.equal(state.locations[1].name,'최신 명칭');assert.deepEqual(state.allocations,JSON.parse(base).allocations);assert.equal(rendered,2);
});
test('simple Q3 uses chosen saved regions and failed storage preserves the prior confirmed state',async()=>{
 const selection={rootCode:'1100000000',leafCode:'1111000000',rootLabel:'서울특별시',leafLabel:'종로구'};
 let state={simpleQuote:{siteCount:'1',sites:[],orderKind:'FLEX',flexBasis:'MONTH'}},next,reset=0;
 const bridge=createSavedBusinessBridge({simpleMode:true,getState:()=>state,guard:()=>true,regionSelection:(root,leaf)=>root===selection.rootCode&&leaf===selection.leafCode?selection:null,projectSimpleQuote:value=>value,save:async(value,{canCommit})=>{assert.equal(canCommit(),true);next=value;return {ok:false,status:'CONFLICT'};},render(){assert.fail('failed writes cannot render a committed result');},resetSimple:()=>reset++});
 const before=JSON.stringify(state);const result=await bridge.load([{id:'business-0001',profile:{...profile,regionSelection:selection}},{id:'business-0002',profile:{...profile,name:'두 번째',regionSelection:null}}]);
 assert.equal(result.status,'CONFLICT');assert.equal(JSON.stringify(state),before);assert.equal(next.simpleQuote.siteCount,'2');assert.equal(next.simpleQuote.regionsDiffer,true);assert.equal(next.simpleQuote.sites[1].regionSelection,null);assert.equal(next.simpleQuote.orderKind,'FLEX');assert.equal(reset,0);
});
test('saved business UI really loads and writes the authenticated account and preserves a retry key after a lost response',async()=>{
 const html=renderBusinessDirectory('testNonce'),dom=new JSDOM(html,{url:'https://order-ia-portal.pages.dev/ia?view=businesses-r3',runScripts:'outside-only'}),w=dom.window;let businesses=[],calls=[],lose=true,ready=0;
 w.confirm=()=>true;w.structuredClone=structuredClone;
 w.document.addEventListener('ia-session-ready',()=>ready++);
 w.fetch=async(url,options={})=>{calls.push({url,options});if(url.endsWith('/session'))return Response.json({csrf:'test-csrf-1234567890123456',expiresAt:100000,practiceAllowed:true});if(options.method==='POST'){const b=JSON.parse(options.body);assert.equal(options.headers['X-IA-CSRF'],'test-csrf-1234567890123456');businesses=[{id:b.id,revision:1,profile:projectSavedBusiness(b.profile)}];if(lose){lose=false;throw Error('OFFLINE_AFTER_COMMIT');}return Response.json({id:b.id});}return Response.json({businesses});};
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 try{
  w.eval('('+browserFunction(bootBusinessDirectory)+')')(()=>undefined,{listRegionRoots:()=>[],listRegionLeaves:()=>[],regionSelection:()=>null});await flush();assert.equal(ready,1);assert.equal(w.document.getElementById('business-count').textContent,'0개');
  w.document.getElementById('business-name').value=profile.name;w.document.getElementById('business-road').value=profile.road;
  const form=w.document.getElementById('business-form');form.dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();assert.match(w.document.getElementById('business-status').textContent,/확인하지 못/);assert.equal(w.document.getElementById('business-name').value,profile.name);
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();const posts=calls.filter(x=>x.options.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].options.body,posts[1].options.body);assert.match(w.document.getElementById('business-status').textContent,/저장했습니다/);assert.equal(w.document.querySelectorAll('.business-card').length,1);
 }finally{w.close();}
});
test('served real quote app owns the saved-business bridge; both entry modes mount the picker',async()=>{
 const app=await r3ProductAsset('/ia/r3-product/web/app.mjs').text(),main=await r3ProductAsset('/ia/r3-product/web/main.mjs').text();assert.match(app,/savedBusinessBridge,regularBridge/);assert.match(app,/guard:guardPendingEdits/);assert.match(app,/getState:\(\)=>S/);assert.match(main,/저장된 사업장 추가/);assert.match(main,/app\.savedBusinessBridge\.load/);assert.doesNotMatch(app,/localStorage\.setItem\([^)]*business/);
});
test('signed new members may keep personal business input while commercial and QA surfaces stay denied',async()=>{
 const f=signedWorkspace({emptyPriceCatalog:true}),path='/api/ia/r3-role/businesses';
 assert.equal((await f.request('unassigned',path)).status,200);
 assert.equal((await f.request('unassigned',path,command(),{csrf:'wrong'})).status,403);
 assert.equal((await f.request('unassigned',path,command())).status,200);
 assert.equal((await (await f.request('unassigned',path)).json()).businesses.length,1);
 assert.equal((await (await f.request('supplier2',path)).json()).businesses.length,0);
 assert.equal((await f.request('unassigned','/api/ia/r3-role/workspace')).status,403);
 assert.equal((await f.request('unassigned','/api/ia/r3-qa/navigation')).status,403);
 assert.equal((await f.request('unassigned','/api/ia/dashboard')).status,403);
 assert.equal((await f.request('unassigned',path,null,{jwt:f.token('unassigned',-1)})).status,403);
 assert.equal(f.db.prepare("SELECT count(*) n FROM r3_membership WHERE actor_id='unassigned'").get().n,0);
});
test('cancelling a saved-business import before the storage commit leaves Q3 unchanged',async()=>{
 let current=true,state={locations:[],lines:[],allocations:[]},complete;
 const bridge=createSavedBusinessBridge({getState:()=>state,guard:()=>true,save:(value,{canCommit})=>new Promise(resolve=>{complete=()=>{if(!canCommit())return resolve({ok:false,status:'CANCELLED'});state=value;resolve({ok:true});};}),render(){assert.fail('cancelled input is not rendered');},blankSite:()=>({status:'NONE'}),addressFields:()=>({}),addressStatus:()=>({state:'UNVERIFIED'}),simpleMode:false});
 const result=bridge.load([{id:'business-0001',profile}],{isCurrent:()=>current});current=false;complete();assert.equal((await result).status,'CANCELLED');assert.equal(state.locations.length,0);
});
