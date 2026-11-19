// Interaction adapted from DesignBookmark's Loading to success and transitions.dev's
// Skeleton loader and reveal. Request promises determine all terminal states.
export const asyncMotionCss = `
[data-async-phase]{position:relative;isolation:isolate;box-sizing:border-box}
[data-async-phase]>.r3-motion-original{visibility:hidden}
[data-async-phase]>.r3-motion-face{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;border-radius:inherit}
[data-async-phase]{background:transparent!important;border-color:transparent!important}
.r3-motion-pill{position:absolute;inset:0;margin:auto;display:flex;align-items:center;justify-content:center;gap:.35em;
 width:100%;height:100%;border:1px solid var(--r3-motion-border);border-radius:inherit;background:var(--r3-motion-fill);
 color:var(--r3-motion-ink);font:inherit;white-space:nowrap;overflow:hidden;transition:width var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(.22,1,.36,1)),border-radius var(--duration-fast,250ms) ease-out}
[data-async-phase=pending] .r3-motion-pill{width:min(100%,var(--r3-motion-height,2.75rem));border-radius:100vmax}
.r3-motion-glyph{width:1.1em;height:1.1em;flex:none;display:block}
[data-async-phase=pending] .r3-motion-glyph{border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:r3-async-spin .72s linear infinite}
[data-async-phase=pending] .r3-motion-word{display:none}
[data-async-phase=success] .r3-motion-glyph{width:.95em;height:.55em;border:solid currentColor;border-width:0 0 2px 2px;transform:translateY(-.12em) rotate(-45deg);animation:r3-async-check var(--duration-very-slow,500ms) var(--ease-smooth-out,ease-out)}
[data-async-phase=error] .r3-motion-glyph{border-radius:50%;border:1.5px solid currentColor;text-align:center;line-height:1;font-size:.85em}
@keyframes r3-async-spin{to{transform:rotate(1turn)}}
@keyframes r3-async-check{from{clip-path:inset(0 100% 0 0);opacity:.35}to{clip-path:inset(0);opacity:1}}
.r3-motion-sr{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap;pointer-events:none}
[data-async-region]{position:relative;isolation:isolate}
[data-async-region=pending]{min-height:var(--r3-skeleton-size,8rem)}
[data-async-region=pending]::before,[data-async-region=success]::before{content:"";position:absolute;z-index:5;inset:0;pointer-events:none;
 background:linear-gradient(90deg,#e0e6ec 62%,transparent 62%) .8rem .85rem/46% .8rem no-repeat,
 repeating-linear-gradient(to bottom,#e6ebf0 0 .55rem,transparent .55rem 2.4rem) .8rem 3rem/67% calc(100% - 3.3rem) no-repeat,
 repeating-linear-gradient(to bottom,#e6ebf0 0 .55rem,transparent .55rem 2.4rem) 95% 3rem/20% calc(100% - 3.3rem) no-repeat,var(--r3-skeleton-bg,#fff)}
[data-async-region=pending]::before{animation:r3-async-pulse 1.35s ease-in-out infinite}
[data-async-region=success]::before{animation:r3-async-reveal var(--reveal-dur,400ms) var(--reveal-ease,ease-in-out) both}
@keyframes r3-async-pulse{50%{filter:brightness(.975)}}
@keyframes r3-async-reveal{from{opacity:1;filter:blur(0)}to{opacity:0;filter:blur(var(--reveal-blur,2px))}}
[data-r3-motion-paused] .r3-motion-glyph,[data-r3-motion-paused] [data-async-region]::before,[data-r3-motion-paused][data-async-region]::before{animation-play-state:paused!important}
@media(prefers-reduced-motion:reduce){
 .r3-motion-pill,.r3-motion-glyph,[data-async-region]::before{animation:none!important;transition:none!important}
 [data-async-region=success]::before{display:none}
}
`;

export function mountAsyncMotion(root,{source='server'}={}){
 const doc=root.nodeType===9?root:root.ownerDocument,win=doc.defaultView;
 const host=root.nodeType===9?doc.documentElement:root;
 const active=new Map();
 let counter=0,closed=false,manualPause=false;
 const status=doc.createElement('span');
 status.className='r3-motion-sr';status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const announcerParent=root.nodeType===9?doc.body:root;
 const setPause=()=>host.toggleAttribute('data-r3-motion-paused',manualPause||doc.hidden);
 doc.addEventListener('visibilitychange',setPause);setPause();
 function reset(record){
  const {key,button,region,timer,original,face,aria}=record;
  if(active.get(key)!==record)return;
  win.clearTimeout(timer);
  if(button){
   delete button.dataset.asyncPhase;delete button.dataset.asyncSource;
   if(original?.parentNode===button)original.replaceWith(...original.childNodes);
   face?.remove();
   if(aria.label===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',aria.label);
   for(const property of ['--r3-motion-height','--r3-motion-border','--r3-motion-fill','--r3-motion-ink'])button.style.removeProperty(property);
  }
  if(region){delete region.dataset.asyncRegion;delete region.dataset.asyncSource;}
  if(aria.busy===null)key.removeAttribute('aria-busy');else key.setAttribute('aria-busy',aria.busy);
  if(region&&button){if(aria.regionBusy===null)region.removeAttribute('aria-busy');else region.setAttribute('aria-busy',aria.regionBusy);}
  active.delete(key);if(!active.size)status.remove();
 }
 function notify(record,phase){
  if(closed||active.get(record.key)!==record)return;
  const {key,button,region,labels,requestId}=record;
  if(button){
   button.dataset.asyncPhase=phase;button.dataset.asyncSource=source;
   button.setAttribute('aria-label',labels[phase]);record.word.textContent=labels[phase];
   record.glyph.textContent=phase==='error'?'!':'';
  }
  if(region){region.dataset.asyncRegion=phase;region.dataset.asyncSource=source;region.setAttribute('aria-busy',String(phase==='pending'));}
  key.setAttribute('aria-busy',String(phase==='pending'));
  if(!status.isConnected)announcerParent.append(status);status.textContent=labels[phase];
  key.dispatchEvent(new win.CustomEvent('r3:async-state',{bubbles:true,detail:{phase,source,requestId}}));
 }
 function start(button,region,task,opts={}){
  if(closed)return Promise.reject(new win.DOMException('Unmounted','AbortError'));
  const key=button||region,previous=active.get(key);
  if(previous){
   if(button&&previous.pending)return previous.promise;
   previous.controller.abort();reset(previous);
  }
  const controller=new win.AbortController();
  const requestId=opts.requestId||'r3-'+(++counter);
  const labels={pending:'처리 중',success:'완료',error:'실패',...opts.labels};
  const aria={label:button?.getAttribute('aria-label'),busy:key.getAttribute('aria-busy'),regionBusy:region?.getAttribute('aria-busy')};
  const record={button,region,key,controller,requestId,labels,aria,pending:true};
  if(button){
   const style=win.getComputedStyle(button),height=button.getBoundingClientRect().height;
   button.style.setProperty('--r3-motion-height',(height||44)+'px');
   button.style.setProperty('--r3-motion-fill',!style.backgroundColor||style.backgroundColor==='rgba(0, 0, 0, 0)'?'Canvas':style.backgroundColor);
   button.style.setProperty('--r3-motion-ink',style.color);button.style.setProperty('--r3-motion-border',style.borderColor||'transparent');
   const span=()=>doc.createElement('span');
   record.original=span();record.original.className='r3-motion-original';record.original.append(...button.childNodes);
   record.face=span();record.face.className='r3-motion-face';record.face.setAttribute('aria-hidden','true');
   const pill=span();pill.className='r3-motion-pill';record.glyph=span();record.glyph.className='r3-motion-glyph';
   record.word=span();record.word.className='r3-motion-word';pill.append(record.glyph,record.word);record.face.append(pill);
   button.append(record.original,record.face);
   // The original width is measured before the pending state contracts the face.
   void pill.offsetWidth;
  }
  active.set(key,record);
  record.promise=Promise.resolve().then(()=>{
   if(controller.signal.aborted)throw new win.DOMException('Unmounted','AbortError');
   return task({signal:controller.signal,requestId});
  }).then(result=>{
   if(controller.signal.aborted)throw new win.DOMException('Superseded','AbortError');
   if(result&&result.ok===false)throw Object.assign(new Error('REQUEST_FAILED'),{response:result});
   notify(record,'success');return result;
  }).catch(error=>{if(!controller.signal.aborted)notify(record,'error');throw error;}).finally(()=>{
   record.pending=false;
   if(active.get(key)===record&&!closed)record.timer=win.setTimeout(()=>reset(record),button?1450:430);
  });
  notify(record,'pending');
  return record.promise;
 }
 return {
  run:(button,task,opts={})=>start(button,opts.region||null,task,opts),
  reveal:(region,task,opts={})=>start(null,region,task,opts),
  pause(){manualPause=true;setPause();},
  resume(){manualPause=false;setPause();},
  destroy(){if(closed)return;closed=true;doc.removeEventListener('visibilitychange',setPause);for(const record of active.values()){record.controller.abort();reset(record);}host.removeAttribute('data-r3-motion-paused');status.remove();}
 };
}

// Text inputs retain their native selection and IME implementation. Native customizable
// selects supply top-layer layout, focus, type-ahead and platform fallback.
export const editorMotionCss = `
#price-workspace .r3-floating{display:grid;grid-template-rows:auto auto;align-content:center;gap:.1rem;min-width:0;min-height:3.1rem;padding:.25rem .6rem;border:1px solid #cdd5e1;border-radius:.4rem;background:white;cursor:text}
#price-workspace .r3-floating>input{grid-row:2;min-height:0;height:1.5em;line-height:1.5;padding:0;border:0;background:transparent}
#price-workspace .r3-floating-title{grid-row:1;min-width:0;overflow-wrap:anywhere;pointer-events:none;color:#465162;font-size:.85em;line-height:1.15;transform:translateY(.8rem);transition:transform var(--duration-quick,150ms) var(--ease-smooth-out,ease-out)}
#price-workspace .r3-floating:has(>input:focus,>input:not(:placeholder-shown))>.r3-floating-title{transform:none}
#price-workspace .r3-floating:has(>input:focus-visible){outline:2px solid currentColor;outline-offset:2px}
#price-workspace .r3-floating>input:focus-visible{outline:0}
#price-workspace .r3-floating>input:not(:focus):placeholder-shown::placeholder{opacity:0}
#price-workspace .price-matrix input.mx-error{animation:r3-field-error 280ms linear}
@keyframes r3-field-error{0%,100%{transform:translateX(0)}28.57%{transform:translateX(var(--shake-distance,6px));animation-timing-function:ease-out}57.14%{transform:translateX(calc(-1 * var(--shake-distance,6px)));animation-timing-function:ease-out}78.57%{transform:translateX(var(--shake-overshoot,2px))}}
@supports(appearance:base-select) and selector(::picker(select)){
 #price-workspace select:not([multiple]),#price-workspace select:not([multiple])::picker(select){appearance:base-select}
 #price-workspace select:not([multiple])::picker(select){position-try-fallbacks:flip-block;max-block-size:min(18rem,45dvh);overflow-y:auto;
  transform-origin:var(--r3-menu-origin,top) center;opacity:0;transform:scale(var(--dropdown-pre-scale,.97)) translateY(-2px);border:1px solid #d5dbe4;border-radius:.55rem;padding:.25rem;
  transition:transform var(--dropdown-close-dur,150ms) var(--dropdown-ease,ease-out),opacity var(--dropdown-close-dur,150ms) ease-out,display var(--dropdown-close-dur,150ms) allow-discrete,overlay var(--dropdown-close-dur,150ms) allow-discrete}
 #price-workspace select:not([multiple])::picker(select):popover-open{opacity:1;transform:none;transition-duration:var(--dropdown-open-dur,250ms)}
 @starting-style{#price-workspace select:not([multiple])::picker(select):popover-open{opacity:0;transform:scale(var(--dropdown-pre-scale,.97)) translateY(-2px)}}
 #price-workspace select option{padding:.35rem .6rem}
}
@supports(interpolate-size:allow-keywords) and selector(details::details-content){
 #price-workspace details{interpolate-size:allow-keywords}
 #price-workspace details::details-content{block-size:0;overflow:clip;transition:block-size var(--resize-dur,300ms) var(--resize-ease,cubic-bezier(.22,1,.36,1)),content-visibility var(--resize-dur,300ms) allow-discrete}
 #price-workspace details[open]::details-content{block-size:auto}
}
@media(prefers-reduced-motion:reduce){
 #price-workspace .r3-floating-title,#price-workspace details::details-content,#price-workspace select::picker(select),#price-workspace .price-matrix input.mx-error{transition:none!important;animation:none!important}
}
`;
export function bindEditorMotion(root){
 const doc=root.ownerDocument,win=doc.defaultView,ctl=new win.AbortController();
 const gestures=new Map(),composing=new WeakSet(),media=win.matchMedia('(prefers-reduced-motion: reduce)');
 function enhance(scope){
  for(const label of scope.querySelectorAll('.price-meta label:not(.r3-floating),#carrier-editor .freight-row label:not(.r3-floating)')){
   const input=label.querySelector(':scope>input');
   if(!input||!['text','number','email','search','tel','url'].includes(input.type))continue;
   const text=Array.from(label.childNodes).find(node=>node.nodeType===3&&node.textContent.trim());
   if(!text)continue;
   const caption=doc.createElement('span');caption.className='r3-floating-title';
   text.replaceWith(caption);caption.append(text);label.classList.add('r3-floating');
   if(!input.hasAttribute('placeholder'))input.placeholder=' ';
  }
 }
 enhance(root);
 // Carrier contract fields are mounted again after a user chooses a different contract.
 const observer=new win.MutationObserver(records=>{
  const groups=new Set();
  for(const record of records){
   for(const node of record.addedNodes){
    if(node.nodeType!==1||!node.querySelector('input')&&!node.matches('input'))continue;
    const parent=node.closest('#carrier-editor,.price-meta');
    if(parent)groups.add(parent);
   }
  }
  for(const group of groups)enhance(group);
 });observer.observe(root,{subtree:true,childList:true});
 const on=(name,fn)=>root.addEventListener(name,fn,{signal:ctl.signal});
 const stop=()=>{for(const anim of gestures.values())anim.cancel();gestures.clear();};
 const animate=(input,direction)=>{
  if(doc.hidden||media.matches||!input?.animate||!input.matches('input:not([type=checkbox]):not([type=radio])'))return;
  gestures.get(input)?.cancel();
  const anim=input.animate([{transform:'translateY(0)'},{transform:'translateY('+direction+'px)',offset:.37},{transform:'translateY(0)'}],{duration:210,easing:'cubic-bezier(.22,1,.36,1)'});
  gestures.set(input,anim);anim.finished.then(()=>{if(gestures.get(input)===anim)gestures.delete(input);},()=>{});
 };
 on('compositionstart',e=>composing.add(e.target));on('compositionend',e=>{composing.delete(e.target);animate(e.target,-1.25);});
 on('input',e=>{if(!e.isComposing&&!composing.has(e.target))animate(e.target,e.inputType?.startsWith('delete')?1.25:-1.25);});
 const orient=e=>{
  if(!e.target.matches('select'))return;
  const rect=e.target.getBoundingClientRect();
  e.target.style.setProperty('--r3-menu-origin',win.innerHeight-rect.bottom<Math.min(288,e.target.options.length*36)&&rect.top>win.innerHeight-rect.bottom?'bottom':'top');
 };on('pointerdown',orient);on('keydown',orient);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();},{signal:ctl.signal});media.addEventListener?.('change',stop,{signal:ctl.signal});
 return {destroy(){ctl.abort();observer.disconnect();stop();}};
}
