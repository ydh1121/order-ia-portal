/** Composition seams only. Released renderers, event bodies and motions stay
 * sealed; the single app header owns its brand controller for its whole life. */
const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_SCENE_SOURCE_CHANGED:'+before.slice(0,80));return source.replace(before,after);};
export function researchSceneSource(screen,source){
  if(screen==='onboarding'){
    source=once(source,'const brandMenu=w.mountBrandAccountMenu?.(brand,','const brandMenu=api.applicationHeader?.menu||w.mountBrandAccountMenu?.(brand,');
    source=once(source,'brandMenu?.destroy();ctl.abort();','if(!api.applicationHeader)brandMenu?.destroy();ctl.abort();');
    source=once(source,"run:()=>brandMenu.open('manage.quotes')","run:()=>brandMenu.open('manage.research.passes.grid',{title:'오더 패스'})");
  }
  if(screen==='quote-result')source=once(source,'const view=mount(host,{','const view=mount(host,{brand:false,');
  if(screen==='business')source=once(source,
    "for(const element of root.children)if(element!==panel&&!['STYLE','SCRIPT'].includes(element.tagName)){background.set(element,element.inert);element.inert=true;}",
    // The authored sheet used to be a direct child. In the application it is
    // nested inside the retained scene. Lock sibling branches, never the
    // sheet's own ancestors, and restore every previous inert value on close.
    "for(let branch=panel,boundary=root.closest('#order-single')||root;branch&&branch!==boundary;branch=branch.parentElement)for(const element of branch.parentElement?.children||[])if(element!==branch&&!['STYLE','SCRIPT'].includes(element.tagName)){background.set(element,element.inert);element.inert=true;}");
  if(['navigation','consultation','profileNotice'].includes(screen))source=once(source,"onClose:()=>{if(!connected)api.select('drawer','closed');}","onClose:()=>api.select('drawer','closed')");
  if(['adminCommon','adminLoading'].includes(screen))source=once(source,'const registry=window.ORDER_DESIGN_MODULES.find(item=>item.id===api.screen);','const registry=api.module||window.ORDER_DESIGN_MODULES.find(item=>item.id===api.screen);');
  return source;
}
