/** Node byte/Request-Response validation only. No HTTP server, browser or live credentials. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {R3_DOCUMENT_PROFILES} from '../src/server/qa-r3-document-profile.mjs';
import {createDriveSourceReader,QA_DRIVE_SCOPE} from '../src/server/qa-drive-source.mjs';
import {resolveArtifactTuple} from '../src/server/qa-registry.mjs';
import {issueResearchPermit} from '../src/server/qa-research-permit.mjs';
import {handleQaRequest} from '../src/server/qa-api.mjs';
import {digest} from '../src/server/qa-integrity.mjs';
import {driveEnv,ownerEnv,policy,ownerSession,browserRequest} from '../tests/helpers/qa-contract-fixtures.mjs';
const [zipDir,entryDir,outFile]=process.argv.slice(2);if(!zipDir||!entryDir||!outFile)throw Error('usage: node scripts/check-r3-original-contract.mjs <fixed-zips-dir> <fixed-html-dir> <report.json>');
const results=[];
for(const p of R3_DOCUMENT_PROFILES){
 const zipName=p.mode==='DESIGN_OBSERVER'?'ORDER_DESIGN_QA_MSG0569_R3.zip':'ORDER_COPY_MOTION_MSG0569_R3.zip';
 const packageBytes=new Uint8Array(readFileSync(resolve(zipDir,zipName))),entryBytes=new Uint8Array(readFileSync(resolve(entryDir,basename(p.entrypoint))));
 const sources=new Map([[p.source_drive_file_id,{bytes:packageBytes,mime:'application/zip'}],[p.standalone_html_drive_id,{bytes:entryBytes,mime:'text/html'}]]),requests=[];
 const {env:sourceEnv}=driveEnv();
 const reader=createDriveSourceReader(sourceEnv,{fetcher:async(url,options)=>{
  // Do not record options: they contain a synthetic test assertion/token.
  requests.push({url,method:options.method,redirect:options.redirect,credentials:options.credentials});
  if(url==='https://oauth2.googleapis.com/token')return Response.json({token_type:'Bearer',access_token:'synthetic-test-only',expires_in:300,scope:QA_DRIVE_SCOPE});
  const u=new URL(url),id=u.pathname.split('/').at(-1),source=sources.get(id);assert.ok(source);
  if(u.searchParams.has('fields'))return Response.json({id,mimeType:source.mime,size:String(source.bytes.length),trashed:false,capabilities:{canDownload:true}});
  assert.equal(u.searchParams.get('alt'),'media');return new Response(source.bytes,{headers:{'Content-Type':source.mime}});
 }});
 const started=performance.now(),bundle=await reader({artifact_id:p.artifact_id,version:p.version});
 assert.equal(await digest(bundle.packageBytes),p.package_sha256);assert.equal(await digest(bundle.entryBytes),p.entrypoint_sha256);
 const env=policy(ownerEnv()),session=await ownerSession(env),record=resolveArtifactTuple(p.artifact_id,p.version);
 const grant=await issueResearchPermit(browserRequest('research-permit',p,session.cookie,{'X-IA-QA-Intent':'FIRST_NATIVE_REVIEW','X-IA-CSRF':session.csrf}),env,record);
 const request=browserRequest('document',p,session.cookie+'; '+grant.cookie.split(';')[0]);
 const response=await handleQaRequest(request,env,{readPrivateArtifact:async()=>bundle});assert.equal(response.status,200);
 const returned=new Uint8Array(await response.arrayBuffer());assert.deepEqual(returned,entryBytes);
 assert.equal(response.headers.get('X-QA-Entrypoint-SHA256'),p.entrypoint_sha256);
 assert.equal(response.headers.get('X-QA-Package-SHA256'),p.package_sha256);
 assert.equal(response.headers.get('X-QA-Native-State'),'NOT_RUN');assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 for(const kind of ['package','entry','baseline']){const bad={...bundle};if(kind==='baseline')bad.baseline='0'.repeat(40);else{const key=kind==='package'?'packageBytes':'entryBytes';bad[key]=bundle[key].slice();bad[key][0]^=1}const fail=await handleQaRequest(request,env,{readPrivateArtifact:async()=>bad});assert.equal(fail.status,409)}
 const nativeNow=Date.now;
 try{
  const expired=await handleQaRequest(request,env,{readPrivateArtifact:async()=>{Date.now=()=>nativeNow()+301000;return bundle}});assert.equal(expired.status,403);
 }finally{Date.now=nativeNow}
 results.push({artifact_id:p.artifact_id,version:p.version,package_sha256:await digest(packageBytes),entry_sha256:await digest(returned),entry_bytes:returned.length,zip:bundle.source_evidence.zip,node_response_status:200,body_exact:true,three_corruptions_denied:true,expiry_during_read_denied:true,headers:Object.fromEntries(response.headers),provider:'SYNTHETIC_FETCH_WITH_REAL_FIXED_BYTES',live_principal_verified:false,live_reader_acl_verified:false,native:'NOT_RUN',elapsed_node_ms:Math.round(performance.now()-started),requests});
}
writeFileSync(outFile,JSON.stringify({schema:'order.ia.node-original-contract/1',tested_at:new Date().toISOString(),node:process.version,scope:'NODE_ONLY_NO_SERVER_NO_BROWSER_NO_LIVE_PROVIDER',results},null,2));
console.log(JSON.stringify(results.map(x=>({artifact_id:x.artifact_id,files:x.zip.files,expanded:x.zip.expanded_bytes,body_exact:x.body_exact,native:x.native,elapsed_node_ms:x.elapsed_node_ms})),null,2));
