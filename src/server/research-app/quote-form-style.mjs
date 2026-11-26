import {researchQuoteModeCss} from './quote-mode-presentation.mjs';

/**
 * Q1–Q4 presentation over the regular quote engine. The engine keeps ownership
 * of selection, validation exposure, transactions, costs and saved-row actions.
 * Latest Q1 feedback requires a white page and depth on white accordions.
 */
export const researchQuoteFormCss=`
[data-research-quote] .main{width:min(calc(100% - 40px),var(--max));margin:0 auto;padding-bottom:40px}
[data-research-quote] #form-back{display:none}
/* C622's recorded pin identifies this duplicate switch. The application header
 * still invokes the original bound trigger and its opt-in save/copy dialog. */
#order-app-quote [data-research-quote] #page-form>.nav,#order-app-quote [data-research-quote] #quote-mode-switch{display:none}
[data-research-quote] .qcopy strong{font-weight:750;letter-spacing:-.035em}
[data-research-quote] .ui-input-control{min-height:48px}
/* There is no second calculator surface: the original form shares the page. */
#order-app-quote [data-research-quote] #page-form{padding-top:22px;background:#fff}
#order-app-quote [data-research-quote] #page-form>.stack{gap:12px}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc{border:0;border-radius:14px;background:#fff;box-shadow:0 2px 12px rgb(23 33 47 / 7%),0 1px 3px rgb(23 33 47 / 4%)}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc[data-open=true]{box-shadow:0 4px 18px rgb(23 33 47 / 9%),0 1px 4px rgb(23 33 47 / 4%)}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc>.accordion-trigger{min-height:68px;padding:16px;border:0;background:transparent;column-gap:10px}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc>.accordion-body>.t-acc-panel-inner{padding:0 16px 16px}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc>.accordion-trigger .qcopy strong{color:var(--text-primary,#20272a);font-size:var(--type-label,.9375rem);line-height:1.5}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc>.accordion-trigger .t-acc-chevron{color:var(--text-secondary,#56677b)}
/* Read only the engine's exposed error state; opening a panel is not completion. */
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc[data-order-error-stage=true]>.accordion-trigger :is(.qcopy strong,.t-acc-chevron){color:var(--ui-danger,#d92d48)}
#order-app-quote [data-research-quote] #page-form>.stack>.t-acc[data-order-error-stage=true]>.accordion-trigger .stage-check{background:var(--ui-badge-bg,#fff0f2);color:var(--ui-danger,#d92d48)}
/* The initial SKU stays inside its accordion, without another framed editor. */
#order-app-quote [data-research-quote] #section-q1 #sku-editor{border:0;box-shadow:none;background:transparent;padding-inline:0}
#order-app-quote [data-research-quote] .sku-editor .q1-egg{fill:#bfc7d1;stroke:none}
#order-app-quote [data-research-quote] .sku-editor .pick[aria-pressed=true] .q1-egg{fill:white;stroke:none}
/* Missing choices get their own existing one-pixel border, never a group ring. */
#order-app-quote [data-research-quote] .sku-editor .picks[aria-invalid=true]{border:0;outline:0;box-shadow:none}
#order-app-quote [data-research-quote] .sku-editor .pick[aria-invalid=true]{border-width:1px;border-style:solid;border-color:var(--ui-danger,#d92d48);outline-color:var(--ui-danger,#d92d48);box-shadow:none}
#order-app-quote [data-research-quote] .sku-editor .ui-field-title[data-order-invalid=true]{color:var(--ui-danger,#d92d48)}
#order-app-quote [data-research-quote] #add-controls>.add-row,#order-app-quote [data-research-quote] #section-q3 .add-row{display:block;width:100%;padding-inline:0}
#order-app-quote [data-research-quote] #add-line,#order-app-quote [data-research-quote] #add-site{display:flex;align-items:center;justify-content:center;width:100%;min-height:60px;border:1px dashed #cbd3de;border-radius:10px;background:transparent;color:var(--text-secondary,#576579);font-size:var(--type-body,14px);font-weight:600;cursor:pointer}
#order-app-quote [data-research-quote] #add-line:hover,#order-app-quote [data-research-quote] #add-site:hover{background:var(--surface-soft,#f5f7fa)}
/* Stacks keep their complete title and one row of quantity/cost tags.
 * Large numbers can wrap inside a tag before they overflow the page. */
#order-app-quote [data-research-quote] #section-q1 #added-lines{display:grid;gap:8px}
#order-app-quote [data-research-quote] #section-q1 #added-lines>.sku-entry{min-height:68px;margin:0;padding:12px;border:0;border-radius:10px;background:var(--surface-soft,#f5f7fa)}
#order-app-quote [data-research-quote] #section-q1 .sku-entry-copy{display:grid;align-content:center;gap:6px;min-width:0}
#order-app-quote [data-research-quote] #section-q1 .sku-entry .saved-quantity-tags{display:flex;flex-wrap:nowrap;gap:6px;align-items:stretch;margin:0;min-width:0}
#order-app-quote [data-research-quote] #section-q1 .saved-quantity-tags>span{display:inline-flex;align-items:center;min-width:0;padding:3px 7px;border-radius:6px;background:#e8edf3;color:var(--text-primary,#20272a);font-size:var(--type-meta,.75rem);font-weight:var(--type-weight-information,400);line-height:1.5;overflow-wrap:anywhere}
/* The existing overlay action makes the whole stack editable; no visible edit
 * label is added. More/actions and Escape remain available without a swipe. */
#order-app-quote [data-research-quote] #page-form [data-saved-row]{touch-action:pan-y pinch-zoom}
#order-app-quote [data-research-quote] #page-form [data-saved-row] .saved-row-actions>.code1-text-action:first-child{inset-inline-end:56px}
#order-app-quote [data-research-quote] #page-form [data-saved-open=true] .saved-row-actions>.code1-text-action:nth-child(2){min-height:44px;padding-inline:10px}
/* Q2 fields and totals are the original calculation controls, in the same card. */
#order-app-quote [data-research-quote] #q2-purpose{margin:0 0 18px;color:var(--text-secondary,#56677b);font-size:var(--type-small,.8125rem);line-height:1.65;word-break:keep-all}
#order-app-quote [data-research-quote] #q2-lines{gap:16px}
#order-app-quote [data-research-quote] #q2-lines>.line-panel{padding:0 0 16px;border-color:var(--line,#e3e8eb);background:transparent}
#order-app-quote [data-research-quote] #q2-lines>.line-panel:last-child{padding-bottom:0;border-bottom:0}
#order-app-quote [data-research-quote] #q2-lines>.line-panel>legend{margin-bottom:14px}
#order-app-quote [data-research-quote] #q2-aggregate{gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line,#e3e8eb)}
#order-app-quote [data-research-quote] #section-q3 :is(.q3-information-group,.q3-contact-grid,.q3-contact-cell,.q3-products-frame,.q3-item-copy){text-align:left;justify-items:start}
#order-app-quote [data-research-quote] #section-q3 .q3-contact-copy-action{justify-self:start;min-height:40px;padding-block:8px}
/* Address and contact actions share the regular left-aligned grid. */
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-address-row,
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-contact-grid{justify-self:stretch;width:100%;min-width:0;box-sizing:border-box}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-address-row{grid-template-columns:minmax(0,1fr) auto;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--line,#dee4eb)}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions{gap:0;flex-wrap:nowrap;align-self:center}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions [data-site-edit]{position:static;width:auto;overflow:visible;text-indent:0;color:var(--blue);font-weight:600}
#order-app-quote [data-research-quote=detailed] #section-q3 .q3-site-actions [data-site-edit]::before{content:"";position:absolute;inset:0 88px 0 0}
#order-app-quote [data-research-quote] #section-q3 .q3-site-accordion,#order-app-quote [data-research-quote] #section-q4 .q4-body-item{border:0;border-radius:10px;background:var(--surface-soft,#f5f7fa);margin-block:8px}
#order-app-quote [data-research-quote] .q3-site-accordion>.accordion-trigger,#order-app-quote [data-research-quote] .q4-body-toggle{touch-action:pan-y pinch-zoom}
#order-app-quote [data-research-quote] .research-q3-tags{display:inline-flex;align-items:center;margin-inline-start:8px;padding:3px 7px;border-radius:6px;background:#e8edf3;color:var(--text-secondary,#576579);font-size:var(--type-meta,.75rem);font-weight:var(--type-weight-information,400);white-space:nowrap}
#order-app-quote [data-research-quote] .q3-site-accordion>.accordion-trigger[aria-expanded=true] .research-q3-tags{display:none}
#order-app-quote [data-research-quote] .research-q4-tag{display:inline-flex;align-items:center;padding:3px 7px;border-radius:6px;background:#e8edf3;color:var(--text-secondary,#576579);font-size:var(--type-meta,.75rem);font-weight:var(--type-weight-information,400);white-space:nowrap}
#order-app-quote [data-research-quote] :is(#q3-next,#q4-next)[hidden]{display:none}
@media(min-width:768px){[data-research-quote] .main{width:min(calc(100% - 56px),var(--max))}#order-app-quote [data-research-quote] #page-form{padding-top:32px}}
${researchQuoteModeCss}
`;
