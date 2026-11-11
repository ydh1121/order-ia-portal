import {QA_REGISTRY_SOURCE} from './qa-registry-data.mjs';
export const QA_MENUS=Object.freeze({
 'design-tokens':Object.freeze({name:'디자인 토큰',subtitle:'디자인 QA',id:'IA-QA-DESIGN-TOKENS',type:'design_qa'}),
 'qa-lab':Object.freeze({name:'QA 연구실',subtitle:'기능·컴포넌트 연구',id:'IA-QA-RESEARCH-LAB',type:'existing_qa'})
});
export class QaError extends Error {
 constructor(code,status=422){super(code);this.name='QaError';this.code=code;this.status=status;}
}
export const SOURCE_NOT_READY='REGISTERED_SOURCE_PREVIEW_BLOCKED';
const sha=/^[a-f0-9]{64}$/,commit=/^[a-f0-9]{40}$/,id=/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;
export const tupleKey=r=>r.artifact_id+'@'+r.version;
const allRecords=s=>[...s.records,...(s.producer_candidates||[])];
export function safeEntry(path){
 return typeof path==='string'&&path.length<=240&&!/^[\/]|[\\\x00-\x1f?#:%]/.test(path)&&path.split('/').every(x=>x&&x!=='.'&&x!=='..');
}
export function safeSourceUrl(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20]/.test(value))return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}
}
export function normalizeSourceRefs(refs){
 if(!Array.isArray(refs))return [];
 const out=[];
 for(const item of refs){
  const r=typeof item==='string'?(safeSourceUrl(item)?{url:item}:{path:item}):item;
  if(!r||typeof r!=='object'||Array.isArray(r))continue;
  const url=safeSourceUrl(r.url),path=safeEntry(r.path)?r.path:null;
  if(!url&&!path)continue;
  const entry={url,path,role:typeof r.role==='string'?r.role.slice(0,240):'source_reference'};
  if(typeof r.id==='string')entry.id=r.id.slice(0,120);
  if(sha.test(r.sha256||''))entry.sha256=r.sha256;
  out.push(entry); // Do not drop distinct evidence roles sharing a URL.
 }
 return out;
}
export function validateRegistry(source){
 if(source?.schema!=='order.ia.qa-catalogue/1'||!Array.isArray(source.records)||!Array.isArray(source.producer_candidates||[])||!Array.isArray(source.version_families||[]))throw new QaError('REGISTRY_INVALID');
 const records=allRecords(source),seen=new Map();
 for(const r of records){
  if(!r||!id.test(r.artifact_id||'')||!id.test(r.version||'')||seen.has(tupleKey(r))||!sha.test(r.package_sha256||'')||!commit.test(r.baseline_commit||'')||!safeEntry(r.entrypoint)||!['design_qa','existing_qa'].includes(r.artifact_type))throw new QaError('REGISTRY_INVALID');
  const url=safeSourceUrl(r.source_url);let u;try{u=new URL(url)}catch{throw new QaError('REGISTRY_INVALID')}
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(r.source_drive_file_id||'')||u.origin!=='https://drive.google.com'||u.pathname!==`/file/d/${r.source_drive_file_id}/view`||[...u.searchParams].some(([k,v])=>k!=='usp'||v!=='drivesdk')||u.hash)throw new QaError('REGISTRY_INVALID');
  if(r.entrypoint_sha256&&!sha.test(r.entrypoint_sha256))throw new QaError('REGISTRY_INVALID');
  const size=r.size_bytes??r.package_bytes,entrySize=r.entrypoint_bytes??r.size_bytes;
  if(!Number.isSafeInteger(size)||size<=0||size>32*1024*1024||!Number.isSafeInteger(entrySize)||entrySize<=0||entrySize>8*1024*1024)throw new QaError('REGISTRY_INVALID');
  if(r.preview_allowed!==false||r.selected_version!==null||r.integrated_version!==null||r.latest_verified_browser!=null)throw new QaError('REGISTRY_ACTIVATION_NOT_AUTHORIZED');
  seen.set(tupleKey(r),r);
 }
 for(const r of records){
  // Legacy same-artifact pointers, when supplied, still have to resolve exactly.
  for(const field of ['latest_version','selected_version','integrated_version'])if(r[field]!=null&&!seen.has(r.artifact_id+'@'+r[field]))throw new QaError('REGISTRY_POINTER_INVALID');
 }
 const members=new Set(),families=new Set();
 for(const f of source.version_families||[]){
  if(!id.test(f.family_id||'')||families.has(f.family_id)||!Object.hasOwn(QA_MENUS,f.menu)||!Array.isArray(f.versions)||!f.versions.length||f.selected!==null||f.integrated!==null||f.latest_verified_browser!==null)throw new QaError('REGISTRY_POINTER_INVALID');
  families.add(f.family_id);
  const own=new Set();
  for(const t of f.versions){const key=tupleKey(t),r=seen.get(key);if(!r||members.has(key)||r.artifact_type!==QA_MENUS[f.menu].type)throw new QaError('REGISTRY_POINTER_INVALID');members.add(key);own.add(key)}
  for(const t of [f.latest_produced,...Object.values(f.latest_verified_by_scope||{})])if(t!==null&&!own.has(tupleKey(t)))throw new QaError('REGISTRY_POINTER_INVALID');
 }
 for(const r of source.records)if(!members.has(tupleKey(r)))throw new QaError('REGISTRY_POINTER_INVALID');
 for(const r of source.producer_candidates||[])if(!families.has(r.family_id)||r.registered_by_ia!==false||!/^PRODUCER_DELIVERED/.test(r.registration_status||'')||r.artifact_type!==QA_MENUS[source.version_families.find(f=>f.family_id===r.family_id).menu].type)throw new QaError('REGISTRY_POINTER_INVALID');
 for(const [key,o] of Object.entries(source.current_view_overlays||{}))if(!seen.has(key)||o.preview_allowed!==false||o.selected_version!==null||o.integrated_version!==null||o.latest_verified_browser!=null)throw new QaError('REGISTRY_ACTIVATION_NOT_AUTHORIZED');
 return source;
}
validateRegistry(QA_REGISTRY_SOURCE);
const familyOf=r=>QA_REGISTRY_SOURCE.version_families.find(f=>f.family_id===r.family_id||f.versions.some(t=>tupleKey(t)===tupleKey(r)));
export function recordView(r){
 const family=familyOf(r);if(!family)throw new QaError('REGISTRY_POINTER_INVALID');
 const candidates=(QA_REGISTRY_SOURCE.producer_candidates||[]).filter(x=>x.family_id===family.family_id);
 const versions=[...family.versions.map(t=>({...t,registration:'REGISTERED'})),...candidates.map(t=>({artifact_id:t.artifact_id,version:t.version,registration:'RECEIVED_PENDING_PLANNING'}))];
 const overlay=QA_REGISTRY_SOURCE.current_view_overlays?.[tupleKey(r)]||r.ia_review_overlay||{};
 const candidate=candidates.some(x=>tupleKey(x)===tupleKey(r));
 const title=family.family_id==='MASTER-ASTRA-0549-LAB'?'기존 QA 연구실':family.family_id==='ORDER-DESIGN-QA'?'회사별 디자인 비교':'화면 카피·모션 부품';
 const latest=family.latest_produced;
 return {
  artifact_id:r.artifact_id,version:r.version,entry_role:r.entry_role||null,customer_document:r.customer_document||null,entry_roles:r.entry_roles||null,qa_tool_support:r.qa_tool_support||null,family_id:family.family_id,artifact_type:r.artifact_type,artifact_subtype:r.artifact_subtype||null,
  title,purpose:family.family_id==='ORDER-DESIGN-QA'?'원본 · IBM · Linear · Vercel':family.family_id==='ORDER-COPY-MOTION'?'엔진 독립 카피·모션':'기능·컴포넌트',change_summary:r.change_summary||'별도 고정 버전으로 받은 제작 후보입니다.',source_change_summary:r.change_summary||null,
  creator:r.original_producer||r.owner_track,administrator:r.catalogue_owner_track||r.owner_track,
  source_url:r.source_url,source_refs:normalizeSourceRefs(r.source_refs),source_ref_count:normalizeSourceRefs(r.source_refs).length,
  package_sha256:r.package_sha256,package_bytes:r.size_bytes??r.package_bytes,entrypoint:r.entrypoint,entrypoint_sha256:r.entrypoint_sha256||r.package_sha256,entrypoint_bytes:r.entrypoint_bytes??r.size_bytes,
  baseline_commit:r.baseline_commit,build_id:r.build_id||null,created_at:r.created_at,versions,
  latest_version:latest.version,latest_produced:latest,latest_received:candidates.length?{artifact_id:candidates.at(-1).artifact_id,version:candidates.at(-1).version}:latest,
  selected_version:family.selected,integrated_version:family.integrated,latest_verified_browser:null,
  preview_allowed:false,review_status:overlay.review_status||r.review_status||'SOURCE_ARCHIVED',research_status:r.research_status||r.review_status||'SOURCE_REVIEW_PENDING',
  registration_status:candidate?'RECEIVED_PENDING_PLANNING':r.registration_status,producer_registration_status:r.registration_status,
  validation:r.validation||{},validation_note:r.validation_note||'검사는 제작자·등록자별 범위이며 실제 브라우저나 사용자 수락과 별개입니다.',
  preview_block_reason:overlay.review_status==='REWORK_REQUESTED'?'재작업 요청으로 이 버전의 실행을 보류합니다.':'비공개 원본 연결과 격리·실제 부팅 검증이 끝나지 않았습니다.',
  R2:versions.some(t=>t.version==='R2')?'RECEIVED':null,render_limits:r.render_limits||[],
  fixture_contract:family.family_id==='ORDER-DESIGN-QA'?'같은 원본·데이터·화면 폭에서 비교합니다. 회사 전환은 패키지 소유이며 스타일 초기화와 데이터 초기화는 다릅니다.':family.family_id==='ORDER-COPY-MOTION'?'엔진 독립 표시 예제입니다. 표시 계약은 제품 엔진·외부 ready 규약이나 서버 취소 구현의 근거가 아닙니다.':'기존 기능·컴포넌트 연구 원본의 고정 입력과 검사 범위를 따릅니다.',
  source_state:SOURCE_NOT_READY,history_note:family.family_id==='MASTER-ASTRA-0549-LAB'?'MASTER/Astra 과거 R2~R7 원본 미확보 항목은 현재 파일로 대체하지 않습니다.':'이 자료의 고정 버전: '+versions.map(t=>t.version+(t.registration==='RECEIVED_PENDING_PLANNING'?' (접수 후보)':'')).join(', ')+'. 서로 다른 artifact_id와 해시를 보존합니다.',
  snapshot_hash:'UNKNOWN',viewer_state:'PREVIEW_BLOCKED',permanent_note_write:false,
  outer_host_contract:r.outer_host_contract||null,
  display_host_contract:r.display_host_contract||null,
  viewer_mode:r.artifact_id==='ORDER-DESIGN-QA-0569-R3'&&r.version==='R3'?'DESIGN_OBSERVER':family.family_id==='ORDER-COPY-MOTION'?'DISPLAY_ONLY':'UNSUPPORTED',
  company_control_available:family.family_id==='ORDER-DESIGN-QA',
  external_ready_contract:r.artifact_id==='ORDER-DESIGN-QA-0569-R3'&&r.version==='R3'&&r.outer_host_contract?.revision==='ux-r3-observer-1'
 };
}
export function catalogue(menu){
 if(!Object.hasOwn(QA_MENUS,menu))throw new QaError('INVALID_MENU',400);
 return allRecords(QA_REGISTRY_SOURCE).filter(r=>r.artifact_type===QA_MENUS[menu].type).map(recordView);
}
export function resolveRecord(menu,artifactId,version,baseline){
 if(!Object.hasOwn(QA_MENUS,menu))throw new QaError('INVALID_MENU',400);
 const r=allRecords(QA_REGISTRY_SOURCE).find(r=>r.artifact_id===artifactId&&r.version===version&&r.artifact_type===QA_MENUS[menu].type);
 if(!r)throw new QaError('MISSING_FILE',404);
 if(baseline&&baseline!==r.baseline_commit)throw new QaError('BASELINE_MISMATCH',409);
 return r;
}
/** Tuple-only private source selection; menu, Drive ID and baseline are resolved server-side. */
export function resolveArtifactTuple(artifactId,version){
 const r=allRecords(QA_REGISTRY_SOURCE).find(r=>r.artifact_id===artifactId&&r.version===version);
 if(!r)throw new QaError('MISSING_FILE',404);
 return r;
}
export function previewDecision(record){return {allowed:false,code:recordView(record).review_status==='REWORK_REQUESTED'?'REWORK_REQUESTED':'UNSUPPORTED_PREVIEW',state:'PREVIEW_BLOCKED'};}
