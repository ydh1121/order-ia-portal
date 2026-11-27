import {readAccountContext,switchAccountContext,workingMemberships,workingRevision} from './product-account-context.mjs';
// One product service, used by the business route and by the isolated lab.
// The lab supplies a DB binding and a server-selected identity, never outcomes.
import {productExperience} from './product-experience-operations.mjs';
import {handleR3Price} from './r3-price.mjs';
import {readRoleScope} from './r3-role.mjs';
import {createPriceMatrixModel} from './order-engine/calculation/price-matrix.mjs';
import {notificationPreferences} from './notification-preferences.mjs';
import {notificationPush,processNotificationWork} from './notification-push.mjs';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const fail=(error,status=400)=>{throw Object.assign(new Error(error),{status});};
const id=v=>typeof v==='string'&&/^[\w.:-]{1,128}$/.test(v);
const text=(v,n=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v,min=0,max=1e9)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
const rows=async(db,q,...args)=>(await sql(db,q,...args).all()).results;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');
const project=r=>r?{id:r.id,revision:r.revision,status:r.state,createdAt:r.created_at,updatedAt:r.updated_at,...JSON.parse(r.data_json)}:null;
const visible=`EXISTS(SELECT 1 FROM ${workingMemberships} m WHERE m.actor_id=? AND m.active=1 AND
 ((m.role='BUYER' AND m.org_id=o.org_id AND m.site_id=o.site_id) OR (m.role='OPERATOR' AND m.org_id=o.org_id)
 OR (m.role IN ('SUPPLIER','OPERATOR') AND m.org_id=json_extract(o.data_json,'$.supplierId'))))`;
const getOperation=(db,actorId,kind,entityId)=>sql(db,`SELECT o.* FROM order_operation o WHERE kind=? AND id=? AND ${visible}`,kind,entityId,actorId).first();
const hasRole=(grants,role,org,site='')=>grants.some(g=>g.role===role&&g.org_id===org&&g.site_id===site);
function purchaseActions(grants,actorId,row){
 const data=JSON.parse(row.data_json),buyer=hasRole(grants,'BUYER',row.org_id,row.site_id),operator=hasRole(grants,'OPERATOR',row.org_id)||hasRole(grants,'OPERATOR',data.supplierId),supplier=hasRole(grants,'SUPPLIER',data.supplierId);
 return [operator&&row.created_by!==actorId&&row.state==='AWAITING_CASH'&&'confirm-cash',buyer&&row.state==='AWAITING_CARD'&&'card',(supplier||operator)&&row.state==='PAID'&&'dispatch',buyer&&row.state==='DISPATCHED'&&'receive',(buyer||operator)&&['AWAITING_CASH','AWAITING_CARD'].includes(row.state)&&'cancel','documents'].filter(Boolean);
}
const matrix=createPriceMatrixModel();

async function body(request,max=131072){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
 const reader=request.body?.getReader();if(!reader)fail('INVALID_INPUT');
 let used=0,chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;used+=value.length;if(used>max){await reader.cancel();fail('BODY_TOO_LARGE',413);}chunks.push(value);}
 const bytes=new Uint8Array(used);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
 let b;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_INPUT');}
 if(!b||typeof b!=='object'||Array.isArray(b)||!id(b.requestKey)||!integer(b.expectedRevision))fail('INVALID_INPUT');return b;
}
async function replay(db,actorId,b,kind){
 const r=await sql(db,'SELECT * FROM order_operation_event WHERE actor_id=? AND request_key=?',actorId,b.requestKey).first();
 if(!r)return null;if(r.request_hash!==await hash(b)||r.kind!==kind)fail('IDEMPOTENCY_CONFLICT',409);
 return JSON.parse(r.data_json);
}
function event(db,actorId,b,kind,entityId,revision,data,digest,now){
 return sql(db,`INSERT INTO order_operation_event(actor_id,request_key,request_hash,kind,entity_id,revision,action,data_json,created_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1`,actorId,b.requestKey,digest,kind,entityId,revision,b.action||'save',JSON.stringify(data),now);
}
async function commit(db,actorId,b,kind,entityId,mutation,result,now,extras=[]){
 const prior=await replay(db,actorId,b,kind);if(prior)return prior;
 const digest=await hash(b);
 try{await db.batch([mutation,event(db,actorId,b,kind,entityId,b.expectedRevision+1,result,digest,now),...extras]);}
 catch(e){const saved=await replay(db,actorId,b,kind);if(saved)return saved;throw e;}
 const saved=await replay(db,actorId,b,kind);if(!saved)fail('REVISION_CONFLICT',409);return saved;
}
async function account(db,actor,b,now){
 const current=await sql(db,'SELECT * FROM order_account WHERE actor_id=?',actor.id).first();
 const existing=current?JSON.parse(current.profile_json):{name:'',phone:'',email:actor.email||'',connections:[]};
 if(!b){const [grants,context]=await Promise.all([readRoleScope(db,actor.id),readAccountContext(db,actor.id)]);return {context,revision:current?.revision||0,state:current?.state||'ACTIVE',profile:existing,capabilities:{dashboard:grants.some(g=>g.role==='OPERATOR'),accountSwitch:context.options.length>1||context.options.length===1&&!context.selected}};}
 const previous=await replay(db,actor.id,b,'account');if(previous)return previous;
 if(current?.state==='WITHDRAWN')fail('ACCOUNT_WITHDRAWN',403);
 if(!['update','withdraw'].includes(b.action))fail('INVALID_ACTION');
 let profile=existing,state='ACTIVE';
 if(b.action==='update'){
  const p=b.profile;if(!p||Object.keys(p).some(k=>!['name','phone'].includes(k))||!text(p.name,80)||typeof p.phone!=='string'||p.phone.length>40||!/^[-+() 0-9]*$/.test(p.phone))fail('INVALID_PROFILE');
  profile={...existing,name:p.name.trim(),phone:p.phone.trim()};
 }else{
  if(b.phrase!=='회원탈퇴'||!['service','price','privacy','other'].includes(b.reason)||typeof (b.note??'')!=='string'||(b.note||'').length>2000||(b.reason==='other'&&!b.note?.trim()))fail('WITHDRAWAL_CONFIRMATION_REQUIRED');
  const pending=await sql(db,"SELECT 1 FROM order_operation WHERE kind='purchase' AND created_by=? AND state NOT IN ('RECEIVED','CANCELLED') LIMIT 1",actor.id).first();
  if(pending)fail('ACTIVE_ORDERS_EXIST',409);
  state='WITHDRAWN';profile={...existing,withdrawal:{reason:b.reason,note:b.note||'',at:now}};
 }
 const revision=b.expectedRevision+1,result={revision,state,profile};
 const mutation=sql(db,`INSERT INTO order_account(actor_id,revision,state,profile_json,updated_at)
 SELECT ?,?,?,?,? WHERE coalesce((SELECT revision FROM order_account WHERE actor_id=?),0)=?
 AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
 AND (?<>'WITHDRAWN' OR NOT EXISTS(SELECT 1 FROM order_operation WHERE kind='purchase' AND created_by=? AND state NOT IN ('RECEIVED','CANCELLED')))
 ON CONFLICT(actor_id) DO UPDATE SET revision=excluded.revision,state=excluded.state,profile_json=excluded.profile_json,updated_at=excluded.updated_at`,actor.id,revision,state,JSON.stringify(profile),now,actor.id,b.expectedRevision,actor.id,state,actor.id);
 const extras=state==='WITHDRAWN'?[sql(db,`UPDATE r3_membership SET active=0 WHERE actor_id=? AND EXISTS(SELECT 1 FROM order_operation_event WHERE actor_id=? AND request_key=? AND kind='account')`,actor.id,actor.id,b.requestKey)]:[];
 return commit(db,actor.id,b,'account',actor.id,mutation,result,now,extras);
}
async function notifications(db,actor,b,now){
 if(!b)return {items:(await rows(db,'SELECT * FROM order_notification WHERE actor_id=? ORDER BY created_at DESC,id LIMIT 200',actor.id)).map(r=>({id:r.id,revision:r.revision,readAt:r.read_at,createdAt:r.created_at,...JSON.parse(r.data_json)}))};
 if(b.action!=='read'||!id(b.id))fail('INVALID_INPUT');
 const result={id:b.id,revision:b.expectedRevision+1,readAt:now};
 return commit(db,actor.id,b,'notification',actor.id+':'+b.id,sql(db,'UPDATE order_notification SET read_at=?,revision=revision+1 WHERE id=? AND actor_id=? AND revision=?',now,b.id,actor.id,b.expectedRevision),result,now);
}
async function offers(db,actorId,grants,now){
 if(!grants.some(g=>g.role==='BUYER'))return [];
 const versions=await rows(db,"SELECT * FROM r3_price_version v WHERE status='APPROVED' AND json_extract(policy_json,'$.effectiveFrom')<=? AND (json_extract(policy_json,'$.effectiveTo') IS NULL OR json_extract(policy_json,'$.effectiveTo')>?) AND EXISTS(SELECT 1 FROM r3_price_scope s WHERE s.supplier_id=v.supplier_id AND s.active=1 AND s.product_id=json_extract(v.policy_json,'$.productId') AND s.origin_id=json_extract(v.policy_json,'$.originId')) ORDER BY v.updated_at DESC LIMIT 100",now,now);
 return versions.flatMap(v=>{const p=JSON.parse(v.policy_json),variants=p.matrix?p.matrix.grades.flatMap(g=>['raw','packed'].map(packing=>({grade:g.id,name:g.name,packing}))):[{grade:null,name:p.displayName||'계란',packing:'packed'}];
  return variants.flatMap(variant=>{const selected=p.matrix?matrix.select(p.matrix,p.minimumOrder,variant.grade,variant.packing):p.tiers.find(r=>r.min<=p.minimumOrder&&(r.max===null||r.max>=p.minimumOrder));if(!selected||selected.error)return [];
   const value=Number(selected.price)+Number(selected.packFee||0);if(!Number.isFinite(value))return [];
   return [{id:v.id+':'+(variant.grade||'all')+':'+variant.packing,versionId:v.id,label:[p.displayName||'계란',variant.name,variant.packing==='packed'?'포장':'원란',p.packSize+'구'].join(' · '),unitPrice:value,minQuantity:p.minimumOrder,shipmentOrigin:'합천 농장',grade:variant.grade,packing:variant.packing,productId:p.productId,unit:p.unit,supplierId:p.supplierId}];
  });});
}
async function purchaseList(db,actorId,grants,now){
 const list=await rows(db,`SELECT o.* FROM order_operation o WHERE kind='purchase' AND ${visible} ORDER BY updated_at DESC,id LIMIT 500`,actorId);
 const buyer=grants.some(g=>g.role==='BUYER'),operator=grants.some(g=>g.role==='OPERATOR'),supplier=grants.some(g=>g.role==='SUPPLIER');
 const items=list.map(row=>{
  const item=project(row);
  if(hasRole(grants,'BUYER',row.org_id,row.site_id))item.buyerOrgId=row.org_id;
  return {...item,actions:purchaseActions(grants,actorId,row)};
 });
 return {items,offers:await offers(db,actorId,grants,now),selectedPurchaseId:null,capabilities:{create:buyer,confirmCash:operator,dispatch:supplier||operator,receive:buyer,cancel:buyer||operator}};
}
async function purchaseQuote(db,env,actor,b,grants,now){
 if(!integer(b.quantity,1,1e7))fail('INVALID_PURCHASE');
 const offer=(await offers(db,actor.id,grants,now)).find(v=>v.id===b.offerId);if(!offer)fail('OFFER_UNAVAILABLE',409);
 const buyers=grants.filter(g=>g.role==='BUYER'&&(!b.siteId||g.site_id===b.siteId));if(!buyers.length)fail('ACCESS_DENIED',403);if(buyers.length>1)fail('BUSINESS_SELECTION_REQUIRED',409);const scope=buyers[0];
 const serviceDate=b.serviceDate||new Date(Date.parse(now)+9*3600000+86400000).toISOString().slice(0,10);
 let quote;
 if(b.acceptedQuoteId){
  const snapshot=await sql(db,'SELECT * FROM r3_price_quote WHERE id=? AND actor_id=? AND org_id=? AND site_id=?',b.acceptedQuoteId,actor.id,scope.org_id,scope.site_id).first();
  if(!snapshot||snapshot.expires_at<=now)fail('QUOTE_EXPIRED_OR_CHANGED',409);
  const source=JSON.parse(snapshot.sources_json),line=source.lines?.[0];
  if(source.lines?.length!==1||line.versionId!==offer.versionId||line.deliveryQty!==b.quantity||line.grade!==offer.grade||line.packing!==offer.packing||line.serviceDate!==serviceDate)fail('QUOTE_INPUT_CHANGED',409);
  const site=await sql(db,"SELECT 1 FROM r3_business_site WHERE org_id=? AND site_id=? AND verification='VERIFIED'",scope.org_id,scope.site_id).first();if(!site)fail('BUSINESS_VERIFICATION_REQUIRED',403);
  quote={id:snapshot.id,expiresAt:snapshot.expires_at,response:JSON.parse(snapshot.result_json)};
 }else{
  const requestKey='purchase-'+b.requestKey,quoteRequest={orgId:scope.org_id,siteId:scope.site_id,inputRevision:1,requestKey,lines:[{id:'purchase-line',shipmentId:'purchase-shipment',versionId:offer.versionId,productId:offer.productId,unit:offer.unit,serviceDate,deliveryQty:b.quantity,grade:offer.grade,packing:offer.packing}]};
  const response=await handleR3Price({request:new Request('https://product.invalid/api/ia/r3-price/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(quoteRequest)}),env:{...env,ORDER_QA_DB:db},actor,path:'/quote',clock:()=>now});
  quote=await response.json();if(!response.ok)fail(quote.error,response.status);
 }
 const total=Number(quote.response?.quotes?.[0]?.total?.decimal);if(!integer(total,0,1e12))fail('AMOUNT_NOT_SETTLEABLE',422);
 return {offer,scope,serviceDate,quote,total,result:{quoteId:quote.id,quantity:b.quantity,total,unitPrice:total/b.quantity,expiresAt:quote.expiresAt,offerId:offer.id,serviceDate}};
}
async function purchases(db,env,actor,b,grants,now){
 if(!b)return purchaseList(db,actor.id,grants,now);
 const previous=await replay(db,actor.id,b,'purchase');if(previous)return previous;
 let old,entityId,data,next,scope;
 if(b.action==='create'){
  if(b.expectedRevision!==0||!integer(b.quantity,1,1e7)||!['cash','card'].includes(b.paymentMethod)||!['store','farm','campaign'].includes(b.channel))fail('INVALID_PURCHASE');
  if(Object.keys(b).some(k=>!['requestKey','expectedRevision','action','offerId','quantity','paymentMethod','channel','grade','packing','siteId','serviceDate','acceptedQuoteId'].includes(k)))fail('CLIENT_PRICE_FORBIDDEN');
  const prepared=await purchaseQuote(db,env,actor,b,grants,now),{offer,serviceDate,quote,total}=prepared;scope=prepared.scope;
  entityId=crypto.randomUUID();next=b.paymentMethod==='cash'?'AWAITING_CASH':'AWAITING_CARD';
  data={offerId:offer.id,quoteId:quote.id,product:offer.label,quantity:b.quantity,trays:b.quantity,unitPrice:total/b.quantity,total,paid:0,refunded:0,cancelledTrays:0,paymentMethod:b.paymentMethod,channel:b.channel,date:now.slice(0,10),targetId:scope.site_id,target:scope.site_id,supplierId:offer.supplierId,shipmentOrigin:offer.shipmentOrigin,serviceDate,carrier:'',tracking:'',receiptId:null};
 }else{
  if(!id(b.id))fail('INVALID_INPUT');old=await getOperation(db,actor.id,'purchase',b.id);if(!old)fail('NOT_FOUND',404);
  if(old.revision!==b.expectedRevision)fail('REVISION_CONFLICT',409);
  data=JSON.parse(old.data_json);entityId=old.id;scope={org_id:old.org_id,site_id:old.site_id};next=old.state;
  const buyer=hasRole(grants,'BUYER',old.org_id,old.site_id),operator=hasRole(grants,'OPERATOR',old.org_id)||hasRole(grants,'OPERATOR',data.supplierId),supplier=hasRole(grants,'SUPPLIER',data.supplierId);
  if(b.action==='confirm-cash'){
   if(!operator||old.created_by===actor.id)fail('ACCESS_DENIED',403);
   if(old.state!=='AWAITING_CASH'||!text(b.reference,120))fail('PAYMENT_CONFIRMATION_REQUIRED',409);
   data={...data,paid:data.total,paymentReference:b.reference,paymentConfirmedBy:actor.id,paymentConfirmedAt:now,receiptId:crypto.randomUUID()};next='PAID';
  }else if(b.action==='card'){
   if(!buyer||old.state!=='AWAITING_CARD')fail('ACTION_NOT_ALLOWED',403);
   // An absent processor is a visible blocker. A UI timer cannot confirm funds.
   fail('PAYMENT_PROVIDER_UNAVAILABLE',503);
  }else if(b.action==='dispatch'){
   if(!supplier&&!operator)fail('ACCESS_DENIED',403);
   if(old.state!=='PAID'||!['farm','parcel','freight','quick'].includes(b.carrier)||typeof (b.tracking||'')!=='string'||(b.tracking||'').length>100||b.carrier==='parcel'&&!text(b.tracking,100))fail('DISPATCH_CONDITIONS_REQUIRED',409);
   data={...data,carrier:b.carrier,tracking:b.tracking||'',dispatchedAt:now};next='DISPATCHED';
  }else if(b.action==='receive'){
   if(!buyer||old.state!=='DISPATCHED')fail('ACTION_NOT_ALLOWED',403);data={...data,receivedAt:now};next='RECEIVED';
  }else if(b.action==='cancel'){
   if(!buyer&&!operator)fail('ACCESS_DENIED',403);if(!['AWAITING_CASH','AWAITING_CARD'].includes(old.state))fail('REFUND_REVIEW_REQUIRED',409);data={...data,cancelledTrays:data.quantity,cancelledAt:now};next='CANCELLED';
  }else fail('INVALID_ACTION');
 }
 const revision=b.expectedRevision+1,item={id:entityId,revision,status:next,createdAt:old?.created_at||now,updatedAt:now,...data,actions:purchaseActions(grants,actor.id,{org_id:scope.org_id,site_id:scope.site_id,created_by:old?.created_by||actor.id,state:next,data_json:JSON.stringify(data)})},result={item};
 const mutation=old?sql(db,`UPDATE order_operation SET revision=revision+1,state=?,data_json=?,updated_at=? WHERE kind='purchase' AND id=? AND revision=?
 AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
 AND EXISTS(SELECT 1 FROM ${workingMemberships} m WHERE m.actor_id=? AND m.active=1 AND
 ((? IN ('confirm-cash','dispatch','cancel') AND m.role='OPERATOR' AND m.org_id IN (?,?))
 OR (?='dispatch' AND m.role='SUPPLIER' AND m.org_id=?)
 OR (? IN ('receive','cancel') AND m.role='BUYER' AND m.org_id=? AND m.site_id=?)))`,next,JSON.stringify(data),now,entityId,b.expectedRevision,actor.id,actor.id,b.action,scope.org_id,data.supplierId,b.action,data.supplierId,b.action,scope.org_id,scope.site_id):sql(db,`INSERT OR IGNORE INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at)
 SELECT 'purchase',?,?,?,?,1,?,?,?,? WHERE coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
 AND EXISTS(SELECT 1 FROM ${workingMemberships} WHERE actor_id=? AND active=1 AND role='BUYER' AND org_id=? AND site_id=?)`,entityId,scope.org_id,scope.site_id,actor.id,next,JSON.stringify(data),now,now,actor.id,actor.id,scope.org_id,scope.site_id);
 const notificationId=entityId+':'+revision,notification=JSON.stringify({title:'주문 상태가 변경됐어요',body:data.product,status:next,route:'purchases',entityId});
 const extras=[sql(db,`INSERT OR IGNORE INTO order_notification(id,actor_id,revision,data_json,created_at)
 SELECT ?,m.actor_id,1,?,? FROM r3_membership m WHERE m.active=1 AND
 ((m.org_id=? AND (m.site_id=? OR m.role='OPERATOR')) OR m.org_id=?)
 AND EXISTS(SELECT 1 FROM order_operation_event WHERE actor_id=? AND request_key=? AND kind='purchase')`,notificationId,notification,now,scope.org_id,scope.site_id,data.supplierId,actor.id,b.requestKey)];
 return commit(db,actor.id,b,'purchase',entityId,mutation,result,now,extras);
}
async function setting(db,actor,b,grants,kind,now){
 const scope=grants.find(g=>g.role==='OPERATOR');if(!scope)fail('ACCESS_DENIED',403);
 const entityId=scope.org_id+':'+kind,old=await sql(db,'SELECT * FROM order_operation WHERE kind=? AND id=?',kind,entityId).first();
 if(!b)return {revision:old?.revision||0,data:old?JSON.parse(old.data_json):kind==='revenue'?{initialReferral:false,contributors:[]}:{templates:[]}};
 let data=b.data;if(!data||typeof data!=='object'||Array.isArray(data))fail('INVALID_SETTING');
 if(kind==='revenue'){
  if(typeof data.initialReferral!=='boolean'||!Array.isArray(data.contributors)||!data.contributors.length||data.contributors.length>40)fail('INVALID_SETTING');
  let sum=0;const codes=new Set();data={initialReferral:data.initialReferral,contributors:data.contributors.map(c=>{const bps=Math.round(Number(c.rate)*100);if(!text(c.name,80)||typeof (c.code||'')!=='string'||(c.code||'').length>80||!integer(bps,0,10000)||Math.abs(Number(c.rate)*100-bps)>1e-8||c.code&&codes.has(c.code))fail('INVALID_CONTRIBUTOR');if(c.code)codes.add(c.code);sum+=bps;return {name:c.name,code:c.code||'',rate:bps/100};})};
  if(sum!==10000)fail('RATES_MUST_TOTAL_100');
 }else{
  if(!Array.isArray(data.templates)||data.templates.length>3)fail('INVALID_TEMPLATE');
  const names=new Set();data={templates:data.templates.map(t=>{if(!['welcome','verification','withdrawal'].includes(t.id)||names.has(t.id)||!text(t.subject,160)||typeof t.body!=='string'||!t.body.trim()||t.body.length>10000)fail('INVALID_TEMPLATE');names.add(t.id);return {id:t.id,subject:t.subject,body:t.body};})};
 }
 const revision=b.expectedRevision+1,result={revision,data};
 const mutation=sql(db,`INSERT INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at)
 SELECT ?,?,?,'',?,?,'ACTIVE',?,?,? WHERE coalesce((SELECT revision FROM order_operation WHERE kind=? AND id=?),0)=?
 AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
 AND EXISTS(SELECT 1 FROM ${workingMemberships} WHERE actor_id=? AND role='OPERATOR' AND org_id=? AND active=1)
 ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at`,kind,entityId,scope.org_id,actor.id,revision,JSON.stringify(data),now,now,kind,entityId,b.expectedRevision,actor.id,actor.id,scope.org_id);
 return commit(db,actor.id,b,kind,entityId,mutation,result,now);
}
async function draft(db,actor,mode,b,now){
 if(!['simple','detailed'].includes(mode))fail('INVALID_MODE');
 const old=await sql(db,'SELECT * FROM order_quote_draft WHERE actor_id=? AND mode=?',actor.id,mode).first();
 if(!b)return {mode,revision:old?.revision||0,data:old?JSON.parse(old.data_json):null,updatedAt:old?.updated_at||null};
 const data=JSON.stringify(b.data);if(!b.data||typeof b.data!=='object'||Array.isArray(b.data))fail('INVALID_DRAFT');
 if(new TextEncoder().encode(data).length>2000000)fail('DRAFT_TOO_LARGE',413);
 if(old?.request_key===b.requestKey){if(old.revision!==b.expectedRevision+1||old.data_json!==data)fail('IDEMPOTENCY_CONFLICT',409);return {mode,revision:old.revision,data:b.data,updatedAt:old.updated_at};}
 await sql(db,`INSERT INTO order_quote_draft(actor_id,mode,revision,request_key,data_json,updated_at)
 SELECT ?,?,?,?,?,? WHERE coalesce((SELECT revision FROM order_quote_draft WHERE actor_id=? AND mode=?),0)=?
 AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
 ON CONFLICT(actor_id,mode) DO UPDATE SET revision=excluded.revision,request_key=excluded.request_key,data_json=excluded.data_json,updated_at=excluded.updated_at`,actor.id,mode,b.expectedRevision+1,b.requestKey,data,now,actor.id,mode,b.expectedRevision,actor.id).run();
 const result=await sql(db,'SELECT * FROM order_quote_draft WHERE actor_id=? AND mode=?',actor.id,mode).first();
 if(result?.request_key!==b.requestKey)fail('REVISION_CONFLICT',409);
 return {mode,revision:result.revision,data:b.data,updatedAt:result.updated_at};
}
async function documents(db,actor,documentId){
 const item=await getOperation(db,actor.id,'purchase',documentId);if(!item)fail('NOT_FOUND',404);
 const p=project(item);return {purchaseId:p.id,quoteId:p.quoteId,receiptId:p.receiptId,quote:{number:p.quoteId,issuedAt:p.createdAt,product:p.product,quantity:p.quantity,unitPrice:p.unitPrice,total:p.total},receipt:p.receiptId?{number:p.receiptId,issuedAt:p.paymentConfirmedAt,paymentMethod:p.paymentMethod,paid:p.paid,reference:p.paymentReference}:null};
}
export async function handleProductOperations({request,env,actor,path='/',clock=()=>new Date().toISOString()}){
 if(!actor?.id)return json({error:'ACCESS_DENIED'},403);
 const db=env.ORDER_PRODUCT_DB||env.ORDER_QA_DB;if(!db)return json({error:'PRODUCT_DB_UNAVAILABLE'},503);
 if(!['GET','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const now=clock(),b=request.method==='POST'?await body(request,path.startsWith('/drafts/')?2024000:131072):null;
  if(path==='/features'&&!b){const flag=await sql(db,'SELECT enabled FROM r3_menu_publication ORDER BY revision DESC LIMIT 1').first();return json({orderMenu:flag?.enabled===1});}
  const state=await sql(db,'SELECT state FROM order_account WHERE actor_id=?',actor.id).first();
  if(state?.state==='WITHDRAWN'&&path!=='/account')fail('ACCOUNT_WITHDRAWN',403);
  if(path==='/account-context'){
   if(!b)return json(await readAccountContext(db,actor.id));
   return json(await switchAccountContext(db,actor,b,now,{sql,replay,commit,fail}));
  }
  if(path==='/account')return json(await account(db,actor,b,now));
  if(path==='/notifications')return json(await notifications(db,actor,b,now));
  if(path==='/notification-preferences')return json(await notificationPreferences({db,env,actor,body:b,now},{sql,replay,commit,fail}));
  if(path==='/notification-push')return json(await notificationPush({db,env,actor,body:b,now},{sql,replay,commit,fail}));
  if(path==='/notification-push/drain'){
   if(actor.role!=='OWNER')fail('ACCESS_DENIED',403);
   if(!b||b.action!=='drain'||b.expectedRevision!==0||Object.keys(b).some(key=>!['action','expectedRevision','requestKey'].includes(key)))fail('INVALID_PUSH_COMMAND');
   return json(await processNotificationWork(env,{now}));
  }
  if(path.startsWith('/drafts/'))return json(await draft(db,actor,path.slice(8),b,now));
  const grants=await readRoleScope(db,actor.id);if(!grants.length&&!path.startsWith('/policies/'))fail('NO_BUSINESS_MEMBERSHIP',403);
  if(b){
   const revision=await workingRevision(db,actor.id,request);
   // Isolate a retry key from operations issued in an earlier organization.
   if(revision)b.requestKey=await hash([revision,b.requestKey]);
  }
  const experience=await productExperience({db,env,actor,path,b,grants,now},{sql,rows,hash,fail,id,text,integer,project,visible,getOperation,replay,commit});
  if(experience!==undefined)return json(experience);
  if(path==='/purchase-quote'&&b)return json((await purchaseQuote(db,env,actor,b,grants,now)).result);
  if(path==='/purchases')return json(await purchases(db,env,actor,b,grants,now));
  if(path==='/sales'&&!b){if(!grants.some(g=>g.role==='OPERATOR'))fail('ACCESS_DENIED',403);return json(await purchaseList(db,actor.id,grants,now));}
  if(path==='/revenue'||path==='/email-templates')return json(await setting(db,actor,b,grants,path.slice(1),now));
  if(path.startsWith('/documents/')&&!b)return json(await documents(db,actor,path.slice(11)));
  return json({error:'NOT_FOUND'},404);
 }catch(error){return json({error:error.status?error.message:'PRODUCT_SERVICE_UNAVAILABLE',...(error.businessVerification?{businessVerification:error.businessVerification}:{})},error.status||503);}
}
