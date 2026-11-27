import {createPriceWorkspaceModel} from './r3-price-workspace-model.mjs';
import {defaultPriceRows} from './r3-price-workspace-defaults.mjs';
import {personalPrice} from './r3-personal-price.mjs';
import {PolicyError} from './order-engine/calculation/supply-policy.mjs';
const model=createPriceWorkspaceModel(),sql=(db,q,...args)=>db.prepare(q).bind(...args);
const fail=(message,status=422)=>{throw new PolicyError(message,status);};
const project=r=>r?{revision:r.revision,action:r.action,date:r.price_date,effectiveAt:r.effective_at,savedAt:r.saved_at,document:JSON.parse(r.content)}:null;
async function keyFor(actor){
  const email=actor?.email?.trim().toLowerCase();
  if(!['OWNER','BUSINESS'].includes(actor?.role)||typeof actor.id!=='string'||!actor.id||!email||!/^\S+@\S+\.\S+$/.test(email))fail('ACCESS_REQUIRED',403);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['order.price-workspace.v1',actor.role,actor.id,email])));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function priceWorkspace(db,actor,body,now,version=null,{metadata=false}={}){
  const key=await keyFor(actor);
  const publishing=body?.publishMarket===true;
  if(body&&body.publishMarket!==undefined&&typeof body.publishMarket!=='boolean')fail('INVALID_REQUEST',400);
  const canPublishMarket=actor.role==='OWNER'||(body===null||publishing)&&
    Boolean(await sql(db,'SELECT 1 ok FROM r3_release_admin WHERE actor_id=? AND active=1',actor.id).first());
  if(publishing&&!canPublishMarket)fail('MARKET_PUBLICATION_DENIED',403);
  if(publishing&&body.action==='draft')fail('MARKET_PUBLICATION_REQUIRES_APPLY');
  if(body===null){
    const latest=await sql(db,'SELECT * FROM r3_price_workspace_event WHERE principal=? ORDER BY revision DESC LIMIT 1',key).first();
    const effective=await sql(db,"SELECT * FROM r3_price_workspace_event WHERE principal=? AND action<>'draft' AND effective_at<=? ORDER BY effective_at DESC,revision DESC LIMIT 1",key,now).first();
    const versions=(await sql(db,'SELECT revision,action,price_date date,effective_at effectiveAt,saved_at savedAt FROM r3_price_workspace_event WHERE principal=? ORDER BY price_date DESC,revision DESC LIMIT 1000',key).all()).results;
    if(metadata)return {canPublishMarket,revision:latest?.revision||0,versions,effective:effective?{revision:effective.revision,date:effective.price_date,effectiveAt:effective.effective_at,action:effective.action,savedAt:effective.saved_at}:null,serverTime:now};
    let selected=latest;
    if(version!==null){if(!/^\d+$/.test(String(version)))fail('INVALID_REQUEST',400);selected=await sql(db,'SELECT * FROM r3_price_workspace_event WHERE principal=? AND revision=?',key,Number(version)).first();if(!selected)fail('NOT_FOUND',404);}
    let document=selected?JSON.parse(selected.content):null;
    if(!document){const own=await personalPrice(db,actor,null,now);document=model.initial(new Date(Date.parse(now)+9*3600000).toISOString().slice(0,10),defaultPriceRows,own.draft);}
    return {canPublishMarket,revision:latest?.revision||0,selectedRevision:selected?.revision||0,document,versions,effective:project(effective),serverTime:now};
  }
  if(!['draft','apply','schedule'].includes(body.action)||!/^[-\da-f]{36}$/i.test(body.requestKey)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('INVALID_REQUEST',400);
  let document;try{document=model.normalize(body.document);}catch(e){fail(e.message);}
  const effectiveAt=body.action==='draft'?null:body.action==='apply'?now:body.effectiveAt;
  const content=JSON.stringify(document),prior=await sql(db,'SELECT * FROM r3_price_workspace_event WHERE principal=? AND request_key=?',key,body.requestKey).first();
  if(prior){if(Boolean(prior.market_projection)!==publishing||prior.content!==content||prior.revision!==body.expectedRevision+1||prior.action!==body.action||(body.action==='schedule'&&prior.effective_at!==effectiveAt))fail('IDEMPOTENCY_CONFLICT',409);return {saved:project(prior),serverTime:now};}
  if(body.action==='schedule'&&(typeof effectiveAt!=='string'||!Number.isFinite(Date.parse(effectiveAt))||new Date(effectiveAt).toISOString()!==effectiveAt||effectiveAt<=now))fail('WORKSPACE_SCHEDULE_INVALID');
  const projection=publishing?JSON.stringify(model.marketSnapshot(document)):null;
  await sql(db,`INSERT INTO r3_price_workspace_event(principal,revision,request_key,action,price_date,effective_at,content,saved_at,market_projection)
    SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM r3_price_workspace_event WHERE principal=?),0)=?
    AND (?=0 OR ?=1 OR EXISTS(SELECT 1 FROM r3_release_admin WHERE actor_id=? AND active=1))
    ON CONFLICT DO NOTHING`,key,body.expectedRevision+1,body.requestKey,body.action,document.date,effectiveAt,content,now,projection,key,body.expectedRevision,Number(publishing),Number(actor.role==='OWNER'),actor.id).run();
  const saved=await sql(db,'SELECT * FROM r3_price_workspace_event WHERE principal=? AND request_key=?',key,body.requestKey).first();
  if(!saved)fail('REVISION_CONFLICT',409);
  if(Boolean(saved.market_projection)!==publishing||saved.content!==content||saved.revision!==body.expectedRevision+1||saved.action!==body.action||(body.action==='schedule'&&saved.effective_at!==effectiveAt))fail('IDEMPOTENCY_CONFLICT',409);
  return {saved:project(saved),serverTime:now};
}
