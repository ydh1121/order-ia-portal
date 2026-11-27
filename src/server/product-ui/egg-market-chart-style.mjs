export const eggMarketChartCss = `
#egg-market-chart{box-sizing:border-box;position:fixed;inset:0;width:min(456px,calc(100vw - 32px));max-width:none;max-height:min(90dvh,760px);margin:auto;padding:0;border:0;border-radius:20px;background:#fff;color:#20272b;box-shadow:0 20px 65px rgb(20 34 52 / 20%);font:inherit;font-family:inherit;overflow:auto;overscroll-behavior:contain}
#egg-market-chart::backdrop{background:rgb(22 29 36 / 38%);backdrop-filter:blur(3px)}
#egg-market-chart *{box-sizing:border-box}
#egg-market-chart [hidden]{display:none!important}
#egg-market-chart :is(button,select){font:inherit;color:inherit;cursor:pointer}
#egg-market-chart :is(button,select,[tabindex],summary):focus-visible{outline:2px solid #315dde;outline-offset:2px}
#egg-market-chart .mk-shell{display:block;margin:0;padding:0}
#egg-market-chart .mk-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 10px 24px;background:#fff;border:0}
#egg-market-chart .mk-head h2{margin:0;padding:0;font-size:21px;line-height:30px;letter-spacing:-.8px;font-weight:740;color:#20272b}
#egg-market-chart [data-close]{display:grid;place-items:center;min-width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:#657181}
#egg-market-chart .mk-content{padding:2px 24px 0}
#egg-market-chart .mk-filters{display:grid;gap:9px;padding:5px 0 17px;border-bottom:1px solid #e9edf2}
#egg-market-chart .mk-filter{display:grid;grid-template-columns:58px minmax(0,1fr);gap:6px;align-items:center}
#egg-market-chart .mk-filter>span{white-space:nowrap;font-size:12px;color:#596470;font-weight:600}
#egg-market-chart [data-filters]{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
#egg-market-chart .mk-chip{position:relative;display:inline-flex;align-items:center;margin:0;padding:0;max-width:100%}
#egg-market-chart .mk-chip:after{content:"";position:absolute;right:10px;width:5px;height:5px;transform:translateY(-1.5px) rotate(45deg);border-right:1.4px solid currentColor;border-bottom:1.4px solid currentColor;color:#66758a;pointer-events:none}
#egg-market-chart .mk-chip select{display:block;appearance:none;width:auto;max-width:100%;min-width:50px;min-height:33px;padding:5px 23px 5px 10px;border:0;border-radius:8px;background:#f1f3f6;color:#475364;font-size:13px;line-height:20px;font-weight:620;letter-spacing:-.35px}
#egg-market-chart .mk-chip[data-selected=true] select{background:#edf2ff;color:#284bbb}
#egg-market-chart .mk-chip[data-selected=true]:after{color:#315dde}
#egg-market-chart .mk-chip select:disabled{color:#7d8793;cursor:default}
#egg-market-chart [data-status]{margin:0;padding:52px 0;text-align:center;font-size:14px;line-height:24px;color:#5e6879}
#egg-market-chart [data-retry],#egg-market-chart [data-reset]{display:block;padding:5px 9px;border:0;border-radius:7px;background:#edf2ff;color:#3153bf;font-size:12px;line-height:20px;font-weight:650}
#egg-market-chart [data-retry]{margin:-38px auto 16px}
#egg-market-chart .mk-stat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:4px;padding-top:18px}
#egg-market-chart p{margin:0}
#egg-market-chart [data-caption]{font-size:13px;font-weight:650;line-height:20px;color:#596576}
#egg-market-chart .mk-value{display:flex;align-items:baseline;gap:5px;margin:2px 0 2px;line-height:1.2}
#egg-market-chart [data-price]{color:#1f2833;font-size:35px;line-height:44px;font-weight:750;letter-spacing:-1.65px;font-variant-numeric:tabular-nums}
#egg-market-chart [data-unit]{font-size:14px;color:#546071;font-weight:560}
#egg-market-chart [data-observed]{min-height:19px;font-size:12px;font-weight:520;line-height:18px;color:#647082;font-variant-numeric:tabular-nums;word-break:keep-all}
#egg-market-chart .mk-plot{position:relative;width:100%;height:128px;margin-top:12px;cursor:crosshair;touch-action:pan-y;user-select:none;-webkit-user-select:none;border-radius:3px}
#egg-market-chart .mk-plot svg{display:block;width:100%;height:100%;overflow:visible}
#egg-market-chart .mk-axis{display:flex;justify-content:space-between;gap:8px;margin-top:0;color:#748091;font-size:11px;font-weight:550;line-height:19px;font-variant-numeric:tabular-nums}
#egg-market-chart [data-extremes]{margin:15px 0 0;padding:4px 12px;background:#f6f8fa;border-radius:12px}
#egg-market-chart .mk-summary-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:9px 0}
#egg-market-chart .mk-summary-row+.mk-summary-row{border-top:1px solid #e5eaf0}
#egg-market-chart .mk-extreme-price{display:flex;align-items:baseline;gap:7px;white-space:nowrap}
#egg-market-chart .mk-extreme-price>span{color:#586574;font-size:12px;font-weight:620}
#egg-market-chart .mk-extreme-price strong{color:#26313d;font-size:14px;font-weight:700;letter-spacing:-.35px}
#egg-market-chart .mk-ranges{display:grid;justify-items:end;text-align:right;font-size:12px;color:#566274;line-height:20px}
#egg-market-chart .mk-period{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;font-variant-numeric:tabular-nums;white-space:nowrap}
#egg-market-chart .mk-live{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:620;color:#87500c}
#egg-market-chart .mk-live:before{content:"";width:6px;height:6px;border-radius:50%;background:#eb8517}
#egg-market-chart .mk-ranges summary{cursor:pointer;list-style:none}
#egg-market-chart .mk-ranges summary::-webkit-details-marker{display:none}
#egg-market-chart .mk-ranges details>.mk-period{display:flex;margin-top:3px}
#egg-market-chart .mk-more{display:inline-block;margin-left:5px;color:#3154ba;font-weight:620}
#egg-market-chart footer{display:flex;justify-content:flex-end;padding:10px 20px 14px;background:#fff}
#egg-market-chart footer button{display:inline-flex;align-items:center;gap:5px;min-height:38px;margin:0;padding:4px 5px;border:0;background:transparent;color:#5a6878;font-size:13px;font-weight:600}
#egg-market-chart footer button>span{font-size:19px;line-height:14px}
@media(max-width:360px){#egg-market-chart .mk-head{padding:12px 12px 7px 16px}#egg-market-chart .mk-content{padding-inline:16px}#egg-market-chart .mk-filter{grid-template-columns:max-content minmax(0,1fr);gap:4px}#egg-market-chart [data-filters]{gap:4px}#egg-market-chart [data-filters="date"]{display:grid;grid-template-columns:minmax(0,1.28fr) repeat(2,minmax(0,1fr))}#egg-market-chart [data-filters="date"] select{min-width:0;width:100%}#egg-market-chart .mk-chip select{font-size:12px;padding-left:6px;padding-right:15px}#egg-market-chart .mk-chip:after{right:7px}#egg-market-chart .mk-ranges{font-size:11px}#egg-market-chart [data-extremes]{padding-inline:9px}}
@media(max-height:620px){#egg-market-chart{max-height:calc(100dvh - 20px)}#egg-market-chart .mk-plot{height:98px}#egg-market-chart .mk-head{position:sticky;top:0;z-index:1}}
`;
