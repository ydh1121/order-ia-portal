import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {handleProductLab,labContext,namespaceDb} from '../src/server/product-lab.mjs';
import {createEvidenceEditor} from '../src/server/r3-evidence-client.mjs';
import {labSchema,marketUpgrade} from '../src/server/product-lab-schema.gen.mjs';
import {quoteSourceHashes} from '../src/server/r3-product-sources.mjs';
import {r3ProductAsset} from '../src/server/r3-product-page.mjs';

const encode=value=>new TextEncoder().encode(value);
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encode(value):value)),v=>v.toString(16).padStart(2,'0')).join('');
const command=(data,expectedRevision=0)=>({requestKey:crypto.randomUUID(),expectedRevision,data});
function workspace(t){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 sqlite.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
 const prepare=(query,params=[])=>({query,params,bind:(...args)=>prepare(query,args),first:async()=>sqlite.prepare(query).get(...params)||null,all:async()=>({results:sqlite.prepare(query).all(...params)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...params).changes)}})});
 const db={prepare,async batch(statements){sqlite.exec('BEGIN');try{const values=statements.map(item=>{const statement=sqlite.prepare(item.query);return statement.columns().length?{results:statement.all(...item.params),meta:{changes:0}}:{results:[],meta:{changes:Number(statement.run(...item.params).changes)}};});sqlite.exec('COMMIT');return values;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const objects=new Map();let alterPut=null,productionTouches=0;
 const bucket={async put(key,value){let bytes=typeof value==='string'?encode(value):value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);bytes=bytes.slice();objects.set(key,alterPut?.(key,bytes)||bytes);},async get(key){const bytes=objects.get(key)?.slice();return bytes?{size:bytes.byteLength,body:bytes,arrayBuffer:async()=>bytes.buffer,text:async()=>new TextDecoder().decode(bytes)}:null;},async delete(key){objects.delete(key);}};
 const env={ORDER_LAB_DB:db,ORDER_QA_DB:{prepare(){productionTouches++;throw Error('production accessed');}},ORDER_LAB_EVIDENCE:bucket,CF_PAGES_COMMIT_SHA:'backup-canonical-source'},owner={id:'backup-owner',role:'OWNER'};
 async function api(path,body,actor=owner){const response=await handleProductLab({request:new Request('https://lab.test/api/ia/lab'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env,actor,path,csrf:'csrf',clock:()=> '2026-11-20T00:00:00.000Z'});const text=await response.text();return {status:response.status,body:JSON.parse(text),text,headers:response.headers};}
 const create=async(label='백업 검증')=>{const response=await api('/runs',{label,requestKey:crypto.randomUUID()});assert.equal(response.status,200,response.body.error);return response.body.run.id;};
 const save=(run,mode,data,revision=0)=>api('/runs/'+run+'/as/buyer/product/drafts/'+mode,command(data,revision));
 return {sqlite,db,env,owner,api,create,save,objects,bucket,alterPut:value=>{alterPut=value;},productionTouches:()=>productionTouches};
}

test('the rendered evidence editor uploads and reopens through its actual isolated lab role endpoint',async t=>{
 const w=workspace(t),run=await w.create('증빙 편집기 격리 경로'),origin='https://lab.test';
 const {context}=await labContext(w.env,w.owner,run,'buyer','csrf'),base=context.endpoints.role,caseId='browser-evidence-case';
 const calls=[];
 const invoke=async(input,init={})=>{
  const url=new URL(String(input),origin),headers=new Headers(init.headers);if(init.body)headers.set('Origin',origin);
  calls.push({path:url.pathname,search:url.search,method:init.method||'GET',headers,body:init.body});
  assert.ok(url.pathname.startsWith('/api/ia/lab/'),'the editor must never call the production role endpoint');
  return handleProductLab({request:new Request(url,{...init,headers}),env:w.env,actor:w.owner,path:url.pathname.slice('/api/ia/lab'.length),csrf:'csrf'});
 };
 const command=async body=>{
  const response=await invoke(base,{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':'csrf'},body:JSON.stringify({requestKey:crypto.randomUUID(),...body})});
  assert.equal(response.status,200,await response.clone().text());return response.json();
 };
 await command({action:'create',caseId,kind:'business',orgId:'lab-store',siteId:'lab-site',expectedRevision:0});
 await command({action:'manual',caseId,expectedRevision:1});
 const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
 const dom=new JSDOM('<main id="editor"></main>',{url:origin+'/ia?view=roles-r3&labRun='+run+'&persona=buyer',runScripts:'outside-only'}),win=dom.window;
 t.after(()=>win.close());win.ORDER_APP_CONTEXT=context;win.fetch=invoke;
 // Only raster decoding/drawing is a small DOM test adapter. Upload, receipt,
 // linking, scoped object storage and readback use the actual domain handlers.
 const pixels=new WeakMap(),rgba=Uint8ClampedArray.from([120,80,40,255]);
 win.createImageBitmap=async()=>({width:1,height:1,close(){}});
 win.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {
  fillRect(){pixels.set(canvas,Uint8ClampedArray.from([255,255,255,255]));},
  drawImage(){pixels.set(canvas,rgba.slice());},getImageData(){return {data:pixels.get(canvas)};},
  createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},putImageData(value){pixels.set(canvas,value.data);}
 };};
 const editor=win.eval('('+createEvidenceEditor.toString()+')'),container=win.document.getElementById('editor'),errors=[];let receipt=null;
 let dispose=editor({container,caseId,kind:'business',csrf:'csrf',onError:value=>errors.push(value),onReceipt:async evidenceId=>{
  const linked=await command({action:'attach',caseId,expectedRevision:2,evidenceId});assert.equal(linked.case.state,'REVIEW');receipt=evidenceId;return true;
 }});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 const file=container.querySelector('input[type=file]');
 Object.defineProperty(file,'files',{value:[{type:'image/png',size:png.length,arrayBuffer:async()=>png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength)}]});
 await file.onchange();container.querySelector('input[type=checkbox]').checked=true;
 calls.length=0;await [...container.querySelectorAll('button')].find(button=>button.textContent==='가림 처리본 제출').onclick();
 assert.equal(calls[0]?.path,base+'/evidence');assert.equal(calls[0]?.method,'POST');assert.equal(calls[0]?.headers.get('X-IA-CSRF'),'csrf');
 assert.equal(calls[0]?.headers.get('Content-Type'),'application/vnd.order.masked-rasters');assert.deepEqual(errors,[]);assert.ok(receipt);
 const objectKey='runs/'+run+'/r3/masked/'+receipt;assert.deepEqual([...w.objects.keys()],[objectKey]);
 const expected=Uint8Array.from([79,82,80,88,1,1,0,1,0,1,88]);assert.deepEqual(w.objects.get(objectKey),expected);
 dispose();container.replaceChildren();dispose=editor({container,caseId,kind:'business',csrf:'csrf',evidenceId:receipt,readOnly:true,onError:value=>errors.push(value)});
 calls.length=0;await [...container.querySelectorAll('button')].find(button=>button.textContent==='연결된 증빙 열기').onclick();
 assert.equal(calls[0]?.path,base+'/evidence');assert.equal(calls[0]?.method,'GET');assert.equal(new URLSearchParams(calls[0].search).get('id'),receipt);
 assert.deepEqual(errors,[]);assert.deepEqual([...pixels.get(container.querySelector('canvas'))],[88,88,88,255]);assert.equal(w.productionTouches(),0);dispose();
});

async function storageProjector(t){
 const directory=await mkdtemp(join(tmpdir(),'order-backup-quote-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const key of Object.keys(quoteSourceHashes).filter(path=>path.endsWith('.mjs'))){const destination=join(directory,key);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,await r3ProductAsset('/ia/r3-product/'+key).text());}
 return (await import(pathToFileURL(join(directory,'web/storage.mjs')))).projectStoredPayload;
}
function validDraft(project,letter,size=1998000){
 const data={lines:[{id:'sku',housing:'1',size:'대란',pack:'30',qty:'10',price:'6000'}],current:'sku',locations:Array.from({length:500},(_,index)=>({id:'site-'+index,name:'매장 '+index,road:''})),allocations:[],open:'q3',allocationRevision:0};
 let remaining=size-encode(JSON.stringify(data)).byteLength;
 for(const location of data.locations){const count=Math.min(4096,remaining);location.road=letter.repeat(count);remaining-=count;}
 assert.equal(remaining,0);const confirmed=project(data);assert.equal(encode(JSON.stringify(confirmed)).byteLength,size);return confirmed;
}
async function addEvidence(w,run,key='snapshot.json'){
 const db=namespaceDb(w.db,run),bytes=encode('원본 첨부 내용\n원문 보존'),digest=await sha(bytes);
 await db.batch([
  db.prepare("INSERT INTO r3_evidence_receipt VALUES('receipt-1','lab-store','lab-site','business','MASKED_SCANNED')"),
  db.prepare("INSERT INTO r3_case(id,kind,org_id,site_id,state,revision,created_by,updated_at) VALUES('case-1','business','lab-store','lab-site','DRAFT',1,'lab-buyer','2026-11-20T00:00:00.000Z')"),
  db.prepare("INSERT INTO r3_evidence_object VALUES('receipt-1','case-1','lab-buyer','evidence-1',?,?,1,'2026-11-20T00:00:00.000Z')").bind(digest,key)
 ]);
 await w.bucket.put('runs/'+run+'/'+key,bytes);return bytes;
}

test('more than 4MB of valid simple/detailed quote data and attachment bytes round-trip through an R2 snapshot',async t=>{
 const project=await storageProjector(t),w=workspace(t),run=await w.create();
 const simple=validDraft(project,'s'),detailed=validDraft(project,'d');
 assert.equal((await w.save(run,'simple',simple)).status,200);assert.equal((await w.save(run,'detailed',detailed)).status,200);
 const attachment=await addEvidence(w,run),backup=await w.api('/runs/'+run+'/snapshots',{label:'전체 원문 백업'});assert.equal(backup.status,200,backup.body.error);
 const snapshot=backup.body.snapshot,record=w.sqlite.prepare('SELECT * FROM product_lab_snapshot WHERE id=?').get(snapshot.id),pointer=JSON.parse(record.content);
 assert.equal(pointer.format,'order-product-lab-backup-pointer/v1');assert.ok(pointer.bytes>4000000);assert.ok(encode(record.content).byteLength<1000);assert.equal(pointer.key,'backups/'+snapshot.id+'/snapshot.json');
 const downloaded=await w.api('/snapshots/'+snapshot.id);assert.equal(downloaded.status,200);assert.equal(encode(downloaded.text).byteLength,pointer.bytes);assert.equal(await sha(downloaded.text),snapshot.digest);assert.equal(downloaded.headers.get('X-Content-SHA256'),snapshot.digest);
 assert.equal(downloaded.body.schemaManifest.digest,labSchema.digest);assert.equal(downloaded.body.schemaManifest.tables.length,labSchema.tables.length);
 const evidence=downloaded.body.evidenceObjects[0];assert.equal(evidence.backupKey,'backups/'+snapshot.id+'/evidence/snapshot.json');assert.notEqual(evidence.backupKey,pointer.key);
 await w.bucket.delete('runs/'+run+'/snapshot.json');assert.equal((await w.save(run,'simple',{lines:[],locations:[],allocations:[]},1)).status,200);
 const restoreRequest={label:'새 실행 복원',requestKey:crypto.randomUUID()},restored=await w.api('/snapshots/'+snapshot.id+'/restore',restoreRequest);assert.equal(restored.status,200,restored.body.error);const fresh=restored.body.run.id;assert.notEqual(fresh,run);
 assert.equal((await w.api('/snapshots/'+snapshot.id+'/restore',restoreRequest)).body.run.id,fresh);
 assert.deepEqual((await w.api('/runs/'+fresh+'/as/buyer/product/drafts/simple')).body.data,simple);assert.deepEqual((await w.api('/runs/'+fresh+'/as/buyer/product/drafts/detailed')).body.data,detailed);
 assert.deepEqual(w.objects.get('runs/'+fresh+'/snapshot.json'),attachment);assert.deepEqual((await w.api('/runs/'+run+'/as/buyer/product/drafts/simple')).body.data,{lines:[],locations:[],allocations:[]});
 const after=await w.api('/runs/'+fresh+'/snapshots',{label:'복원 후 대조'});assert.equal(after.status,200);assert.deepEqual((await w.api('/snapshots/'+after.body.snapshot.id)).body.tables,downloaded.body.tables);
 assert.equal((await w.api('/snapshots/'+snapshot.id,undefined,{id:'different-owner',role:'OWNER'})).status,404);
 const runsBefore=w.sqlite.prepare('SELECT count(*) n FROM product_lab_run').get().n;
 w.objects.set(pointer.key,encode('{"changed":true}'));
 assert.equal((await w.api('/snapshots/'+snapshot.id)).body.error,'SNAPSHOT_CHECKSUM_MISMATCH');assert.equal((await w.api('/snapshots/'+snapshot.id+'/restore',{label:'손상본 거부',requestKey:crypto.randomUUID()})).status,409);assert.equal(w.sqlite.prepare('SELECT count(*) n FROM product_lab_run').get().n,runsBefore);
 w.objects.delete(pointer.key);assert.equal((await w.api('/snapshots/'+snapshot.id)).body.error,'SNAPSHOT_OBJECT_MISSING');assert.equal(w.productionTouches(),0);
});

test('R2 snapshot write must pass byte readback before a registry row or success is returned',async t=>{
 const w=workspace(t),run=await w.create();assert.equal((await w.save(run,'simple',{note:'x'.repeat(1100000)})).status,200);
 w.alterPut((key,bytes)=>key.endsWith('/snapshot.json')?encode('{}'):bytes);
 const result=await w.api('/runs/'+run+'/snapshots',{label:'업로드 대조 실패'});assert.equal(result.status,409);assert.equal(result.body.error,'SNAPSHOT_CHECKSUM_MISMATCH');assert.equal(w.sqlite.prepare('SELECT count(*) n FROM product_lab_snapshot').get().n,0);
 assert.equal((await w.api('/runs/'+run+'/as/buyer/product/drafts/simple')).body.data.note.length,1100000);assert.equal(w.productionTouches(),0);
});

test('failed attachment restore is not marked active or replayed as a successful restore',async t=>{
 const w=workspace(t),run=await w.create(),original=await addEvidence(w,run),backup=await w.api('/runs/'+run+'/snapshots',{label:'첨부 복원 대조'});assert.equal(backup.status,200);
 w.alterPut((key,bytes)=>key.startsWith('runs/')&&!key.startsWith('runs/'+run+'/')?encode('손상된 복사본'):bytes);
 const body={label:'실패 복원',requestKey:crypto.randomUUID()},restored=await w.api('/snapshots/'+backup.body.snapshot.id+'/restore',body);assert.equal(restored.status,409);assert.equal(restored.body.error,'RESTORE_EVIDENCE_READBACK_MISMATCH');
 const clone=w.sqlite.prepare('SELECT state FROM product_lab_run WHERE request_key=?').get(body.requestKey);assert.equal(clone.state,'FAILED');assert.equal((await w.api('/snapshots/'+backup.body.snapshot.id+'/restore',body)).body.error,'RUN_CREATION_FAILED');
 assert.deepEqual(w.objects.get('runs/'+run+'/snapshot.json'),original);assert.equal(w.sqlite.prepare('SELECT state FROM product_lab_run WHERE id=?').get(run).state,'ACTIVE');assert.equal(w.productionTouches(),0);
});

test('older inline backups and runs without a manifest still download and restore when their exact schema is current',async t=>{
 const w=workspace(t),run=await w.create(),source=JSON.parse(w.sqlite.prepare('SELECT source_json FROM product_lab_run WHERE id=?').get(run).source_json);delete source.schemaManifest;w.sqlite.prepare('UPDATE product_lab_run SET source_json=? WHERE id=?').run(JSON.stringify(source),run);
 const backup=await w.api('/runs/'+run+'/snapshots',{label:'기존 인라인'});assert.equal(backup.status,200);const id=backup.body.snapshot.id,row=w.sqlite.prepare('SELECT * FROM product_lab_snapshot WHERE id=?').get(id),payload=JSON.parse(row.content);assert.equal(payload.format,'order-product-lab-backup/v1');delete payload.schemaManifest;const oldContent=JSON.stringify(payload);w.sqlite.prepare('UPDATE product_lab_snapshot SET content=?,digest=? WHERE id=?').run(oldContent,await sha(oldContent),id);
 const read=await w.api('/snapshots/'+id);assert.equal(read.status,200);assert.equal(read.text,oldContent);const restored=await w.api('/snapshots/'+id+'/restore',{label:'기존 자료 복원',requestKey:crypto.randomUUID()});assert.equal(restored.status,200,restored.body.error);assert.equal(restored.body.run.source.schemaManifest.digest,labSchema.digest);
 w.sqlite.prepare('UPDATE product_lab_snapshot SET content=? WHERE id=?').run('{}',id);assert.equal((await w.api('/snapshots/'+id)).body.error,'SNAPSHOT_CHECKSUM_MISMATCH');
});

test('the market migration preserves old private prices in running and restored lab namespaces',async t=>{
 const w=workspace(t),run=await w.create(),table='lab_'+run+'_r3_price_workspace_event';
 const old=JSON.parse(w.sqlite.prepare('SELECT source_json FROM product_lab_run WHERE id=?').get(run).source_json);
 old.schemaDigest=old.schemaManifest.digest=marketUpgrade.from;
 old.schemaManifest.names=old.schemaManifest.names.filter(name=>name!=='r3_price_workspace_market');
 old.schemaManifest.tables.find(table=>table.name==='r3_price_workspace_event').columns.pop();
 w.sqlite.exec('DROP INDEX lab_'+run+'_r3_price_workspace_market');
 w.sqlite.exec('ALTER TABLE '+table+' DROP COLUMN market_projection');
 w.sqlite.prepare('UPDATE product_lab_run SET schema_digest=?,source_json=? WHERE id=?').run(marketUpgrade.from,JSON.stringify(old),run);
 const insert=w.sqlite.prepare('INSERT INTO '+table+' VALUES(?,?,?,?,?,?,?,?)');
 insert.run('lab-operator',1,'private-1','apply','2026-11-20','2026-11-20T00:00:00.000Z','{}','2026-11-20T00:00:00.000Z');
 const backup=await w.api('/runs/'+run+'/snapshots',{label:'기존 개인 단가 보존'});
 assert.equal(backup.status,200,backup.body.error);
 const copy=await w.api('/snapshots/'+backup.body.snapshot.id+'/restore',{label:'시장 공개 전 복원',requestKey:crypto.randomUUID()});
 assert.equal(copy.status,200,copy.body.error);
 const live=await w.api('/runs/'+run+'/as/buyer/product/purchases');
 assert.equal(live.status,200,live.body.error);
 for(const id of [run,copy.body.run.id]){
  assert.equal(w.sqlite.prepare('SELECT schema_digest FROM product_lab_run WHERE id=?').get(id).schema_digest,labSchema.digest);
  const price=w.sqlite.prepare('SELECT request_key,market_projection FROM lab_'+id+'_r3_price_workspace_event WHERE revision=1').get();
  assert.deepEqual({...price},{request_key:'private-1',market_projection:null});
 }
 assert.equal(w.productionTouches(),0);
});

test('a stored old schema can be listed, archived and backed up without executing it or restoring it under the current schema',async t=>{
 const w=workspace(t),run=await w.create(),prefix='lab_'+run+'_',oldDigest='d'.repeat(64),source=JSON.parse(w.sqlite.prepare('SELECT source_json FROM product_lab_run WHERE id=?').get(run).source_json);
 w.sqlite.exec('ALTER TABLE '+prefix+'order_account ADD COLUMN previous_note TEXT; CREATE TABLE '+prefix+'retired_table (key TEXT PRIMARY KEY,value TEXT); CREATE TABLE unrelated_private (value TEXT)');
 w.sqlite.prepare('UPDATE '+prefix+'order_account SET previous_note=?').run('이전 구조 보존');w.sqlite.prepare('INSERT INTO '+prefix+'retired_table VALUES(?,?)').run('old','사라진 테이블 값');w.sqlite.prepare('INSERT INTO unrelated_private VALUES(?)').run('백업에 포함되면 안 됨');
 source.schemaDigest=oldDigest;source.schemaManifest.digest=oldDigest;source.schemaManifest.names.push('retired_table');source.schemaManifest.tables.find(table=>table.name==='order_account').columns.push('previous_note');source.schemaManifest.tables.push({name:'retired_table',columns:['key','value'],primaryKey:['key']});w.sqlite.prepare('UPDATE product_lab_run SET schema_digest=?,source_json=? WHERE id=?').run(oldDigest,JSON.stringify(source),run);
 assert.equal((await w.api('/runs/'+run)).status,200);assert.equal((await w.api('/runs')).body.runs[0].schemaDigest,oldDigest);assert.equal((await w.api('/runs/'+run+'/as/buyer/product/purchases')).body.error,'RUN_SCHEMA_MIGRATION_REQUIRED');
 const backup=await w.api('/runs/'+run+'/snapshots',{label:'이전 구조 백업'});assert.equal(backup.status,200,backup.body.error);const snapshot=await w.api('/snapshots/'+backup.body.snapshot.id);assert.equal(snapshot.body.schemaDigest,oldDigest);assert.deepEqual(snapshot.body.tables.retired_table,[['old','사라진 테이블 값']]);assert.ok(snapshot.body.tables.order_account.every(row=>row.at(-1)==='이전 구조 보존'));assert.equal(snapshot.body.tables.unrelated_private,undefined);
 const before=w.sqlite.prepare('SELECT count(*) n FROM product_lab_run').get().n;const restored=await w.api('/snapshots/'+backup.body.snapshot.id+'/restore',{label:'다른 구조 복원 차단',requestKey:crypto.randomUUID()});assert.equal(restored.status,409);assert.equal(restored.body.error,'SNAPSHOT_SCHEMA_MISMATCH');assert.equal(w.sqlite.prepare('SELECT count(*) n FROM product_lab_run').get().n,before);
 assert.equal((await w.api('/runs/'+run+'/archive',{confirm:'백업 검증'})).status,200);assert.equal((await w.api('/runs/'+run+'/snapshots',{label:'보관 실행 백업'})).status,200);assert.equal(w.productionTouches(),0);
});

test('missing or mismatched historical schema manifests never produce an incomplete or cross-run backup',async t=>{
 const w=workspace(t),run=await w.create(),source=JSON.parse(w.sqlite.prepare('SELECT source_json FROM product_lab_run WHERE id=?').get(run).source_json);
 source.schemaManifest.tables.pop();w.sqlite.prepare('UPDATE product_lab_run SET source_json=? WHERE id=?').run(JSON.stringify(source),run);assert.equal((await w.api('/runs/'+run+'/snapshots',{label:'누락 거부'})).body.error,'BACKUP_SCHEMA_MANIFEST_MISMATCH');
 source.schemaManifest.tables[0].name='x"; SELECT * FROM product_lab_run';w.sqlite.prepare('UPDATE product_lab_run SET source_json=? WHERE id=?').run(JSON.stringify(source),run);assert.equal((await w.api('/runs/'+run+'/snapshots',{label:'잘못된 이름 거부'})).body.error,'RUN_SCHEMA_MANIFEST_INVALID');
 delete source.schemaManifest;w.sqlite.prepare('UPDATE product_lab_run SET schema_digest=?,source_json=? WHERE id=?').run('e'.repeat(64),JSON.stringify(source),run);assert.equal((await w.api('/runs/'+run)).status,200);assert.equal((await w.api('/runs/'+run+'/snapshots',{label:'추정 금지'})).body.error,'RUN_SCHEMA_MANIFEST_UNAVAILABLE');assert.equal(w.sqlite.prepare('SELECT count(*) n FROM product_lab_snapshot').get().n,0);assert.equal(w.productionTouches(),0);
});
