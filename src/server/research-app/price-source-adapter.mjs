import {browserFunction} from '../browser-source.mjs';
import {r3ProductAsset} from '../r3-product-page.mjs';
import {priceWorkspaceFragment} from '../r3-price-workspace-page.mjs';
import {mountPriceWorkspace} from '../r3-price-workspace-client.mjs';
import {createPriceWorkspaceModel} from '../r3-price-workspace-model.mjs';
import {createPriceWorkbookReader} from '../r3-price-workspace-xlsx.mjs';
import {importPriceWorkbook} from '../r3-price-workspace-import.mjs';
import {mountPriceWorkspaceTree} from '../r3-price-workspace-tree.mjs';
import {defaultPriceRows} from '../r3-price-workspace-defaults.mjs';
import {createPriceWorkspaceQaTransport,priceWorkspaceQaStates} from '../r3-price-workspace-qa.mjs';

const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');

/** Original product markup and CSS; the retained application owns its header. */
export function getResearchPriceWorkspaceFragment(){
  return priceWorkspaceFragment({header:false});
}

export function canonicalPriceModalSource(common){
  if(typeof common!=='string')throw Error('RESEARCH_PRICE_MODAL_SOURCE_REQUIRED');
  const marker='window.OrderModalShell=',endMarker='/* MSG0465:';
  if(common.split(marker).length!==2)throw Error('RESEARCH_PRICE_MODAL_SOURCE_CHANGED');
  const start=common.indexOf(marker),end=common.indexOf(endMarker,start);
  if(end<=start)throw Error('RESEARCH_PRICE_MODAL_SOURCE_CHANGED');
  const modal=common.slice(start,end);
  if(!modal.trimEnd().endsWith('})());')||/^\s*(?:import|export)\s/m.test(modal))throw Error('RESEARCH_PRICE_MODAL_SOURCE_CHANGED');
  return modal;
}

// The original modal and workspace factories retain their bodies. Their ambient
// browser objects are scoped here so their listeners, timers and modal owner do
// not replace the quote workspace's globals or survive this instance.
function createPriceLifetime(view){
  if(!view?.document)throw Error('RESEARCH_PRICE_WINDOW_REQUIRED');
  let disposed=false;
  const listeners=[],timeouts=new Set(),intervals=new Set(),frames=new Set(),observers=new Set(),locals=new Map();
  const capture=options=>typeof options==='boolean'?options:Boolean(options?.capture);
  const add=(target,type,listener,options)=>{
    if(disposed)return;
    target.addEventListener(type,listener,options);
    listeners.push({target,type,listener,options});
  };
  const remove=(target,type,listener,options)=>{
    target.removeEventListener(type,listener,options);
    for(let i=listeners.length-1;i>=0;i--){
      const item=listeners[i];
      if(item.target===target&&item.type===type&&item.listener===listener&&capture(item.options)===capture(options))listeners.splice(i,1);
    }
  };
  const setTimeout=(callback,delay,...args)=>{
    if(disposed)return 0;
    const id=view.setTimeout(()=>{timeouts.delete(id);if(!disposed)callback(...args);},delay);timeouts.add(id);return id;
  };
  const clearTimeout=id=>{timeouts.delete(id);view.clearTimeout(id);};
  const setInterval=(callback,delay,...args)=>{
    if(disposed)return 0;
    const id=view.setInterval(()=>{if(!disposed)callback(...args);},delay);intervals.add(id);return id;
  };
  const clearInterval=id=>{intervals.delete(id);view.clearInterval(id);};
  const requestAnimationFrame=callback=>{
    if(disposed)return 0;
    const id=view.requestAnimationFrame(time=>{frames.delete(id);if(!disposed)callback(time);});frames.add(id);return id;
  };
  const cancelAnimationFrame=id=>{frames.delete(id);view.cancelAnimationFrame(id);};
  const fetch=()=>Promise.reject(Error('RESEARCH_PRICE_TRANSPORT_REQUIRED'));
  const eventObject=target=>target&&new Proxy(target,{get(object,key){
    if(key==='addEventListener')return (type,listener,options)=>add(object,type,listener,options);
    if(key==='removeEventListener')return (type,listener,options)=>remove(object,type,listener,options);
    const value=Reflect.get(object,key,object);return typeof value==='function'?value.bind(object):value;
  }});
  const document=eventObject(view.document),viewport=eventObject(view.visualViewport);
  const scoped={setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,fetch};
  const window=new Proxy(view,{get(object,key){
    if(key==='document')return document;
    if(key==='visualViewport')return viewport;
    if(key==='OrderModalShell')return locals.get(key);
    if(Object.hasOwn(scoped,key))return scoped[key];
    if(key==='addEventListener')return (type,listener,options)=>add(object,type,listener,options);
    if(key==='removeEventListener')return (type,listener,options)=>remove(object,type,listener,options);
    if(locals.has(key))return locals.get(key);
    const value=Reflect.get(object,key,object);
    return typeof value==='function'&&!Object.hasOwn(value,'prototype')?value.bind(object):value;
  },set(_object,key,value){locals.set(key,value);return true;}});
  const observer=Constructor=>Constructor&&class{
    constructor(callback){this.original=new Constructor((...args)=>{if(!disposed)callback(...args);});observers.add(this);}
    observe(...args){return this.original.observe(...args);}
    unobserve(...args){return this.original.unobserve?.(...args);}
    takeRecords(){return this.original.takeRecords?.()||[];}
    disconnect(){this.original.disconnect();observers.delete(this);}
  };
  return {...scoped,window,document,ResizeObserver:observer(view.ResizeObserver),MutationObserver:observer(view.MutationObserver),
    inspect:()=>({disposed,listeners:listeners.length,timeouts:timeouts.size,intervals:intervals.size,frames:frames.size,observers:observers.size}),
    dispose(){
      if(disposed)return;disposed=true;
      for(const item of listeners.splice(0).reverse())item.target.removeEventListener(item.type,item.listener,item.options);
      for(const id of timeouts)view.clearTimeout(id);timeouts.clear();
      for(const id of intervals)view.clearInterval(id);intervals.clear();
      for(const id of frames)view.cancelAnimationFrame(id);frames.clear();
      for(const item of [...observers])item.disconnect();
      locals.clear();
    }};
}

/** Collected before bundling, then served from the immutable research pack. */
export async function getResearchPriceModuleSource(){
  const response=r3ProductAsset('/ia/r3-product/web/common-ui.mjs');
  if(!response.ok)throw Error('RESEARCH_PRICE_MODAL_SOURCE_UNAVAILABLE');
  const modal=canonicalPriceModalSource(await response.text());
  const functions=[mountPriceWorkspace,createPriceWorkspaceModel,createPriceWorkbookReader,importPriceWorkbook,mountPriceWorkspaceTree,createPriceWorkspaceQaTransport];
  return [
    'export const priceWorkspaceStates='+js(priceWorkspaceQaStates)+';',
    'export const priceWorkspaceReference='+js(defaultPriceRows)+';',
    'export const priceWorkspaceFragment='+js(getResearchPriceWorkspaceFragment())+';',
    'export function createResearchPriceIntegration(view){',
    'const lifetime=('+browserFunction(createPriceLifetime)+')(view);',
    'const {window,document,fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,ResizeObserver,MutationObserver}=lifetime;',
    'const matchMedia=view.matchMedia.bind(view),getComputedStyle=view.getComputedStyle.bind(view);',
    modal,
    ...functions.map(fn=>'const '+fn.name+'='+browserFunction(fn)+';'),
    'const modal=window.OrderModalShell;',
    'return {mountPriceWorkspace,createPriceWorkspaceModel,createPriceWorkbookReader,importPriceWorkbook,mountPriceWorkspaceTree,createPriceWorkspaceQaTransport,modal,lifetime,',
    'dispose(){try{for(const id of [...modal.activeIds].reverse()){const dialog=view.document.getElementById(id);if(dialog)modal.close(dialog,{immediate:true});}}finally{lifetime.dispose();}}};',
    '}'
  ].join('\n');
}
