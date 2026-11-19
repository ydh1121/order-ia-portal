// Order price desk. Panel reveal follows the pinned transitions.dev recipe.
export function mountPriceShell(root=document) {
  const $=id=>root.getElementById?root.getElementById(id):root.querySelector('#'+id);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups=[], timers=new Map();
  const listen=(el,event,fn)=>{el?.addEventListener(event,fn);cleanups.push(()=>el?.removeEventListener(event,fn));};
  const close=dialog=>{
    if(!dialog?.open)return;
    dialog.querySelector('.t-panel-slide').dataset.open='false';
    clearTimeout(timers.get(dialog));
    const finish=()=>{dialog.close();timers.delete(dialog);};
    if(reduced.matches)finish();else timers.set(dialog,setTimeout(finish,350));
  };
  for(const opener of root.querySelectorAll('[data-price-open]'))listen(opener,'click',()=>{
    const dialog=$(opener.dataset.priceOpen);if(!dialog)return;
    clearTimeout(timers.get(dialog));timers.delete(dialog);
    if(!dialog.open)dialog.showModal();
    requestAnimationFrame(()=>{if(dialog.open)dialog.querySelector('.t-panel-slide').dataset.open='true';});
  });
  for(const dialog of root.querySelectorAll('dialog.price-settings')){
    listen(dialog,'cancel',e=>{e.preventDefault();close(dialog);});
    listen(dialog,'click',e=>{if(e.target===dialog)close(dialog);});
    for(const button of dialog.querySelectorAll('[data-price-close]'))listen(button,'click',()=>close(dialog));
  }
  function syncPersonal(preserveDirty=false) {
    const wasDirty=$('priceSaveState').dataset.dirty==='true';
    const name=$('personalName').value.trim()||'새 가격표';
    $('personalTitle').textContent=name;$('personalTitle').title=name;
    const items=[$('personalSupplier').value.trim(),$('personalShell').value&&$('personalShell').selectedOptions[0]?.text,
      $('personalPack').value&&$('personalPack').value+'구', $('personalMinimum').value&&$('personalMinimum').value+'판부터 배송'].filter(Boolean);
    $('personalSummary').replaceChildren(...items.map(text=>{const item=document.createElement('span');item.textContent=text;return item;}));
    const saved=$('personalStatus').textContent;
    if(saved){$('priceSaveState').textContent=/아직 저장/.test(saved)?'미저장':'저장됨';$('priceSaveState').dataset.dirty='false';}
    if(preserveDirty&&wasDirty){$('priceSaveState').textContent='수정 중';$('priceSaveState').dataset.dirty='true';}
  }
  const observe=new MutationObserver(()=>syncPersonal());
  observe.observe($('personalStatus'),{childList:true,characterData:true,subtree:true});
  const input=e=>{
    if(e.target.closest('#personalSettings'))syncPersonal();
    if(e.target.closest('#personalImport,#price-registration,[data-mx=tools]'))return;
    $('priceSaveState').textContent='수정 중';$('priceSaveState').dataset.dirty='true';
  };
  listen($('personal-panel'),'input',input);
  listen($('personal-panel'),'click',e=>{if(e.target.closest('[data-mx=apply],[data-mx=copy],[data-mx=remove],[data-mx=add],[data-mx=undo]'))input(e);});
  const notice=$('notice');let noticeTimer;
  const announce=()=>{clearTimeout(noticeTimer);notice.dataset.visible=notice.textContent.trim()?'true':'false';if(notice.dataset.visible==='true')noticeTimer=setTimeout(()=>{notice.dataset.visible='false';},5000);};
  const noticeObserver=new MutationObserver(announce);noticeObserver.observe(notice,{childList:true,characterData:true,subtree:true});
  syncPersonal();announce();
  return {sync:()=>syncPersonal(true),destroy(){observe.disconnect();noticeObserver.disconnect();clearTimeout(noticeTimer);for(const fn of cleanups)fn();for(const timer of timers.values())clearTimeout(timer);}};
}

export const priceShellCss=`
:root{--panel-open-dur:400ms;--panel-close-dur:350ms;--panel-translate-y:100px;--panel-blur:2px;--panel-ease:cubic-bezier(.22,1,.36,1)}
html,body{height:100%;scrollbar-width:none}body{max-width:none;margin:0;padding:0;display:flex;flex-direction:column;overflow:hidden;background:#f5f6f8;color:#202631;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px}*::-webkit-scrollbar{display:none}
button,input,select{font-family:inherit}button{font-size:14px;font-weight:600;border-radius:10px;background:#f0f2f5;color:#3e4652;min-height:40px;padding:9px 14px;white-space:nowrap}button.primary{background:#3157eb;color:#fff;padding-inline:22px}button:disabled{opacity:.42;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #3157eb;outline-offset:3px}
.price-app-header{height:66px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 28px;border-bottom:1px solid #e6e8ed;background:#fff}.price-app-heading{display:flex;align-items:center;gap:18px;min-width:0}.price-app-heading>a{color:#7c8490;font-size:13px;text-decoration:none;white-space:nowrap}.price-app-heading>span{color:#d4d8df}.price-app-header h1{font-size:19px;font-weight:750;letter-spacing:-.5px;margin:0;white-space:nowrap}.price-app-nav{display:flex;align-items:center;gap:12px;font-size:12px}.price-app-nav>a{padding:8px 12px;background:#f2f3f6;border-radius:8px;text-decoration:none}.price-utilities{position:relative;border:0!important;padding:0!important}.price-utilities>summary{list-style:none;min-height:36px;display:flex;align-items:center;padding:8px 10px;color:#737c88}.price-utilities>summary::-webkit-details-marker{display:none}.price-utilities>div{position:absolute;right:0;top:40px;min-width:150px;padding:8px;background:white;box-shadow:0 10px 32px #17233b20;border-radius:12px;z-index:12}.price-utilities a{display:block;padding:10px;text-decoration:none;white-space:nowrap}
.price-desk{width:100%;max-width:1460px;margin:0 auto;padding:20px 32px 28px;flex:1;min-height:0;overflow:auto;scrollbar-width:none}.price-desk section,.price-desk details{border-color:#e3e7ee}.price-desk section#personal-panel{padding:0;border:0}.price-toolbar{position:relative;top:auto;background:transparent;border:0;padding:0 0 20px;gap:24px;min-height:64px;z-index:5}.price-book-title{min-width:0;flex:1}.price-book-name{display:flex;align-items:center;gap:10px;min-width:0}.price-book-name h2{font-size:21px;line-height:1.35;letter-spacing:-.55px;margin:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.price-scope-label{flex:none;font-size:11px;font-weight:600;color:#68717e;background:#e9ecf0;border-radius:6px;padding:4px 7px}.price-summary{display:flex;flex-wrap:wrap;gap:5px 16px;margin-top:7px;min-height:18px;color:#717b88;font-size:12px}.price-summary span{white-space:nowrap}.price-main-actions{display:flex;align-items:center;gap:8px;flex:none}.price-save-state{font-size:12px;color:#8a939f;white-space:nowrap}.price-save-state[data-dirty=true]{color:#b76f17}.price-save-state:empty{display:none}#personalStatus{position:absolute;clip-path:inset(50%);height:1px;width:1px;overflow:hidden;white-space:nowrap;margin:0}#personalGrid{min-width:0}
.price-desk #matrix{background:#fff;border:1px solid #e4e7ed;border-radius:14px;padding:16px 18px 0;min-width:0}.price-desk .matrix-scroll{margin:10px -18px 0;max-width:none;border-top:1px solid #e8ebf0;max-height:calc(100dvh - 228px);border-radius:0 0 14px 14px}.price-desk .price-matrix td input{font-family:inherit;font-size:14px;min-height:42px}.price-desk .price-matrix th{font-size:12px}.price-desk .mx-tools{z-index:10}#price-registration{margin-top:16px;border:0;padding:0}#price-registration>summary{display:inline-flex;align-items:center;min-height:36px;color:#7c8591;font-size:12px;font-weight:500;gap:6px}#price-registration>summary::before{content:'+'}#price-registration[open]>summary::before{content:'−'}#price-registration>summary::marker{content:''}#connectionForm{max-width:440px;padding:12px 0}#connectionForm>p{font-size:12px;color:#77808d}#personalImport,#versions-panel,#review-actions,#simulation-panel{margin-top:12px}#personalBack{margin-top:12px;font-size:12px}#notice:empty{display:none}#notice:not(:empty){pointer-events:none;transition:opacity 180ms ease-out;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:min(90vw,620px);z-index:30;padding:12px 18px;border-radius:12px;background:#263243;color:white;box-shadow:0 8px 24px #18263b25;font-size:13px;font-weight:500;line-height:1.5;margin:0}#notice[data-visible=false]{opacity:0}.price-tabs button[aria-pressed=true]{background:#263243;color:white}.price-tabs button{font-size:13px}.price-desk #current{font-size:13px;color:#626d7b;margin:0 0 12px}.price-desk #prices{padding:0 0 16px;border:0}.price-desk #prices>.bar{max-width:520px}.price-desk #prices label{font-size:12px;color:#6d7785}.price-desk #staff-desk{padding-bottom:16px}.price-desk .price-meta{margin:0}
dialog.price-settings{padding:0;border:0;margin:0 0 0 auto;width:min(480px,100vw);height:100dvh;max-height:100dvh;max-width:100vw;background:transparent;overflow:visible;color:#202631}dialog.price-settings::backdrop{background:rgb(27 36 51/.25)}.price-settings .t-panel-slide{height:100%;display:flex;flex-direction:column;background:white;box-shadow:-8px 0 32px #18263b16;transform:translateY(var(--panel-translate-y));opacity:0;filter:blur(var(--panel-blur));pointer-events:none;transition:transform var(--panel-close-dur) var(--panel-ease),opacity var(--panel-close-dur) var(--panel-ease),filter var(--panel-close-dur) var(--panel-ease)}.price-settings .t-panel-slide[data-open=true]{transform:translateY(0);opacity:1;filter:blur(0);pointer-events:auto;transition-duration:var(--panel-open-dur)}.price-settings-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px;border-bottom:1px solid #eceef2;flex:none}.price-settings-header h2{margin:0;font-size:20px;letter-spacing:-.4px}.price-settings-header button{min-height:36px;padding:6px 12px;font-size:12px}.price-settings-body{padding:24px;overflow:auto;min-height:0;scrollbar-width:none}.price-settings-body>.subtle{margin:0 0 24px;font-size:12px;line-height:1.5;color:#7b8491}.price-settings .fields{display:grid;grid-template-columns:1fr 1fr;gap:18px 12px;align-items:start}.price-settings .fields>label:first-child{grid-column:1/-1}.price-settings input,.price-settings select{border:1px solid #e1e5eb;border-radius:10px;min-height:52px;background:#f7f8fa;font-size:14px}.price-settings .fields label{font-size:12px;color:#606b78}.price-settings .fields label>input,.price-settings .fields label>select{color:#202631}.price-settings details{margin-top:22px}.price-settings summary{font-size:13px}.price-settings details p{font-size:12px;color:#7b8491}.price-settings #basis,.price-settings #cost{margin-top:16px}
@media(max-width:680px){.price-app-header{height:58px;padding:0 16px}.price-app-heading{gap:9px}.price-app-heading>a{font-size:11px}.price-app-header h1{font-size:16px}.price-app-nav{gap:0}.price-app-nav>a{font-size:11px;padding:7px 9px}.price-utilities>summary{font-size:11px}.price-desk{padding:18px 12px}.price-toolbar{display:grid;grid-template-columns:1fr;gap:12px;padding-bottom:14px}.price-book-name h2{font-size:18px}.price-summary{font-size:11px;gap:4px 12px}.price-main-actions{justify-content:flex-end}.price-save-state{margin-right:auto}.price-desk #matrix{padding:12px 10px 0;border-radius:12px}.price-desk .matrix-scroll{margin:10px -10px 0;max-height:calc(100dvh - 290px)}.price-desk .price-matrix td input{font-size:13px}.price-scope-label{font-size:10px}.price-main-actions button{min-height:36px;padding:7px 14px;font-size:12px}dialog.price-settings{width:100vw;height:auto;max-height:88dvh;margin:auto 0 0}.price-settings .t-panel-slide{max-height:88dvh;border-radius:22px 22px 0 0}.price-settings-header{padding:20px}.price-settings-body{padding:20px}.price-settings .fields{gap:16px 10px}.price-settings .fields label:first-child{grid-column:1/-1}.price-desk #staff-desk{display:flex;flex-wrap:wrap}.price-desk #staff-desk[hidden]{display:none}.price-desk #notice{bottom:12px}}
@media(prefers-reduced-motion:reduce){.price-settings .t-panel-slide{transition:none!important;filter:none!important}}
`;
