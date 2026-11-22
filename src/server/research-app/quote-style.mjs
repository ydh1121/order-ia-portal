export const researchQuoteCss=`
[data-research-quote]{min-width:0;--max:720px;--blue:#315cf5;font-family:inherit;color:#17212f}
#order-app-quote [data-research-quote] #app.t-page-slide > .t-page:is(#page-home,#page-form,#page-result){filter:none}
[data-research-quote] .main{width:min(calc(100% - 40px),var(--max));margin:0 auto;padding-bottom:40px}
[data-research-quote] #page-form{padding-top:22px}
[data-research-quote] .accordion-trigger{min-height:68px}
[data-research-quote] .qcopy strong{font-weight:750;letter-spacing:-.035em}
[data-research-quote] .ui-input-control{min-height:48px}
[data-research-quote] [data-order-result] .oq-brand{display:none}
@media(min-width:768px){[data-research-quote] .main{width:min(calc(100% - 56px),var(--max))}[data-research-quote] #page-form{padding-top:32px}}
`;
