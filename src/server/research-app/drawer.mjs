import {researchPassRows} from './passes.mjs';

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
    const passes=researchPassRows({},workspace);
    targets=(data.targets||[]).map(target=>{const quote=workspace.quotes?.find(quote=>quote.id===target.id),business=workspace.businesses?.find(business=>business.org_id===target.orgId&&business.site_id===target.siteId);
      const pass=passes.find(pass=>pass.quoteId===target.id)||researchPassRows({},{quotes:[{id:target.id,productName:target.label,businessName:target.label,lines:target.lines,expires_at:target.expiresAt}]})[0];
      return {...target,lines:quote?.lines||target.lines||[],date:quote?.issued_at||quote?.serviceDate||'',businessName:business?.businessName||target.label,pass};});return {...data,targets};
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
  try{disposeShared=window.QAUI?.sharedMount?.(root,mountedApi);disposeModule=window.ORDER_PRODUCT_UI?.mount(module,root,scene.state,mountedApi)||module.mount(root,scene.state,mountedApi);polish=polishConsultation(root,()=>targets,local.signal,module.renderPassDetail,api.reduced);}
  catch(error){dispose();throw error;}
  return dispose;
}

/** The original checkbox, memo and booking form never move. Only the existing
 * canonical detail moves into a top-layer dialog and returns to its own card. */
export function mountConsultationPassDetail(root,{signal,reduced=()=>false}={}){
  const document=root.ownerDocument,window=document.defaultView,controller=new window.AbortController();
  const dialog=document.createElement('dialog');dialog.className='consult-pass-dialog';dialog.setAttribute('aria-label','오더 패스 상세');
  const close=document.createElement('button');close.type='button';close.className='btn secondary consult-pass-close';close.textContent='패스 상세 닫기';
  const host=document.createElement('div');host.className='consult-pass-stage';dialog.append(host,close);root.append(dialog);
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');let active=null,revision=0,destroyed=false;
  const transform=(from,to)=>'translate('+(from.left-to.left)+'px,'+(from.top-to.top)+'px) scale('+(from.width/to.width)+','+(from.height/to.height)+')';
  const canMove=(from,to)=>!reduced()&&!media?.matches&&from.width>0&&from.height>0&&to.width>0&&to.height>0;
  function cancelMotion(){revision++;active?.animation?.cancel();if(active)active.animation=null;}
  function finish(focus=true){
    if(!active)return;cancelMotion();const item=active;active=null;
    item.detail.hidden=true;item.card.append(item.detail);item.card.style.visibility=item.visibility;
    item.opener.setAttribute('aria-expanded','false');delete dialog.dataset.motion;
    if(dialog.open)dialog.close();
    if(focus&&item.opener.isConnected)item.opener.focus({preventScroll:true});
  }
  function run(item,frames,closing){
    const version=revision;dialog.dataset.motion=closing?'closing':'opening';
    item.animation=item.ticket.animate(frames,{duration:closing?280:380,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    item.animation.finished.then(()=>{
      if(active!==item||revision!==version||destroyed)return;
      item.animation.cancel();item.animation=null;
      if(closing)finish();else dialog.dataset.motion='open';
    },()=>{});
  }
  function hide(){
    if(!active||dialog.dataset.motion==='closing')return;
    const item=active,painted=item.ticket.getBoundingClientRect();cancelMotion();
    dialog.dataset.motion='closing';
    const base=item.ticket.getBoundingClientRect(),target=item.card.getBoundingClientRect();
    if(!item.ticket.animate||!canMove(painted,target)||!base.width||!base.height){finish();return;}
    run(item,[{transform:transform(painted,base),opacity:1},{transform:transform(target,base),opacity:.65}],true);
  }
  function show(opener){
    if(destroyed)return;
    const card=opener.closest('.consult-ticket'),detail=card?.querySelector('.consult-ticket-detail'),ticket=detail?.querySelector('.ticket-detail');
    if(!card||!detail||!ticket)return;
    finish(false);const from=card.getBoundingClientRect(),item={card,detail,ticket,opener,visibility:card.style.visibility,animation:null};
    active=item;detail.hidden=false;host.append(detail);opener.setAttribute('aria-expanded','true');opener.setAttribute('aria-haspopup','dialog');
    // Measure the same overflow/layout state that owns the FLIP frames.
    // Changing it after measuring can change the ticket's available width.
    dialog.dataset.motion='opening';
    dialog.showModal();close.focus({preventScroll:true});
    const to=ticket.getBoundingClientRect();card.style.visibility='hidden';
    if(ticket.animate&&canMove(from,to))run(item,[{transform:transform(from,to),opacity:.65},{transform:'none',opacity:1}],false);
    else dialog.dataset.motion='open';
  }
  root.addEventListener('click',event=>{
    const opener=event.target.closest('[data-action="consult-ticket-detail"]');if(!opener)return;
    event.preventDefault();event.stopImmediatePropagation();show(opener);
  },{capture:true,signal:controller.signal});
  close.addEventListener('click',hide,{signal:controller.signal});
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();hide();},{signal:controller.signal});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}},{signal:controller.signal});
  dialog.addEventListener('click',event=>{if(event.target===dialog)hide();},{signal:controller.signal});
  dialog.addEventListener('close',()=>{if(active&&!dialog.open)finish();},{signal:controller.signal});
  window.addEventListener('resize',()=>finish(),{signal:controller.signal});
  const motionChange=()=>{if(!active||!media?.matches)return;if(dialog.dataset.motion==='closing')finish();else{cancelMotion();dialog.dataset.motion='open';}};
  media?.addEventListener?.('change',motionChange);
  function destroy(){if(destroyed)return;destroyed=true;finish(false);controller.abort();media?.removeEventListener?.('change',motionChange);signal?.removeEventListener('abort',destroy);dialog.remove();}
  signal?.addEventListener('abort',destroy,{once:true});if(signal?.aborted)destroy();
  return {destroy,close:hide};
}

function polishConsultation(root,readTargets,signal,renderPassDetail,reduced){
  const document=root.ownerDocument,window=document.defaultView,el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  if(typeof renderPassDetail!=='function')throw Error('CONSULTATION_PASS_RENDERER_MISSING');
  const style=el('style');style.textContent=`.research-drawer .consult-tickets{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;align-items:flex-start;padding:5px 3px 16px}.research-drawer .consult-ticket{flex:0 0 min(290px,82vw);border-radius:20px;border:1px solid #d9e1ec;padding:18px;background:#fff;scroll-snap-align:start;transition:background 200ms,border-color 200ms}.research-drawer .consult-ticket:has(input:checked){background:#edf3ff;border-color:#627fd5}.research-drawer .consult-ticket label{display:flex;gap:10px;align-items:flex-start}.research-drawer .consult-ticket label span{display:grid;gap:8px}.research-drawer .consult-ticket input{accent-color:#4969b4;flex:none}.research-drawer .consult-pass-dialog{position:fixed;inset:0;width:min(440px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 40px);height:max-content;margin:auto;padding:0;border:0;background:transparent;color:inherit;overflow:visible;pointer-events:auto}.research-drawer .consult-pass-dialog::backdrop{background:rgba(24,34,49,.34);backdrop-filter:blur(3px)}.research-drawer .consult-pass-stage{max-height:calc(100dvh - 112px);overflow:auto;overscroll-behavior:contain}.research-drawer .consult-pass-dialog:is([data-motion=opening],[data-motion=closing]) .consult-pass-stage{overflow:visible}.research-drawer .consult-pass-dialog .consult-ticket-detail:not([hidden]){animation:none;transform:none;margin:0;padding:0;border:0}.research-drawer .consult-pass-dialog .ticket-detail{width:100%;box-sizing:border-box;transform-origin:0 0;transition:none}.research-drawer .consult-pass-close{display:block;margin:14px auto 0;min-height:44px;background:#fff}.research-drawer .consult-complete{text-align:center;display:grid;justify-items:center;gap:14px;padding:40px 20px}.research-drawer .consult-complete p{margin:0;line-height:1.6}.research-drawer .consult-complete svg{width:64px;height:64px;color:#23875a}.research-drawer .drawer-close{display:none}@media(prefers-reduced-motion:reduce){.research-drawer .consult-ticket{transition:none}}`;root.prepend(style);
  const detailViewer=mountConsultationPassDetail(root,{signal,reduced});
  function update(){
    for(const input of root.querySelectorAll('[name="consult-pass"]')){
      const card=input.closest('.consult-ticket'),target=readTargets().find(target=>target.id===input.dataset.id);if(!card||!target||card.dataset.researchDetailed)continue;
      card.dataset.researchDetailed='true';const strong=card.querySelector('label strong');if(strong)strong.textContent=target.businessName;
      const detail=el('section',undefined,'consult-ticket-detail');detail.hidden=true;detail.innerHTML=renderPassDetail(target.pass);
      const button=el('button','패스 상세','btn text');button.type='button';button.dataset.action='consult-ticket-detail';button.setAttribute('aria-expanded','false');card.append(button,detail);
    }
    const saved=root.querySelector('[data-request-saved="true"]'),sheet=root.querySelector('.functional-drawer');if(saved&&!sheet.querySelector('.consult-complete')){
      const notice=sheet.querySelector('.consult-request-message'),receipt=el('section',undefined,'consult-complete');
      for(const child of sheet.children)if(!child.matches('.drawer-handle')&&child!==notice)child.hidden=true;
      const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('viewBox','0 0 24 24');mark.setAttribute('fill','none');mark.setAttribute('stroke','currentColor');mark.setAttribute('stroke-width','1.8');mark.setAttribute('aria-hidden','true');mark.innerHTML='<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>';
      receipt.append(mark,el('h2','상담을 예약했어요'),el('p','예약시간 확정 후 담당자가 연락드릴 예정이에요'));if(notice)receipt.append(notice);sheet.append(receipt);
    }
  }
  const observer=new window.MutationObserver(update);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-request-saved']});update();const dispose=()=>{observer.disconnect();detailViewer.destroy();};signal.addEventListener('abort',dispose,{once:true});return dispose;
}
