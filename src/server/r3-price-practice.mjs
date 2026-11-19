// Only reviewed SQL identifiers are rewritten. Values are still bound, never interpolated.
export function isolatedPriceDb(db) {
  return {
    prepare(sql){return db.prepare(sql.replace(/\br3_(price_\w+|membership|business_site)\b/g,'r3_practice_$1'));},
    batch(statements){return db.batch(statements);}
  };
}
export async function practiceScope(actorId) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('order-r3-price-practice-v1/'+actorId));
  const prefix='lab-'+Array.from(new Uint8Array(bytes).slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
  return {supplier:prefix+'-supplier',business:prefix+'-business',operator:prefix+'-operator',writer:prefix+'-writer',buyer:prefix+'-buyer'};
}
export async function startPractice(db,s) {
  const grants="INSERT OR IGNORE INTO r3_membership(actor_id,role,org_id,site_id,active) VALUES(?,'SUPPLIER',?,'',1),(?,'OPERATOR',?,'',1),(?,'BUYER',?,'review-site',1)";
  await db.batch([
    db.prepare(grants).bind(s.writer,s.supplier,s.operator,s.supplier,s.buyer,s.business),
    db.prepare("INSERT OR IGNORE INTO r3_price_scope VALUES(?,'practice-origin','practice-item',1)").bind(s.supplier),
    db.prepare("INSERT OR IGNORE INTO r3_price_catalog(supplier_id,origin_id,product_id,revision,definition,updated_by,updated_at) VALUES(?,'practice-origin','practice-item',1,?,?,?)").bind(s.supplier,JSON.stringify({supplierName:'연습 공급처',originName:'연습 출고장',productName:'연습 계란',shells:['1','2'],packSizes:[12,30],grades:[{id:'large',name:'대란'},{id:'xlarge',name:'특란'}]}),s.operator,new Date().toISOString()),
    db.prepare("INSERT OR IGNORE INTO r3_business_site VALUES(?,'review-site','VERIFIED',1)").bind(s.business),
    db.prepare("INSERT OR IGNORE INTO r3_price_destination VALUES(?,'review-site','1100000000','review-region-v1',NULL)").bind(s.business)
  ]);
}
