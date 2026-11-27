import {workingMemberships,workingPriceConnection} from './product-account-context.mjs';
// Private IA review domain. The router authenticates the transport and enforces CSRF;
// the DB below separately authorizes the business actor and target of every operation.
import { validateSupplyPolicy, simulateSupplyQuote, previousPeriod, PolicyError } from './order-engine/calculation/supply-policy.mjs';
import {editPriceCatalog,checkPriceGroup} from './r3-price-catalog.mjs';
import {personalPrice} from './r3-personal-price.mjs';
import {readEggMarket} from './r3-egg-market.mjs';
import {priceWorkspace} from './r3-price-workspace-store.mjs';
import {registrationDesk,registerProduct,updateConnection} from './r3-price-registration.mjs';
import {createPriceMatrixModel} from './order-engine/calculation/price-matrix.mjs';
import {freightPack} from './r3-carrier-page.mjs';
import {isolatedPriceDb,practiceScope,startPractice} from './r3-price-practice.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'Cookie, Authorization','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const deny=()=>{throw new PolicyError('ACCESS_REQUIRED',403);};
const invalid=(code='INVALID_REQUEST')=>{throw new PolicyError(code,400);};
const validId=v=>typeof v==='string'&&/^[\w.:-]{1,100}$/.test(v);
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const staff="m.role IN('SUPPLIER','OPERATOR') AND m.active=1 AND m.site_id=''";
const priceModel=createPriceMatrixModel();
const assigned=(org,origin,product,memberships)=>`EXISTS(SELECT 1 FROM r3_price_connection a JOIN r3_price_scope ps
  ON ps.supplier_id=a.supplier_id AND ps.origin_id=a.origin_id AND ps.product_id=a.product_id AND ps.active=1
  WHERE a.actor_id=? AND a.state='LINKED' AND ${memberships===workingMemberships?workingPriceConnection:'1'} AND a.supplier_id=${org} AND a.origin_id=${origin} AND a.product_id=${product}
  AND NOT EXISTS(SELECT 1 FROM r3_membership revoked WHERE revoked.actor_id=a.actor_id AND revoked.org_id=a.supplier_id AND revoked.active=0 AND revoked.role='SUPPLIER'))`;
const versionAccess=memberships=>`EXISTS(SELECT 1 FROM ${memberships} m WHERE m.actor_id=? AND m.org_id=v.supplier_id AND ${staff})
  OR ${assigned('v.supplier_id',"json_extract(v.policy_json,'$.originId')","json_extract(v.policy_json,'$.productId')",memberships)}`;
const verified="m.role='BUYER' AND m.active=1 AND s.verification='VERIFIED'";
const nextState={create:'DRAFT',edit:'DRAFT',submit:'SUBMITTED',return:'RETURNED',approve:'APPROVED',withdraw:'WITHDRAWN'};
const version=v=>({id:v.id,revision:v.revision,status:v.status,policy:JSON.parse(v.policy_json),predecessor:v.predecessor,createdBy:v.created_by,approvedBy:v.approved_by,approvedAt:v.approved_at,approvalId:v.approved_by?v.id+':'+v.revision:null});
async function parseBody(request,limit=131072) {
  if(!request.headers.get('content-type')?.split(';')[0].match(/^application\/json$/)) invalid();
  if(!request.body || Number(request.headers.get('content-length'))>limit) invalid();
  const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let length=0,text='';
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();invalid('TOO_LARGE');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value;}
  catch(e){if(e instanceof PolicyError)throw e;invalid();}finally{reader.releaseLock();}
}
async function mustStaff(db,actorId,p,approve,memberships){
  const row=await first(db,`SELECT 1 ok WHERE EXISTS(SELECT 1 FROM ${memberships} m WHERE actor_id=? AND org_id=? AND ${staff} AND (?=0 OR m.role='OPERATOR'))
    OR (?=0 AND ${assigned('?','?','?',memberships)})`,actorId,p.supplierId,Number(approve),Number(approve),actorId,p.supplierId,p.originId,p.productId);
  if(!row)deny();
}
async function loadStaffVersion(db,actorId,id,memberships){
  if(!validId(id))invalid();
  const v=await first(db,`SELECT v.* FROM r3_price_version v WHERE id=? AND (${versionAccess(memberships)})`,id,actorId,actorId);
  if(!v)deny();return v;
}
function verifyRetry(previous,digest){if(previous.request_hash!==digest)throw new PolicyError('IDEMPOTENCY_CONFLICT',409);return {id:previous.version_id,revision:previous.revision,status:previous.status};}
async function writeVersion(db,actorId,b,now,memberships) {
  const {id,action,requestKey,expectedRevision}=b;
  if(!validId(id)||!validId(requestKey)||!Object.hasOwn(nextState,action)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)invalid();
  const old=action==='create'?null:await loadStaffVersion(db,actorId,id,memberships);
  const policy=action==='create'||action==='edit'?b.policy:JSON.parse(old.policy_json);
  if(!policy || !validId(policy.supplierId))invalid();
  if(old && old.supplier_id!==policy.supplierId)deny();
  await mustStaff(db,actorId,policy,['approve','return','withdraw'].includes(action),memberships);
  const digest=await hash(b),retry=await first(db,'SELECT * FROM r3_price_event WHERE actor_id=? AND request_key=?',actorId,requestKey);
  if(retry)return verifyRetry(retry,digest);
  if(['create','edit'].includes(action)&&Array.isArray(policy.matrix?.rows)){
    for(const row of policy.matrix.rows)if(Array.isArray(row?.cells))row.cells=row.cells.map(cell=>priceModel.normalize(cell));
  }
  if(['create','edit','submit','approve'].includes(action)){
    const catalog=await checkPriceGroup(db,policy);
    if(catalog&&['create','edit'].includes(action)){
      policy.displayName=catalog.productName;
      if(policy.sourceVersion){
        const source=await loadStaffVersion(db,actorId,policy.sourceVersion,memberships),prior=JSON.parse(source.policy_json);
        if(!prior.tiers||prior.supplierId!==policy.supplierId||prior.originId!==policy.originId||prior.productId!==policy.productId)deny();
      }
    }
  }
  validateSupplyPolicy(policy,{allowPendingPerformance:Boolean(policy.matrix&&['create','edit'].includes(action))});
  if((expectedRevision===0)!==(action==='create') || (old && expectedRevision!==old.revision))throw new PolicyError('REVISION_CONFLICT',409);
  if((action==='return'||action==='withdraw') && (typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>240))invalid('REASON_REQUIRED');
  const scope=JSON.stringify([policy.supplierId,policy.originId,policy.productId,policy.packaging,policy.unit]);
  const values=[id,expectedRevision+1,policy.supplierId,scope,old?.predecessor??b.predecessor??null,action,nextState[action],actorId,b.reason||null,now,requestKey,digest,JSON.stringify(policy)];
  const scoped=memberships===workingMemberships;
  const args=scoped?[actorId,policy.supplierId]:[];
  const eventSql=`INSERT INTO r3_price_event(version_id,revision,supplier_id,scope_key,predecessor,action,status,actor_id,reason,event_at,request_key,request_hash,policy_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
  ${scoped?"WHERE NOT EXISTS(SELECT 1 FROM order_operation chosen WHERE chosen.kind='account-context' AND chosen.id=? AND (chosen.org_id<>? OR chosen.site_id<>'' OR NOT EXISTS(SELECT 1 FROM r3_membership g WHERE g.actor_id=chosen.id AND g.org_id=chosen.org_id AND g.site_id='' AND g.active=1)))":''}`;
  try {
    const next=db.prepare(eventSql).bind(...values,...args);
    if(b.replacePredecessorRevision!=null) {
      if(action!=='approve'||!old?.predecessor||!Number.isSafeInteger(b.replacePredecessorRevision)||!policy.matrix||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>240)invalid('REASON_REQUIRED');
      const prior=await loadStaffVersion(db,actorId,old.predecessor,memberships);
      if(prior.scope_key!==scope||prior.status!=='APPROVED'||prior.revision!==b.replacePredecessorRevision)throw new PolicyError('REVISION_CONFLICT',409);
      if(policy.effectiveFrom>now)throw new PolicyError('SUCCESSOR_NOT_EFFECTIVE');
      // Both events share one transaction. A rejected approval leaves the prior version active.
      const withdraw=db.prepare(eventSql).bind(prior.id,prior.revision+1,prior.supplier_id,prior.scope_key,prior.predecessor,'withdraw','WITHDRAWN',actorId,b.reason,now,'switch-'+digest,digest,prior.policy_json,...args);
      const saved=await db.batch([withdraw,next]);if(saved.some(row=>row.meta?.changes===0))deny();
    } else if((await next.run()).meta?.changes===0)deny();
  }
  catch(e){const matched=await first(db,'SELECT * FROM r3_price_event WHERE actor_id=? AND request_key=?',actorId,requestKey);if(matched)return verifyRetry(matched,digest);throw e;}
  return {id,revision:expectedRevision+1,status:nextState[action]};
}
async function destination(db,actorId,org,site,memberships) {
  const d=await first(db,`SELECT d.region_code,d.region_version,d.postcode FROM ${memberships} m JOIN r3_business_site s ON s.org_id=m.org_id AND s.site_id=m.site_id JOIN r3_price_destination d ON d.org_id=s.org_id AND d.site_id=s.site_id WHERE m.actor_id=? AND m.org_id=? AND m.site_id=? AND ${verified}`,actorId,org,site);
  if(!d)deny();return d;
}
async function statFor(db,orgId,line,policy,now) {
  const r=policy.performance;
  if(r.basis==='DELIVERY')return null;
  const site=r.scope==='SITE'?line.siteId:'',supplier=['SUPPLIER','SKU','BUNDLE'].includes(r.scope)?policy.supplierId:'',product=r.scope==='SKU'?policy.productId:r.scope==='BUNDLE'?r.bundleId:'';
  const key=JSON.stringify([r.scope,r.event,r.adjustmentRuleId,r.aggregationVersion,policy.timeZone]);
  return first(db,'SELECT period,status,quantity,finalized_at finalizedAt FROM r3_price_performance WHERE org_id=? AND site_scope=? AND supplier_scope=? AND product_scope=? AND period=? AND unit=? AND basis_key=?',orgId,site,supplier,product,previousPeriod(now),policy.unit,key);
}
async function getSnapshot(db,actorId,id,now,memberships) {
  if(!validId(id))invalid();
  const q=await first(db,`SELECT q.id,q.org_id,q.site_id,q.issued_at,q.expires_at,q.result_json,
    json_array_length(q.sources_json,'$.lines') line_count,
    json_extract(q.sources_json,'$.lines[0].deliveryQty') qty,
    json_extract(q.sources_json,'$.lines[0].unit') unit,
    json_extract(q.sources_json,'$.versions[0].policy.displayName') product_name
    FROM r3_price_quote q JOIN ${memberships} m ON m.org_id=q.org_id AND m.site_id=q.site_id JOIN r3_business_site s ON s.org_id=m.org_id AND s.site_id=m.site_id WHERE q.id=? AND m.actor_id=? AND ${verified}`,id,actorId);
  if(!q)deny();
  if(q.expires_at<=now)return {id,status:'EXPIRED',expiresAt:q.expires_at};
  const presentation={};
  if(q.line_count===1){
    const suffix={tray:'판',pack:'팩',box:'상자',piece:'개'}[q.unit];
    if(suffix&&Number.isSafeInteger(q.qty)&&q.qty>0)presentation.quantityLabel=q.qty.toLocaleString('ko-KR')+suffix;
    if(typeof q.product_name==='string'&&q.product_name.length<=100)presentation.productLabel=q.product_name;
  }
  return {id,status:'ISSUED',issuedAt:q.issued_at,expiresAt:q.expires_at,response:JSON.parse(q.result_json),presentation};
}
// A repeat quote reuses delivery inputs only. Recheck the buyer/site grant even after expiry.
async function quoteInputs(db,actorId,id,now,memberships) {
  if(!validId(id))invalid();
  const q=await first(db,`SELECT q.org_id,q.site_id,
    json_array_length(q.sources_json,'$.lines') count,
    json_extract(q.sources_json,'$.lines[0].versionId') prior,
    json_extract(q.sources_json,'$.lines[0].serviceDate') serviceDate,
    json_extract(q.sources_json,'$.lines[0].deliveryQty') quantity,
    json_extract(q.sources_json,'$.lines[0].grade') grade,
    json_extract(q.sources_json,'$.lines[0].packing') packing,
    q.supplier_org_id,json_extract(q.sources_json,'$.versions[0].policy.originId') originId,
    json_extract(q.sources_json,'$.lines[0].productId') productId,
    json_extract(q.sources_json,'$.versions[0].policy.packaging') packaging,
    json_extract(q.sources_json,'$.lines[0].unit') unit
    FROM r3_price_quote q JOIN ${memberships} m ON m.org_id=q.org_id AND m.site_id=q.site_id
    JOIN r3_business_site s ON s.org_id=m.org_id AND s.site_id=m.site_id
    WHERE q.id=? AND m.actor_id=? AND ${verified}`,id,actorId);
  if(!q)deny();
  const result={orgId:q.org_id,siteId:q.site_id};
  // The current entry form supports a single line. Never silently drop a second shipment or product.
  if(q.count!==1)return {...result,status:'REVIEW_LINES'};
  const offers=await all(db,`SELECT v.id FROM r3_price_version v JOIN r3_price_scope sc
    ON sc.supplier_id=v.supplier_id AND sc.origin_id=json_extract(v.policy_json,'$.originId')
    AND sc.product_id=json_extract(v.policy_json,'$.productId') AND sc.active=1
    WHERE v.supplier_id=? AND sc.origin_id=? AND sc.product_id=? AND json_extract(v.policy_json,'$.packaging')=?
    AND json_extract(v.policy_json,'$.unit')=? AND v.status='APPROVED' AND json_extract(v.policy_json,'$.effectiveFrom')<=?
    AND (json_extract(v.policy_json,'$.effectiveTo') IS NULL OR json_extract(v.policy_json,'$.effectiveTo')>?) ORDER BY (v.id=?) DESC LIMIT 2`,
    q.supplier_org_id,q.originId,q.productId,q.packaging,q.unit,now,now,q.prior);
  return {...result,status:'REVIEW_INPUTS',offerId:offers.length===1||offers[0]?.id===q.prior?offers[0].id:null,
    quantity:q.quantity,serviceDate:q.serviceDate,grade:q.grade,packing:q.packing};
}
async function issueSnapshot(db,actorId,b,now,practiceSupplier,memberships) {
  if(!validId(b.orgId)||!validId(b.siteId)||!validId(b.requestKey)||!Number.isSafeInteger(b.inputRevision)||b.inputRevision<0||!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)invalid();
  const d=await destination(db,actorId,b.orgId,b.siteId,memberships);
  const digest=await hash(b);
  const repeat=async()=>{const r=await first(db,'SELECT id,request_hash FROM r3_price_quote WHERE actor_id=? AND request_key=?',actorId,b.requestKey);if(!r)return null;if(r.request_hash!==digest)throw new PolicyError('IDEMPOTENCY_CONFLICT',409);return getSnapshot(db,actorId,r.id,now,memberships);};
  const prior=await repeat();if(prior)return prior;
  const versions=[],lines=[],stats={};
  for(const raw of b.lines){
    if(!validId(raw.id)||!validId(raw.versionId)||!validId(raw.shipmentId)||!validId(raw.productId))invalid();
    const v=await first(db,"SELECT * FROM r3_price_version WHERE id=? AND status='APPROVED'",raw.versionId);
    if(!v || practiceSupplier && v.supplier_id!==practiceSupplier)throw new PolicyError('OFFER_UNAVAILABLE');
    if(versions.length && versions[0].policy.supplierId!==v.supplier_id)throw new PolicyError('MULTIPLE_SELLERS_UNCONFIRMED');
    const policyVersion=version(v);
    if(!versions.some(row=>row.id===v.id))versions.push(policyVersion);
    const line={id:raw.id,siteId:b.siteId,versionId:v.id,shipmentId:raw.shipmentId,productId:raw.productId,unit:raw.unit,serviceDate:raw.serviceDate,deliveryQty:raw.deliveryQty,grade:raw.grade,packing:raw.packing,region:d.region_code,regionVersion:d.region_version,zip:d.postcode};
    lines.push(line);stats[line.id]=await statFor(db,b.orgId,line,policyVersion.policy,now);
  }
  // Only server-confirmed comparable totals and annual volumes can authorize savings.
  // The private QA database has no trusted buyer cost feed yet.
  const {customer,issuer}=simulateSupplyQuote({asOf:now,lines,versions,performanceByLine:stats,issue:true,requestId:b.requestKey,inputRevision:b.inputRevision});
  const id=crypto.randomUUID(),sources={versions,lines,stats,destination:d,issuer};
  try{const saved=await db.prepare(`INSERT INTO r3_price_quote(id,actor_id,org_id,site_id,supplier_org_id,revision,issued_at,expires_at,request_key,request_hash,source_digest,sources_json,result_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${memberships} m WHERE m.actor_id=? AND m.role='BUYER' AND m.active=1 AND m.org_id=? AND m.site_id=?)`).bind(id,actorId,b.orgId,b.siteId,versions[0].policy.supplierId,b.inputRevision,now,issuer.expiresAt,b.requestKey,digest,await hash(sources),JSON.stringify(sources),JSON.stringify(customer),actorId,b.orgId,b.siteId).run();if(saved.meta?.changes===0)deny();}
  catch(e){const duplicate=await repeat();if(duplicate)return duplicate;throw e;}
  return getSnapshot(db,actorId,id,now,memberships);
}
function publicError(e){
  if(e instanceof PolicyError)return reply({error:e.message},e.status);
  const message=String(e?.message||e);
  if(/GRANT_REQUIRED|PRODUCT_SCOPE_REQUIRED/.test(message))return reply({error:'ACCESS_REQUIRED'},403);
  if(/VERSION_OVERLAP|DESTINATION_CHANGED|VERSION_CHANGED|CONFLICT|UNIQUE constraint/.test(message))return reply({error:'CONFLICT'},409);
  return reply({error:'SERVICE_UNAVAILABLE'},503);
}
export async function handleR3Price({request,env,actor,path,clock=()=>new Date().toISOString()}) {
  try {
    if(path==='/workspace/chart'){
      if(request.method!=='GET')return reply({error:'METHOD_NOT_ALLOWED'},405);
      return reply(await readEggMarket(env.ORDER_QA_DB,new URL(request.url).searchParams,clock()));
    }
    if(!actor?.id)deny();
    let db=env.ORDER_QA_DB;if(!db)return reply({error:'SERVICE_UNAVAILABLE'},503);
    const u=new URL(request.url),now=clock(),get=request.method==='GET';
    let practiceSupplier=null;
    if(path.startsWith('/practice/')){
      const parts=path.split('/');if(parts.length!==4)return reply({error:'NOT_FOUND'},404);
      const personas={supplier:'writer',operator:'operator',buyer:'buyer'};
      if(!Object.hasOwn(personas,parts[2]))invalid();
      db=isolatedPriceDb(db);const scope=await practiceScope(actor.id);practiceSupplier=scope.supplier;
      if(parts[3]==='start' && request.method==='POST'){
        await parseBody(request);await startPractice(db,scope);
        return reply({status:'PRACTICE_READY',region:'1100000000',regionVersion:'review-region-v1'});
      }
      actor={id:scope[personas[parts[2]]]};path='/'+parts[3];
    }
    if(!practiceSupplier && path==='/workspace'){
      if(!get&&request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
      return reply(await priceWorkspace(db,actor,get?null:await parseBody(request,2097152),now,u.searchParams.get('revision'),{metadata:u.searchParams.get('metadata')==='1'}));
    }
    if(!practiceSupplier && path==='/personal-draft'){
      if(!get&&request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
      return reply(await personalPrice(db,actor,get?null:await parseBody(request,1048576),now));
    }
    if(!practiceSupplier && path==='/registration'){
      if(get)return reply(await registrationDesk(db,actor,u.searchParams.get('request')));
      if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
      const b=await parseBody(request);
      return reply(b.action==='product'?await registerProduct(db,actor,b,now):await updateConnection(db,actor,b,now));
    }
    const memberships=practiceSupplier?'r3_membership':workingMemberships;
    if(get && path==='/sites'){
      const sites=await all(db,`SELECT m.org_id,m.site_id,s.verification FROM ${memberships} m LEFT JOIN r3_business_site s ON s.org_id=m.org_id AND s.site_id=m.site_id WHERE m.actor_id=? AND m.role='BUYER' AND m.active=1 ORDER BY m.org_id,m.site_id LIMIT 200`,actor.id);
      return reply({sites});
    }
    if(get && path==='/offers'){
      const org=u.searchParams.get('org'),site=u.searchParams.get('site');
      if(!validId(org)||!validId(site))invalid();
      await destination(db,actor.id,org,site,memberships);
      // Only public choice identifiers; the issued snapshot owns the authorized monetary response.
      const offers=await all(db,`SELECT v.id,sc.product_id,json_extract(v.policy_json,'$.packaging') packaging,json_extract(v.policy_json,'$.unit') unit,json_extract(v.policy_json,'$.matrix.grades') gradeChoices,json_extract(v.policy_json,'$.matrix.shell') shell,json_extract(v.policy_json,'$.packSize') packSize,json_extract(v.policy_json,'$.displayName') displayName
        FROM r3_price_version v JOIN r3_price_scope sc ON v.supplier_id=sc.supplier_id AND sc.origin_id=json_extract(v.policy_json,'$.originId') AND sc.product_id=json_extract(v.policy_json,'$.productId')
        WHERE sc.active=1 AND (? IS NULL OR v.supplier_id=?) AND v.status='APPROVED' AND json_extract(v.policy_json,'$.effectiveFrom')<=?
        AND (json_extract(v.policy_json,'$.effectiveTo') IS NULL OR json_extract(v.policy_json,'$.effectiveTo')>?) ORDER BY v.id LIMIT 200`,practiceSupplier,practiceSupplier,now,now);
      const quotes=await all(db,'SELECT id,expires_at FROM r3_price_quote WHERE org_id=? AND site_id=? ORDER BY issued_at DESC LIMIT 50',org,site);
      return reply({offers:offers.map(v=>({...v,gradeChoices:JSON.parse(v.gradeChoices||'null')})),quotes});
    }
    if(get && path==='/desk'){
      const scopes=await all(db,`SELECT DISTINCT p.supplier_id,p.origin_id,p.product_id,m.role,c.revision catalogRevision,c.definition FROM r3_price_scope p LEFT JOIN r3_price_catalog c ON c.supplier_id=p.supplier_id AND c.origin_id=p.origin_id AND c.product_id=p.product_id JOIN ${memberships} m ON p.supplier_id=m.org_id WHERE m.actor_id=? AND ${staff} AND p.active=1
        UNION ALL SELECT p.supplier_id,p.origin_id,p.product_id,'WRITER',c.revision,c.definition
        FROM r3_price_scope p JOIN r3_price_catalog c USING(supplier_id,origin_id,product_id)
        WHERE p.active=1 AND ${assigned('p.supplier_id','p.origin_id','p.product_id',memberships)}
        ORDER BY 1,3 LIMIT 200`,actor.id,actor.id);
      const versions=await all(db,`SELECT id,supplier_id,revision,status,updated_at,json_extract(policy_json,'$.originId') origin_id,json_extract(policy_json,'$.productId') product_id,json_extract(policy_json,'$.displayName') name, json_extract(policy_json,'$.matrix.shell') shell,json_extract(policy_json,'$.packSize') packSize FROM r3_price_version v WHERE ${versionAccess(memberships)} ORDER BY updated_at DESC LIMIT 200`,actor.id,actor.id);
      return reply({scopes:scopes.map(s=>({...s,definition:s.definition?JSON.parse(s.definition):null})),versions,freightPack:scopes.length?freightPack:null});
    }
    if(get && path==='/version'){
      const v=await loadStaffVersion(db,actor.id,u.searchParams.get('id'),memberships);
      const history=await all(db,'SELECT revision,action,reason,event_at,status,actor_id FROM r3_price_event WHERE version_id=? ORDER BY revision',v.id);
      const previous=v.predecessor?await loadStaffVersion(db,actor.id,v.predecessor,memberships):null;
      return reply({version:version(v),previousMatrix:previous?version(previous).policy.matrix??null:null,previousCarrierPolicy:previous?version(previous).policy.delivery?.carrierPolicy??null:null,previousStatus:previous?.status??null,previousRevision:previous?.revision??null,history});
    }
    if(get && path==='/quote-inputs')return reply(await quoteInputs(db,actor.id,u.searchParams.get('id'),now,memberships));
    if(get && path==='/quote')return reply(await getSnapshot(db,actor.id,u.searchParams.get('id'),now,memberships));
    if(!['/catalog','/version','/simulate','/quote'].includes(path))return reply({error:'NOT_FOUND'},404);
    if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
    const b=await parseBody(request);
    if(path==='/catalog')return reply(await editPriceCatalog(db,actor.id,b,now,memberships));
    if(path==='/version')return reply(await writeVersion(db,actor.id,b,now,memberships));
    if(path==='/quote')return reply(await issueSnapshot(db,actor.id,b,now,practiceSupplier,memberships));
    if(!Array.isArray(b.lines)||b.lines.length<1||b.lines.length>100)invalid();
    const ids=[...new Set(b.lines.map(l=>l.versionId))];
    const versions=await Promise.all(ids.map(async id=>version(await loadStaffVersion(db,actor.id,id,memberships))));
    try {
      const result=simulateSupplyQuote({asOf:b.asOf??now,lines:b.lines,versions,performanceByLine:b.performanceByLine,comparison:b.comparison,annualDeliveries:b.annualDeliveries});
      return reply({status:'SIMULATION',...result});
    } catch(error) {
      if(error instanceof PolicyError && Array.isArray(error.candidates)) return reply({error:error.message,candidates:error.candidates},error.status);
      throw error;
    }
  }catch(e){return publicError(e);}
}
