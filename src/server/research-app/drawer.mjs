/** Mount the existing consultation sheet over the real application parent.
 * Its released controller still owns loading, selection, time wheels and submit.
 * Only the duplicated example background is removed at this composition seam. */
export function mountResearchDrawer({container,scene,module,api,signal,onClose}){
  const document=container.ownerDocument,window=document.defaultView;
  if(module?.id!=='drawer'||typeof module.mount!=='function')throw Error('CONSULTATION_MODULE_MISSING');
  const selectionEntry=scene.state==='closed';
  const root=document.createElement('div');root.className='ds research-drawer';root.dataset.researchDrawer='';
  root.innerHTML=scene.html;
  const sheet=root.querySelector('.functional-drawer'),background=root.querySelector('.drawer-scene>.page');
  if(!sheet||!background)throw Error('CONSULTATION_MARKUP_CHANGED');
  const choices=background.querySelector('.consult-tickets'),message=background.querySelector('.consult-selection-message'),trigger=background.querySelector('[data-action="open-drawer"]');
  if(!choices||!message||!trigger)throw Error('CONSULTATION_SELECTION_CHANGED');
  const selection=document.createElement('section');selection.className='research-consult-selection';selection.setAttribute('aria-label','상담할 견적');
  selection.append(choices,message);
  if(selectionEntry){
    // A closed consultation route still owns its selection and opener. Keep
    // them in the real parent page while the same original sheet opens/closes.
    root.dataset.researchConsultEntry='';root.style.position='relative';root.style.inset='auto';root.style.pointerEvents='auto';
    selection.style.padding='24px 26px';selection.append(trigger);background.replaceWith(selection);
  }else{
    sheet.querySelector('h1,h2')?.after(selection);if(!sheet.contains(selection))sheet.append(selection);
    trigger.hidden=true;root.append(trigger);background.remove();
  }
  for(const el of root.querySelectorAll('#order-single')){el.removeAttribute('id');if(selectionEntry)el.style.minHeight='0';}
  for(const text of scene.styles||[]){const style=document.createElement('style');style.textContent=text;root.prepend(style);}
  const local=new window.AbortController();let closed=false,disposeShared,disposeModule,polish;
  const dispose=()=>{if(closed)return;closed=true;local.abort();signal?.removeEventListener('abort',dispose);polish?.();disposeModule?.();disposeShared?.();window.ORDER_PRODUCT_UI?.dispose?.(root);root.remove();};
  if(signal?.aborted){dispose();return dispose;}
  signal?.addEventListener('abort',dispose,{once:true});
  const parent=selectionEntry?container.querySelector('#order-app-page'):null;
  if(parent)parent.prepend(root);else container.append(root);
  let targets=[];
  const contract=api.adapter?.consultation,consultation=contract?{...contract,async load(options){
    const [data,workspace]=await Promise.all([contract.load(options),typeof api.adapter.roleRequest==='function'?api.adapter.roleRequest('/workspace',null,options?.signal):Promise.resolve({})]);
    targets=(data.targets||[]).map(target=>{const quote=workspace.quotes?.find(quote=>quote.id===target.id),business=workspace.businesses?.find(business=>business.org_id===target.orgId&&business.site_id===target.siteId);return {...target,lines:quote?.lines||target.lines||[],date:quote?.issued_at||quote?.serviceDate||'',businessName:business?.businessName||target.label};});return {...data,targets};
  }}:contract;
  const mountedApi={...api,screen:'drawer',consultation,signal:local.signal,
    select(screen,state,options){
      if(screen==='drawer'&&state==='closed'){
        // The released connected controller owns closing, focus restoration
        // and retained edits in the selection flow. Do not dispose its DOM.
        if(selectionEntry)return;
        if(onClose)return onClose();
      }
      return api.select(screen,state,options);
    }};
  try{disposeShared=window.QAUI?.sharedMount?.(root,mountedApi);disposeModule=window.ORDER_PRODUCT_UI?.mount(module,root,scene.state,mountedApi)||module.mount(root,scene.state,mountedApi);polish=polishConsultation(root,()=>targets,local.signal);}
  catch(error){dispose();throw error;}
  return dispose;
}

function polishConsultation(root,readTargets,signal){
  const document=root.ownerDocument,window=document.defaultView,el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const style=el('style');style.textContent=`.research-drawer .consult-tickets{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;align-items:flex-start;padding:5px 3px 16px}.research-drawer .consult-ticket{flex:0 0 min(290px,82vw);border-radius:20px;border:1px solid #d9e1ec;padding:18px;background:#fff;scroll-snap-align:start;transition:background 200ms,border-color 200ms}.research-drawer .consult-ticket:has(input:checked){background:#edf3ff;border-color:#627fd5}.research-drawer .consult-ticket label{display:flex;gap:10px;align-items:flex-start}.research-drawer .consult-ticket label span{display:grid;gap:8px}.research-drawer .consult-ticket input{accent-color:#4969b4;flex:none}.research-drawer .consult-ticket-detail{border-top:1px dashed #c9d3e3;padding-top:12px;margin-top:14px}.research-drawer .consult-ticket-detail dl{display:grid;grid-template-columns:1fr auto;gap:10px;font-size:14px}.research-drawer .consult-ticket-detail dd{margin:0}.research-drawer .consult-ticket-detail small{display:block;color:#68768c}.research-drawer .consult-complete{text-align:center;display:grid;justify-items:center;gap:14px;padding:40px 20px}.research-drawer .consult-complete p{margin:0;line-height:1.6}.research-drawer .consult-complete svg{width:64px;height:64px;color:#23875a}.research-drawer .drawer-close{display:none}.research-drawer .consult-ticket-detail:not([hidden]){animation:research-consult-reveal 400ms cubic-bezier(.22,1,.36,1) both}@keyframes research-consult-reveal{from{opacity:0;transform:translateY(16px);filter:blur(2px)}to{opacity:1;transform:none;filter:blur(0)}}@media(prefers-reduced-motion:reduce){.research-drawer .consult-ticket{transition:none}.research-drawer .consult-ticket-detail{animation:none!important}}`;root.prepend(style);
  function update(){
    for(const input of root.querySelectorAll('[name="consult-pass"]')){
      const card=input.closest('.consult-ticket'),target=readTargets().find(target=>target.id===input.dataset.id);if(!card||!target||card.dataset.researchDetailed)continue;
      card.dataset.researchDetailed='true';const strong=card.querySelector('label strong');if(strong)strong.textContent=target.businessName;
      const detail=el('section',undefined,'consult-ticket-detail');detail.hidden=true;detail.append(el('strong','오더 패스'),el('p',target.date?String(target.date).slice(0,10):target.detail));const list=el('dl');
      for(const line of target.lines){const name=el('dt',line.productName||target.label),amount=el('dd',Number(line.quantity||0).toLocaleString('ko-KR')+({tray:'판',pack:'팩',box:'상자',piece:'개'}[line.unit]||''));if(line.serviceDate)name.append(el('small','납품 '+line.serviceDate));list.append(name,amount);}if(target.lines.length)detail.append(list);else detail.append(el('p',target.label));
      const button=el('button','패스 상세','btn text');button.type='button';button.dataset.action='consult-ticket-detail';button.setAttribute('aria-expanded','false');card.append(button,detail);
    }
    const saved=root.querySelector('[data-request-saved="true"]'),sheet=root.querySelector('.functional-drawer');if(saved&&!sheet.querySelector('.consult-complete')){
      const notice=sheet.querySelector('.consult-request-message'),receipt=el('section',undefined,'consult-complete');
      for(const child of sheet.children)if(!child.matches('.drawer-handle')&&child!==notice)child.hidden=true;
      const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('viewBox','0 0 24 24');mark.setAttribute('fill','none');mark.setAttribute('stroke','currentColor');mark.setAttribute('stroke-width','1.8');mark.setAttribute('aria-hidden','true');mark.innerHTML='<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>';
      receipt.append(mark,el('h2','상담을 예약했어요'),el('p','예약시간 확정 후 담당자가 연락드릴 예정이에요'));if(notice)receipt.append(notice);sheet.append(receipt);
    }
  }
  const observer=new window.MutationObserver(update);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-request-saved']});update();const dispose=()=>observer.disconnect();signal.addEventListener('abort',dispose,{once:true});return dispose;
}
