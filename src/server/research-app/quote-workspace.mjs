/**
 * One regular quote workspace inside the application document. The original
 * createOrderApp owns all Q1–Q4 validation, edits, save gates and calculations.
 * This module owns only the host boundary, lifetime and application navigation.
 */
import {createResearchQuoteRepository} from './quote-repository.mjs';
import {mountResearchQuoteModePresentation} from './quote-mode-presentation.mjs';
const ASSET_BASE='/ia/research-assets/';
const ownedRoots=new WeakMap();
const pendingRoots=new WeakMap();
const validMode=mode=>['simple','detailed'].includes(mode);
const nativeOptions=options=>typeof options==='boolean'?{capture:options}:{...(options||{})};

function scopedStorage(storage,prefix){
  return Object.freeze({
    getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,String(value)),
    removeItem:key=>storage.removeItem(prefix+key),
  });
}

/** Legacy quote clients receive only asset reads and their injected domain
 * adapter. A generic browser fetch must never carry an app mutation. */
export function createResearchQuoteTransport(window,services={}){
  const adapter=services.adapter,context=services.context||adapter?.context||{};
  const assets=services.fetcher||services.fetch||window.fetch.bind(window);
  const response=(value,status=200)=>new window.Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  return async(input,settings={})=>{
    const url=new URL(typeof input?.url==='string'?input.url:String(input),window.location.href),method=String(settings.method||input?.method||'GET').toUpperCase();
    if(url.username||url.password)throw Error('APPLICATION_TRANSPORT_REQUIRED');
    if(url.origin===window.location.origin&&url.pathname.startsWith(ASSET_BASE)&&['GET','HEAD'].includes(method))return assets(input,settings);
    const match=(family,path)=>{const endpoint=context.endpoints?.[family];if(typeof endpoint!=='string')return false;const base=new URL(endpoint,window.location.href);return url.origin===base.origin&&url.pathname===base.pathname.replace(/\/$/,'')+path;};
    let request;
    if(method==='GET'&&match('role','/businesses')&&!url.search&&typeof adapter?.roleRequest==='function')request=()=>adapter.roleRequest('/businesses',null,settings.signal);
    else if(method==='GET'&&match('price','/quote')&&[...url.searchParams.keys()].every(key=>key==='id')&&url.searchParams.get('id')&&typeof adapter?.priceRequest==='function')request=()=>adapter.priceRequest('/quote'+url.search,null,settings.signal);
    if(!request)throw Error('APPLICATION_TRANSPORT_REQUIRED');
    try{await adapter.ready;if(settings.signal?.aborted)throw new window.DOMException('Aborted','AbortError');const value=await request();if(settings.signal?.aborted)throw new window.DOMException('Aborted','AbortError');return response(value);}
    catch(error){if(error.name==='AbortError')throw error;return response({error:error.code||error.message||'APPLICATION_SERVICE_UNAVAILABLE'},Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:503);}
  };
}

/** Exported separately to test cleanup/navigation without replacing the app. */
export function createResearchQuoteEnvironment(root,{mode,services={},onNavigate=()=>{},onState=()=>{},partition,namespace='application',externalHeader=true,fixtureScope=false}={}){
  if(!root?.ownerDocument||!validMode(mode)||!/^[a-f0-9]{64}$/.test(partition||'')||!/^[-\w.:]{1,128}$/.test(namespace))throw TypeError('RESEARCH_QUOTE_CONTEXT');
  const document=root.ownerDocument,window=document.defaultView;
  const controller=new window.AbortController(),cleanups=[],listeners=[],timers=new Set(),frames=new Set(),observers=new Set(),globals=new Map(),pagehide=new Set();
  const navigationEvents=new window.EventTarget(),historyEntries=[{state:null,hash:'#/form'}];
  let disposed=false,hash='#/form',historyState=null,quoteSync=null;
  // A retained review iframe may be displayed before the user enters it.
  // Only move focus while this document already owns it or during an actual
  // user activation; neither condition changes the embedder's focus policy.
  const canFocus=()=>!disposed&&(document.hasFocus()||window.navigator.userActivation?.isActive===true);
  const showModal=dialog=>{
    if(canFocus())return dialog.showModal();
    // showModal() otherwise attempts its own initial focus. Keep the native
    // top layer, but make that synchronous focus step ineligible and restore
    // the exact inert attribute before any user interaction or next paint.
    const inert=dialog.getAttribute('inert');dialog.setAttribute('inert','');
    try{return dialog.showModal();}
    finally{if(inert===null)dialog.removeAttribute('inert');else dialog.setAttribute('inert',inert);}
  };
  const alive=fn=>(...args)=>{if(!disposed)return fn(...args);};
  const add=(target,type,listener,options)=>{
    if(!listener||disposed)return;
    const fn=alive(typeof listener==='function'?listener.bind(target):event=>listener.handleEvent(event));
    const opts=nativeOptions(options);
    target.addEventListener(type,fn,opts);listeners.push({target,type,listener,fn,opts});cleanups.push(()=>target.removeEventListener(type,fn,opts));
    if(target===window&&type==='pagehide')pagehide.add(fn);
  };
  const remove=(target,type,listener,options)=>{const capture=!!nativeOptions(options).capture;for(const entry of listeners)if(entry.target===target&&entry.type===type&&entry.listener===listener&&!!entry.opts.capture===capture)target.removeEventListener(type,entry.fn,entry.opts);};
  const ownedNode=node=>{cleanups.push(()=>node.remove());return node;};
  const transport=createResearchQuoteTransport(window,services);
  const context=services.context||services.adapter?.context||{authenticated:false};
  const draftRequest=services.draftRequest||services.repository?.request;
  const quoteAdapter=typeof draftRequest==='function'?{ready:services.adapter?.ready||Promise.resolve(),request:(path,body,signal)=>{
    if(disposed)return Promise.reject(new window.DOMException('Aborted','AbortError'));
    return draftRequest(path,body,signal&&window.AbortSignal.any?window.AbortSignal.any([signal,controller.signal]):controller.signal);
  }}:null;
  const fetcher=(input,init={})=>{
    if(disposed)return Promise.reject(new window.DOMException('Aborted','AbortError'));
    const signal=init.signal&&window.AbortSignal.any?window.AbortSignal.any([init.signal,controller.signal]):init.signal||controller.signal;
    return transport(input,{...init,signal});
  };
  const navigation=url=>{
    const target=new URL(String(url),window.location.href),page=target.hash.replace(/^#\//,'');
    const view=target.searchParams.get('view');
    if(['simple-r3','detailed-r3'].includes(view))return onNavigate({type:'mode',mode:view==='simple-r3'?'simple':'detailed',page:page||'form'});
    if(view==='roles-r3')return onNavigate({type:'application',screen:target.searchParams.get('menu')==='delivery'?'delivery-request':target.searchParams.get('menu')==='business'?'business':'consultation',quote:target.searchParams.get('quote')});
    if(view==='pricing-r3')return onNavigate({type:'application',screen:'quote-result',quote:target.searchParams.get('quote')});
    if(['home','form','result'].includes(page)){hash='#/'+page;return onNavigate({type:'quote',mode,page});}
    throw new Error('APPLICATION_NAVIGATION_UNHANDLED');
  };
  // Location is a value facade, never a Proxy over the browser's unforgeable
  // Location methods. Modal tokens remain local to this workspace document.
  const location={get hash(){return hash;},set hash(value){navigation(value);},get href(){const u=new URL(window.location.href);u.hash=hash;return u.href;},get origin(){return window.location.origin;},get protocol(){return window.location.protocol;},get search(){return window.location.search;},get pathname(){return window.location.pathname;},assign:navigation,replace:navigation,toString(){return this.href;}};
  const modalState=value=>!!value?.__orderModal0519;
  const history={get state(){return historyState;},
    pushState(value,_title,url){const next=url?new URL(String(url),location.href).hash:hash;historyEntries.push({state:value,hash:next});historyState=value;hash=next;if(!modalState(value)&&url)navigation(url);},
    replaceState(value,_title,url){historyState=value;if(url)hash=new URL(String(url),location.href).hash||hash;historyEntries[historyEntries.length-1]={state:value,hash};},
    back(){if(historyEntries.length>1){historyEntries.pop();const entry=historyEntries.at(-1);historyState=entry.state;hash=entry.hash;window.queueMicrotask(()=>{if(!disposed)navigationEvents.dispatchEvent(new window.PopStateEvent('popstate',{state:historyState}));});}else onNavigate({type:'back',mode});}
  };
  root.dataset.r3QuoteMode=mode;root.dataset.r3QuotePartition=partition;
  const eventSurface=target=>target&&new Proxy(target,{get(object,key){if(key==='addEventListener')return (type,fn,opts)=>add(object,type,fn,opts);if(key==='removeEventListener')return (type,fn,opts)=>remove(object,type,fn,opts);const value=Reflect.get(object,key,object);return typeof value==='function'?value.bind(object):value;}});
  const fonts=document.fonts&&new Proxy(document.fonts,{get(target,key){
    if(key==='ready')return {then:fn=>target.ready.then(alive(fn))};
    if(key==='addEventListener')return (type,fn,opts)=>add(target,type,fn,opts);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const head=new Proxy(document.head,{get(target,key){if(key==='append')return (...nodes)=>nodes.forEach(node=>target.append(ownedNode(node)));if(key==='appendChild')return node=>target.appendChild(ownedNode(node));const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const scopedDocument=new Proxy(document,{get(target,key){
    if(key==='getElementById')return id=>root.id===id?root:root.querySelector('[id="'+String(id).replace(/["\\]/g,'\\$&')+'"]');
    if(key==='querySelector'||key==='querySelectorAll')return root[key].bind(root);
    if(key==='body')return root;if(key==='head')return head;if(key==='documentElement')return root;if(key==='fonts')return fonts;if(key==='defaultView')return scopedWindow;
    if(key==='addEventListener')return (type,fn,opts)=>add(type==='visibilitychange'?target:root,type,fn,opts);
    if(key==='removeEventListener')return (type,fn,opts)=>remove(type==='visibilitychange'?target:root,type,fn,opts);
    if(key==='dispatchEvent')return root.dispatchEvent.bind(root);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const scopedWindow=new Proxy(window,{get(target,key){
    if(key==='document')return scopedDocument;if(key==='location')return location;if(key==='history')return history;
    if(key==='fetch')return fetcher;if(key==='ORDER_APP_ADAPTER')return quoteAdapter;if(key==='ORDER_APP_CONTEXT')return context;if(key==='ORDER_QUOTE_DRAFT_SYNC')return quoteSync;
    if(key==='addEventListener')return (type,fn,opts)=>add(type==='popstate'?navigationEvents:target,type,fn,opts);
    if(key==='removeEventListener')return (type,fn,opts)=>remove(type==='popstate'?navigationEvents:target,type,fn,opts);
    if(key==='visualViewport')return eventSurface(target.visualViewport);
    if(key==='matchMedia')return query=>eventSurface(target.matchMedia(query));
    const value=Reflect.get(target,key,target);return typeof value==='function'&&!/^[A-Z]/.test(String(key))?value.bind(target):value;
  },set(target,key,value){if(key==='ORDER_QUOTE_DRAFT_SYNC'){quoteSync=value;return true;}if(!globals.has(key))globals.set(key,{before:Object.getOwnPropertyDescriptor(target,key),value});else globals.get(key).value=value;return Reflect.set(target,key,value,target);}});
  const observer=Original=>Original&&class extends Original{constructor(callback,options){super(alive(callback),options);observers.add(this);}disconnect(){observers.delete(this);super.disconnect();}};
  const local=services.repository?.storageOptions.localStorage||scopedStorage(services.storage?.localStorage||window.localStorage,'order.app.'+namespace+':');
  const session=services.repository?.storageOptions.sessionStorage||scopedStorage(services.storage?.sessionStorage||window.sessionStorage,'order.app.'+namespace+':');
  const environment={document:scopedDocument,window:scopedWindow,location,history,localStorage:local,sessionStorage:session,fetch:fetcher,
    externalHeader,fixtureScope,canFocus,showModal,addressService:services.addressService||services.regular?.addressService||services.address,
    storageOptions:{...services.storage,localStorage:local,sessionStorage:session,locks:services.storage?.locks||window.navigator.locks,crypto:services.storage?.crypto||window.crypto,now:services.now||Date.now,...services.repository?.storageOptions,partition,keyPrefix:'order_application_quote_v1_'},
    setTimeout(fn,ms,...args){let id;id=window.setTimeout(()=>{timers.delete(id);if(!disposed)fn(...args);},ms);timers.add(id);return id;},
    clearTimeout(id){timers.delete(id);window.clearTimeout(id);},
    requestAnimationFrame(fn){let id;id=window.requestAnimationFrame(time=>{frames.delete(id);if(!disposed)fn(time);});frames.add(id);return id;},
    cancelAnimationFrame(id){frames.delete(id);window.cancelAnimationFrame(id);},
    queueMicrotask:fn=>window.queueMicrotask(alive(fn)),ResizeObserver:observer(window.ResizeObserver),IntersectionObserver:observer(window.IntersectionObserver),MutationObserver:observer(window.MutationObserver),matchMedia:scopedWindow.matchMedia,
    notify:value=>{if(!disposed)onState(value);},
    dispose(){
      if(disposed)return;for(const listener of pagehide)listener(new window.Event('pagehide'));disposed=true;controller.abort();
      for(const id of timers)window.clearTimeout(id);for(const id of frames)window.cancelAnimationFrame(id);for(const item of observers)item.disconnect();
      timers.clear();frames.clear();observers.clear();for(const cleanup of cleanups.reverse())cleanup();listeners.length=0;
      for(const [key,{before,value}]of globals)if(window[key]===value){if(before)Object.defineProperty(window,key,before);else delete window[key];}
      globals.clear();pagehide.clear();cleanups.length=0;quoteSync=null;
    },
    get disposed(){return disposed;},
    inspect:()=>({disposed,timers:timers.size,frames:frames.size,observers:observers.size,listeners:listeners.length,globals:globals.size,modalHistory:modalState(historyState)}),
  };
  return environment;
}

const defaultModules=async()=>{
  const [app,review,ui,integrations]=await Promise.all([
    import('/ia/research-assets/web/app.mjs'),import('/ia/research-assets/web/q4-review.mjs'),
    import('/ia/research-assets/web/common-ui.mjs'),
    import('/ia/research-assets/research/quote-integrations.mjs'),
  ]);
  return {...app,...review,...ui,...integrations};
};

export async function mountResearchQuote(root,options={}){
  const mode=options.mode||'simple',pending=pendingRoots.get(root);
  if(pending){if(pending.mode!==mode||pending.fixtureScope!==!!options.fixtureScope)throw Error('QUOTE_SCOPE_MOUNT_IN_PROGRESS');const mounted=await pending.promise;mounted.navigate({step:options.step||'q1'});return mounted;}
  const promise=mountWorkspace(root,options);pendingRoots.set(root,{mode,fixtureScope:!!options.fixtureScope,promise});
  try{return await promise;}finally{if(pendingRoots.get(root)?.promise===promise)pendingRoots.delete(root);}
}

async function mountWorkspace(root,{mode='simple',step='q1',services={},onNavigate=()=>{},onState=()=>{},signal,namespace='application',partition,template,loadModules=defaultModules,styles=true,fixtureScope=false}={}){
  if(!root?.ownerDocument||!validMode(mode))throw TypeError('RESEARCH_QUOTE_ROOT');
  const previous=ownedRoots.get(root);if(previous){if(previous.mode!==mode)throw Error('QUOTE_MODE_REQUIRES_DISPOSE');if(previous.fixtureScope!==fixtureScope)throw Error('QUOTE_SCOPE_REQUIRES_DISPOSE');previous.navigate({step});return previous;}
  if(fixtureScope)namespace+=':fixtures';
  const doc=root.ownerDocument,win=doc.defaultView;
  if(signal?.aborted)throw new win.DOMException('Aborted','AbortError');
  const fetcher=createResearchQuoteTransport(win,services);
  const markup=typeof template==='string'?template:await fetcher(ASSET_BASE+'research/quote-document.html',{credentials:'same-origin',cache:'no-store',signal}).then(r=>{if(!r.ok)throw Error('QUOTE_TEMPLATE_UNAVAILABLE');return r.text();});
  if(signal?.aborted)throw new win.DOMException('Aborted','AbortError');
  const layout=doc.createElement('template');layout.innerHTML=markup;
  if(layout.content.querySelector('script,iframe,header.header'))throw Error('QUOTE_TEMPLATE_OWNS_APPLICATION_SHELL');
  const content=doc.createElement('div');content.dataset.researchQuote=mode;content.append(layout.content.cloneNode(true));root.replaceChildren(content);
  const links=[];
  if(styles)for(const name of ['styles.css','date-field.css','spinning-counter.css']){
    const link=doc.createElement('link');link.rel='stylesheet';link.href=ASSET_BASE+'web/'+name;link.dataset.researchQuoteStyle=name;doc.head.append(link);links.push(link);
  }
  let environment,app,releaseGlobals,releaseModePresentation,controller,regular,repository,ownsRepository=false;
  try{
    const modules=await loadModules();if(signal?.aborted)throw new win.DOMException('Aborted','AbortError');
    repository=!fixtureScope&&services.repository;
    if(!repository){repository=await createResearchQuoteRepository({window:win,namespace,partition,storage:services.storage,now:services.now});ownsRepository=true;}
    if(repository.namespace!==namespace||partition&&repository.partition!==partition)throw Error('QUOTE_REPOSITORY_SCOPE_MISMATCH');
    if(signal?.aborted)throw new win.DOMException('Aborted','AbortError');
    regular=services.installRegularGlobals?services:services.regular;
    if(!regular?.hasRegularGlobals?.(win))releaseGlobals=regular?.installRegularGlobals?.(win);
    environment=createResearchQuoteEnvironment(content,{mode,services:{...services,repository},onNavigate,onState,namespace,fixtureScope,partition:repository.partition});
    modules.installRegularQuoteUI(environment);
    app=modules.createOrderApp({quoteMode:mode,quoteProvider:services.quoteProvider||null,onAuthRequest:services.onAuthRequest||null,researchEnvironment:environment});
    const review=modules.createQ4Review({bridge:app.regularBridge,researchEnvironment:environment});app.connectQ4(review);
    await app.boot();if(signal?.aborted)throw new win.DOMException('Aborted','AbortError');
    releaseModePresentation=mountResearchQuoteModePresentation(content,environment);
    modules.mountSavedBusinessPicker?.(app,environment);
    const sync=fixtureScope?null:modules.mountQuoteDraftSync?.(app,environment);
    let disposed=false;
    const notify=()=>{if(!disposed)onState({...app.researchBridge.inspect(),snapshot:app.researchBridge.snapshot()});};
    const navigate=options=>{const result=app.researchBridge.navigate(options);notify();return result;};
    const abort=()=>controller.dispose();
    controller={mode,fixtureScope,app,sync,repository,ready:Promise.resolve(app),navigate,
      snapshot:()=>app.researchBridge.snapshot(),inspect:()=>({...app.researchBridge.inspect(),lifecycle:environment.inspect()}),
      canLeave:()=>app.researchBridge.canLeave(),prepareNavigation:()=>app.researchBridge.prepareNavigation(),save:()=>app.researchBridge.save(),
      async restoreDraft(record){if(record?.mode!==mode)return {ok:false,status:'MODE_MISMATCH'};const result=await repository.restore(mode,app.quoteDraftBridge,{expectedRevision:record.revision,expectedToken:record.versionToken,signal,isCurrent:()=>!disposed});notify();return result;},
      async applyScenario(value){const result=await app.researchBridge.applyScenario(value);notify();return result;},
      back(){if(!environment.inspect().modalHistory)return false;environment.history.back();return true;},
      async flush(){const saved=await app.researchBridge.save();return saved.ok&&sync?sync.flush():saved;},
      dispose(){if(disposed)return;disposed=true;signal?.removeEventListener('abort',abort);content.removeEventListener('order-quote-committed',notify);content.removeEventListener('change',notify);releaseModePresentation?.();app.researchBridge.dispose();regular?.releaseWithin?.(content);releaseGlobals?.();if(ownsRepository)repository.dispose();for(const link of links)link.remove();content.remove();ownedRoots.delete(root);},
    };
    ownedRoots.set(root,controller);content.addEventListener('order-quote-committed',notify);content.addEventListener('change',notify);signal?.addEventListener('abort',abort,{once:true});
    navigate({step,page:'form'});return controller;
  }catch(error){releaseModePresentation?.();app?.researchBridge?.dispose();environment?.dispose();regular?.releaseWithin?.(content);releaseGlobals?.();if(ownsRepository)repository?.dispose();for(const link of links)link.remove();content.remove();throw error;}
}

export {researchQuoteCss} from './quote-style.mjs';
