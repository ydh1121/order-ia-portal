import {shellStyles} from './r3-ui/approved-shell.mjs';
import {browserFunction} from './browser-source.mjs';
import {installQaSession} from './qa-session-client.mjs';
import {mountPortalSession} from './portal-session-client.mjs';
import {productBuild} from './product-build.gen.mjs';
import {catalog} from './r3-ui/catalog.gen.mjs';
import {mountProductFeedback} from './product-lab-feedback.mjs';

const connectedPages=[
 {id:'onboarding',label:'첫 화면',view:'product-r3',screen:'onboarding',state:'intro-1',kind:'component'},
 {id:'q1',label:'간편 견적기',view:'simple-r3',kind:'product'},
 {id:'q4',label:'상세 견적기',view:'detailed-r3',kind:'product'},
 {id:'store-purchase',label:'매장 구매·입금 확인',view:'product-r3',screen:'store-purchase',state:'default',kind:'product'},
 {id:'delivery-request',label:'납품 요청·오더패스',view:'product-r3',screen:'delivery-request',state:'default',kind:'product'},
 {id:'store-settings',label:'사업장 등록·관리',view:'businesses-r3',kind:'product'},
 {id:'account-settings',label:'회원정보·회원탈퇴',view:'product-r3',screen:'account-settings',state:'default',kind:'product'},
 {id:'customer-orders',label:'주문·납품·거래 문서',view:'product-r3',screen:'store-purchase',state:'select',kind:'product'},
 {id:'application-status',label:'납품 신청·증빙 심사',view:'roles-r3',menu:'delivery',kind:'product'},
 {id:'consultation',label:'상담 예약·내역',view:'roles-r3',menu:'consult',kind:'product'},
 {id:'admin-shipments',label:'주문 출고·송장 관리',view:'product-r3',screen:'admin-shipments',state:'default',kind:'product'},
 {id:'supplier-shipments',label:'농장 발송',view:'product-r3',screen:'supplier-shipments',state:'default',kind:'product'},
 {id:'price-policy',label:'단가표',view:'pricing-r3',kind:'product'},
 {id:'admin-price-approval',label:'단가 승인·견적 발급',view:'pricing-r3',mode:'contract',kind:'product'},
 {id:'admin-analytics',label:'매출 현황',view:'product-r3',screen:'admin-analytics',state:'business-sales',kind:'product'},
 {id:'admin-revenue-rules',label:'수익 배분율',view:'product-r3',screen:'admin-revenue-rules',state:'default',kind:'product'},
 {id:'member-email-templates',label:'회원 이메일 양식',view:'product-r3',screen:'member-email-templates',state:'welcome',kind:'product'},
 {id:'component-library',label:'컴포넌트 라이브러리',view:'product-r3',screen:'component-library',state:'components',kind:'component'}
];
const connectedIds=new Set(connectedPages.map(p=>p.id));
export const productLabPages=[...connectedPages,...catalog.filter((row,index,all)=>!connectedIds.has(row.screen)&&all.findIndex(r=>r.screen===row.screen)===index).map(row=>({id:row.screen,label:row.label,kind:'reference',view:'qa-lab',screen:row.id,archive:'1'}))];
export const liveTargetScreen=id=>'live-'+id;
export function isProductLiveTarget(target){return productLabPages.some(p=>p.kind!=='reference'&&liveTargetScreen(p.id)===target.screen)&&(target.screen==='live-component-library'?/^[-\w]{1,100}$/.test(target.state):target.state==='running')&&['buyer','supplier','operator','guest'].includes(target.variant)&&[320,360,375,390,430,768,1024,1280,1440,1920].includes(target.viewport)&&target.artifactHash===productBuild.digest;}
const js=v=>JSON.stringify(v).replaceAll('<','\\u003c');

export function renderProductLab(nonce){
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Order · 제품 QA랩</title><style>${shellStyles}
 .lab-app .run-bar{display:flex;flex-wrap:wrap;align-items:end;gap:10px;background:white;border-bottom:1px solid #e5e8eb;padding:12px 20px}.run-bar label{display:grid;gap:4px;font-size:11px;color:#6b7684;min-width:0}.run-bar input,.run-bar select,.run-bar button{min-height:36px;padding:7px 10px;border:1px solid #e5e8eb;border-radius:9px;background:#fff;max-width:100%}.run-bar button{font-size:12px;background:#f2f4f6}.run-bar select{max-width:230px}.run-meta{font-size:11px;line-height:1.6;margin:0;padding:8px 20px;color:#6b7684;background:white;overflow-wrap:anywhere}.run-meta a{color:#315de6}.lab-source-note{margin:0 0 12px;font-size:12px;line-height:1.6;color:#6b7684}.product-stage{display:block;overflow:auto;min-width:0}.product-frame-bound{width:390px;max-width:none;min-height:750px;margin-inline:auto;flex:none;background:white;outline:1px solid #e5e8eb;border-radius:18px;overflow:hidden}.product-frame-bound iframe{width:100%;min-height:750px;height:100%;border:0;display:block}.lab-stage{display:flex;flex-direction:column}.run-empty{margin:auto;background:#fff;border-radius:18px;padding:32px;max-width:560px;line-height:1.7}.run-empty h2{font-size:21px;margin:0 0 10px}.lab-topbar{height:auto;min-height:62px;flex-wrap:wrap;padding:10px 20px}.lab-session{display:flex;align-items:center;gap:8px;font-size:11px}.lab-session .ux-session-notice:empty{display:none}.lab-panel{border:0;border-radius:18px;padding:24px;width:min(620px,calc(100vw - 24px));max-height:85dvh;overflow:auto}.lab-panel::backdrop{background:#191f2870}.lab-panel h2{margin-top:0}.lab-panel label{display:grid;gap:8px;margin:12px 0}.lab-panel input,.lab-panel textarea{width:100%;border:1px solid #d1d6db;border-radius:10px;padding:12px;font:inherit}.lab-panel textarea{min-height:100px}.lab-panel button,.lab-panel a{display:inline-block;border:0;border-radius:9px;background:#f2f4f6;color:#333d4b;text-decoration:none;padding:10px 13px;margin:4px;font:inherit}.lab-panel article{border-top:1px solid #e5e8eb;padding:14px 0;overflow-wrap:anywhere}.lab-panel article p{white-space:pre-wrap}.lab-nav-item button:last-child{width:28px;border:0;background:none;color:#8b95a1}.lab-sidebar-footer>a{display:block;padding:5px 0}.lab-nav-section[open]>summary{background:#eaf0ff}.lab-nav-heading{cursor:pointer}.run-status{margin:0;padding:8px 20px;background:#fff7e8;font-size:12px;color:#795320}.run-status:empty{display:none}.lab-bottomline{flex-wrap:wrap}.lab-panel .status-actions{display:flex;gap:5px}.lab-panel .status-actions button{font-size:12px}.live-pin-active{background:#315de6!important;color:white!important}@media(max-width:680px){.lab-topbar{display:flex;height:auto}.lab-session{width:100%;justify-content:flex-end}.run-bar{padding:10px!important}.run-bar select{max-width:180px}.product-frame-bound{min-height:720px}.lab-stage{padding:10px}}
 </style></head><body><div class="lab-app" id="product-lab"><aside class="lab-sidebar"><div class="lab-wordmark">Order<small>QA LAB</small></div><input class="lab-search" id="live-search" type="search" aria-label="화면 찾기" placeholder="화면 찾기"><nav class="lab-catalog" id="live-navigation" aria-label="검증 화면"></nav><div class="lab-sidebar-footer"><a href="/ia?view=qa-lab&amp;archive=1" target="_blank" rel="noopener">R1 이후 지시·화면 기록</a><a href="/ia">IA 포털</a></div></aside><main class="lab-main"><header class="lab-topbar"><button class="lab-mobile-menu" id="live-menu">목록</button><div class="lab-context"><h1 class="lab-title" id="live-title">제품 QA랩</h1><p class="lab-subtitle">정규 화면 · 실제 API · 테스트 DB</p></div><button id="live-pin" aria-pressed="false">위치 코멘트</button><button id="live-feedback">의견·상태</button><button id="live-backups">백업·복원</button><div id="live-session" class="lab-session"></div></header><div class="run-bar"><label>테스트 실행<select id="live-run"><option value="">실행 선택</option></select></label><button id="live-create">새 테스트 실행</button><label>역할<select id="live-persona"><option value="buyer">매장</option><option value="supplier">공급처</option><option value="operator">운영자</option><option value="guest">비회원</option></select></label><label>화면 폭<select id="live-width"><option>390</option><option>375</option><option>320</option><option>768</option><option>1280</option><option>1440</option></select></label><button id="live-reload">화면 다시 열기</button><a id="live-open" target="_blank" rel="noopener">독립 창</a></div><p class="run-meta" id="live-source"></p><p class="run-status" id="live-status" role="status"></p><section class="lab-stage product-stage" id="live-stage"><div class="run-empty" id="live-empty"><h2>테스트 실행을 선택해 주세요.</h2><p>같은 제품 코드를 테스트 DB에서 실행합니다. 매장·공급처·운영자로 저장과 업무 인계를 확인하고, 백업 시점에서 새 실행을 복원할 수 있습니다.</p><p>기존 QA 의견과 개인 단가표는 별도로 보존됩니다.</p></div><div class="product-frame-bound" id="live-bound" hidden><iframe id="product-frame" title="정규 제품 실행"></iframe></div></section><footer class="lab-bottomline"><span id="live-receipt">서버 응답 대기</span><span id="live-proof"></span></footer></main></div><dialog class="lab-panel" id="live-dialog"></dialog><script nonce="${nonce}">(${browserFunction(mountPortalSession)})(document.getElementById('live-session'),${browserFunction(installQaSession)});(${browserFunction(bootProductLab)})(${js(productLabPages)},${js(productBuild.digest)},${browserFunction(mountProductFeedback)});</script></body></html>`;
}

export function bootProductLab(pages,buildDigest,mountFeedback){
 const $=id=>document.getElementById(id),dialog=$('live-dialog'),frame=$('product-frame'),emptyIntro=$('live-empty').innerHTML;
 const make=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
 const button=(label,fn)=>{const b=make('button',label);b.type='button';b.onclick=fn;return b;};
 let csrf='',runs=[],run=null,current=pages[0],nav=null,pin=false,anchor=null,commentRequest=null,dragged='',activeFrameUrl='',lastReceipt=null,documentId='',currentState='running',liveSource=null;
 const q=new URL(location.href).searchParams;if(q.has('persona')&&['buyer','supplier','operator','guest'].includes(q.get('persona')))$('live-persona').value=q.get('persona');
 const selectedPage=pages.find(p=>p.id===q.get('page'));if(selectedPage)current=selectedPage;
 if([...$('live-width').options].some(o=>o.value===q.get('width')))$('live-width').value=q.get('width');
 const status=value=>$('live-status').textContent=value||'';
 const err=e=>status(({ISOLATED_LAB_DB_REQUIRED:'테스트 DB가 연결되지 않았어요.',LAB_SCHEMA_NOT_INSTALLED:'테스트 DB 준비가 필요해요.',LAB_DATABASE_ISOLATION_FAILED:'DB 분리 확인에 실패했어요.',RUN_SCHEMA_MIGRATION_REQUIRED:'이 실행은 이전 DB 구조입니다. 백업 후 마이그레이션이 필요해요.',REVISION_CONFLICT:'다른 창의 변경을 확인해 주세요. 작성 내용은 남아 있어요.',CSRF_DENIED:'로그인을 확인한 뒤 다시 저장해 주세요.'})[e.message]||'요청을 처리하지 못했어요. '+e.message);
 async function api(path,body,retried=false){const res=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',headers:body?{'Content-Type':'application/json','X-IA-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});let data;try{data=await res.json();}catch{throw Error('AUTHENTICATION_REQUIRED');}if(!res.ok){if(body&&!retried&&res.status===403&&data.error==='CSRF_DENIED'){csrf=(await api('/api/ia/auth/me')).csrf;return api(path,body,true);}throw Object.assign(Error(data.error),{data,status:res.status});}return data;}
 document.addEventListener('ia-session-updated',event=>{if(event.detail?.csrf)csrf=event.detail.csrf;});
 const lab=(path,body)=>api('/api/ia/lab'+path,body);
 function show(title){dialog.replaceChildren(make('h2',title),button('닫기',()=>dialog.close()));if(!dialog.open)dialog.showModal();}
 function syncUrl(){const url=new URL(location.href);if(run)url.searchParams.set('run',run.id);url.searchParams.set('page',current.id);url.searchParams.set('persona',$('live-persona').value);url.searchParams.set('width',$('live-width').value);history.replaceState(null,'',url);}
 function selectPage(page){current=page;drawNav();openPage();$('product-lab').classList.remove('nav-open');}
 function openPage(){
  lastReceipt=null;documentId=crypto.randomUUID();
  $('live-title').textContent=current.label;
  if(current.kind==='reference'){
   $('live-bound').hidden=true;$('live-empty').hidden=false;$('live-empty').replaceChildren(make('h2',current.label),make('p','이 항목은 이전 설계·검토 기록입니다. 제품 API 연결 전에는 실제 업무 통과로 판정하지 않습니다.'));
   const a=make('a','당시 화면과 지시 확인');a.href='/ia?view=qa-lab&archive=1&screen='+encodeURIComponent(current.screen)+'&width='+$('live-width').value;a.target='_blank';a.rel='noopener';$('live-empty').append(a);$('live-open').href=a.href;$('live-source').textContent='제품 연결 대기 · 기존 지시와 화면 기록 보존';$('live-receipt').textContent='제품 검증 대기';syncUrl();return;
  }
  $('live-empty').innerHTML=emptyIntro;
  if(!run||run.state!=='ACTIVE'){$('live-empty').hidden=false;$('live-bound').hidden=true;return;}
  syncUrl();currentState='running';anchor=null;commentRequest=null;$('live-title').textContent=current.label;$('live-empty').hidden=true;$('live-bound').hidden=false;
  const url=new URL('/ia',location.origin);url.searchParams.set('view',current.view);url.searchParams.set('labRun',run.id);url.searchParams.set('persona',$('live-persona').value);url.searchParams.set('qaDocument',documentId);
  for(const k of ['screen','state','mode','menu'])if(current[k])url.searchParams.set(k,current[k]);
  activeFrameUrl=url.href;frame.src=activeFrameUrl;$('live-open').href=activeFrameUrl;$('live-bound').style.width=$('live-width').value+'px';
  $('live-source').textContent=run.label+' · '+(current.kind==='product'?'실제 저장·조회 경로':'공통 컴포넌트 동작')+' · 제품 '+(run.source.productCommit||'').slice(0,8)+' · 앱 '+(liveSource?.applicationCommit||liveSource?.applicationSourceDigest||run.source.applicationSourceDigest||'').slice(0,12)+' · DB 분리됨';
  $('live-proof').textContent='소스 '+buildDigest.slice(0,12);$('live-receipt').textContent='화면을 불러오는 중이에요.';status('');
 }
 async function listRuns(preferred){const data=await lab('/runs');runs=data.runs;$('live-run').replaceChildren(new Option('실행 선택',''),...runs.map(r=>new Option(r.label+(r.state==='ACTIVE'?'':' · '+r.state),r.id)));run=runs.find(r=>r.id===(preferred||run?.id||q.get('run')))||runs.find(r=>r.state==='ACTIVE')||null;if(run)$('live-run').value=run.id;openPage();}
 async function saveNav(next){try{nav=await api('/api/ia/r3-qa/navigation',{expectedRevision:nav.revision,layout:next});drawNav();}catch(e){err(e);}}
 function drawNav(){
  if(!nav)return;const term=$('live-search').value.trim().toLowerCase();$('live-navigation').replaceChildren();
  for(const group of nav.layout.groups){
   const details=make('details');details.className='lab-nav-section';details.open=group.id==='mvp';const summary=make('summary');summary.className='lab-nav-heading';const name=make('span',group.name);summary.append(name);details.append(summary);
   name.ondblclick=e=>{e.preventDefault();e.stopPropagation();const input=make('input');input.value=group.name;input.maxLength=48;name.replaceWith(input);input.focus();let saved=false;const finish=()=>{if(saved)return;saved=true;const title=input.value.trim();if(title&&title!==group.name)saveNav({...nav.layout,groups:nav.layout.groups.map(g=>g.id===group.id?{...g,name:title}:g)});else drawNav();};input.onblur=finish;input.onkeydown=e=>{if(e.key==='Enter')finish();if(e.key==='Escape'){saved=true;drawNav();}};};
   details.ondragover=e=>{if(dragged){e.preventDefault();details.classList.add('drag-over');}};details.ondragleave=()=>details.classList.remove('drag-over');details.ondrop=e=>{e.preventDefault();details.classList.remove('drag-over');if(dragged)saveNav({...nav.layout,assignments:{...nav.layout.assignments,[dragged]:group.id}});dragged='';};
   for(const page of pages.filter(p=>(nav.layout.assignments[p.id]||'mvp')===group.id&&(!term||p.label.toLowerCase().includes(term)))){
    const row=make('div');row.className='lab-nav-item';row.draggable=true;row.ondragstart=e=>{dragged=page.id;e.dataTransfer.setData('text/plain',page.id);};row.ondragend=()=>{dragged='';};
    const b=button(page.label+(page.kind==='reference'?' · 연결 대기':''),()=>selectPage(page));b.className='lab-nav'+(page.id===current.id?' active':'');const move=button('↔',()=>saveNav({...nav.layout,assignments:{...nav.layout.assignments,[page.id]:group.id==='mvp'?'future':'mvp'}}));move.setAttribute('aria-label',page.label+' 분류 옮기기');row.append(b,move);details.append(row);
   }
   $('live-navigation').append(details);
  }
 }
 async function createRun(){show('새 테스트 실행');const label=make('label','실행 이름'),input=make('input');input.value='제품 검증 '+new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});input.maxLength=100;label.append(input);const message=make('p'),key=crypto.randomUUID(),submit=button('생성',async()=>{submit.disabled=true;message.textContent='테스트 DB와 역할을 준비하고 있어요.';try{const result=await lab('/runs',{label:input.value,requestKey:key});await listRuns(result.run.id);dialog.close();}catch(e){message.textContent=e.message;}finally{submit.disabled=false;}});dialog.append(label,submit,message);input.focus();}
 async function backups(){if(!run)return status('먼저 실행을 선택해 주세요.');show('백업·복원');const explanation=make('p','현재 실행을 백업합니다. 복원하면 별도 실행이 만들어집니다.'),label=make('input');label.value=run.label+' 백업';label.setAttribute('aria-label','백업 이름');const message=make('p');dialog.append(explanation,label,button('현재 실행 백업',async()=>{try{const r=await lab('/runs/'+run.id+'/snapshots',{label:label.value});message.textContent='백업 완료 · '+r.snapshot.rowCount+'행 · SHA256 '+r.snapshot.digest;await loadBackups();}catch(e){message.textContent=e.message;}}),message);const list=make('section');dialog.append(list);
  async function loadBackups(){const result=await lab('/runs/'+run.id+'/snapshots');list.replaceChildren();for(const item of result.snapshots){const article=make('article');article.append(make('strong',item.label),make('p',item.createdAt+' · '+item.digest));const download=make('a','JSON 다운로드');download.href='/api/ia/lab/snapshots/'+item.id;download.download='order-lab-backup-'+item.id+'.json';article.append(download,button('새 실행으로 복원',async()=>{const key=crypto.randomUUID();try{message.textContent='복원 후 DB 값을 대조하고 있어요.';const r=await lab('/snapshots/'+item.id+'/restore',{label:item.label+' 복원',requestKey:key});await listRuns(r.run.id);message.textContent='복원·재조회 완료 · '+r.run.label;await loadBackups();}catch(e){message.textContent=e.message;}}));list.append(article);}}
  try{await loadBackups();}catch(e){message.textContent=e.message;}
 }
 const target=()=>({screen:'live-'+current.id,state:current.id==='component-library'?currentState:'running',variant:$('live-persona').value,viewport:Number($('live-width').value),artifactHash:buildDigest});
 async function feedback(){
  if(!run||current.kind==='reference')return status('제품 실행 화면을 선택해 주세요.');
  show('의견·상태');const captured=anchor;
  await mountFeedback({container:dialog,api,target:target(),runId:run.id,anchor:captured,
   onSaved(){anchor=null;if(captured&&pin)dialog.close();},
   restore(point){frame.contentWindow.postMessage({scope:'ORDER_PRODUCT_INSPECTION',runId:run.id,type:'restore',payload:point},location.origin);dialog.close();}
  });
 }
 $('live-create').onclick=createRun;$('live-backups').onclick=backups;$('live-feedback').onclick=feedback;
 $('live-run').onchange=()=>{run=runs.find(r=>r.id===$('live-run').value)||null;openPage();};$('live-persona').onchange=openPage;$('live-width').onchange=openPage;$('live-reload').onclick=()=>{if(activeFrameUrl){lastReceipt=null;$('live-receipt').textContent='화면을 다시 불러오는 중이에요.';frame.src=activeFrameUrl;}};$('live-search').oninput=drawNav;$('live-menu').onclick=()=>$('product-lab').classList.toggle('nav-open');
 $('live-pin').onclick=()=>{if(!run||current.kind==='reference')return;pin=!pin;$('live-pin').setAttribute('aria-pressed',String(pin));$('live-pin').classList.toggle('live-pin-active',pin);frame.contentWindow.postMessage({scope:'ORDER_PRODUCT_INSPECTION',runId:run.id,type:'pick',payload:pin},location.origin);};
 addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.runId!==run?.id||event.data.persona!==$('live-persona').value||event.data.documentId!==documentId)return;const m=event.data;
  if(m.scope==='ORDER_PRODUCT_RUNTIME'&&m.type==='operation'){lastReceipt=m;$('live-receipt').textContent='서버 저장 확인 · '+m.path+' · '+(m.id||'')+' · r'+(m.revision||'?');}
  if(m.scope==='ORDER_PRODUCT_RUNTIME'&&m.type==='ready'||m.scope==='ORDER_PRODUCT_INSPECTION'&&m.type==='ready'){
   if(m.scope==='ORDER_PRODUCT_RUNTIME'&&m.screen==='component-library'&&/^[-\w]{1,100}$/.test(m.state)){const state=m.state+(typeof m.componentVariant==='string'&&/^[-\w]{1,64}$/.test(m.componentVariant)?'--'+m.componentVariant:'');if(state.length<=100)currentState=state;}
   if(m.payload?.path){const actual=new URL(m.payload.path,location.origin);if(actual.href!==activeFrameUrl)lastReceipt=null;
    // Match the actual Pages pricing branch, including direct version/quote
    // links. An unspecified mode must not absorb the contract price screen.
    const contractPrice=actual.searchParams.get('practice')==='1'||actual.searchParams.has('priceVersion')||actual.searchParams.has('quote')||actual.searchParams.get('mode')==='contract';
    const matches=p=>p.kind!=='reference'&&p.view===actual.searchParams.get('view')&&(!p.screen||p.screen===actual.searchParams.get('screen'))&&(!p.menu||p.menu===actual.searchParams.get('menu'))&&(p.view==='pricing-r3'?(p.mode==='contract')===contractPrice:!p.mode||p.mode===actual.searchParams.get('mode'));
    // Purchase and order menus intentionally share one product document. Keep
    // the selected entry and its feedback identity when that route still fits.
    const match=matches(current)?current:pages.find(matches);if(match){current=match;drawNav();$('live-title').textContent=current.label;syncUrl();}activeFrameUrl=actual.href;$('live-open').href=actual.href;}
   $('live-receipt').textContent=lastReceipt?'마지막 서버 저장 · '+lastReceipt.path:'정규 화면 연결됨';if(pin)frame.contentWindow.postMessage({scope:'ORDER_PRODUCT_INSPECTION',runId:run.id,type:'pick',payload:true},location.origin);}
  if(m.scope==='ORDER_PRODUCT_INSPECTION'&&m.type==='point'){anchor=m.payload.anchor;feedback();}
  if(m.scope==='ORDER_PRODUCT_INSPECTION'&&m.type==='cancel'){pin=false;$('live-pin').setAttribute('aria-pressed','false');$('live-pin').classList.remove('live-pin-active');}
 });
 (async()=>{const session=await api('/api/ia/auth/me');csrf=session.csrf;liveSource=(await lab('/session')).source;nav=await api('/api/ia/r3-qa/navigation');drawNav();await listRuns();})().catch(err);
}
