// Only this bounded, opaque grayscale pixel packet is accepted. Source files and metadata cannot be stored through this endpoint.
export const packetType='application/vnd.order.masked-rasters';
const maxBytes=8*1024*1024, maxSide=2048, maxPixels=2*1024*1024;
const privateHeaders={'Cache-Control':'private, no-store','Vary':'Cookie, Cf-Access-Jwt-Assertion','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(body,status=200)=>Response.json(body,{status,headers:privateHeaders});
const id=x=>typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
export function inspectPacket(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<7||bytes.length>maxBytes)return null;
  if(bytes[0]!==79||bytes[1]!==82||bytes[2]!==80||bytes[3]!==88||bytes[4]!==1)return null;
  const count=bytes[5],pages=[];if(count<1||count>8)return null;
  let index=6;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<count;i++){
    if(index+4>bytes.length)return null;const width=view.getUint16(index),height=view.getUint16(index+2);index+=4;
    if(!width||!height||width>maxSide||height>maxSide||width*height>maxPixels||index+width*height>bytes.length)return null;
    pages.push({width,height,offset:index});index+=width*height;
  }
  return index===bytes.length?pages:null;
}
async function boundedBody(request){
  const announced=request.headers.get('Content-Length');if(announced && (!/^\d+$/.test(announced)||Number(announced)>maxBytes))return null;
  const reader=request.body?.getReader();if(!reader)return null;const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return null;}chunks.push(value);}
  const b=new Uint8Array(size);let offset=0;for(const v of chunks){b.set(v,offset);offset+=v.length;}return b;
}
const scope=`EXISTS(SELECT 1 FROM r3_membership m WHERE m.actor_id=? AND m.active=1 AND m.org_id=c.org_id AND ((m.role='BUYER' AND m.site_id=c.site_id) OR (m.role='OPERATOR' AND m.site_id='')))`;
const writer=`EXISTS(SELECT 1 FROM r3_membership m WHERE m.actor_id=? AND m.active=1 AND m.org_id=c.org_id AND m.role='BUYER' AND m.site_id=c.site_id)`;
const eligible=`((c.kind='business' AND c.state IN('EVIDENCE_REQUIRED','NEEDS_INFO')) OR (c.kind='reprice' AND c.state IN('DRAFT','NEEDS_INFO')))`;
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function handleR3Evidence({request,env,actor}){
  const db=env.ORDER_QA_DB,bucket=env.ORDER_PRIVATE_EVIDENCE;
  const url=new URL(request.url),caseId=url.searchParams.get('caseId');if(!id(caseId))return json({error:'INVALID_CASE'},400);
  if(!bucket||!db)return json({error:'EVIDENCE_STORAGE_UNAVAILABLE'},503);
  try{
    if(request.method==='GET'){
      const record=url.searchParams.get('id');if(!id(record))return json({error:'INVALID_RECEIPT'},400);
      const row=await db.prepare(`SELECT o.object_key,o.digest FROM r3_evidence_object o JOIN r3_case c ON c.id=o.case_id JOIN r3_evidence_receipt e ON e.id=o.id AND e.state='MASKED_SCANNED' WHERE o.id=? AND o.case_id=? AND ${scope}`).bind(record,caseId,actor.id).first();
      if(!row)return json({error:'NOT_FOUND'},404);
      const object=await bucket.get(row.object_key);if(!object || object.size>maxBytes)return json({error:'EVIDENCE_UNAVAILABLE'},503);
      return new Response(object.body,{headers:{...privateHeaders,'Content-Type':packetType,'Content-Disposition':'attachment; filename="review-pixels.orpx"'}});
    }
    if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
    if(!actor.csrf||request.headers.get('X-IA-CSRF')!==actor.csrf||request.headers.get('Origin')!==url.origin)return json({error:'CSRF_DENIED'},403);
    if(request.headers.get('Content-Type')!==packetType)return json({error:'MASKED_RASTER_REQUIRED'},415);
    const key=request.headers.get('Idempotency-Key');if(!id(key))return json({error:'INVALID_KEY'},400);
    const row=await db.prepare(`SELECT c.org_id,c.site_id,c.kind,c.revision FROM r3_case c WHERE c.id=? AND ${writer} AND ${eligible}`).bind(caseId,actor.id).first();
    if(!row)return json({error:'CASE_NOT_ELIGIBLE'},403);
    const bytes=await boundedBody(request);if(!bytes)return json({error:'FILE_LIMIT'},413);
    const pages=inspectPacket(bytes);if(!pages)return json({error:'INVALID_MASKED_RASTER'},422);
    const digest=await hex(bytes),priorStmt=db.prepare('SELECT id,case_id,digest FROM r3_evidence_object WHERE actor_id=? AND request_key=?').bind(actor.id,key);
    const prior=await priorStmt.first();if(prior)return prior.case_id===caseId && prior.digest===digest?json({evidenceId:prior.id,pages:pages.length}):json({error:'REQUEST_KEY_REUSED'},409);
    const evidenceId=crypto.randomUUID(),objectKey='r3/masked/'+evidenceId;
    await bucket.put(objectKey,bytes,{httpMetadata:{contentType:packetType}});
    let stored;
    try{
      const commands=[db.prepare(`INSERT INTO r3_evidence_receipt(id,org_id,site_id,purpose,state) SELECT ?,c.org_id,c.site_id,c.kind,'MASKED_SCANNED' FROM r3_case c WHERE c.id=? AND c.revision=? AND ${writer} AND ${eligible}`).bind(evidenceId,caseId,row.revision,actor.id),
        db.prepare(`INSERT INTO r3_evidence_object(id,case_id,actor_id,request_key,digest,object_key,pages,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`).bind(evidenceId,caseId,actor.id,key,digest,objectKey,pages.length,new Date().toISOString())];
      await db.batch(commands);stored=await priorStmt.first();
    }catch{
      // A transport failure can follow a committed batch. Never delete the object until a positive read proves the outcome.
      stored=await priorStmt.first();if(!stored){await bucket.delete(objectKey);return json({error:'SAVE_UNAVAILABLE'},503);}
    }
    if(stored?.id!==evidenceId)await bucket.delete(objectKey);
    if(!stored || stored.case_id!==caseId || stored.digest!==digest)return json({error:'REVISION_OR_REQUEST_CONFLICT'},409);
    return json({evidenceId:stored.id,pages:pages.length});
  }catch{return json({error:'EVIDENCE_UNAVAILABLE'},503);}
}
