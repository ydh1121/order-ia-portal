/** Shared exact document selection. R3 compatibility is retained; no version or entry fallback. */
import {R3_DOCUMENT_PROFILES} from './qa-r3-document-profile.mjs';
import {R5_CUSTOMER_PROFILE} from './qa-r5-customer-profile.mjs';
import {QaError} from './qa-registry.mjs';
export const DOCUMENT_PROFILES=Object.freeze([...R3_DOCUMENT_PROFILES,R5_CUSTOMER_PROFILE]);
export const isR5=record=>record?.artifact_id===R5_CUSTOMER_PROFILE.artifact_id&&record?.version==='R5';
export const documentIdentityKeys=record=>['artifact_id','version','package_sha256','entrypoint_sha256','baseline_commit',...(isR5(record)?['entry_role','entrypoint']:[])];
export const documentSelection=record=>({artifact_id:record.artifact_id,version:record.version,...(isR5(record)?{entry_role:record.entry_role}:{})});
export function selectDocumentRecord(record,role=null){
 if(isR5(record)){
  if(role==='qa')throw new QaError('ENTRY_ROLE_UNSUPPORTED',409);
  if(role!=='customer')throw new QaError('ENTRY_ROLE_REQUIRED',400);
  // The record is server-resolved, not a caller-controlled source ID or hash.
  if(record.package_sha256!==R5_CUSTOMER_PROFILE.package_sha256||record.baseline_commit!==R5_CUSTOMER_PROFILE.baseline_commit)throw new QaError('BASELINE_MISMATCH',409);
  return R5_CUSTOMER_PROFILE;
 }
 if(role!==null)throw new QaError('INVALID_REQUEST',400);
 return record;
}
export function exactDocumentProfile(record){
 const p=DOCUMENT_PROFILES.find(x=>x.artifact_id===record?.artifact_id&&x.version===record?.version&&(x.entry_role??null)===(record?.entry_role??null));
 if(!p)throw new QaError('UNSUPPORTED_PREVIEW',409);
 for(const key of ['source_drive_file_id','standalone_html_drive_id','package_sha256','entrypoint','entrypoint_sha256','baseline_commit'])if(record[key]!==p[key])throw new QaError('BASELINE_MISMATCH',409);
 if((record.package_bytes??record.size_bytes)!==p.package_bytes||record.entrypoint_bytes!==p.entrypoint_bytes)throw new QaError('RESOURCE_INVALID');
 return p;
}
