import {onboardingCardResizeSource} from '../product-ui/onboarding-card-resize.mjs';
import {onboardingMarketChartSource} from '../product-ui/onboarding-market-chart.mjs';
import {onboardingGooeyCss} from '../product-ui/onboarding-gooey-style.mjs';

const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_ONBOARDING_SOURCE_CHANGED:'+before.slice(0,80));return source.replace(before,after);};
const section=(source,start,end,replacement)=>{
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  if(from<0||to<0||source.indexOf(start,from+start.length)!==-1)throw Error('RESEARCH_ONBOARDING_SECTION_CHANGED');
  return source.slice(0,from)+replacement+source.slice(to);
};

export function researchOnboardingMarkup(html){return html.replace('<h2>사업자 정보</h2>','');}

export function researchOnboardingSource(source){
  source=onboardingMarketChartSource(onboardingCardResizeSource(source));
  source=once(source,"      if(prefix==='guest'&&step===4)return null;","      if(step===4)return null;");
  source=once(source,"if(button){exiting=false;button.focus({preventScroll:true});modeMorph(button,true,()=>{});}","if(button){exiting=false;button.focus({preventScroll:true});}");
  source=once(source,"if(!exiting){exiting=true;modeMorph(b,false,()=>{if(!ctl.signal.aborted)api.select(target,s);});}","if(!exiting){exiting=true;Promise.resolve(api.select(target,s)).then(accepted=>{if(accepted===false)exiting=false;},()=>{exiting=false;});}");
  source=once(source,"'<h2>사업자 정보</h2><dl>'","'<dl>'");
  source=once(source,"    const prefix=shell.classList.contains('member')?'member':'guest';",`    const prefix=shell.classList.contains('member')?'member':'guest';
    let companyHeaderInert=null,companyMotion=null,companyEpoch=0;
    const restoreCompanyHeader=()=>{const header=api.applicationHeader?.element;if(header&&companyHeaderInert!==null){header.inert=companyHeaderInert;companyHeaderInert=null;}};`);
  source=once(source,"      if(badge){badge.textContent=count>99?'99+':String(count);badge.hidden=!count;}",`      if(badge){
        badge.classList.add('t-badge');badge.hidden=false;badge.setAttribute('aria-hidden','true');
        let dot=badge.querySelector('.t-badge-dot');if(!dot){dot=document.createElement('span');dot.className='t-badge-dot';badge.replaceChildren(dot);}
        const label=count>99?'99+':String(count),open=String(count>0);
        if(dot.textContent!==label){
          if(open==='true'&&badge.dataset.open==='true'&&!api.reduced?.()){
            // Reuse the source entrance for the new number, including rapid replacements.
            // Commit the closed style in this task so the reset never paints.
            badge.dataset.badgeReset='';badge.dataset.open='false';
            void dot.offsetWidth;
            delete badge.dataset.badgeReset;
          }
          dot.textContent=label;dot.dataset.capped=String(count>99);
        }
        if(badge.dataset.open!==open)badge.dataset.open=open;
      }`);
  source=once(source,'    if(quick){\n      noticeState(brandMenu?.inspect());',`    const unsubscribeNotice=api.applicationHeader?.subscribe?.(noticeState);
    if(quick){
      noticeState(brandMenu?.inspect());`);
  source=section(source,'    function show(open){',"    on(shell,'click',e=>{",`    function show(open){
      const wasHidden=shade.hidden||companyEpoch===0,version=++companyEpoch;
      const fromOpacity=wasHidden?'0':getComputedStyle(shade).opacity;
      const fromTransform=wasHidden?'translateY(100%)':getComputedStyle(modal).transform;
      companyMotion?.cancel();companyMotion=null;
      const header=api.applicationHeader?.element;
      if(open){
        if(header){if(companyHeaderInert===null)companyHeaderInert=Boolean(header.inert);header.inert=true;}
        quickMenu?.close();endDrag();controller?.activate();magnetic?.reset();modeIcons?.pause();brandMenu?.pause();
        if(wasHidden){
          paused=stage.getAnimations?.({subtree:true}).filter(a=>a.playState==='running')||[];
          for(const animation of paused)animation.pause();
          for(const svg of stage.querySelectorAll('svg'))svg.pauseAnimations?.();
        }
        shade.hidden=false;shade.setAttribute('popover','manual');
        if(shade.showPopover&&!shade.matches(':popover-open'))shade.showPopover();
        stage.inert=true;shell.classList.add('footer-open');
      }
      shade.dataset.researchOpen=String(open);
      shade.style.opacity=open?'1':'0';modal.style.transform=open?'none':'translateY(100%)';
      const finish=()=>{
        if(version!==companyEpoch||ctl.signal.aborted)return;
        companyMotion=null;
        if(open){controller?.reset();grip.focus({preventScroll:true});return;}
        if(shade.hidePopover&&shade.matches(':popover-open'))shade.hidePopover();shade.hidden=true;shade.style.removeProperty('opacity');modal.style.removeProperty('transform');
        controller?.deactivate();controller?.reset();restoreCompanyHeader();stage.inert=false;shell.classList.remove('footer-open');
        modeIcons?.resume();brandMenu?.resume();
        for(const animation of paused)animation.play();paused=[];
        for(const svg of stage.querySelectorAll('svg'))svg.unpauseAnimations?.();
        if(opener.isConnected)opener.focus({preventScroll:true});
      };
      if(api.reduced?.()||!shade.animate){finish();return;}
      const timing={duration:open?300:240,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'both'};
      const motions=[shade.animate([{opacity:fromOpacity},{opacity:open?1:0}],timing),
        modal.animate([{transform:fromTransform},{transform:open?'translateY(0)':'translateY(100%)'}],timing)];
      companyMotion={cancel(){for(const animation of motions)animation.cancel();}};
      Promise.allSettled(motions.map(animation=>animation.finished)).then(()=>{
        if(version!==companyEpoch||ctl.signal.aborted)return;
        for(const animation of motions)animation.cancel();finish();
      });
    }
`);
  source=once(source,'return ()=>{endDrag();clearTimeout(clickReset);cancelMode();','return ()=>{restoreCompanyHeader();unsubscribeNotice?.();endDrag();clearTimeout(clickReset);cancelMode();');
  source=once(source,"    if(state==='company')show(true);","    on(root,'order:research-leave',()=>{if(!shade.hidden)show(false);});\n    if(state==='company')show(true);");
  source=once(source,'return ()=>{restoreCompanyHeader();',"return ()=>{companyEpoch++;companyMotion?.cancel();if(shade.hidePopover&&shade.matches(':popover-open'))shade.hidePopover();if(api.applicationHeader)brandMenu?.resume();restoreCompanyHeader();");
  return source;
}

export const researchOnboardingCss=String.raw`
#order-single #order-app-header .obm-brand[data-authenticated=false]{gap:4px}
#order-single #order-app-header .obm-brand .obm-trigger:is(:hover,:active){background:transparent;box-shadow:none}
#order-app-page .ob{isolation:auto}
#order-app-page .ob.footer-open .ob-stage>:not(header){filter:none;transform:none;border-radius:0}
#order-app-page .ob .ob-shade{position:fixed;inset:0;z-index:100;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:rgb(22 29 36 / 35%);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);overflow:hidden}
#order-app-page .ob .ob-shade::backdrop{background:transparent}
#order-app-page .ob .ob-drawer{max-height:82dvh;animation:none}
#order-app-page .ob .ob-art-caption,#order-app-page .ob .ob-art-caption .ob-art-detail,#order-app-page .ob .ob-art-caption small{font-size:14px;line-height:24px}
/* The member artboards already include the introduction copy's top inset.
   The shared live header occupies its original 78px grid row. */
#order-app-page .ob .ob-main{padding-top:0}
#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3){grid-template-rows:177px minmax(328px,1fr) 91px}
#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-copy{padding-top:46px}
#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-copy h1{height:71px}
#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-copy p{height:45px}
#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-visual{padding-top:32px}
#order-app-page .ob .ob-art{width:min(100%,287px);height:226px;object-fit:contain}
#order-app-page .ob .ob-art-caption{margin-top:12px}
#order-app-page .ob .ob-art-caption small{margin-top:0}
#order-app-page .ob .ob-mode.card:active{transform:none}
@media(max-height:720px){#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3){grid-template-rows:151px minmax(268px,1fr) 54px}#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-copy{padding-top:20px}#order-app-page .ob .ob-main:is(.step-1,.step-2,.step-3) .ob-visual{padding-top:12px}#order-app-page .ob .ob-art{height:170px}}
#order-app-page .ob.member .step-2 .ob-art-caption small{font-size:10px}
#order-app-page .ob.member .ob-tasks .ob-mode.simple{border-width:2px}
#order-app-page .ob.member .ob-mode.card.simple{border-width:3px}
/* Both titles share a baseline below a 60px illustration row. */
#order-app-page .ob.member .ob-mode.card [data-intro-icon=search]{width:52px;height:60px;stroke-width:2.5}
#order-app-page .ob.member .ob-mode.card span:not(:has(svg,span)){position:relative;top:2px}
#order-app-page .ob.member .ob-mode.card [data-intro-icon=file-search]{width:60px;height:60px}
#order-app-page .ob .ob-mode.card{cursor:pointer}
${onboardingGooeyCss}
/* Transitions.dev 03-notification-badge. The badge owns its pop; the bell stays still. */
#order-single{--badge-slide-dur:260ms;--badge-pop-dur:500ms;--badge-pop-close-dur:180ms;--badge-fade-dur:400ms;--badge-fade-close-dur:180ms;--badge-blur:2px;--badge-offset-x:-8.2px;--badge-offset-y:12.4px;--badge-slide-ease:cubic-bezier(0.22,1,0.36,1);--badge-pop-ease:cubic-bezier(0.34,1.36,0.64,1);--badge-close-ease:cubic-bezier(0.4,0,0.2,1)}
@keyframes t-badge-slide-in {
  from { transform: translate(var(--badge-offset-x), var(--badge-offset-y)); }
  to   { transform: translate(0, 0); }
}
.t-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  pointer-events: none;
  will-change: transform;
}
.t-badge[data-open="true"] {
  animation: t-badge-slide-in var(--badge-slide-dur) var(--badge-slide-ease);
}
.t-badge-dot {
  display: block;
  transform-origin: center;
  transform: scale(1);
  opacity: 1;
  filter: blur(0);
  transition:
    transform var(--badge-pop-dur)  var(--badge-pop-ease),
    opacity   var(--badge-fade-dur) var(--badge-pop-ease),
    filter    var(--badge-pop-dur)  var(--badge-pop-ease);
  will-change: transform, opacity, filter;
}
.t-badge[data-open="false"] .t-badge-dot {
  transform: scale(0);
  opacity: 0;
  filter: blur(var(--badge-blur));
  transition:
    transform var(--badge-pop-close-dur)  var(--badge-close-ease),
    opacity   var(--badge-fade-close-dur) var(--badge-close-ease),
    filter    var(--badge-pop-close-dur)  var(--badge-close-ease);
}
@media (prefers-reduced-motion: reduce) {
  .t-badge, .t-badge-dot { animation: none !important; transition: none !important; }
}
#order-app-page .ob .quick-unread.t-badge{top:-4px;right:-4px;min-width:0;padding:0;border:0;background:transparent;line-height:1}
#order-app-page .ob .quick-unread[data-badge-reset],#order-app-page .ob .quick-unread[data-badge-reset] .t-badge-dot{animation:none;transition:none}
#order-app-page .ob .quick-unread .t-badge-dot{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:20px;height:20px;padding:0;border:0;border-radius:999px;font:600 11px/1 system-ui;font-variant-numeric:tabular-nums}
#order-app-page .ob .quick-unread .t-badge-dot[data-capped=true]{font-size:9px}
`;
