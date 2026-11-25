/** Member quote selector, gated by the existing operator publication flag.
 * The original wordmark remains the same node and the quote workspace owns
 * mode confirmations and writes. Guest and unpublished headers stay unchanged. */
export function mountResearchOrderMenu({brand,adapter,signal,getRoute,onChoose,beforeOpen=()=>true,getAuthenticated=()=>brand?.dataset.authenticated==='true'}={}){
  if(!brand?.ownerDocument||typeof adapter?.request!=='function')throw TypeError('RESEARCH_ORDER_MENU_CONTEXT');
  const doc=brand.ownerDocument,win=doc.defaultView,ctl=new win.AbortController(),word=brand.querySelector('.brand-word');
  if(!word)throw TypeError('RESEARCH_ORDER_WORDMARK');
  const create=(tag,text,className)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const listen=(node,event,handler,options={})=>node.addEventListener(event,handler,{...options,signal:ctl.signal});
  const icon=(path,className)=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),shape=doc.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('class',className);shape.setAttribute('d',path);svg.append(shape);return svg;};
  const host=create('div',undefined,'research-order-menu');host.hidden=true;
  // Before the canonical controller mounts, its original SVG must remain the
  // first SVG. That controller then moves the mark into its own last button.
  const originalMark=brand.querySelector('svg.brand-mark,svg[data-code1-jelly]');
  if(originalMark?.parentNode===brand)originalMark.after(host);else word.after(host);
  const trigger=create('button',undefined,'research-order-trigger');trigger.id='research-order-trigger';trigger.type='button';trigger.setAttribute('aria-label','Order 견적 모드 선택');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');trigger.disabled=true;
  const arrow=icon('m6 9 6 6 6-6','research-order-arrow');trigger.append(arrow);
  const panel=create('section',undefined,'research-order-stack');panel.hidden=true;panel.id='research-order-menu';panel.setAttribute('role','menu');panel.setAttribute('aria-label','견적 모드');trigger.setAttribute('aria-controls',panel.id);
  const modes=[['simple','간편 견적','m13 3-8 11h6l-1 7 9-12h-6l1-6Z'],['detailed','상세 견적','M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12h8 M8 16h8']].map(([mode,label,path])=>{
    const button=create('button',undefined,'research-order-row');button.type='button';button.id='research-order-mode-'+mode;button.dataset.orderMode=mode;button.setAttribute('role','menuitem');button.append(icon(path,'research-order-icon'),create('span',label));panel.append(button);
    listen(button,'click',()=>{if(!available()||panel.hidden)return;const route=getRoute();close(true);if(route.kind==='quote'&&route.mode===mode)return;onChoose(mode);});return button;
  });
  host.append(trigger,panel);
  let disposed=false,published=false,refreshEpoch=0,openEpoch=0,arrowAnimation=null,lastArrival=0;
  let brandState={arrival:'rest',arrivalCount:0};
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const available=()=>!disposed&&published&&getAuthenticated()===true;
  function stopArrow(){arrowAnimation?.cancel();arrowAnimation=null;}
  function sync(){
    const enabled=available();
    if(enabled){if(word.parentNode!==trigger)trigger.insertBefore(word,arrow);host.hidden=false;trigger.disabled=false;}
    else{close();stopArrow();if(word.parentNode===trigger)host.before(word);host.hidden=true;trigger.disabled=true;}
    // The member arrow joins the same authentication arrival, without moving
    // or repainting the retained wordmark. Reduced motion settles immediately.
    if(enabled&&brandState.arrival==='moving'&&brandState.arrivalCount!==lastArrival){
      lastArrival=brandState.arrivalCount;stopArrow();
      if(!reduced()&&typeof arrow.animate==='function'){
        const motion=arrow.animate([{opacity:0,transform:'translateY(-2px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out',fill:'none'});
        motion.id='order-selector-arrival';arrowAnimation=motion;motion.finished?.catch(()=>{}).finally(()=>{if(arrowAnimation===motion)arrowAnimation=null;});
      }
    }
  }
  function update(state={}){if(disposed)return;brandState={...brandState,...state};sync();}
  // A no-op close must not replace the wordmark or cause annotation reindexing.
  function close(focus=false){++openEpoch;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus&&available()&&!host.hidden)trigger.focus();}
  async function open(last=false){
    const epoch=++openEpoch;if(!available()||await beforeOpen()===false||epoch!==openEpoch||!available())return;
    panel.hidden=false;trigger.setAttribute('aria-expanded','true');modes[last?modes.length-1:0].focus();
  }
  listen(trigger,'click',()=>panel.hidden?open():close(true));
  listen(trigger,'keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();void open(event.key==='ArrowUp');}});
  listen(panel,'keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    const index=modes.indexOf(doc.activeElement),next={ArrowDown:(index+1)%modes.length,ArrowUp:(index+modes.length-1)%modes.length,Home:0,End:modes.length-1}[event.key];
    if(next!==undefined){event.preventDefault();modes[next].focus();}
  });
  listen(doc,'pointerdown',event=>{if(!host.contains(event.target))close();});listen(host,'focusout',event=>{if(!host.contains(event.relatedTarget))close();});
  async function refresh(){const epoch=++refreshEpoch;let flag=false;try{await adapter.ready;const result=await adapter.request('/features',null,ctl.signal);flag=result?.orderMenu===true;}catch{}if(disposed||epoch!==refreshEpoch)return;published=flag;sync();}
  listen(win,'pageshow',refresh);listen(doc,'visibilitychange',()=>{if(!doc.hidden)void refresh();});listen(win,'order:research-route',()=>{if(!panel.hidden)close();sync();});
  function destroy(){if(disposed)return;disposed=true;refreshEpoch++;close();stopArrow();ctl.abort();signal?.removeEventListener('abort',destroy);if(word.parentNode===trigger)host.before(word);host.remove();}
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();
  if(!disposed)sync();
  return {ready:disposed?Promise.resolve():refresh(),refresh,update,close,destroy};
}

export const researchOrderMenuCss=String.raw`
#order-single .research-order-menu{position:relative;flex:none;font:inherit;letter-spacing:inherit;color:inherit}
#order-single .research-order-menu[hidden],#order-single .research-order-menu [hidden]{display:none!important}
#order-single .research-order-trigger{position:relative;display:flex;align-items:center;justify-content:flex-start;gap:4px;height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;letter-spacing:inherit;border-radius:8px;cursor:pointer;touch-action:manipulation}
#order-single .research-order-trigger:is(:hover,:active){background:transparent}
#order-single .research-order-trigger:focus-visible,#order-single .research-order-row:focus-visible{outline:2px solid var(--blue,#315dde);outline-offset:3px}
/* Match the canonical direct-child geometry after moving the same node into
   the one native button. The word's x/y, size and font never animate. */
#order-single .order-product-brand.obm-brand .research-order-trigger>.brand-word{position:relative;top:2.5234375px;display:block;box-sizing:border-box;flex:none;width:auto;height:25px;margin:0;font:inherit;line-height:25px;letter-spacing:inherit}
#order-single .order-product-brand.obm-brand .research-order-trigger>.brand-word>.brand-dot{position:absolute;left:70.625px;top:0;margin:0;line-height:inherit;letter-spacing:0}
#order-single .research-order-arrow{position:relative;top:1.5234375px;display:block;flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#order-single .research-order-stack{position:absolute;z-index:80;top:calc(100% + 6px);left:0;box-sizing:border-box;width:max-content;min-width:164px;max-width:calc(100vw - 52px);border:0;border-radius:14px;padding:6px;background:white;box-shadow:0 8px 32px #17212f24;overflow:hidden;font:500 15px/1.5 var(--font,Arial,sans-serif);color:#20272b}
#order-single .research-order-row{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;min-height:44px;padding:10px 12px;border:0;border-radius:9px;background:white;color:inherit;font:inherit;white-space:nowrap;text-align:left;cursor:pointer}
#order-single .research-order-row:hover,#order-single .research-order-row:focus-visible{background:#f3f4f6}
#order-single .research-order-icon{display:block;flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
`;
