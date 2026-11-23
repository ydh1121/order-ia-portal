/** Global product selector, gated by the existing operator publication flag.
 * Stack push/title travel/swipe follow Kokonut UI Stack Panel (Dorian Baffier,
 * MIT, v1.0.0): 420ms push, 380ms height, .3 parallax, .35/500px/s pop.
 * Only supported egg quote modes are offered; the original quote owns writes. */
export function mountResearchOrderMenu({brand,adapter,signal,getRoute,onChoose,beforeOpen=()=>true}={}){
  if(!brand?.ownerDocument||typeof adapter?.request!=='function')throw TypeError('RESEARCH_ORDER_MENU_CONTEXT');
  const doc=brand.ownerDocument,win=doc.defaultView,ctl=new win.AbortController();
  const create=(tag,text,className)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  const listen=(node,event,handler,options={})=>node.addEventListener(event,handler,{...options,signal:ctl.signal});
  const host=create('div',undefined,'research-order-menu');host.hidden=true;
  const trigger=create('button','▾','research-order-trigger');trigger.type='button';trigger.setAttribute('aria-label','Order 품목과 견적 모드 선택');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  const panel=create('section',undefined,'research-order-stack');panel.hidden=true;panel.id='research-order-menu';panel.setAttribute('role','menu');panel.setAttribute('aria-label','Order');trigger.setAttribute('aria-controls',panel.id);
  const head=create('header',undefined,'research-order-head'),back=create('button','‹','obm-back'),title=create('h2','Order');
  back.type='button';back.hidden=true;back.setAttribute('aria-label','품목 목록으로');head.append(back,title);
  const slider=create('div',undefined,'research-order-pages'),rootPage=create('div',undefined,'research-order-page'),modePage=create('div',undefined,'research-order-page');modePage.hidden=true;
  const row=(text)=>{const b=create('button',undefined,'research-order-row');b.type='button';b.setAttribute('role','menuitem');b.append(create('span',text));return b;};
  const eggs=row('계란');eggs.append(create('span','›','obm-chevron'));rootPage.append(eggs);
  const modes=[['simple','간편 견적'],['detailed','상세 견적']].map(([mode,label])=>{const b=row(label);b.dataset.orderMode=mode;b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked','false');modePage.append(b);listen(b,'click',()=>{const route=getRoute();close(true);if(route.kind==='quote'&&route.mode===mode)return;onChoose(mode);});return b;});
  slider.append(rootPage,modePage);panel.append(head,slider);host.append(trigger,panel);brand.querySelector('.brand-word').after(host);
  let disposed=false,enabled=false,page=0,refreshEpoch=0,openEpoch=0,gesture=null,animations=[];
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  function stop(){for(const motion of animations)motion.cancel();animations=[];}
  function animate(element,frames,options){if(reduced()||typeof element.animate!=='function')return;const motion=element.animate(frames,{fill:'none',...options});animations.push(motion);motion.finished?.catch(()=>{});}
  function sync(){const route=getRoute();for(const b of modes)b.setAttribute('aria-checked',String(route.mode===b.dataset.orderMode));}
  function showPage(next,origin){
    if(next===page)return;stop();
    const previous=page===0?rootPage:modePage,target=next===0?rootPage:modePage,width=panel.getBoundingClientRect().width||276;
    const from=origin?.getBoundingClientRect(),oldHeight=slider.getBoundingClientRect().height;
    page=next;rootPage.hidden=page!==0;modePage.hidden=page!==1;back.hidden=page===0;title.textContent=page===0?'Order':'계란';sync();
    const direction=page===1?1:-1,nextHeight=target.getBoundingClientRect().height;
    animate(target,[{transform:'translateX('+direction*width+'px)',opacity:.5},{transform:'translateX(0)',opacity:1}],{duration:420,easing:'cubic-bezier(.23,1,.32,1)'});
    // The retained departing page is visual only during its parallax travel.
    const copy=previous.cloneNode(true);copy.hidden=false;copy.inert=true;copy.setAttribute('aria-hidden','true');copy.classList.add('research-order-departing');slider.append(copy);
    animate(copy,[{transform:'translateX(0)',opacity:1},{transform:'translateX('+(-direction*width*.3)+'px)',opacity:0}],{duration:420,easing:'cubic-bezier(.23,1,.32,1)'});
    const departing=animations.at(-1);if(departing?.finished)departing.finished.catch(()=>{}).finally(()=>copy.remove());else copy.remove();
    if(oldHeight&&nextHeight)animate(slider,[{height:oldHeight+'px'},{height:nextHeight+'px'}],{duration:380,easing:'cubic-bezier(.23,1,.32,1)'});
    if(from&&page===1){const to=title.getBoundingClientRect();animate(title,[{transform:'translate('+(from.left-to.left)+'px,'+(from.top+from.height/2-to.top-to.height/2)+'px)'},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.23,1,.32,1)'});}
    (page===1?modes[0]:eggs).focus();
  }
  function close(focus=false){++openEpoch;stop();gesture=null;panel.hidden=true;trigger.setAttribute('aria-expanded','false');rootPage.hidden=false;modePage.hidden=true;page=0;back.hidden=true;title.textContent='Order';slider.style.transform='';for(const copy of slider.querySelectorAll('.research-order-departing'))copy.remove();if(focus&&!host.hidden)trigger.focus();}
  async function open(last=false){const epoch=++openEpoch;if(!enabled||disposed||await beforeOpen()===false||epoch!==openEpoch||disposed||!enabled)return;sync();panel.hidden=false;trigger.setAttribute('aria-expanded','true');eggs.focus();if(last)showPage(1,eggs.firstElementChild);}
  listen(trigger,'click',()=>panel.hidden?open():close(true));listen(trigger,'keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();void open(event.key==='ArrowUp');}});
  listen(eggs,'click',()=>showPage(1,eggs.firstElementChild));listen(back,'click',()=>showPage(0));
  listen(panel,'keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    if(event.key==='ArrowLeft'&&page){event.preventDefault();showPage(0);return;}
    const controls=page===1?modes:[eggs],index=controls.indexOf(doc.activeElement),next={ArrowDown:(index+1)%controls.length,ArrowUp:(index+controls.length-1)%controls.length,Home:0,End:controls.length-1}[event.key];
    if(next!==undefined){event.preventDefault();controls[next].focus();}
  });
  listen(doc,'pointerdown',event=>{if(!host.contains(event.target))close();});listen(host,'focusout',event=>{if(!host.contains(event.relatedTarget))close();});
  listen(slider,'pointerdown',event=>{if(page!==1||event.button!==0)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,time:win.performance.now(),dx:0,dragging:false};});
  listen(slider,'pointermove',event=>{if(!gesture||event.pointerId!==gesture.id)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(!gesture.dragging&&Math.abs(dy)>Math.abs(dx)+6){gesture=null;return;}if(dx<8&&!gesture.dragging)return;gesture.dragging=true;gesture.dx=Math.max(0,dx);slider.setPointerCapture?.(event.pointerId);event.preventDefault();slider.style.transform='translateX('+gesture.dx+'px)';},{passive:false});
  listen(slider,'pointerup',event=>{if(!gesture||event.pointerId!==gesture.id)return;const current=gesture;gesture=null;slider.style.transform='';if(current.dragging){const velocity=current.dx/Math.max(1,win.performance.now()-current.time)*1000,width=panel.getBoundingClientRect().width||276;if(current.dx>width*.35||velocity>500)showPage(0);}});
  listen(slider,'pointercancel',()=>{gesture=null;slider.style.transform='';});
  async function refresh(){const epoch=++refreshEpoch;let flag=false;try{await adapter.ready;const result=await adapter.request('/features',null,ctl.signal);flag=result?.orderMenu===true;}catch{}if(disposed||epoch!==refreshEpoch)return;enabled=flag;host.hidden=!enabled;if(!enabled)close();}
  listen(win,'pageshow',refresh);listen(doc,'visibilitychange',()=>{if(!doc.hidden)void refresh();});listen(win,'order:research-route',()=>{if(!panel.hidden)close();sync();});
  function destroy(){if(disposed)return;disposed=true;refreshEpoch++;close();ctl.abort();signal?.removeEventListener('abort',destroy);host.remove();}
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();
  return {ready:disposed?Promise.resolve():refresh(),refresh,close,destroy};
}

export const researchOrderMenuCss=String.raw`
#order-single .research-order-menu{position:relative;flex:none;font-family:inherit;font-size:15px;font-weight:500;line-height:1.5;letter-spacing:0}
#order-single .research-order-menu[hidden],#order-single .research-order-menu [hidden]{display:none!important}
#order-single .research-order-trigger{display:grid;place-items:center;width:32px;height:44px;padding:0;border:0;background:transparent;color:inherit;font-size:16px;border-radius:10px;cursor:pointer}
#order-single .research-order-trigger:hover{background:#f3f4f6}
#order-single .research-order-stack{position:absolute;z-index:80;top:48px;left:-90px;width:min(276px,calc(100vw - 48px));border:0;border-radius:18px;padding:8px;background:white;box-shadow:0 8px 32px #17212f24;overflow:hidden;font:500 15px/1.5 var(--font,Arial,sans-serif);color:#20272b}
#order-single .research-order-head{position:relative;height:44px;display:flex;align-items:center;justify-content:center}
#order-single .research-order-head h2{margin:0;font-family:inherit;font-size:15px;font-weight:650;line-height:1.5;pointer-events:none}
#order-single .research-order-head .obm-back{position:absolute;left:0;top:0;border:0;background:transparent;min-height:44px;width:32px;padding:0;display:grid;place-items:center}
#order-single .research-order-pages{position:relative;overflow:hidden;touch-action:pan-y}
#order-single .research-order-page{width:100%}.research-order-departing{position:absolute;inset:0;pointer-events:none}
#order-single .research-order-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:12px;border:0;border-radius:12px;background:white;color:inherit;font:inherit;text-align:left;cursor:pointer}
#order-single .research-order-row:hover,#order-single .research-order-row:focus-visible{background:#f3f4f6}
#order-single .research-order-row[aria-checked=true]::after{content:'✓';color:#315cf5}
#order-single .research-order-row .obm-chevron{margin-left:auto}
`;
