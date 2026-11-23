import {workingMemberships,workingPriceConnection} from './product-account-context.mjs';
import {createPriceBookModel} from './r3-price-book-model.mjs';
import {createPriceMatrixModel} from './order-engine/calculation/price-matrix.mjs';
import {PolicyError} from './order-engine/calculation/supply-policy.mjs';

const model=createPriceMatrixModel();
const books=createPriceBookModel(model);
const fail=(code,status=422)=>{throw new PolicyError(code,status);};
const title=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=80;
const code=v=>typeof v==='string'&&/^[\w.:-]{1,100}$/.test(v);
const id=v=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
async function authorKey(actor){
  const email=actor?.email?.trim().toLowerCase();
  if(!['OWNER','BUSINESS'].includes(actor?.role)||typeof actor.id!=='string'||!actor.id||!email||!/^\S+@\S+\.\S+$/.test(email))fail('ACCESS_REQUIRED',403);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['order.personal-price.v1',actor.role,actor.id,email])));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function normalized(d){
  if(!d||![d.supplierName,d.originName,d.productName].every(v=>v==null||v===''||title(v))||!(d.name==null||d.name===''||title(d.name))||
     ![null,'1','2','3','4','unspecified'].includes(d.shell)||
     !(d.packSize===null || Number.isSafeInteger(d.packSize)&&d.packSize>=1&&d.packSize<=360)||
     !Number.isSafeInteger(d.minimumOrder)||d.minimumOrder<1||d.minimumOrder>1e9)fail('PERSONAL_FIELDS_REQUIRED');
  if(model.errors(d.matrix).length)fail('PRICE_MATRIX_INVALID');
  const matrix={schema:1,grades:d.matrix.grades.map(({id,name})=>({id,name})),
    rows:d.matrix.rows.map(({min,max,cells})=>({min,max,cells:cells.map(model.normalize)}))};
  if(new Set(matrix.grades.map(g=>g.name)).size!==matrix.grades.length)fail('PRICE_MATRIX_INVALID');
  let priceBook;
  if(d.priceBook!=null){try{priceBook=books.normalize(d.priceBook);}catch(e){fail(e.message);}
    const selected=books.selected(priceBook);
    if(JSON.stringify(selected.matrix)!==JSON.stringify(matrix)||(d.shell??'unspecified')!==selected.shell.key||d.packSize!==selected.shell.basePackSize)fail('PRICE_BOOK_SELECTION');
  }
  return {...(priceBook?{priceBook}:{}),name:d.name||'',supplierName:d.supplierName||null,originName:d.originName||null,productName:d.productName||null,
    shell:d.shell,packSize:d.packSize,minimumOrder:d.minimumOrder,matrix};
}
const project=row=>row?{revision:row.revision,updatedAt:row.saved_at,draft:JSON.parse(row.content)}:{revision:0,updatedAt:null,draft:null};
const current=(db,key)=>sql(db,'SELECT revision,saved_at,content FROM r3_personal_price_edit WHERE principal=? ORDER BY revision DESC LIMIT 1',key).first();
async function prepareImport(db,actor,own,b){
  if(!Number.isSafeInteger(b.expectedRevision)||!own||b.expectedRevision!==own.revision)fail('REVISION_CONFLICT',409);
  if(![b.supplierId,b.originId,b.productId].every(code)||!Number.isSafeInteger(b.packSize)||!['1','2','3','4','unspecified'].includes(b.shell))fail('INVALID_REQUEST',400);
  const catalog=await sql(db,`SELECT c.definition FROM r3_price_catalog c JOIN r3_price_scope s USING(supplier_id,origin_id,product_id)
    WHERE s.supplier_id=? AND s.origin_id=? AND s.product_id=? AND s.active=1 AND (
    EXISTS(SELECT 1 FROM ${workingMemberships} m WHERE m.org_id=s.supplier_id AND m.actor_id=? AND m.site_id='' AND m.active=1 AND m.role IN('SUPPLIER','OPERATOR'))
    OR EXISTS(SELECT 1 FROM r3_price_connection a WHERE a.actor_id=? AND a.state='LINKED' AND ${workingPriceConnection} AND a.supplier_id=s.supplier_id
      AND a.origin_id=s.origin_id AND a.product_id=s.product_id AND NOT EXISTS(SELECT 1 FROM r3_membership r WHERE r.actor_id=a.actor_id
        AND r.org_id=a.supplier_id AND r.role='SUPPLIER' AND r.active=0)))`,b.supplierId,b.originId,b.productId,actor.id,actor.id).first();
  if(!catalog)fail('ACCESS_REQUIRED',403);
  const d=JSON.parse(own.content),c=JSON.parse(catalog.definition);
  // Alternate tables retain the original base-pack metadata. Only equal per-tray
  // units may enter that product's policy; a different package needs its own scope.
  if(d.priceBook&&!books.canImportSelected(d.priceBook))fail('PERSONAL_PACKAGE_UNIT_MISMATCH');
  if(['supplierName','originName','productName'].some(k=>d[k]!==null&&d[k]!==c[k])||!c.shells.includes(b.shell)||(d.shell!==null&&b.shell!==d.shell)||
    !c.packSizes.includes(b.packSize)||(d.packSize!==null&&b.packSize!==d.packSize))fail('PERSONAL_SCOPE_MISMATCH');
  const grades=d.matrix.grades.map(g=>c.grades.find(approved=>approved.name===g.name));
  if(grades.some(g=>!g))fail('PERSONAL_SCOPE_MISMATCH');
  return {revision:own.revision,minimumOrder:d.minimumOrder,shell:b.shell,packSize:b.packSize,matrix:{...d.matrix,grades}};
}
export async function personalPrice(db,actor,body,now){
  const key=await authorKey(actor);
  if(body===null)return project(await current(db,key));
  if(body.action==='prepare-import')return prepareImport(db,actor,await current(db,key),body);
  if(body.action!=null&&body.action!=='save')fail('INVALID_REQUEST',400);
  const {requestKey,expectedRevision}=body;
  if(!id(requestKey)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('INVALID_REQUEST',400);
  const content=JSON.stringify(normalized(body.draft));
  // The expected revision and retry identity are checked by one atomic insert.
  await sql(db,`INSERT INTO r3_personal_price_edit(principal,revision,request_key,content,saved_at)
    SELECT ?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM r3_personal_price_edit WHERE principal=?),0)=?
    ON CONFLICT DO NOTHING`,key,expectedRevision+1,requestKey,content,now,key,expectedRevision).run();
  const saved=await sql(db,'SELECT revision,content,saved_at FROM r3_personal_price_edit WHERE principal=? AND request_key=?',key,requestKey).first();
  if(!saved)fail('REVISION_CONFLICT',409);
  if(saved.content!==content||saved.revision!==expectedRevision+1)fail('IDEMPOTENCY_CONFLICT',409);
  return project(saved);
}
