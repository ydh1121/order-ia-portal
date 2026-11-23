import {PolicyError} from './order-engine/calculation/supply-policy.mjs';
const name = v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=60;
const code = v=>typeof v==='string'&&/^[\w.:-]{1,80}$/.test(v);
const uniqueList = v=>Array.isArray(v)&&v.length>0&&v.length<=32&&new Set(v).size===v.length;
export function validateDefinition(d) {
  if(!d || ![d.supplierName,d.originName,d.productName].every(name) ||
    !uniqueList(d.shells) || !d.shells.every(s=>['1','2','3','4','unspecified'].includes(s)) ||
    !uniqueList(d.packSizes) || !d.packSizes.every(n=>Number.isSafeInteger(n)&&n>=1&&n<=360) ||
    !Array.isArray(d.grades) || !uniqueList(d.grades.map(g=>g?.id)) || !uniqueList(d.grades.map(g=>g?.name)) ||
    !d.grades.every(g=>g&&code(g.id)&&name(g.name))) throw new PolicyError('CATALOG_INVALID');
  return d;
}
export async function editPriceCatalog(db,actor,b,clock,memberships='r3_membership') {
  const {supplierId,originId,productId,expectedRevision}=b;
  if(![supplierId,originId,productId].every(code)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new PolicyError('INVALID_REQUEST',400);
  const d=validateDefinition(b.definition),current=await db.prepare(`SELECT 1 ok FROM r3_price_scope s JOIN ${memberships} m ON s.supplier_id=m.org_id WHERE s.supplier_id=? AND s.origin_id=? AND s.product_id=? AND s.active=1 AND m.active=1 AND m.site_id='' AND m.actor_id=? AND m.role='OPERATOR'`).bind(supplierId,originId,productId,actor).first();
  if(!current)throw new PolicyError('ACCESS_REQUIRED',403);
  const text=JSON.stringify(d), result=await db.prepare(`INSERT INTO r3_price_catalog(supplier_id,origin_id,product_id,revision,definition,updated_by,updated_at)
    SELECT s.supplier_id,s.origin_id,s.product_id,?, ?,?,? FROM r3_price_scope s JOIN ${memberships} m ON m.org_id=s.supplier_id
    WHERE s.supplier_id=? AND s.origin_id=? AND s.product_id=? AND s.active=1 AND m.active=1 AND m.site_id='' AND m.actor_id=? AND m.role='OPERATOR'
    AND COALESCE((SELECT revision FROM r3_price_catalog c WHERE c.supplier_id=s.supplier_id AND c.origin_id=s.origin_id AND c.product_id=s.product_id),0)=?
    ON CONFLICT(supplier_id,origin_id,product_id) DO UPDATE SET revision=excluded.revision,definition=excluded.definition,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(expectedRevision+1,text,actor,clock,supplierId,originId,productId,actor,expectedRevision).run();
  if((result.meta?.changes??result.changes)===0){
    const replay=await db.prepare('SELECT revision,definition,updated_by FROM r3_price_catalog WHERE supplier_id=? AND origin_id=? AND product_id=?').bind(supplierId,originId,productId).first();
    if(replay?.revision!==expectedRevision+1||replay.definition!==text||replay.updated_by!==actor)throw new PolicyError('REVISION_CONFLICT',409);
  }
  return {revision:expectedRevision+1,definition:d};
}
export async function checkPriceGroup(db,p){
  if(!p.matrix)return;
  const row=await db.prepare('SELECT definition FROM r3_price_catalog WHERE supplier_id=? AND origin_id=? AND product_id=?').bind(p.supplierId,p.originId,p.productId).first();
  if(!row)throw new PolicyError('CATALOG_REQUIRED');
  const data=JSON.parse(row.definition),matrix=p.matrix;
  if(!data.shells.includes(matrix.shell)||!data.packSizes.includes(p.packSize)||p.unit!=='tray'||p.packaging!=='s'+matrix.shell+'.p'+p.packSize||
     !Array.isArray(matrix.grades)||matrix.grades.some(g=>!data.grades.some(x=>x.id===g.id&&x.name===g.name)))throw new PolicyError('CATALOG_CHANGED');
  return data;
}
