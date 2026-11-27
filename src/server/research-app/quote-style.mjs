import {researchQuoteFormCss} from './quote-form-style.mjs';
import {researchQuoteModeCss} from './quote-mode-presentation.mjs';

/** The retained result dialog keeps its native buttons/listeners. Its visual
 * declarations and token values come from the same current confirmation UI. */
export function researchConfirmationCss(regularCss){
  const rule=(source,selector)=>{
    const clean=source.replace(/\/\*[\s\S]*?\*\//g,''),match=[...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(item=>item[1].split(',').some(part=>part.trim()===selector));
    if(!match)throw Error('REGULAR_CONFIRM_PRESENTATION_SOURCE_CHANGED:'+selector);return match[2];
  };
  const declarations=body=>new Map(body.split(';').map(item=>{const at=item.indexOf(':');return [item.slice(0,at).trim(),item.slice(at+1).trim()];}).filter(([name,value])=>name&&value));
  const surface=declarations(rule(researchQuoteModeCss,'#order-app-quote [data-research-quote] #quote-mode-dialog>.q1-confirm'));
  const sharedSurface=['padding','background','box-shadow','transform-origin'].map(name=>{if(!surface.has(name))throw Error('REGULAR_CONFIRM_SURFACE_CHANGED:'+name);return name+':'+surface.get(name);}).join(';');
  const prefix='#order-single [data-order-result]',dialog=prefix+' .oq-dialog',choice=prefix+' .oq-choice';
  const css=dialog+'{'+rule(regularCss,'.q1-sku-dialog')+';'+rule(regularCss,'dialog[data-modal-variant]')+';'+rule(regularCss,'dialog[data-modal-role="confirm"]')+';'+sharedSurface+';position:fixed;inset:0;margin:auto;box-sizing:border-box;height:max-content}\n'+
    dialog+'[open]{'+rule(regularCss,'.ui-transaction-group')+';row-gap:var(--ui-confirm-actions-gap)}\n'+
    dialog+'::backdrop{'+rule(regularCss,'dialog[data-modal-variant]::backdrop')+';'+rule(researchQuoteModeCss,'#order-app-quote [data-research-quote] #quote-mode-dialog::backdrop')+'}\n'+
    prefix+' .oq-dialog-title{'+rule(regularCss,'.q1-confirm h2')+';grid-column:1/-1;margin:0;text-align:left;word-break:keep-all}\n'+
    choice+'{'+rule(regularCss,'.ui-transaction-action')+';white-space:nowrap}\n'+
    choice+':last-child{'+rule(regularCss,'.ui-transaction-action--primary')+'}\n'+
    choice+':focus-visible{'+rule(regularCss,'.ui-transaction-action:focus-visible')+'}\n'+
    choice+':disabled{'+rule(regularCss,'.ui-transaction-action:disabled')+'}\n';
  const roots=new Map();for(const match of regularCss.matchAll(/:root\s*\{([^{}]*)\}/g))for(const [name,value] of declarations(match[1]))if(name.startsWith('--'))roots.set(name,value);
  const tokens=new Map(),pending=[...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]);
  while(pending.length){const name=pending.pop();if(tokens.has(name)||!roots.has(name))continue;const value=roots.get(name);tokens.set(name,value);pending.push(...[...value.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]));}
  for(const name of ['--blue','--ink','--ui-modal-confirm-width','--ui-transaction-height','--type-weight-title'])if(!tokens.has(name))throw Error('REGULAR_CONFIRM_TOKEN_MISSING:'+name);
  return dialog+'{'+[...tokens].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>name+':'+value).join(';')+'}\n'+css;
}

export const researchQuoteCss=`
[data-research-quote]{min-width:0;--max:720px;--blue:#315cf5;font-family:inherit;color:#17212f}
#order-app-quote [data-research-quote] #app.t-page-slide > .t-page:is(#page-home,#page-form,#page-result){filter:none}
[data-research-quote] [data-order-result] .oq-brand{display:none}
/* Figma 1025:14915 is the missing-quote error view despite the old NO-CURRENT frame name. */
#order-single [data-order-result][data-state=no-offer] .oq-heading{top:17.75%}
#order-single [data-order-result][data-state=no-offer] .oq-sub{display:none}
#order-single [data-order-result][data-state=no-offer]::after{
  content:"";position:absolute;left:50%;top:49.4%;transform:translate(-50%,-50%);
  width:22px;height:104px;pointer-events:none;
  background:center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 104'%3E%3Cg fill='%23ffbc70'%3E%3Cpath d='M11 0C4.6 0 .1 5.1 .4 11.4L5 61.7c.3 3.7 2.6 6.3 6 6.3s5.8-2.6 6.1-6.3l4.5-50.3C22 5.1 17.4 0 11 0Z'/%3E%3Ccircle cx='10.5' cy='94' r='9.2'/%3E%3C/g%3E%3C/svg%3E");
}
/* The shared result artboard reserves its first 78px for the real app header. */
#order-app-header:has(~ #order-app-page:not([hidden]) [data-review-result],~ #order-app-quote:not([hidden]) #page-result.active [data-order-result]){
  position:absolute;inset:0 0 auto;
}
/* Restore the final R4 DROPIN geometry (QA HTML SHA-256 fa35e0d35c0ce34e766f096e9ed6a260ef4ca4660ea4566b5aee2c69782ff5d3).
   The retained stack supplies the original 130px clipping viewport, without
   changing its children or the request/player lifecycle. The avatar paints in
   front of it on the same 364px stage. */
#order-single #order-app-page .mf-wait{display:grid;grid-template-rows:118px 364px 104px minmax(28px,1fr) 56px;align-content:stretch;box-sizing:border-box;max-width:420px;min-height:max(730px,calc(100dvh - 78px));margin-inline:auto;padding:0 24px 30px}
#order-app-page .mf-wait>h1{grid-row:1;box-sizing:border-box;height:118px;margin:0;padding-top:42px;font-size:27px;line-height:1.45}
#order-app-page .mf-wait-visual{position:relative;display:block;grid-row:2;grid-template-rows:none;width:100%;height:364px;gap:0;margin:0;padding:0;isolation:isolate;overflow:visible}
#order-app-page .mf-wait-visual .mf-wait-avatar{position:absolute;inset:108px auto auto 50%;transform:translateX(-50%);width:256px;max-width:none;height:256px;max-height:none;z-index:3}
#order-app-page .mf-wait-message{grid-row:3;display:flex;align-items:center;justify-content:center;height:104px;min-height:104px;margin:0;font-size:15px;line-height:1.65}
#order-app-page .mf-wait .mf-actions{grid-row:5;align-self:end;height:56px;margin:0;padding:0}
#order-single [data-wait-scene] [data-banner-stack]{position:absolute;inset:0 0 auto;display:block;transform:none;width:100%;height:130px;min-height:0;margin:0;padding:0;overflow:hidden;z-index:1;pointer-events:none}
#order-single [data-wait-scene] [data-banner-stack][hidden]{display:none}
#order-single [data-wait-scene] [data-banner-stack] .mf-banner{--banner-depth-opacity:1;position:absolute;inset:68px auto auto 50%;box-sizing:border-box;width:calc(100% - 44px);max-width:320px;height:52px;padding:0 16px;gap:10px;border:1px solid #eceef1;border-radius:28px;display:flex;align-items:center;justify-content:flex-start;background:#fff;color:#535f70;font-size:14px;line-height:1.4;box-shadow:0 4px 14px #1724390b,0 1px 3px #17243906;filter:blur(calc(var(--layer,0) * 1px));transform-origin:center center;transform:translateX(-50%) translateY(calc(var(--layer,0) * -12px)) scale(calc(1 - var(--layer,0) * .06));z-index:calc(3 - var(--layer,0));opacity:var(--banner-depth-opacity);animation:research-wait-banner-enter 350ms cubic-bezier(.22,1,.36,1) backwards;transition:transform 350ms cubic-bezier(.22,1,.36,1),opacity 250ms ease,filter 350ms ease;will-change:transform,opacity}
#order-single [data-wait-scene] [data-banner-stack] .mf-banner:nth-child(2){--banner-depth-opacity:.66}
#order-single [data-wait-scene] [data-banner-stack] .mf-banner:nth-child(3){--banner-depth-opacity:.3}
#order-single [data-wait-scene] [data-banner-stack] .mf-banner span{min-width:0;font-weight:600;letter-spacing:-.3px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:1}
@keyframes research-wait-banner-enter{from{transform:translateX(-50%) translateY(32px) scale(.97);opacity:0}to{transform:translateX(-50%) translateY(calc(var(--layer,0) * -12px)) scale(calc(1 - var(--layer,0) * .06));opacity:var(--banner-depth-opacity)}}
@media(min-width:768px){#order-single #order-app-page .mf-wait{grid-template-rows:128px 364px 104px minmax(28px,1fr) 56px;min-height:max(746px,calc(100dvh - 78px));padding-bottom:46px}#order-app-page .mf-wait>h1{height:128px}}
@media(max-width:359px){#order-single #order-app-page .mf-wait{grid-template-rows:116px 364px 104px minmax(28px,1fr) 56px;min-height:max(724px,calc(100dvh - 78px));padding:0 20px 24px}#order-app-page .mf-wait>h1{height:116px;font-size:25px}#order-app-page .mf-wait-visual .mf-wait-avatar{width:240px;height:240px}#order-single [data-wait-scene] [data-banner-stack] .mf-banner{width:calc(100% - 24px);padding:0 13px;gap:8px;font-size:13px}}
#order-single [data-order-result] .oq-name,#order-single [data-order-result] .oq-back-label{font-weight:400}
#order-single [data-order-result][data-selection=proposed] [data-kind=current] .oq-back-label{right:22.178988%;justify-content:center;padding:0;text-align:center}
#order-single [data-order-result][data-selection=current] [data-kind=proposed] .oq-back-label{left:37.5%;justify-content:center;padding:0;text-align:center}
/* Figma 1025:15013 retains the graph composition after expiry. These empty
   outlines are an expired-state illustration, never an invented price ratio:
   the authorized projection still removes all series amounts and actions. */
#order-single [data-order-result][data-state=expired] .oq-heading{top:111px}
#order-single [data-order-result][data-state=expired] .oq-plot{top:262px;bottom:auto;height:317px;max-height:calc(100% - 450px)}
#order-single [data-order-result][data-state=expired] .oq-plot::before,#order-single [data-order-result][data-state=expired] .oq-plot::after{content:'';position:absolute;bottom:13px;width:53px;height:min(237px,calc(100% - 67px));border:2px solid #dadada;border-radius:10px 10px 0 0;background:#f3f5f8;box-shadow:0 15px 35px #344c7b09}
#order-single [data-order-result][data-state=expired] .oq-plot::before{left:calc(50% - 68.5px)}
#order-single [data-order-result][data-state=expired] .oq-plot::after{left:calc(50% + 16.5px);border-color:#b5c1df;background:#eef1f8}
#order-single [data-order-result][data-state=expired] .oq-notice{bottom:194px;font-size:12px;line-height:18px}
#order-single [data-order-result][data-state=expired] .oq-note{white-space:pre-line}
#order-single [data-order-result][data-state=expired] .oq-basis:empty{display:none}
#order-single [data-order-result] .oq-expired-details{position:absolute;left:50%;bottom:140px;transform:translateX(-50%);padding:0;background:none;color:#535f70;font-size:14px;line-height:18px;white-space:nowrap;text-decoration:underline;text-underline-offset:3px}
#order-single [data-order-result] .oq-dialog-copy{grid-column:1/-1;margin:0 0 12px;color:#535f70;font-size:14px;line-height:22px;text-align:left;white-space:pre-line}
@media(max-height:720px){#order-single [data-order-result][data-state=expired] .oq-heading{top:94px}#order-single [data-order-result][data-state=expired] .oq-plot{top:220px;max-height:calc(100% - 430px)}#order-single [data-order-result][data-state=expired] .oq-notice{bottom:166px}#order-single [data-order-result] .oq-expired-details{bottom:126px}}
#order-single [data-order-result] .research-quote-protected-preview{position:absolute;left:50%;bottom:0;width:100%;max-width:342px;height:auto;transform:translateX(-50%);pointer-events:none}
#order-single [data-order-result][data-state=unverified] .oq-plot:has(.research-quote-protected-preview){filter:none;background:none}
@keyframes research-result-error-enter{0%{opacity:0;transform:translate(-50%,-50%) scale(.65) rotate(-8deg)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.08) rotate(3deg)}100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}}
@media(prefers-reduced-motion:no-preference){#order-single [data-order-result][data-state=no-offer]::after{animation:research-result-error-enter 640ms cubic-bezier(.22,1,.36,1) both}}
${researchQuoteFormCss}
`;
