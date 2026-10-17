'use strict';
/* Generic application shell only. All registry/policy/feedback content is fetched after OWNER authorization. */
const $=id=>document.getElementById(id);
const state={csrf:'',actor:null,payload:null,section:'overview',selectedScreen:null,filter:'',phase:'all',audience:'all'};
const create=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const put=(parent,...nodes)=>{for(const n of nodes)parent.append(n);return parent;};
const clear=node=>{node.replaceChildren();return node;};
const status=(message,tone='')=>{const el=$('sync-status');el.textContent=message;el.dataset.tone=tone;};
const escapeForSearch=v=>String(v??'').toLocaleLowerCase('ko-KR');
const label=(value,fallback='미기재')=>String(value||fallback);
function chip(value,variant=''){return create('span','chip '+variant,label(value));}
function field(title,value){const wrap=create('div','detail-field');put(wrap,create('dt','',title),create('dd','',label(value)));return wrap;}
function noData(text){return create('p','empty',text)}
const sectionNames={overview:'전체 개요',sitemap:'계층형 사이트맵',journey:'고객 여정',operation:'운영 연결',screens:'화면 원장',decisions:'향후 검토',roadmap:'사업·개발 로드맵',policy:'정책·승인 구분',guide:'사용 안내',notes:'화면 메모·자료'};
function openView(view,role){if(!sectionNames[view])return;state.section=view;render();if(role&&view==='sitemap'){const select=document.querySelector('.ia-map-controls select');if(select){select.value=role;select.dispatchEvent(new Event('change'))}}}
function focusScreen(id){if(!state.payload)return;const x=state.payload.screens.items.find(s=>s.screenId===id);if(x)showScreen(x)}
function drawTop(){
 const {screens,decisions,roadmap,notes}=state.payload;
 const vals=[['화면 원장',screens.total,'76개 정본 ID 검증'],['향후 검토',decisions.total,`${decisions.active}건 검토 · ${decisions.fullyApproved}건 승인`],['사업 로드맵',roadmap.total,'0~6단계'],['의견 기록',notes.items.length,'읽기 전용']];
 const m=clear($('metrics'));
 for(const [t,n,subtitle] of vals){const card=create('article','metric');put(card,create('span','metric-label',t),create('strong','metric-number',n),create('span','metric-sub',subtitle));m.append(card)}
 $('source-state').textContent='Google Sheets · 인증 조회 · 읽기 전용';
}
function renderScreenList(){
 const main=clear($('main-content'));
 const {items}=state.payload.screens;
 const audiences=[...new Set(items.map(x=>x.audience).filter(Boolean))];
 const bar=create('div','filters');const input=create('input','field-input');input.type='search';input.placeholder='화면 ID·화면명·내용 검색';input.value=state.filter;input.setAttribute('aria-label','화면 검색');input.addEventListener('input',e=>{state.filter=e.target.value;update()});
 const a=create('select','field-select');put(a,create('option','','전체 이용자'));a.firstChild.value='all';for(const n of audiences){const o=create('option','',n);o.value=n;a.append(o)}a.value=state.audience;a.setAttribute('aria-label','이용자 분류');a.addEventListener('change',()=>{state.audience=a.value;update()});
 const p=create('select','field-select');put(p,create('option','','전체 단계'));p.firstChild.value='all';for(const n of [...new Set(items.map(x=>x.phase).filter(Boolean))]){const o=create('option','',n);o.value=n;p.append(o)}p.value=state.phase;p.setAttribute('aria-label','개발 단계');p.addEventListener('change',()=>{state.phase=p.value;update()});
 put(bar,input,a,p);const count=create('div','result-caption'),grid=create('div','registry-grid');put(main,bar,count,grid);
 function update(){
  const q=escapeForSearch(state.filter);
  const filtered=items.filter(x=>(state.audience==='all'||x.audience===state.audience)&&(state.phase==='all'||x.phase===state.phase)&&[x.screenId,x.name,x.details,x.audience,x.phase].some(v=>escapeForSearch(v).includes(q)));
  count.textContent=`검색 결과 ${filtered.length} / ${items.length}개 · 화면 ID는 기존 정본 그대로 유지`;
  clear(grid);
  if(!filtered.length){grid.append(noData('조건에 해당하는 화면이 없습니다.'));return}
  for(const x of filtered){const b=create('button','registry-card');b.type='button';b.setAttribute('aria-label',x.screenId+' '+x.name+' 상세');put(b,create('span','registry-id',x.screenId),create('strong','registry-title',x.name),create('small','registry-meta',`${label(x.audience)} · ${label(x.phase)}`),chip(x.status));b.addEventListener('click',()=>showScreen(x));grid.append(b)}
 }
 update();if(state.selectedScreen){const x=items.find(a=>a.screenId===state.selectedScreen);if(x)showScreen(x)}
}
function showScreen(x){
 state.selectedScreen=x.screenId;const aside=$('detail');clear(aside);aside.hidden=false;
 const heading=create('div','detail-heading'),h=create('div');put(h,create('span','eyebrow','SCREEN · '+x.screenId),create('h2','',x.name));const close=create('button','text-button','닫기');close.type='button';close.addEventListener('click',()=>{aside.hidden=true;state.selectedScreen=null});put(heading,h,close);aside.append(heading);
 const def=create('dl','detail-list');for(const [t,v] of [['이용자',x.audience],['계획 주소',x.plannedRoute],['개발 단계',x.phase],['현 상태',x.status],['독립 QA·검증',x.qaVerified]])def.append(field(t,v));aside.append(def);
 const detail=create('section','detail-copy');put(detail,create('h3','','기획상 화면 내용'),create('p','',label(x.details)));aside.append(detail);
 const note=create('div','review-warning');note.textContent='화면 내용은 기획 자료입니다. 고객 LOWFI·HIFI 및 실제 제품의 사용자 승인을 뜻하지 않습니다. 원본 자료 연결은 검증된 후에만 제공됩니다.';aside.append(note);
 if(window.iaMap?.mapDetail)window.iaMap.mapDetail(aside,x);
 const asset=create('button','secondary-button','자료·버전 확인');asset.addEventListener('click',async()=>{
  asset.disabled=true;try{const res=await fetch('/api/ia/assets?screenId='+encodeURIComponent(x.screenId),{credentials:'same-origin',cache:'no-store'});if(res.status===403)throw new Error('권한이 없습니다.');if(!res.ok)throw new Error('자료 상태를 확인할 수 없습니다.');const data=await res.json();note.textContent=`자료 링크 검증: ${label(data.item?.qaStatus)} · 사용자 승인: ${label(data.item?.userApproval)} · 인증된 원본 링크: 없음`; }catch(e){note.textContent=e.message}finally{asset.disabled=false}
 });aside.append(asset);
}
function renderDecisions(){const box=clear($('main-content'));const data=state.payload.decisions;put(box,create('p','intro',`전체 ${data.total}건 · 검토 중 ${data.active}건 · 완전 승인 ${data.fullyApproved}건. 일부 요건 승인과 운영 세부 검토를 구분합니다.`));const list=create('div','record-list');
 for(const d of data.items){const row=create('details','record');const summary=create('summary');const head=create('div','record-head');put(head,create('span','registry-id',d.id),create('strong','',d.name));put(summary,head,chip(d.status,d.isFullyApproved?'approved':''));const body=create('div','record-body');put(body,create('p','',d.question),create('small','',`관련 화면: ${label(d.relatedScreens)} · 구현 판정: ${d.implementation}`));put(row,summary,body);list.append(row)}box.append(list)}
function renderRoadmap(){const box=clear($('main-content'));put(box,create('p','intro','사업 로드맵 0~6단계. 기술 개발 IA-R0~R6와 별도이며, 단계 기재가 구현 완료를 의미하지 않습니다.'));const timeline=create('ol','roadmap-list');for(const x of state.payload.roadmap.items){const item=create('li','roadmap-card');put(item,chip(x.stage),create('span','roadmap-category',label(x.type)),create('h3','',x.goal),create('p','',x.description),field('현재 상태',x.status),field('개발 범위',x.scope),create('small','roadmap-dependency',label(x.dependency)));timeline.append(item)}box.append(timeline);if(window.iaMap?.enrichRoadmap)window.iaMap.enrichRoadmap(box)}
function renderGuide(){const box=clear($('main-content'));put(box,create('p','intro','기존 원장의 사용 안내입니다. 현재 포털에서는 의견 작성·수정·승인 기능이 비활성화되어 있습니다.'));const list=create('div','record-list');for(const x of state.payload.guide.items){const row=create('article','guide-card');put(row,chip(x.order),create('h3','',x.area),create('p','',x.instructions));list.append(row)}box.append(list)}
function renderNotes(){const box=clear($('main-content'));put(box,create('p','intro','기존 의견_기록 시트의 작성 내용을 읽기 전용으로 표시합니다. 이 화면에서 메모를 추가하거나 승인하지 않습니다.'));const list=create('div','record-list');if(!state.payload.notes.items.length)box.append(noData('기록된 의견이 없습니다.'));for(const x of state.payload.notes.items){const d=create('details','record');const s=create('summary');put(s,chip(x.screenOrDecisionId),create('strong','',label(x.date)),chip(x.handlingStatus));const body=create('div','record-body');put(body,create('p','',x.text),field('기획방 답변',x.planningReply),field('반영 버전',x.appliedVersion),create('small','','메모 기록 ≠ 사용자 최종 승인'));put(d,s,body);list.append(d)}box.append(list)}
function render(){if(!state.payload)return;window.iaMap?.bind(state.payload,{openScreen:focusScreen,openView});for(const b of document.querySelectorAll('[data-section]')){const on=b.dataset.section===state.section;b.classList.toggle('selected',on);b.setAttribute('aria-current',on?'page':'false')};$('section-title').textContent=sectionNames[state.section];$('detail').hidden=true;state.selectedScreen=null;switch(state.section){case 'screens':renderScreenList();break;case 'decisions':renderDecisions();break;case 'roadmap':renderRoadmap();break;case 'guide':renderGuide();break;case 'notes':renderNotes();break;default:if(window.iaMap?.render)window.iaMap.render(state.section,state.payload,$('main-content'),{openScreen:focusScreen,openView});else $('main-content').append(noData('연결 보기를 불러오지 못했습니다.'));break;}}
async function refresh(){let sourceValidated=false;status('Google 원장을 확인하고 있습니다…');$('refresh').disabled=true;
 try{const response=await fetch('/api/ia/dashboard',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(response.status===403||response.status===401){location.replace('/login.html');return;}
  if(response.status===503){const body=await response.json().catch(()=>({}));state.payload=null;clear($('metrics'));clear($('main-content')).append(noData('Google Sheets 실연동 대기 중입니다. 기존 Google 서비스 계정의 시트 Viewer 권한 및 Pages 서버 비밀값을 확인해야 합니다. 현재 데이터는 임의의 모의값으로 표시하지 않습니다.'));status(`원장 서버 연결 대기 · ${label(body.reason,'인증/접근 설정 확인 필요')}`,'pending');return;}
  if(!response.ok)throw new Error('서버 응답 오류 '+response.status);
  const data=await response.json();
  if(!data.readOnly||data.source!=='GOOGLE_SHEETS_AUTHENTICATED_READ'||data.screenCount!==76||data.decisionCount!==25||data.roadmapCount!==7||data.screens?.items?.length!==76||data.decisions?.items?.length!==25||data.roadmap?.items?.length!==7||data.decisions?.fullyApproved!==1||data.decisions?.active!==24)throw new Error('원장 검증 수량이 정본과 일치하지 않습니다.');
  sourceValidated=true;state.payload=data;drawTop();const v=new URL(location.href).searchParams.get('view');if(v&&sectionNames[v])state.section=v;render();const id=new URL(location.href).searchParams.get('screen');if(id&&/^[FUPCA]\d{2}$/.test(id))focusScreen(id);status('원장 동기화 확인 · Google Sheets 인증 읽기 · 수정 불가','ok');
 }catch(e){if(sourceValidated){clear($('main-content')).append(noData('화면 표시 중 오류가 발생했습니다. 원장 데이터는 보존됩니다.'));status('원장 조회 완료 · 화면 표시 오류','pending')}else{state.payload=null;clear($('metrics'));clear($('main-content')).append(noData('데이터 검증에 실패했습니다.'));status('원장 조회 또는 검증 실패','pending')}}finally{$('refresh').disabled=false}}
async function start(){try{const res=await fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store'});if(!res.ok){location.replace('/login.html');return}const user=await res.json();if(user.role!=='OWNER')throw Error('OWNER_REQUIRED');state.actor=user;state.csrf=user.csrf;$('identity').textContent=user.email+' · OWNER';await refresh()}catch{$('identity').textContent='인증 상태 확인 실패';status('인증 상태를 확인할 수 없습니다.','pending')}}
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{state.section=b.dataset.section;render()}));
$('refresh').addEventListener('click',refresh);
$('print-view')?.addEventListener('click',()=>window.print());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detail').hidden){$('detail').hidden=true;state.selectedScreen=null}});
$('logout').addEventListener('click',async()=>{if(!state.csrf)return;try{const res=await fetch('/api/ia/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-IA-CSRF':state.csrf}});if(!res.ok)throw Error('LOGOUT_FAILED');state.payload=null;location.replace('/login.html')}catch{status('로그아웃 요청에 실패했습니다.','pending')}});
start();
