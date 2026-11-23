import {browserFunction} from '../browser-source.mjs';

const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_ONBOARDING_SOURCE_CHANGED:'+before.slice(0,80));return source.replace(before,after);};
const section=(source,start,end,replacement)=>{
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  if(from<0||to<0||source.indexOf(start,from+start.length)!==-1)throw Error('RESEARCH_ONBOARDING_SECTION_CHANGED');
  return source.slice(0,from)+replacement+source.slice(to);
};

/** A single continuous geometry transition. Labels travel without scaling;
 * icons appear separately, so a long button never stretches its contents. */
export function morphIntroductionModes({shell,from,cards,signal,onFinish}) {
  const document=shell.ownerDocument, window=document.defaultView, moving=[], restores=[];
  let ended=false;
  const layer=document.createElement('div');layer.className='research-mode-transition';layer.setAttribute('aria-hidden','true');
  Object.assign(layer.style,{position:'fixed',inset:'0',pointerEvents:'none',zIndex:'80'});shell.append(layer);
  const timing={duration:360,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'both'};
  function finish(notify=false){
    if(ended)return;ended=true;signal?.removeEventListener('abort',cancel);
    for(const restore of restores)restore();for(const animation of moving)animation.cancel();layer.remove();
    if(notify)onFinish?.();
  }
  function cancel(){finish(false);}
  for(const [index,button]of [...cards].entries()){
    const start=from[index],end=button.getBoundingClientRect();
    if(!start?.width||!start.height||!end.width||!end.height)continue;
    const style=window.getComputedStyle(button),visibility=button.style.visibility;
    button.style.visibility='hidden';restores.push(()=>{button.style.visibility=visibility;});
    const surface=document.createElement('div');
    Object.assign(surface.style,{position:'absolute',boxSizing:'border-box',background:style.backgroundColor,border:style.border,overflow:'hidden'});
    layer.append(surface);
    moving.push(surface.animate([
      {left:start.x+'px',top:start.y+'px',width:start.width+'px',height:start.height+'px',borderRadius:start.radius||'12px'},
      {left:end.x+'px',top:end.y+'px',width:end.width+'px',height:end.height+'px',borderRadius:style.borderRadius}
    ],timing));
    const originalLabel=[...button.querySelectorAll('span')].find(el=>el.textContent.trim()===start.label&&!el.querySelector('span,svg'));
    const target=originalLabel?.getBoundingClientRect(),label=document.createElement('span');label.textContent=start.label;
    const labelStyle=window.getComputedStyle(originalLabel||button),targetX=target?target.x+target.width/2:end.x+end.width/2,targetY=target?target.y+target.height/2:end.y+end.height/2;
    Object.assign(label.style,{position:'absolute',left:'0',top:'0',font:labelStyle.font,color:labelStyle.color,lineHeight:labelStyle.lineHeight,whiteSpace:'nowrap',translate:'-50% -50%'});layer.append(label);
    moving.push(label.animate([
      {transform:'translate('+(start.x+start.width/2)+'px,'+(start.y+start.height/2)+'px)'},
      {transform:'translate('+targetX+'px,'+targetY+'px)'}
    ],timing));
    const originalIcon=button.querySelector('svg');
    if(originalIcon){
      const rect=originalIcon.getBoundingClientRect(),icon=originalIcon.cloneNode(true);
      Object.assign(icon.style,{position:'absolute',left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',color:style.color});layer.append(icon);
      moving.push(icon.animate([{opacity:0,transform:'translateY(8px)',offset:0},{opacity:0,transform:'translateY(8px)',offset:.25},{opacity:1,transform:'translateY(0)',offset:1}],timing));
    }
  }
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  else Promise.allSettled(moving.map(animation=>animation.finished)).then(()=>finish(true));
  return {cancel};
}

export function researchOnboardingMarkup(html){return html.replace('<h2>사업자 정보</h2>','');}

export function researchOnboardingSource(source){
  source=once(source,"'<h2>사업자 정보</h2><dl>'","'<dl>'");
  source=once(source,"    const prefix=shell.classList.contains('member')?'member':'guest';",`    const prefix=shell.classList.contains('member')?'member':'guest';
    const researchMorphModes=${browserFunction(morphIntroductionModes)};
    let companyHeaderInert=null;
    const restoreCompanyHeader=()=>{const header=api.applicationHeader?.element;if(header&&companyHeaderInert!==null){header.inert=companyHeaderInert;companyHeaderInert=null;}};`);
  source=section(source,'    const go=n=>{','    const brand=shell.querySelector',`    const go=n=>{
      if(exiting || n===step || n<1 || n>4)return;
      const request=++stepRequest;
      if(prefix==='member'&&step===3&&n===4&&!api.reduced?.()){
        exiting=true;
        fromTray=[...stage.querySelectorAll('.ob-tasks .ob-mode')].map(button=>{
          const rect=button.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,radius:getComputedStyle(button).borderRadius,label:button.textContent.trim()};
        });
      }
      // Keep the old buttons visible while the next module is being obtained.
      // There is no exit animation followed by a second, delayed entrance.
      Promise.resolve(api.select('onboarding',prefix+'-'+n)).then(result=>{if(result===false&&request===stepRequest){exiting=false;fromTray=[];}},()=>{if(request===stepRequest){exiting=false;fromTray=[];}});
    };
`);
  source=once(source,"      if(badge){badge.textContent=count>99?'99+':String(count);badge.hidden=!count;}",`      if(badge){
        badge.classList.add('t-badge');badge.hidden=false;badge.setAttribute('aria-hidden','true');
        let dot=badge.querySelector('.t-badge-dot');if(!dot){dot=document.createElement('span');dot.className='t-badge-dot';badge.replaceChildren(dot);}
        dot.textContent=count>99?'99+':String(count);badge.dataset.open=String(count>0);
      }`);
  source=once(source,'    if(quick){\n      noticeState(brandMenu?.inspect());',`    const unsubscribeNotice=api.applicationHeader?.subscribe?.(noticeState);
    if(quick){
      noticeState(brandMenu?.inspect());`);
  source=once(source,'      main.replaceWith(nextMain);','      cancelMode();\n      main.replaceWith(nextMain);');
  source=section(source,'      magnetic=connectPrimary();modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);','      fromTray=[];',`      const transition=fromTray.length&&step===4&&!api.reduced?.();
      magnetic=transition?null:connectPrimary();modeIcons=transition?null:w.ORDER_INTRO_ICONS?.(main,api.reduced);
      if(transition){
        const ownedMain=main;main.querySelector('.ob-mode-grid').style.animation='none';
        modeFlight=researchMorphModes({shell,from:fromTray,cards:main.querySelectorAll('.ob-mode.card'),signal:ctl.signal,onFinish:()=>{
          modeFlight=null;if(!ctl.signal.aborted&&main===ownedMain){magnetic=connectPrimary();modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);}
        }});
      }
`);
  source=once(source,"      shade.hidden=!open;stage.inert=open;shell.classList.toggle('footer-open',open);",`      const header=api.applicationHeader?.element;
      if(open&&header){if(companyHeaderInert===null)companyHeaderInert=Boolean(header.inert);header.inert=true;}else restoreCompanyHeader();
      shade.hidden=!open;stage.inert=open;shell.classList.toggle('footer-open',open);`);
  source=once(source,'return ()=>{endDrag();clearTimeout(clickReset);cancelMode();','return ()=>{restoreCompanyHeader();unsubscribeNotice?.();endDrag();clearTimeout(clickReset);cancelMode();');
  source=once(source,"    if(state==='company')show(true);","    on(root,'order:research-leave',()=>{if(!shade.hidden)show(false);});\n    if(state==='company')show(true);");
  source=once(source,'return ()=>{restoreCompanyHeader();','return ()=>{if(api.applicationHeader)brandMenu?.resume();restoreCompanyHeader();');
  return source;
}

export const researchOnboardingCss=String.raw`
#order-app-page .ob{isolation:auto}
#order-app-page .ob.footer-open .ob-stage>:not(header){filter:none;transform:none;border-radius:0}
#order-app-page .ob .ob-shade{position:fixed;inset:0;z-index:100;background:rgb(22 29 36 / 35%);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
#order-app-page .ob .ob-drawer{max-height:82dvh}
#order-app-page .ob .ob-art-caption,#order-app-page .ob .ob-art-caption .ob-art-detail,#order-app-page .ob .ob-art-caption small{font-size:14px;line-height:24px}
#order-app-page .ob .ob-mode.card{cursor:pointer}
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
#order-app-page .ob .quick-unread .t-badge-dot{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:20px;height:20px;padding:0 5px;border:0;border-radius:999px;background:#bf2e43;color:white;font:600 11px/1 system-ui;font-variant-numeric:tabular-nums}
`;
