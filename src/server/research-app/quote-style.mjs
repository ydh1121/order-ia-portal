export const researchQuoteCss=`
[data-research-quote]{min-width:0;--max:720px;--blue:#315cf5;font-family:inherit;color:#17212f}
#order-app-quote [data-research-quote] #app.t-page-slide > .t-page:is(#page-home,#page-form,#page-result){filter:none}
[data-research-quote] .main{width:min(calc(100% - 40px),var(--max));margin:0 auto;padding-bottom:40px}
[data-research-quote] #page-form{padding-top:22px}
[data-research-quote] #form-back{display:none}
[data-research-quote] .accordion-trigger{min-height:68px}
[data-research-quote] .qcopy strong{font-weight:750;letter-spacing:-.035em}
[data-research-quote] .ui-input-control{min-height:48px}
[data-research-quote] [data-order-result] .oq-brand{display:none}
/* The shared result artboard reserves its first 78px for the real app header. */
#order-app-header:has(~ #order-app-page:not([hidden]) [data-review-result],~ #order-app-quote:not([hidden]) #page-result.active [data-order-result]){
  position:absolute;inset:0 0 auto;
}
#order-app-page .mf-wait-visual{gap:clamp(1.8rem,7.6vw,2.55rem)}
#order-app-page .mf-wait-visual .mf-wait-avatar{width:clamp(6.6rem,27.25vw,8rem)}
/* Stacked cards keep their depth while only the front label is visible. */
#order-single [data-wait-scene] [data-banner-stack] .mf-banner span{opacity:clamp(0,1 - var(--layer,0),1)}
/* Match the real saved rows, keeping the first empty SKU editor unframed. */
#order-app-quote [data-research-quote] #page-form{background:#f3f5f7}
#order-app-quote [data-research-quote] #page-form .stack>.t-acc{border:0;background:white;box-shadow:none}
#order-app-quote [data-research-quote] #page-form .stack>.t-acc>.accordion-trigger{border:0}
#order-app-quote [data-research-quote] #add-controls>.add-row,#order-app-quote [data-research-quote] #section-q3 .add-row{display:block;width:100%;padding-inline:0}
#order-app-quote [data-research-quote] #add-line,#order-app-quote [data-research-quote] #add-site{display:flex;align-items:center;justify-content:center;width:100%;min-height:60px;border:1px dashed #cbd3de;border-radius:10px;background:transparent;color:#576579;font-size:14px;font-weight:600;cursor:pointer}
#order-app-quote [data-research-quote] #add-line:hover,#order-app-quote [data-research-quote] #add-site:hover{background:#f3f5f7}
#order-app-quote [data-research-quote] .sku-editor .q1-egg{fill:#bfc7d1;stroke:none}
#order-app-quote [data-research-quote] .sku-editor .pick[aria-pressed=true] .q1-egg{fill:white;stroke:none}
#order-app-quote [data-research-quote] #section-q3 :is(.q3-information-group,.q3-contact-grid,.q3-contact-cell,.q3-products-frame,.q3-item-copy){text-align:left;justify-items:start}
#order-app-quote [data-research-quote] #section-q3 .q3-contact-copy-action{justify-self:start}
/* The address itself remains an edit target while its named action stays visible. */
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-address-row,
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-contact-grid{justify-self:stretch;width:100%;min-width:0;box-sizing:border-box}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-address-row{grid-template-columns:minmax(0,1fr) auto;gap:4px;padding-bottom:8px;border-bottom:1px solid #dee4eb}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions{gap:0;flex-wrap:nowrap;align-self:center}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions [data-site-edit]{position:static;width:auto;overflow:visible;text-indent:0;color:var(--blue);font-weight:600}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions [data-site-edit]::before{content:"";position:absolute;inset:0 88px 0 0}
#order-app-quote [data-research-quote] #section-q3 .q3-site-accordion,#order-app-quote [data-research-quote] #section-q4 .q4-body-item{border:0;border-radius:10px;background:#f5f7fa;margin-block:8px}
#order-app-quote [data-research-quote] .q3-site-accordion>.accordion-trigger,#order-app-quote [data-research-quote] .q4-body-toggle{touch-action:pan-y pinch-zoom}
#order-app-quote [data-research-quote] .research-q3-tags{display:inline-flex;align-items:center;margin-inline-start:8px;padding:2px 7px;border-radius:6px;background:#e8edf3;color:#576579;font-size:13px;font-weight:500;white-space:nowrap}
#order-app-quote [data-research-quote] .q3-site-accordion>.accordion-trigger[aria-expanded=true] .research-q3-tags{display:none}
#order-app-quote [data-research-quote] .research-q4-tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:6px;background:#e8edf3;color:#576579;font-size:13px;font-weight:500;white-space:nowrap}
#order-app-quote [data-research-quote] :is(#q3-next,#q4-next)[hidden]{display:none}
@media(min-width:768px){[data-research-quote] .main{width:min(calc(100% - 56px),var(--max))}[data-research-quote] #page-form{padding-top:32px}}
`;
