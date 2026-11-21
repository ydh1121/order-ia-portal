// Shared product controls; the QA transport supplies data, never a second renderer.
// Recipes: https://transitions.dev (01,05,07,14,27), https://designbookmark.com/motion
// Springy Input / Tag Input, and kokonut-labs/kokonutui wheel-picker.tsx (MIT).
// The native field retains its value, selection, composition and form submission.
export function createCommonMotion(win=window){
 if(win.ORDER_COMMON_MOTION?.version==='motion21')return win.ORDER_COMMON_MOTION;
 const doc=win.document,media=win.matchMedia?.('(prefers-reduced-motion: reduce)'),lifetime=new win.AbortController();
 const reduced=()=>media?.matches===true||doc.hidden;
 const cleanups=new Set(),resizeJobs=new WeakMap(),backdrops=new WeakMap(),liveAnimations=new Set();let serial=0;
 const uid=prefix=>'r3-'+prefix+'-'+(++serial);
 const time=(el,key,fallback)=>{const raw=win.getComputedStyle(el).getPropertyValue(key).trim(),n=parseFloat(raw);return Number.isFinite(n)?n*(raw.endsWith('ms')?1:1000):fallback;};
 const ease=(el,key,fallback='cubic-bezier(.22,1,.36,1)')=>win.getComputedStyle(el).getPropertyValue(key).trim()||fallback;
 const animation=(el,frames,options={})=>{
  if(reduced()||!el.animate)return null;
  const a=el.animate(frames,options);liveAnimations.add(a);a.finished.then(()=>liveAnimations.delete(a),()=>liveAnimations.delete(a));return a;
 };
 const finish=(a,fn)=>{if(a)a.finished.then(fn,()=>{});else fn();};
 const style=doc.createElement('style');style.id='order-common-motion';style.textContent=`
[data-r3-skeleton]{position:relative;isolation:isolate}
[data-r3-skeleton=pending]>*:not(.r3-geometry-skeleton){opacity:0!important}
[data-r3-skeleton=reveal]>*:not(.r3-geometry-skeleton){animation:r3-content-reveal var(--reveal-dur,400ms) var(--reveal-ease,ease-in-out) both}
.r3-geometry-skeleton{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;opacity:1;filter:blur(0);transition:opacity var(--reveal-dur,400ms) var(--reveal-ease,ease-in-out),filter var(--reveal-dur,400ms) var(--reveal-ease,ease-in-out)}
.r3-geometry-skeleton>i{position:absolute;display:block;border-radius:3px;background:var(--r3-skeleton-ink,#dde4ec);animation:r3-geometry-pulse var(--pulse-dur,1000ms) ease-in-out infinite}
[data-r3-skeleton=reveal]>.r3-geometry-skeleton{opacity:0;filter:blur(var(--reveal-blur,2px))}
@keyframes r3-content-reveal{from{opacity:0;filter:blur(var(--reveal-blur,2px))}to{opacity:1;filter:blur(0)}}
@keyframes r3-geometry-pulse{50%{opacity:var(--pulse-min,.5)}}
.r3-input-mirror{position:fixed;pointer-events:none!important;z-index:2147483000;box-sizing:border-box;margin:0;overflow:hidden;background:transparent;contain:layout style;white-space:pre}
.r3-input-mirror>span{display:inline-block;white-space:pre;transform-origin:center bottom}
.r3-dropdown{transform-origin:top left;opacity:0;transform:scale(var(--dropdown-pre-scale,.97));pointer-events:none;transition:transform var(--dropdown-open-dur,250ms) var(--dropdown-ease,cubic-bezier(.22,1,.36,1)),opacity var(--dropdown-open-dur,250ms) var(--dropdown-ease,cubic-bezier(.22,1,.36,1))}
.r3-dropdown[data-origin^=bottom]{transform-origin:bottom left}
.r3-dropdown.is-open{opacity:1;transform:scale(1);pointer-events:auto}
.r3-dropdown.is-closing{opacity:0;transform:scale(var(--dropdown-closing-scale,.99));pointer-events:none;transition-duration:var(--dropdown-close-dur,150ms)}
.r3-select-shell{position:relative;display:block;min-width:0}
.r3-select-native{position:absolute!important;width:1px!important;height:1px!important;clip-path:inset(50%)!important;overflow:hidden!important;opacity:0!important}
.r3-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;min-width:0;width:100%;text-align:start;color:inherit;font:inherit}
.r3-select-trigger::after{content:'⌄';flex:none}.r3-select-trigger:disabled{opacity:.5;cursor:default}
.r3-select-options{position:fixed;z-index:2147483001;box-sizing:border-box;margin:0;padding:4px;border:1px solid #cbd4df;border-radius:10px;background:Canvas;color:CanvasText;box-shadow:0 8px 22px #182b4826;overflow:auto;overscroll-behavior:contain}
.r3-select-options [role=option]{display:block;min-height:36px;width:100%;border:0;border-radius:6px;padding:8px 12px;text-align:start;font:inherit;background:transparent;color:inherit}
.r3-select-options [role=option]:is(:focus,[aria-selected=true]){background:var(--surface,#edf2f8);outline:0}.r3-select-options [role=option]:disabled{opacity:.45}
@supports(appearance:base-select) and selector(::picker(select)){
 select:not([multiple]):not([size]),select:not([multiple]):not([size])::picker(select){appearance:base-select}
 select:not([multiple]):not([size])::picker(select){transform-origin:var(--r3-menu-origin,top) left;position-try-fallbacks:flip-block;opacity:0;transform:scale(var(--dropdown-pre-scale,.97));border:1px solid #cbd4df;border-radius:10px;padding:4px;max-height:min(20rem,45dvh);overflow:auto;transition:opacity var(--dropdown-close-dur,150ms) ease-out,transform var(--dropdown-close-dur,150ms) var(--dropdown-ease,ease-out),display var(--dropdown-close-dur,150ms) allow-discrete,overlay var(--dropdown-close-dur,150ms) allow-discrete}
 select:not([multiple]):not([size])::picker(select):popover-open{opacity:1;transform:scale(1);transition-duration:var(--dropdown-open-dur,250ms)}
 @starting-style{select:not([multiple]):not([size])::picker(select):popover-open{opacity:0;transform:scale(var(--dropdown-pre-scale,.97))}}
}
.r3-tag-removing{pointer-events:none!important;overflow:hidden!important;min-width:0!important;white-space:nowrap!important}
.r3-persisted-switch{display:inline-flex;align-items:center;gap:10px;background:transparent;border:0;color:inherit;font:inherit;cursor:pointer}
.r3-switch-track{position:relative;display:inline-block;width:36px;height:22px;flex:none;border-radius:99px;background:#8793a1;transition:background var(--toggle-track,140ms) ease-out}
.r3-switch-thumb{position:absolute;inset:3px auto auto 3px;width:16px;height:16px;border-radius:50%;background:white;box-shadow:0 1px 3px #15203140}
[data-on=true] .r3-switch-track{background:var(--blue,#315dde)}[data-on=true] .r3-switch-thumb{translate:14px 0}
.r3-persisted-switch[aria-busy=true]{cursor:progress}.r3-persisted-switch:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:5px}
.r3-wheel{position:relative!important;overflow:hidden!important;height:220px!important;min-height:220px;touch-action:none;perspective:900px;scroll-snap-type:none!important;overscroll-behavior:contain}
.r3-wheel>.wheel-spacer{display:none!important}
.r3-wheel>[role=option]{position:absolute!important;left:0;right:0;top:calc(50% - 22px)!important;width:100%;height:44px;min-height:44px!important;margin:0!important;box-sizing:border-box;backface-visibility:hidden;transform-origin:center center;transition:none!important;will-change:transform;white-space:nowrap}
.r3-wheel>[role=option][aria-selected=true]{font-weight:700;color:var(--ink,#20272a)}
.r3-bottom-panel{position:fixed!important;inset:auto 0 0!important;max-height:min(90dvh,840px);width:min(100%,620px);margin:0 auto!important;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;background:var(--paper,#fff);color:var(--ink,#20272a);border:1px solid #d9e0e8;border-bottom:0;border-radius:22px 22px 0 0;box-shadow:0 -10px 45px #14223926;padding:18px 22px max(22px,env(safe-area-inset-bottom));z-index:1002;transform:none;transition:none!important;touch-action:pan-y}
.r3-panel-dim{position:fixed!important;inset:0!important;z-index:1001!important;background:#14223966}.r3-panel-handle{display:block;width:72px;min-height:32px;margin:-10px auto 4px;border:0;background:transparent;touch-action:none;cursor:grab}.r3-panel-handle::before{content:'';display:block;width:36px;height:4px;margin:auto;border-radius:6px;background:#9aa7b6}
@media(prefers-reduced-motion:reduce){.r3-geometry-skeleton,.r3-dropdown,.r3-switch-track,select::picker(select){transition:none!important}.r3-geometry-skeleton>i,[data-r3-skeleton=reveal]>*{animation:none!important}}
`;doc.head?.append(style);

 function skeleton(region){
  const layer=doc.createElement('span');layer.className='r3-geometry-skeleton';layer.setAttribute('aria-hidden','true');
  const original={state:region.getAttribute('data-r3-skeleton'),inert:region.inert};let done=false,queued=false,phase='pending';
  function measure(){
   queued=false;if(done)return;
   const origin=region.getBoundingClientRect(),rects=[];
   const walk=doc.createTreeWalker(region,win.NodeFilter.SHOW_TEXT);
   for(let text=walk.nextNode();text;text=walk.nextNode()){
    const parent=text.parentElement;if(!text.textContent.trim()||!parent||layer.contains(text)||parent.closest('style,script,[hidden],[aria-hidden=true],.r3-motion-face,.r3-input-mirror'))continue;
    const cs=win.getComputedStyle(parent);if(cs.display==='none'||cs.visibility==='hidden')continue;
    const range=doc.createRange();range.selectNodeContents(text);
    for(const rect of range.getClientRects?.()||[]){
     if(rect.width<=0||rect.height<=0)continue;
     rects.push({x:rect.left-origin.left+region.scrollLeft,y:rect.top-origin.top+region.scrollTop,w:rect.width,h:rect.height});
    }
   }
   layer.replaceChildren(...rects.map(rect=>{const bar=doc.createElement('i');Object.assign(bar.style,{left:rect.x+'px',top:rect.y+'px',width:rect.w+'px',height:rect.h+'px'});return bar;}));
   if(layer.parentNode!==region)region.append(layer);
   layer.dataset.textRects=String(rects.length);region.dataset.r3Skeleton=phase;
  }
  const schedule=()=>{if(!queued&&!done){queued=true;win.queueMicrotask(measure);}};
  const observer=new win.MutationObserver(records=>{if(records.some(r=>r.target!==layer&&!layer.contains(r.target)&&(r.type==='characterData'||[...r.addedNodes,...r.removedNodes].some(n=>n!==layer))))schedule();});
  const sizes=win.ResizeObserver?new win.ResizeObserver(schedule):null;
  measure();region.inert=true;observer.observe(region,{subtree:true,childList:true,characterData:true});sizes?.observe(region);
  function destroy(){if(done)return;done=true;observer.disconnect();sizes?.disconnect();layer.remove();region.inert=original.inert;if(original.state===null)region.removeAttribute('data-r3-skeleton');else region.setAttribute('data-r3-skeleton',original.state);cleanups.delete(destroy);}
  cleanups.add(destroy);
  return {layer,measure,finish(state){if(done)return;if(state==='error'){destroy();return;}phase='reveal';region.inert=original.inert;measure();},destroy};
 }

 function resize(el,target,{duration=time(el,'--resize-dur',300),from,complete}={}){
  const measured=from||el.getBoundingClientRect(),previous=resizeJobs.get(el);previous?.cancel();
  const transition=el.style.transition;el.style.transition='none';
  const first={},last={};for(const prop of ['width','height'])if(Number.isFinite(target[prop])){first[prop]=measured[prop]+'px';last[prop]=Math.max(0,target[prop])+'px';el.style[prop]=last[prop];}
  const a=animation(el,[first,last],{duration,easing:ease(el,'--resize-ease'),fill:'both'});
  const job={animation:a,cancel(){a?.cancel();if(resizeJobs.get(el)===job){el.style.transition=transition;resizeJobs.delete(el);}}};resizeJobs.set(el,job);
  finish(a,()=>{if(resizeJobs.get(el)!==job)return;a?.cancel();el.style.transition=transition;resizeJobs.delete(el);complete?.();});return job;
 }

 function dropdown(menu,{trigger,signal,place}={}){
  let timer=0,version=0,closed=menu.hidden||!menu.classList.contains('is-open');menu.classList.add('r3-dropdown');
  function set(open,{focus=false}={}){
   const gen=++version;win.clearTimeout(timer);closed=!open;
   if(open){menu.hidden=false;place?.();const r=trigger?.getBoundingClientRect();if(r)menu.dataset.origin=(win.innerHeight-r.bottom<Math.min(menu.scrollHeight||200,240)&&r.top>win.innerHeight-r.bottom?'bottom':'top')+'-left';menu.classList.remove('is-closing');menu.inert=false;void menu.offsetHeight;menu.classList.add('is-open');}
   else {menu.classList.remove('is-open');menu.classList.add('is-closing');menu.inert=true;timer=win.setTimeout(()=>{if(gen===version){menu.hidden=true;menu.classList.remove('is-closing');}},reduced()?0:time(menu,'--dropdown-close-dur',150));}
   trigger?.setAttribute('aria-expanded',String(open));if(focus)trigger?.focus({preventScroll:true});
  }
  function destroy(){++version;win.clearTimeout(timer);menu.classList.remove('is-open','is-closing');menu.hidden=true;menu.inert=true;cleanups.delete(destroy);}
  signal?.addEventListener('abort',destroy,{once:true});cleanups.add(destroy);
  return {set,open:()=>!closed,destroy};
 }

 function tagInsert(list,chip){
  const previous=[...list.children].map(el=>[el,el.getBoundingClientRect()]);list.append(chip);
  for(const [el,box] of previous){const to=el.getBoundingClientRect();animation(el,[{translate:(box.left-to.left)+'px '+(box.top-to.top)+'px'},{translate:'0px 0px'}],{duration:260,easing:ease(list,'--resize-ease')});}
  return animation(chip,[{scale:'.72',opacity:0},{scale:'1.065',opacity:1,offset:.65},{scale:'1',opacity:1}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});
 }
 function tagRemove(chip,{complete}={}){
  if(chip.dataset.r3Removing)return Promise.resolve();chip.dataset.r3Removing='true';chip.inert=true;
  const cs=win.getComputedStyle(chip),box=chip.getBoundingClientRect();chip.classList.add('r3-tag-removing');
  const a=animation(chip,[{width:box.width+'px',paddingInlineStart:cs.paddingInlineStart,paddingInlineEnd:cs.paddingInlineEnd,marginInlineEnd:cs.marginInlineEnd,opacity:1,scale:'1'},
   {width:'0px',paddingInlineStart:'0px',paddingInlineEnd:'0px',marginInlineEnd:'0px',opacity:0,scale:'.72'}],{duration:240,easing:ease(chip,'--resize-ease'),fill:'forwards'});
  return (a?a.finished.catch(()=>{}):Promise.resolve()).then(()=>{chip.remove();complete?.();});
 }

 function persistedSwitch(button,{value=false,save,onError,onSaved,signal}={}){
  let committed=Boolean(value),pending=false,revision=0,controller=null,thumbAnimation;
  button.type='button';button.classList.add('r3-persisted-switch');button.setAttribute('role','switch');
  let track=button.querySelector('.r3-switch-track');if(!track){track=doc.createElement('span');track.className='r3-switch-track';track.setAttribute('aria-hidden','true');const thumb=doc.createElement('span');thumb.className='r3-switch-thumb';track.append(thumb);button.prepend(track);}
  const thumb=track.firstElementChild;
  function paint(next,move){const before=win.getComputedStyle(thumb).translate;thumbAnimation?.cancel();button.dataset.on=String(next);button.setAttribute('aria-checked',String(next));if(move)thumbAnimation=animation(thumb,[{translate:before==='none'?(next?'0px':'14px'):before},{translate:(next?15:-1)+'px',offset:.55},{translate:(next?13.5:.5)+'px',offset:.8},{translate:(next?14:0)+'px'}],{duration:time(button,'--toggle-dur',350),easing:ease(button,'--toggle-ease','cubic-bezier(.34,1.35,.64,1)')});}
  async function commit(next){
   if(pending||signal?.aborted||next===committed)return false;
   pending=true;const at=++revision,old=committed;controller=new win.AbortController();paint(next,true);button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');
   try{if(typeof save!=='function')throw new Error('SAVE_NOT_CONNECTED');const result=await save(next,{signal:controller.signal});if(result?.ok===false)throw new Error(result.error||'SAVE_FAILED');if(at!==revision||signal?.aborted)return false;committed=typeof result?.value==='boolean'?result.value:next;if(committed!==next)paint(committed,true);onSaved?.(committed,result);return true;}
   catch(error){if(at===revision){paint(old,true);if(error.name!=='AbortError')onError?.(error);}return false;}
   finally{if(at===revision){pending=false;button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');}}
  }
  const click=()=>commit(!committed);button.addEventListener('click',click,{signal});paint(committed,false);
  const destroy=()=>{++revision;controller?.abort();thumbAnimation?.cancel();button.removeEventListener('click',click);paint(committed,false);button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');cleanups.delete(destroy);};
  signal?.addEventListener('abort',destroy,{once:true});cleanups.add(destroy);return {commit,get value(){return committed;},get pending(){return pending;},destroy};
 }

 function wheel(column,{value,onChange,signal,rowHeight=44,optionValue=el=>el.dataset.value??el.dataset.openingValue??el.dataset.hour??el.dataset.minute??el.textContent.trim()}={}){
  // Kokonut's 20° cylinder, bounded exponential resistance, 80ms velocity
  // window and 0.32s coast. One state owns drag, wheel, keyboard and settle.
  const angle=20,radius=rowHeight/2/Math.tan(angle/2*Math.PI/180),original=column.getAttribute('style'),controller=new win.AbortController();let items=[],position=0,velocity=0,frame=0,last=0,target=0,drag=null,scrollTimer=0,committed,stopped=false,suppress=false;
  column.classList.add('r3-wheel');column.tabIndex=0;column.setAttribute('role','listbox');
  const options=()=>[...column.querySelectorAll('[role=option]')].filter(el=>!el.disabled&&!el.hidden);
  const clamp=x=>Math.max(0,Math.min(items.length-1,x));
  const resistance=x=>x<0?-1.2*(1-Math.exp(x/1.2)):x>items.length-1?items.length-1+1.2*(1-Math.exp(-(x-items.length+1)/1.2)):x;
  function paint(){
   const selected=Math.round(clamp(position));column.dataset.wheelPosition=position.toFixed(4);
   for(const item of column.querySelectorAll('[role=option]'))if(!items.includes(item)){item.setAttribute('aria-selected','false');item.tabIndex=-1;item.classList.remove('selected');item.style.visibility='hidden';item.style.opacity='0';item.style.pointerEvents='none';}
   for(let i=0;i<items.length;i++){const item=items[i],degrees=(position-i)*angle;item.style.transform=`translateZ(${-radius}px) rotateX(${degrees}deg) translateZ(${radius}px)`;item.style.opacity=Math.abs(degrees)>90?'0':String(Math.max(.15,Math.cos(degrees*Math.PI/180)));item.style.visibility=Math.abs(degrees)>100?'hidden':'visible';item.style.pointerEvents=Math.abs(degrees)>80?'none':'';item.style.top='calc(50% - '+rowHeight/2+'px)';item.style.height=rowHeight+'px';item.tabIndex=-1;item.setAttribute('aria-selected',String(i===selected));item.classList.toggle('selected',i===selected);if(!item.id)item.id=uid('wheel-option');if(i===selected)column.setAttribute('aria-activedescendant',item.id);}
  }
  function cancel(){win.cancelAnimationFrame(frame);frame=0;win.clearTimeout(scrollTimer);}
  function emit(){const item=items[Math.round(clamp(position))];if(!item)return;const next=String(optionValue(item));if(next!==committed){committed=next;onChange?.(next,item);}column.dispatchEvent(new win.CustomEvent('r3:wheel-settled',{bubbles:true,detail:{value:next,position}}));}
  function settle(to=position,speed=0){
   cancel();items=options();if(!items.length)return;target=clamp(Math.round(to));velocity=speed;last=0;
   if(reduced()){position=target;paint();emit();return;}
   const step=now=>{if(stopped)return;const dt=Math.min(.032,last?(now-last)/1000:1/60);last=now;velocity+=(140*(target-position)-24*velocity)*dt;position+=velocity*dt;paint();if(Math.abs(position-target)<.001&&Math.abs(velocity)<.01){position=target;velocity=0;frame=0;paint();emit();}else frame=win.requestAnimationFrame(step);};frame=win.requestAnimationFrame(step);
  }
  function set(next,{animate=false,silent=true}={}){cancel();items=options();const index=items.findIndex(el=>String(optionValue(el))===String(next));if(index<0)return;if(silent)committed=String(next);if(animate)settle(index);else{position=target=index;velocity=0;paint();if(!silent)emit();}}
  function refresh(){const current=value===undefined?committed:value;items=options();if(!items.length){column.removeAttribute('aria-activedescendant');paint();return;}const selected=items.find(el=>String(optionValue(el))===String(current))||items.find(el=>el.getAttribute('aria-selected')==='true')||items[Math.round(clamp(position))];set(optionValue(selected));value=undefined;}
  const on=(type,fn,extra={})=>column.addEventListener(type,fn,{...extra,signal:controller.signal});
  on('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;cancel();drag={id:e.pointerId,y:e.clientY,start:position,moved:false,samples:[[e.timeStamp,position]]};column.setPointerCapture?.(e.pointerId);column.focus({preventScroll:true});});
  on('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dy=drag.y-e.clientY;if(Math.abs(dy)>4)drag.moved=true;if(!drag.moved)return;e.preventDefault();position=resistance(drag.start+dy/rowHeight);drag.samples.push([e.timeStamp,position]);drag.samples=drag.samples.filter(s=>e.timeStamp-s[0]<=80);paint();});
  const end=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;try{column.releasePointerCapture?.(e.pointerId);}catch{}if(!d.moved)return;suppress=true;const first=d.samples[0],final=d.samples.at(-1),dt=(final[0]-first[0])/1000;const speed=e.type==='pointerup'&&e.timeStamp-final[0]<80&&dt>0?(final[1]-first[1])/dt:0;const bounded=position<0||position>items.length-1;settle(position+(bounded?0:speed*.32),bounded?0:speed);};
  on('pointerup',end);on('pointercancel',end);on('lostpointercapture',e=>{if(drag)end(e);});
  on('click',e=>{if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation();return;}const item=e.target.closest('[role=option]'),i=items.indexOf(item);if(i>=0){e.preventDefault();settle(i);}}, {capture:true});
  on('wheel',e=>{e.preventDefault();cancel();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?column.clientHeight:1)/rowHeight;position=resistance(position+delta*.6);paint();scrollTimer=win.setTimeout(()=>settle(position),90);},{passive:false});
  on('keydown',e=>{if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))return;e.preventDefault();const amount={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[e.key];settle(e.key==='Home'?0:e.key==='End'?items.length-1:Math.round(frame?target:position)+amount);});
  // Programmatic scroll/assistive technology still has a deterministic selected row.
  on('scroll',()=>{if(column.scrollTop){const next=column.scrollTop/rowHeight;column.scrollTop=0;settle(next);}});
  function destroy(){if(stopped)return;stopped=true;controller.abort();cancel();column.classList.remove('r3-wheel');if(original===null)column.removeAttribute('style');else column.setAttribute('style',original);for(const item of column.querySelectorAll('[role=option]'))for(const key of ['transform','opacity','visibility','pointer-events','top','height'])item.style.removeProperty(key);cleanups.delete(destroy);}
  signal?.addEventListener('abort',destroy,{once:true});cleanups.add(destroy);refresh();return {set,refresh,settle,value:()=>{const item=items[Math.round(clamp(position))];return item?String(optionValue(item)):'';},position:()=>position,destroy};
 }

 function backdrop(dim,{signal}={}){
  if(!dim)return null;if(backdrops.has(dim))return backdrops.get(dim);
  const original=Object.fromEntries(['opacity','transition'].map(key=>[key,{value:dim.style.getPropertyValue(key),priority:dim.style.getPropertyPriority(key)}]));
  let flight=null,phase=0,closed=false;
  // The underlying opacity is the destination, so a shorter fade cannot fall
  // back to an opaque scrim while its sheet is still finishing its exit.
  dim.style.setProperty('transition','none');
  function set(next,{duration=280,easing='ease-out',immediate=false,from}={}){
   if(closed)return;
   const opacity=from??(dim.hidden?0:Number(win.getComputedStyle(dim).opacity)||0),to=next?1:0,gen=++phase;
   flight?.cancel();flight=null;dim.hidden=false;dim.style.opacity=String(to);
   flight=!immediate&&opacity!==to?animation(dim,[{opacity},{opacity:to}],{duration,easing,fill:'both'}):null;
   const active=flight;
   finish(active,()=>{if(closed||phase!==gen)return;dim.style.opacity=String(to);active?.cancel();if(flight===active)flight=null;});
  }
  function hide(){if(closed)return;++phase;dim.hidden=true;flight?.cancel();flight=null;}
  function destroy(){if(closed)return;closed=true;++phase;flight?.cancel();flight=null;for(const [key,state]of Object.entries(original))if(state.value)dim.style.setProperty(key,state.value,state.priority);else dim.style.removeProperty(key);signal?.removeEventListener('abort',destroy);backdrops.delete(dim);cleanups.delete(destroy);}
  const control={set,hide,destroy};backdrops.set(dim,control);signal?.addEventListener('abort',destroy,{once:true});cleanups.add(destroy);return control;
 }

 function bottomPanel(panel,{trigger,handle,signal,onClose,open=false,dim}={}){
  const controller=new win.AbortController();let showing=false,phase=0,flight=null,drag=null,savedOverflow,priorFocus,background=new Map(),ownsDim=!dim,suppressClick=false,ownsHandle=!handle;
  const original={role:panel.getAttribute('role'),modal:panel.getAttribute('aria-modal'),open:panel.getAttribute('data-open'),transform:panel.style.transform,inert:panel.inert};
  if(!dim){dim=doc.createElement('div');dim.className='r3-panel-dim';panel.before(dim);}else dim.classList.add('r3-panel-dim');
  const shade=backdrop(dim,{signal:controller.signal});
  panel.classList.add('r3-bottom-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');if(!panel.id)panel.id=uid('panel');
  if(trigger){trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-haspopup','dialog');}
  if(!handle){handle=doc.createElement('button');handle.type='button';handle.className='r3-panel-handle';handle.setAttribute('aria-label','패널 닫기');panel.prepend(handle);}
  const focusables=()=>[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(el=>!el.hidden&&!el.closest('[hidden],[inert]'));
  function release(){if(savedOverflow!==undefined){doc.documentElement.style.overflow=savedOverflow;savedOverflow=undefined;}for(const [el,state]of background)el.inert=state;background.clear();}
  function lock(){if(savedOverflow!==undefined)return;savedOverflow=doc.documentElement.style.overflow;doc.documentElement.style.overflow='hidden';for(let child=panel,parent=panel.parentElement;parent;child=parent,parent=parent.parentElement){for(const el of parent.children)if(el!==child&&el!==dim&&!['STYLE','SCRIPT','HEAD'].includes(el.tagName)){background.set(el,el.inert);el.inert=true;}if(parent===doc.body)break;}}
  function currentY(){const transform=win.getComputedStyle(panel).transform;try{return new win.DOMMatrixReadOnly(transform).m42;}catch{return 0;}}
  function set(next,{focus=true,notify=true,immediate=false}={}){
   const wasHidden=panel.hidden,from=wasHidden?(panel.getBoundingClientRect().height||win.innerHeight):currentY();const gen=++phase;flight?.cancel();showing=next;panel.hidden=false;
   shade.set(next,{duration:time(panel,next?'--panel-open-dur':'--panel-close-dur',next?350:230),easing:ease(panel,'--panel-slide-ease'),immediate});
   dim.classList.toggle('is-closed',!next);panel.inert=!next;trigger?.setAttribute('aria-expanded',String(next));panel.dataset.open=String(next);
   if(next){if(!priorFocus)priorFocus=doc.activeElement;lock();}
   const height=panel.getBoundingClientRect().height||win.innerHeight;panel.style.transform='none';
   flight=!immediate?animation(panel,[{transform:`translate3d(0,${from}px,0)`},{transform:`translate3d(0,${next?0:height}px,0)`}],{duration:time(panel,next?'--panel-open-dur':'--panel-close-dur',next?350:230),easing:ease(panel,'--panel-slide-ease'),fill:'both'}):null;
   if(next&&focus)(focusables().find(el=>el!==handle)||handle)?.focus({preventScroll:true});
   finish(flight,()=>{if(phase!==gen)return;flight?.cancel();flight=null;panel.style.transform='none';if(!next){panel.hidden=true;shade.hide();release();if(focus)(trigger?.isConnected?trigger:priorFocus)?.focus?.({preventScroll:true});priorFocus=null;if(notify)onClose?.();}});
  }
  const on=(el,type,fn,extra={})=>el.addEventListener(type,fn,{...extra,signal:controller.signal});
  on(dim,'click',()=>set(false));on(handle,'click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();return;}if(!drag)set(false);});
  on(panel,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();set(false);}else if(e.key==='Tab'){const items=focusables(),first=items[0],last=items.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}});
  on(handle,'pointerdown',e=>{if(e.button!==0||e.isPrimary===false||!showing)return;const initial=currentY();flight?.cancel();panel.style.transform=`translate3d(0,${initial}px,0)`;drag={id:e.pointerId,y:e.clientY,initial,start:e.timeStamp,offset:initial};handle.setPointerCapture?.(e.pointerId);});
  on(handle,'pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const raw=drag.initial+e.clientY-drag.y;drag.offset=raw<0?-Math.sqrt(-raw)*1.7:raw;panel.style.transform=`translate3d(0,${drag.offset}px,0)`;e.preventDefault();});
  const end=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(Math.abs(d.offset-d.initial)<4)return;suppressClick=true;const closing=e.type==='pointerup'&&(d.offset>panel.getBoundingClientRect().height*.35||d.offset>40&&d.offset/Math.max(1,e.timeStamp-d.start)>.6);set(!closing,{focus:closing});};on(handle,'pointerup',end);on(handle,'pointercancel',end);
  function destroy(){++phase;controller.abort();flight?.cancel();release();panel.hidden=true;panel.inert=original.inert;panel.classList.remove('r3-bottom-panel');panel.style.transform=original.transform;for(const [key,value]of [['role',original.role],['aria-modal',original.modal],['data-open',original.open]])if(value===null)panel.removeAttribute(key);else panel.setAttribute(key,value);dim.hidden=true;if(ownsDim)dim.remove();if(ownsHandle)handle.remove();cleanups.delete(destroy);}
  signal?.addEventListener('abort',destroy,{once:true});cleanups.add(destroy);panel.hidden=true;dim.hidden=true;if(open)set(true);return {set,get open(){return showing;},destroy};
 }

 function bindInputs(scope=doc){
  const controller=new win.AbortController(),states=new WeakMap(),active=new Map(),composing=new Set(),versions=new WeakMap();
  const allowed=el=>el?.matches?.('textarea,input:not([type]),input[type=text],input[type=search],input[type=tel],input[type=email],input[type=url],input[type=password],input[type=number]')&&!el.disabled&&!el.readOnly&&!el.closest('[data-no-input-motion]');
  const segments=s=>win.Intl?.Segmenter?[...new win.Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)].map(v=>v.segment):Array.from(s);
  function stop(input){const previous=active.get(input);if(!previous)return;active.delete(input);for(const a of previous.animations)a.cancel();previous.layer.remove();input.style.webkitTextFillColor=previous.fill;input.style.caretColor=previous.caret;}
  function animateInput(input,before){
   const next=input.value;states.set(input,next);if(before===next||reduced()||!input.animate)return;stop(input);
   const a=segments(before||''),b=segments(next);let start=0,end=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
   const box=input.getBoundingClientRect();if(!box.width||!box.height)return;const cs=win.getComputedStyle(input),layer=doc.createElement('span');layer.className='r3-input-mirror';layer.setAttribute('aria-hidden','true');layer.inert=true;
   const paddingTop=input.tagName==='TEXTAREA'?parseFloat(cs.paddingTop)||0:Math.max(parseFloat(cs.paddingTop)||0,(box.height-(parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2))/2);
   Object.assign(layer.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px',paddingLeft:cs.paddingLeft,paddingRight:cs.paddingRight,paddingTop:paddingTop+'px',paddingBottom:cs.paddingBottom,font:cs.font,fontSize:cs.fontSize,fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,fontStyle:cs.fontStyle,letterSpacing:cs.letterSpacing,lineHeight:cs.lineHeight,color:cs.color,direction:cs.direction,textAlign:cs.textAlign,whiteSpace:input.tagName==='TEXTAREA'?'pre-wrap':'pre',overflowWrap:cs.overflowWrap,border:cs.border,borderColor:'transparent'});
   const glyph=ch=>input.type==='password'?'•':ch;
   const draw=chars=>chars.map(ch=>{const span=doc.createElement('span');span.textContent=glyph(ch);layer.append(span);return span;});
   const portal=input.closest('dialog,[popover]'),portalBox=portal?.getBoundingClientRect(),scale=portalBox?.width&&portal.offsetWidth?portalBox.width/portal.offsetWidth:1;
   if(portal){Object.assign(layer.style,{position:'absolute',left:(box.left-portalBox.left)/scale+portal.scrollLeft-portal.clientLeft+'px',top:(box.top-portalBox.top)/scale+portal.scrollTop-portal.clientTop+'px',width:box.width/scale+'px',height:box.height/scale+'px'});portal.append(layer);}else doc.body.append(layer);let old=draw(a);layer.scrollLeft=input.scrollLeft;layer.scrollTop=input.scrollTop;
   const oldBoxes=old.map(span=>span.getBoundingClientRect());layer.replaceChildren();const fresh=draw(b);layer.scrollLeft=input.scrollLeft;layer.scrollTop=input.scrollTop;
   const record={layer,animations:[],fill:input.style.webkitTextFillColor,caret:input.style.caretColor};active.set(input,record);input.style.webkitTextFillColor='transparent';input.style.caretColor=cs.caretColor==='auto'?cs.color:cs.caretColor;
   for(let i=0;i<fresh.length;i++){
    let frames,delay=0;if(i>=start&&i<b.length-end){frames=[{translate:'0 -7px',scale:'.82',opacity:0},{translate:'0 1.6px',scale:'1.04',opacity:1,offset:.65},{translate:'0 0',scale:'1',opacity:1}];delay=Math.min(i-start,12)*12;}
    else {const oldIndex=i<start?i:a.length-(b.length-i),to=fresh[i].getBoundingClientRect(),from=oldBoxes[oldIndex];if(from)frames=[{translate:((from.left-to.left)/scale)+'px '+((from.top-to.top)/scale)+'px'},{translate:'0 0'}];}
    if(frames){const motion=animation(fresh[i],frames,{duration:300,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});if(motion)record.animations.push(motion);}
   }
   for(let i=start;i<a.length-end;i++){const from=oldBoxes[i];if(!from)continue;const gone=doc.createElement('span');gone.textContent=glyph(a[i]);Object.assign(gone.style,{position:'absolute',left:(from.left-box.left)/scale+input.scrollLeft+'px',top:(from.top-box.top)/scale+input.scrollTop+'px'});layer.append(gone);const motion=animation(gone,[{translate:'0 0',opacity:1,scale:'1'},{translate:'0 -10px',opacity:0,scale:'.65'}],{duration:240,easing:'ease-out',fill:'both'});if(motion)record.animations.push(motion);}
   Promise.allSettled(record.animations.map(m=>m.finished)).then(()=>{if(active.get(input)===record)stop(input);});
  }
  const on=(type,fn)=>scope.addEventListener(type,fn,{signal:controller.signal,capture:true});
  on('focusin',e=>{if(allowed(e.target))states.set(e.target,e.target.value);});
  on('beforeinput',e=>{if(allowed(e.target)&&!composing.has(e.target))states.set(e.target,e.target.value);});
  on('compositionstart',e=>{if(allowed(e.target)){stop(e.target);states.set(e.target,e.target.value);composing.add(e.target);}});
  function queue(input){const before=states.get(input)||'',version=(versions.get(input)||0)+1;versions.set(input,version);win.queueMicrotask(()=>{if(!controller.signal.aborted&&versions.get(input)===version&&!composing.has(input))animateInput(input,before);});}
  on('compositionend',e=>{if(composing.delete(e.target))queue(e.target);});
  on('input',e=>{if(!allowed(e.target)||e.isComposing||composing.has(e.target))return;queue(e.target);});
  for(const type of ['blur','pointerdown','select','scroll'])on(type,e=>{if(allowed(e.target))stop(e.target);});
  const stopAll=()=>{for(const input of active.keys())stop(input);};
  win.addEventListener('resize',stopAll,{signal:controller.signal});doc.addEventListener('scroll',event=>{if(!event.target?.closest?.('.r3-input-mirror'))stopAll();},{signal:controller.signal,capture:true});doc.addEventListener('visibilitychange',stopAll,{signal:controller.signal});media?.addEventListener?.('change',stopAll,{signal:controller.signal});
  function destroy(){controller.abort();stopAll();composing.clear();cleanups.delete(destroy);}cleanups.add(destroy);return {destroy};
 }

 function nativeSelects(scope=doc){
  const controller=new win.AbortController(),installed=new Map(),custom=win.CSS?.supports?.('appearance','base-select')&&win.CSS?.supports?.('selector(::picker(select))');
  function wheelSelect(select){
   const local=new win.AbortController(),column=doc.createElement('div');column.className='r3-native-wheel';
   const before={tabindex:select.getAttribute('tabindex'),hidden:select.getAttribute('aria-hidden')};
   column.setAttribute('aria-label',select.getAttribute('aria-label')||select.dataset.datePart||'날짜 선택');select.after(column);select.classList.add('r3-select-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
   let picker;
   function sync(){column.replaceChildren(...[...select.options].map(option=>{const button=doc.createElement('button');button.type='button';button.setAttribute('role','option');button.dataset.value=option.value;button.textContent=option.textContent;button.disabled=option.disabled;button.setAttribute('aria-selected',String(option.selected));return button;}));picker?.refresh();picker?.set(select.value);column.inert=select.disabled;}
   sync();picker=wheel(column,{value:select.value,signal:local.signal,onChange:value=>{select.value=value;select.dispatchEvent(new win.Event('input',{bubbles:true}));select.dispatchEvent(new win.Event('change',{bubbles:true}));}});
   select.addEventListener('change',sync,{signal:local.signal});select.addEventListener('invalid',()=>column.focus(),{signal:local.signal});
   const observer=new win.MutationObserver(sync);observer.observe(select,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','selected']});
   const destroy=()=>{local.abort();observer.disconnect();column.remove();select.classList.remove('r3-select-native');for(const [key,val]of [['tabindex',before.tabindex],['aria-hidden',before.hidden]])if(val===null)select.removeAttribute(key);else select.setAttribute(key,val);};installed.set(select,destroy);
  }
  function enhance(select){
   if(installed.has(select)||select.multiple||select.closest('[data-native-select]'))return;
   if(select.matches('select.pw-wheel[size]')){wheelSelect(select);return;}
   if(select.size>1)return;
   if(custom){installed.set(select,null);const orient=()=>{const r=select.getBoundingClientRect();select.style.setProperty('--r3-menu-origin',win.innerHeight-r.bottom<Math.min(288,select.options.length*36)&&r.top>win.innerHeight-r.bottom?'bottom':'top');};select.addEventListener('pointerdown',orient,{signal:controller.signal});select.addEventListener('keydown',orient,{signal:controller.signal});return;}
   const local=new win.AbortController();const shell=doc.createElement('span');shell.className='r3-select-shell';const trigger=doc.createElement('button');trigger.className='r3-select-trigger';trigger.type='button';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
   const menu=doc.createElement('div');menu.className='r3-select-options';menu.setAttribute('role','listbox');menu.id=uid('select');menu.hidden=true;trigger.setAttribute('aria-controls',menu.id);
   const css=win.getComputedStyle(select);for(const key of ['padding','border','borderRadius','backgroundColor','minHeight'])trigger.style[key]=css[key];
   const before={tabindex:select.getAttribute('tabindex'),hidden:select.getAttribute('aria-hidden')};const menuParent=select.closest('dialog,.r3-bottom-panel,[aria-modal=true]')||doc.body;select.before(shell);shell.append(select,trigger);menuParent.append(menu);select.classList.add('r3-select-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
   const place=()=>{const r=trigger.getBoundingClientRect(),height=Math.min(menu.scrollHeight||240,240),up=win.innerHeight-r.bottom<height&&r.top>win.innerHeight-r.bottom;Object.assign(menu.style,{left:Math.max(4,Math.min(r.left,win.innerWidth-r.width-4))+'px',width:r.width+'px',maxHeight:Math.max(44,Math.min(240,(up?r.top:win.innerHeight-r.bottom)-8))+'px',top:up?'auto':r.bottom+4+'px',bottom:up?win.innerHeight-r.top+4+'px':'auto'});};
   const popup=dropdown(menu,{trigger,signal:local.signal,place});let typed='',typedTimer;
   const selectOption=index=>{if(select.options[index]?.disabled)return;select.selectedIndex=index;select.dispatchEvent(new win.Event('input',{bubbles:true}));select.dispatchEvent(new win.Event('change',{bubbles:true}));sync();popup.set(false,{focus:true});};
   function sync(){trigger.disabled=select.disabled;const text=select.selectedOptions[0]?.textContent||'선택';trigger.textContent=text;const label=select.getAttribute('aria-label')||[...(select.labels||[])].map(l=>[...l.childNodes].filter(n=>n!==shell).map(n=>n.textContent).join('').trim()).filter(Boolean).join(' ');trigger.setAttribute('aria-label',label?label+' · '+text:text);menu.replaceChildren(...[...select.options].map((o,i)=>{const b=doc.createElement('button');b.type='button';b.tabIndex=-1;b.textContent=o.textContent;b.setAttribute('role','option');b.setAttribute('aria-selected',String(o.selected));b.disabled=o.disabled||o.parentElement?.disabled===true;b.onclick=()=>selectOption(i);return b;}));}
   function open(){sync();menu.inert=false;popup.set(true);menu.querySelector('[aria-selected=true]')?.focus({preventScroll:true});}
   trigger.addEventListener('click',()=>popup.open()?popup.set(false):open(),{signal:local.signal});
   const keys=e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();popup.set(false,{focus:true});return;}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!popup.open())open();const enabled=[...menu.children].filter(b=>!b.disabled),at=enabled.indexOf(doc.activeElement);enabled[e.key==='Home'?0:e.key==='End'?enabled.length-1:(at+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]?.focus();return;}if(e.key==='Tab'){popup.set(false);return;}if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){e.preventDefault();typed+=e.key.toLocaleLowerCase();win.clearTimeout(typedTimer);typedTimer=win.setTimeout(()=>typed='',600);if(!popup.open())open();[...menu.children].find(b=>!b.disabled&&b.textContent.toLocaleLowerCase().startsWith(typed))?.focus();}};
   trigger.addEventListener('keydown',keys,{signal:local.signal});menu.addEventListener('keydown',keys,{signal:local.signal});select.addEventListener('change',sync,{signal:local.signal});select.addEventListener('invalid',e=>{e.preventDefault();trigger.setAttribute('aria-invalid','true');trigger.focus();},{signal:local.signal});
   doc.addEventListener('pointerdown',e=>{if(!shell.contains(e.target)&&!menu.contains(e.target))popup.set(false);},{signal:local.signal});win.addEventListener('resize',()=>popup.open()&&place(),{signal:local.signal});doc.addEventListener('scroll',()=>popup.open()&&place(),{signal:local.signal,capture:true});
   const observer=new win.MutationObserver(sync);observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label']});
   const destroy=()=>{local.abort();observer.disconnect();popup.destroy();win.clearTimeout(typedTimer);select.classList.remove('r3-select-native');for(const [key,val]of [['tabindex',before.tabindex],['aria-hidden',before.hidden]])if(val===null)select.removeAttribute(key);else select.setAttribute(key,val);if(shell.parentNode)shell.replaceWith(select);menu.remove();};installed.set(select,destroy);sync();
  }
  const scan=()=>{for(const [select,destroy]of installed)if(!select.isConnected){destroy?.();installed.delete(select);}for(const select of scope.querySelectorAll('select:not([multiple])'))enhance(select);};
  scan();const observer=new win.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(el=>el.nodeType===1&&(el.matches?.('select')||el.querySelector?.('select')))))scan();});observer.observe(scope.nodeType===9?doc.documentElement:scope,{childList:true,subtree:true});
  function destroy(){controller.abort();observer.disconnect();for(const cleanup of installed.values())cleanup?.();installed.clear();cleanups.delete(destroy);}cleanups.add(destroy);return {destroy,refresh:scan};
 }
 const api={version:'motion21',animation,skeleton,resize,dropdown,tagInsert,tagRemove,persistedSwitch,wheel,backdrop,bottomPanel,bindInputs,nativeSelects,destroy(){lifetime.abort();for(const cleanup of [...cleanups])cleanup();for(const a of liveAnimations)a.cancel();liveAnimations.clear();style.remove();if(win.ORDER_COMMON_MOTION===api)delete win.ORDER_COMMON_MOTION;}};
 win.ORDER_COMMON_MOTION=api;bindInputs(doc);nativeSelects(doc);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)for(const a of [...liveAnimations])a.finish?.();},{signal:lifetime.signal});
 return api;
}
