import {PolicyError} from './order-engine/calculation/supply-policy.mjs';
import {validateDefinition} from './r3-price-catalog.mjs';

const validName=value=>typeof value==='string' && value.trim()===value && value.length>0 && value.length<=60;
const uuid=value=>typeof value==='string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const fail=(message,status)=>{throw new PolicyError(message,status);};
const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const rows=async(db,sql,...args)=>(await statement(db,sql,...args).all()).results;
const staff="active=1 AND site_id='' AND role IN('OPERATOR','SUPPLIER')";
const names="json_extract(c.definition,'$.supplierName')";
const territory="m.org_id=c.supplier_id AND m.actor_id=? AND m.role='OPERATOR' AND m.active=1 AND m.site_id=''";
const grades=[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란']].map(([id,name])=>({id,name}));

export async function registrationDesk(db,actor,requestId){
  const organizations=await rows(db,`SELECT m.org_id supplierId,MIN(m.role) role,
    (SELECT ${names} FROM r3_price_catalog c WHERE c.supplier_id=m.org_id ORDER BY c.updated_at DESC LIMIT 1) supplierName,
    (SELECT id FROM r3_price_registration r WHERE r.supplier_id=m.org_id ORDER BY created_at LIMIT 1) invitation
    FROM r3_membership m WHERE actor_id=? AND ${staff} GROUP BY m.org_id ORDER BY m.org_id`,actor.id);
  const own=await rows(db,'SELECT id,company,state,changed_at FROM r3_price_connection WHERE actor_id=? ORDER BY changed_at DESC LIMIT 30',actor.id);
  const review=await rows(db,`SELECT DISTINCT a.id,a.applicant,a.company,a.state,a.verified_subject AS verified,a.origin_id AS linkedOrigin,a.product_id AS linkedProduct,c.supplier_id AS supplierId
    FROM r3_price_connection a JOIN r3_price_catalog c ON
    (a.target_org=c.supplier_id OR (a.target_org IS NULL AND a.id=? AND a.company=${names}) OR (a.supplier_id=c.supplier_id AND a.state='LINKED'))
    JOIN r3_membership m ON ${territory}
    WHERE a.state IN('PENDING','LINKED') AND a.actor_id<>? ORDER BY a.changed_at DESC LIMIT 100`,
    uuid(requestId)?requestId:'',actor.id,actor.id);
  return {organizations,own,review};
}

export async function registerProduct(db,actor,b,now){
  if(!uuid(b.requestKey) || !(/^[\w.:-]{1,100}$/.test(b.supplierId||'')) || !validName(b.supplierName) || !validName(b.originName) || !validName(b.productName))
    fail('REGISTRATION_FIELDS_REQUIRED',400);
  const allowed=await statement(db,`SELECT 1 FROM r3_membership WHERE actor_id=? AND org_id=? AND ${staff}`,actor.id,b.supplierId).first();
  if(!allowed)fail('ACCESS_REQUIRED',403);
  const d=validateDefinition({supplierName:b.supplierName,originName:b.originName,productName:b.productName,shells:[b.shell],packSizes:[b.packSize],grades});
  const existing=await statement(db,`SELECT c.origin_id,c.product_id,c.definition,p.active FROM r3_price_catalog c
    JOIN r3_price_scope p USING(supplier_id,origin_id,product_id) WHERE c.supplier_id=? AND json_extract(c.definition,'$.originName')=? AND json_extract(c.definition,'$.productName')=? LIMIT 1`,b.supplierId,b.originName,b.productName).first();
  if(existing){
    const definition=JSON.parse(existing.definition);
    if(!existing.active || definition.supplierName!==d.supplierName || !definition.shells?.includes(b.shell) || !definition.packSizes?.includes(b.packSize))fail('CATALOG_EXISTS',409);
    return {supplier_id:b.supplierId,origin_id:existing.origin_id,product_id:existing.product_id};
  }
  const known=await statement(db,`SELECT ${names} name FROM r3_price_catalog c WHERE c.supplier_id=? ORDER BY updated_at DESC LIMIT 1`,b.supplierId).first();
  if(known?.name&&known.name!==d.supplierName)fail('SUPPLIER_NAME_CHANGED',409);
  const origin=await statement(db,"SELECT origin_id FROM r3_price_catalog WHERE supplier_id=? AND json_extract(definition,'$.originName')=? LIMIT 1",b.supplierId,b.originName).first();
  // Concurrent products registered at the same new depot must reference the same origin.
  const originKey=new TextEncoder().encode(JSON.stringify([b.supplierId,b.originName]));
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',originKey));
  const originId=origin?.origin_id||'depot-'+Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('');
  const productId=crypto.randomUUID(),definition=JSON.stringify(d);
  await statement(db,`INSERT INTO r3_price_registration(id,supplier_id,origin_id,product_id,origin_name,product_name,definition,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,b.requestKey,b.supplierId,originId,productId,b.originName,b.productName,definition,actor.id,now).run();
  const saved=await statement(db,'SELECT supplier_id,origin_id,product_id,definition FROM r3_price_registration WHERE supplier_id=? AND origin_name=? AND product_name=?',b.supplierId,b.originName,b.productName).first();
  if(!saved||saved.definition!==definition)fail('CATALOG_EXISTS',409);
  return {supplier_id:saved.supplier_id,origin_id:saved.origin_id,product_id:saved.product_id};
}

export async function updateConnection(db,actor,b,now){
  if(b.action==='request'){
    if(!validName(b.supplierName) || !uuid(b.requestKey) || (b.invite && !uuid(b.invite)))fail('REGISTRATION_FIELDS_REQUIRED',400);
    let target=null;
    if(b.invite){
      const org=await statement(db,`SELECT r.supplier_id FROM r3_price_registration r JOIN r3_price_catalog c USING(supplier_id,origin_id,product_id)
        WHERE r.id=? AND ${names}=?`,b.invite,b.supplierName).first();
      if(!org)fail('INVITATION_INVALID',422);
      target=org.supplier_id;
    }
    await statement(db,`INSERT INTO r3_price_connection(id,actor_id,verified_subject,applicant,company,target_org,changed_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,b.requestKey,actor.id,Number(actor.role==='BUSINESS'&&Boolean(actor.email)),actor.email||'포털 계정',b.supplierName,target,now).run();
    const saved=await statement(db,`SELECT id,company,state FROM r3_price_connection WHERE actor_id=? AND company=? AND target_org IS ?
      AND (id=? OR state='PENDING') ORDER BY id=? DESC LIMIT 1`,actor.id,b.supplierName,target,b.requestKey,b.requestKey).first();
    if(!saved)fail('REVISION_CONFLICT',409);
    return saved;
  }
  if(!['link','decline','revoke'].includes(b.action)||!uuid(b.id))fail('INVALID_REQUEST',400);
  const before=b.action==='revoke'?'LINKED':'PENDING',after={link:'LINKED',decline:'DECLINED',revoke:'REVOKED'}[b.action];
  const result=await statement(db,`UPDATE r3_price_connection AS a SET state=?,supplier_id=?,origin_id=?,product_id=?,reviewer=?,changed_at=?
    WHERE a.id=? AND a.actor_id<>? AND a.state=? AND (?<>'LINKED' OR (a.verified_subject=1 AND NOT EXISTS(SELECT 1 FROM r3_membership revoked
        WHERE revoked.actor_id=a.actor_id AND revoked.org_id=? AND revoked.active=0 AND revoked.role='SUPPLIER')))
    AND EXISTS(SELECT 1 FROM r3_price_catalog c JOIN r3_price_scope p USING(supplier_id,origin_id,product_id)
      JOIN r3_membership m ON ${territory} WHERE c.supplier_id=? AND c.origin_id=? AND c.product_id=? AND p.active=1
      AND (a.target_org=c.supplier_id OR (a.target_org IS NULL AND a.company=${names}))
      AND (a.state<>'LINKED' OR (a.supplier_id=c.supplier_id AND a.origin_id=c.origin_id AND a.product_id=c.product_id)))`,
      after,b.supplierId,b.originId,b.productId,actor.id,now,b.id,actor.id,before,after,b.supplierId,actor.id,b.supplierId,b.originId,b.productId).run();
  if(!(result.meta?.changes??result.changes))fail('CONNECTION_UNAVAILABLE',409);
  return {id:b.id,state:after};
}
