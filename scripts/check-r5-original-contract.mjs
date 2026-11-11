/** Offline fixed-byte contract check. Needs existing private files passed as arguments.
 * Uses synthetic OWNER and provider responses only; no network, browser or real credentials.
 * Does not execute UX HTML/scripts and prints no source/font/cookie/token bytes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {R5_CUSTOMER_PROFILE as p,R5_QA_ENTRY as qa} from '../src/server/qa-r5-customer-profile.mjs';
import {createDriveSourceReader} from '../src/server/qa-drive-source.mjs';
import {documentIdentityKeys,documentSelection} from '../src/server/qa-document-profile.mjs';
import {handleQaRequest} from '../src/server/qa-api.mjs';
import {ownerEnv,ownerSession,driveEnv,origin} from '../tests/helpers/qa-contract-fixtures.mjs';
const [zipPath,customerPath,qaPath]=process.argv.slice(2);
if(!zipPath||!customerPath||!qaPath)throw Error('Usage: node scripts/check-r5-original-contract.mjs PACKAGE CUSTOMER_HTML QA_HTML');
const packageBytes=new Uint8Array(readFileSync(zipPath)),entryBytes=new Uint8Array(readFileSync(customerPath)),qaBytes=readFileSync(qaPath),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(packageBytes),p.package_sha256);assert.equal(sha(entryBytes),p.entrypoint_sha256);assert.equal(sha(qaBytes),qa.entrypoint_sha256);
const html=new TextDecoder('utf-8',{fatal:true}).decode(entryBytes);
assert.equal(html.includes('\r'),false,'Review HTML parser newline normalization before accepting hash inventory');
assert.doesNotMatch(html,/<(?:iframe|form)\b/i);
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const executable=scripts.filter(s=>!/^.*\btype\s*=\s*["']application\/json["']/.test(s[1]));
const csp=s=>'sha256-'+createHash('sha256').update(s).digest('base64');
assert.deepEqual(executable.map(s=>csp(s[2])),p.script_hashes);
assert.deepEqual([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(s=>csp(s[1])),p.style_hashes);
const calls=[];const {env:drive}=driveEnv();const env={...ownerEnv(),...drive};const now=Math.floor(Date.now()/1000);
env.IA_QA_RESEARCH_POLICY_JSON=JSON.stringify({enabled:true,purpose:'FIRST_NATIVE_REVIEW',publication_id:'SYNTHETIC_ORIGINAL_BYTE_CHECK',parent_origin:origin,expires_at:now+600,tuples:[Object.fromEntries(documentIdentityKeys(p).map(k=>[k,p[k]]))]});
const reader=createDriveSourceReader(env,{now:()=>now,fetcher:async(url,opt)=>{
 calls.push({path:url.replace(/^https:\/\/[^/]+/,''),method:opt.method,redirect:opt.redirect});
 if(url==='https://oauth2.googleapis.com/token')return Response.json({token_type:'Bearer',access_token:'OFFLINE_SYNTHETIC_TOKEN',expires_in:900});
 const u=new URL(url),id=u.pathname.split('/').at(-1),pkg=id===p.source_drive_file_id;
 assert.ok(pkg||id===p.standalone_html_drive_id);
 if(u.searchParams.get('alt')==='media')return new Response(pkg?packageBytes:entryBytes,{headers:{'Content-Type':pkg?'application/zip':'text/html'}});
 return Response.json({id,mimeType:pkg?'application/zip':'text/html',size:String(pkg?p.package_bytes:p.entrypoint_bytes),trashed:false,capabilities:{canDownload:true}});
}});
const session=await ownerSession(env,now),selection=new URLSearchParams(documentSelection(p));
const req=(op,cookie,extra={})=>new Request(origin+'/api/ia/qa/'+op+'?'+selection,{headers:{Cookie:cookie,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Dest':op==='document'?'iframe':'empty','Sec-Fetch-Mode':op==='document'?'navigate':'same-origin',...extra}});
const grant=await handleQaRequest(req('research-permit',session.cookie,{'X-IA-CSRF':session.csrf,'X-IA-QA-Intent':'FIRST_NATIVE_REVIEW'}),env,{now});assert.equal(grant.status,200);
const cookie=session.cookie+'; '+grant.headers.get('Set-Cookie').split(';')[0];
const response=await handleQaRequest(req('document',cookie),env,{now,readPrivateArtifact:reader});
assert.equal(response.status,200);const output=new Uint8Array(await response.arrayBuffer());assert.equal(sha(output),p.entrypoint_sha256);assert.deepEqual(output,entryBytes);
assert.equal(response.headers.get('X-QA-Entry-Role'),'customer');assert.equal(response.headers.get('X-QA-Native-State'),'NOT_RUN');
const badPackage=packageBytes.slice();badPackage[badPackage.length-1]^=1;
const denied=await handleQaRequest(req('document',cookie),env,{now,readPrivateArtifact:async()=>({packageBytes:badPackage,entryBytes,baseline:p.baseline_commit})});assert.equal((await denied.json()).error,'HASH_MISMATCH');
const qaResponse=await handleQaRequest(new Request(origin+'/api/ia/qa/document?'+new URLSearchParams({...documentSelection(p),entry_role:'qa'}),{headers:{Cookie:cookie}}),env,{now,readPrivateArtifact:()=>{throw Error('QA_MUST_NOT_READ')}});assert.equal((await qaResponse.json()).error,'ENTRY_ROLE_UNSUPPORTED');
console.log(JSON.stringify({scope:'EXACT_ORIGINAL_BYTES_WITH_SYNTHETIC_OWNER_PROVIDER_NO_NETWORK',package_sha256:sha(packageBytes),customer_sha256:sha(output),qa_sha256:sha(qaBytes),output_bytes:output.length,body_unchanged:true,script_hashes:p.script_hashes,style_hashes:p.style_hashes,provider_calls:calls,synthetic_response_status:response.status,corrupt_package_denied:true,qa_role_denied:true,actual_service_account_read:'NOT_RUN',live_http:'NOT_RUN',native:'NOT_RUN',publication:'HOLD'},null,2));
