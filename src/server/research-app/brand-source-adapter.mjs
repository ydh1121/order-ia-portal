const once = (source, marker, replacement) => {
  if (source.split(marker).length !== 2) throw Error('RESEARCH_BRAND_SOURCE_CHANGED:' + marker.slice(0, 80));
  return source.replace(marker, replacement);
};

/** Research-only lifetime and retained-header placement seams. User focus,
 * motions and stack pages remain canonical; panels may veto beforeLeave. */
export function researchBrandSource(original) {
  let source = once(original, '  function disposePage(page){', String.raw`
  let researchLeavePending=null,researchAccessPending=null,researchDestroying=false;
  const researchCanFocus=()=>doc.hasFocus()||win.navigator.userActivation?.isActive===true;
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
  // Scenario navigation may run in an inactive review frame. Keep each
  // transition and notification, checking permission only when focus is due.
  source = once(source, 'target?.focus({preventScroll:true});', 'if(researchCanFocus())target?.focus({preventScroll:true});');
  source = once(source, 'items[last?items.length-1:0]?.focus({preventScroll:true});', 'if(researchCanFocus())items[last?items.length-1:0]?.focus({preventScroll:true});');
  source = once(source, 'if(focus)trigger.focus({preventScroll:true});', 'if(focus&&researchCanFocus())trigger.focus({preventScroll:true});');
  source = once(source, 'items[target].focus();', 'if(researchCanFocus())items[target].focus();');
  source = once(source, '  function push(id,source=null,title=null){', '  function push(id,source=null,title=null){\n    if(researchLeavePending)return false;');
  // C527 applies to both the first and final menu corners. The canonical
  // module now owns the painted-logo bounds; do not move the final panel
  // below the header after its opening animation.
  // A newly displayed popover has no prior layout. Place its closed surface
  // at the trigger before enabling the transition to its measured open size.
  source = once(source, "const from=points(),version=++generation;cancelArrival();halt();",
    "const prepareOrigin=phase==='closed';if(prepareOrigin)surface.style.transitionProperty='none';const from=points(),version=++generation;cancelArrival();halt();");
  source = once(source, "void surface.offsetWidth;surface.dataset.open='true';",
    "void surface.offsetWidth;if(prepareOrigin)surface.style.removeProperty('transition-property');surface.dataset.open='true';");
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
