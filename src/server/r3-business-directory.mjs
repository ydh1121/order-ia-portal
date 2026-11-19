// Private, actor-scoped saved input. Saving an address never approves a business,
// creates a membership, or changes commercial eligibility.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
const limits={name:200,road:4096,postal:5,detail:4096,jibun:4096,region:1024,providerId:73,addressProvider:5,contactName:100,contactPhone:80,storePhone:80,email:254,dropoff:4096};
const latest=`NOT EXISTS(SELECT 1 FROM r3_saved_business_revision newer WHERE newer.actor_id=b.actor_id AND newer.business_id=b.business_id AND newer.revision>b.revision)`;
export function projectSavedBusiness(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(limits,k)&&k!=='regionSelection'))throw Error('INVALID_PROFILE');
 const out={};
 for(const [key,limit] of Object.entries(limits)){
  const text=value[key]??'';
  if(typeof text!=='string'||text.length>limit||/[\u0000-\u001f\u007f]/.test(text))throw Error('INVALID_PROFILE');
  out[key]=text.trim();
 }
 if(!out.name||out.postal&&!/^\d{5}$/.test(out.postal)||out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw Error('INVALID_PROFILE');
 if(!['','JUSO','KAKAO'].includes(out.addressProvider))throw Error('INVALID_PROFILE');
 if(out.addressProvider&&(!out.road||!out.postal||!(out.addressProvider==='JUSO'?/^\d{25}$/:/^KAKAO:v1:[a-f0-9]{64}$/).test(out.providerId)))throw Error('INVALID_PROFILE');
 const selection=value.regionSelection??null;
 if(selection!==null){
  const keys=['referenceVersion','rootCode','leafCode','rootLabel','leafLabel'];
  if(typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).length!==5||keys.some(k=>typeof selection[k]!=='string'||selection[k].length>200||/[\u0000-\u001f\u007f]/.test(selection[k]))||!/^\d{10}$/.test(selection.rootCode)||!/^\d{10}$/.test(selection.leafCode))throw Error('INVALID_PROFILE');
  out.regionSelection=Object.fromEntries(keys.map(k=>[k,selection[k]]));
 }else out.regionSelection=null;
 return out;
}
export async function readSavedBusinesses(db,actorId){
 const rows=(await db.prepare(`SELECT business_id id,revision,profile_json,created_at updatedAt FROM r3_saved_business_revision b WHERE actor_id=? AND deleted=0 AND ${latest} ORDER BY created_at DESC,business_id LIMIT 200`).bind(actorId).all()).results;
 return rows.map(({profile_json,...row})=>({...row,profile:JSON.parse(profile_json)}));
}
export async function saveBusiness(db,actorId,input,now=new Date().toISOString()){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','expectedRevision','requestKey','deleted','profile'].includes(k))||!id(input.id)||!id(input.requestKey)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.deleted!=='boolean')return {status:400,error:'INVALID_INPUT'};
 let profile;try{profile=projectSavedBusiness(input.profile);}catch{return {status:400,error:'INVALID_PROFILE'};}
 const serialized=JSON.stringify(profile),revision=input.expectedRevision+1,deleted=Number(input.deleted);
 // Both concurrency and the per-account size bound are checked in the same write.
 await db.prepare(`INSERT OR IGNORE INTO r3_saved_business_revision(actor_id,business_id,revision,request_key,deleted,profile_json,created_at)
 SELECT ?,?,?,?,?,?,? WHERE (SELECT coalesce(max(revision),0) FROM r3_saved_business_revision WHERE actor_id=? AND business_id=?)=?
 AND (?=1 OR EXISTS(SELECT 1 FROM r3_saved_business_revision b WHERE actor_id=? AND business_id=? AND deleted=0 AND ${latest}) OR (SELECT count(*) FROM r3_saved_business_revision b WHERE actor_id=? AND deleted=0 AND ${latest})<200)`)
 .bind(actorId,input.id,revision,input.requestKey,deleted,serialized,now,actorId,input.id,input.expectedRevision,deleted,actorId,input.id,actorId).run();
 const event=await db.prepare('SELECT business_id,revision,deleted,profile_json FROM r3_saved_business_revision WHERE actor_id=? AND request_key=?').bind(actorId,input.requestKey).first();
 if(!event||event.business_id!==input.id||event.revision!==revision||event.deleted!==deleted||event.profile_json!==serialized)return {status:409,error:'REVISION_CONFLICT'};
 return {status:200,id:input.id,revision,deleted:input.deleted,profile};
}
export async function handleSavedBusinesses({request,env,actor}){
 if(!env.ORDER_QA_DB)return json({error:'SERVICE_UNAVAILABLE'},503);
 if(request.method==='GET')return json({businesses:await readSavedBusinesses(env.ORDER_QA_DB,actor.id)});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const text=await request.text();if(new TextEncoder().encode(text).length>32768)return json({error:'BODY_TOO_LARGE'},413);
 let input;try{input=JSON.parse(text);}catch{return json({error:'INVALID_INPUT'},400);}
 const result=await saveBusiness(env.ORDER_QA_DB,actor.id,input);return json(result,result.status);
}
