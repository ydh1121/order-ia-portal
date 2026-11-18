import {workspaceOptions,caseQuotes,publishMenu,validCaseContext,targetsOwnedSql} from './r3-role-workspace.mjs';
import {handleR3Evidence} from './r3-evidence.mjs';
import {caseKinds, creatorRole, dispositionReasons, reasonRequired, transitions} from './r3-role-rules.mjs';

const privateHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:privateHeaders});
const id = value => typeof value==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const guardedRole = `EXISTS (SELECT 1 FROM r3_membership m WHERE m.actor_id=? AND m.active=1 AND m.role=? AND m.org_id=? AND m.site_id=?)`;
const visibleCase = `EXISTS (SELECT 1 FROM r3_membership m WHERE m.actor_id=? AND m.active=1 AND
 ((m.role='BUYER' AND m.org_id=c.org_id AND m.site_id=c.site_id) OR
  (m.role='OPERATOR' AND m.org_id=c.org_id) OR (m.role='SUPPLIER' AND m.org_id=c.supplier_org_id)))`;
const scopeArgs = (actorId,role,c) => [actorId,role,role==='SUPPLIER'?c.supplier_org_id:c.org_id,role==='BUYER'?c.site_id:''];
const readVisible = (db,actorId,caseId) => db.prepare(`SELECT c.* FROM r3_case c WHERE c.id=? AND ${visibleCase}`).bind(caseId,actorId).first();
export async function readRoleScope(db,actorId) {
  return (await db.prepare('SELECT role,org_id,site_id FROM r3_membership WHERE actor_id=? AND active=1 ORDER BY role,org_id,site_id').bind(actorId).all()).results;
}
export async function canReadSite(db,actorId,orgId,siteId) {
  return !!await db.prepare(`SELECT 1 FROM r3_business_site WHERE org_id=? AND site_id=? AND verification='VERIFIED' AND ${guardedRole}`).bind(orgId,siteId,actorId,'BUYER',orgId,siteId).first();
}
function matchingRole(grants,role,c) {
  return grants.some(g=>g.role===role && g.org_id===(role==='SUPPLIER'?c.supplier_org_id:c.org_id) && g.site_id===(role==='BUYER'?c.site_id:''));
}
const reviewActions = new Set(['approve','verify','revoke','reject','payment-review','settle']);
const actionsFor = (c,grants,actorId) => transitions(c.kind,c.state).filter(r=>matchingRole(grants,r.role,c) && !(reviewActions.has(r.action) && c.created_by===actorId));
function publicCase(c,grants,actorId) {
  // IDs and operational state only. Neither evidence contents nor pricing JSON enters this projection.
  const {created_by,evidence_id,...caseData}=c;
  return {...caseData,evidenceId:evidence_id||null,hasEvidence:Boolean(evidence_id),actions:actionsFor(c,grants,actorId).map(r=>r.action)};
}
function readInput(raw) {
  const allowed=['caseId','kind','orgId','siteId','quoteId','productId','evidenceId','reason','action','expectedRevision','requestKey','context'];
  if (!raw || Array.isArray(raw) || Object.keys(raw).some(k=>!allowed.includes(k))) return null;
  if(!validCaseContext(raw.context,raw.kind,raw.action)||(raw.action==='link-requote'&&!raw.context?.replacementQuoteId))return null;
  if (!id(raw.caseId)||!id(raw.requestKey)||!id(raw.action)||!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0) return null;
  if (!['orgId','siteId','quoteId','productId','evidenceId'].every(k=>raw[k]===undefined || id(raw[k]))) return null;
  if (raw.reason!==undefined && !dispositionReasons.has(raw.reason)) return null;
  if (raw.action==='create') {
    if(raw.expectedRevision!==0||!caseKinds.includes(raw.kind)||!raw.orgId) return null;
    const buyer=creatorRole(raw.kind)==='BUYER';
    if (buyer!==Boolean(raw.siteId) || (raw.kind==='catalog')!==Boolean(raw.productId) || ['delivery','reprice'].includes(raw.kind)!==Boolean(raw.quoteId)) return null;
  } else if(raw.expectedRevision===0 || ['kind','orgId','siteId','quoteId','productId'].some(k=>raw[k]!==undefined)) return null;
  if((raw.action==='attach')!==Boolean(raw.evidenceId) || (reasonRequired.has(raw.action) && !raw.reason)) return null;
  return Object.fromEntries(allowed.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
}
async function sha(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
const existingEvent=(db,actorId,key)=>db.prepare('SELECT case_id,revision,request_hash FROM r3_case_event WHERE actor_id=? AND request_key=?').bind(actorId,key).first();
async function resultAfterWrite(db,actorId,input,hash) {
  const event=await existingEvent(db,actorId,input.requestKey);
  if(!event) return json({error:'REVISION_OR_CONDITION_CHANGED'},409);
  if(event.request_hash!==hash) return json({error:'REQUEST_KEY_REUSED'},409);
  const row=await readVisible(db,actorId,event.case_id);
  if(!row) return json({error:'ACCESS_DENIED'},403);
  return json({case:publicCase(row,await readRoleScope(db,actorId),actorId),committedRevision:event.revision});
}
const validSnapshot = `EXISTS(SELECT 1 FROM r3_price_quote q JOIN r3_business_site s ON s.org_id=q.org_id AND s.site_id=q.site_id WHERE q.id=? AND q.org_id=? AND q.site_id=? AND s.verification='VERIFIED' AND julianday(q.expires_at)>julianday(?))`;
function evidencePredicate() {
  return `EXISTS(SELECT 1 FROM r3_evidence_receipt e WHERE e.id=? AND e.org_id=? AND e.site_id=? AND e.purpose=? AND e.state='MASKED_SCANNED')`;
}
async function planCreate(db,actorId,input,now) {
  const kind=input.kind, role=creatorRole(kind);
  const c={id:input.caseId,kind,org_id:input.orgId,site_id:input.siteId||'',supplier_org_id:role==='SUPPLIER'?input.orgId:null};
  let guard=guardedRole, args=scopeArgs(actorId,role,c);
  if(!matchingRole(await readRoleScope(db,actorId),role,c)) return {error:json({error:'ACCESS_DENIED'},403)};
  if(input.quoteId) {
    const quote=await db.prepare(`SELECT supplier_org_id FROM r3_price_quote WHERE id=? AND ${validSnapshot}`).bind(input.quoteId,input.quoteId,c.org_id,c.site_id,now).first();
    if(!quote || !quote.supplier_org_id) return {error:json({error:'QUOTE_UNAVAILABLE'},409)};
    // A pricing re-review is private to buyer and operator until a fresh policy/quote is issued.
    if(kind==='delivery') c.supplier_org_id=quote.supplier_org_id;
    guard+=` AND ${validSnapshot}`; args.push(input.quoteId,c.org_id,c.site_id,now);
  }
  if(input.context?.targets){guard+=' AND '+targetsOwnedSql;args.push(JSON.stringify(input.context.targets),c.org_id,c.site_id);}
  if(kind==='catalog') {
    guard+=" AND EXISTS(SELECT 1 FROM r3_case WHERE kind='supply' AND org_id=? AND state='APPROVED')";args.push(c.org_id);
  }
  const stmt=db.prepare(`INSERT INTO r3_case(id,kind,org_id,site_id,supplier_org_id,quote_id,product_id,state,revision,created_by,updated_at)
    SELECT ?,?,?,?,?,?,?,'DRAFT',1,?,? WHERE ${guard} ON CONFLICT DO NOTHING`)
    .bind(c.id,kind,c.org_id,c.site_id,c.supplier_org_id,input.quoteId||null,input.productId||null,actorId,now,...args);
  return {c,stmt,next:'DRAFT',prev:null};
}
async function planTransition(db,actorId,input,now) {
  const c=await readVisible(db,actorId,input.caseId);
  if(!c) return {error:json({error:'NOT_FOUND'},404)};
  if(c.revision!==input.expectedRevision) return {error:json({error:'REVISION_CONFLICT',currentRevision:c.revision},409)};
  const rule=actionsFor(c,await readRoleScope(db,actorId),actorId).find(r=>r.action===input.action);
  if(!rule) return {error:json({error:'ACTION_NOT_ALLOWED'},403)};
  let guard=guardedRole, args=scopeArgs(actorId,rule.role,c);
  if(input.action==='link-requote'){
    guard+=` AND ${validSnapshot} AND EXISTS(SELECT 1 FROM r3_price_quote q JOIN r3_price_quote old ON old.id=? WHERE q.id=? AND q.id<>old.id AND q.supplier_org_id=old.supplier_org_id AND julianday(q.issued_at)>julianday(old.issued_at) AND julianday(q.issued_at)>=julianday(?))`;
    args.push(input.context.replacementQuoteId,c.org_id,c.site_id,now,c.quote_id,input.context.replacementQuoteId,c.updated_at);
  }
  if(input.action==='attach' || input.action==='verify') {
    guard+=` AND ${evidencePredicate()}`;args.push(input.evidenceId||c.evidence_id||'',c.org_id,c.site_id,c.kind);
  }
  if(c.kind==='delivery' && ['attach','document-review','settle'].includes(input.action)){
    guard+=` AND EXISTS (SELECT 1 FROM r3_evidence_object o JOIN r3_evidence_receipt e ON e.id=o.id
      WHERE o.case_id=? AND o.id=? AND e.purpose='delivery' AND e.state='MASKED_SCANNED')`;
    args.push(c.id,input.evidenceId||c.evidence_id||'');
  }
  if(c.kind==='delivery' && ['resume','submit','accept'].includes(input.action)) {
    guard+=` AND ${validSnapshot}`;args.push(c.quote_id,c.org_id,c.site_id,now);
  }
  // A later site-level revocation also invalidates any earlier application still in review.
  if(c.kind==='business' && ['revoke','verify'].includes(input.action)) {
    guard+=` AND NOT EXISTS(SELECT 1 FROM r3_business_site WHERE org_id=? AND site_id=? AND revision<>?)`;
    args.push(c.org_id,c.site_id,c.site_revision);
  }
  const idField=({submit:c.kind==='delivery'?'order_id':null,schedule:'delivery_id','document-review':'document_id','settlement-review':'settlement_id'})[input.action];
  const sets=['state=?','revision=revision+1','updated_at=?'];const vals=[rule.next,now];
  if(idField){sets.push(`${idField}=COALESCE(${idField},?)`);vals.push(crypto.randomUUID());}
  if(input.evidenceId){sets.push('evidence_id=?');vals.push(input.evidenceId);}
  if(c.kind==='business' && ['revoke','verify'].includes(input.action))sets.push('site_revision=site_revision+1');
  const stmt=db.prepare(`UPDATE r3_case SET ${sets.join(',')} WHERE id=? AND revision=? AND state=? AND ${guard}`).bind(...vals,c.id,c.revision,c.state,...args);
  return {c,stmt,next:rule.next,prev:c.state};
}
async function mutate(db,actorId,input,now) {
  const hash=await sha(JSON.stringify(input));
  if(await existingEvent(db,actorId,input.requestKey)) return resultAfterWrite(db,actorId,input,hash);
  const plan=input.action==='create'?await planCreate(db,actorId,input,now):await planTransition(db,actorId,input,now);
  if(plan.error) return plan.error;
  const rev=input.expectedRevision+1;
  // D1 batch is one transaction. changes() refers only to the immediately preceding CAS mutation.
  const log=db.prepare(`INSERT INTO r3_case_event(case_id,revision,actor_id,request_key,request_hash,action,previous_state,next_state,reason_code,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1`).bind(input.caseId,rev,actorId,input.requestKey,hash,input.action,plan.prev,plan.next,input.reason||'',now);
  const statements=[plan.stmt,log];
  if(input.action==='create' && input.kind==='business') statements.push(db.prepare(`UPDATE r3_case SET site_revision=COALESCE((SELECT revision FROM r3_business_site WHERE org_id=r3_case.org_id AND site_id=r3_case.site_id),0) WHERE id=? AND changes()=1`).bind(input.caseId));
  if(plan.c.kind==='business' && ['verify','revoke'].includes(input.action)) statements.push(db.prepare(`INSERT INTO r3_business_site(org_id,site_id,verification,revision)
    SELECT ?,?,?,1 WHERE changes()=1 ON CONFLICT(org_id,site_id) DO UPDATE SET verification=excluded.verification,revision=r3_business_site.revision+1`).bind(plan.c.org_id,plan.c.site_id,plan.next));
  if(input.context)statements.push(db.prepare(`INSERT INTO r3_case_note(case_id,revision,context_json) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM r3_case_event WHERE case_id=? AND revision=? AND actor_id=? AND request_key=? AND request_hash=?) ON CONFLICT DO NOTHING`).bind(input.caseId,rev,JSON.stringify(input.context),input.caseId,rev,actorId,input.requestKey,hash));
  try {await db.batch(statements);} catch(e) {
    if(await existingEvent(db,actorId,input.requestKey))return resultAfterWrite(db,actorId,input,hash);
    if(String(e.message).includes('UNIQUE constraint')) return json({error:'CASE_EXISTS_OR_CHANGED'},409);
    throw e;
  }
  return resultAfterWrite(db,actorId,input,hash);
}
export async function handleR3Role({request,env,actor,path}) {
  if(!actor?.id) return json({error:'ACCESS_DENIED'},403);
  const db=env.ORDER_QA_DB; if(!db) return json({error:'WORKFLOW_UNAVAILABLE'},503);
  const url=new URL(request.url);const suffix=url.pathname.replace(/^\/api\/ia\/r3-role\/?/,'');
  if(suffix==='evidence') return handleR3Evidence({request,env,actor});
  if(suffix==='session'&&request.method==='GET'&&actor.csrf)return json({csrf:actor.csrf,expiresAt:actor.expiresAt,practiceAllowed:actor.role!=='BUSINESS'});
  if(!['','workspace','publication'].includes(suffix)) return json({error:'NOT_FOUND'},404);
  try {
    if(suffix==='publication'){
      if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
      if(request.headers.get('Origin')!==url.origin||!actor.csrf||request.headers.get('X-IA-CSRF')!==actor.csrf)return json({error:'CSRF_DENIED'},403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
      let data;try{const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_INPUT'},400);const buf=new Uint8Array(512);let length=0;for(;;){const {value,done}=await reader.read();if(done)break;if(length+value.length>buf.length){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413);}buf.set(value,length);length+=value.length;}data=JSON.parse(new TextDecoder().decode(buf.subarray(0,length)));}catch{return json({error:'INVALID_INPUT'},400);}
      const out=await publishMenu(db,actor.id,data,new Date().toISOString());return json(out,out.status);
    }
    const grants=await readRoleScope(db,actor.id);
    if(!grants.length)return json({error:'NO_BUSINESS_MEMBERSHIP'},403);
    if(suffix==='workspace'){
      if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
      const options=await workspaceOptions(db,actor.id);
      const {results:activity}=await db.prepare(`SELECT e.case_id,e.action,e.revision,e.next_state,e.created_at,c.org_id,c.site_id,c.kind
        FROM r3_case_event e JOIN r3_case c ON c.id=e.case_id WHERE ${visibleCase}
        ORDER BY e.created_at DESC,e.revision DESC,e.case_id LIMIT 100`).bind(actor.id).all();
      return json({...options,activity});
    }
    if(request.method==='GET') {
      const caseId=url.searchParams.get('id');
      if(caseId!==null) {
        if(!id(caseId))return json({error:'INVALID_INPUT'},400);
        const row=await readVisible(db,actor.id,caseId);if(!row)return json({error:'NOT_FOUND'},404);
        const {results:events}=await db.prepare(`SELECT e.revision,e.action,e.previous_state,e.next_state,e.reason_code,e.created_at FROM r3_case_event e JOIN r3_case c ON c.id=e.case_id WHERE c.id=? AND ${visibleCase} ORDER BY e.revision`).bind(caseId,actor.id).all();
        if(url.searchParams.get('context')==='1'){
          const {results:notes}=await db.prepare(`SELECT n.revision,n.context_json FROM r3_case_note n JOIN r3_case c ON c.id=n.case_id WHERE c.id=? AND ${visibleCase} ORDER BY n.revision`).bind(caseId,actor.id).all();
          const fields=notes.map(n=>({revision:n.revision,...JSON.parse(n.context_json)}));
          const allowedQuotes=await caseQuotes(db,row,fields);
          return json({case:publicCase(row,grants,actor.id),events,notes:fields,issued:allowedQuotes.find(q=>q.id===row.quote_id),targetQuotes:allowedQuotes});
        }
        return json({case:publicCase(row,grants,actor.id),events});
      }
      const cursor=url.searchParams.get('after')||'';if(cursor&&!id(cursor))return json({error:'INVALID_CURSOR'},400);
      const withContext=url.searchParams.get('context')==='1';
      const extra=withContext?", (SELECT json_extract(n.context_json,'$.businessName') FROM r3_case_note n WHERE n.case_id=c.id AND n.revision=1) businessName, (SELECT json_extract(n.context_json,'$.desiredDate') FROM r3_case_note n WHERE n.case_id=c.id AND json_extract(n.context_json,'$.desiredDate') IS NOT NULL ORDER BY revision DESC LIMIT 1) desiredDate":'';
      const {results}=await db.prepare(`SELECT c.*${extra} FROM r3_case c WHERE c.id>? AND ${visibleCase} ORDER BY c.id LIMIT 51`).bind(cursor,actor.id).all();
      return json({grants,cases:results.slice(0,50).map(c=>publicCase(c,grants,actor.id)),next:results.length===51?results[49].id:null});
    }
    if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
    if(request.headers.get('Origin')!==url.origin || !actor.csrf || request.headers.get('X-IA-CSRF')!==actor.csrf) return json({error:'CSRF_DENIED'},403);
    if((request.headers.get('Content-Type')||'').split(';')[0]!=='application/json')return json({error:'JSON_REQUIRED'},415);
    if(Number(request.headers.get('Content-Length'))>4096)return json({error:'REQUEST_TOO_LARGE'},413);
    const reader=request.body?.getReader(); if(!reader)return json({error:'INVALID_INPUT'},400);
    const buf=new Uint8Array(4096);let used=0;
    for(;;){const {done,value}=await reader.read();if(done)break;if(used+value.length>buf.length){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413);}buf.set(value,used);used+=value.length;}
    let input;try{input=readInput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf.subarray(0,used))));}catch{return json({error:'INVALID_INPUT'},400);}
    if(!input)return json({error:'INVALID_INPUT'},400);
    return await mutate(db,actor.id,input,new Date().toISOString());
  }catch{return json({error:'WORKFLOW_UNAVAILABLE'},503);}
}
