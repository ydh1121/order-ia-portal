import {mountAsyncMotion,asyncMotionCss} from './r3-async-motion.mjs';
import {createCommonMotion,createCommonControlPaint} from './r3-common-motion.mjs';
import {createCustomerControls} from './r3-customer-controls.mjs';
import {runRolePage} from './r3-role-client.mjs';
import {browserFunction} from './browser-source.mjs';
import {practiceCatalog,startRolePractice} from './r3-role-practice.mjs';
import {installProductWorkflowMotion,productWorkflowMotionCss} from './product-workflow-motion.mjs';
import {createEvidenceEditor} from './r3-evidence-client.mjs';
const labels={
  business:'사업장 확인',supply:'공급 참여 심사',catalog:'상품·출고 정보 심사',consult:'상담',reprice:'가격 재검토',delivery:'납품 신청',
  BUYER:'매장',SUPPLIER:'공급처',OPERATOR:'운영',DRAFT:'작성 중',REVIEW:'검토 대기',EVIDENCE_REQUIRED:'수동 심사 서류 필요',
  NEEDS_INFO:'보완 요청',VERIFIED:'확인 완료',REJECTED:'반려',REVOKED:'인증 취소',APPROVED:'승인',OPEN:'상담 접수',ANSWERED:'답변 확인',CLOSED:'종료',
  RECALCULATION_REQUESTED:'재산정 요청',REQUESTED:'납품 요청',ACCEPTED:'요청 수락',PAYMENT_REVIEW:'입금 검토 요청',PAYMENT_REVIEWED:'입금 검토 완료',SCHEDULED:'일정 확인',DISPATCHED:'출고 확인',ISSUE_REVIEW:'이상 접수',RECEIVED:'수령 확인',DOCUMENT_REVIEWED:'거래 문서 검토 완료',SETTLEMENT_REVIEW:'정산 검토 대기',SETTLEMENT_REVIEWED:'정산 검토 완료',CANCELLED:'취소',
  submit:'검토 요청',manual:'조회 장애 · 수동 심사',attach:'증빙 연결',supplement:'보완 요청',verify:'사업장 확인',reject:'반려',revoke:'인증 취소',approve:'승인',respond:'답변 처리',followup:'추가 문의',resolve:'종료',
  'request-price':'가격 재산정 요청',accept:'요청 수락','payment-request':'입금 검토 요청','payment-review':'입금 검토 확인',schedule:'일정 확인',dispatch:'출고 확인','report-issue':'이상 접수',reschedule:'일정 재조정',receive:'수령 확인','document-review':'거래 문서 검토','settlement-review':'정산 검토 요청',settle:'정산 검토 확인',cancel:'취소',resume:'이어서 작성',create:'새 업무',
  'link-requote':'다시 발급한 견적 연결',QUOTE_UPDATED:'새 견적 연결 완료',
  MISSING_EVIDENCE:'증빙 보완',SCOPE_MISMATCH:'소속 확인',INVALID_DETAILS:'입력 정보 확인',DELIVERY_EXCEPTION:'납품 이상',REVIEW_DECISION:'검토 결과',
};
export function renderR3RolePage(nonce){
  if(!/^[a-f0-9]{16,128}$/i.test(nonce))throw Error('INVALID_NONCE');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>내 업무 · Order</title><style>
  *{box-sizing:border-box} :root{font-family:system-ui,sans-serif;color:#18232a;background:#f6f7f9;line-height:1.5}body{max-width:74rem;margin:auto;padding:clamp(12px,4vw,48px)}[hidden]{display:none!important}
  a{color:#1d4b94;text-decoration:none}h1,h2,p{margin:0}header{display:flex;align-items:center;gap:16px;justify-content:space-between;margin-bottom:20px}
  #role-menu,#filters{display:flex;gap:6px;flex-wrap:wrap}#role-menu a,#filters button{padding:9px 13px;background:#e9edf1;color:#394552;border-radius:8px;font-weight:600}
  #role-menu a[aria-current=page],#filters [aria-pressed=true]{background:#1c344e;color:white}main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:16px}
  section.panel{min-width:0;border-radius:16px;padding:clamp(14px,3vw,28px);background:#fff}#detail:empty{display:none}
  #status{margin:10px 0;color:#44576d}#status:empty{margin:0}ul{padding:0;list-style:none}li{padding:9px 0;border-bottom:1px solid #edf0f4;overflow-wrap:anywhere}li small{display:block;color:#546477}
  button,input,select,textarea{font:inherit;max-width:100%;min-height:44px;box-sizing:border-box}button{background:#edf1f6;color:#233d55;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}button[type=submit],form>button:not([type]){background:#234ba7;color:white}
  label{display:grid;gap:4px;font-size:.92rem;font-weight:600;min-width:0}form{display:grid;gap:8px;margin:12px 0}form>div,form>div>div{display:grid;gap:8px}
  input,select,textarea{border:1px solid #cbd3dc;border-radius:7px;padding:8px;background:white;color:#1e2f3c}input:invalid:not(:placeholder-shown):focus{outline-color:#a33}input[type=checkbox]{width:22px;min-height:22px}
  #filter-bar{display:grid;gap:6px;margin:12px 0}#r3-practice{margin:18px 0}summary{cursor:pointer;min-height:40px}dl{display:grid;grid-template-columns:minmax(4rem,max-content) minmax(0,1fr);gap:7px 14px}dt{color:#526578}dd{margin:0;overflow-wrap:anywhere}
  #account-panel{position:relative;display:grid;gap:9px;background:white;border-radius:16px;padding:18px;margin:0 0 18px;max-width:34rem}#account-panel :focus-visible{outline-offset:2px}#detail details[data-case-action]{margin:8px 0;border-top:1px solid #dde3ec}#detail details[data-case-action]>summary{padding:9px 0;font-weight:600}

  ${asyncMotionCss}
  ${productWorkflowMotionCss}
  .role-badge{border-radius:1rem;background:#a72d43;color:white;display:inline-flex;min-width:1rem;justify-content:center;margin-left:5px;font:600 12px/1.45 system-ui;font-variant-numeric:tabular-nums}#role-search-tags{display:flex;gap:4px;flex-wrap:wrap}#role-search-tags button{padding:3px 7px;border-radius:5px}
  #account-panel{overflow:clip}#account-panel .customer-panel-page{display:grid;gap:9px;min-width:0}
  #account-panel .customer-panel-leaving{position:absolute;inset:18px;pointer-events:none}
  #queue-list>.signed-passes{padding:0;border:0;background:none;display:block}
  .signed-pass-tools,.signed-pass-pager{display:flex;align-items:center;gap:8px;margin:8px 0}
  .signed-pass-tools [aria-pressed=true]{background:#273e5e;color:white}
  .signed-pass-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:12px;touch-action:pan-y}
  .signed-pass{min-width:0;display:grid;align-content:start;gap:9px;border:1px solid #d8e0eb;border-radius:16px;background:#f5f7fb;padding:16px 14px}
  .signed-pass header{display:grid;gap:4px;background:none;color:inherit;padding:0}.signed-pass hr{width:100%;margin:4px 0;border:0;border-top:1px dashed #a5b4c6}
  .signed-pass-cards.deck{display:grid;isolation:isolate;margin:0 12px 22px 0}
  .signed-pass-cards.deck .signed-pass{grid-area:1/1;transform:translate(calc(var(--depth)*3px),calc(var(--depth)*5px)) rotate(calc(var(--depth)*.7deg))}
  @media(prefers-reduced-motion:no-preference){.signed-pass{transition:transform .3s cubic-bezier(.2,.8,.3,1)}}
  *{scrollbar-width:none}select[multiple]{scrollbar-width:thin}:focus-visible{outline:3px solid #3966bd;outline-offset:2px}
  @media(max-width:700px){main{grid-template-columns:minmax(0,1fr)}#detail:not(:empty){grid-row:1}body{padding:12px}}@media(prefers-reduced-motion:no-preference){#detail:not(:empty){animation:appear .15s ease-out}@keyframes appear{from{opacity:.4;transform:translateY(3px)}}}
  </style></head><body><header><h1>내 업무</h1><button hidden id="account-trigger" type="button" aria-expanded="false" aria-controls="account-panel">내 계정</button><a id="home" href="/ia?view=roles-r3">내 업무 홈</a></header>
  <section id="account-panel" aria-label="계정 패널" hidden></section>
  <nav id="role-menu" aria-label="내 역할의 업무"></nav><p role="status" id="status"></p>
  <main><section class="panel"><h2 id="section-title">지금 할 일</h2><div id="filter-bar" hidden><input id="query" type="search" placeholder="상호·업무·상태 검색" aria-label="업무 검색"><div id="role-search-tags" hidden></div><div id="filters" aria-label="업무 상태"><button data-filter="all">전체</button><button data-filter="todo">내가 처리할 일</button><button data-filter="done">종료</button></div></div>
  <ul id="queue-list"></ul><ul id="list"></ul><button type="button" hidden id="more">다음 50건</button><button type="button" id="refresh">새로고침</button>
  <form id="create" hidden></form></section><section class="panel" id="detail" aria-live="polite"></section></main>
  <section id="publication"></section><section id="r3-practice" hidden></section>
  <script nonce="${nonce}">(${browserFunction(installProductWorkflowMotion)})(window);(${browserFunction(runRolePage)})(${JSON.stringify(labels)},${browserFunction(createEvidenceEditor)},${browserFunction(createCustomerControls)},${browserFunction(mountAsyncMotion)},${browserFunction(createCommonMotion)},${browserFunction(createCommonControlPaint)});(${browserFunction(startRolePractice)})(document.getElementById("r3-practice"),${JSON.stringify(practiceCatalog())},${JSON.stringify(labels)})</script></body></html>`;
}
