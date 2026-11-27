// The public illustration has no quote input. The same four shapes are used for
// every price, comparison outcome, site and viewer, including first paint.
export function quoteLockMarkup(audience, confirmedSaving = false) {
  const guest = audience === 'guest';
  const showSaving = confirmedSaving === true;
  const prefix = guest ? '회원가입 및 사업장 인증 후' : '사업장 인증 후';
  const copy = showSaving ? '절감되는 금액을 확인해 보세요' : '납품가를 확인해 보세요';
  return `<article class="oq-lock" data-order-result data-state="${guest ? 'guest' : 'unverified'}">
    <header class="oq-lock-heading"><h2>${showSaving ? '최저가를 찾았어요!' : '납품가 비교 결과'}</h2><p>${prefix}<br>${copy}</p></header>
    <svg class="oq-lock-graph" aria-hidden="true" focusable="false" viewBox="0 0 327 396" fill="none">
      <rect x="88" y="149" width="67" height="7" rx="3.5" fill="#b8c2d0"/>
      <rect x="173" y="201" width="67" height="7" rx="3.5" fill="#9bacc2"/>
      <path d="M95 396V182Q95 174 103 174H140Q148 174 148 182V396Z" fill="#d9dee5"/>
      <path d="M180 396V234Q180 226 188 226H225Q233 226 233 234V396Z" fill="#91a6d1"/>
    </svg>
    <div class="oq-lock-gate"><span class="oq-lock-symbol" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M10.6667 13.3332V7.99984C10.6667 6.58535 11.2286 5.2288 12.2288 4.2286C13.229 3.22841 14.5855 2.6665 16 2.6665C17.4145 2.6665 18.771 3.22841 19.7712 4.2286C20.7714 5.2288 21.3333 6.58535 21.3333 7.99984V13.3332M8 13.3332H24V27.9998H8V13.3332Z" stroke="white" stroke-width="2.26667" stroke-linecap="round" stroke-linejoin="round"/>
    </svg></span><button type="button" class="oq-lock-primary" data-action="${guest ? 'signup' : 'verify'}">${guest ? '사업장 회원가입' : '사업장 인증하기'}</button></div>
    <button type="button" class="oq-lock-consult" data-action="consult">상담 예약</button>
  </article>`;
}

// The IA shell owns the 78px application header. Keep the graph, icon and
// actions anchored inside its remaining viewport at every screen size.
export const quoteLockCss = `
[data-order-result].oq-lock{box-sizing:border-box;isolation:isolate;display:block;position:relative;margin:0 auto;padding:0;width:100%;max-width:590px;height:clamp(528px,calc(100svh - 78px),842px);background:#fff;color:#20272b;text-align:center;font-family:var(--font,Pretendard,sans-serif)}
.oq-lock .oq-lock-heading{position:absolute;top:8.27%;left:24px;right:24px;background:none;padding:0;margin:0;color:#20272b;text-align:center}
.oq-lock .oq-lock-heading h2{font:700 26px/35.5px var(--font,Pretendard,sans-serif);letter-spacing:-.045em;margin:0}
.oq-lock .oq-lock-heading p{font:400 14px/22.5px var(--font,Pretendard,sans-serif);letter-spacing:-.025em;color:#545e6c;margin:12px 0 0}
.oq-lock .oq-lock-graph{display:block;position:absolute;top:24.53%;left:24px;width:calc(100% - 48px);height:52.8%;filter:blur(10px);opacity:.74;pointer-events:none}
.oq-lock .oq-lock-gate{position:absolute;top:33.73%;left:0;right:0;display:grid;justify-items:center;gap:24px}
.oq-lock .oq-lock-symbol{display:grid;place-items:center;width:76px;height:76px;border-radius:26px;background:#333d4b}
.oq-lock button.oq-lock-primary,.oq-lock button.oq-lock-consult{appearance:none;cursor:pointer;border:0;box-shadow:none;letter-spacing:-.025em;padding:0}
.oq-lock button.oq-lock-primary{height:52px;min-width:131px;border-radius:14px;background:#315de6;color:#fff;font:600 15px/22.5px var(--font,Pretendard,sans-serif)}
.oq-lock button.oq-lock-consult{position:absolute;left:24px;bottom:30px;width:calc(100% - 48px);height:54px;border-radius:12px;background:#f1f3f6;color:#313945;font:700 17px/25.5px var(--font,Pretendard,sans-serif)}
.oq-lock button:focus-visible{outline:3px solid #197ac4;outline-offset:3px}
`;

export function mountQuoteLock(host, markup, onAction) {
  host.innerHTML = markup;
  const article = host.querySelector('.oq-lock');
  host.dataset.state = article.dataset.state;
  for (const button of article.querySelectorAll('button[data-action]')) {
    button.onclick = () => onAction(button.dataset.action);
  }
}

export function installReviewQuoteLock(markup, mount) {
  (window.ORDER_DESIGN_MODULES ||= []).push({id:'quote-result', mount(root, initial, api) {
    const host = root.querySelector('[data-review-result]');
    const actions = {signup:['signup','empty'], verify:['business','empty'], consult:['role-consult','']};
    function display(state) {
      const audience = state === 'locked-guest' ? 'guest' : 'unverified';
      host.dataset.view = state;
      mount(host, markup(audience, api.reviewScenario === true), action => api.select(...actions[action]));
    }
    const update = event => display(event.detail.state);
    root.addEventListener('r3-result-state', update);
    display(initial);
    return () => {root.removeEventListener('r3-result-state', update);host.replaceChildren();};
  }});
}
