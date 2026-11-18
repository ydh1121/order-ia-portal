/** Auth-only v0.3 visual contract. Live names, statuses and decisions from OWNER Google API.
 * Does not copy the historical HTML to public static assets.
 */
import {ORIGINAL_V03_SOURCE} from './v03-source.mjs';
import {UX_CSS} from './v03-ux.css.mjs';
import {UX_RUNTIME,UX_NAV_RUNTIME} from './v03-ux.js.mjs';
const prelude=String.raw`
(async()=>{
'use strict';
${UX_NAV_RUNTIME}
async function attachLogout(){
 const banner=document.getElementById('ia-live-banner');
 if(!banner)return;
 const owner=await fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store'});
 if(owner.ok){
  const actor=await owner.json();
  const btn=document.createElement('button');btn.type='button';btn.textContent='로그아웃';btn.style.cssText='float:right;margin-left:8px;border:1px solid #91bbac;border-radius:6px;background:#fff;color:#245d4e;padding:3px 10px;cursor:pointer';
  btn.addEventListener('click',async()=>{const res=await fetch('/api/ia/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-IA-CSRF':actor.csrf}});if(res.ok)location.replace('/login')});banner.prepend(btn);
 }
}

try {
const response=await fetch('/api/ia/dashboard',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
if(response.status===401||response.status===403){location.replace('/login');return}
if(!response.ok)throw Error('GOOGLE_LIVE_READ_UNAVAILABLE');
const live=await response.json();
if(!live.readOnly||live.source!=='GOOGLE_SHEETS_AUTHENTICATED_READ'||live.screenCount!==76||live.decisionCount!==25||live.roadmapCount!==7||live.screens?.items?.length!==76||live.decisions?.items?.length!==25||live.roadmap?.items?.length!==7||live.decisions.fullyApproved!==1||live.decisions.active!==24||!Array.isArray(live.notes?.items)||!live.decisions.items.some(x=>x.id==='PENDING-19'&&x.isFullyApproved!==true&&!!x.status))throw Error('GOOGLE_SOURCE_PARITY_FAILED');
window.__iaLive=live;
window.__iaSheetRowById=Object.fromEntries(live.screens.items.map((x,i)=>[x.screenId,i+2]));
const source=JSON.parse(document.getElementById('sitemap-json').textContent);
const current=new Map(live.screens.items.map(x=>[x.screenId,x]));
if(source.items.length!==76||source.items.reduce((n,x)=>n+(x.features||[]).length,0)!==190||source.items.reduce((n,x)=>n+(x.actions||[]).length,0)!==49||source.items.some(x=>!current.has(x.id)))throw Error('V03_REFERENCE_INVALID');
source.items=source.items.map(x=>{
const now=current.get(x.id),status=/향후|보류/.test(now.status)?'future':/예정/.test(now.status)?'scheduled':'planning';
return {...x,name:now.name,description:now.details||x.description,path:now.plannedRoute?.startsWith('/')?now.plannedRoute:x.path,status,implementation:'NOT_VERIFIED',isUiApproved:false,policyApproved:false,liveStatus:now.status,liveQA:now.qaVerified,livePhase:now.phase,lowfiFile:'',lowfiLabel:'과거 v0.9 미승인 후보'};});
document.getElementById('sitemap-json').textContent=JSON.stringify(source).replace(/</g,'\\u003c');
const pending=live.decisions.items.map((x,i)=>({id:x.id,title:x.name,description:x.question,status:x.status,related:x.relatedScreens,default:x.isFullyApproved?'현재 원장 완전 승인. 고객 UI/배포 승인 아님':'현재 원장 검토 사항. 운영 및 개발 승인 아님',row:i+2,isFullyApproved:x.isFullyApproved}));
document.getElementById('pending-json').textContent=JSON.stringify(pending).replace(/</g,'\\u003c');
const notice=document.querySelector('#view-pending .notice');
if(notice)notice.textContent='Google 인증 원장 / 25건 · 완전 승인 1건 · 검토 24건. PENDING-19 운영 세부 검토 중. 작성은 Google 원장에서만, 포털 쓰기는 비활성화.';
const banner=document.getElementById('ia-live-banner');
banner.textContent='OWNER 전용 · Google Sheets 인증 읽기 전용 / 화면 76 · 검토 25 · 사업 7단계 · 의견 '+live.notes.items.length+'건 · v0.3 기획용 UI / LOWFI 미승인';

`;
const after=String.raw`
// Keep the original 8 interactive views, focus trap, SVG, routes and print behavior.
const liveData=window.__iaLive;
const policyNotice=document.querySelector('#view-policy .notice');
if(policyNotice)policyNotice.textContent='현재 Google 원장: 검토 25개 · 완전 승인 1개 · 운영세부 검토 24개. PENDING-19는 일부 요건과 운영 세부 검토를 구분. IA/LOWFI 사용자 승인 없음.';
const policyDesc=document.querySelector('#view-policy .sect p');
if(policyDesc)policyDesc.textContent='아래 네 정책 카드는 원본 v0.3 기획 참고용입니다. 현재 승인 상태는 향후 검토 25건 원장으로 판단합니다.';
document.querySelectorAll('#policy-grid .policycard').forEach((card,i)=>{
 const id=['PENDING-19','PENDING-20','PENDING-01','PENDING-22'][i];
 const current=liveData.decisions.items.find(x=>x.id===id);
 const overline=card.querySelector('.overline'),paragraph=card.querySelector('p'),notice=card.querySelector('.notice');
 if(i===0){const title=card.querySelector('h3');if(title)title.textContent='사업자 검증·농가 승인가격 확정 후 예상 납품가 공개';}
 if(overline)overline.textContent=id+' · 현재 원장 '+(current?.status||'검토 정보 없음');
 if(paragraph)paragraph.textContent=current?.question||'현재 Google 원장 검토 내용을 확인할 수 없습니다.';
 if(notice)notice.textContent=(current?.isFullyApproved?'해당 항목의 요건 완전 승인':'운영·개발 세부 검토 및 최종 승인 별도')+' · 화면 구현·로우파이 사용자 승인과 별개';
});
const milestone=document.getElementById('roadmap');
if(milestone){
 const section=document.createElement('div');section.className='card';section.style.marginBottom='18px';
 const h=document.createElement('h3');h.textContent='현재 Google 사업 로드맵 Stage0~6 · READ ONLY';section.append(h);
 for(const x of liveData.roadmap.items){const row=document.createElement('div');row.className='ruleline';row.style.margin='12px 0';const label=document.createElement('strong');label.textContent=x.stage+' · '+x.goal+' · '+x.status;const description=document.createElement('p');description.textContent=x.description;row.append(label,description);section.append(row)}
 const historical=document.createElement('h3');historical.textContent='기술 IA R0~R6 · 원본 v0.3 과거 기획 참고 (실제 구현 승인 아님)';
 milestone.before(section,historical);
}
const feedback=document.getElementById('view-feedback');
if(feedback){
 const h=document.createElement('h3');h.textContent='실제 Google 의견 기록 '+liveData.notes.items.length+'건 · 읽기 전용';feedback.append(h);
 for(const n of liveData.notes.items){
  const d=document.createElement('details');d.className='pending-entry';const summary=document.createElement('summary');summary.textContent=(n.screenOrDecisionId||'미연결')+' · '+(n.date||'일자 미기재')+' · '+(n.handlingStatus||'검토 중');const p=document.createElement('p');p.textContent=n.text||'';d.append(summary,p);feedback.append(d);
 }
}
const query=new URLSearchParams(location.search);
const aliases={screens:'sitemap',decisions:'pending',notes:'feedback',guide:'feedback'};
const alias=aliases[query.get('view')];
if(alias){
 const target=document.querySelector('[data-view="'+alias+'"]');
 if(target)target.click();
}
if(query.get('screen')&&/^[FUPCA]\d{2}$/.test(query.get('screen')))document.querySelector('[data-screen="'+query.get('screen')+'"]')?.click();
}catch(error){
 console.error('IA_SOURCE_VERIFICATION_FAILED',String(error.message||error));
 const banner=document.getElementById('ia-live-banner');
 if(banner)banner.textContent='Google 원장 또는 기획 자료 검증에 실패했습니다. 새로고침해 주세요. 미승인 기록을 임의 표시하지 않습니다.';
}finally{
 try{await attachLogout()}catch{ /* The account control requires an active IA session. */ }
}
})();
`;
export function v03OwnerHtml(nonce){
let s=ORIGINAL_V03_SOURCE;
const swaps=[
 ['order.ooo — 기획 사이트맵 v0.2 / 계층형','order.ooo — 인증 IA v0.3 원본 화면 / Google 실원장'],
 ['order.ooo Planning IA v0.2','order.ooo Planning IA v0.3'],
 ['PLANNING / HIERARCHICAL IA · v0.2','PLANNING / HIERARCHICAL IA · v0.3'],
 ['페이지 구조 미리보기','원본 v0.3 미승인 기획용 구조 미리보기'],
 ['이 화면의 핵심 기능','v0.3 미승인 기획용 핵심 기능'],
 ['전체 22개 · 미결정 21개 · 승인 완료 1개 (사업자등록증 제출 시점).','현재 Google 원장 검증 중 · 사용자 승인과 서비스 구현은 별도입니다.'],
 ['의사결정 대장: 전체 22개 ID / 활성 검토 21건. PENDING-01 승인, PENDING-19 일부 승인·상세 검토, PENDING-20/21/22 미결정.','Google 원장 검토 25건 · 완전 승인 1건 · 상세 검토 24건. PENDING-19 운영세부 검토 진행 중.'],
 ['정책 승인</b>회원 예상가격 / 매장 추가 순서 / 등록증 제출 시점 / 이메일 우선 (4건)','정책 검토</b>현재 원장 25건 중 완전 승인 1건 · 운영 세부와 UI 수락 별도'],
 ['Delta146 사용자 선택 네 가지는 정책 확정.','과거 v0.3 기획 참조와 현재 Google 승인 상태는 별도입니다.'],
 ['counts.scheduled+counts.future','((counts.scheduled||0)+(counts.future||0))'],
 ["'예정 '+counts.scheduled+' / 보류 '+counts.future","'예정 '+(counts.scheduled||0)+' / 보류 '+(counts.future||0)"],
 ["let isapproved=q.id==='PENDING-01', isfuture=","let isapproved=!!q.isFullyApproved, isfuture="],
 ['screenToRow[id]||2','(window.__iaSheetRowById||{})[id]||2']
];
for(const [a,b] of swaps)s=s.replace(a,b);
// MSG-20261018-0296: amend outdated v0.3 COPY only, not the archived screen graph.
// PENDING-01 is fully approved; PENDING-19 business verification operating details remain in review.
const currentRegistrationCopy=[
 ["desc:'이 시점 사업자등록증 제출'","desc:'가격 열람 전 검증한 서류 재사용·변경 시 재확인'"],
 ["desc:'실제 승인·조건 일치 품목만 공개'","desc:'사업자정보·등록증·국세청·소속 검증 후 승인가격 공개'"],
 ["['사업자등록증 심사','F02 → A02 → F03','실제 납품 신청시에 증빙 접수·보완·승인']","['사업자 자격 확인·납품 신청 심사','F07 → A03 → F01 → F02 → A02 → F03','가격 열람 신청 전 사업자정보·등록증·국세청·소속 확인. F02에서는 검증 서류 재사용·재확인, 미제출·변경 시 보완']"],
 ["'실제 신청·등록증 심사'","'실제 신청·증빙 재확인'"],
 ['"purpose":"실제 납품 신청 단계에서 사업자등록증 제출"','"purpose":"실제 가격 열람 자격 검증 후 F02에서 증빙 재사용·변경 시 보완"'],
 ['"description":"사업자 정보·사업자등록증·개인정보동의·실제 신청"','"description":"검증된 사업자정보·서류 재확인·개인정보동의·실제 신청"'],
 ['"등록증 이미지/PDF 업로드"','"검증된 등록증 재사용·미제출/변경 시 업로드"'],
 ['"서류와 납품 신청 제출"','"기존 증빙 확인 후 납품 신청"'],
 ["'비회원 입력·이메일 가입·예상가격 확인에는 필요 없습니다. 실제 납품 신청(F02)에 제출합니다.'","'F17 비회원 견적과 F07 이메일 가입 자체에는 서류가 필요 없습니다. 실제 승인 납품가 열람 요청 전 사업자정보·등록증·국세청·소속을 검증합니다. F02 신청에서는 검증된 증빙을 재사용하고 변경·누락 시 재확인합니다.'"],
 ["'이메일 인증 회원은 공급자·관리자가 승인하고 상품·지역·물량·배송 조건이 맞는 예상 납품가만 확인합니다.'","'이메일 가입만으로 가격이 공개되지 않습니다. 사업자정보·등록증·국세청·소속 검증 후 상품·지역·물량·배송 조건이 맞는 실제 승인 납품가격을 조건부 확인합니다.'"],
];
for(const [from,to] of currentRegistrationCopy){
 if(!s.includes(from))throw Error('V03_POLICY_COPY_ANCHOR_MISSING: '+from);
 s=s.replace(from,to);
}

s=s.replace(/(<script id="pending-json" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+'[]'+b);
const toolStyles=String.raw`
.sidebar nav .ia-tool-link{color:#afc5cd;background:transparent;border:1px solid transparent;text-decoration:none;text-align:left;display:flex;align-items:center;gap:13px;border-radius:11px;padding:12px 14px;width:100%;font-size:14px;font-weight:650;min-height:44px;line-height:1.4}
.sidebar nav .ia-tool-link span{color:#7e9fac;font-size:12px;font-weight:800}.sidebar nav .ia-tool-link:hover{background:#20414e}.sidebar nav .ia-tool-link:focus-visible{outline:3px solid #46aa93;outline-offset:3px}
.sidebar nav .ia-tool-fallback{padding:0 14px;color:#7e9fac;font-size:11px}.sidebar nav .ia-tool-fallback a{color:#afc5cd}.sidebar nav .ia-tool-label{padding:13px 14px 2px;color:#7e9fac;font-size:11px;font-weight:700}
html,body,.sidebar,#nav{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar,.sidebar::-webkit-scrollbar,#nav::-webkit-scrollbar{display:none}
@media(min-width:981px){.sidebar{overflow-y:auto}}@media(max-width:980px){.sidebar nav .ia-tool-link{width:auto;min-width:max-content;white-space:nowrap}}@media(max-width:640px){.sidebar nav .ia-tool-link{width:100%;white-space:normal;min-width:0}}
`;
s=s.replace('</style>','\n'+UX_CSS+'\n'+toolStyles+'</style>');
// Keep QA in the existing IA menu, with a real user-activated new-window link.
// It remains available even when the live Google dashboard reports a loading error.
const tools='<div class="ia-tool-label">검토 도구</div><a class="ia-tool-link" href="/ia?view=qa-lab" target="_blank" rel="noopener noreferrer" aria-label="QA랩 새 창에서 열기"><span>09</span>QA랩</a><details class="ia-tool-fallback"><summary>새 창이 열리지 않을 때</summary><a href="?view=qa-lab">이 탭에서 QA랩 열기</a></details><a class="ia-tool-link" href="/ia?view=pricing-r3"><span>10</span>계란 가격표·배송 정책</a>';
s=s.replace('</nav><div class="sidefoot">',tools+'</nav><div class="sidefoot">');
s=s.replace('<body>','<body><div id="ia-live-banner" style="padding:10px 18px;background:#eaf6f1;color:#164e43;font-size:12px;border-bottom:1px solid #cbe6d9;line-height:1.7" role="status">OWNER · Google 원장 인증 확인 중</div>');
s=s.replace('<script>','<script nonce="'+nonce+'">'+prelude);
s=s.replace('</script></body></html>',after.replace('}catch(error){',UX_RUNTIME+'\n}catch(error){')+'</script></body></html>');
return s;
}
