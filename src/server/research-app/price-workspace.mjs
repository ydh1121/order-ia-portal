const instances=new WeakMap();
const normalStates=new Set(['costs','store-products','consumer-products','classification','delivery']);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const aborted=()=>Object.assign(Error('RESEARCH_PRICE_DISPOSED'),{name:'AbortError'});

/** One retained product instance. Ordinary navigation never recreates its model. */
export function mountResearchPriceWorkspace(container,{assetBase='/ia/research-assets/',state='costs',environment={},onState=()=>{},signal}={}){
  if(!container?.ownerDocument)throw Error('RESEARCH_PRICE_CONTAINER_REQUIRED');
  const existing=instances.get(container);
  if(existing&&!existing.snapshot().disposed)return existing;
  const document=container.ownerDocument,window=document.defaultView,options=environment.priceWorkspace||{};
  const controller=new window.AbortController(),cleanups=[],ownerCleanups=[],previousAttributes=new Map();
  let disposed=false,mounted=false,integration=null,workspace=null,rawTransport=null,transport=null,model=null,ownerController=null,generation=0,retiredLifecycle=null;
  let currentState=state,currentScenario='normal',module=null,pendingRequests=0,pendingWrites=0,lastError=null,sequence=0,selectionPending=false;
  let ownedRoot=null,style=null,compatibility=null;
  const notify=message=>{if(!disposed)options.onNotice?.(message);};
  const listen=(target,type,callback)=>{target.addEventListener(type,callback);cleanups.push(()=>target.removeEventListener(type,callback));};
  const attribute=(name,value)=>{previousAttributes.set(name,container.getAttribute(name));container.setAttribute(name,value);};
  const safeRead=()=>workspace?workspace.read():null;
  const sourceState=id=>module?.priceWorkspaceStates.find(entry=>entry.id===id);
  const activeEditor=()=>Boolean(integration?.modal.activeIds.length);
  const lifecycle=()=>integration?.lifetime.inspect()||{disposed,listeners:0,timeouts:0,intervals:0,frames:0,observers:0};
  function snapshot(){
    const doc=safeRead();
    return {source:'canonical-price-workspace',state:currentState,scenario:currentScenario,
      transportMode:rawTransport?.inspect?.().mode||(rawTransport?'injected':null),
      document:doc,model:workspace?.getState()||null,pendingRequests,pendingWrites,
      selectionPending,disposed,ready:mounted&&doc!==null&&!lastError,error:lastError,generation,lifecycle:lifecycle(),retiredLifecycle};
  }
  function restoreCompatibility(target){
    if(!target)return;
    const previous=Object.getOwnPropertyDescriptor(target,'priceWorkspaceQa');
    if(previous&&!previous.configurable)throw Error('RESEARCH_PRICE_OWNER_CONFLICT');
    const getter=()=>compatibility;
    Object.defineProperty(target,'priceWorkspaceQa',{configurable:true,get:getter});
    cleanups.push(()=>{if(Object.getOwnPropertyDescriptor(target,'priceWorkspaceQa')?.get===getter){if(previous)Object.defineProperty(target,'priceWorkspaceQa',previous);else delete target.priceWorkspaceQa;}});
  }
  function nativeState(){
    const section=workspace?.getState().section;
    if(section==='products'){
      const audience=ownedRoot?.querySelector('[data-product-audience][aria-pressed="true"]')?.dataset.productAudience;
      return audience==='consumer'?'consumer-products':'store-products';
    }
    return {costs:'costs',classification:'classification',carriers:'delivery'}[section]||null;
  }
  function observeNavigation(event){
    if(!event.target.closest?.('[data-section],[data-product-audience]'))return;
    window.queueMicrotask(()=>{
      if(disposed||selectionPending)return;
      const next=nativeState();
      if(next&&next!==currentState){currentState=next;onState({state:next,scenario:false});}
    });
  }
  function chooseView(view){
    if(!workspace?.read())return;
    const section=ownedRoot.querySelector('[data-section="'+view.section+'"]');
    if(workspace.getState().section!==view.section){
      if(!section)throw Error('RESEARCH_PRICE_SECTION_UNAVAILABLE');
      section.click();
    }
    if(view.audience){
      const button=ownedRoot.querySelector('[data-product-audience="'+view.audience+'"]');
      if(!button)throw Error('RESEARCH_PRICE_AUDIENCE_UNAVAILABLE');
      if(button.getAttribute('aria-pressed')!=='true')button.click();
    }
  }
  function makeIntegration(){
    const value=module.createResearchPriceIntegration(window);
    try{
      for(const name of ['mountPriceWorkspace','createPriceWorkspaceModel','createPriceWorkbookReader','importPriceWorkbook','mountPriceWorkspaceTree','createPriceWorkspaceQaTransport','dispose'])if(typeof value?.[name]!=='function')throw Error('RESEARCH_PRICE_FACTORY_INVALID');
      if(!value.modal?.open||!value.modal?.close)throw Error('RESEARCH_PRICE_MODAL_UNAVAILABLE');
      return value;
    }catch(error){value?.dispose?.();throw error;}
  }
  function stopOwner(){
    generation++;ownerController?.abort();
    for(const cleanup of ownerCleanups.splice(0).reverse())cleanup();
    workspace?.destroy();integration?.dispose();
    if(integration)retiredLifecycle=integration.lifetime.inspect();
    // Late provider failures may paint only this detached original subtree.
    ownedRoot?.remove();ownedRoot=null;workspace=null;integration=null;mounted=false;
  }
  function mountOwner(view){
    integration??=makeIntegration();
    ownerController=new window.AbortController();
    const owner=++generation,ownerSignal=ownerController.signal;
    transport={
      async request(path,body){
        if(disposed||ownerSignal.aborted)throw aborted();
        const writing=body!==undefined;pendingRequests++;if(writing)pendingWrites++;
        let cancel;
        const cancelled=new Promise((_resolve,reject)=>{cancel=()=>reject(aborted());ownerSignal.addEventListener('abort',cancel,{once:true});});
        try{
          const result=await Promise.race([Promise.resolve().then(()=>rawTransport.request(path,body,{signal:ownerSignal})),cancelled]);
          if(disposed||owner!==generation||ownerSignal.aborted)throw aborted();
          lastError=null;return result;
        }catch(error){if(!disposed&&owner===generation)lastError=error?.message||'PRICE_UNAVAILABLE';throw error;}
        finally{ownerSignal.removeEventListener('abort',cancel);pendingRequests--;if(writing)pendingWrites--;}
      },
      inspect:()=>rawTransport.inspect?.()||{mode:'injected',pending:pendingRequests}
    };
    const template=document.createElement('template');template.innerHTML=module.priceWorkspaceFragment.body;
    ownedRoot=template.content.querySelector('#price-workspace-app');
    if(!ownedRoot)throw Error('RESEARCH_PRICE_ROOT_MISSING');
    ownedRoot.dataset.workspaceStorage=rawTransport.inspect?.().mode||'injected';
    container.append(ownedRoot);
    workspace=integration.mountPriceWorkspace(ownedRoot,model,integration.createPriceWorkbookReader(),integration.importPriceWorkbook,integration.mountPriceWorkspaceTree,{transport,initialSection:view.section,initialAudience:view.audience});
    mounted=true;
    const root=ownedRoot;root.addEventListener('click',observeNavigation);
    ownerCleanups.push(()=>root.removeEventListener('click',observeNavigation));
  }
  function permitScenario(token){
    if(disposed||pendingWrites||activeEditor())return false;
    return token===sequence&&!workspace?.getState().dirty;
  }
  async function changeScenario(scenario,{reset=false,view=null}={}){
    await ready;
    if(disposed||selectionPending||!['normal','loading','error','empty','guest'].includes(scenario))return false;
    const method=reset||scenario==='empty'?'reset':'setScenario';
    if(typeof rawTransport?.[method]!=='function'){notify('이 환경은 검토용 상태 전환을 제공하지 않습니다.');return false;}
    const token=++sequence;selectionPending=true;
    try{
      if(!permitScenario(token)){notify('단가표의 미저장 변경을 먼저 저장하거나 되돌려 주세요.');return false;}
      if(disposed||token!==sequence)return false;
      const selectedView=view||sourceState(currentState);
      stopOwner();
      rawTransport[method](scenario);currentScenario=scenario;lastError=null;
      if(view)currentState=view.id;
      // Only an explicit, clean review scenario remounts the original factory.
      // Its initial loading/error/guest UI is preserved, while the enclosing
      // controller, transport, document and common header retain their owners.
      mountOwner(selectedView);
      return true;
    }finally{selectionPending=false;}
  }
  async function select({state:next,scenario=false}={}){
    await ready;
    if(disposed||selectionPending)return false;
    const view=sourceState(next);
    if(!view)return false;
    if(scenario)return changeScenario(view.scenario||'normal',{reset:true,view});
    // A failed first read has no draft to replace. Revisit the same original
    // provider and model so a transient failure can recover without resetting
    // its saved records or silently changing an explicit QA error scenario.
    if(workspace&&!workspace.read()&&lastError&&!pendingRequests){
      const token=++sequence;selectionPending=true;
      try{
        await workspace.reconnect();
        if(disposed||token!==sequence)return false;
      }finally{selectionPending=false;}
    }
    if(!normalStates.has(next))return next===currentState;
    if(!workspace?.read())return next===currentState;
    const token=++sequence;
    chooseView(view);
    if(disposed||token!==sequence)return false;
    currentState=next;return true;
  }
  function dispose(){
    if(disposed)return;disposed=true;sequence++;
    controller.abort();
    for(const cleanup of cleanups.splice(0).reverse())cleanup();
    stopOwner();
    rawTransport?.destroy?.();
    style?.remove();
    for(const [name,value] of previousAttributes)value===null?container.removeAttribute(name):container.setAttribute(name,value);
    instances.delete(container);
  }
  const api={select,snapshot,dispose,
    canLeave:()=>!disposed&&!pendingWrites&&!activeEditor(),
    get workspace(){return workspace;},get transport(){return transport;},get modal(){return integration?.modal||null;},
    setScenario:scenario=>changeScenario(scenario),
    reset:()=>changeScenario(sourceState(currentState)?.scenario||'normal',{reset:true,view:sourceState(currentState)})
  };
  const ready=Promise.resolve().then(async()=>{
    if(disposed||signal?.aborted)throw aborted();
    const path=assetBase+'research/price-integrations.mjs',url=new URL(path,window.location.href);
    if(url.origin!==window.location.origin)throw Error('RESEARCH_PRICE_ASSET_ORIGIN');
    module=await (options.loadModule?options.loadModule(path):import(path));
    if(disposed)throw aborted();
    if(typeof module?.createResearchPriceIntegration!=='function'||!Array.isArray(module.priceWorkspaceReference)||!Array.isArray(module.priceWorkspaceStates)||typeof module.priceWorkspaceFragment?.body!=='string'||typeof module.priceWorkspaceFragment?.css!=='string')throw Error('RESEARCH_PRICE_MODULE_INVALID');
    const view=sourceState(state);if(!view)throw Error('RESEARCH_PRICE_STATE_UNAVAILABLE');
    integration=makeIntegration();
    model=integration.createPriceWorkspaceModel();const reference=model.clone(module.priceWorkspaceReference);
    const now=typeof options.now==='function'?options.now():options.now;
    currentScenario=view.scenario||'normal';
    rawTransport=own(options,'createTransport')
      ?await options.createTransport({model,reference,now,scenario:currentScenario,signal:controller.signal})
      :integration.createPriceWorkspaceQaTransport(model,reference,{scenario:currentScenario,...(now===undefined?{}:{now})});
    if(disposed){rawTransport?.destroy?.();throw aborted();}
    if(typeof rawTransport?.request!=='function')throw Error('RESEARCH_PRICE_TRANSPORT_INVALID');
    const collision=document.getElementById('price-workspace-app');
    if(collision)throw Error('RESEARCH_PRICE_DUPLICATE_OWNER');
    style=document.createElement('style');style.dataset.researchPriceStyle='';style.textContent=module.priceWorkspaceFragment.css;
    container.prepend(style);
    attribute('data-qa-price-workspace','');attribute('data-research-price-workspace','');
    mountOwner(view);
    compatibility={get workspace(){return workspace;},get transport(){return transport;},get modal(){return integration?.modal;},get ready(){return workspace?.ready;},setScenario:api.setScenario,reset:api.reset};
    restoreCompatibility(container);
    const appRoot=container.closest('#order-single');if(appRoot&&appRoot!==container)restoreCompatibility(appRoot);
    listen(container,'r3-price-workspace-scenario',event=>{if(event.detail?.scenario)void api.setScenario(event.detail.scenario);});
    listen(container,'r3-motion-scenario',event=>{
      const mode=event.detail?.mode;
      if(mode==='replay'){void api.reset();return;}
      const next={normal:'normal',delay:'loading',error:'error',offline:'error',complete:'normal'}[mode];
      if(next)void api.setScenario(next);
    });
    return api;
  }).catch(error=>{lastError=error?.message||'RESEARCH_PRICE_UNAVAILABLE';dispose();throw error;});
  api.ready=ready;
  instances.set(container,api);
  if(signal){const abort=()=>dispose();signal.addEventListener('abort',abort,{once:true});cleanups.push(()=>signal.removeEventListener('abort',abort));}
  return api;
}
