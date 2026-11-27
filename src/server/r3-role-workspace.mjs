import {workingMemberships} from './product-account-context.mjs';
const prepared=(db,sql,...params)=>db.prepare(sql).bind(...params);
const all=async(db,sql,...params)=>(await prepared(db,sql,...params).all()).results;
const releaseAdmin=`EXISTS (SELECT 1 FROM r3_release_admin a JOIN ${workingMemberships} m ON m.actor_id=a.actor_id WHERE a.actor_id=? AND a.active=1 AND m.active=1 AND m.role='OPERATOR')`;
const readAdmin=(db,id)=>prepared(db,'SELECT 1 ok WHERE '+releaseAdmin,id).first();
const currentMenu=db=>db.prepare('SELECT enabled,revision FROM r3_menu_publication ORDER BY revision DESC LIMIT 1').first();

export async function workspaceOptions(db,actorId) {
  // Snapshots are visible only to buyers with active site verification. This endpoint
  // never returns policy, comparison history, raw evidence or internal pricing inputs.
  const quotes=await all(db,`SELECT q.id,q.org_id,q.site_id,q.issued_at,q.expires_at,
    json_extract(q.sources_json,'$.lines[0].serviceDate') AS serviceDate,
    json_extract(q.sources_json,'$.lines[0].deliveryQty') AS deliveryQty,
    json_extract(q.sources_json,'$.lines[0].unit') AS unit,
    json_extract(pc.definition,'$.productName') AS productName,
    json_extract(pc.definition,'$.supplierName') AS supplierName,
    CASE WHEN julianday(q.expires_at)>julianday('now') THEN json_extract(q.result_json,'$.quotes[0].total.decimal') END AS total,
    json_array_length(q.sources_json,'$.lines') AS lineCount,
    json_extract(q.sources_json,'$.lines') AS displayLineInputs,
    json_extract(q.sources_json,'$.versions') AS displayLineVersions,
    (SELECT c.id FROM r3_case c WHERE c.kind='delivery' AND c.quote_id=q.id AND c.state NOT IN ('CANCELLED','REJECTED') LIMIT 1) AS deliveryCase,
    (SELECT c.state FROM r3_case c WHERE c.kind='delivery' AND c.quote_id=q.id AND c.state NOT IN ('CANCELLED','REJECTED') LIMIT 1) AS deliveryState
    FROM r3_price_quote q JOIN r3_business_site s ON s.org_id=q.org_id AND s.site_id=q.site_id AND s.verification='VERIFIED'
    LEFT JOIN r3_price_catalog pc ON pc.supplier_id=q.supplier_org_id AND pc.origin_id=json_extract(q.sources_json,'$.versions[0].policy.originId') AND pc.product_id=json_extract(q.sources_json,'$.lines[0].productId')
    WHERE EXISTS(SELECT 1 FROM ${workingMemberships} m WHERE m.actor_id=? AND m.role='BUYER' AND m.active=1 AND m.org_id=q.org_id AND m.site_id=q.site_id)
    ORDER BY q.issued_at DESC LIMIT 200`,actorId);
  const products=await all(db,`SELECT DISTINCT p.supplier_id,p.product_id,p.origin_id,json_extract(pc.definition,'$.productName') productName,json_extract(pc.definition,'$.originName') originName FROM r3_price_scope p JOIN r3_price_catalog pc USING(supplier_id,origin_id,product_id) JOIN ${workingMemberships} m ON m.org_id=p.supplier_id
    WHERE m.active=1 AND m.actor_id=? AND m.role IN ('SUPPLIER','OPERATOR') AND p.active=1 ORDER BY p.product_id,p.origin_id LIMIT 200`,actorId);
  const admin=await readAdmin(db,actorId);
  const publication=admin?(await currentMenu(db)||{enabled:0,revision:0}):null;
  const businesses=await all(db,`SELECT m.org_id,m.site_id,
    (SELECT json_extract(n.context_json,'$.businessName') FROM r3_case c JOIN r3_case_note n ON n.case_id=c.id AND n.revision=1
    WHERE c.kind='business' AND c.org_id=m.org_id AND c.site_id=m.site_id AND json_extract(n.context_json,'$.businessName') IS NOT NULL ORDER BY c.updated_at DESC LIMIT 1) AS businessName
    FROM ${workingMemberships} m WHERE m.actor_id=? AND m.active=1 ORDER BY m.org_id,m.site_id`,actorId);
  // The issued snapshot owns these values. Return only the display projection;
  // private policies, performance, destinations and calculation inputs stay here.
  const displayedQuotes=quotes.map(({displayLineInputs,displayLineVersions,...quote})=>{
    const inputs=JSON.parse(displayLineInputs||'[]'),versions=JSON.parse(displayLineVersions||'[]');
    const lines=inputs.map(input=>{
      const policy=versions.find(version=>version.id===input.versionId)?.policy;
      const grade=policy?.matrix?.grades?.find(grade=>grade.id===input.grade)?.name;
      return {productName:[policy?.displayName||quote.productName||'발급 품목',grade,input.packing==='raw'?'원란':input.packing==='packed'?'포장':null].filter(Boolean).join(' · '),quantity:input.deliveryQty,unit:input.unit,serviceDate:input.serviceDate};
    });
    return {...quote,lines};
  });
  return {quotes:displayedQuotes,products,businesses,publication};
}

export async function publishMenu(db,actorId,body,now){
  if(!await readAdmin(db,actorId))return {status:403,error:'ACCESS_DENIED'};
  if(!body||Object.keys(body).some(k=>!['enabled','expectedRevision','requestKey'].includes(k))||typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestKey!=='string'||!(/^[a-zA-Z\d._:-]{1,100}$/).test(body.requestKey))return {status:400,error:'INVALID_INPUT'};
  const revision=body.expectedRevision+1,enabled=Number(body.enabled);
  await db.batch([prepared(db,`INSERT OR IGNORE INTO r3_menu_publication(revision,enabled,actor_id,request_key,changed_at)
    SELECT ?,?,?,?,? WHERE (SELECT coalesce(max(revision),0) FROM r3_menu_publication)=?
    AND ${releaseAdmin}`,revision,enabled,actorId,body.requestKey,now,body.expectedRevision,actorId)]);
  const saved=await prepared(db,'SELECT revision,enabled FROM r3_menu_publication WHERE actor_id=? AND request_key=?',actorId,body.requestKey).first();
  if(saved?.revision!==revision||saved.enabled!==enabled)return {status:409,error:'REVISION_CONFLICT'};
  return {status:200,publication:await currentMenu(db)};
}
const fieldsByKind={
  business:['businessName','industry','trade','openingDate'],
  consult:['businessName','subject','memo','desiredDate','targets'],
  supply:['businessName','memo'],catalog:['businessName','memo'],
  delivery:['businessName','desiredDate','memo'],reprice:['businessName','memo'],
};
export function validCaseContext(context,kind,action){
  if(context===undefined)return true;
  if(!context||typeof context!=='object'||Array.isArray(context))return false;
  const allowed=action==='create'?fieldsByKind[kind]||[]:action==='link-requote'?['replacementQuoteId','memo']:['memo','desiredDate'];
  return Object.entries(context).every(([key,value])=>{
    if(!allowed.includes(key))return false;
    if(key==='replacementQuoteId')return typeof value==='string'&&/^[\w.:-]{1,128}$/.test(value);
    if(key==='targets')return Array.isArray(value)&&value.length>0&&value.length<=12&&new Set(value).size===value.length&&value.every(s=>typeof s==='string'&&/^[\w.:-]{1,128}$/.test(s));
    if(typeof value!=='string'||!value.trim()||(key!=='memo'&&value.length>100)||/[\u0000-\u001f]/u.test(value.replaceAll('\n',' ')))return false;
    if(key==='memo'){
      const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
      let count=0;
      for(const item of segmenter?segmenter.segment(value):value){
        const grapheme=segmenter?item.segment:item;
        if(!/^\s+$/u.test(grapheme)&&++count>500)return false;
      }
    }
    if(['openingDate','desiredDate'].includes(key)){
      const date=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;
    }
    return true;
  });
}
export const targetsOwnedSql=`NOT EXISTS (SELECT 1 FROM json_each(?) target WHERE NOT EXISTS
  (SELECT 1 FROM r3_price_quote q JOIN r3_business_site s ON s.org_id=q.org_id AND s.site_id=q.site_id AND s.verification='VERIFIED'
   WHERE q.id=target.value AND q.org_id=? AND q.site_id=?))`;

// Return display data from existing issued snapshots only for a case the requesting identity
// already sees, and only while the issuing business site still has an active verification.
export async function caseQuotes(db,c,notes){
  const keys=[c.quote_id,...notes.flatMap(n=>[...(n.targets||[]),n.replacementQuoteId])].filter(Boolean);
  if(!keys.length)return [];
  const ids=[...new Set(keys)].slice(0,32);
  return all(db,`SELECT q.id,q.issued_at,q.expires_at,
    json_extract(q.sources_json,'$.lines[0].serviceDate') AS serviceDate,
    json_extract(q.sources_json,'$.lines[0].deliveryQty') AS deliveryQty,
    json_extract(q.sources_json,'$.lines[0].unit') AS unit,
    json_extract(pc.definition,'$.productName') AS productName,
    json_extract(pc.definition,'$.supplierName') AS supplierName,
    CASE WHEN (?=1 AND q.id=?) OR julianday(q.expires_at)>julianday('now') THEN json_extract(q.result_json,'$.quotes[0].total.decimal') END AS total,
    json_array_length(q.sources_json,'$.lines') AS lineCount
    FROM r3_price_quote q JOIN r3_business_site s ON s.org_id=q.org_id AND s.site_id=q.site_id AND s.verification='VERIFIED'
    LEFT JOIN r3_price_catalog pc ON pc.supplier_id=q.supplier_org_id AND pc.origin_id=json_extract(q.sources_json,'$.versions[0].policy.originId') AND pc.product_id=json_extract(q.sources_json,'$.lines[0].productId')
    WHERE q.org_id=? AND q.site_id=? AND q.id IN (${ids.map(()=>'?').join(',')})`,Number(c.kind==='delivery'&&Boolean(c.order_id)),c.quote_id||'',c.org_id,c.site_id,...ids);
}
