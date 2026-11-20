import {getQaApplicationDocument,qaMvpCss} from './r3-qa-assets.mjs';
import {qaMvpRuntimeCode} from './r3-ui/qa-assets.gen.mjs';
import {r3ProductAsset} from './r3-product-page.mjs';
import {bootBusinessDirectory,businessDirectoryPanelMarkup} from './r3-business-directory-page.mjs';
import {browserFunction} from './browser-source.mjs';

const serialized=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const routes={
 'manage.delivery':['admin-shipments','packing','납품일정'],
 'manage.payments':['store-purchase','select','결제 및 정산'],
 'manage.quotes':['delivery-request','ready','내 견적'],
 'manage.dashboard':['admin-analytics','business-sales','대시보드']
};
const screens=[['store-purchase','select'],['store-purchase','cash'],['store-purchase','card'],['delivery-request','ready'],['admin-shipments','packing'],['admin-analytics','business-sales'],['admin-analytics','campaign-sales']];
let bundle;

// Build once from the same canonical document renderer and the sealed region
// module. There is no additional business service or copied success workflow.
export function getProductPanelBootstrap(){
 return bundle??=(async()=>{
  const documents=Object.fromEntries(await Promise.all(screens.map(async([screen,state])=>{
   const document=await getQaApplicationDocument(screen,state);
   if(!document)throw Error('PRODUCT_PANEL_DOCUMENT_MISSING: '+screen+'/'+state);
   return [screen+'/'+state,{screen,state,body:document.body}];
  })));
  const response=r3ProductAsset('/ia/r3-product/web/region-reference.mjs');
  if(!response.ok)throw Error('PRODUCT_REGION_SOURCE_MISSING');
  const regionSource=await response.text();
  if(/^\s*import\s/m.test(regionSource)||!['export const listRegionRoots=','export const listRegionLeaves=','export function regionSelection('].every(marker=>regionSource.includes(marker)))throw Error('PRODUCT_REGION_SOURCE_CHANGED');
  // Trusted repository source is emitted as a nonce-bearing function body,
  // preserving the existing region implementation without eval or dynamic imports.
  const regionFactory='function(){'+regionSource.replace(/^export /gm,'')+';return {listRegionRoots,listRegionLeaves,regionSelection};}';
  const data={routes,documents,business:businessDirectoryPanelMarkup()};
  return {script:'('+browserFunction(installProductPanelWorkflows)+')('+serialized(data)+','+qaMvpRuntimeCode+','+browserFunction(bootBusinessDirectory)+','+regionFactory+');',css:qaMvpCss+productPanelCss};
 })().catch(error=>{bundle=undefined;throw error;});
}

export const productPanelCss=String.raw`
/* The scoped UI primitives add .ds specificity to inset:0. Preserve the
   canonical menu's natural page height so Back can shrink the same panel. */
.obm-panel.ds .obm-stack .obm-page{bottom:auto;height:auto}
.obm-panel .product-panel-body{min-width:0;max-width:100%;overflow-wrap:anywhere;container-type:inline-size}
.obm-panel .product-panel-body .ops-form-grid,.obm-panel .product-panel-body .ops-form-grid.four,.obm-panel .product-panel-body .ops-metrics{grid-template-columns:minmax(0,1fr)}
.obm-panel .product-panel-body .ops-panel{padding:14px;margin-block:12px;min-width:0}
.obm-panel .product-panel-body .mf-actions,.obm-panel .product-panel-body .ops-actions,.obm-panel .product-panel-body .business-tools{display:flex;flex-wrap:wrap;gap:8px;margin-block:16px}
.obm-panel .product-panel-body .btn{max-width:100%;white-space:normal;overflow-wrap:anywhere;min-height:44px}
.obm-panel .product-panel-body :is(input,select,textarea){min-width:0;max-width:100%}
.obm-panel .product-panel-body :is(.ops-table-wrap,.qa-sales-table){max-width:100%}
.obm-panel .product-panel-body .ops-table-wrap{overflow:auto}
.obm-panel .product-panel-body .qa-pass-flip{min-height:410px}
.obm-panel .product-panel-body .business-layout{display:block;margin:0;padding:0;min-width:0}
.obm-panel .product-panel-body .business-card{display:grid;justify-content:stretch;gap:6px;text-align:start;width:100%;margin-block:8px}
.obm-panel .product-panel-body .business-card span{font-size:12px;font-weight:400;color:var(--muted)}
.obm-panel .product-panel-body .business-layout .regions{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.obm-panel .product-panel-body h1,.obm-panel .product-panel-body h2{font-size:16px;margin-block:12px}
.obm-panel .product-panel-body .note{font-size:12px;color:var(--muted);line-height:1.6}
.obm-panel .product-panel-confirm{border:1px solid var(--line);border-radius:12px;padding:12px;margin-block:12px;background:var(--paper)}
.obm-panel .product-panel-confirm p{margin:0 0 12px;font-size:14px;line-height:1.5}
`;

export function installProductPanelWorkflows(config,registerRuntime,mountBusiness,createRegions){
 const previous=window.ORDER_DESIGN_MODULES;
 registerRuntime();
 const modules=new Map((window.ORDER_DESIGN_MODULES||[]).map(module=>[module.id,module]));
 // Capturing the existing factory does not replace the host page's modules.
 window.ORDER_DESIGN_MODULES=previous;
 const regions=createRegions();
 let instance=0;
 const known=(screen,state)=>Object.hasOwn(config.documents,screen+'/'+state);
 const destinations={
  'manage.delivery':['admin-shipments','store-purchase'],
  'manage.payments':['store-purchase'],
  'manage.quotes':['delivery-request','store-purchase'],
  'manage.dashboard':['admin-analytics','store-purchase']
 };
 const resolve=id=>{
  if(config.routes[id]){const [screen,state,title]=config.routes[id];return {screen,state,title};}
  const match=/^(manage\.(?:delivery|payments|quotes|dashboard))\.view\.([a-z-]+)\.([a-z-]+)$/.exec(id);
  return match&&destinations[match[1]].includes(match[2])&&known(match[2],match[3])?{screen:match[2],state:match[3],title:config.routes[match[1]][2]}:null;
 };
 const canMount=id=>id==='manage.business'||Boolean(resolve(id));
 function namespace(scope){
  const prefix='account-workflow-'+(++instance)+'-',ids=new Map();
  for(const element of scope.querySelectorAll('[id]')){const id=element.id;ids.set(id,prefix+id);element.dataset.businessRef=id;element.id=prefix+id;}
  for(const element of scope.querySelectorAll('[for],[aria-labelledby],[aria-describedby],[aria-controls]'))for(const attribute of ['for','aria-labelledby','aria-describedby','aria-controls'])if(element.hasAttribute(attribute))element.setAttribute(attribute,element.getAttribute(attribute).split(/\s+/).map(id=>ids.get(id)||id).join(' '));
 }
 function canonicalBody(row){
  const template=document.createElement('template');template.innerHTML=row.body;
  const source=template.content.querySelector('.ops-content,.mf-page');
  if(!source)throw Error('PRODUCT_PANEL_CONTENT_MISSING');
  for(const chrome of source.querySelectorAll(':scope > .page-head,:scope > .page-title,:scope > .ops-heading'))chrome.remove();
  const root=document.createElement('div');root.className='product-panel-body';root.dataset.appScreen=row.screen;root.dataset.qaMvp='';root.append(...source.childNodes);
  // Historical-only destinations are retained in review documents, but are not
  // active product actions in this account panel.
  for(const button of root.querySelectorAll('[data-qa-go="admin-analytics"][data-qa-state="normal"]'))button.remove();
  namespace(root);return root;
 }
 async function mount({id,container,signal,push,adapter}){
  if(!canMount(id)||signal.aborted)return;
  const controller=new AbortController(),localSignal=controller.signal;
  let alive=true,disposeRuntime=null,disposeShared=null,confirmation=null;
  const cleanup=()=>{if(!alive)return;alive=false;controller.abort();confirmation?.finish(false);disposeRuntime?.();disposeShared?.();};
  signal.addEventListener('abort',cleanup,{once:true});
  const showStatus=message=>{if(!alive)return;let status=container.querySelector('[data-panel-status]');if(!status){status=document.createElement('p');status.dataset.panelStatus='';status.className='muted';status.setAttribute('role','status');container.append(status);}status.textContent=message;};
  const ask=message=>{
   if(!alive)return Promise.resolve(false);if(confirmation)return confirmation.promise;
   const box=document.createElement('section');box.className='product-panel-confirm';box.setAttribute('role','alertdialog');box.setAttribute('aria-label',message);
   const text=document.createElement('p');text.textContent=message;
   const buttons=document.createElement('div');buttons.className='mf-actions';
   buttons.innerHTML=window.QAUI.button('취소','panel-confirm-cancel','secondary')+window.QAUI.button('확인','panel-confirm-accept','primary');box.append(text,buttons);container.prepend(box);
   let finish;const origin=document.activeElement,promise=new Promise(resolve=>{finish=value=>{box.remove();confirmation=null;if(origin?.isConnected)origin.focus();resolve(value);};});
   confirmation={promise,finish};buttons.children[0].onclick=()=>finish(false);buttons.children[1].onclick=()=>finish(true);buttons.children[0].focus();return promise;
  };
  try{
   if(id==='manage.business'){
    const root=document.createElement('div');root.className='product-panel-body';root.innerHTML=config.business;namespace(root);container.replaceChildren(root);
    const controller=mountBusiness(()=>{},regions,{root,adapter,signal:localSignal,ask});disposeRuntime=controller.dispose;
    disposeShared=window.QAUI?.sharedMount?.(root,{mode:'product',reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
    // This is the same server-provided membership listing as the existing panel.
    // Saving a directory address still cannot grant membership or verification.
    adapter.roleRequest('/account',null,localSignal).then(account=>{if(!alive||!account.members?.length)return;const nav=document.createElement('div');nav.className='mf-actions';nav.innerHTML=window.QAUI.button('구성원과 권한','business-members','secondary');nav.firstElementChild.onclick=()=>push('manage.business.members','구성원과 권한');root.prepend(nav);}).catch(()=>{});
    await controller.ready;
   }else{
    const route=resolve(id),row=config.documents[route.screen+'/'+route.state];
    let root,refreshOnReturn=false,savedFilters=[];
    const base=id.split('.view.')[0],screen=row.screen;
    const panelAdapter={...adapter,get selectedPurchaseId(){return adapter.selectedPurchaseId;},set selectedPurchaseId(value){adapter.selectedPurchaseId=value;},request:(path,body)=>adapter.request(path,body,localSignal)};
    const api={mode:'product',interactive:true,screen,variant:'email',adapter:panelAdapter,brandAccount:window.ORDER_BRAND_ACCOUNT_CONTEXT,reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
     select(next,state='default'){
      if(!alive)return;
      if(['admin-orders','admin-payments','customer-orders','order-detail','receipt','trade-documents'].includes(next)){next='store-purchase';state='select';}
      if(next==='store-purchase'&&state==='default')state='select';
      if(!destinations[base]?.includes(next)||!known(next,state)){showStatus('이 작업은 아직 연결되지 않았어요.');return;}
      const target=base+'.view.'+next+'.'+state;
      savedFilters=screen==='admin-analytics'?[...root.querySelectorAll('input,select')].map(input=>({name:input.name,value:input.value})):[];
      refreshOnReturn=true;
      if(!push(target,route.title)){refreshOnReturn=false;showStatus('이 작업을 열 수 없어요.');}
     },localState(){},toast:showStatus,demoSuccess(){showStatus('서버에서 처리 결과를 확인하지 못했어요.');return Promise.resolve({ok:false});}
    };
    const mountCurrent=()=>{
     disposeRuntime?.();disposeShared?.();
     root=canonicalBody(row);container.replaceChildren(root);
     disposeShared=window.QAUI?.sharedMount?.(root,api);disposeRuntime=modules.get(screen)?.mount(root,row.state,api);
     if(typeof disposeRuntime!=='function')throw Error('PRODUCT_PANEL_RUNTIME_MISSING');
     for(const saved of savedFilters){const input=[...root.querySelectorAll('input,select')].find(input=>input.name===saved.name);if(input){input.value=saved.value;window.QAUI?.syncField?.(input);}}
    };
    mountCurrent();
    // The stack keeps its parent DOM for the return animation. Once a child
    // workflow has run, remount the same canonical parent against fresh server
    // data when it becomes current again. A completed order must not leave its
    // old confirmation form or cached empty order list active on Back.
    const panel=container.closest('.obm-panel'),menu=[...document.querySelectorAll('.obm-brand')].map(brand=>brand.__orderAccountMenu).find(menu=>menu?.panel===panel);
    if(panel&&menu){
     const observer=new MutationObserver(()=>{if(alive&&refreshOnReturn&&container.isConnected&&!panel.dataset.stackMoving&&menu.inspect().page===id){refreshOnReturn=false;mountCurrent();}});
     observer.observe(panel,{childList:true,subtree:true,attributes:true,attributeFilter:['data-stack-moving']});
     localSignal.addEventListener('abort',()=>observer.disconnect(),{once:true});
    }
   }
  }catch(error){cleanup();if(!signal.aborted)throw error;}
  return cleanup;
 }
 window.ORDER_PRODUCT_PANELS={canMount,mount};
}
