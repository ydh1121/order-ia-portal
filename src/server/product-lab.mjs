import {labSchema,marketUpgrade} from './product-lab-schema.gen.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {defaultPriceRows} from './r3-price-workspace-defaults.mjs';
import {handleR3Price} from './r3-price.mjs';
import {handleR3Role} from './r3-role.mjs';
import {handleSavedBusinesses} from './r3-business-directory.mjs';
import {handleProductOperations} from './product-operations.mjs';
import {productBuild} from './product-build.gen.mjs';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validId=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const validKey=v=>typeof v==='string'&&/^[\w-]{8,100}$/.test(v);
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
const rows=async(db,q,...args)=>(await sql(db,q,...args).all()).results;
export const labPersonas=Object.freeze({buyer:{id:'lab-buyer',email:'buyer@example.invalid',label:'매장',role:'BUSINESS'},supplier:{id:'lab-supplier',email:'supplier@example.invalid',label:'공급처',role:'BUSINESS'},operator:{id:'lab-operator',email:'operator@example.invalid',label:'운영자',role:'BUSINESS'},guest:{id:'lab-guest',email:'guest@example.invalid',label:'비회원',role:'BUSINESS'}});
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const newId=()=>crypto.randomUUID().replaceAll('-','');
const runtimeSource=env=>({productRepository:'ydh1121/order',productCommit:quoteCommit,applicationRepository:'ydh1121/order-ia-portal',applicationCommit:env.CF_PAGES_COMMIT_SHA||null,applicationSourceDigest:productBuild.digest,schemaDigest:labSchema.digest,mode:'shared-product-source',paymentProvider:'unconfigured',emailProvider:'unconfigured'});
const schemaManifest=()=>({format:'order-product-lab-schema/v1',digest:labSchema.digest,names:[...labSchema.identifiers],tables:labSchema.tables.map(({name,columns,primaryKey})=>({name,columns:[...columns],primaryKey:[...primaryKey]}))});
const identifier=value=>typeof value==='string'&&/^[A-Za-z_][A-Za-z_0-9]{0,127}$/.test(value);
const quoted=value=>'"'+value+'"';
function validateManifest(manifest,expectedDigest){
 if(!manifest||manifest.format!=='order-product-lab-schema/v1'||manifest.digest!==expectedDigest||!/^[a-f0-9]{64}$/.test(expectedDigest)||!Array.isArray(manifest.names)||!manifest.names.length||!manifest.names.every(identifier)||new Set(manifest.names).size!==manifest.names.length||!Array.isArray(manifest.tables)||!manifest.tables.length)fail('RUN_SCHEMA_MANIFEST_INVALID',409);
 const tableNames=new Set();
 for(const table of manifest.tables){
  if(!table||!identifier(table.name)||tableNames.has(table.name)||!manifest.names.includes(table.name)||!Array.isArray(table.columns)||!table.columns.length||!table.columns.every(identifier)||new Set(table.columns).size!==table.columns.length||!Array.isArray(table.primaryKey)||!table.primaryKey.every(name=>table.columns.includes(name))||new Set(table.primaryKey).size!==table.primaryKey.length)fail('RUN_SCHEMA_MANIFEST_INVALID',409);
  tableNames.add(table.name);
 }
 return manifest;
}
function runManifest(run){
 const saved=JSON.parse(run.source_json).schemaManifest;
 // Existing inline-era runs can use this schema only while their exact digest
 // remains current. A later build must never guess an old run's columns.
 if(!saved&&run.schema_digest!==labSchema.digest)fail('RUN_SCHEMA_MANIFEST_UNAVAILABLE',409);
 return validateManifest(saved||schemaManifest(),run.schema_digest);
}

// Lex only identifiers. Quoted string values, comments and bound parameters are
// unchanged. This boundary is not a second implementation of a domain handler.
const names=new Set(labSchema.identifiers);
export function namespaceSql(source,runId){
 if(!validId(runId))fail('INVALID_RUN');
 return source.replace(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|\b[A-Za-z_][A-Za-z_0-9]*\b/g,token=>{
  const name=token.startsWith('"')?token.slice(1,-1):token;
  return names.has(name)?'lab_'+runId+'_'+name:token;
 });
}
export function namespaceDb(db,runId){
 if(!validId(runId))fail('INVALID_RUN');
 return {prepare:q=>db.prepare(namespaceSql(q,runId)),batch:statements=>db.batch(statements)};
}
export async function requireLabDb(env){
 const db=env.ORDER_LAB_DB;if(!db||db===env.ORDER_QA_DB)fail('ISOLATED_LAB_DB_REQUIRED',503);
 // Misbinding the review/owner database fails before any lab mutation.
 const forbidden=await rows(db,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('qa_review_events','ia_owner_session_revocations','r3_membership')");
 if(forbidden.length)fail('LAB_DATABASE_ISOLATION_FAILED',503);
 const marker=await sql(db,"SELECT id FROM product_lab_identity WHERE id='order-product-lab/v1'").first();
 if(!marker)fail('LAB_SCHEMA_NOT_INSTALLED',503);return db;
}
const canUpgradeMarket=digest=>marketUpgrade.to===labSchema.digest&&digest===marketUpgrade.from;
async function upgradeMarketRun(db,run){
 const scoped=namespaceDb(db,run.id),source=JSON.parse(run.source_json);
 const meta={...source,schemaDigest:labSchema.digest,schemaManifest:schemaManifest()};
 try{
  await db.batch([...marketUpgrade.sql.map(statement=>scoped.prepare(statement)),
   sql(db,'UPDATE product_lab_run SET schema_digest=?,source_json=? WHERE id=? AND owner_id=? AND schema_digest=?',labSchema.digest,JSON.stringify(meta),run.id,run.owner_id,run.schema_digest)]);
 }catch(error){
  const current=await sql(db,'SELECT * FROM product_lab_run WHERE id=? AND owner_id=?',run.id,run.owner_id).first();
  if(current?.schema_digest===labSchema.digest)return current;
  throw error;
 }
 return {...run,schema_digest:labSchema.digest,source_json:JSON.stringify(meta)};
}
export async function readLabRun(env,owner,runId,{active=false,requireCurrentSchema=true}={}){
 if(owner?.role!=='OWNER'||!validId(runId))fail('LAB_ACCESS_DENIED',403);
 const db=await requireLabDb(env),run=await sql(db,'SELECT * FROM product_lab_run WHERE id=? AND owner_id=?',runId,owner.id).first();
 if(!run)fail('RUN_NOT_FOUND',404);if(active&&run.state!=='ACTIVE')fail('RUN_NOT_ACTIVE',409);
 if(requireCurrentSchema&&canUpgradeMarket(run.schema_digest))return {db,run:await upgradeMarketRun(db,run)};
 if(requireCurrentSchema&&run.schema_digest!==labSchema.digest)fail('RUN_SCHEMA_MIGRATION_REQUIRED',409);
 return {db,run};
}
function projectRun(row){return {id:row.id,label:row.label,state:row.state,source:JSON.parse(row.source_json),schemaDigest:row.schema_digest,parentSnapshotId:row.parent_snapshot_id,createdAt:row.created_at,updatedAt:row.updated_at};}
async function readBody(request,max=8192){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
 const reader=request.body?.getReader();if(!reader)fail('INVALID_INPUT');let size=0,text='',decoder=new TextDecoder('utf-8',{fatal:true});
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('BODY_TOO_LARGE',413);}text+=decoder.decode(value,{stream:true});}
 let data;try{data=JSON.parse(text+decoder.decode());}catch{fail('INVALID_INPUT');}if(!data||typeof data!=='object'||Array.isArray(data))fail('INVALID_INPUT');return data;
}
function evidenceBucket(bucket,runId){
 if(!bucket)return undefined;const prefix='runs/'+runId+'/';
 return {put:(key,...args)=>bucket.put(prefix+key,...args),get:key=>bucket.get(prefix+key),delete:key=>bucket.delete(prefix+key)};
}
export async function labContext(env,owner,runId,persona,csrf){
 const {db,run}=await readLabRun(env,owner,runId,{active:true});
 if(!Object.hasOwn(labPersonas,persona))fail('UNKNOWN_PERSONA');
 const actor={...labPersonas[persona],csrf,expiresAt:owner.expiresAt},scoped=namespaceDb(db,runId);
 // Only the dedicated evidence bucket is available here. No Google, mail,
 // payment, production DB or customer credential is inherited by the adapter.
 const contextEnv={ORDER_QA_DB:scoped,ORDER_PRODUCT_DB:scoped,ORDER_PRIVATE_EVIDENCE:evidenceBucket(env.ORDER_LAB_EVIDENCE,runId)};
 return {env:contextEnv,actor,run:projectRun(run),context:{mode:'lab',runId,persona,actor:{id:actor.id,label:actor.label,authenticated:persona!=='guest'},source:runtimeSource(env),apiBase:`/api/ia/lab/runs/${runId}/as/${persona}/product`,endpoints:{product:`/api/ia/lab/runs/${runId}/as/${persona}/product`,role:`/api/ia/lab/runs/${runId}/as/${persona}/role`,price:`/api/ia/lab/runs/${runId}/as/${persona}/price`},csrf:csrf||null}};
}
async function createTables(db,runId,{triggers=true}={}){
 const target=namespaceDb(db,runId);
 await db.batch(labSchema.ddl.map(q=>target.prepare(q)));
 if(triggers)await db.batch(labSchema.triggers.map(q=>target.prepare(q)));
 return target;
}
async function initializeProduct(db,now){
 const grades=['왕란','특란','대란','중란'].map((name,index)=>({id:'grade-'+index,name}));
 const definition={supplierName:'실험 공급처',originName:'합천 농장',productName:'계란',shells:['unspecified'],packSizes:[30],grades};
 await db.batch([
  sql(db,"INSERT INTO r3_membership VALUES('lab-buyer','BUYER','lab-store','lab-site',1),('lab-operator','OPERATOR','lab-store','',1),('lab-operator','OPERATOR','lab-farm','',1),('lab-supplier','SUPPLIER','lab-farm','',1)"),
  sql(db,"INSERT INTO r3_business_site VALUES('lab-store','lab-site','VERIFIED',1)"),
  sql(db,"INSERT INTO r3_price_scope VALUES('lab-farm','hapcheon','egg-30',1)"),
  sql(db,"INSERT INTO r3_price_catalog VALUES('lab-farm','hapcheon','egg-30',1,?,'lab-operator',?)",JSON.stringify(definition),now),
  sql(db,"INSERT INTO r3_price_destination VALUES('lab-store','lab-site','1100000000','lab-region-v1',NULL)"),
  sql(db,"INSERT INTO r3_release_admin VALUES('lab-operator',1)"),
  ...Object.entries(labPersonas).filter(([key])=>key!=='guest').map(([key,actor])=>sql(db,"INSERT INTO order_account VALUES(?,1,'ACTIVE',?,?)",actor.id,JSON.stringify({name:'실험 '+actor.label,phone:'',email:actor.email,connections:[]}),now)),
  sql(db,"INSERT INTO r3_saved_business_revision VALUES('lab-buyer','saved-lab-store',1,'seed-business',0,?,?)",JSON.stringify({name:'실험 매장',road:'',postal:'',detail:'',jibun:'',region:'서울특별시',providerId:'',addressProvider:'',contactName:'실험 담당자',contactPhone:'',storePhone:'',email:'buyer@example.invalid',dropoff:'입구',regionSelection:null}),now)
 ]);
 const policy={supplierId:'lab-farm',originId:'hapcheon',productId:'egg-30',displayName:'계란',groupId:'eggs',unit:'tray',packaging:'sunspecified.p30',policyId:'lab-default',currency:'KRW',timeZone:'Asia/Seoul',packSize:30,minimumOrder:10,effectiveFrom:now,effectiveTo:null,rounding:'HALF_UP',discount:{ruleId:'none',type:'NONE'},tax:{ruleId:'included',type:'INCLUDED'},performance:{basis:'DELIVERY'},matrix:{schema:1,shell:'unspecified',grades,rows:structuredClone(defaultPriceRows)},delivery:{ruleSetId:'lab-delivery',regionVersion:'lab-region-v1',groupBasis:'SHIPMENT',regions:[{id:'lab-local',prefix:'11',label:'서울',priority:1,minimumQty:10,weekdays:[0,1,2,3,4,5,6],status:'FREE',fee:'0'}]}};
 for(const [persona,action,revision] of [['supplier','create',0],['supplier','submit',1],['operator','approve',2]]){
  const b={id:'lab-default-price',requestKey:'seed-'+action,action,expectedRevision:revision,...(action==='create'?{policy}:{})};
  const response=await handleR3Price({request:new Request('https://product.invalid/api/ia/r3-price/version',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),env:{ORDER_QA_DB:db},actor:labPersonas[persona],path:'/version',clock:()=>now});
  if(!response.ok){const error=await response.json();fail('LAB_SEED_'+error.error,503);}
 }
}
async function log(db,run,owner,action,data,now){await sql(db,'INSERT INTO product_lab_event VALUES(?,?,?,?,?,?)',newId(),run,owner,action,JSON.stringify(data),now).run();}
async function newRun(db,env,owner,b,now,snapshot){
 if(!validKey(b.requestKey)||!textLabel(b.label))fail('INVALID_RUN_INPUT');
 const replay=await sql(db,'SELECT * FROM product_lab_run WHERE owner_id=? AND request_key=?',owner.id,b.requestKey).first();
 if(replay){if(replay.label!==b.label.trim()||replay.parent_snapshot_id!==(snapshot?.id||null))fail('IDEMPOTENCY_CONFLICT',409);if(!['ACTIVE','ARCHIVED'].includes(replay.state))fail(replay.state==='CREATING'?'RUN_CREATION_PENDING':'RUN_CREATION_FAILED',409);return {run:projectRun(replay)};}
 const count=await sql(db,"SELECT count(*) n FROM product_lab_run WHERE owner_id=? AND state IN ('ACTIVE','CREATING')",owner.id).first();if(count.n>=20)fail('ACTIVE_RUN_LIMIT',409);
 let payload=null;
 if(snapshot){
  payload=JSON.parse(await loadSnapshotContent(env,snapshot));
  if(canUpgradeMarket(payload.schemaDigest)&&Array.isArray(payload.tables?.r3_price_workspace_event)){
   // Existing prices keep their private publication state in a restored run.
   for(const row of payload.tables.r3_price_workspace_event){if(!Array.isArray(row))fail('SNAPSHOT_INVALID',409);row.push(null);}
   payload.schemaDigest=labSchema.digest;
  }
  if(payload.schemaDigest!==labSchema.digest||payload.format!=='order-product-lab-backup/v1')fail('SNAPSHOT_SCHEMA_MISMATCH',409);
  if(!payload.tables||typeof payload.tables!=='object'||Array.isArray(payload.tables))fail('SNAPSHOT_INCOMPLETE',409);
 }
 const runId=newId(),source={...runtimeSource(env),schemaManifest:schemaManifest()};
 await sql(db,"INSERT INTO product_lab_run VALUES(?,?,?,'CREATING',?,?,?,?,?,?)",runId,owner.id,b.label.trim(),labSchema.digest,JSON.stringify(source),snapshot?.id||null,b.requestKey,now,now).run();
 try{
  const target=await createTables(db,runId,{triggers:!snapshot});
  if(snapshot){
   const statements=[];
   for(const table of labSchema.tables){
    const data=payload.tables[table.name];if(!Array.isArray(data))fail('SNAPSHOT_INCOMPLETE',409);
    for(const row of data){if(!Array.isArray(row)||row.length!==table.columns.length)fail('SNAPSHOT_INVALID',409);statements.push(target.prepare(`INSERT INTO ${table.name} (${table.columns.join(',')}) VALUES (${table.columns.map(()=>'?').join(',')})`).bind(...row));}
   }
   // Target is not ACTIVE, so partial chunk writes are never exposed. A failure
   // keeps the original run and snapshot untouched and marks only this clone.
   for(let start=0;start<statements.length;start+=80)await db.batch(statements.slice(start,start+80));
   await db.batch(labSchema.triggers.map(q=>target.prepare(q)));
   const verified=await snapshotTables(db,runId,source.schemaManifest);if(JSON.stringify(verified)!==JSON.stringify(payload.tables))fail('RESTORE_READBACK_MISMATCH',409);
   if((payload.evidenceObjects||[]).length){
    if(!env.ORDER_LAB_EVIDENCE)fail('LAB_EVIDENCE_UNAVAILABLE',503);
    for(const object of payload.evidenceObjects){
     const original=await env.ORDER_LAB_EVIDENCE.get(object.backupKey||'runs/'+snapshot.run_id+'/'+object.key);if(!original)fail('BACKUP_EVIDENCE_MISSING',409);
     const bytes=await original.arrayBuffer();if(await digestBytes(bytes)!==object.sha256)fail('BACKUP_EVIDENCE_CHANGED',409);
     await env.ORDER_LAB_EVIDENCE.put('runs/'+runId+'/'+object.key,bytes,{customMetadata:{restoredFrom:snapshot.id}});
     const restored=await env.ORDER_LAB_EVIDENCE.get('runs/'+runId+'/'+object.key);if(!restored||await digestBytes(await restored.arrayBuffer())!==object.sha256)fail('RESTORE_EVIDENCE_READBACK_MISMATCH',409);
    }
   }
  }else await initializeProduct(target,now);
  await sql(db,"UPDATE product_lab_run SET state='ACTIVE',updated_at=? WHERE id=? AND state='CREATING'",now,runId).run();
  await log(db,runId,owner.id,snapshot?'restore':'create',{snapshotId:snapshot?.id||null,source,verifiedTables:labSchema.tables.length},now);
 }catch(error){await sql(db,"UPDATE product_lab_run SET state='FAILED',updated_at=? WHERE id=?",now,runId).run();throw error;}
 return {run:projectRun(await sql(db,'SELECT * FROM product_lab_run WHERE id=?',runId).first())};
}
const textLabel=v=>typeof v==='string'&&v.trim()&&v.trim().length<=100&&!/[\u0000-\u001f]/.test(v);
const digestBytes=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');
async function snapshotTables(db,runId,manifest){
 if(!validId(runId))fail('INVALID_RUN');
 const prefix='lab_'+runId+'_',expected=manifest.tables.map(table=>prefix+table.name).sort();
 const present=await rows(db,"SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,?)=? ORDER BY name",prefix.length,prefix);
 if(JSON.stringify(present.map(table=>table.name))!==JSON.stringify(expected))fail('BACKUP_SCHEMA_MANIFEST_MISMATCH',409);
 const columns=await db.batch(manifest.tables.map(table=>db.prepare('PRAGMA table_info('+quoted(prefix+table.name)+')')));
 for(let index=0;index<manifest.tables.length;index++){
  const table=manifest.tables[index],actual=columns[index].results;
  if(JSON.stringify(actual.map(column=>column.name))!==JSON.stringify(table.columns)||JSON.stringify(actual.filter(column=>column.pk).sort((a,b)=>a.pk-b.pk).map(column=>column.name))!==JSON.stringify(table.primaryKey))fail('BACKUP_SCHEMA_MANIFEST_MISMATCH',409);
 }
 // Read only this run's physical tables. Old schemas deliberately do not pass
 // through namespaceDb, whose identifier allowlist belongs to the current app.
 const queries=manifest.tables.map(table=>db.prepare(`SELECT ${table.columns.map(quoted).join(',')} FROM ${quoted(prefix+table.name)} ORDER BY ${(table.primaryKey.length?table.primaryKey:table.columns).map(quoted).join(',')}`));
 const result=await db.batch(queries);
 return Object.fromEntries(manifest.tables.map((table,index)=>[table.name,result[index].results.map(row=>table.columns.map(column=>row[column]))]));
}
async function loadSnapshotContent(env,snapshot){
 let content=snapshot.content,stored;
 try{stored=JSON.parse(content);}catch{fail('SNAPSHOT_CHECKSUM_MISMATCH',409);}
 if(stored?.format==='order-product-lab-backup-pointer/v1'){
  if(stored.key!=='backups/'+snapshot.id+'/snapshot.json'||stored.sha256!==snapshot.digest||!Number.isSafeInteger(stored.bytes)||stored.bytes<1)fail('SNAPSHOT_POINTER_INVALID',409);
  if(!env.ORDER_LAB_EVIDENCE)fail('LAB_EVIDENCE_UNAVAILABLE',503);
  const object=await env.ORDER_LAB_EVIDENCE.get(stored.key);if(!object)fail('SNAPSHOT_OBJECT_MISSING',409);
  const bytes=await object.arrayBuffer();
  if(bytes.byteLength!==stored.bytes||await digestBytes(bytes)!==snapshot.digest)fail('SNAPSHOT_CHECKSUM_MISMATCH',409);
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('SNAPSHOT_CHECKSUM_MISMATCH',409);}
 }
 if(await digest(content)!==snapshot.digest)fail('SNAPSHOT_CHECKSUM_MISMATCH',409);
 return content;
}
async function storeSnapshotContent(env,id,content,sha256){
 const bytes=new TextEncoder().encode(content);
 if(bytes.byteLength<=1000000)return content;
 if(!env.ORDER_LAB_EVIDENCE)fail('LAB_EVIDENCE_UNAVAILABLE',503);
 const key='backups/'+id+'/snapshot.json';
 await env.ORDER_LAB_EVIDENCE.put(key,bytes,{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{snapshotId:id,sha256}});
 const pointer=JSON.stringify({format:'order-product-lab-backup-pointer/v1',key,bytes:bytes.byteLength,sha256});
 // A registry row is written only after reading the exact uploaded bytes back.
 if(await loadSnapshotContent(env,{id,digest:sha256,content:pointer})!==content)fail('SNAPSHOT_CHECKSUM_MISMATCH',409);
 return pointer;
}
async function createSnapshot(db,env,owner,run,b,now){
 if(!textLabel(b.label))fail('INVALID_SNAPSHOT_LABEL');
 const manifest=runManifest(run),snapshotId=newId(),tables=await snapshotTables(db,run.id,manifest),evidenceObjects=[];
 const evidence=manifest.tables.find(table=>table.name==='r3_evidence_object'),objectIndex=evidence?.columns.indexOf('object_key')??-1;
 for(const row of tables.r3_evidence_object||[]){
  if(objectIndex<0)fail('BACKUP_EVIDENCE_SCHEMA',503);
  const key=row[objectIndex];if(!env.ORDER_LAB_EVIDENCE)fail('LAB_EVIDENCE_UNAVAILABLE',503);
  const object=await env.ORDER_LAB_EVIDENCE.get('runs/'+run.id+'/'+key);if(!object)fail('BACKUP_EVIDENCE_MISSING',409);
  const bytes=await object.arrayBuffer(),sha256=await digestBytes(bytes),backupKey='backups/'+snapshotId+'/evidence/'+key;
  await env.ORDER_LAB_EVIDENCE.put(backupKey,bytes,{customMetadata:{snapshotId,sourceRun:run.id,sha256}});
  const confirmed=await env.ORDER_LAB_EVIDENCE.get(backupKey);if(!confirmed||await digestBytes(await confirmed.arrayBuffer())!==sha256)fail('BACKUP_EVIDENCE_READBACK_MISMATCH',409);
  evidenceObjects.push({key,backupKey,bytes:bytes.byteLength,sha256});
 }
 const payload={format:'order-product-lab-backup/v1',schemaDigest:run.schema_digest,schemaManifest:manifest,source:runtimeSource(env),initializedWith:JSON.parse(run.source_json),run:{id:run.id,label:run.label},createdAt:now,tables,evidenceObjects},content=JSON.stringify(payload);
 const snapshot={id:snapshotId,run_id:run.id,owner_id:owner.id,label:b.label.trim(),digest:await digest(content),created_at:now};
 const stored=await storeSnapshotContent(env,snapshot.id,content,snapshot.digest);
 await db.batch([sql(db,'INSERT INTO product_lab_snapshot VALUES(?,?,?,?,?,?,?)',snapshot.id,run.id,owner.id,snapshot.label,snapshot.digest,stored,now),sql(db,'INSERT INTO product_lab_event VALUES(?,?,?,?,?,?)',newId(),run.id,owner.id,'backup',JSON.stringify({snapshotId:snapshot.id,digest:snapshot.digest,tables:manifest.tables.length}),now)]);
 return {snapshot:{id:snapshot.id,runId:run.id,label:snapshot.label,digest:snapshot.digest,createdAt:now,tableCount:manifest.tables.length,rowCount:Object.values(tables).reduce((n,r)=>n+r.length,0)}};
}
export async function handleProductLab({request,env,actor,path,csrf,clock=()=>new Date().toISOString()}){
 if(actor?.role!=='OWNER')return json({error:'LAB_ACCESS_DENIED'},403);
 try{
  const db=await requireLabDb(env),now=clock(),url=new URL(request.url);
  if(path==='/session'&&request.method==='GET')return json({csrf,source:runtimeSource(env),personas:Object.keys(labPersonas),schema:labSchema.digest,isolated:true,backup:'fresh-run-restore'});
  if(path==='/runs'){
   if(request.method==='GET')return json({runs:(await rows(db,'SELECT * FROM product_lab_run WHERE owner_id=? ORDER BY created_at DESC LIMIT 100',actor.id)).map(projectRun)});
   if(request.method==='POST')return json(await newRun(db,env,actor,await readBody(request),now));
  }
  const product=path.match(/^\/runs\/([a-f0-9]{32})\/as\/(buyer|supplier|operator|guest)\/(product|role|price)(\/.*)?$/);
  if(product){
   const context=await labContext(env,actor,product[1],product[2],csrf),suffix=product[4]||'/';
   if(suffix.startsWith('/practice/'))return json({error:'LEGACY_PRACTICE_NOT_A_PRODUCT_RUNTIME'},409);
   if(product[2]==='guest'){
    const publicProduct=product[3]==='product'&&(['/account','/features'].includes(suffix)||/^\/policies\/(required|privacy|optional)$/.test(suffix));
    const publishedPrices=product[3]==='price'&&suffix==='/workspace/chart';
    if(request.method!=='GET'||!(publicProduct||publishedPrices))return json({error:'AUTHENTICATION_REQUIRED'},401);
   }
   if(suffix==='/session'&&request.method==='GET')return json({csrf,expiresAt:actor.expiresAt,practiceAllowed:false,mode:'lab',runId:product[1],persona:product[2]});
   const dest=new URL(request.url);dest.pathname='/api/ia/'+(product[3]==='product'?'product':'r3-'+product[3])+suffix;
   const forwarded=new Request(dest,request),ctx={request:forwarded,env:context.env,actor:context.actor,path:suffix,clock};
   if(product[3]==='product')return handleProductOperations(ctx);
   if(product[3]==='price')return handleR3Price(ctx);
   if(suffix==='/businesses')return handleSavedBusinesses(ctx);
   return handleR3Role(ctx);
  }
  const runPath=path.match(/^\/runs\/([a-f0-9]{32})(?:\/(snapshots|archive|events))?$/);
  if(runPath){
   // Control-plane read/archive/backup must remain available after a schema
   // upgrade. labContext still enforces the current schema for every app call.
   const {run}=await readLabRun(env,actor,runPath[1],{requireCurrentSchema:false});
   if(!runPath[2]&&request.method==='GET')return json({run:projectRun(run)});
   if(runPath[2]==='events'&&request.method==='GET')return json({items:await rows(db,'SELECT id,action,data_json,created_at FROM product_lab_event WHERE run_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 100',run.id,actor.id)});
   if(runPath[2]==='snapshots'){
    if(request.method==='GET')return json({snapshots:await rows(db,'SELECT id,run_id runId,label,digest,created_at createdAt FROM product_lab_snapshot WHERE run_id=? AND owner_id=? ORDER BY created_at DESC',run.id,actor.id)});
    if(request.method==='POST'&&['ACTIVE','ARCHIVED'].includes(run.state))return json(await createSnapshot(db,env,actor,run,await readBody(request),now));
   }
   if(runPath[2]==='archive'&&request.method==='POST'){
    const b=await readBody(request);if(b.confirm!==run.label)fail('RUN_LABEL_CONFIRMATION_REQUIRED');
    await sql(db,"UPDATE product_lab_run SET state='ARCHIVED',updated_at=? WHERE id=? AND owner_id=? AND state='ACTIVE'",now,run.id,actor.id).run();await log(db,run.id,actor.id,'archive',{},now);return json({id:run.id,state:'ARCHIVED'});
   }
  }
  const snapshotPath=path.match(/^\/snapshots\/([a-f0-9]{32})(?:\/(restore))?$/);
  if(snapshotPath){
   const snapshot=await sql(db,'SELECT * FROM product_lab_snapshot WHERE id=? AND owner_id=?',snapshotPath[1],actor.id).first();if(!snapshot)fail('SNAPSHOT_NOT_FOUND',404);
   if(snapshotPath[2]==='restore'&&request.method==='POST')return json(await newRun(db,env,actor,await readBody(request),now,snapshot));
   if(!snapshotPath[2]&&request.method==='GET')return new Response(await loadSnapshotContent(env,snapshot),{headers:{...headers,'Content-Disposition':'attachment; filename="order-lab-backup-'+snapshot.id+'.json"','X-Content-SHA256':snapshot.digest}});
  }
  return json({error:'NOT_FOUND'},404);
 }catch(error){return json({error:error.status?error.message:'LAB_SERVICE_UNAVAILABLE'},error.status||503);}
}
