import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createLabTestSessionResponse} from './product-lab-browser-host.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {onRequest} from '../functions/ia/[[path]].js';

const origin='https://order-ia-portal.pages.dev';
const verifier=deriveVerifier(randomBytes(24).toString('base64url'));
function binding(sqlite){
 const prepare=(query,args=[])=>({query,args,bind:(...values)=>prepare(query,values),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(({query,args})=>{const q=sqlite.prepare(query);return q.columns().length?{results:q.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...args).changes)}};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function fixture(t){
 const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:');
 t.after(()=>{review.close();lab.close();});
 const migrations=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())review.exec(readFileSync(new URL(name,migrations),'utf8'));
 lab.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
 const env={ORDER_QA_DB:binding(review),ORDER_LAB_DB:binding(lab),IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'host-test@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await verifier,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'host-regression'};
 const session=await issueSession(env),headers={Cookie:session.cookie.split(';')[0]};
 return {env,session,review,lab,request:path=>new Request(new URL(path,origin),{headers})};
}

test('the browser setup creates real isolated runs and redirects explicitly while the default URL keeps the R1 shell',async t=>{
 const f=await fixture(t),ids=[];
 for(let i=0;i<2;i++){
  const response=await createLabTestSessionResponse(f.env,f.session);
  assert.equal(response.status,303);assert.equal(response.headers.get('Set-Cookie'),f.session.cookie);
  const url=new URL(response.headers.get('Location'),origin),id=url.searchParams.get('run');
  assert.equal(url.pathname,'/ia');assert.equal(url.searchParams.get('view'),'qa-lab');assert.match(id,/^[a-f0-9]{32}$/);assert.equal(url.searchParams.has('archive'),false);
  ids.push(id);
  const loaded=await handleIaRequest(f.request('/api/ia/lab/runs/'+id),f.env);assert.equal(loaded.status,200);assert.equal((await loaded.json()).run.id,id);
  const account=await handleIaRequest(f.request('/api/ia/lab/runs/'+id+'/as/buyer/product/account'),f.env);assert.equal(account.status,200);assert.equal((await account.json()).state,'ACTIVE');
  const page=await onRequest({request:f.request(url),env:f.env});assert.equal(page.status,200);assert.match(await page.text(),/id="product-frame"/);
 }
 assert.notEqual(ids[0],ids[1]);assert.equal(f.lab.prepare('SELECT count(*) n FROM product_lab_run').get().n,2);
 const shell=await onRequest({request:f.request('/ia?view=qa-lab'),env:f.env}),html=await shell.text();
 assert.equal(shell.status,200);assert.match(html,/id="lab"/);assert.match(html,/id="frame"/);assert.doesNotMatch(html,/id="live-create"|id="product-frame"/);
 assert.equal(f.review.prepare('SELECT count(*) n FROM qa_review_events').get().n,0);
});

test('browser setup must pass the real owner and CSRF checks before a run is created',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>createLabTestSessionResponse(f.env,{...f.session,csrf:'invalid'}),/403 CSRF_DENIED/);
 await assert.rejects(()=>createLabTestSessionResponse(f.env,{...f.session,cookie:'unrelated=invalid'}),/403 IA_ACCESS_DENIED/);
 assert.equal(f.lab.prepare('SELECT count(*) n FROM product_lab_run').get().n,0);
});
