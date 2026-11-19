// QA 1.0 outer tool. Product documents are delivered separately through the authenticated artifact API.
import {approvedWidths} from './approved-width.mjs';
import {approvedShellStyle} from './approved-shell-style.mjs';

const additions = `
html,body{overflow:hidden}
.lab-drawer:not([hidden]){visibility:visible;transform:translateX(0)}
.lab-stage iframe{display:block;width:100%;height:100%;border:0;background:white}
.preview-bound{box-sizing:content-box}
#focus-unit{max-width:100%}
.lab-bottomline button:hover,.overview-record:hover{text-decoration:underline}
#pick-cancel{color:#315de6}
.lab-toast:empty{display:none}
#notes>article{border-radius:12px;background:#f9fafb;border:1px solid #e5e8eb;padding:12px;margin:10px 0;overflow-wrap:anywhere}
#notes>article p{white-space:pre-wrap;color:#333d4b;margin:8px 0}
#notes>article small{display:block;font-size:10px;color:#8b95a1}
#notes button,#other-width-history button,.qa-inline-button,#filters button,.lab-drawer-body .inline-action{border:0;border-radius:7px;background:#f2f4f6;padding:6px 9px;color:#4e5968;font-size:10px;margin:2px}
#notes .feedback-status{display:flex;gap:4px;margin:10px 0 6px}
#notes .feedback-status button{flex:1;margin:0;min-height:30px}
#notes .feedback-status [aria-pressed=true][data-feedback-state=unresolved]{background:#fff0e7;color:#b34e1d}
#notes .feedback-status [aria-pressed=true][data-feedback-state=recheck]{background:#e9efff;color:#315de6}
#notes .feedback-status [aria-pressed=true][data-feedback-state=resolved]{background:#dff4eb;color:#087f5b}
#notes .feedback-status button:focus-visible{outline:2px solid #315de6;outline-offset:2px}
#notes article[data-feedback-status=resolved]{border-left:3px solid #22a078}
#notes article[data-feedback-status=recheck]{border-left:3px solid #315de6}
#filters button[aria-pressed=true]{color:#315de6;background:#eaeefa}
#filters{display:flex;gap:4px;flex-wrap:wrap}
.r3-review-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
.r3-review-metrics>button{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:12px 8px;border:0;border-radius:10px;background:#f2f4f6;text-align:left}
.r3-review-metrics>button:hover{background:#eaeefa}
.r3-review-metrics>button strong{color:inherit}
.lab-drawer-body label.review-import-button{position:relative;display:flex;justify-content:center;cursor:pointer;font-weight:400}
.review-import-button input[type=file]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.review-import-button:focus-within{outline:3px solid #93afff;outline-offset:2px}
.r3-review-metrics [data-metric=previous]{color:#c5523b}.r3-review-metrics [data-metric=changed]{color:#315de6}.r3-review-metrics [data-metric=approved]{color:#09816b}.r3-review-metrics [data-metric=unreviewed]{color:#6b7684}
#conflict{background:#fff0de;border-radius:8px;padding:10px;white-space:pre-wrap}
#buyer{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#buyer select{max-width:100%}
#choose{background:#fff;color:#333d4b;width:min(620px,calc(100% - 24px));max-height:85dvh;padding:18px;border:0;border-radius:16px}
#choose::backdrop{background:#191f2844}
#choose .controls{display:flex;gap:8px;align-items:center}
#choose input{margin:0;flex:1}
#tiles{margin-top:12px}#tiles .tile{display:flex;gap:6px;align-items:center;border-bottom:1px solid #f2f4f6}#tiles button{background:transparent;border:0;color:#4e5968;font-size:11px;padding:10px 6px;text-align:left}#tiles button:first-child{display:grid;flex:1}#tiles button span{font-size:10px;color:#8b95a1}
.lab-stage[data-mode=board] .preview-bound .board-pin-target{pointer-events:auto}
#figma-open[hidden]{display:none}
#qa-session-notice{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:90;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 16px;max-width:calc(100vw - 32px);border-radius:12px;background:#fff0df;color:#63360b;box-shadow:0 4px 24px #191f2820;font-size:12px}
#qa-session-notice[hidden]{display:none}
#qa-session-notice a,#qa-session-notice button{padding:7px 10px;border:0;border-radius:7px;background:white;color:inherit;white-space:nowrap}
`;

export const shellStyles = approvedShellStyle+'\n'+additions;

const wordmark = "<span class=\"brand\" aria-label=\"Order\"><span>Order</span><span class=\"brand-dot\">.</span><svg xmlns=\"http://www.w3.org/2000/svg\" data-code1-jelly=\"v2\" viewBox=\"-36 -40 572.045 280\" width=\"572\" height=\"280\" class=\"brand-mark\" aria-hidden=\"true\" focusable=\"false\">\n\n<g transform=\"translate(100 100)\"><path data-jelly=\"0\" fill=\"#F5800B\" d=\"M100 0C100 26.522 89.464 51.957 70.711 70.711C51.957 89.464 26.522 100 0 100C-26.522 100 -51.957 89.464 -70.711 70.711C-89.464 51.957 -100 26.522 -100 0C-100 -26.522 -89.464 -51.957 -70.711 -70.711C-51.957 -89.464 -26.522 -100 0 -100C26.522 -100 51.957 -89.464 70.711 -70.711C89.464 -51.957 100 -26.522 100 0Z\"/></g>\n<g transform=\"translate(250.023 100)\"><path data-jelly=\"1\" fill=\"#F59E0B\" d=\"M100 0C100 26.522 89.464 51.957 70.711 70.711C51.957 89.464 26.522 100 0 100C-26.522 100 -51.957 89.464 -70.711 70.711C-89.464 51.957 -100 26.522 -100 0C-100 -26.522 -89.464 -51.957 -70.711 -70.711C-51.957 -89.464 -26.522 -100 0 -100C26.522 -100 51.957 -89.464 70.711 -70.711C89.464 -51.957 100 -26.522 100 0Z\"/></g>\n<g transform=\"translate(400.045 100)\"><path data-jelly=\"2\" fill=\"#FFCC00\" d=\"M100 0C100 26.522 89.464 51.957 70.711 70.711C51.957 89.464 26.522 100 0 100C-26.522 100 -51.957 89.464 -70.711 70.711C-89.464 51.957 -100 26.522 -100 0C-100 -26.522 -89.464 -51.957 -70.711 -70.711C-51.957 -89.464 -26.522 -100 0 -100C26.522 -100 51.957 -89.464 70.711 -70.711C89.464 -51.957 100 -26.522 100 0Z\"/></g>\n</svg></span>";
const widthOptions = (widths,selected) => widths.map(width=>'<option'+(width===selected?' selected':'')+'>'+width+'</option>').join('');
export function approvedShellBody(){
  return `
<div class="lab-app" id="lab">
  <aside class="lab-sidebar" aria-label="QA 화면 목록">
    <div class="lab-wordmark">${wordmark}<small>QA 1.0</small></div>
    <input class="lab-search" id="catalog-search" type="search" placeholder="화면·경로 찾기" aria-label="QA 화면 찾기">
    <div class="lab-role-filter" aria-label="사용자별 화면">
      <button data-role="current" class="active">현재 범위</button><button data-role="customer">매장 고객</button><button data-role="supplier">공급자</button><button data-role="admin">관리자</button><button data-role="common">공통</button><button data-role="future">향후 검토</button><button data-role="all">전체</button>
    </div>
    <nav class="lab-catalog" id="catalog" aria-label="QA 화면"></nav>
    <div class="lab-sidebar-footer"><button data-lab-action="overview" id="overview-button">전체 검토 현황 <span id="open-total"></span></button><div id="state-total"></div><span>진행 방식 1.0 · 검토판 R3</span></div>
  </aside>
  <main class="lab-main">
    <header class="lab-topbar">
      <button class="lab-mobile-menu" id="open" data-lab-action="nav" aria-label="화면 목록 열기">목록</button>
      <div class="lab-context"><h1 class="lab-title" id="caption"></h1><p class="lab-subtitle" id="current-description"></p></div>
      <div class="lab-mode" aria-label="보기 방식"><button data-mode="focus" class="active">집중 보기</button><button data-mode="board">상태 한눈에</button><button data-mode="dual">모바일·PC</button></div>
      <button id="new" class="pin-mode-button" data-lab-action="pin-mode" aria-pressed="false">위치 코멘트</button>
      <button id="export" class="export-current" data-lab-action="export-html">개별 HTML</button>
      <button class="lab-note-btn" id="points" data-lab-action="notes">검토</button>
    </header>
    <nav class="lab-states" id="state-buttons" aria-label="화면 상태"></nav>
    <section class="lab-stage" id="surface" data-mode="focus" aria-label="화면 미리보기">
      <div class="lab-stage-heading"><span id="stage-hint">화면에서 직접 조작하거나 위치 코멘트를 남겨 주세요.</span><span class="prototype-pill" id="prototype-badge">디자인 예시</span></div>
      <nav id="quote-candidates" hidden aria-label="실제 견적 입력"><a href="/ia?view=simple-r3#/form" target="_blank" rel="noopener">간편 견적 입력 열기</a> · <a href="/ia?view=detailed-r3#/form" target="_blank" rel="noopener">상세 견적 입력 열기</a></nav>
      <section hidden id="buyer" aria-label="사업장 인증 견적"><button id="quote-open">내 견적 불러오기</button><select id="buyer-sites" aria-label="인증 사업장"></select><select id="buyer-quotes" aria-label="기존 견적"></select><section id="snapshot" aria-label="선택한 견적"></section></section>
      <div class="preview-list" id="preview-list">
        <section class="preview-unit mobile" id="focus-unit" data-width="390" data-height="844">
          <div class="preview-caption"><strong id="focus-label">모바일</strong><button id="focus-viewport" class="viewport-review active" aria-label="이 화면 크기 검토">390px</button></div>
          <div class="preview-bound" style="width:390px;height:844px"><div class="preview-canvas" style="width:390px;height:844px"><iframe id="frame" sandbox="allow-scripts" title="선택한 화면"></iframe></div></div>
        </section>
      </div>
    </section>
    <footer class="lab-bottomline"><span id="current-case"></span><div class="shortcut"><span>상태</span><kbd>←</kbd><kbd>→</kbd><span>모아 보기</span><kbd>G</kbd><span>코멘트</span><kbd>C</kbd></div><span><button hidden id="pick-cancel">위치 선택 닫기</button><button data-lab-action="prev">이전</button><button data-lab-action="replay">다시 보기</button><button data-lab-action="next">다음</button></span></footer>
  </main>
  <aside class="lab-drawer" id="drawer" aria-label="검토와 피그마 작업" hidden>
    <div class="lab-drawer-head"><h2>검토 기록</h2><button id="close-drawer" data-lab-action="close-drawer" aria-label="검토 기록 닫기">✕</button></div>
    <nav class="drawer-tabs" aria-label="검토 기록"><button data-drawer-tab="review" class="active">이 화면</button><button data-drawer-tab="overview">전체</button><button data-drawer-tab="settings">설정·파일</button></nav>
    <div class="lab-drawer-body" id="drawer-review" data-drawer-panel="review">
      <div id="blocks">
        <h3 id="review-heading">이 화면 검토</h3><div id="review-viewports" class="review-viewports"></div>
        <div class="review-options"><button data-review="unreviewed">미검토</button><button data-review="approved">사용자 통과</button><button data-review="changes_requested">수정 요청</button></div>
        <label for="review-note">화면 의견<textarea id="review-note" maxlength="8000" placeholder="수정할 부분을 남겨 주세요."></textarea></label>
        <button class="drawer-button" id="save-review-note">화면 의견 저장</button><output id="review-note-state" aria-live="polite"></output>
        <details id="history-details" hidden><summary>가져온 이전 기록</summary><div id="record-history"></div></details>
        <div id="other-width-history"></div>
        <section class="review-comments"><div class="review-section-head"><h3>코멘트 <span id="comment-count"></span></h3><button id="general" data-lab-action="page-comment">전체 의견 추가</button></div>
          <div class="comment-filters"><button data-comment-filter="open" class="active">미해결</button><button data-comment-filter="recheck">재검토</button><button data-comment-filter="resolved">해결</button><button data-comment-filter="all">전체</button></div>
          <div id="notes"></div>
        </section>
        <details class="figma-details" open><summary>피그마 작업 <span id="figma-status-badge"></span></summary>
          <label for="figma-stage">진행 상태<select id="figma-stage"><option value="none">미착수</option><option value="exported">HTML 내보냄</option><option value="imported">피그마로 가져옴</option><option value="editing">수정 중</option><option value="commented">코멘트 완료</option><option value="reviewed">검토 완료</option></select></label>
          <label for="figma-url">프레임 링크<input id="figma-url" type="url" placeholder="https://www.figma.com/design/…" maxlength="2000"></label>
          <a id="figma-open" target="_blank" rel="noopener noreferrer" hidden>피그마에서 열기</a>
          <label for="figma-memo">피그마 변경 메모<textarea id="figma-memo" maxlength="4000" placeholder="편집한 내용이나 남긴 코멘트를 기록해 주세요."></textarea></label>
          <button class="drawer-button" id="link-figma">피그마 작업 기록 저장</button><p id="export-record"></p>
        </details>
      </div>
      <details class="figma-details" id="motion-review"><summary>모션 재생·출처</summary>
        <p id="motion-build"></p><div id="motion-actions"></div><output id="motion-note" aria-live="polite"></output><div id="motion-sources"></div>
      </details>
      <div id="authoring" hidden>
        <p id="point-state" class="comment-location"></p><button class="qa-inline-button" id="reposition">위치 다시 선택</button>
        <label for="body-text">코멘트<textarea id="body-text" maxlength="10000" placeholder="수정할 부분을 남겨 주세요."></textarea></label><p id="conflict" hidden></p>
        <div class="composer-actions"><button id="draft">임시저장</button><button class="primary" id="save">의견 저장</button></div>
      </div>
    </div>
    <div class="lab-drawer-body" id="drawer-overview" data-drawer-panel="overview" hidden>
      <div id="review-summary" class="review-summary r3-review-metrics"></div>
      <h3>검토 항목</h3><div id="filters" class="overview-filter" aria-label="검토 상태"></div>
      <button id="next" class="drawer-button">다음 미해결</button><div id="review-records"></div>
      <h3>통합 내보내기</h3><button id="backup" data-lab-action="export-review" class="drawer-button primary">코멘트·피그마 기록 JSON</button>
      <button id="backup-csv" data-lab-action="export-csv" class="drawer-button">검토 현황 CSV</button><button id="backup-md" data-lab-action="export-markdown" class="drawer-button">전체 코멘트 문서</button>
      <label class="drawer-button review-import-button" for="review-import">검토 JSON 열기<input type="file" id="review-import" accept="application/json,.json"></label><output id="review-import-result" aria-live="polite"></output>
    </div>
    <div class="lab-drawer-body" id="drawer-settings" data-drawer-panel="settings" hidden>
      <h3>화면 크기</h3>
      <label for="mobile-width">모바일<select id="mobile-width">${widthOptions(approvedWidths.filter(w=>w<768),390)}</select></label>
      <label for="desktop-width">PC<select id="desktop-width">${widthOptions(approvedWidths.filter(w=>w>=768),1280)}</select></label>
      <label class="check-setting"><input type="checkbox" id="scale-fit" checked>검토 공간에 맞추기</label>
      <label class="check-setting"><input type="checkbox" id="motion-enabled" checked>모션 재생</label>
      <label class="check-setting"><input type="checkbox" id="show-resolved-pins">해결된 위치 코멘트 표시</label>
      <label class="sr-only" for="width">현재 검토 폭</label><select id="width" hidden><option value="0">원본 폭</option>${widthOptions(approvedWidths)}</select>
      <label for="version">비교할 화면<select id="version"><option value="current">이번 판</option><option value="prior-r3">이전 R3 검토판</option><option value="previous">R2 화면</option></select></label><span class="sr-only" id="version-mark"></span>
      <label class="check-setting"><input type="checkbox" id="audit-demo">실행 검증용 기록 포함</label>
      <button id="hide-pins" class="drawer-button" aria-pressed="false">핀 숨기기</button><button class="drawer-button" id="sync">다시 읽기</button>
      <h3>개별 파일</h3><button id="export-editable" class="drawer-button" data-lab-action="export-html">피그마 편집용 HTML</button><button id="export-runnable" class="drawer-button">실행용 HTML</button>
      <h3>업무 화면</h3><a class="source-link" href="/ia?view=simple-r3">간편 견적</a><a class="source-link" href="/ia?view=detailed-r3">상세 견적</a><a class="source-link" href="/ia?view=pricing-r3">가격·배송</a><a class="source-link" href="/ia?view=roles-r3">역할별 업무</a>
    </div>
  </aside>
  <dialog id="choose"><div class="controls"><input class="lab-search" id="search" type="search" aria-label="화면·의견 검색" placeholder="화면 또는 의견 검색"><button class="qa-inline-button" id="close-choose">닫기</button></div><div id="tiles"></div></dialog>
</div>
<div class="lab-toast" id="live" role="status" aria-live="polite"></div>`;
}
