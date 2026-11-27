import {browserFunction} from '../browser-source.mjs';

export function captureIntroductionMode(button){
  const view=button.ownerDocument.defaultView;
  const box=node=>{const {x,y,width,height}=node.getBoundingClientRect();return {x,y,width,height};};
  const label=[...button.querySelectorAll('span')].find(node=>node.textContent.trim()===button.textContent.trim()&&!node.querySelector('span,svg'));
  const material=button.querySelector('[data-magnetic-material]')||button;
  const style=view.getComputedStyle(button),paint=view.getComputedStyle(material),font=view.getComputedStyle(label||button);
  return {button,label,rect:box(button),labelRect:box(label||button),radius:style.borderRadius,
    borderWidth:paint.borderWidth,borderColor:paint.borderColor,backgroundColor:paint.backgroundColor,
    fontSize:font.fontSize,lineHeight:font.lineHeight,letterSpacing:font.letterSpacing,color:font.color,
    iconOpacity:button.querySelector('svg')?view.getComputedStyle(button.querySelector('svg')).opacity:'0'};
}

/** The controls keep their DOM identity, text and hit area as their boxes resize. */
export function morphIntroductionModes({shell,from,cards,signal,capture,onFinish}){
  const doc=shell.ownerDocument,view=doc.defaultView;
  const controls=Array.from(cards);
  let animations=[],restore=[],revision=0,finished=false;
  const duration=420,deadline=view.performance.now()+duration;
  function reset(){
    ++revision;
    for(const animation of animations)animation.cancel();
    for(const undo of restore)undo();
    animations=[];restore=[];
  }
  function end(notify){
    if(finished)return;
    finished=true;signal?.removeEventListener('abort',cancel);view.removeEventListener('resize',resize);
    reset();if(notify)onFinish?.();
  }
  function cancel(){end(false);}
  function resize(){
    const current=controls.map(capture);
    reset();start(current,Math.max(0,deadline-view.performance.now()));
  }
  function start(starts,remaining){
    const ends=controls.map(capture);
    const clock=doc.timeline?.currentTime,token=revision;
    const options={duration:remaining,easing:'cubic-bezier(0.28, 0.12, 0.2, 1)',fill:'both'};
    const animate=(node,frames)=>{
      const motion=node.animate(frames,options);
      if(Number.isFinite(clock))motion.startTime=clock;
      animations.push(motion);
    };
    for(const [index,button] of controls.entries()){
      const start=starts[index],end=ends[index],a=start.rect,b=end.rect;
      if(!remaining||!a.width||!a.height||!b.width||!b.height||!button.animate)continue;
      const cell=button.parentElement;
      // The cell reserves the final row. Its live button is free to move and
      // resize without shifting the artwork, footer or neighbouring grid track.
      const cellStyle=cell.getAttribute('style'),buttonStyle=button.getAttribute('style');
      restore.push(()=>{
        if(cellStyle===null)cell.removeAttribute('style');else cell.setAttribute('style',cellStyle);
        if(buttonStyle===null)button.removeAttribute('style');else button.setAttribute('style',buttonStyle);
        delete button.dataset.modeResizing;
      });
      Object.assign(cell.style,{position:'relative',height:b.height+'px'});
      Object.assign(button.style,{position:'absolute',left:'0',top:'0',margin:'0',overflow:'hidden',zIndex:'1'});
      button.dataset.modeResizing='';
      const translation=(x,y)=>'translate('+x+'px,'+y+'px)';
      const frame=(state,rect,transform)=>({width:rect.width+'px',height:rect.height+'px',transform,
        borderRadius:state.radius,borderWidth:state.borderWidth,borderColor:state.borderColor,backgroundColor:state.backgroundColor});
      animate(button,[frame(start,a,translation(a.x-b.x,a.y-b.y)),frame(end,b,translation(0,0))]);
      if(end.label){
        const relative=(state,axis,size)=>state.labelRect[axis]+state.labelRect[size]/2-state.rect[axis]-state.rect[size]/2;
        const dx=relative(start,'x','width')-relative(end,'x','width'),dy=relative(start,'y','height')-relative(end,'y','height');
        const font=(s,transform)=>({transform,fontSize:s.fontSize,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,color:s.color});
        animate(end.label,[font(start,translation(dx,dy)),font(end,translation(0,0))]);
      }
      const icon=button.querySelector('svg');
      if(icon)animate(icon,[{opacity:start.iconOpacity||'0'},{opacity:1}]);
    }
    Promise.allSettled(animations.map(a=>a.finished)).then(()=>{if(token===revision)end(true);});
  }
  if(signal?.aborted){cancel();return {cancel};}
  signal?.addEventListener('abort',cancel,{once:true});view.addEventListener('resize',resize);
  start(from,duration);
  return {cancel};
}

// Adapt only the retained member introduction. The recorded authoring source
// remains byte-identical for the historical QA versions.
export function onboardingCardResizeSource(source){
  const replace=(before,after)=>{
    if(source.split(before).length!==2)throw Error('ONBOARDING_CARD_SOURCE_CHANGED');
    source=source.replace(before,()=>after);
  };
  const between=(start,end,replacement)=>{
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    if(a<0||b<0)throw Error('ONBOARDING_CARD_SOURCE_CHANGED');
    replace(source.slice(a,b),replacement);
  };
  replace("    const prefix=shell.classList.contains('member')?'member':'guest';",
    "    const prefix=shell.classList.contains('member')?'member':'guest';\n    const captureMode="+browserFunction(captureIntroductionMode)+",resizeModes="+browserFunction(morphIntroductionModes)+";");
  between('    const go=n=>{','    const brand=shell.querySelector',`    const go=n=>{
      if(exiting||n===step||n<1||n>4)return;
      const request=++stepRequest;exiting=true;
      Promise.resolve(api.select('onboarding',prefix+'-'+n)).then(ok=>{if(ok===false&&request===stepRequest)exiting=false;},()=>{if(request===stepRequest)exiting=false;});
    };
`);
  replace('      const restore=main.contains(document.activeElement);',`      const restore=main.contains(document.activeElement);
      const resize=prefix==='member'&&step===3&&state==='member-4';
      fromTray=resize?[...stage.querySelectorAll('.ob-tasks .ob-mode')].map(captureMode):[];
      const focusedMode=fromTray.find(item=>item.button===document.activeElement)?.button;`);
  replace('      main.replaceWith(nextMain);',`      cancelMode();
      if(resize){
        nextMain.querySelector('.ob-mode-grid').style.animation='none';
        for(const [index,card] of [...nextMain.querySelectorAll('.ob-mode.card')].entries()){
          const {button,label}=fromTray[index];
          // Magnetic cleanup has already unwrapped the original text node.
          button.className=card.className;
          button.replaceChildren(card.querySelector('svg'),label);card.replaceWith(button);
        }
      }
      main.replaceWith(nextMain);`);
  between('      magnetic=connectPrimary();modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);','      fromTray=[];',`      const moving=resize&&!api.reduced?.()&&main.animate;
      magnetic=moving?null:connectPrimary();
      modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);
      if(moving){
        modeFlight=resizeModes({shell,from:fromTray,cards:main.querySelectorAll('.ob-mode.card'),signal:ctl.signal,capture:captureMode,
          onFinish:()=>{modeFlight=null;magnetic=connectPrimary();}});
      }
`);
  replace('      if(restore)main.focus({preventScroll:true});','      if(focusedMode||restore)(focusedMode||main).focus({preventScroll:true});');
  return source;
}
