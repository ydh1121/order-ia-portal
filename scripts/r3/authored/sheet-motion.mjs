// The gesture uses a single translation for all snap points, drags and elastic travel.
// It never owns business timers or server requests.
export function mountSheetGesture(sheet, handles, {signal, reduced, close, open = true, surface}) {
  if (!sheet) return;
  let active = null, offset = 0, snapped = 0, pending = null, ignoreClick = false;
  const doc=sheet.ownerDocument, scroll=doc.scrollingElement || doc.documentElement;
  let restore=null;
  function activate(){if(restore!==null)return;restore=scroll.style.overflow;scroll.style.overflow='hidden';}
  function deactivate(){if(restore===null)return;scroll.style.overflow=restore;restore=null;}
  const travel = () => Math.max(120, sheet.getBoundingClientRect().height);
  const peek = () => Math.min(108, travel() * .2);
  const place = value => {
    offset = value;
    sheet.style.transform = value ? 'translate3d(0,'+value+'px,0)' : '';
  };
  function snap(to) {
    pending?.cancel(); pending = null;
    const from = offset;
    snapped = to;
    sheet.dataset.sheetSnap = to ? 'peek' : 'open';
    place(to);
    if (!reduced?.() && sheet.animate && from !== to) {
      pending = sheet.animate([{transform:'translateY('+from+'px)'},{transform:'translateY('+to+'px)'}],
        {duration:210,easing:'cubic-bezier(.2,.85,.3,1)'});
      pending.finished.catch(()=>{});
    }
  }
  function start(event) {
    if (event.currentTarget===surface && event.target!==surface) return;
    if (event.button !== 0 || active || event.isPrimary === false) return;
    pending?.cancel(); pending=null; ignoreClick=false;
    active={id:event.pointerId,y:event.clientY,start:offset};
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event) {
    if (active?.id !== event.pointerId) return;
    const dy=event.clientY-active.y, raw=active.start+dy;
    ignoreClick ||= Math.abs(dy)>5;
    place(raw<0 ? -Math.sqrt(-raw)*1.7 : Math.min(raw,travel()));
  }
  function end(event) {
    if (active?.id !== event.pointerId) return;
    const dy=event.clientY-active.y;
    active=null;
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') {snap(snapped);return;}
    if (dy>0 && (offset>=travel()*.4 || (snapped>0 && dy>peek()*.6))) {
      close({offset});return;
    }
    snap(offset>peek()*.55 ? peek() : 0);
  }
  for (const handle of [...handles,surface].filter(Boolean)) {
    for (const [event,run] of [['pointerdown',start],['pointermove',move],['pointerup',end],['pointercancel',end],['lostpointercapture',end]])
      handle.addEventListener(event,run,{signal});
    handle.addEventListener('click',event=>{
      if(ignoreClick){ignoreClick=false;event.preventDefault();event.stopImmediatePropagation();}
    },{capture:true,signal});
  }
  signal.addEventListener('abort',()=>{active=null;pending?.cancel();place(0);deactivate();},{once:true});
  snap(0);if(open)activate();
  return {activate,deactivate,reset(){active=null;ignoreClick=false;snap(0);}};
}
