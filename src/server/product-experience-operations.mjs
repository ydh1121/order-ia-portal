// Product domain operations. Review fixtures implement the same transport contract
// separately; no review state or client supplied success enters this service.
export async function productExperience(ctx,h){
 const {db,env,actor,path,b,grants,now}=ctx;
 const {sql,rows,hash,fail,id,text,integer,project,visible,getOperation,replay,commit}=h;
 const role=(name,org,site)=>grants.some(g=>g.role===name&&g.org_id===org&&(site===undefined||g.site_id===site));
 const uniqueScope=(roles,orgId)=>{
  const scopes=[...new Map(grants.filter(g=>roles.includes(g.role)&&(!orgId||g.org_id===orgId)).map(g=>[g.org_id,g])).values()];
  if(!scopes.length)fail('ACCESS_DENIED',403);if(scopes.length!==1)fail('BUSINESS_SELECTION_REQUIRED',409);return scopes[0];
 };
 const existing=(kind,entityId)=>sql(db,'SELECT * FROM order_operation WHERE kind=? AND id=?',kind,entityId).first();
 async function save(kind,entityId,scope,state,data,previous,{immutable=false,personal=false,guard='1',params=[],storageScope=scope}={}){
  if(b.expectedRevision!==(previous?.revision||0))fail('REVISION_CONFLICT',409);
  const revision=b.expectedRevision+1,item={id:entityId,revision,status:state,createdAt:previous?.created_at||now,updatedAt:now,...data};
  const active=`coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE' AND EXISTS(SELECT 1 FROM r3_membership WHERE actor_id=? AND active=1 AND org_id=? AND role=? AND (role<>'BUYER' OR site_id=?))`;
  const mutation=previous?sql(db,`UPDATE order_operation SET revision=?,state=?,data_json=?,updated_at=?,org_id=?,site_id=? WHERE kind=? AND id=? AND revision=? AND ${immutable?"state='DRAFT'":'1'} AND ${personal?'created_by=? AND ':''}${active} AND (${guard})`,revision,state,JSON.stringify(data),now,storageScope.org_id,storageScope.site_id||'',kind,entityId,b.expectedRevision,...(personal?[actor.id]:[]),actor.id,actor.id,scope.org_id,scope.role,scope.site_id||'',...params):sql(db,`INSERT INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at) SELECT ?,?,?,?,?,1,?,?,?,? WHERE ?=0 AND ${active} AND (${guard})`,kind,entityId,storageScope.org_id,storageScope.site_id||'',actor.id,state,JSON.stringify(data),now,now,b.expectedRevision,actor.id,actor.id,scope.org_id,scope.role,scope.site_id||'',...params);
  return commit(db,actor.id,b,kind,entityId,mutation,{item},now);
 }
 if(path==='/settings/dashboard-layout'){
  const scopes=grants.filter(g=>g.role==='OPERATOR').sort((a,b)=>a.org_id.localeCompare(b.org_id));if(!scopes.length)fail('ACCESS_DENIED',403);
  const scope=b?.orgId?uniqueScope(['OPERATOR'],b.orgId):scopes[0],entityId=await hash([actor.id,'dashboard-layout']),kind='dashboard-layout',old=await existing(kind,entityId);
  if(!b)return {revision:old?.revision||0,data:old?JSON.parse(old.data_json):{layout:['widget-0','widget-1','widget-2'].map(id=>({id,wide:false}))}};
  const previous=await replay(db,actor.id,b,kind);if(previous)return {revision:previous.item.revision,data:{layout:previous.item.layout}};
  const layout=b.data?.layout;
  if(!Array.isArray(layout)||layout.length!==3||layout.some(x=>!x||typeof x!=='object'||Array.isArray(x))||new Set(layout.map(x=>x.id)).size!==layout.length||layout.some(x=>!['widget-0','widget-1','widget-2'].includes(x.id)||typeof x.wide!=='boolean'||Object.keys(x).some(k=>!['id','wide'].includes(k))))fail('INVALID_LAYOUT');
  const saved=await save(kind,entityId,scope,'ACTIVE',{layout},old,{personal:true});
  // Keep the setting response stable for both the product and review adapter.
  return {revision:saved.item.revision,data:{layout:saved.item.layout}};
 }
 if(path==='/dashboard'&&!b){
  const scopes=grants.filter(g=>g.role==='OPERATOR');if(!scopes.length)fail('ACCESS_DENIED',403);
  const purchases=await rows(db,`SELECT date(o.created_at,'+9 hours') day,json_extract(o.data_json,'$.channel') channel,sum(max(0,coalesce(json_extract(o.data_json,'$.paid'),0)-coalesce(json_extract(o.data_json,'$.refunded'),0))) paid FROM order_operation o WHERE kind='purchase' AND EXISTS(SELECT 1 FROM r3_membership m WHERE m.actor_id=? AND m.role='OPERATOR' AND m.active=1 AND (m.org_id=o.org_id OR m.org_id=json_extract(o.data_json,'$.supplierId'))) GROUP BY day,channel ORDER BY day`,actor.id);
  const values=purchases.map(p=>({createdAt:p.day+'T00:00:00+09:00',channel:p.channel,paid:p.paid,refunded:0})),today=new Date(Date.parse(now)+9*3600000).toISOString().slice(0,10);
  const dayKey=at=>new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10);
  const make=(count,label)=>{
   const end=Date.parse(today+'T00:00:00Z'),start=end-(count-1)*86400000,prior=start-count*86400000;
   const points=Array.from({length:count},(_,i)=>({label:new Date(start+i*86400000).toISOString().slice(0,10),value:0}));
   for(const p of values){const point=points.find(x=>x.label===dayKey(p.createdAt));if(point)point.value+=Math.max(0,(p.paid||0)-(p.refunded||0));}
   const total=points.reduce((sum,p)=>sum+p.value,0),before=values.filter(p=>{const t=Date.parse(dayKey(p.createdAt)+'T00:00:00Z');return t>=prior&&t<start;}).reduce((sum,p)=>sum+Math.max(0,(p.paid||0)-(p.refunded||0)),0);
   return {id:String(count),label,total,change:before?Math.round((total-before)/before*1000)/10:null,points};
  };
  return {title:'실제 매출 현황',scopeLabel:[...new Set(scopes.map(s=>s.org_id))].join(' · '),unit:'원',periods:[make(7,'7일'),make(30,'30일'),make(90,'90일')],segments:['store','farm','campaign'].map((channel,i)=>({id:channel,label:['사업장','농장','공동구매'][i],amount:values.filter(p=>p.channel===channel).reduce((sum,p)=>sum+Math.max(0,(p.paid||0)-(p.refunded||0)),0),color:['#728dff','#50b3a2','#c89cdd'][i]}))};
 }
 if(path.startsWith('/policies/')&&!b){
  return readPublishedPolicy(db,path.slice(10));
 }
 if(path==='/receipt-options'&&!b){
  const list=await rows(db,`SELECT o.* FROM order_operation o WHERE kind='purchase' AND state IN ('PAID','DISPATCHED','RECEIVED') AND ${visible} ORDER BY created_at DESC LIMIT 500`,actor.id);
  return {items:list.map(r=>{const p=project(r);return {...p,models:[(role('OPERATOR',r.org_id)||role('OPERATOR',p.supplierId))&&'order-to-business',role('SUPPLIER',p.supplierId)&&'supplier-to-site'].filter(Boolean)};}).filter(p=>p.models.length)};
 }
 if(path==='/receipts'||path.startsWith('/receipts/')){
  const kind='receipt';
  if(!b){
   if(path==='/receipts')return {items:(await rows(db,`SELECT o.* FROM order_operation o WHERE kind='receipt' AND ${visible} ORDER BY created_at DESC LIMIT 200`,actor.id)).map(project)};
   const row=await getOperation(db,actor.id,kind,path.slice(10));if(!row)fail('NOT_FOUND',404);return {item:project(row)};
  }
  const prior=await sql(db,'SELECT * FROM order_operation_event WHERE actor_id=? AND request_key=?',actor.id,b.requestKey).first();
  if(prior){if(!['receipt','receipt-reuse'].includes(prior.kind)||prior.request_hash!==await hash(b))fail('IDEMPOTENCY_CONFLICT',409);return JSON.parse(prior.data_json);}
  if(path!=='/receipts'||b.action!=='issue'||b.expectedRevision!==0||!id(b.purchaseId)||!['order-to-business','supplier-to-site'].includes(b.model)||!['supplier','site'].includes(b.recipient)||b.model==='supplier-to-site'&&b.recipient!=='site')fail('INVALID_RECEIPT');
  if(Object.keys(b).some(k=>!['action','requestKey','expectedRevision','purchaseId','model','recipient'].includes(k)))fail('CLIENT_DOCUMENT_FORBIDDEN');
  const purchase=await getOperation(db,actor.id,'purchase',b.purchaseId);if(!purchase)fail('NOT_FOUND',404);const p=project(purchase);
  if(!['PAID','DISPATCHED','RECEIVED'].includes(p.status)||!p.receiptId||!integer(p.paid,1,1e12))fail('RECEIPT_PAYMENT_REQUIRED',409);
  let scope;
  if(b.model==='supplier-to-site'){if(!role('SUPPLIER',p.supplierId))fail('ACCESS_DENIED',403);scope=grants.find(g=>g.role==='SUPPLIER'&&g.org_id===p.supplierId);}
  else {scope=grants.find(g=>g.role==='OPERATOR'&&[purchase.org_id,p.supplierId].includes(g.org_id));if(!scope)fail('ACCESS_DENIED',403);}
  const entityId=await hash([b.model,b.purchaseId,b.recipient]),old=await existing(kind,entityId);
  async function reuse(row){
   const result={item:project(row),existing:true},digest=await hash(b),requestId=await hash([actor.id,b.requestKey]);
   await sql(db,`INSERT OR IGNORE INTO order_operation_event(actor_id,request_key,request_hash,kind,entity_id,revision,action,data_json,created_at) SELECT ?,?,?,'receipt-reuse',?,1,'read-existing',?,? WHERE EXISTS(SELECT 1 FROM r3_membership WHERE actor_id=? AND org_id=? AND role=? AND active=1) AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'`,actor.id,b.requestKey,digest,requestId,JSON.stringify(result),now,actor.id,scope.org_id,scope.role,actor.id).run();
   const saved=await sql(db,'SELECT * FROM order_operation_event WHERE actor_id=? AND request_key=?',actor.id,b.requestKey).first();if(!saved)fail('ACCESS_DENIED',403);if(saved.request_hash!==digest||!['receipt','receipt-reuse'].includes(saved.kind))fail('IDEMPOTENCY_CONFLICT',409);return JSON.parse(saved.data_json);
  }
  if(old)return reuse(old);
  const document={number:'RCT-'+now.slice(0,10).replaceAll('-','')+'-'+entityId.slice(0,16).toUpperCase(),model:b.model,purchaseId:p.id,sourceRevision:p.revision,issuedAt:now,issuer:{kind:b.model==='supplier-to-site'?'supplier':'order',orgId:scope.org_id,actorId:actor.id},recipient:{kind:b.recipient,orgId:b.recipient==='supplier'?p.supplierId:purchase.org_id,siteId:b.recipient==='site'?purchase.site_id:''},supplierId:p.supplierId,product:p.product,quantity:p.quantity,unitPrice:p.unitPrice,total:p.total,paid:p.paid,paymentMethod:p.paymentMethod,reference:p.paymentReference||'',sourceReceiptId:p.receiptId};
  document.documentDigest=await hash(document);
  // Store in the original purchase scope so recipient reads use the same boundary.
  const result={item:{id:entityId,revision:1,status:'ISSUED',createdAt:now,updatedAt:now,...document}};
  const mutation=sql(db,`INSERT INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at) SELECT 'receipt',?,?,?,?,1,'ISSUED',?,?,? WHERE EXISTS(SELECT 1 FROM order_operation WHERE kind='purchase' AND id=? AND revision=? AND state IN ('PAID','DISPATCHED','RECEIVED')) AND EXISTS(SELECT 1 FROM r3_membership WHERE actor_id=? AND org_id=? AND role=? AND active=1) AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'`,entityId,purchase.org_id,purchase.site_id,actor.id,JSON.stringify(document),now,now,p.id,p.revision,actor.id,scope.org_id,scope.role,actor.id);
  try{return await commit(db,actor.id,b,kind,entityId,mutation,result,now);}catch(error){const saved=await existing(kind,entityId);if(saved)return reuse(saved);throw error;}
 }
 async function billingAccounts(){
  const purchases=await rows(db,`SELECT o.* FROM order_operation o WHERE kind='purchase' AND ${visible} ORDER BY updated_at DESC LIMIT 500`,actor.id);
  return [...new Map(purchases.flatMap(r=>{const p=project(r),scope=grants.find(g=>g.role==='SUPPLIER'&&g.org_id===p.supplierId)||grants.find(g=>g.role==='OPERATOR'&&[r.org_id,p.supplierId].includes(g.org_id));if(!scope)return [];const target={id:r.org_id+':'+r.site_id,orgId:r.org_id,siteId:r.site_id,label:p.target||r.site_id,supplierId:p.supplierId,issuerOrgId:scope.org_id,issuerRole:scope.role};return [[target.id+':'+scope.org_id,target]];})).values()];
 }
 if(path==='/billing/accounts'&&!b)return {accounts:await billingAccounts()};
 if(path==='/billing'||path.startsWith('/billing/')){
  const kind='billing';
  if(!b){if(path==='/billing')return {items:(await rows(db,`SELECT o.* FROM order_operation o WHERE kind='billing' AND ${visible} ORDER BY created_at DESC LIMIT 200`,actor.id)).map(project)};const row=await getOperation(db,actor.id,kind,path.slice(9));if(!row)fail('NOT_FOUND',404);return {item:project(row)};}
  const prior=await replay(db,actor.id,b,kind);if(prior)return prior;
  if(path!=='/billing'||!['draft','issue'].includes(b.action)||!id(b.id))fail('INVALID_BILLING');
  const old=await existing(kind,b.id);if(old&&old.created_by!==actor.id)fail('NOT_FOUND',404);if(old&&old.state!=='DRAFT')fail('DOCUMENT_IMMUTABLE',409);
  const target=(await billingAccounts()).find(x=>x.id===b.accountId&&x.issuerOrgId===b.issuerOrgId);if(!target)fail('BILLING_ACCOUNT_UNAVAILABLE',403);
  if(!integer(b.amount,1,999999999)||!text(b.subject,160)||typeof(b.memo||'')!=='string'||(b.memo||'').length>2000||!/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate||'')||!Number.isFinite(Date.parse(b.dueDate+'T00:00:00Z'))||new Date(b.dueDate+'T00:00:00Z').toISOString().slice(0,10)!==b.dueDate)fail('INVALID_BILLING');
  if(Object.keys(b).some(k=>!['action','id','requestKey','expectedRevision','accountId','issuerOrgId','amount','subject','memo','dueDate'].includes(k)))fail('INVALID_BILLING');
  const scope=grants.find(g=>g.org_id===target.issuerOrgId&&g.role===target.issuerRole),data={accountId:target.id,target:target.label,recipient:{orgId:target.orgId,siteId:target.siteId},issuer:{orgId:scope.org_id,actorId:actor.id},supplierId:target.supplierId,amount:b.amount,subject:b.subject.trim(),memo:b.memo||'',dueDate:b.dueDate,currency:'KRW',paid:0,deliveryStatus:'NOT_SENT'};
  if(b.action==='issue'){data.number='BILL-'+now.slice(0,10).replaceAll('-','')+'-'+b.id.replaceAll('-','').slice(0,16).toUpperCase();data.issuedAt=now;data.documentDigest=await hash(data);}
  // Membership is rechecked in the write. Issuance stores the document only;
  // sending it or charging a payment is a different, explicitly requested action.
  return save(kind,b.id,scope,b.action==='issue'?'ISSUED':'DRAFT',data,old,{immutable:true,personal:true,storageScope:{org_id:target.orgId,site_id:target.siteId}});
 }
 if(path==='/business-verifications'&&b){
  const kind='business-verification',prior=await replay(db,actor.id,b,kind);if(prior)return prior;
  if(b.action!=='verify'||b.expectedRevision!==0||!id(b.caseId)||!/^\d{10}$/.test(b.number||'')||!/^\d{8}$/.test(b.openingDate||'')||!text(b.name,100)||!text(b.owner,100)||!text(b.industry,100)||!text(b.trade,100))fail('INVALID_BUSINESS');
  const date=b.openingDate.slice(0,4)+'-'+b.openingDate.slice(4,6)+'-'+b.openingDate.slice(6),parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)fail('INVALID_BUSINESS');
  const business=await sql(db,"SELECT * FROM r3_case WHERE id=? AND kind='business'",b.caseId).first();if(!business||business.created_by!==actor.id||!['DRAFT','EVIDENCE_REQUIRED','NEEDS_INFO'].includes(business.state)||!role('BUYER',business.org_id,business.site_id))fail('NOT_FOUND',404);
  const scope=grants.find(g=>g.role==='BUYER'&&g.org_id===business.org_id&&g.site_id===business.site_id);
  async function unavailable(source,error='BUSINESS_PROVIDER_UNAVAILABLE',status=503){
   const notificationId=await hash(['business-provider',business.id]);let alertQueued=false;
   const notice=JSON.stringify({title:'사업자 조회 연결 확인이 필요해요',body:'사업자 인증 신청 '+business.id+'의 조회가 중단됐어요. 연결 상태와 등록증 수동 확인 요청을 확인해 주세요.',category:'other',priority:'urgent',route:'business',caseId:business.id,source});
   try{
    await db.batch([sql(db,`INSERT OR IGNORE INTO order_notification(id,actor_id,revision,data_json,created_at)
     SELECT ?,m.actor_id,1,?,? FROM r3_membership m WHERE m.active=1 AND m.role='OPERATOR' AND m.org_id=?
     AND EXISTS(SELECT 1 FROM r3_membership buyer WHERE buyer.actor_id=? AND buyer.active=1 AND buyer.role='BUYER' AND buyer.org_id=? AND buyer.site_id=?)
     AND EXISTS(SELECT 1 FROM r3_case WHERE id=? AND kind='business' AND created_by=? AND revision=? AND state IN ('DRAFT','EVIDENCE_REQUIRED','NEEDS_INFO'))`,notificationId,notice,now,business.org_id,actor.id,business.org_id,business.site_id,business.id,actor.id,business.revision)]);
    alertQueued=Boolean(await sql(db,'SELECT 1 ok FROM order_notification WHERE id=? LIMIT 1',notificationId).first());
   }catch{ /* A failed notification is explicitly reported, never acknowledged. */ }
   throw Object.assign(Error(error),{status,businessVerification:{source,alertQueued}});
  }
  if(!env.NTS_SERVICE_KEY)return unavailable('configuration');
  const url=new URL('https://api.odcloud.kr/api/nts-businessman/v1/validate');url.searchParams.set('serviceKey',env.NTS_SERVICE_KEY);url.searchParams.set('returnType','JSON');
  const input={b_no:b.number,start_dt:b.openingDate,p_nm:b.owner,b_nm:b.name,b_sector:b.industry,b_type:b.trade};
  let response,result;try{response=await (env.NTS_FETCH||fetch)(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({businesses:[input]}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{return unavailable('provider');}
  if(!response.ok)return unavailable('provider');try{result=await response.json();}catch{return unavailable('invalid-response','BUSINESS_PROVIDER_RESPONSE_INVALID',502);}
  if(!result||typeof result!=='object'||Array.isArray(result)||!Array.isArray(result.data))return unavailable('invalid-response','BUSINESS_PROVIDER_RESPONSE_INVALID',502);
  const entry=result.data[0];if(result.status_code!=='OK'||result.request_cnt!==1||result.data.length!==1||entry?.b_no!==b.number||!['01','02'].includes(entry.valid))return unavailable('invalid-response','BUSINESS_PROVIDER_RESPONSE_INVALID',502);
  const verified=entry.valid==='01'&&entry.status?.b_stt_cd==='01';
  const data={caseId:b.caseId,actorId:actor.id,provider:'NTS',verified,valid:entry.valid,businessStatus:entry.status?.b_stt_cd||null,inputDigest:await hash(input),checkedAt:now,maskedNumber:b.number.slice(0,3)+'-**-'+b.number.slice(-2),consentVersion:'business-verification-v1'};
  const entityId=crypto.randomUUID();return save(kind,entityId,scope,verified?'VERIFIED':'MISMATCH',data,null,{guard:"EXISTS(SELECT 1 FROM r3_case WHERE id=? AND kind='business' AND org_id=? AND site_id=? AND created_by=? AND revision=? AND state IN ('DRAFT','EVIDENCE_REQUIRED','NEEDS_INFO'))",params:[b.caseId,business.org_id,business.site_id,actor.id,business.revision]});
 }
 return undefined;
}

// Public means an explicitly published document, never a draft or environment
// placeholder. This reader is also used before authentication on the three
// signup policy routes; it cannot read arbitrary operation records.
export async function readPublishedPolicy(db,policyId){
 const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
 const id=value=>typeof value==='string'&&/^[\w.:-]{1,128}$/.test(value);
 const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
 if(!db)fail('POLICY_SERVICE_UNAVAILABLE',503);if(!id(policyId))fail('NOT_FOUND',404);
 const row=await db.prepare("SELECT data_json FROM order_operation WHERE kind='policy' AND id=? AND state='PUBLISHED'").bind(policyId).first();if(!row)fail('POLICY_NOT_PUBLISHED',404);
 let doc;try{doc=JSON.parse(row.data_json);}catch{fail('POLICY_DOCUMENT_INVALID',503);}
 if(!doc||!text(doc.title,200)||!id(doc.version)||!Array.isArray(doc.sections)||!doc.sections.length||doc.sections.length>100||doc.sections.some(s=>!s||!id(s.id)||!text(s.title,200)||!Array.isArray(s.paragraphs)||!s.paragraphs.length||s.paragraphs.some(p=>!text(p,20000)))||new Set(doc.sections.map(s=>s.id)).size!==doc.sections.length)fail('POLICY_DOCUMENT_INVALID',503);
 return {id:policyId,version:doc.version,status:'published',title:doc.title,sections:doc.sections};
}
