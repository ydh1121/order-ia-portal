import {browserFunction} from '../browser-source.mjs';
import {createCommonMotion} from '../r3-common-motion.mjs';
import {installProductAdminMotion,productAdminMotionCss} from '../product-admin-motion.mjs';
import {installProductWorkflowMotion,productWorkflowMotionCss} from '../product-workflow-motion.mjs';
import {mountAsyncMotion,asyncMotionCss} from '../r3-async-motion.mjs';
import {createEvidenceEditor} from '../r3-evidence-client.mjs';

// Both real product documents and review artifact documents install this exact
// bundle. A review host never installs it or owns any application module.
let bootstrap;
export function getProductUiBootstrap(){
 if(bootstrap)return bootstrap;
 const factories={common:createCommonMotion,admin:installProductAdminMotion,workflow:installProductWorkflowMotion,async:mountAsyncMotion,evidence:createEvidenceEditor};
 const definitions=Object.entries(factories).map(([key,fn])=>key+':'+browserFunction(fn)).join(',');
 return bootstrap={script:'('+browserFunction(installProductUiRegistry)+')(window,{'+definitions+'});',css:asyncMotionCss+productAdminMotionCss+productWorkflowMotionCss};
}

export function installProductUiRegistry(win=window,factories={}){
 if(win.ORDER_PRODUCT_UI)return win.ORDER_PRODUCT_UI;
 // Installers are synchronous: authored modules can use all features during
 // their first mount, including inline account panels and authentication.
 win.ORDER_COMMON_MOTION=factories.common?.(win)||win.ORDER_COMMON_MOTION;
 factories.admin?.(win);
 win.ORDER_ASYNC_MOTION={mount:factories.async};
 win.ORDER_EVIDENCE_EDITOR=factories.evidence;
 factories.workflow?.(win);
 const roots=new WeakMap(),active=new Set();
 const disposeValue=value=>{if(typeof value==='function')value();else value?.destroy?.();};
 function quickActions(root,api,adapter){
  // A page owns one floating menu. Embedded account and authentication panels
  // inherit the page's menu instead of creating another fixed-position owner.
  if(!root.querySelector||root.closest?.('.product-panel-body,.product-auth-sheet,[data-product-auth-sheet],[data-component-source]'))return [];
  if(Array.isArray(api.quickActions))return api.quickActions;
  const authenticated=api.brandAccount?.authenticated??adapter?.context?.actor?.authenticated;
  if(authenticated!==true||typeof api.select!=='function')return [];
  const account=(section,state)=>{
   const menu=root.querySelector('.obm-brand[data-authenticated="true"]')?.__orderAccountMenu;
   if(menu?.open)menu.open(section);else api.select('profile',state);
  };
  const actions=[
   {id:'account',label:'내 계정',symbol:'○',run:()=>account('profile','default')},
   {id:'notifications',label:'알림',symbol:'●',run:()=>account('notifications','notification')}
  ];
  if(typeof (api.consultation||adapter?.consultation)?.request==='function')actions.unshift({id:'consultation',label:'납품 상담',symbol:'↗',run:()=>{
   const trigger=api.screen==='drawer'&&root.querySelector('[data-action="open-drawer"]');
   if(trigger)trigger.click();else api.select('drawer','closed');
  }});
  return actions;
 }
 function mount(module,root,state,api={}){
  if(!root||typeof module?.mount!=='function')return null;
  const previous=roots.get(root);
  // A transport adapter can wrap a canonical module. Re-entering that wrapper
  // stays within the same lifetime instead of creating a second motion owner.
  if(previous?.mounting)return module.mount(root,state,{...api,signal:previous.controller.signal,motion:previous.motion,commonMotion:win.ORDER_COMMON_MOTION});
  if(previous&&previous.module===module&&previous.state===state&&previous.adapter===api.adapter)return previous.dispose;
  previous?.dispose();
  const controller=new win.AbortController();
  const motion=win.ORDER_ASYNC_MOTION.mount?.(root,{source:api.mode==='product'?'server':'qa-fixture'});
  const record={module,state,adapter:api.adapter,controller,motion,mounting:true,closed:false,canonical:null,workflow:null,gooey:null,dispose:null};
  const adapter=api.adapter||win.ORDER_APP_ADAPTER;
  const mountedApi={...api,adapter,consultation:api.consultation||adapter?.consultation,screen:api.screen||module.id,signal:controller.signal,motion,commonMotion:win.ORDER_COMMON_MOTION};
  mountedApi.quickActions=quickActions(root,mountedApi,adapter);
  const dispose=()=>{
   if(record.closed)return;record.closed=true;controller.abort();
   try{disposeValue(record.canonical);}finally{
    try{disposeValue(record.workflow);}finally{disposeValue(record.gooey);motion?.destroy?.();roots.delete(root);active.delete(record);api.signal?.removeEventListener('abort',dispose);}
   }
  };
  // Retained account-stack pages can invalidate their canonical data without
  // rebuilding the DOM or creating a second set of motion owners.
  dispose.refresh=()=>!record.closed&&record.canonical?.refresh?.()===true;
  record.dispose=dispose;roots.set(root,record);active.add(record);
  if(api.signal?.aborted){dispose();return dispose;}
  api.signal?.addEventListener('abort',dispose,{once:true});
  try{
   record.canonical=module.mount(root,state,mountedApi);
   record.mounting=false;
   // Admin helpers are owned by the authored admin module. Workflow.mount is
   // idempotent for a root, so its authored and registry entrypoints share one
   // controller. Common document listeners are never destroyed per root.
   record.workflow=win.ORDER_WORKFLOW_MOTION?.mount?.(root,{screen:mountedApi.screen,state,api:mountedApi,adapter:mountedApi.adapter,signal:controller.signal,reduced:mountedApi.reduced});
   record.gooey=win.ORDER_ADMIN_MOTION?.mountGooey?.(root,mountedApi.quickActions,{signal:controller.signal,reduced:mountedApi.reduced});
  }catch(error){record.mounting=false;dispose();throw error;}
  return dispose;
 }
 const registry={mount,dispose(root){roots.get(root)?.dispose();},inspect(root){const value=roots.get(root);return value?{screen:value.module.id,state:value.state,active:!value.closed}:null;}};
 win.ORDER_PRODUCT_UI=registry;
 win.addEventListener('pagehide',()=>{for(const value of [...active])value.dispose();win.ORDER_COMMON_MOTION?.destroy?.();},{once:true});
 return registry;
}
