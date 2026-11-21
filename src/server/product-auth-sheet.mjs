import {catalog,frames} from './r3-ui/catalog.gen.mjs';
import {runtimes} from './r3-ui/runtime.gen.mjs';
import {browserFunction} from './browser-source.mjs';

let bundle;
const inflate=async value=>new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

// Use the shipped account renderer, provider artwork and integrated-login mount.
// The overlay owns placement and return navigation, never authentication results.
export function getProductAuthSheetBootstrap(){
 return bundle??=(async()=>{
  const row=catalog.find(row=>row.id==='login/empty/compact');
  const runtime=runtimes.accountFeedback,integrated=runtimes.integratedLogin;
  const start=runtime?.indexOf("(function (w) {\n  'use strict';\n  const U=w.QAUI");
  const providers=runtime?.match(/window\.ORDER_QA_PROVIDER_BUTTONS=([^\n]+);\n/);
  if(!row||!Number.isInteger(start)||start<0||!providers||!integrated?.startsWith(runtime))throw Error('CANONICAL_AUTH_SOURCE_MISSING');
  const html=await inflate(frames[row.current]);
  const css=html.match(/<style id="r3-qa-interaction-auth">([\s\S]*?)<\/style>/)?.[1];
  if(!css)throw Error('CANONICAL_AUTH_STYLE_MISSING');
  const register='function(){'+providers[0]+runtime.slice(start)+integrated.slice(runtime.length)+'}';
  // Account-only page rules must not resize unrelated current QA documents.
  return {script:'('+browserFunction(installProductAuthSheet)+')('+register+');',css:css.replaceAll('.ds ','.ds .product-auth-sheet ')+productAuthSheetCss};
 })().catch(error=>{bundle=undefined;throw error;});
}

export const productAuthSheetCss=String.raw`
.ds .product-auth-sheet{position:fixed;inset:0;z-index:80;isolation:isolate}
.ds .product-auth-sheet>.auth-scene{position:absolute;inset:0;width:100%;height:100%;background:transparent}
/* The canonical gesture and WAAPI own translation; generic modal transitions must not trail them. */
.ds .product-auth-sheet .auth-sheet{bottom:0;left:0;right:0;width:min(100%,460px);max-width:460px;max-height:calc(100% - 20px);margin-inline:auto;overscroll-behavior:contain;transition:none}
.ds .product-auth-sheet .sheet-dim{position:absolute;inset:0}
.ds .product-auth-sheet .terms-page{padding:0;min-height:0}
.ds .product-auth-sheet .terms-page .page-head{margin-top:0}
.ds .product-auth-sheet [data-auth-feedback]{font-size:14px;line-height:1.5;color:var(--muted);margin-block:12px 0}
.ds .product-auth-sheet [data-auth-feedback]:empty{display:none}
`;

export function installProductAuthSheet(registerAccount){
 let modules;
 function accounts(){
  if(modules)return modules;
  const previous=window.ORDER_DESIGN_MODULES;
  window.ORDER_DESIGN_MODULES=[];
  try{registerAccount();modules=new Map(window.ORDER_DESIGN_MODULES.map(module=>[module.id,module]));}
  finally{window.ORDER_DESIGN_MODULES=previous;}
  return modules;
 }
 function attach(root,api,{getState=()=>''}={}){
  root.__orderAuthSheet?.dispose();
  const registry=accounts(),controller=new AbortController();
  let holder=null,disposeView=null,disposeShared=null,viewEpoch=0,closing=false,disposed=false;
  let opener=null,originState='',returnTarget=null,previousReturn,background=[],paused=[],menus=[],flight=null;
  const known=id=>['login','signup','otp','password','terms'].includes(id)&&registry.has(id);
  const reduced=()=>Boolean(api.reduced?.());
  function namespace(scope,screen){
   const prefix='order-auth-'+screen+'-',ids=new Map(),counts=new Map();
   // Canonical fields use a per-render UID suffix. Give this one inline
   // instance a repeatable namespace so reopening a saved QA pin finds the
   // same field without relying on the number of preceding form visits.
   for(const element of scope.querySelectorAll('[id]')){
    const original=element.id,base=original.replace(/-\d+$/,''),count=(counts.get(base)||0)+1;counts.set(base,count);
    element.id=prefix+base+(count>1?'-'+count:'');ids.set(original,element.id);
   }
   for(const element of scope.querySelectorAll('[for],[aria-labelledby],[aria-describedby],[aria-controls]'))for(const name of ['for','aria-labelledby','aria-describedby','aria-controls'])if(element.hasAttribute(name))element.setAttribute(name,element.getAttribute(name).split(/\s+/).map(id=>ids.get(id)||id).join(' '));
  }
  function clearView(){viewEpoch++;disposeView?.();disposeView=null;disposeShared?.();disposeShared=null;}
  function releaseBackground(){
   for(const saved of background){saved.element.inert=saved.inert;saved.element.toggleAttribute('inert',saved.inertAttribute);if(saved.aria===null)saved.element.removeAttribute('aria-hidden');else saved.element.setAttribute('aria-hidden',saved.aria);}
   for(const animation of paused)try{if(animation.playState==='paused')animation.play();}catch{}
   for(const menu of menus)menu.resume?.();
   background=[];paused=[];menus=[];
  }
  function cleanup({focus=true}={}){
   flight?.cancel();flight=null;clearView();holder?.remove();holder=null;closing=false;
   if(window.ORDER_QA_AUTH_RETURN===returnTarget){if(previousReturn===undefined)delete window.ORDER_QA_AUTH_RETURN;else window.ORDER_QA_AUTH_RETURN=previousReturn;}
   returnTarget=null;releaseBackground();
   if(focus&&opener?.isConnected&&!opener.closest('[inert],[hidden]'))opener.focus({preventScroll:true});
  }
  function close({immediate=false,after}={}){
   if(!holder||closing){return;}
   closing=true;const sheet=holder.querySelector('.auth-sheet');
   const finish=()=>{cleanup({focus:!after});after?.();};
   if(immediate||reduced()||!sheet?.animate){finish();return;}
   sheet.inert=true;flight?.cancel();
   flight=sheet.animate([{transform:sheet.style.transform||'translateY(0)'},{transform:'translateY(105%)'}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
   flight.finished.then(()=>{if(!disposed&&holder)finish();},()=>{});
  }
  function toast(message){
   if(!holder)return;
   let status=holder.querySelector('[data-auth-feedback]');
   if(!status){status=document.createElement('p');status.dataset.authFeedback='';status.setAttribute('role','status');holder.querySelector('.auth-sheet')?.append(status);}
   status.textContent=String(message||'');
  }
  function render(id,state,initial=false){
   if(disposed||closing||!holder||!known(id))return false;
   const module=registry.get(id),next=state|| (id==='password'?'request':id==='terms'?'required':'empty');
   if(!module.states.some(value=>(value.id||value)===next))return false;
   clearView();const epoch=viewEpoch;
   const template=document.createElement('template');template.innerHTML=module.render(next,{variant:'compact'});
   let scene=template.content.querySelector('.auth-scene');
   if(!scene){
    scene=document.createElement('div');scene.className='auth-scene';
    const dim=document.createElement('div');dim.className='sheet-dim';dim.setAttribute('aria-hidden','true');
    const sheet=document.createElement('section');sheet.className='auth-sheet t-modal is-open';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',module.label);sheet.tabIndex=-1;
    const grip=document.createElement('div');grip.className='sheet-handle';grip.setAttribute('aria-hidden','true');sheet.append(grip,...template.content.childNodes);scene.append(dim,sheet);
   }
   scene.querySelector('.auth-background')?.remove();scene.querySelector('.auth-return-action')?.remove();
   holder.replaceChildren(scene);holder.dataset.authScreen=id;holder.dataset.authState=next;holder.dataset.authVariant='compact';
   const viewApi={...api,screen:id,variant:'compact',authOriginStep:null,toast,
    localState(value){if(epoch!==viewEpoch||closing)return;if(value==='closed')close({immediate:true});else if(holder)holder.dataset.authState=value;},
    select(target,value,...rest){
     if(epoch!==viewEpoch||closing||!holder)return;
     if(known(target)){if(target==='login'&&value==='closed')close({immediate:true});else render(target,value);return;}
     if(target==='onboarding'){
      const accepted=/^member-[1-4]$/.test(value||'')&&/^guest-[1-4]$/.test(originState);
      close({after:accepted?()=>api.select('onboarding','member-'+originState.slice(-1)):undefined});return;
     }
     close({after:()=>api.select?.(target,value,...rest)});
    },
    demoSuccess(button,done,...options){return api.demoSuccess?.(button,result=>{if(epoch===viewEpoch&&holder&&!closing)done?.(result);},...options);}
   };
   disposeShared=window.QAUI?.sharedMount?.(holder,viewApi);
   disposeView=module.mount(holder,next,viewApi);
   namespace(scene,id);
   if(id==='terms'){
    const signal=new AbortController(),oldDispose=disposeView;
    window.ORDER_QA_SHEET?.(scene.querySelector('.auth-sheet'),[scene.querySelector('.sheet-handle')],{signal:signal.signal,reduced,close});
    scene.querySelector('.sheet-dim').addEventListener('click',()=>close(),{signal:signal.signal});
    holder.addEventListener('keydown',event=>{
     if(event.key==='Escape'){event.preventDefault();close();return;}
     if(event.key!=='Tab'||event.defaultPrevented)return;
     // The canonical terms page becomes a dialog only inside this overlay.
     // Other account modules already provide their own modal keyboard loop.
     const dialog=scene.querySelector('.auth-sheet'),active=document.activeElement;
     if(!dialog.contains(active))return;
     const focusable=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[hidden],[inert]')&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden');
     if(!focusable.length){event.preventDefault();dialog.focus({preventScroll:true});return;}
     const first=focusable[0],last=focusable.at(-1);
     if(event.shiftKey&&(active===first||active===dialog)){event.preventDefault();last.focus({preventScroll:true});}
     else if(!event.shiftKey&&(active===last||active===dialog)){event.preventDefault();first.focus({preventScroll:true});}
    },{signal:signal.signal});
    disposeView=()=>{signal.abort();oldDispose?.();};
   }
   const sheet=scene.querySelector('.auth-sheet');
   if(initial&&!reduced()&&sheet?.animate){flight=sheet.animate([{transform:'translateY(105%)'},{transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'});flight.finished.catch(()=>{});}
   if(!holder.contains(document.activeElement))sheet.querySelector('input:not(:disabled),button:not(:disabled),[tabindex="0"]')?.focus({preventScroll:true});
   return true;
  }
  function select(id,state){
   if(!known(id))return false;
   if(disposed||closing)return true;
   if(holder){render(id,state);return true;}
   originState=getState();if(!/^(guest|member)-[1-4]$/.test(originState))return false;
   // An entry control cannot claim an authentication completion. Only a
   // canonical validated action may select success inside the active sheet.
   const entry=state==='closed'?'empty':state;
   if(['success','verified','sent','complete','loading','sending'].includes(entry))return false;
   opener=document.activeElement;previousReturn=window.ORDER_QA_AUTH_RETURN;
   returnTarget={module:'onboarding',guestState:'guest-'+originState.slice(-1),memberState:'member-'+originState.slice(-1)};
   window.ORDER_QA_AUTH_RETURN=returnTarget;
   background=[...root.children].filter(element=>!['STYLE','SCRIPT'].includes(element.tagName)).map(element=>({element,inert:element.inert===true,inertAttribute:element.hasAttribute('inert'),aria:element.getAttribute('aria-hidden')}));
   for(const saved of background){saved.element.inert=true;saved.element.setAttribute('inert','');saved.element.setAttribute('aria-hidden','true');}
   paused=root.getAnimations?.({subtree:true}).filter(animation=>animation.playState==='running')||[];for(const animation of paused)animation.pause();
   menus=[...root.querySelectorAll('.obm-brand')].map(element=>element.__orderAccountMenu).filter(Boolean);for(const menu of menus)menu.pause?.();
   holder=document.createElement('div');holder.className='product-auth-sheet';holder.dataset.productAuthSheet='';root.append(holder);
   // Shared field handlers on the page must not handle a sheet input twice.
   // Capture-phase review selection still sees the real canonical form nodes.
   for(const type of ['click','keydown','input','change','submit','reset'])holder.addEventListener(type,event=>event.stopPropagation(),{signal:controller.signal});
   if(!render(id,entry,true)){cleanup();return false;}
   return true;
  }
  root.addEventListener('r3-onboarding-state',()=>{if(holder)close({immediate:true});},{signal:controller.signal});
  const dispose=()=>{if(disposed)return;disposed=true;controller.abort();cleanup({focus:false});if(root.__orderAuthSheet===instance)delete root.__orderAuthSheet;};
  const instance={select,close,dispose,
   open(screen,state,variant='compact'){
    if(variant!=='compact')return false;
    if(holder?.dataset.authScreen===screen&&holder?.dataset.authState===state&&!closing)return true;
    return select(screen,state);
   },
   inspect(){return {open:Boolean(holder),screen:holder?.dataset.authScreen||null,state:holder?.dataset.authState||null,variant:'compact'};},
   get active(){return Boolean(holder);}
  };
  root.__orderAuthSheet=instance;
  return instance;
 }
 window.ORDER_AUTH_SHEET={attach};
}
