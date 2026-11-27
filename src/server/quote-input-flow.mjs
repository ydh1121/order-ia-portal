import {calculatorHeadingMarkup, calculatorControlsCss} from './product-ui/calculator-controls.mjs';

/** Live calculator adaptations of the pinned regular form. The same inputs and
 * engine render in the standalone calculator and the embedded workspace. */
function replace(source, from, to) {
  const matches = typeof from === 'string' ? source.split(from).length - 1
    : [...source.matchAll(new RegExp(from.source, 'g'))].length;
  if (matches !== 1) throw Error('QUOTE_INPUT_SOURCE_MISMATCH: ' + String(from).slice(0, 100));
  return source.replace(from, () => to);
}

export function quoteInputMarkup(source) {
  source = calculatorHeadingMarkup(source);
  const gate = `<div id="q2-prerequisite" hidden>
    <div class="q2-preview-fields" inert aria-hidden="true"></div>
    <div class="q2-preview-overlay"><p id="q2-prerequisite-label">계란 규격을 선택해주세요</p>
    <button type="button" id="q2-back" aria-describedby="q2-prerequisite-label">입력하기</button></div>
  </div>`;
  source = replace(source, '<button type="button" class="ui-copy-action" id="q2-back">계란 규격으로 돌아가기</button>', '');
  source = replace(source, '<p id="q2-purpose"></p>', gate);
  for (const id of ['q2-next', 'q4-next', 'input-review-open']) {
    source = replace(source, new RegExp('<button [^>]*id="' + id + '"[^>]*>[^<]*</button>'), '');
  }
  return replace(source, /<dialog id="input-review-dialog"[\s\S]*?<\/dialog>/, '');
}

const prerequisiteStyle = `
#q2-prerequisite:not([hidden]){position:relative;display:grid;min-block-size:168px;align-items:center;isolation:isolate}
#q2-prerequisite .q2-preview-fields{padding-block:16px;pointer-events:none}
#q2-prerequisite .q2-preview-overlay{position:absolute;inset:0;display:grid;align-content:center;justify-items:center;gap:12px;padding:16px;background:rgb(255 255 255 / 70%);text-align:center}
#q2-prerequisite-label{margin:0;color:var(--text-primary,#20272b);font-size:var(--type-label,.9375rem);font-weight:600;line-height:1.5}
#q2-prerequisite #q2-back{min-width:96px;min-height:44px;padding:10px 20px;border:0;border-radius:10px;background:#315de6;color:#fff;font:inherit;font-weight:600;cursor:pointer}
#q2-prerequisite #q2-back:focus-visible{outline:3px solid #315de6;outline-offset:3px}
#body-q2 .stage-footer:has(>p[hidden]:only-child),#body-q4 .stage-footer:has(>p[hidden]:only-child){display:none}
`;

export function quoteInputSource(path, source) {
  if (path === 'web/styles.css') return source + calculatorControlsCss + prerequisiteStyle;
  if (path === 'web/simple-quote-ui.mjs') {
    source = replace(source, ',q4Pending=false', '');
    source = replace(source, /  \$\('q4-next'\)\.onclick=async\(\)=>\{[\s\S]*?\n  \};\n/, '');
    source = replace(source, / function q4Intent\(\)\{[^\n]*\}\n/, '');
    return replace(source, '<div class="ui-field-title">주문 방식</div>', '');
  }
  if (path !== 'web/app.mjs') return source;
  source = replace(source, "import {bindQuoteInputReview} from './quote-input-review.mjs';\n", '');
  source = replace(source, / \$\('q2-purpose'\)\.textContent=[^\n]+/, ` const prerequisite=$('q2-prerequisite');
 prerequisite.hidden=S.lines.length>0;
 const preview=prerequisite.querySelector('.q2-preview-fields');
 if(prerequisite.hidden)preview.replaceChildren();
 else if(!preview.firstElementChild){
  // Paint the real row outside the bound list. Its placeholder never enters
  // the quote model, numeric validation, draft storage or totals.
  preview.innerHTML=q2LineMarkup({id:'preview',pack:'30',qty:'',price:'',qtyUnit:'tray'});
  const fields=preview.querySelector('fieldset');fields.disabled=true;
  fields.querySelector('legend')?.remove();
 }`);
  source = replace(source, /function finishQty\(\)\{[^\n]*\}\n/, '');
  source = replace(source, /function finishMode\(\)\{[^\n]*\}\n/, '');
  source = replace(source, "$('q2-next').onclick=finishQty;\n", '');
  source = replace(source, "$('q4-next').onclick=()=>finishMode();\n", '');
  source = replace(source, /function canReviewInput\(\)\{[\s\S]*?\nconst inputReview=bindQuoteInputReview\([^\n]*\);\n/, '');
  return replace(source, " if(step==='review')inputReview.open();\n else if(canReviewInput())moveToInputStage('q2');",
    " moveToInputStage(step==='review'&&!simpleMode?'q4':'q2');");
}
