const once = (source, marker, replacement) => {
  if (source.split(marker).length !== 2) throw Error('RESEARCH_BRAND_SOURCE_CHANGED:' + marker.slice(0, 80));
  return source.replace(marker, replacement);
};

/** Research-only lifetime and retained-header placement seams. Original focus,
 * motions and stack pages remain canonical; panels may veto beforeLeave. */
export function researchBrandSource(original) {
  let source = once(original, '  function disposePage(page){', String.raw`
  let researchLeavePending=null,researchAccessPending=null,researchDestroying=false;
  const researchApprovedPages=new WeakSet();
  function researchLeavePages(reason){return reason==='back'||reason==='access'?[pages.at(-1)]:pages.slice(1).reverse();}
  function researchLeaveGuards(selected){
    if(researchDestroying)return [];
    return selected.filter(page=>page&&page.id!=='root'&&!researchApprovedPages.has(page)&&
      (typeof page.dispose?.beforeLeave==='function'||typeof options.beforeLeave==='function'));
  }
  function researchRequestLeave(reason,retry,current=()=>true){
    if(destroyed)return Promise.resolve(false);
    const selected=researchLeavePages(reason),guards=researchLeaveGuards(selected);
    if(researchLeavePending){
      const pending=researchLeavePending;
      return pending.reason===reason&&pending.selected.length===selected.length&&pending.selected.every((page,index)=>page===selected[index])?pending.promise:Promise.resolve(false);
    }
    if(!guards.length)return Promise.resolve(current()&&retry()!==false);
    const pending={reason,selected,promise:null};researchLeavePending=pending;
    pending.promise=Promise.resolve().then(async()=>{
      for(const page of guards){
        if(destroyed||page.abort.signal.aborted||!pages.includes(page))return false;
        const context={reason,id:page.id,signal:page.abort.signal,confirmationContainer:pages.at(-1)?.node.querySelector('.obm-panel-content')||panel};
        if(typeof page.dispose?.beforeLeave==='function'&&await page.dispose.beforeLeave(context)!==true)return false;
        if(typeof options.beforeLeave==='function'&&await options.beforeLeave(context)!==true)return false;
      }
      if(destroyed||selected.some(page=>!pages.includes(page)||page.abort.signal.aborted)||!current())return false;
      guards.forEach(page=>researchApprovedPages.add(page));
      return retry()!==false;
    }).catch(error=>{options.onError?.({id:pages.at(-1)?.id,error});return false;}).finally(()=>{if(researchLeavePending===pending)researchLeavePending=null;});
    return pending.promise;
  }
  function researchReconcileAccess(){
    if(researchAccessPending)return researchAccessPending;
    const pending=Promise.resolve().then(async()=>{
      while(!destroyed&&phase!=='closed'&&phase!=='closing'&&pages.length>1&&!allowed(pages.at(-1).id)){
        // An already requested close/back owns its decision. Never prompt again
        // after a veto, and only continue after an actual successful operation.
        if(researchLeavePending){if(!await researchLeavePending.promise)break;continue;}
        const previous=pages.at(-1);
        const accepted=await researchRequestLeave('access',()=>pop({animate:false,focus:false}),
          ()=>pages.at(-1)===previous&&!allowed(previous.id));
        if(!accepted||pages.at(-1)===previous)break;
      }
    }).catch(error=>options.onError?.({id:pages.at(-1)?.id,error})).finally(()=>{
      if(researchAccessPending===pending)researchAccessPending=null;if(!destroyed)resize();
    });
    researchAccessPending=pending;return pending;
  }
  function requestClose(settings={}){
    if(phase==='closed')return Promise.resolve(true);
    return researchRequestLeave('close',()=>close(settings));
  }
  function requestBack(settings={}){
    if(pages.length<2)return Promise.resolve(false);
    return researchRequestLeave('back',()=>pop(settings));
  }
  function disposePage(page){`);
  source = once(source, '  function push(id,source=null,title=null){', '  function push(id,source=null,title=null){\n    if(researchLeavePending)return false;');
  // A native popover is above every document z-index. Keep its interactive
  // surface below the shared header so Order and the account opener remain
  // reachable; the original start-y still morphs from the actual logo origin.
  source = once(source, 'const top=Math.max(y+12,Math.min(r.top,bottom-1));',
    "const researchHeader=brand.closest('#order-app-header');const top=Math.max(y+12,Math.min(researchHeader?researchHeader.getBoundingClientRect().bottom+8:r.top,bottom-1));");
  source = once(source, '  function pop(settings={}){', '  function pop(settings={}){\n    if(researchLeaveGuards([pages.at(-1)]).length){void requestBack(settings);return false;}');
  source = once(source, '  function close({focus=true,immediate=false}={}){', '  function close({focus=true,immediate=false}={}){\n    if(phase!==\'closed\'&&researchLeaveGuards(pages.slice(1)).length){void requestClose({focus,immediate});return false;}');
  source = once(source,
    '      while(pages.length>1&&!allowed(pages.at(-1).id))pop({animate:false,focus:false});',
    '      void researchReconcileAccess();');
  source = once(source,
    "      delete slider.dataset.obmDragging;const from=pages.pop(),to=pages.at(-1);from.abort.abort();from.dispose?.();pageTransition(from,to,true,true,true,progress);return;",
    "      if(researchLeaveGuards([pages.at(-1)]).length){delete slider.dataset.obmDragging;settlePages();void requestBack();return;}\n      delete slider.dataset.obmDragging;const from=pages.pop(),to=pages.at(-1);from.abort.abort();from.dispose?.();pageTransition(from,to,true,true,true,progress);return;");
  source = once(source, '  function destroy(){\n    if(destroyed)return;', '  function destroy(){\n    if(destroyed)return;researchDestroying=true;');
  source = once(source, 'const api={setAuthenticated,setUnread,update,open,close,back:pop,show:push,pause,resume,arrival,destroy,inspect,trigger,panel};',
    'const api={setAuthenticated,setUnread,update,open,close,requestClose,requestBack,back:pop,show:push,pause,resume,arrival,destroy,inspect,trigger,panel};');
  return source;
}
