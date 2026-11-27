import {calculatorSiteCss} from './calculator-sites.mjs';

// Keep the regular title, navigation commands and accordion owner. The title
// uses the two-line hierarchy of introduction step 1 at every viewport size.
export function calculatorHeadingMarkup(markup){
  const source=/(<section id="page-form"[^>]*>)(<div class="nav">[\s\S]*?<\/div>)<h1 id="form-title">어떤 계란의 최저가를 알아볼까요\?<\/h1>/;
  if(!source.test(markup))throw Error('CALCULATOR_HEADING_SOURCE_CHANGED');
  const heading='<header class="calculator-heading"><h1 id="form-title">어떤 계란의 최저가를 <br>알아볼까요?</h1></header>';
  return markup.replace(source,(_,page,nav)=>page+heading+nav);
}

export const calculatorButtonColors = {
  rest: '#f1f3f6',
  hover: '#e7ecf3',
  ink: '#20272a',
  selected: '#315dde',
};

const surface=':is(#page-form,dialog.q1-sku-dialog,dialog.ui-editor-dialog,dialog.q4-regular-dialog)';
const choices=':is(.ui-choice,.ui-choice-row,.ui-button[aria-pressed],.simple-inline-order button[aria-pressed],.q4-order-options button,.q4-mode-choices input+span,.qa-week-choice button,.qa-day-weekrow button[aria-pressed],.qa-holiday-days button,.qa-calendar-grid button[aria-pressed],.q4-week-days button,.q4-off-days button)';
const actions=':is(.ui-transaction-action,.ui-continue-action,.ui-cancel-action,.ui-button,.subaction,.link-button,.qa-calendar-heading .ui-icon-button):not(:where(#add-line,#add-site,[data-order-saved-business-open],[data-order-new-business],.ui-field-trigger,.qa-combo-trigger))';
const selected=':is([aria-pressed=true],[aria-selected=true],input:checked+span)';

export const calculatorControlsCss=`
/* The onboarding heading has a 640px canvas and a 6.4% inner margin.
 * Only its reading column changes. The operational form keeps its grid. */
#app > #page-form.form.t-page{padding-block-start:0}
#page-form > .calculator-heading{
  box-sizing:border-box;position:relative;left:50%;transform:translateX(-50%);
  width:min(640px,100vw);max-width:none;margin:0 0 20px;
  padding:46px clamp(18px,6.4vw,40px) 0;background:transparent;border:0;
}
#page-form > .calculator-heading > #form-title{
  margin:0;padding:0;font-size:25px;line-height:35.5px;letter-spacing:-1.05px;
  font-weight:700;color:#20272b;text-align:left;word-break:keep-all;
}
@media(max-height:720px){#page-form > .calculator-heading{padding-block-start:20px}}
/* The primary fill is the blue in the original regular quote stylesheet.
 * Resting controls use a neutral fill. Focus rings still belong to the
 * interactive control and date/text fields keep their input affordances. */
${surface}{
  --calc-choice-surface:${calculatorButtonColors.rest};--calc-choice-hover:${calculatorButtonColors.hover};--calc-selected:${calculatorButtonColors.selected};
  --ui-choice-selected-bg:var(--calc-selected);--ui-choice-selected-color:#fff;
}
${surface} ${choices},
${surface} ${actions}{border:0;background:var(--calc-action-fill,var(--calc-choice-surface));color:var(--calc-action-ink,var(--ink,${calculatorButtonColors.ink}))}
@media(hover:hover){
  ${surface} ${choices}:not(:disabled,[aria-disabled=true],${selected},[aria-invalid=true]):hover,
  ${surface} ${actions}:not(:disabled,[aria-disabled=true],.ui-button--primary,.ui-transaction-action--primary,.ui-transaction-action--danger,.ui-continue-action,.filled):hover{background:var(--calc-choice-hover)}
}
${surface} ${choices}${selected},${surface} ${choices}${selected}:is(:hover,:active),
${surface} :is(.ui-transaction-action--primary,.ui-button--primary,.ui-continue-action,.subaction.filled){border:0;background:var(--calc-selected);color:#fff}
${surface} :is(.ui-transaction-action--primary,.ui-button--primary,.ui-continue-action,.subaction.filled){--calc-action-fill:var(--calc-selected);--calc-action-ink:#fff}
${surface} .ui-choice-row[aria-selected=true] :is(.ui-choice-row__meta,.ui-choice-row__icon){color:inherit}
${surface} .sku-editor .q1-egg{fill:#bfc7d1;stroke:none}
${surface} .pick[aria-pressed=true] .q1-egg{fill:#fff;stroke:none}
${surface} :is(.ui-transaction-action--danger,.ui-button--destructive){--calc-action-fill:#fff0f2;--calc-action-ink:#b42332;border:0;background:#fff0f2;color:#b42332}
${surface} ${choices}[aria-invalid=true]{border:0;background:#fff0f2;color:#b42332}
${surface} ${choices}[aria-invalid=true] .q1-egg{fill:currentColor;stroke:none}
${surface} :is(${choices},${actions}):is(:disabled,[aria-disabled=true]){border:0;background:#f5f6f8;color:#77818e}
/* Product rows in the order-method accordion share one text inset in both states. */
#section-q4 #allocations-delivery:has(> .q4-body-item) {
  display: grid;
  gap: 8px;
}
#page-form #section-q4 #allocations-delivery > .q4-body-item {
  --q4-item-inset: 16px;
  margin: 0;
  border: 0;
  border-radius: 10px;
  background: var(--surface-soft, #f5f7fa);
}
#section-q4 .q4-body-item .q4-body-toggle {
  box-sizing: border-box;
  padding-inline: var(--q4-item-inset);
  border-radius: 10px;
}
#section-q4 .q4-body-panel-inner {
  margin-inline: var(--q4-item-inset);
}
#section-q4 .q4-body-assignment-action {
  margin-block: 0 12px;
}
#section-q4 .q4-body-panel-inner .q4-body-site .allocation-summary {
  padding-inline: 0;
}

${calculatorSiteCss}
`;
