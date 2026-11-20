// QA-only compatibility for the released frame controller. Product components
// retain their own rendering, data and events; this layer keeps annotation tools
// above native popovers and records the visible panel in existing anchor.layers.
export function installReviewPanels(session,authStates=[]) {
  if(window===parent)return;
  const root=document.querySelector('#order-single');if(!root)return;
  const accountPages=new Map(['root','profile','notifications','manage','profile.account','profile.personal','profile.connections','manage.delivery','manage.payments','manage.quotes','manage.business','manage.dashboard'].map(id=>[id,'']));
  for(const target of window.ORDER_PRODUCT_PANELS?.targets||[])if(target&&typeof target.id==='string'&&/^(profile|notifications|manage)\.[a-z0-9.-]{1,100}$/.test(target.id)&&typeof target.title==='string'&&target.title.trim()&&target.title.length<=80)accountPages.set(target.id,target.title);
  const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
  const layers=new Map(),replayed=new WeakSet(),promoted=new Set();
  let scheduled=0,restoreFrame=0,generation=0,disposed=false;
  const style=document.createElement('style');style.dataset.reviewPanels='';
  style.textContent='.r3-panel-state{position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;pointer-events:none}.r3-panel-state[hidden]{display:none!important}#r3-veil[popover],#r3-pins[popover]{inset:0;margin:0;padding:0;border:0;width:auto;height:auto;max-width:none;max-height:none;overflow:visible;background:transparent}.approval-draft-pin[popover]{margin:0;inset:auto;overflow:visible}#r3-veil::backdrop,#r3-pins::backdrop,.approval-draft-pin::backdrop{background:transparent;pointer-events:none}';
  document.head.append(style);
  function idFor(el){let hash=2166136261;for(const c of 'screen/'+[el.localName,...fields.map(name=>el.getAttribute(name)||'')].join('|'))hash=Math.imul(hash^c.charCodeAt(0),16777619);return 'a-'+(hash>>>0).toString(36);}
  function layer(kind,page,state='',title=''){
    const node=document.createElement('span');node.id='r3-panel-state-'+kind+'-'+page+(state?'-'+state:'');
    node.className='r3-panel-state';node.hidden=true;node.dataset.r3Popup='';node.setAttribute('aria-hidden','true');root.append(node);
    layers.set(idFor(node),{node,kind,page,state,title});
  }
  for(const [page,title] of accountPages)layer('account',page,'',title);
  layer('date','opening');
  for(const entry of authStates)if(Array.isArray(entry)&&entry.length===2&&entry.every(value=>typeof value==='string'&&/^[\w.-]{1,80}$/.test(value)))layer('auth',...entry);
  const account=()=>root.querySelector('.obm-brand')?.__orderAccountMenu;
  function topLayer(el,active){
    if(!el?.showPopover)return;
    if(active){
      if(!promoted.has(el)){el.setAttribute('popover','manual');promoted.add(el);}
      try{if(!el.matches(':popover-open'))el.showPopover();}catch{}
    }else if(promoted.delete(el)){
      try{if(el.matches(':popover-open'))el.hidePopover();}catch{}
      el.removeAttribute('popover');
    }
  }
  function sync(){
    scheduled=0;if(disposed)return;
    const menu=account()?.inspect(),auth=root.__orderAuthSheet?.inspect(),picker=root.querySelector('.opening-wheels');
    for(const entry of layers.values()){
      if(!root.contains(entry.node))root.append(entry.node);
      const active=entry.kind==='account'?['open','opening'].includes(menu?.phase)&&menu.page===entry.page:
        entry.kind==='date'?Boolean(picker&&!picker.hidden):auth?.open===true&&auth.screen===entry.page&&auth.state===entry.state;
      if(entry.node.hidden===active)entry.node.hidden=!active;
    }
    const popup=root.querySelector('[data-order-account-panel]:not([hidden]),.opening-wheels:not([hidden])')||
      [...root.querySelectorAll('[popover]')].find(el=>{try{return el.matches(':popover-open');}catch{return false;}});
    const veil=document.getElementById('r3-veil'),markers=document.getElementById('r3-pins'),draft=document.querySelector('.approval-draft-pin');
    topLayer(veil,Boolean(popup&&veil&&!veil.hidden));
    topLayer(markers,Boolean(popup));topLayer(draft,Boolean(popup&&draft&&!draft.hidden));
  }
  function schedule(){if(!scheduled&&!disposed)scheduled=requestAnimationFrame(sync);}
  // Taking focus to select a point must not dismiss the panel being reviewed.
  const keepPanel=event=>{if(event.target?.id==='r3-veil'&&!event.target.hidden)event.stopImmediatePropagation();};
  addEventListener('focusin',keepPanel,true);
  function restore(event){
    const message=event.data;
    if(replayed.has(event)||disposed||event.source!==parent||message?.scope!=='ORDER_R3_HOST'||message.channel!==session.channel||message.artifact!==session.artifact||message.type!=='restore')return;
    const anchor=message.payload;if(!anchor||anchor.instance!==session.screen||anchor.artifactHash!==session.artifact||!Array.isArray(anchor.layers))return;
    const target=anchor.layers.map(id=>layers.get(id)).find(Boolean);if(!target)return;
    const control=target.kind==='account'?account():target.kind==='date'?root.querySelector('.opening-date>button'):root.__orderAuthSheet;if(!control||control.disabled)return;
    let accepted;
    if(target.kind==='date'){if(root.querySelector('.opening-wheels')?.hidden)control.click();accepted=root.querySelector('.opening-wheels')?.hidden===false;}
    else if(target.kind==='account'){
      // Opening the same canonical page again would settle its stack by
      // reinserting the current DOM. Preserve the live draft and frozen frame
      // identities when a user selects another pin in the already open panel.
      const state=control.inspect();
      if(state.phase==='open'&&state.page===target.page)accepted=true;
      else if(target.page==='root'){
        // open(null) leaves an existing child in place. Reset through the
        // canonical lifecycle, also cancelling any pending child entrance.
        if(state.phase!=='closed')control.close({focus:false,immediate:true});
        accepted=control.open();
      }else accepted=control.open(target.page,{title:target.title});
    }else accepted=control.open(target.page,target.state,'compact');
    if(!accepted)return;
    event.stopImmediatePropagation();const version=++generation,start=performance.now();
    cancelAnimationFrame(restoreFrame);
    const ready=()=>{
      if(disposed||version!==generation)return;
      const state=control.inspect?.();
      const complete=target.kind==='account'?state.phase==='open'&&state.page===target.page&&!control.panel.querySelector('[aria-busy=true]'):
        target.kind==='date'?root.querySelector('.opening-wheels')?.hidden===false:state.open&&state.screen===target.page&&state.state===target.state;
      if(!complete&&performance.now()-start<1800){restoreFrame=requestAnimationFrame(ready);return;}
      sync();restoreFrame=requestAnimationFrame(()=>{
        if(disposed||version!==generation)return;
        const replay=new MessageEvent('message',{data:message,source:parent,origin:event.origin});replayed.add(replay);dispatchEvent(replay);
      });
    };
    restoreFrame=requestAnimationFrame(ready);
  }
  addEventListener('message',restore);
  const observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-page','data-auth-screen','data-auth-state','aria-busy','data-account-open']});
  function reset(){generation++;cancelAnimationFrame(restoreFrame);schedule();}
  root.addEventListener('r3-motion-identity-reset',reset);
  function dispose(){disposed=true;generation++;observer.disconnect();cancelAnimationFrame(scheduled);cancelAnimationFrame(restoreFrame);removeEventListener('focusin',keepPanel,true);removeEventListener('message',restore);root.removeEventListener('r3-motion-identity-reset',reset);for(const el of [...promoted])topLayer(el,false);for(const {node} of layers.values())node.remove();style.remove();}
  addEventListener('pagehide',dispose,{once:true});schedule();
}
