import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleR3Role} from '../src/server/r3-role.mjs';
import {renderR3RolePage} from '../src/server/r3-role-page.mjs';

function workspace(){
  const sql=new DatabaseSync(':memory:');
  for(const n of ['0002_r3_price','0003_r3_roles','0004_r3_evidence','0008_r3_role_workspace','0010_r3_member_requests','0013_owner_session_revocations'])sql.exec(readFileSync(new URL(`../migrations/${n}.sql`,import.meta.url),'utf8'));
  const prepare=(query,params=[])=>({query,params,bind:(...v)=>prepare(query,v),first:async()=>sql.prepare(query).get(...params),all:async()=>({results:sql.prepare(query).all(...params)})});
  const db={prepare,batch:async rows=>{sql.exec('BEGIN');try{for(const {query,params} of rows)sql.prepare(query).run(...params);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const grant=(actor,role,org,site='')=>sql.prepare('INSERT INTO r3_membership VALUES(?,?,?,?,1)').run(actor,role,org,site);
  grant('buyer','BUYER','store','one');grant('other','BUYER','other','two');grant('ops','OPERATOR','store');grant('ops','OPERATOR','farm');grant('farmer','SUPPLIER','farm');
  async function request(actor,body,query='',extra={}){
    const method=body?'POST':'GET';const res=await handleR3Role({request:new Request(`https://ia.test/api/ia/r3-role${query}`,{method,headers:{Origin:'https://ia.test','Content-Type':'application/json','X-IA-CSRF':'token',...extra},body:body?JSON.stringify(body):undefined}),env:{ORDER_QA_DB:db},actor:{id:actor,csrf:'token'}});
    return {status:res.status,...await res.json()};
  }
  const body=(caseId,expectedRevision,action,fields={})=>({caseId,expectedRevision,action,requestKey:crypto.randomUUID(),...fields});
  const run=(actor,...args)=>request(actor,body(...args));
  return {db,sql,grant,request,body,run};
}
test('business outage uses masked evidence, review, site grant and revocation; concurrent applications cannot undo newer result',async()=>{
  const {sql,run,request,body}=workspace();for(const c of ['case-b','case-c']){
    assert.equal((await run('buyer',c,0,'create',{kind:'business',orgId:'store',siteId:'one'})).status,200);
    assert.equal((await run('buyer',c,1,'manual')).case.state,'EVIDENCE_REQUIRED');
  }
  assert.equal((await run('buyer','case-b',2,'attach',{evidenceId:'made-up'})).status,409);
  sql.prepare('INSERT INTO r3_evidence_receipt VALUES(?,?,?,?,?)').run('safe','store','one','business','MASKED_SCANNED');
  for(const c of ['case-b','case-c'])assert.equal((await run('buyer',c,2,'attach',{evidenceId:'safe'})).case.state,'REVIEW');
  const cmd=body('case-b',3,'verify');assert.equal((await request('ops',cmd)).case.state,'VERIFIED');assert.equal((await request('ops',cmd)).committedRevision,4);
  assert.equal((await request('ops',{...cmd,action:'reject',reason:'SCOPE_MISMATCH'})).status,409);
  assert.equal((await run('ops','case-b',4,'revoke',{reason:'SCOPE_MISMATCH'})).case.state,'REVOKED');
  assert.equal((await run('ops','case-c',3,'verify')).status,409);
  assert.equal(sql.prepare('SELECT verification FROM r3_business_site').get().verification,'REVOKED');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM r3_case_event WHERE case_id='case-b'").get().n,5);
});
test('server-scoped membership and actor proof; no case access for other store, wrong issuer, revoked or forged roles',async()=>{
  const {sql,run,request,body,grant}=workspace();let b=body('x',0,'create',{kind:'consult',orgId:'store',siteId:'one'});
  assert.equal((await request('owner',b)).status,403);assert.equal((await request('buyer',{...b,role:'OPERATOR'})).status,400);
  assert.equal((await request('buyer',b,'',{Origin:'https://other.test'})).status,403);
  assert.equal((await request('other',b)).status,403);assert.equal((await request('buyer',b)).status,200);
  assert.equal((await request('other',null,'?id=x')).status,404);
  assert.equal((await run('buyer','x',1,'submit')).case.state,'OPEN');
  assert.equal((await run('ops','x',2,'respond')).case.state,'ANSWERED');
  assert.equal((await run('buyer','x',3,'followup')).case.state,'OPEN');
  assert.equal((await run('ops','x',4,'respond')).case.state,'ANSWERED');assert.equal((await run('buyer','x',5,'resolve')).case.state,'CLOSED');
  sql.exec("UPDATE r3_membership SET active=0 WHERE actor_id='buyer'");assert.equal((await request('buyer',b)).status,403);
  grant('farmer','OPERATOR','farm');assert.equal((await run('farmer','s',0,'create',{kind:'supply',orgId:'farm'})).status,200);await run('farmer','s',1,'submit');assert.equal((await run('farmer','s',2,'approve')).status,403);
});
test('supply application and product review supplement or reject; cancellation/resume keeps case ID and revisions',async()=>{
  const {run}=workspace();const product={kind:'catalog',orgId:'farm',productId:'sku-30'};
  assert.equal((await run('farmer','p',0,'create',product)).status,409);
  await run('farmer','s',0,'create',{kind:'supply',orgId:'farm'});await run('farmer','s',1,'submit');
  assert.equal((await run('ops','s',2,'supplement',{reason:'INVALID_DETAILS'})).case.state,'NEEDS_INFO');assert.equal((await run('farmer','s',3,'cancel')).case.state,'CANCELLED');
  assert.equal((await run('farmer','s',4,'resume')).case.state,'DRAFT');await run('farmer','s',5,'submit');await run('ops','s',6,'approve');
  assert.equal((await run('farmer','p',0,'create',product)).status,200);await run('farmer','p',1,'submit');assert.equal((await run('ops','p',2,'reject',{reason:'INVALID_DETAILS'})).case.state,'REJECTED');
});
test('frozen price quote, verified site and supplier scope link order → dispatch → document → settlement; no amount in case/list/audit',async()=>{
  const {sql,request,body,run}=workspace();sql.exec(`INSERT INTO r3_business_site VALUES('store','one','VERIFIED',1);
  INSERT INTO r3_price_destination VALUES('store','one','r','v',NULL);
  INSERT INTO r3_price_quote VALUES('q','buyer','store','one','farm',1,'2020-01-01','2999-01-01','key','hash','digest','{"destination":{"region_code":"r","region_version":"v"}}','{"syntheticAmountOnly":32100}');`);
  const create=body('d',0,'create',{kind:'delivery',orgId:'store',siteId:'one',quoteId:'q'});
  assert.equal((await request('buyer',create)).case.supplier_org_id,'farm');assert.equal((await run('buyer','conflict',0,'create',{kind:'delivery',orgId:'store',siteId:'one',quoteId:'q'})).status,409);
  const transitions=[['buyer','submit'],['ops','accept'],['buyer','payment-request'],['ops','payment-review'],['farmer','schedule'],['farmer','dispatch'],['buyer','report-issue'],['ops','reschedule'],['farmer','dispatch'],['buyer','receive'],['ops','document-review'],['farmer','settlement-review'],['ops','settle']];let rev=1;
  for(const [role,action] of transitions){
    if(action==='document-review'){
      sql.prepare('INSERT INTO r3_evidence_receipt VALUES(?,?,?,?,?)').run('doc','store','one','delivery','MASKED_SCANNED');
      sql.prepare('INSERT INTO r3_evidence_object VALUES(?,?,?,?,?,?,?,?)').run('doc','d','farmer','doc-key','test','private/test',1,new Date().toISOString());
      assert.equal((await run('farmer','d',rev++,'attach',{evidenceId:'doc'})).status,200);
    }
    const result=await run(role,'d',rev,action,action==='report-issue'?{reason:'DELIVERY_EXCEPTION'}:{});assert.equal(result.status,200,action);rev++;}
  const res=await request('buyer',null,'?id=d');assert.equal(res.case.state,'SETTLEMENT_REVIEWED');for(const k of ['order_id','delivery_id','document_id','settlement_id'])assert.ok(res.case[k]);assert.equal(res.case.quote_id,'q');assert.equal(res.events.length,15);
  assert.doesNotMatch(JSON.stringify([res,await request('ops')]),/syntheticAmountOnly|32100/);
  sql.exec("UPDATE r3_membership SET active=0 WHERE actor_id='farmer'");assert.equal((await request('farmer',null,'?id=d')).status,403);
});
test('two clients with same revision, pagination for 60 records and server failure preserve evidence',async()=>{
  const {sql,run,request}=workspace();for(let i=0;i<60;i++)await run('buyer',`x${String(i).padStart(2,'0')}`,0,'create',{kind:'consult',orgId:'store',siteId:'one'});
  const results=await Promise.all([run('buyer','x00',1,'submit'),run('buyer','x00',1,'cancel')]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  assert.equal(sql.prepare("SELECT count(*) n FROM r3_case_event WHERE case_id='x00'").get().n,2);const first=await request('buyer');assert.equal(first.cases.length,50);assert.equal((await request('buyer',null,`?after=${first.next}`)).cases.length,10);
  sql.exec('DROP TABLE r3_case_event');assert.equal((await run('buyer','x01',1,'submit')).status,503);assert.equal(sql.prepare("SELECT revision FROM r3_case WHERE id='x01'").get().revision,1);
});
test('private panel namespaced references, no embedded grants or price records',()=>{const html=renderR3RolePage('abcde'.repeat(5));assert.match(html,/업무 범위/);assert.match(html,/X-IA-CSRF/);assert.doesNotMatch(html,/32100|syntheticAmountOnly/);});
test('evidence receives bounded masked pixels, actual isolated object readback, retry, site ACL and object fault with no false receipt',async()=>{
  const {sql,db,run}=workspace();const objects=new Map();const bucket={put:async(k,bytes)=>{objects.set(k,new Uint8Array(bytes))},get:async k=>{const b=objects.get(k);return b&&{body:b,size:b.length}},delete:async k=>{objects.delete(k)}};
  await run('buyer','b',0,'create',{kind:'business',orgId:'store',siteId:'one'});await run('buyer','b',1,'manual');
  const endpoint='https://ia.test/api/ia/r3-role/evidence?caseId=b';const pixel=new Uint8Array([79,82,80,88,1,1,0,2,0,2,255,0,255,0]);
  const post=(data,extra={},actor='buyer',env={ORDER_QA_DB:db,ORDER_PRIVATE_EVIDENCE:bucket})=>handleR3Role({request:new Request(endpoint,{method:'POST',headers:{Origin:'https://ia.test','X-IA-CSRF':'x','Content-Type':'application/vnd.order.masked-rasters','Idempotency-Key':'req',...extra},body:data}),env,actor:{id:actor,csrf:'x'}});
  const get=(receipt,actor)=>handleR3Role({request:new Request(endpoint+'&id='+receipt),env:{ORDER_QA_DB:db,ORDER_PRIVATE_EVIDENCE:bucket},actor:{id:actor}});
  assert.equal((await post(pixel,{},'buyer',{ORDER_QA_DB:db})).status,503);
  assert.equal((await post(pixel,{},'other')).status,403);assert.equal((await post(pixel,{Origin:'https://elsewhere.test'})).status,403);
  assert.equal((await post('%PDF- xxx',{'Content-Type':'application/pdf'})).status,415);
  assert.equal((await post(new Uint8Array([...pixel,65]))).status,422);assert.equal((await post(new Uint8Array([79,82,80,88,1,1,255,255,255,255]))).status,422);
  assert.equal((await post(pixel,{'Content-Length':'10000000'})).status,413);
  assert.equal((await post(pixel,{},'buyer',{ORDER_QA_DB:db,ORDER_PRIVATE_EVIDENCE:{put:()=>Promise.reject(Error())}})).status,503);assert.equal(sql.prepare('SELECT count(*) n FROM r3_evidence_receipt').get().n,0);
  const saved=await (await post(pixel)).json();assert.equal(saved.pages,1);assert.ok(saved.evidenceId);assert.equal((await (await post(pixel)).json()).evidenceId,saved.evidenceId);assert.equal(objects.size,1);
  const other=new Uint8Array(pixel);other[10]=4;assert.equal((await post(other)).status,409);
  assert.equal((await get(saved.evidenceId,'other')).status,404);const copy=await get(saved.evidenceId,'ops');assert.equal(copy.status,200);assert.match(copy.headers.get('Cache-Control'),/no-store/);assert.deepEqual(new Uint8Array(await copy.arrayBuffer()),pixel);
  assert.equal((await run('buyer','b',2,'attach',{evidenceId:saved.evidenceId})).case.state,'REVIEW');assert.equal((await run('ops','b',3,'verify')).case.state,'VERIFIED');
});
test('signed IA route carries validated CSRF into the independently granted role handler',async()=>{
  const {issueSession,deriveVerifier}=await import('../src/server/owner-session.mjs');
  const {handleIaRequest}=await import('../src/server/router.mjs');
  const {randomBytes}=await import('node:crypto');const {db,grant,body}=workspace();
  const env={ORDER_QA_DB:db,IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'fixture@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(32).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url')};
  const session=await issueSession(env),origin='https://order-ia-portal.pages.dev';
  const cmd=body('owner-case',0,'create',{kind:'consult',orgId:'specific',siteId:'qa'});
  const post=token=>handleIaRequest(new Request(origin+'/api/ia/r3-role',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:session.cookie.split(';')[0],'X-IA-CSRF':token},body:JSON.stringify(cmd)}),env);
  assert.equal((await post(session.csrf)).status,403);grant('owner','BUYER','specific','qa');assert.equal((await post('wrong')).status,403);
  const res=await post(session.csrf);assert.equal(res.status,200,JSON.stringify(await res.clone().json()));assert.equal((await res.json()).committedRevision,1);
});

test('in-panel requests stay pending, retain one request on retry, and reveal no cross-company members',async()=>{
  const {sql,request}=workspace();
  const body={requestKey:crypto.randomUUID(),orgId:'store',siteId:'one',purpose:'INVITE',contact:'Team@Example.invalid',role:'BUYER'};
  const members=()=>sql.prepare('SELECT COUNT(*) n FROM r3_membership').get().n;
  const before=members();
  assert.equal((await request('buyer',body,'/account')).pending,true);
  assert.equal((await request('buyer',body,'/account')).pending,true);
  assert.equal((await request('other',body,'/account')).status,403);
  assert.equal((await request('buyer',{...body,role:'SUPPLIER'},'/account')).status,403);
  assert.equal((await request('buyer',{...body,role:'OPERATOR'},'/account')).status,400);
  const account=await request('buyer',null,'/account');
  assert.equal(account.requests.length,1);assert.equal(account.requests[0].contact,'team@example.invalid');
  assert.ok(account.members.every(m=>m.self));
  assert.equal((await request('other',null,'/account')).requests.length,0);
  assert.equal((await request('ops',null,'/account')).requests.length,1);
  assert.equal(members(),before);
});
