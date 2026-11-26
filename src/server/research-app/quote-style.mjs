import {researchQuoteFormCss} from './quote-form-style.mjs';

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
#order-app-page .mf-wait-visual{grid-template-rows:92px 184px;height:auto;gap:32px;padding-block:16px}
#order-app-page .mf-wait-visual .mf-wait-avatar{width:184px;max-width:56vw;height:184px;max-height:56vw}
#order-single [data-wait-scene] [data-banner-stack]{width:min(100%,300px);height:92px;min-height:92px;overflow:visible}
#order-single [data-wait-scene] [data-banner-stack] .mf-banner{width:100%;height:56px;padding:12px 20px;border:1px solid #e1e7ee;border-radius:16px;background:#fff;color:#535f70;font-size:14px;line-height:22px;box-shadow:0 5px 18px #17212f0a;filter:brightness(calc(1 - var(--layer,0) * .025));transform:translateY(calc(var(--layer,0) * 12px)) scale(calc(1 - var(--layer,0) * .045))}
/* Stacked cards keep their depth while only the front label is visible. */
#order-single [data-wait-scene] [data-banner-stack] .mf-banner span{opacity:clamp(0,1 - var(--layer,0),1)}
#order-single [data-order-result] .oq-name,#order-single [data-order-result] .oq-back-label{font-weight:400}
#order-single [data-order-result][data-selection=proposed] [data-kind=current] .oq-back-label{right:22.178988%;justify-content:center;padding:0;text-align:center}
#order-single [data-order-result][data-selection=current] [data-kind=proposed] .oq-back-label{left:37.5%;justify-content:center;padding:0;text-align:center}
#order-single [data-order-result] .oq-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(342px,calc(100vw - 48px));max-width:none;height:max-content;padding:24px;border:0;border-radius:20px;background:white;color:#20272b;box-shadow:0 20px 60px #17212f24}
#order-single [data-order-result] .oq-dialog[open]{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#order-single [data-order-result] .oq-dialog::backdrop{background:rgb(22 29 36 / 35%);backdrop-filter:blur(3px)}
#order-single [data-order-result] .oq-dialog-title{grid-column:1/-1;margin:0 0 12px;font-size:18px;font-weight:700;line-height:27px;text-align:left;word-break:keep-all}
#order-single [data-order-result] .oq-choice{margin:0;min-width:0;min-height:48px;padding:10px 8px;border-radius:12px;background:#f1f3f6;color:#374359;font-size:14px;font-weight:600;line-height:22px;white-space:nowrap}
#order-single [data-order-result] .oq-choice:last-child{background:#315de6;color:white}
#order-single [data-order-result][data-state=expired] .oq-heading{top:19%}
#order-single [data-order-result][data-state=expired] .oq-plot{bottom:240px;height:200px}
#order-single [data-order-result][data-state=expired] .oq-plot::after{content:'';position:absolute;left:50%;top:50%;width:112px;height:112px;transform:translate(-50%,-50%);border-radius:50%;background:#f3f5f8 center/56px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23818b9a' stroke-width='1.5' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7v5l3 2'/%3E%3C/svg%3E")}
#order-single [data-order-result][data-state=expired] .oq-notice{bottom:110px;font-size:13px;line-height:22px}
#order-single [data-order-result] .research-quote-protected-preview{position:absolute;left:50%;bottom:0;width:100%;max-width:342px;height:auto;transform:translateX(-50%);pointer-events:none}
#order-single [data-order-result][data-state=unverified] .oq-plot:has(.research-quote-protected-preview){filter:none;background:none}
@keyframes research-result-error-enter{0%{opacity:0;transform:translate(-50%,-50%) scale(.65) rotate(-8deg)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.08) rotate(3deg)}100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}}
@media(prefers-reduced-motion:no-preference){#order-single [data-order-result][data-state=no-offer]::after{animation:research-result-error-enter 640ms cubic-bezier(.22,1,.36,1) both}}
${researchQuoteFormCss}
`;
