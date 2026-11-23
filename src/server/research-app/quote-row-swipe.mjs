/** A closed regular header reveals its existing, scoped actions. The existing
 * delete/unlink buttons still own their confirmations and stored transactions. */
export function mountResearchClosedQuoteRows(root){
  const win=root.ownerDocument.defaultView,controller=new win.AbortController(),signal=controller.signal;
  let gesture=null,suppress=null;const revealed=new Set();
  const closeRows=except=>{for(const row of revealed){if(row===except)continue;row.dataset.savedOpen='false';row.querySelector('[data-saved-actions-toggle]')?.setAttribute('aria-expanded','false');revealed.delete(row);}};
  const headerFor=target=>target.closest('.q3-site-accordion>.accordion-trigger[aria-expanded=false],.q4-body-toggle[aria-expanded=false]');
  root.addEventListener('pointerdown',event=>{
    suppress=null;closeRows(event.target.closest('[data-saved-row]'));if(event.button!==0||event.isPrimary===false)return;
    const header=headerFor(event.target);if(!header)return;
    gesture={header,id:event.pointerId,x:event.clientX,y:event.clientY};
  },{signal});
  root.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.abs(dy)>9&&Math.abs(dy)>=Math.abs(dx)){gesture=null;return;}
    if(dx < -10&&Math.abs(dx)>Math.abs(dy)*1.4)event.preventDefault();
  },{signal,passive:false});
  root.addEventListener('pointercancel',()=>{gesture=null;},{signal});
  root.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const {header,x,y}=gesture;gesture=null;
    const dx=event.clientX-x,dy=event.clientY-y;
    if(dx > -36||Math.abs(dx)<Math.abs(dy)*1.4)return;
    const id=header.id,card=header.closest('.q3-site-accordion,.q4-body-item'),cardId=card?.id,line=card?.dataset.q4BodyLine;
    header.click();
    const current=cardId?root.querySelector('[id="'+win.CSS.escape(cardId)+'"]'):line?root.querySelector('[data-q4-body-line="'+win.CSS.escape(line)+'"]'):card;
    const currentHeader=id?root.querySelector('[id="'+win.CSS.escape(id)+'"]'):current?.querySelector('.accordion-trigger,.q4-body-toggle');
    if(!current||currentHeader?.getAttribute('aria-expanded')!=='true')return;
    suppress=currentHeader;let firstAction=null;
    for(const row of current.querySelectorAll('[data-saved-row]')){
      const toggle=row.querySelector('[data-saved-actions-toggle]'),action=row.querySelector('.saved-row-actions>.code1-text-action:nth-child(2)');
      if(!toggle||!action)continue;
      row.dataset.savedOpen='true';toggle.setAttribute('aria-expanded','true');revealed.add(row);firstAction??=action;
    }
    firstAction?.focus({preventScroll:true});event.preventDefault();
  },{signal});
  root.addEventListener('click',event=>{
    if(suppress&&event.detail>0&&suppress.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();suppress=null;}
  },{signal,capture:true});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&revealed.size){closeRows();event.preventDefault();}},{signal});
  return ()=>{gesture=null;suppress=null;closeRows();controller.abort();};
}
