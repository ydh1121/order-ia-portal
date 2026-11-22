/** Mount the existing consultation sheet over the real application parent.
 * Its released controller still owns loading, selection, time wheels and submit.
 * Only the duplicated example background is removed at this composition seam. */
export function mountResearchDrawer({container,scene,module,api,signal}){
  const document=container.ownerDocument,window=document.defaultView;
  if(module?.id!=='drawer'||typeof module.mount!=='function')throw Error('CONSULTATION_MODULE_MISSING');
  const root=document.createElement('div');root.className='ds research-drawer';root.dataset.researchDrawer='';
  root.innerHTML=scene.html;
  const sheet=root.querySelector('.functional-drawer'),background=root.querySelector('.drawer-scene>.page');
  if(!sheet||!background)throw Error('CONSULTATION_MARKUP_CHANGED');
  const choices=background.querySelector('.consult-tickets'),message=background.querySelector('.consult-selection-message'),trigger=background.querySelector('[data-action="open-drawer"]');
  if(!choices||!message||!trigger)throw Error('CONSULTATION_SELECTION_CHANGED');
  const selection=document.createElement('section');selection.className='research-consult-selection';selection.setAttribute('aria-label','상담할 견적');
  selection.append(choices,message);sheet.querySelector('h1,h2')?.after(selection);if(!selection.isConnected&&!sheet.contains(selection))sheet.append(selection);
  trigger.hidden=true;root.append(trigger);background.remove();
  for(const el of root.querySelectorAll('#order-single'))el.removeAttribute('id');
  for(const text of scene.styles||[]){const style=document.createElement('style');style.textContent=text;root.prepend(style);}
  const local=new window.AbortController();let closed=false,disposeShared,disposeModule;
  const dispose=()=>{if(closed)return;closed=true;local.abort();signal?.removeEventListener('abort',dispose);disposeModule?.();disposeShared?.();window.ORDER_PRODUCT_UI?.dispose?.(root);root.remove();};
  if(signal?.aborted){dispose();return dispose;}
  signal?.addEventListener('abort',dispose,{once:true});container.append(root);
  const mountedApi={...api,screen:'drawer',consultation:api.adapter?.consultation,signal:local.signal};
  try{disposeShared=window.QAUI?.sharedMount?.(root,mountedApi);disposeModule=window.ORDER_PRODUCT_UI?.mount(module,root,scene.state,mountedApi)||module.mount(root,scene.state,mountedApi);}
  catch(error){dispose();throw error;}
  return dispose;
}
