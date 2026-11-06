/** Serialized into the OWNER-only response. No private package bytes, storage or write API. */
export function qaClient(runtime){
 'use strict';
 runtime=runtime||{};
 const $=id=>document.getElementById(id),state={menu:document.body.dataset.menu,records:[],selected:null,draft:'',dirty:false,request:0,abort:null,viewer:null};
 const text=(tag,content,cls='')=>{const e=document.createElement(tag);e.textContent=content;if(cls)e.className=cls;return e};
 const labels={EMPTY:'등록된 자료가 없습니다.',LOADING:'등록 자료를 읽고 있습니다.',DENIED:'이 자료를 볼 권한이 없습니다.',MISSING_FILE:'원본 미확보',HASH_MISMATCH:'원본 해시가 등록값과 다릅니다.',BASELINE_MISMATCH:'비교 기준 버전이 다릅니다.',NETWORK_ERROR:'자료를 불러오지 못했습니다.',UNSUPPORTED_PREVIEW:'이 환경에서는 실행을 지원하지 않습니다.',PRIVATE_SOURCE_UNAVAILABLE:'인증된 원본 조회 경로가 아직 연결되지 않았습니다.',REWORK_REQUESTED:'재작업 요청 · 실행 보류',RESOURCE_INVALID:'원본 자원 또는 압축 구조를 검증하지 못했습니다.',INVALID_REQUEST:'잘못된 자료 요청입니다.',INVALID_MENU:'등록되지 않은 메뉴입니다.'};
 const role=r=>({MASTER_PLANNING_SUCCESSOR:'총괄 기획',UIUX_SUCCESSOR:'UX/UI',ASTRA_ENGINE_EXECUTION:'Astra 실행'}[r]||r);
 const errorCode=e=>Object.hasOwn(labels,e?.code)?e.code:'NETWORK_ERROR';
 function announce(code,extra=''){$('state').dataset.state=code;$('state').textContent=(labels[code]||code)+(extra?' '+extra:'');}
 function param(values){return new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null)).toString();}
 async function api(operation,values,signal){
  let res;try{res=await fetch('/api/ia/qa/'+operation+'?'+param({menu:state.menu,...values}),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal});}catch(e){if(e.name==='AbortError')throw e;throw {code:'NETWORK_ERROR'}}
  let d;try{d=await res.json()}catch{throw {code:'NETWORK_ERROR'}}
  if(!res.ok)throw {code:res.status===403?'DENIED':d.error};return d;
 }
 function pair(label,value,{code=false}={}){const row=text('div','','meta-row');row.append(text('dt',label),text('dd',value===null||value===undefined?'미설정':String(value),code?'mono':''));return row;}
 const pointer=v=>v===null?'없음':v;
 function statusChip(r){return text('span',r.review_status==='REWORK_REQUESTED'?'재작업 요청':'원본 보관',r.review_status==='REWORK_REQUESTED'?'chip warning':'chip');}
 function renderList(){
  const q=$('search').value.trim().toLocaleLowerCase('ko-KR');const filtered=state.records.filter(r=>[r.title,r.purpose,r.version,r.creator,r.administrator].join(' ').toLocaleLowerCase('ko-KR').includes(q));
  $('catalogue').replaceChildren();$('list-count').textContent=filtered.length+'개 자료';
  if(!filtered.length){$('catalogue').append(text('p',state.records.length?'검색 조건에 맞는 자료가 없습니다.':labels.EMPTY,'empty'));return;}
  for(const r of filtered){const btn=document.createElement('button');btn.type='button';btn.className='artifact';btn.dataset.artifact=r.artifact_id;btn.setAttribute('aria-pressed',String(state.selected?.artifact_id===r.artifact_id&&state.selected?.version===r.version));btn.append(text('strong',r.title),text('span',r.purpose,'muted'),statusChip(r),text('small',(r.artifact_type==='design_qa'?'디자인 QA':'기능·컴포넌트 연구')+' · '+r.version),text('small','제작 '+role(r.creator)+' / 관리 '+role(r.administrator)),text('small','기준 '+r.baseline_commit.slice(0,12)+' · '+r.created_at.slice(0,10)),text('small','최신 '+r.latest_version+' · 선택 '+pointer(r.selected_version)+' · 통합 '+pointer(r.integrated_version)));btn.addEventListener('click',()=>choose(r.artifact_id,r.version));$('catalogue').append(btn);}
 }
 function makeOriginalLink(url){const a=text('a','원본 파일 열기 ↗','button secondary');const u=new URL(url);if(u.origin!=='https://drive.google.com'||!/^\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(u.pathname))throw Error('UNSAFE_LINK');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';return a;}
 function renderDetail(r){
  const box=$('detail');box.replaceChildren();state.selected=r;
  $('breadcrumb').textContent='IA 포털 / '+document.body.dataset.title+' / '+r.title+' / '+r.version;
  const head=text('div','','detail-head');const title=text('h2',r.title);title.tabIndex=-1;title.id='artifact-heading';head.append(title,statusChip(r));box.append(head);
  box.append(text('p',r.change_summary,'lead'));
  const versions=text('div','','version-line'),select=document.createElement('select');select.id='version-select';select.setAttribute('aria-label','고정 원본 버전');
  for(const t of r.versions){const op=text('option',t.version+(t.registration==='RECEIVED_PENDING_PLANNING'?' · 접수 후보':''));op.value=JSON.stringify([t.artifact_id,t.version]);op.selected=t.artifact_id===r.artifact_id&&t.version===r.version;select.append(op)}select.addEventListener('change',()=>{const [id,version]=JSON.parse(select.value);choose(id,version)});const versionLabel=text('label','고정 버전');versionLabel.htmlFor='version-select';versions.append(versionLabel,select);box.append(versions);
  const states=text('dl','','pointer-grid');states.append(pair('등록 최신',r.latest_version),pair('최신 접수',r.latest_received.version),pair('사용자 선택',pointer(r.selected_version)),pair('정규본 통합',pointer(r.integrated_version)));box.append(states);
  const preview=text('section','','preview-block');preview.setAttribute('aria-label','연구 미리보기 상태');preview.append(text('h3','연구 미리보기'),text('p',r.preview_block_reason),text('p','회사 선택과 제품 미리보기는 검증된 실행 원본에서 제공됩니다.','muted'));
  const disabled=text('button',r.preview_allowed?'미리보기 열기':'미리보기 보류','button');disabled.type='button';disabled.disabled=!r.preview_allowed;
  disabled.addEventListener('click',async()=>{if(!r.preview_allowed||!runtime.mountR3Viewer)return;const ticket=state.request;disabled.disabled=true;try{const response=await api('preview',{artifact_id:r.artifact_id,version:r.version,baseline:r.baseline_commit});if(ticket!==state.request)return;if(response.activation?.preview_allowed!==true||typeof response.html!=='string')throw {code:'UNSUPPORTED_PREVIEW'};state.viewer?.dispose();const identity={artifact_id:r.artifact_id,version:r.version,package_sha256:r.package_sha256,entrypoint_sha256:r.entrypoint_sha256,baseline_commit:r.baseline_commit};state.viewer=await runtime.mountR3Viewer({window,document,container:preview,html:response.html,identity,activation:response.activation,onState:event=>{if(ticket===state.request)announce(event.state,event.code||'')}})}catch(e){if(ticket===state.request)announce(errorCode(e))}finally{if(ticket===state.request)disabled.disabled=!r.preview_allowed}});
  preview.append(disabled);box.append(preview);
  const inspection=text('details','','evidence');inspection.append(text('summary','검수 정보'));const evidence=text('dl','','metadata');evidence.append(pair('자료 종류',r.artifact_type+(r.artifact_subtype?' / '+r.artifact_subtype:'')),pair('제작',role(r.creator)),pair('관리·채택',role(r.administrator)),pair('작성일',r.created_at),pair('기준 commit',r.baseline_commit,{code:true}),pair('기준 build',r.build_id||'미확인',{code:true}),pair('원본 크기',r.package_bytes.toLocaleString('ko-KR')+' bytes'),pair('SHA-256',r.package_sha256,{code:true}),pair('진입점',r.entrypoint,{code:true}),pair('진입점 SHA-256',r.entrypoint_sha256,{code:true}),pair('원본 등록',r.registration_status),pair('연구 상태',r.research_status));inspection.append(evidence);
  const action=text('div','','actions');action.append(makeOriginalLink(r.source_url));
  const copy=text('button','SHA-256 복사','button secondary');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(r.package_sha256);announce('복사했습니다.')}catch{announce('복사하지 못했습니다. 해시를 선택하여 복사해 주세요.')}});action.append(copy);
  const verify=text('button','원본 검증','button secondary');verify.id='verify-source';verify.type='button';verify.addEventListener('click',async()=>{verify.disabled=true;announce('LOADING');try{const result=await api('verify',{artifact_id:r.artifact_id,version:r.version,baseline:r.baseline_commit});if(state.selected?.artifact_id!==r.artifact_id||state.selected?.version!==r.version)return;if(result.verification?.integrity!=='VERIFIED')throw {code:'HASH_MISMATCH'};announce('원본 해시 일치 · 실행 허용은 별도입니다.');}catch(e){if(state.selected?.artifact_id===r.artifact_id&&state.selected?.version===r.version)announce(errorCode(e))}finally{verify.disabled=false}});action.append(verify);inspection.append(action);
  const qa=text('details','','evidence');qa.append(text('summary','검증 범위와 미확인 사항'));qa.append(text('p',r.validation_note));const list=text('ul','');for(const [key,val] of Object.entries(r.validation||{}))list.append(text('li',key+' : '+(typeof val==='object'?JSON.stringify(val):String(val))));for(const ref of r.source_refs){const row=text('p',ref.role+(ref.id?' / '+ref.id:'')+' ');if(ref.url){const target=new URL(ref.url);if(target.protocol!=='https:'||target.username||target.password)continue;const link=text('a',ref.url);link.href=ref.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';row.append(link)}else if(ref.path){row.append(text('code',ref.path))}qa.append(row)}qa.append(list,text('p','위 수치는 제작자 원문에 기록된 범위입니다. 이번 포털의 브라우저 검수나 사용자 수락으로 합산하지 않습니다.'),text('p',r.fixture_contract),text('p','입력 스냅샷: UNKNOWN · 영구 의견쓰기: 비활성'));for(const limit of r.render_limits)qa.append(text('p',limit));inspection.append(qa);box.append(inspection);
  const history=text('details','','evidence');history.append(text('summary','과거 자료'),text('p',r.history_note));if(r.family_id==='MASTER-ASTRA-0549-LAB'){const missing=text('button','미확보 과거 원본 상태','button secondary');missing.type='button';missing.addEventListener('click',()=>announce('MISSING_FILE','현재 파일로 대체하지 않습니다.'));history.append(missing)}box.append(history);
  const form=text('section','','draft');form.append(text('h3','검토 의견 초안'),text('p','이 화면에 머무는 동안만 유지됩니다. 서버·원장에 저장되지 않습니다.','muted'));
  const presetLabel=text('label','의견 대상 프리셋');presetLabel.htmlFor='review-preset';const preset=document.createElement('select');preset.id='review-preset';for(const key of ['미지정','original','ibm','linear','vercel']){const option=text('option',key);option.value=key;preset.append(option)}
  const label=text('label','의견');label.htmlFor='review-draft';const input=document.createElement('textarea');input.id='review-draft';input.maxLength=4000;input.rows=4;input.value=state.draft;input.addEventListener('input',()=>{state.draft=input.value;state.dirty=!!input.value;$('draft-state').textContent='저장되지 않은 로컬 초안';});form.append(presetLabel,preset,label,input,text('p','저장되지 않은 로컬 초안','muted'));form.lastChild.id='draft-state';box.append(form);
  $('detail-empty').hidden=true;box.hidden=false;renderList();
 }
 async function choose(id,version,baseline){
  if(state.selected?.artifact_id===id&&state.selected?.version===version)return;
  if(state.dirty&&!window.confirm('자료를 바꾸면 저장되지 않은 의견 초안이 사라집니다. 변경할까요?'))return;
  state.viewer?.dispose();state.viewer=null;const ticket=++state.request;state.abort?.abort();state.abort=new AbortController();announce('LOADING');
  try{const d=await api('detail',{artifact_id:id,version,baseline},state.abort.signal);if(ticket!==state.request)return;if(!d.item||d.item.artifact_id!==id||d.item.version!==version)throw {code:'MISSING_FILE'};state.draft='';state.dirty=false;renderDetail(d.item);announce(d.item.review_status==='REWORK_REQUESTED'?'REWORK_REQUESTED':'원본 등록 확인 · 실행 검증 대기');}
  catch(e){if(e.name==='AbortError')return;if(ticket!==state.request)return;state.selected=null;$('detail').hidden=true;$('detail').replaceChildren();$('detail-empty').hidden=false;$('detail-empty').textContent=labels[errorCode(e)];announce(errorCode(e));renderList();}
 }
 async function load(){
  announce('LOADING');$('retry').disabled=true;
  try{const d=await api('catalogue',{});if(d?.schema!=='order.ia.qa-list/1'||d.readOnly!==true||!Array.isArray(d.items))throw {code:'NETWORK_ERROR'};state.records=d.items;renderList();
   if(!d.items.length){announce('EMPTY');return}
   announce('등록 자료 '+d.items.length+'건 · 미리보기는 검증 대기');
   const q=new URL(location.href).searchParams;if(q.has('artifact_id')||q.has('version')){await choose(q.get('artifact_id'),q.get('version'),q.get('baseline'));}else if(!state.selected){await choose(d.items[0].artifact_id,d.items[0].version);}
  }catch(e){state.records=[];state.selected=null;$('catalogue').replaceChildren();$('detail').replaceChildren();$('detail').hidden=true;announce(errorCode(e));$('detail-empty').hidden=false;$('detail-empty').textContent=labels[errorCode(e)];}
  finally{$('retry').disabled=false;}
 }
 $('search').addEventListener('input',renderList);$('retry').addEventListener('click',load);
 window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
 document.querySelectorAll('a[data-route]').forEach(a=>a.addEventListener('click',e=>{if(state.dirty&&!window.confirm('저장되지 않은 의견 초안이 사라집니다. 이동할까요?'))e.preventDefault()}));
 load();
}
