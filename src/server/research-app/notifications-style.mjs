export const researchNotificationsCss = `
.research-notifications{color:var(--obm-text,#191c20);min-width:0}
.research-notifications[data-notifications-mode="full"]{max-width:720px;margin:0 auto;padding:20px 20px 40px}
.research-notifications-title{margin:0 0 22px;font-size:24px;font-weight:700;line-height:1.35}
.research-notification-filter{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:13px;color:var(--obm-muted,#697078)}
.research-notification-filter select{width:auto;min-width:100px;min-height:36px;padding:6px 28px 6px 10px;border:0;border-radius:8px;background:var(--obm-hover,#f3f4f2);color:var(--obm-text,#191c20);font:inherit}
.research-notification-list{list-style:none;margin:0;padding:0;display:grid;gap:0}
.research-notification-list>li{margin:0;padding:0;min-width:0}
.research-notifications .research-notification-item{display:grid;grid-template-rows:auto auto;gap:6px;width:100%;min-height:0;padding:15px 0;margin:0;border:0;border-radius:0;box-shadow:none;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
.research-notification-list>li+li{border-top:1px solid var(--obm-separator,#e9e9e5)}
.research-notification-heading{display:flex;align-items:center;gap:12px;min-width:0}
.research-notification-title{display:block;min-width:0;flex:1;margin:0;font-size:14px;line-height:1.5;font-weight:650;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.research-notification-item[data-read="true"] .research-notification-title{font-weight:500}
.research-notification-time{display:block;flex:0 0 auto;font-size:11px;line-height:1.5;color:var(--obm-muted,#697078);font-variant-numeric:tabular-nums;white-space:nowrap}
.research-notification-summary{display:block;min-width:0;margin:0;font-size:13px;line-height:1.5;color:var(--obm-muted,#697078);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.research-notifications .research-notifications-more,.research-notifications .research-notifications-retry{display:block;width:100%;margin:10px 0 0;padding:12px 8px;min-height:44px;border:0;border-radius:10px;box-shadow:none;background:var(--obm-hover,#f3f4f2);color:inherit;font:inherit;font-size:13px;line-height:20px;text-align:center;cursor:pointer}
.research-notifications-empty,.research-notifications-status{margin:12px 0;font-size:13px;line-height:1.6;color:var(--obm-muted,#697078)}
.research-notifications-status:empty{display:none}
.research-notification-toolbar{display:flex;align-items:center;gap:6px;min-height:36px;margin:0 0 16px}
.research-notifications .research-notification-back{display:flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;min-height:0;margin:0 0 0 -8px;padding:8px;border:0;border-radius:0;box-shadow:none;background:transparent;color:inherit;cursor:pointer}
.research-notification-back-direction{display:inline-flex;transform:rotate(180deg)}
.research-notification-detail-label{font-size:14px;line-height:20px;font-weight:600}
.research-notification-detail:focus{outline:none}
.research-notification-detail .research-notification-heading{align-items:flex-start}
.research-notification-detail .research-notification-title{white-space:normal;overflow:visible;font-size:17px;line-height:1.5;font-weight:650}
.research-notification-detail .research-notification-time{margin-top:4px}
.research-notification-body{margin:12px 0 0;font-size:14px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
.research-notifications button:focus-visible{outline:2px solid var(--obm-focus,#c57e25);outline-offset:3px}
.research-notifications [hidden]{display:none!important}
.research-notification-preferences{margin-top:26px;border-top:1px solid var(--obm-separator,#e9e9e5);padding-top:16px}
.research-notification-preferences summary{font-size:14px;font-weight:600;cursor:pointer;line-height:24px}
.research-notification-preferences fieldset{border:0;padding:0;margin:14px 0}
.research-notification-preferences legend{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.research-notification-preference{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:44px;font-size:14px;line-height:1.5}
.research-notification-preference input{width:18px;height:18px;accent-color:#bd7621;margin:0;flex:none}
.research-notification-preferences-note{margin:12px 0 0;font-size:12px;line-height:1.6;color:var(--obm-muted,#697078)}
.research-notification-preference-actions{display:flex;gap:8px}
@media(hover:hover){.research-notification-item:hover .research-notification-title{text-decoration:underline;text-underline-offset:3px}.research-notifications-more:hover,.research-notifications-retry:hover{filter:brightness(.97)}}
`;
