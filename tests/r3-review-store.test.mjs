import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {onRequest as page} from '../functions/ia/[[path]].js';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';

const origin='https://order-ia-portal.pages.dev';
const base=origin+'/api/ia/r3-qa';
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
const binding={prepare(sql){return {bind(...args){const st=db.prepare(sql);return {
  first:async()=>st.get(...args),all:async()=>({results:st.all(...args)}),run:async()=>({meta:st.run(...args)})};}};}};
const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(18).toString('hex')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:binding};
const session=await issueSession(env),cookie=session.cookie.split(';')[0];
const artifact=await handleIaRequest(new Request(base+'/artifact?id=login%2Fempty%2Femail&version=current&width=390',{headers:{Cookie:cookie}}),env);
const verified=await artifact.json();
const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:verified.hash};
const data=body=>({body,target});
const event=(name,body,rev=0)=>({release:'MSG0585-R3',kind:'comment',id:'fixture',expectedRevision:rev,idempotencyKey:name,data:data(body)});
const read=(path,settings={})=>handleIaRequest(new Request(base+path,{headers:{Cookie:cookie}}),{...env,...settings});
const send=(b,headers={},settings={})=>handleIaRequest(new Request(base+'/records',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf,Cookie:cookie,...headers},body:JSON.stringify(b)}),{...env,...settings});

test('authentication, original CSRF and direct login return view',async()=>{
  const unauth=await handleIaRequest(new Request(base+'/records?release=r3'),env);
  assert.equal(unauth.status,403);assert.match(unauth.headers.get('Cache-Control'),/no-store/);
  assert.equal((await send(event('bad','x'),{Origin:'https://different.invalid'})).status,403);
  assert.equal((await send(event('bad','x'),{'X-IA-CSRF':''})).status,403);
  assert.equal((await page({request:new Request(origin+'/ia?view=qa-lab'),env})).headers.get('location'),'/login?returnView=qa-lab');
  const deep=await page({request:new Request(origin+'/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390&ignored=1'),env});
  assert.equal(deep.headers.get('location'),'/login?returnView=qa-lab&screen=login%2Fempty%2Femail&width=390');
  const asset=await page({request:new Request(origin+'/ia/r3-product/unknown.mjs'),env});
  assert.equal(asset.status,403);assert.equal(await asset.text(),'');
  assert.match(v03OwnerHtml('nonce-qa'),/href="\/ia\?view=qa-lab" target="_blank" rel="noopener"/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,0);
});
test('server-generated revision, atomic contention, conflict payload and retry',async()=>{
  const a=await (await send(event('first-request','first'))).json();assert.equal(a.revision,1);assert.equal(a.replayed,false);
  const dup=await (await send(event('first-request','first'))).json();assert.equal(dup.replayed,true);assert.equal(dup.cursor,a.cursor);
  assert.equal((await send(event('first-request','different'))).status,409);
  const [x,y]=await Promise.all([send(event('left','left edit',1)),send(event('right','right edit',1))]);
  assert.deepEqual([x.status,y.status].sort(),[200,409]);
  const loser=await (x.status===409?x:y).json();assert.equal(loser.current.revision,2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,2);
  const b=await (await read('/records?release=MSG0585-R3')).json();assert.equal(b.items.length,1);assert.equal(b.items[0].data.body,loser.current.data.body);
  const h=await (await read('/events?release=MSG0585-R3&kind=comment&id=fixture')).json();assert.deepEqual(h.items.map(r=>r.revision),[1,2]);
  const change=await (await read('/records?release=MSG0585-R3&since='+a.cursor)).json();assert.equal(change.items.length,1);assert.ok(change.items[0].cursor>a.cursor);
  const resolve={...event('resolution',loser.current.data.body,2),action:'resolve',reason:'검토 완료'};
  assert.equal((await send(resolve)).status,200);assert.equal((await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.length,0);
  assert.equal((await send(event('silent-reopen','edit',3))).status,400);
  const reopened={...event('reopen',loser.current.data.body,3),action:'reopen',reason:'사용자 재검토'};assert.equal((await send(reopened)).status,200);
  assert.equal((await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.length,1);
});
test('anchor telemetry, role, approval and artifact remain distinct',async()=>{
  const anchor={id:'panel',instance:'second',x:.12,y:.34,viewport:{width:320,height:640},scale:1,scroll:[{id:'parent',x:121,y:145}],layers:['dialog','list'],artifactHash:target.artifactHash};
  const c={...event('point','pin'),id:'p',data:{...data('pin'),anchor}};
  assert.equal((await send({...c,data:{...c.data,anchor:{...anchor,fieldValue:'not permitted'}}})).status,400);
  assert.equal((await send(c)).status,200);
  const bad={...c,idempotencyKey:'price',kind:'review',data:{target,decision:'approved',price:1200}};assert.equal((await send(bad)).status,400);
  assert.equal((await send({...bad,data:{target:{...target,artifactHash:null},decision:'approved'}})).status,400);
  assert.equal((await send({...c,kind:'review',idempotencyKey:'review',data:{target,decision:'approved'}})).status,200);
  assert.equal((await read('/records?limit=-1&release=MSG0585-R3')).status,400);
});
test('unavailable database and missing legacy import are explicit; same draft may be retried',async()=>{
  const req={...event('offline-retry','kept draft'),id:'offline'};
  assert.equal((await send(req,{},{ORDER_QA_DB:null})).status,503);
  assert.equal((await send(req)).status,200);
  assert.equal((await read('/legacy?limit=40')).status,503);
});

test('backup is bounded to a frozen cursor while subsequent events continue',async()=>{
  const first=await (await read('/backup?release=MSG0585-R3&limit=1')).json();
  assert.equal(first.events.length,1);assert.ok(first.hasMore);
  const late={...event('later-backup','late'),id:'after-export'};
  assert.equal((await send(late)).status,200);
  const continuation=await (await read('/backup?release=MSG0585-R3&since='+first.nextCursor+'&until='+first.until)).json();
  assert.equal(continuation.hasMore,false);assert.equal(continuation.events.at(-1).cursor,first.until);
  assert.ok(continuation.events.every(x=>x.id!=='after-export'&&x.requestHash.length===64));
  const forged=await read('/backup?release=MSG0585-R3&until=999999999');assert.equal(forged.status,400);
});

test('verified role mutation receives the same signed session as the router',async()=>{
  db.exec(readFileSync(new URL('../migrations/0003_r3_roles.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO r3_membership VALUES ('owner','BUYER','test-store','test-site',1)");
  const rolePost=async(token)=>handleIaRequest(new Request(origin+'/api/ia/r3-role',{method:'POST',
    headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-IA-CSRF':token},body:'{}'}),env);
  assert.equal((await rolePost('invalid')).status,403);
  const valid=await rolePost(session.csrf);
  assert.equal(valid.status,400);
  assert.equal((await valid.json()).error,'INVALID_INPUT');
});
