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
  const local=new window.AbortController();let closed=false,disposeShared,disposeModule;
  const dispose=()=>{if(closed)return;closed=true;local.abort();signal?.removeEventListener('abort',dispose);disposeModule?.();disposeShared?.();window.ORDER_PRODUCT_UI?.dispose?.(root);root.remove();};
  if(signal?.aborted){dispose();return dispose;}
  signal?.addEventListener('abort',dispose,{once:true});
  const parent=selectionEntry?container.querySelector('#order-app-page'):null;
  if(parent)parent.prepend(root);else container.append(root);
  const mountedApi={...api,screen:'drawer',consultation:api.adapter?.consultation,signal:local.signal,
    select(screen,state,options){
      if(screen==='drawer'&&state==='closed'){
        // The released connected controller owns closing, focus restoration
        // and retained edits in the selection flow. Do not dispose its DOM.
        if(selectionEntry)return;
        if(onClose)return onClose();
      }
      return api.select(screen,state,options);
    }};
  try{disposeShared=window.QAUI?.sharedMount?.(root,mountedApi);disposeModule=window.ORDER_PRODUCT_UI?.mount(module,root,scene.state,mountedApi)||module.mount(root,scene.state,mountedApi);}
  catch(error){dispose();throw error;}
  return dispose;
}
