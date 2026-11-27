export const calculatorSiteCss=`
/* Every site editor field keeps its real label above the control at rest,
 * while typing and on error, including the mounted phone and email controls. */
#site-editor-dialog #site-editor [data-q3-field]>.ui-field-title{position:static;transform:none;transition:none;pointer-events:auto;color:var(--text-primary,var(--ink))}
#site-editor-dialog #site-editor [data-q3-field][data-error=true]>.ui-field-title{color:var(--ui-danger)}
#site-editor-dialog #site-editor [data-q3-field=email] input::placeholder{opacity:1}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px;width:100%;padding-inline:0}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions>button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:0;width:100%;min-height:60px;padding:8px;border:1px dashed #bdc9d5;border-radius:10px;background:transparent;color:var(--text-secondary,#576579);font:inherit;font-size:var(--type-body,.875rem);font-weight:600;line-height:1.45;word-break:keep-all;cursor:pointer}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions>[data-order-saved-business-open]{border-color:#a7bced;background:#f3f6ff;color:#365dab}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions>button:hover{background:#f4f6f8}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions>[data-order-saved-business-open]:hover{background:#e9efff}
:is(#order-app-quote [data-research-quote],#page-form) #section-q3 .r3-saved-business-actions>button[hidden]{display:none}
`;
