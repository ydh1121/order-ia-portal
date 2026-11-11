/** Server-only fixed-byte R3 preparation. Serving requires the separate OWNER research route. */
import {R3_DOCUMENT_PROFILES} from './qa-r3-document-profile.mjs';
import {QaError} from './qa-registry.mjs';
import {verifyBundle} from './qa-integrity.mjs';
import {driveSourceState} from './qa-drive-source.mjs';
import {researchPolicyState} from './qa-research-permit.mjs';
export const R3_PARENT_ORIGIN='https://order-ia-portal.pages.dev';
export function r3Profile(record){
 const p=R3_DOCUMENT_PROFILES.find(p=>p.artifact_id===record?.artifact_id&&p.version===record?.version);
 if(!p)throw new QaError('UNSUPPORTED_PREVIEW',409);
 for(const k of ['source_drive_file_id','package_sha256','entrypoint','entrypoint_sha256','baseline_commit'])if(record[k]!==p[k])throw new QaError('BASELINE_MISMATCH',409);
 if((record.package_bytes??record.size_bytes)!==p.package_bytes||record.entrypoint_bytes!==p.entrypoint_bytes)throw new QaError('RESOURCE_INVALID');
 return p;
}
export function r3HostContract(record){
 const p=r3Profile(record);
 if(p.mode==='DISPLAY_ONLY')return {mode:'DISPLAY_ONLY',schema:null,revision:null,parent_origin:R3_PARENT_ORIGIN,preset_control:false,ready_contract:false,company_control_owner:null,engine_connected:false};
 const c=record.outer_host_contract;
 if(c?.schema!=='order.ia.viewer/1'||c.revision!=='ux-r3-observer-1'||c.parent_origin!==R3_PARENT_ORIGIN||c.preset_control!==false)throw new QaError('UNSUPPORTED_PREVIEW',409);
 return {mode:'DESIGN_OBSERVER',schema:c.schema,revision:c.revision,parent_origin:c.parent_origin,preset_control:false,ready_contract:true,company_control_owner:'PACKAGE_BUTTONS',engine_connected:false};
}
export function r3DocumentHeaders(record){
 const p=r3Profile(record),scripts=p.script_hashes.map(x=>"'"+x+"'").join(' ')+(p.allow_data_modules?' data:':'');
 // Normal HTTP document candidate, not srcdoc/HTML injection. Hashes include unchanged
 // nested-template executable scripts/importmap; variable initial JSON is not executable.
 const csp="default-src 'none'; sandbox allow-scripts; script-src "+scripts+"; script-src-attr 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; worker-src 'none'; frame-src "+(p.mode==='DESIGN_OBSERVER'?'about: data: blob:':"'none'")+"; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors "+R3_PARENT_ORIGIN;
 return {'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','X-Robots-Tag':'noindex, nofollow, noarchive','X-QA-Artifact':p.artifact_id,'X-QA-Version':p.version,'X-QA-Package-SHA256':p.package_sha256,'X-QA-Entrypoint-SHA256':p.entrypoint_sha256,'X-QA-Baseline':p.baseline_commit};
}
export async function prepareR3Document(record,bundle){
 const p=r3Profile(record),host=r3HostContract(record);
 if(!(bundle?.packageBytes instanceof Uint8Array)||!(bundle?.entryBytes instanceof Uint8Array))throw new QaError('MISSING_FILE',404);
 if(bundle.packageBytes.byteLength>32*1024*1024||bundle.entryBytes.byteLength>8*1024*1024)throw new QaError('RESOURCE_INVALID');
 const snapshot={packageBytes:bundle.packageBytes.slice(),entryBytes:bundle.entryBytes.slice(),baseline:bundle.baseline};
 const verification=await verifyBundle(record,snapshot);
 // This preparation helper returns unchanged bytes, not an HTTP Response.
 // qa-document.mjs separately enforces OWNER + the disabled-by-default research permit.
 // Real principal access, publication and nested browser enforcement remain unverified.
 return Object.freeze({identity:Object.freeze({artifact_id:p.artifact_id,version:p.version,package_sha256:p.package_sha256,entrypoint_sha256:p.entrypoint_sha256,baseline_commit:p.baseline_commit,entrypoint:p.entrypoint}),bytes:snapshot.entryBytes,headers:Object.freeze(r3DocumentHeaders(record)),host:Object.freeze(host),verification,transport:'HTTP_DOCUMENT_PREPARED_NOT_BOUND',actual_execution_url:null,preview_allowed:false,native:'NOT_RUN'});
}
export function r3RuntimeReadiness(record,env={}){
 const p=r3Profile(record),host=r3HostContract(record),source=driveSourceState(env),research=researchPolicyState(record,env);
 const blockers=[];
 if(!source.configured)blockers.push({code:source.reason||'PRIVATE_SOURCE_UNAVAILABLE',owner:'IA_PORTAL_IMPLEMENTATION_AND_ACCOUNT_OWNER'});
 blockers.push({code:'SOURCE_PERMISSION_AND_BYTES_UNVERIFIED',owner:'IA_PORTAL_IMPLEMENTATION'});
 if(!research.enabled)blockers.push({code:research.code,owner:'MASTER_PLANNING_SUCCESSOR'});
 blockers.push({code:'NESTED_BROWSER_ISOLATION_NOT_VERIFIED',owner:'IA_PORTAL_IMPLEMENTATION'},{code:'NATIVE_REVIEW_NOT_RUN',owner:'UIUX_SUCCESSOR'});
 return {schema:'order.ia.runtime-readiness/1',artifact_id:p.artifact_id,version:p.version,entrypoint:p.entrypoint,package_sha256:p.package_sha256,entrypoint_sha256:p.entrypoint_sha256,baseline_commit:p.baseline_commit,host,source,research,transport:'OWNER_HTTP_DOCUMENT_GATED',actual_execution_url:null,normal_opening_procedure:null,preview_allowed:false,native:'NOT_RUN',selected:null,integrated:null,blockers};
}
