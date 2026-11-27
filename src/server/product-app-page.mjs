import {onboardingCardResizeSource} from './product-ui/onboarding-card-resize.mjs';
import {catalog,frames,cssGzip} from './product-ui/catalog.gen.mjs';
import {productFontCss} from './product-fonts.mjs';
import {onboardingGooeyCss} from './product-ui/onboarding-gooey-style.mjs';
import {runtimes} from './product-ui/runtime.gen.mjs';
import {getProductApplicationDocument} from './product-ui/documents.mjs';
import {getProductUiBootstrap} from './product-ui/bootstrap.gen.mjs';
import {browserFunction} from './browser-source.mjs';
import {installProductAdapter} from './product-app-adapter.mjs';
import {brandMotionScript,brandAccountScript,brandAccountCss,sharedCoreScript,commonMotionScript,sharedTemplates} from './product-ui/assets.gen.mjs';
import {brandPanelUiCss} from './order-engine/browser/brand-panel-ui.gen.mjs';
import {getProductPanelBootstrap} from './product-account-panels.mjs';
import {getProductAuthSheetBootstrap} from './product-auth-sheet.mjs';
import {notificationSettingsBootstrap,notificationSettingsCss} from './notification-settings-bootstrap.mjs';

const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inflate=async value=>new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
let styles;
export function productBootstrap(nonce,context,panels,authSheet){return `<script nonce="${nonce}">${sharedCoreScript}\n${commonMotionScript}\n${getProductUiBootstrap().script}\n${notificationSettingsBootstrap()}\n(${browserFunction(installProductAdapter)})(${js(context)});\n${panels?.script||''}\n${authSheet?.script||''}</script>`;}
export function injectProductContext(html,nonce,context,panels){
 return html.replace('</head>','<style>'+productFontCss+brandPanelUiCss+getProductUiBootstrap().css+notificationSettingsCss+(panels?.css||'')+'</style>'+productBootstrap(nonce,context,panels)+'</head>');
}
function bootProductDocument(screen,state,introArtSource,reviewLibrary=false){
 const root=document.getElementById('order-single'),adapter=window.ORDER_APP_ADAPTER;
 let currentState=state,authSheet=null;
 const announce=()=>window.parent?.postMessage({scope:'ORDER_PRODUCT_RUNTIME',type:'ready',runId:adapter?.context.runId,persona:adapter?.context.persona,documentId:adapter?.context.documentId,screen,state:currentState,payload:{path:location.pathname+location.search},componentVariant:document.documentElement.dataset.productComponentVariant||null,source:adapter?.context.source},location.origin);
 const status=text=>{let output=document.querySelector('[data-product-status]');if(!output){output=document.createElement('p');output.dataset.productStatus='';output.className='muted';output.setAttribute('role','status');root.append(output);}output.textContent=text;};
 const api={mode:'product',interactive:true,screen,variant:'email',adapter,brandAccount:window.ORDER_BRAND_ACCOUNT_CONTEXT,
  reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
  select(next,nextState,nextOptions={}){
   if(authSheet?.select(next,nextState,nextOptions))return;
   if(['simple-r3','detailed-r3'].includes(next)){
    const url=new URL(location.href);url.searchParams.set('view',next);url.searchParams.delete('screen');url.searchParams.delete('state');url.searchParams.delete('componentVariant');location.assign(url);return;
   }
   // Moving between the four introduction steps must keep the same header,
   // original CODE1 paths and account panel. Only the authored main/tray change.
   if(screen==='onboarding'&&next===screen&&/^(guest|member)-[1-4]$/.test(nextState||'')&&nextState.split('-')[0]===currentState.split('-')[0]){
    const module=window.ORDER_DESIGN_MODULES?.find(m=>m.id===screen);
    const next=document.createElement('template');next.innerHTML=module.render(nextState);
    const art=next.content.querySelector('[data-intro-art]');
    if(art&&typeof introArtSource==='string'&&introArtSource.startsWith('data:image/webp;base64,'))art.src=introArtSource;
    const event=new CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:nextState,markup:next.innerHTML}});
    root.dispatchEvent(event);
    if(event.defaultPrevented){currentState=nextState;api.localState(nextState);const url=new URL(location.href);url.searchParams.set('state',nextState);history.replaceState(null,'',url);announce();return;}
   }
   if(['admin-orders','admin-payments','customer-orders','order-detail','trade-documents'].includes(next)){next='store-purchase';nextState='select';}
   if(!(reviewLibrary&&next==='component-library')&&!['onboarding','login','signup','otp','password','terms','profile','account-settings','store-purchase','delivery-request','admin-shipments','supplier-shipments','admin-analytics','admin-revenue-rules','member-email-templates','business','proof','signature','receipt','admin-billing','admin-overview','drawer'].includes(next)){status('이 화면은 아직 제품 기능에 연결되지 않았어요. 기존 기록에서 설계를 검토할 수 있습니다.');return;}
   const url=new URL(location.href);url.searchParams.set('screen',next);url.searchParams.set('state',nextState||'default');if(next==='component-library'&&typeof nextOptions?.componentVariant==='string'&&/^[-\w]{1,100}$/.test(nextOptions.componentVariant))url.searchParams.set('componentVariant',nextOptions.componentVariant);else url.searchParams.delete('componentVariant');location.assign(url);
  },
  localState(next){document.documentElement.dataset.productState=next;},toast:status,
  // The original authoring API name is retained for old source compatibility.
  // It cannot invoke the fixture's completion callback in a product runtime.
  demoSuccess(){status('이 동작은 연결된 서버 기능이 필요해요. 완료 처리하지 않았습니다.');return Promise.resolve({ok:false,error:'PRODUCT_ADAPTER_REQUIRED'});}
 };
 if(screen==='onboarding')authSheet=window.ORDER_AUTH_SHEET?.attach(root,api,{getState:()=>currentState});
 const disposeShared=window.QAUI?.sharedMount?.(root,api);
 const module=window.ORDER_DESIGN_MODULES?.find(m=>m.id===screen);
 const dispose=window.ORDER_PRODUCT_UI?.mount(module,root,state,api)||module?.mount?.(root,state,api);
 if(!module)status('이 화면의 동작 연결을 준비하고 있어요.');
 const accountController=new AbortController();
 if(screen==='profile'){
  const container=root.querySelector('[data-account-menu-host]');
  if(container){window.ORDER_BRAND_ACCOUNT_CONTEXT.renderPanel({id:state==='notification'?'notifications':'profile.account',container,signal:accountController.signal});const actions=document.createElement('nav');actions.className='mf-actions';actions.innerHTML=window.QAUI.button('회원탈퇴','open-withdraw','secondary');actions.querySelector('button').onclick=()=>api.select('account-settings','withdraw');container.after(actions);}
 }
 window.addEventListener('pagehide',()=>{accountController.abort();authSheet?.dispose();dispose?.();disposeShared?.();},{once:true});
 announce();
}
export async function renderProductApplication(nonce,context,screen='store-purchase',state='default',variant='email',componentVariant=null){
 if(!/^[a-f0-9]{16,128}$/.test(nonce)||!/^[-\w]{1,100}$/.test(screen)||!/^[-\w]{1,100}$/.test(state))throw Error('INVALID_PRODUCT_ROUTE');
 if(context.actor?.authenticated===false&&!['onboarding','login','signup','otp','password','terms','common','drawer'].includes(screen)){screen='login';state='empty';}
 if(screen==='onboarding'){const step=/-([1-4])$/.exec(state)?.[1]||'1';state=(context.actor?.authenticated===false?'guest':'member')+'-'+step;}
 // Authentication completion is never selected by a URL or a historical state.
 if(['login','signup','otp'].includes(screen)&&!['empty','error','closed'].includes(state))state='empty';
 if(screen==='password'&&['success','done','sent','complete'].includes(state))state='request';
 if(screen==='account-settings'&&['default','normal'].includes(state)){screen='profile';state='default';}
 // Asset indexes and review-only component variants are served by the review adapter.
 if(componentVariant||screen==='component-library')return null;
 const workflowDefaults={business:'empty',proof:'empty',signature:'empty',receipt:'before','admin-billing':'draft','admin-overview':'normal',drawer:'info'};
 if(state==='default'&&workflowDefaults[screen])state=workflowDefaults[screen];
 let document=await getProductApplicationDocument(screen,state,variant);
 if(document)state=document.row.state;
 if(!document){
  // Authored entry surfaces below connect to the real workflow adapter at mount.
  // Orders, approvals, completed signatures and analytics require their own
  // product adapter; an authored example is never a fallback for a real URL.
  const pureStates={onboarding:/^(guest|member)-[1-4]$/,login:/^(empty|error|closed)$/,signup:/^(empty|error|closed)$/,otp:/^(empty|error|closed)$/,password:/^(request|empty|error|strong|weak|mismatch)$/,profile:/^(default|notification|empty|menu|restricted)$/,terms:/^(required|privacy|optional|missing|withdraw|default)$/,business:/^empty$/,proof:/^(empty|error|format|oversize|blocked)$/,signature:/^(empty|missing)$/,receipt:/^(before|error)$/,'admin-billing':/^(draft|error)$/,'admin-overview':/^(normal|empty|error)$/,drawer:/^(closed|info|booking)$/};
  if(!pureStates[screen]?.test(state))return null;
  const row=catalog.find(r=>r.screen===screen&&r.state===state&&r.variant===variant)||catalog.find(r=>r.screen===screen&&r.variant===variant)||catalog.find(r=>r.screen===screen);
  if(!row)return null;
  const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
  document={body:await inflate(frames[row.current]),mount:runtimes[row.runtimeFamily||fallback[row.screen]]||'',css:'',row};state=row.state;
 }
 if(screen==='onboarding')document={...document,mount:onboardingCardResizeSource(document.mount)};
 return renderProductUiDocument(nonce,context,document);
}

// A caller can compose an independently owned document with the same product
// transport and UI lifetime. The product renderer never imports that caller.
export async function renderProductUiDocument(nonce,context,document,{reviewLibrary=false}={}){
 if(!document?.row||typeof document.body!=='string')return null;
 const {screen,state}=document.row;
 if(!/^[a-f0-9]{16,128}$/.test(nonce)||!/^[-\w]{1,100}$/.test(screen)||!/^[-\w]{1,100}$/.test(state))throw Error('INVALID_PRODUCT_ROUTE');
 styles??=inflate(cssGzip);const [css,panels,authSheet]=await Promise.all([styles,getProductPanelBootstrap(),screen==='onboarding'?getProductAuthSheetBootstrap():null]);
 // Authored families register their retained modules and may carry an earlier
 // global menu factory. Install the current common owner after registration,
 // before any consumer mounts, without rewriting those historical runtimes.
 return '<!doctype html><html lang="ko" data-product-runtime="canonical" data-product-screen="'+esc(screen)+'"'+(document.componentVariantId?' data-product-component-variant="'+esc(document.componentVariantId)+'"':'')+'><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(document.row.label)+' · Order</title><style>'+productFontCss+css+(document.css||'')+brandPanelUiCss+brandAccountCss+getProductUiBootstrap().css+notificationSettingsCss+panels.css+(authSheet?.css||'')+(screen==='onboarding'?onboardingGooeyCss:'')+'\nbody{margin:0;min-height:100dvh}#order-single{min-height:100dvh;max-width:100%;overflow-x:clip}</style>'+productBootstrap(nonce,context,panels,authSheet)+'</head><body>'+document.body+'<script nonce="'+nonce+'">'+brandMotionScript+'\n'+document.mount+'\n'+brandAccountScript+'\n'+sharedCoreScript+'\n('+browserFunction(bootProductDocument)+')('+js(screen)+','+js(state)+','+js(screen==='onboarding'?sharedTemplates.introArtSource||null:null)+','+js(reviewLibrary)+');</script></body></html>';
}
