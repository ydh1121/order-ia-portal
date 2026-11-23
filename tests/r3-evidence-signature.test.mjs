import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {handleR3Evidence,inspectPacket,packetType} from '../src/server/r3-evidence.mjs';
import {evidenceSignatureBinding} from '../src/server/evidence-signature.mjs';
import {createEvidenceEditor} from '../src/server/r3-evidence-client.mjs';
import {signedEvidencePacket} from './r3-evidence-signature.fixture.mjs';

function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const name of ['0003_r3_roles','0004_r3_evidence','0017_product_operations'])sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO r3_membership VALUES('buyer','BUYER','store','one',1),('same-site','BUYER','store','one',1),('other','BUYER','elsewhere','two',1),('operator','OPERATOR','store','',1)");
 for(const id of ['case-a','case-b'])sql.prepare("INSERT INTO r3_case(id,kind,org_id,site_id,state,revision,created_by,updated_at) VALUES(?,'reprice','store','one','DRAFT',1,'buyer','2026-11-21')").run(id);
 const prepare=(query,params=[])=>({query,params,bind:(...values)=>prepare(query,values),first:async()=>sql.prepare(query).get(...params),all:async()=>({results:sql.prepare(query).all(...params)})});
 const db={prepare,async batch(commands){sql.exec('BEGIN');try{for(const command of commands)sql.prepare(command.query).run(...command.params);sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const objects=new Map(),bucket={put:async(key,bytes)=>objects.set(key,new Uint8Array(bytes)),get:async key=>objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null,delete:async key=>objects.delete(key)};
 const env={ORDER_QA_DB:db,ORDER_PRIVATE_EVIDENCE:bucket};
 const post=(bytes,header,{actor='buyer',caseId='case-a',key='upload',extra={}}={})=>handleR3Evidence({request:new Request('https://ia.test/api/ia/r3-role/evidence?caseId='+caseId,{method:'POST',headers:{'Content-Type':packetType,Origin:'https://ia.test','X-IA-CSRF':'csrf','Idempotency-Key':key,...(header===undefined?{}:{'X-Order-Submission':typeof header==='string'?header:JSON.stringify(header)}),...extra},body:bytes}),env,actor:{id:actor,csrf:'csrf'}});
 const get=(id,{actor='buyer',caseId='case-a',binding=false}={})=>handleR3Evidence({request:new Request('https://ia.test/api/ia/r3-role/evidence?caseId='+caseId+'&id='+id+(binding?'&binding=1':'')),env,actor:{id:actor}});
 const counts=()=>({receipts:sql.prepare('SELECT count(*) n FROM r3_evidence_receipt').get().n,objects:sql.prepare('SELECT count(*) n FROM r3_evidence_object').get().n,signatures:sql.prepare("SELECT count(*) n FROM order_operation WHERE kind='evidence-signature'").get().n,blobs:objects.size});
 return {sql,db,objects,post,get,counts};
}

test('signed evidence binds exact document/signature/packet pixels to server actor and case, with private readback and idempotency',async t=>{
 const f=fixture(t),signed=await signedEvidencePacket(),saved=await f.post(signed.bytes,signed.header);assert.equal(saved.status,200,await saved.clone().text());const receipt=await saved.json();assert.equal(receipt.signatureBound,true);assert.equal(receipt.pages,2);
 const stored=f.sql.prepare("SELECT created_by,org_id,site_id,state,data_json FROM order_operation WHERE kind='evidence-signature' AND id=?").get(receipt.evidenceId),binding=JSON.parse(stored.data_json);
 assert.equal(stored.created_by,'buyer');assert.equal(stored.org_id,'store');assert.equal(stored.site_id,'one');assert.equal(stored.state,'SIGNED');
 assert.equal(binding.actorId,'buyer');assert.equal(binding.caseId,'case-a');assert.equal(binding.evidenceId,receipt.evidenceId);assert.equal(binding.documentDigest,signed.header.documentDigest);assert.equal(binding.signatureDigest,signed.header.signatureDigest);assert.equal(binding.packetDigest,signed.packetDigest);assert.equal(binding.documentPages,1);assert.ok(binding.signedAt);
 const retry=await f.post(signed.bytes,signed.header);assert.equal(retry.status,200);assert.equal((await retry.json()).evidenceId,receipt.evidenceId);assert.deepEqual(f.counts(),{receipts:1,objects:1,signatures:1,blobs:1});
 const metadata=await f.get(receipt.evidenceId,{binding:true,actor:'operator'});assert.equal(metadata.status,200);assert.match(metadata.headers.get('Cache-Control'),/private, no-store/);assert.deepEqual((await metadata.json()).binding,binding);
 const raw=await f.get(receipt.evidenceId,{actor:'operator'});assert.deepEqual(new Uint8Array(await raw.arrayBuffer()),signed.bytes);assert.equal((await f.get(receipt.evidenceId,{actor:'other',binding:true})).status,404);assert.equal((await f.get(receipt.evidenceId,{caseId:'case-b',binding:true})).status,404);
 assert.equal((await f.post(signed.bytes,signed.header,{caseId:'case-b'})).status,409);assert.deepEqual(f.counts(),{receipts:1,objects:1,signatures:1,blobs:1});
});

test('missing consent, malformed headers, swapped pixels and invalid signature page produce no receipt or stored blob',async t=>{
 const f=fixture(t),signed=await signedEvidencePacket(),blank=await signedEvidencePacket({signatureInk:false});
 const changedDocument=signed.bytes.slice();changedDocument[10]^=1;const changedSignature=signed.bytes.slice();changedSignature[changedSignature.length-1]^=1;
 const wrongSize=signed.bytes.slice();new DataView(wrongSize.buffer).setUint16(signed.document.length,100);new DataView(wrongSize.buffer).setUint16(signed.document.length+2,360);
 const cases=[['no header',signed.bytes,undefined],['no signature page',signed.document,signed.header],['blank signature',blank.bytes,blank.header],['document pixels swapped',changedDocument,signed.header],['signature pixels swapped',changedSignature,signed.header],['signature dimensions',wrongSize,signed.header],['wrong consent',signed.bytes,{...signed.header,consentVersion:'different'}],['foreign actor claim',signed.bytes,{...signed.header,actorId:'operator'}],['foreign case claim',signed.bytes,{...signed.header,caseId:'case-b'}],['null header',signed.bytes,'null'],['array header',signed.bytes,'[]'],['bad JSON',signed.bytes,'{']];
 for(const [label,bytes,header]of cases){const response=await f.post(bytes,header,{key:label.replaceAll(' ','-')});assert.equal(response.status,422,label+' '+await response.clone().text());assert.equal((await response.json()).error,'SIGNATURE_BINDING_REQUIRED',label);assert.deepEqual(f.counts(),{receipts:0,objects:0,signatures:0,blobs:0},label);}
 assert.equal((await f.post(signed.bytes,signed.header,{actor:'other'})).status,403);assert.equal((await f.post(signed.bytes,signed.header,{extra:{Origin:'https://elsewhere.test'}})).status,403);assert.deepEqual(f.counts(),{receipts:0,objects:0,signatures:0,blobs:0});
});

test('an attestation database failure rolls the receipt and object locator back and removes only the uncommitted blob',async t=>{
 const f=fixture(t),signed=await signedEvidencePacket();f.sql.exec("CREATE TRIGGER fail_attestation BEFORE INSERT ON order_operation WHEN NEW.kind='evidence-signature' BEGIN SELECT RAISE(ABORT,'attestation write failed'); END");
 const response=await f.post(signed.bytes,signed.header);assert.equal(response.status,503);assert.equal((await response.json()).error,'SAVE_UNAVAILABLE');assert.equal(f.sql.prepare('SELECT count(*) n FROM r3_evidence_receipt').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM r3_evidence_object').get().n,0);assert.equal(f.objects.size,0);
});

test('legacy evidence remains readable and retry cannot invent its missing stored signature binding',async t=>{
 const f=fixture(t),signed=await signedEvidencePacket();f.sql.prepare('INSERT INTO r3_evidence_receipt VALUES(?,?,?,?,?)').run('legacy','store','one','reprice','MASKED_SCANNED');
 f.sql.prepare('INSERT INTO r3_evidence_object VALUES(?,?,?,?,?,?,?,?)').run('legacy','case-a','buyer','old-upload',signed.packetDigest,'legacy/object',2,'2026-11-20');f.objects.set('legacy/object',signed.bytes.slice());
 const read=await f.get('legacy');assert.equal(read.status,200);assert.deepEqual(new Uint8Array(await read.arrayBuffer()),signed.bytes);
 const meta=await f.get('legacy',{binding:true});assert.equal(meta.status,404);assert.equal((await meta.json()).error,'LEGACY_SIGNATURE_BINDING_UNAVAILABLE');
 const retry=await f.post(signed.bytes,signed.header,{key:'old-upload'}),body=await retry.json();assert.notEqual(body.signatureBound,true,'client-supplied hashes cannot create historical consent');assert.equal(retry.status,409);assert.equal(body.error,'LEGACY_SIGNATURE_BINDING_UNAVAILABLE');assert.deepEqual(f.counts(),{receipts:1,objects:1,signatures:0,blobs:1});
});

test('signature parser returns server identity only and enforces the ink boundary independently of header digests',async()=>{
 const signed=await signedEvidencePacket(),pages=inspectPacket(signed.bytes),binding=await evidenceSignatureBinding(signed.bytes,pages,JSON.stringify(signed.header),{actorId:'server-actor',caseId:'server-case'});
 assert.equal(binding.actorId,'server-actor');assert.equal(binding.caseId,'server-case');assert.equal(binding.packetDigest,signed.packetDigest);
 const filled=await signedEvidencePacket({signatureInk:false});filled.signature.fill(0,4);filled.bytes.set(filled.signature,filled.document.length);filled.header.signatureDigest=Buffer.from(await crypto.subtle.digest('SHA-256',filled.signature)).toString('hex');
 assert.equal(await evidenceSignatureBinding(filled.bytes,inspectPacket(filled.bytes),JSON.stringify(filled.header),{actorId:'server-actor',caseId:'server-case'}),null);
});

test('actual editor sends the final signed pixels and keeps the same sealed packet on failure and the receipt on linking retry',async t=>{
 const f=fixture(t),{JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
 const dom=new JSDOM('<main id="editor"></main>',{url:'https://ia.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 Object.defineProperty(w.crypto,'subtle',{value:crypto.subtle});w.crypto.randomUUID=()=>crypto.randomUUID();
 const pixels=new WeakMap();w.createImageBitmap=async()=>({width:1,height:1,close(){}});
 w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {fillStyle:'#fff',font:'',fillRect(){const data=new Uint8ClampedArray(canvas.width*canvas.height*4).fill(255);pixels.set(canvas,data);},drawImage(){pixels.set(canvas,Uint8ClampedArray.from([120,80,40,255]));},fillText(){const data=pixels.get(canvas);for(let i=0;i<80;i++){const offset=((20+i%30)*canvas.width+10+i)*4;data[offset]=data[offset+1]=data[offset+2]=20;}},getImageData(){return {data:pixels.get(canvas).slice()};}};};
 const calls=[],errors=[];let links=0,receipt;
 const editor=w.eval('('+createEvidenceEditor.toString()+')'),container=w.document.querySelector('main');
 const dispose=editor({container,caseId:'case-a',kind:'reprice',csrf:'csrf',onError:message=>errors.push(message),onReceipt:async id=>{links++;receipt=id;return links===2;},fetcher:async(url,options)=>{
  calls.push({url,headers:{...options.headers},body:new Uint8Array(options.body)});
  if(calls.length===1)return Response.json({error:'TEMPORARY_FAILURE'},{status:503});
  return f.post(options.body,options.headers['X-Order-Submission'],{key:options.headers['Idempotency-Key']});
 }});t.after(dispose);
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'),file=container.querySelector('input[type=file]');
 Object.defineProperty(file,'files',{value:[{type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]});await file.onchange();
 const typed=container.querySelector('input:not([type])');typed.value='검증용 서명';typed.oninput();container.querySelector('input[type=checkbox]').checked=true;
 const save=[...container.querySelectorAll('button')].find(button=>button.textContent==='가림 처리본 제출');
 await save.onclick();assert.equal(errors.length,1);assert.equal(calls.length,1);assert.deepEqual(f.counts(),{receipts:0,objects:0,signatures:0,blobs:0});
 await save.onclick();assert.equal(calls.length,2);assert.equal(links,1);assert.ok(receipt);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(calls[0].headers['X-Order-Submission'],calls[1].headers['X-Order-Submission']);assert.deepEqual(calls[0].body,calls[1].body);
 const pages=inspectPacket(calls[1].body),header=JSON.parse(calls[1].headers['X-Order-Submission']);assert.equal(pages.length,2);assert.deepEqual([pages[1].width,pages[1].height],[360,100]);assert.equal(header.consentVersion,'masked-evidence-v1');
 const binding=JSON.parse(f.sql.prepare("SELECT data_json FROM order_operation WHERE kind='evidence-signature' AND id=?").get(receipt).data_json);assert.equal(binding.documentDigest,header.documentDigest);assert.equal(binding.signatureDigest,header.signatureDigest);
 await save.onclick();assert.equal(calls.length,2,'link retry must not upload pixels again');assert.equal(links,2);assert.deepEqual(f.counts(),{receipts:1,objects:1,signatures:1,blobs:1});
});
