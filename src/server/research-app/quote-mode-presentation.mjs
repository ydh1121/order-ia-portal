/** Paint-only adaptation of the user's retained Popup 6 / Wobble In video.
 * Drive 1Rv5rgxmTdxA72snoo6lNZHBqqs6MjPSY, entry frames 1.77–2.23 s.
 * The existing OrderModalShell owns open/close, focus, backdrop lifetime,
 * scroll lock and save/copy decisions. It is not replaced by a demo controller.
 * Transitions.dev 06-modal lifecycle/reduced-motion guidance is retained;
 * the user-specified anisotropic wobble is an additional content presentation.
 */
export function mountResearchQuoteModePresentation(root,environment){
  const dialog=root.querySelector('#quote-mode-dialog'),panel=dialog?.querySelector('.q1-confirm');
  if(!panel)return ()=>{};
  const doc=root.ownerDocument,win=doc.defaultView,media=environment.matchMedia('(prefers-reduced-motion: reduce)');
  let phase='closed',animation=null,disposed=false;
  const cancel=()=>{animation?.cancel();animation=null;};
  const duration=(name,fallback)=>{const value=win.getComputedStyle(dialog).getPropertyValue(name).trim(),number=parseFloat(value);return Number.isFinite(number)&&number>=0?number*(value.endsWith('ms')?1:1000):fallback;};
  const sync=()=>{
    if(disposed)return;
    const next=!dialog.open?'closed':dialog.classList.contains('is-closing')?'closing':'open';
    if(next===phase)return;
    const prior=phase,painted=win.getComputedStyle(panel).transform;phase=next;cancel();
    if(next==='closed'||media.matches||doc.hidden||typeof panel.animate!=='function')return;
    const first=prior==='closing'||next==='closing'?painted&&painted!=='none'?painted:'scale(1,1)':'scale(.72,.55)';
    const frames=next==='open'?[
      {transform:first,offset:0},
      {transform:'scale(1.04,.96)',offset:.46},
      {transform:'scale(.98,1.035)',offset:.68},
      {transform:'scale(1.012,.992)',offset:.84},
      {transform:'scale(1,1)',offset:1},
    ]:[
      {transform:first,offset:0},
      {transform:'scale(1.03,.74)',offset:.45},
      {transform:'scale(.82,.12)',offset:1},
    ];
    const current=panel.animate(frames,{duration:next==='open'?duration('--quote-mode-wobble-duration',420):duration('--ui-modal-fade-close',150),easing:'linear',fill:'both'});
    animation=current;
    current.finished.then(()=>{if(animation===current){current.cancel();animation=null;}},()=>{if(animation===current)animation=null;});
  };
  const observer=new environment.MutationObserver(sync);
  observer.observe(dialog,{attributes:true,attributeFilter:['open','class']});
  const stopForPreference=()=>{if(media.matches||doc.hidden)cancel();};
  media.addEventListener?.('change',stopForPreference);doc.addEventListener('visibilitychange',stopForPreference);
  sync();
  return ()=>{if(disposed)return;disposed=true;observer.disconnect();cancel();media.removeEventListener?.('change',stopForPreference);doc.removeEventListener('visibilitychange',stopForPreference);};
}

export const researchQuoteModeCss=`
/* Keep the native top layer still. Its existing content owns the white card,
 * so the entire visible surface can wobble without moving the native backdrop. */
#order-app-quote [data-research-quote] #quote-mode-dialog{--quote-mode-wobble-duration:420ms;padding:0;overflow:visible;background:transparent;box-shadow:none}
#order-app-quote [data-research-quote] #quote-mode-dialog>.q1-confirm{box-sizing:border-box;max-height:inherit;overflow:auto;overscroll-behavior:contain;margin:0;padding:1.3rem var(--ui-modal-inline,1.5rem) 1.2rem;border-radius:inherit;background:#fff;box-shadow:0 16px 58px rgb(20 30 48 / 26%);transform-origin:center;will-change:transform}
#order-app-quote [data-research-quote] #quote-mode-dialog::backdrop{backdrop-filter:blur(4px);transition:backdrop-filter var(--ui-modal-fade-open,200ms) var(--ui-ease,ease-out)}
#order-app-quote [data-research-quote] #quote-mode-dialog.is-closing::backdrop{backdrop-filter:blur(0);transition-duration:var(--ui-modal-fade-close,150ms)}
@starting-style{#order-app-quote [data-research-quote] #quote-mode-dialog[open]::backdrop{backdrop-filter:blur(0)}}
@media(prefers-reduced-motion:reduce){#order-app-quote [data-research-quote] #quote-mode-dialog::backdrop{transition:none}#order-app-quote [data-research-quote] #quote-mode-dialog>.q1-confirm{will-change:auto}}
`;
