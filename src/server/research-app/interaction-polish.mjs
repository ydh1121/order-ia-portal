/** Shared directional affordance for product controls, including panels mounted
 * after navigation. It does not own clicks, navigation, values or review UI. */
export function mountResearchArrowMotion(document, {signal} = {}) {
  const window = document.defaultView, NS = 'http://www.w3.org/2000/svg';
  const arrowPaths = new Map([['M15 5l-7 7 7 7', 'left'], ['M9 5l7 7-7 7', 'right']]);
  const selector = '.obm-chevron,.obm-back,[data-app-back],svg,button,a';
  let disposed = false;
  function glyph(direction) {
    const directionNode = document.createElement('span');
    directionNode.className = 'order-arrow-direction'; directionNode.dataset.direction = direction;
    directionNode.setAttribute('aria-hidden', 'true');
    const motion = document.createElement('span'); motion.className = 't-learn-chevron';
    const svg = document.createElementNS(NS, 'svg');
    for (const [name, value] of Object.entries({viewBox:'0 0 16 16',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round',focusable:'false'})) svg.setAttribute(name, value);
    for (const [part, d] of [['top', 'M6 4L10 8'], ['bot', 'M10 8L6 12']]) {
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d);
      path.setAttribute('class', 't-learn-arm t-learn-arm-' + part); svg.append(path);
    }
    motion.append(svg); directionNode.append(motion); return directionNode;
  }
  function enhance(element) {
    if (!element?.matches?.(selector) || element.closest('[data-research-annotation],.order-arrow-direction') || element.dataset.orderArrowEnhanced) return;
    const control = element.closest('button,a,[role="button"],[role="menuitem"]');
    if (!control || !control.closest('#order-single')) return;
    let direction;
    if (element.matches('.obm-back,[data-app-back]')) direction = 'left';
    else if (element.matches('.obm-chevron')) direction = 'right';
    else if (element.matches('button,a') && !element.querySelector('svg,img,input') && ['‹','›','←','→'].includes(element.textContent.trim())) direction = ['‹','←'].includes(element.textContent.trim()) ? 'left' : 'right';
    else if (element.tagName.toLowerCase() === 'svg' && element.children.length === 1) direction = arrowPaths.get(element.firstElementChild?.getAttribute('d'));
    if (!direction) return;
    if(element===control&&!control.getAttribute('aria-label')&&!control.getAttribute('aria-labelledby'))control.setAttribute('aria-label',direction==='left'?'이전 화면':'다음 화면');
    control.classList.add('t-learn'); element.dataset.orderArrowEnhanced = direction;
    if (element.tagName.toLowerCase() === 'svg') element.replaceWith(glyph(direction));
    else {element.replaceChildren(glyph(direction)); if (element !== control) element.setAttribute('aria-hidden', 'true');}
  }
  function scan(root) {
    if (disposed || !root?.querySelectorAll) return;
    enhance(root); for (const element of root.querySelectorAll(selector)) enhance(element);
  }
  const observer = new window.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
  });
  function dispose() {if (disposed) return; disposed = true; observer.disconnect(); signal?.removeEventListener('abort', dispose);}
  if (signal?.aborted) {dispose(); return dispose;}
  scan(document.body); observer.observe(document.body, {childList:true,subtree:true});
  signal?.addEventListener('abort', dispose, {once:true}); return dispose;
}

export const researchInteractionCss = String.raw`
/* Transitions.dev 24-learn-more-hover, pinned add5b467b13be16664d10fd888330ce2f3288b07.
   Existing semantic tokens are reused; only this product root supplies defaults. */
#order-single{--learn-shift:2px;--learn-spread:8deg;--learn-in:350ms;--learn-out:350ms;--learn-ease:cubic-bezier(0.22,1,0.36,1)}
.t-learn-chevron {
  display: inline-flex;
  transform: translateX(0);
  transition: transform var(--learn-out) var(--learn-ease);
}
.t-learn-arm {
  transform-box: view-box;
  transform-origin: 10px 8px;
  vector-effect: non-scaling-stroke;
  transition: transform var(--learn-out) var(--learn-ease);
}
.t-learn:hover .t-learn-chevron { transform: translateX(var(--learn-shift)); transition-duration: var(--learn-in); }
.t-learn:hover .t-learn-arm { transition-duration: var(--learn-in); }
.t-learn:hover .t-learn-arm-top { transform: rotate(var(--learn-spread)); }
.t-learn:hover .t-learn-arm-bot { transform: rotate(calc(var(--learn-spread) * -1)); }
@media (prefers-reduced-motion: reduce) {
  .t-learn-chevron, .t-learn-arm { transition: none !important; }
}
.order-arrow-direction{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0;width:20px;height:20px}
.order-arrow-direction[data-direction=left]{transform:rotate(180deg)}
.order-arrow-direction svg{display:block;width:20px;height:20px;flex:none}
#order-single .t-learn:disabled .t-learn-chevron,#order-single .t-learn:disabled .t-learn-arm{transform:none}
/* One surface and one neutral field palette throughout the account stack. */
#order-single .obm-panel{--paper:#fff;--surface:#f3f4f6;--ink:#20272b;--muted:#717982;--blue:#315de6;--obm-bg:#fff;--obm-hover:#f3f4f6;--obm-text:#20272b;--obm-muted:#717982;--obm-separator:#e9ebee;--obm-focus:#315de6}
#order-single .obm-panel .obm-menu.t-morph-menu{background:#fff;border:0;box-shadow:0 12px 36px rgb(24 39 58 / 18%);padding:12px}
#order-single .obm-panel .obm-page,#order-single .obm-panel .obm-panel-content{background:transparent}
#order-single .obm-panel .obm-row{background:transparent;border:0;box-shadow:none;min-height:48px;gap:12px}
#order-single .obm-panel .obm-row:is(:hover,:focus-visible){background:#f3f4f6}
#order-single .obm-panel .obm-panel-head{height:44px;min-height:44px;align-items:center;gap:8px;margin:0 0 12px}
#order-single .obm-panel .obm-back{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;min-width:32px;height:44px;min-height:44px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;line-height:1}
#order-single .obm-panel .obm-heading{align-self:center;margin:0!important;line-height:24px!important}
#order-single .obm-panel .obm-chevron{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;line-height:1}
#order-single .obm-panel .obm-row .t-badge{position:static;inset:auto;display:flex;align-items:center;justify-content:center;flex:none;margin:0}
#order-single .obm-panel .obm-row .t-badge-dot{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:20px;height:20px;padding:0 5px;line-height:1;border-radius:999px}
#order-single .obm-panel .research-account-panel>.ops-panel{background:#f3f4f6;border:0;box-shadow:none}
/* Preserve the original mark, giving the word and period their own ink space. */
#order-single #order-app-header .order-product-brand.obm-brand>.brand-word{width:auto}
#order-single #order-app-header .order-product-brand.obm-brand[data-authenticated=false]>.brand-word>.brand-dot{position:static;display:inline-block;width:auto;margin-inline-start:3px}
`;
