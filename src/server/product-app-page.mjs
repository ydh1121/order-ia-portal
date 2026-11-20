import {catalog,frames,cssGzip} from './r3-ui/catalog.gen.mjs';
import {runtimes} from './r3-ui/runtime.gen.mjs';
import {getQaApplicationDocument} from './r3-qa-assets.mjs';
import {browserFunction} from './browser-source.mjs';
import {installProductAdapter} from './product-app-adapter.mjs';
import {brandMotionScript,brandAccountScript,brandAccountCss,sharedCoreScript,commonMotionScript} from './r3-ui/qa-assets.gen.mjs';
import {brandPanelUiCss} from './order-engine/browser/brand-panel-ui.gen.mjs';

const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inflate=async value=>new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
let styles;
export function productBootstrap(nonce,context){return `<script nonce="${nonce}">${sharedCoreScript}\n${commonMotionScript}\n(${browserFunction(installProductAdapter)})(${js(context)});</script>`;}
export function injectProductContext(html,nonce,context){
 return html.replace('</head>','<style>'+brandPanelUiCss+'</style>'+productBootstrap(nonce,context)+'</head>');
}
function bootProductDocument(screen,state){
 const root=document.getElementById('order-single'),adapter=window.ORDER_APP_ADAPTER;
 const status=text=>{let output=document.querySelector('[data-product-status]');if(!output){output=document.createElement('p');output.dataset.productStatus='';output.className='muted';output.setAttribute('role','status');root.append(output);}output.textContent=text;};
 const api={mode:'product',interactive:true,screen,variant:'email',adapter,brandAccount:window.ORDER_BRAND_ACCOUNT_CONTEXT,
  reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
  select(next,nextState){
   if(['admin-orders','admin-payments','customer-orders','order-detail','receipt','trade-documents'].includes(next)){next='store-purchase';nextState='select';}
   if(!['onboarding','login','signup','otp','password','terms','profile','account-settings','store-purchase','delivery-request','admin-shipments','supplier-shipments','admin-analytics','admin-revenue-rules','member-email-templates','component-library'].includes(next)){status('이 화면은 아직 제품 기능에 연결되지 않았어요. 기존 기록에서 설계를 검토할 수 있습니다.');return;}
   const url=new URL(location.href);url.searchParams.set('screen',next);url.searchParams.set('state',nextState||'default');location.assign(url);
  },
  localState(next){document.documentElement.dataset.productState=next;},toast:status,
  // The original authoring API name is retained for old source compatibility.
  // It cannot invoke the fixture's completion callback in a product runtime.
  demoSuccess(){status('이 동작은 연결된 서버 기능이 필요해요. 완료 처리하지 않았습니다.');return Promise.resolve({ok:false,error:'PRODUCT_ADAPTER_REQUIRED'});}
 };
 const disposeShared=window.QAUI?.sharedMount?.(root,api);
 const module=window.ORDER_DESIGN_MODULES?.find(m=>m.id===screen);
 const dispose=module?.mount?.(root,state,api);
 if(!module)status('이 화면의 동작 연결을 준비하고 있어요.');
 const accountController=new AbortController();
 if(screen==='profile'){
  const container=root.querySelector('[data-account-menu-host]');
  if(container){window.ORDER_BRAND_ACCOUNT_CONTEXT.renderPanel({id:state==='notification'?'notifications':'profile.account',container,signal:accountController.signal});const actions=document.createElement('nav');actions.className='mf-actions';actions.innerHTML=window.QAUI.button('회원탈퇴','open-withdraw','secondary');actions.querySelector('button').onclick=()=>api.select('account-settings','withdraw');container.after(actions);}
 }
 window.addEventListener('pagehide',()=>{accountController.abort();dispose?.();disposeShared?.();},{once:true});
 window.parent?.postMessage({scope:'ORDER_PRODUCT_RUNTIME',type:'ready',runId:adapter?.context.runId,persona:adapter?.context.persona,documentId:adapter?.context.documentId,screen,state,source:adapter?.context.source},location.origin);
}
export async function renderProductApplication(nonce,context,screen='store-purchase',state='default',variant='email'){
 if(!/^[a-f0-9]{16,128}$/.test(nonce)||!/^[-\w]{1,100}$/.test(screen)||!/^[-\w]{1,100}$/.test(state))throw Error('INVALID_PRODUCT_ROUTE');
 if(context.actor?.authenticated===false&&!['onboarding','login','signup','otp','password','terms','common','drawer'].includes(screen)){screen='login';state='empty';}
 if(screen==='onboarding'){const step=/-([1-4])$/.exec(state)?.[1]||'1';state=(context.actor?.authenticated===false?'guest':'member')+'-'+step;}
 // Authentication completion is never selected by a URL or a historical state.
 if(['login','signup','otp'].includes(screen)&&!['empty','error','closed'].includes(state))state='empty';
 if(screen==='password'&&['success','done','sent','complete'].includes(state))state='request';
 if(screen==='account-settings'&&['default','normal'].includes(state)){screen='profile';state='default';}
 let document=await getQaApplicationDocument(screen,state,variant);
 if(document)state=document.row.state;
 if(!document){
  // Only these source-only surfaces are safe without a business projection.
  // Orders, approvals, completed signatures and analytics require their own
  // product adapter; an authored example is never a fallback for a real URL.
  const pureStates={onboarding:/^(guest|member)-[1-4]$/,login:/^(empty|error|closed)$/,signup:/^(empty|error|closed)$/,otp:/^(empty|error|closed)$/,password:/^(request|empty|error|strong|weak|mismatch)$/,profile:/^(default|notification|empty|menu|restricted)$/,terms:/^(required|optional|withdraw|default)$/};
  if(!pureStates[screen]?.test(state))return null;
  const row=catalog.find(r=>r.screen===screen&&r.state===state&&r.variant===variant)||catalog.find(r=>r.screen===screen&&r.variant===variant)||catalog.find(r=>r.screen===screen);
  if(!row)return null;
  const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
  document={body:await inflate(frames[row.current]),mount:runtimes[row.runtimeFamily||fallback[row.screen]]||'',css:'',row};state=row.state;
 }
 styles??=inflate(cssGzip);const css=await styles;
 return '<!doctype html><html lang="ko" data-product-runtime="canonical" data-product-screen="'+esc(screen)+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(document.row.label)+' · Order</title><style>'+css+(document.css||'')+brandAccountCss+'\nbody{margin:0;min-height:100dvh}#order-single{min-height:100dvh;max-width:100%;overflow-x:clip}</style>'+productBootstrap(nonce,context)+'</head><body>'+document.body+'<script nonce="'+nonce+'">'+brandMotionScript+'\n'+brandAccountScript+'\n'+document.mount+'\n('+browserFunction(bootProductDocument)+')('+js(screen)+','+js(state)+');</script></body></html>';
}
