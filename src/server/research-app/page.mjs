import {catalog,frames,cssGzip} from '../product-ui/catalog.gen.mjs';
import {productFontCss} from '../product-fonts.mjs';
import {runtimes} from '../product-ui/runtime.gen.mjs';
import {getProductApplicationDocument,getProductDocuments} from '../product-ui/documents.mjs';
import {getProductUiBootstrap} from '../product-ui/bootstrap.gen.mjs';
import {getProductPanelBootstrap} from '../product-account-panels.mjs';
import {getProductAuthSheetBootstrap} from '../product-auth-sheet.mjs';
import {sharedCoreScript,commonMotionScript,brandMotionScript,brandAccountScript,sharedTemplates} from '../product-ui/assets.gen.mjs';
import {productAccountAdapterSource} from '../product-app-context-adapter.mjs';
import {installQaFixtureAdapter} from '../r3-ui/qa-fixture-adapter.mjs';
import {browserFunction} from '../browser-source.mjs';
import {r3ProductAsset} from '../r3-product-page.mjs';
import {quoteFiles} from '../r3-product-sources.mjs';
import {regularContactModuleSource,regularServiceSourceIdentity} from './regular-service-assets.mjs';
import {regularIanaReferenceJson} from './regular-iana-reference.mjs';
import {getResearchQuoteSource,getResearchQuoteMarkup,getResearchQuoteStyleSource,getResearchQuoteIntegrationSource} from './quote-source-adapter.mjs';
import {researchQuoteResultMarkup} from './quote-preview.mjs';
import {createResearchEnvironment} from './environment.mjs';
import {researchRoute} from './routes.mjs';
import {researchQuoteCss} from './quote-style.mjs';
import {researchAssets,researchBuild} from './assets.gen.mjs';
import {getResearchInspectorPanelsModule,getResearchPinProjectionModule} from './inspector-panels-source.mjs';
import {researchSceneSource} from './scene-source-adapter.mjs';
import {getResearchBusinessPanelSource} from './business-panel-source.mjs';
import {researchAuthSheetSource} from './auth-sheet-source.mjs';
import {researchInputMotionSource} from './input-polish-source.mjs';
import {researchBrandSource} from './brand-source-adapter.mjs';
import {researchOnboardingMarkup,researchOnboardingCss} from './onboarding-polish.mjs';
import {researchInteractionCss} from './interaction-polish.mjs';
import {researchAuthPolishCss} from './auth-polish.mjs';
import {researchNotificationsCss} from './notifications-style.mjs';
import {researchNotificationFixtureSource} from './notification-fixture-source.mjs';
import {researchOrderMenuCss} from './order-menu.mjs';
import {getPriceWorkspaceQaDocuments} from '../r3-price-workspace-qa.mjs';
import {getResearchPriceModuleSource} from './price-source-adapter.mjs';
import {RESEARCH_RELEASE_WIDTHS,readResearchRelease,serveResearchReleaseAsset,renderResearchReleaseApplication,findResearchReleaseTarget,hasResearchRelease,researchReviewIdentity,researchReviewMode} from './release-store.mjs';

const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inflate=async value=>new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export {researchBuild};
export const researchAssetBase='/ia/research-assets/'+researchBuild.digest+'/';
// The campaign family is explicitly part of the MVP navigation. Preserve its
// historical phase metadata while composing its actual product routes here.
// Removed on the current review request. The sealed earlier releases remain
// addressable so feedback can still reopen the exact document it was made on.
export const isRetiredResearchRow=row=>Boolean(row&&(row.screen==='quote-review'||row.screen==='quote-result'&&['new-only-detail','no-current'].includes(row.state)));
export const isResearchRow=row=>Boolean(row&&!isRetiredResearchRow(row)&&(row.phase!=='future'||row.screen==='admin-campaigns')&&!['component-library','common'].includes(row.screen));
const staticCache=new Map(),scenes=new Map();let styles;
const response=(body,type='text/javascript; charset=utf-8',status=200)=>new Response(body,{status,headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Order-Research-Build':researchBuild.digest}});
const fallbackFamily=screen=>['login','signup','otp','password','terms'].includes(screen)?'accountFeedback':['business','proof','signature'].includes(screen)?'business':screen.startsWith('admin-')||screen==='receipt'?'adminCommon':'member';
const notificationRow=Object.freeze({id:'notifications/list/email',screen:'notifications',state:'list',variant:'email',group:'내 견적·메뉴',label:'알림',stateLabel:'전체 알림',defaultWidth:390,role:'customer',phase:'current',runtimeFamily:'researchNotifications',supplemental:true});
export const researchNativeRows=Object.freeze([notificationRow]);
let runtimeSources;
async function researchRuntime(family){
  if(!runtimeSources)runtimeSources=new Map();if(runtimeSources.has(family))return runtimeSources.get(family);
  const promise=(async()=>{
    const mount=family==='product'?(await getProductApplicationDocument('store-purchase','select')).mount:runtimes[family];
    if(typeof mount!=='string')return null;
    const screen=family==='onboarding'?'onboarding':family==='sharedQuoteResult'?'quote-result':family;
    return researchSceneSource(screen,mount);
  })();runtimeSources.set(family,promise);return promise;
}
export async function listResearchRows(){
  const {rows}=await getProductDocuments(),pricing=await getPriceWorkspaceQaDocuments(),byId=new Map([...catalog,...rows,...pricing.map(document=>document.row)].map(row=>[row.id,row]));
  const purchase=byId.get('store-purchase/select/email');
  byId.set(notificationRow.id,notificationRow);
  for(const [state,fixture]of [['qa-loading',{scenario:'loading'}],['qa-error',{scenario:'error'}],['qa-empty',{scenario:'empty'}],['qa-guest',{authenticated:false}]])byId.set('store-purchase/'+state+'/email',{...purchase,id:'store-purchase/'+state+'/email',state,fixture});
  return [...byId.values()].filter(isResearchRow);
}
export async function listResearchAssetPaths(){
  const rows=await listResearchRows();
  return [...new Set([...Object.keys(researchAssets),...Object.keys(quoteFiles),'extension/brand-account-menu.mjs','bridge/contact-ui.mjs','bridge/business-directory.mjs','research/bootstrap.js','research/application.css','research/quote-document.html','research/quote-integrations.mjs','research/price-integrations.mjs','research/inspector-panels.mjs',...['product',...Object.keys(runtimes)].map(family=>'runtime/'+family+'.mjs'),...rows.filter(row=>row.screen!=='price-workspace').map(row=>'scene/'+row.id+'.mjs')])].sort();
}

export async function researchScene(screen,state='default',variant='email'){
  if(screen==='notifications'&&['list','default'].includes(state)&&variant==='email')return {row:notificationRow,html:'<section class="research-notifications" aria-label="알림"></section>',family:'researchNotifications',mount:'',css:''};
  const key=[screen,state,variant].join('/');if(scenes.has(key))return scenes.get(key);
  const source=(async()=>{
    let document=await getProductApplicationDocument(screen,state.startsWith('qa-')?'default':state,variant),family=document?'product':null;
    if(!document){
      const row=catalog.find(row=>row.screen===screen&&row.state===state&&row.variant===variant)||catalog.find(row=>row.screen===screen&&row.state===state)||catalog.find(row=>row.screen===screen);
      if(!row)return null;
      family=row.runtimeFamily||fallbackFamily(screen);document={row,body:await inflate(frames[row.current]),mount:runtimes[family]||'',css:''};
    }
    return {row:document.row,html:screen==='onboarding'?researchOnboardingMarkup(document.body):screen==='quote-result'?await researchQuoteResultMarkup(document.body):document.body,family,mount:await researchRuntime(family),css:document.css||''};
  })();scenes.set(key,source);return source;
}
export async function serveResearchAsset(path,env,origin='https://order-ia-portal.pages.dev'){
  const match=/^\/ia\/research-assets\/([a-f0-9]{64})\/(.+)$/.exec(path);
  if(!match||match[2].includes('..')||match[2].includes('%'))return response('Research build not available.','text/plain; charset=utf-8',404);
  // Production and replay must read the same sealed bytes. In particular,
  // Worker bundling can change functions serialized by the raw generators.
  // The no-environment path is reserved for collecting those source bytes.
  if(match[1]!==researchBuild.digest||env!==undefined&&hasResearchRelease(match[1])){const saved=hasResearchRelease(match[1])?await readResearchRelease(match[1],env,origin):null;return saved?serveResearchReleaseAsset(saved,match[2]):response('Research build not available.','text/plain; charset=utf-8',404);}
  const name=match[2];if(staticCache.has(name))return response(await staticCache.get(name));
  let body,type='text/javascript; charset=utf-8';
  if(name==='r3-ui/pin-projection.mjs')body=getResearchPinProjectionModule();
  else if(Object.hasOwn(researchAssets,name)){body=await inflate(researchAssets[name]);if(name==='order-engine/browser/brand-account-menu.mjs')body=researchBrandSource(body);}
  else if(name==='research/bootstrap.js')body=(await researchFoundation()).script;
  else if(name==='research/application.css'){body=(await researchFoundation()).css;type='text/css; charset=utf-8';}
  else if(name==='research/inspector-panels.mjs')body=getResearchInspectorPanelsModule();
  else if(name==='bridge/contact-ui.mjs')body=await regularContactModuleSource();
  else if(name==='bridge/business-directory.mjs')body=await getResearchBusinessPanelSource();
  else if(name==='assets/iana-reference.json'){body=regularIanaReferenceJson;type='application/json; charset=utf-8';}
  else if(name==='research/quote-document.html'){body=await getResearchQuoteMarkup();type='text/html; charset=utf-8';}
  else if(name==='research/quote-integrations.mjs')body=getResearchQuoteIntegrationSource();
  else if(name==='research/price-integrations.mjs')body=await getResearchPriceModuleSource();
  else if(/^runtime\/[\w-]+\.mjs$/.test(name)){
    const mount=await researchRuntime(name.slice(8,-4));if(mount===null)return response('Unknown runtime.','text/plain; charset=utf-8',404);
    body='const previous=window.ORDER_DESIGN_MODULES;window.ORDER_DESIGN_MODULES=[];let registered;try{\n'+mount+'\nregistered=window.ORDER_DESIGN_MODULES.slice();}finally{window.ORDER_DESIGN_MODULES=previous;}\nexport const modules=registered;';
  }
  else if(/^scene\/[\w-]+\/[\w-]+\/[\w-]+\.mjs$/.test(name)){
    const [screen,state,variant]=name.slice(6,-4).split('/'),scene=await researchScene(screen,state,variant);if(!scene)return response('Unknown application route.','text/plain; charset=utf-8',404);
    body=(scene.family==='researchNotifications'?'export const modules=[];':'export {modules} from "'+researchAssetBase+'runtime/'+scene.family+'.mjs";')+'export const scene='+js({screen:scene.row.screen,state:scene.row.state,html:scene.html,styles:scene.css?[scene.css]:[]})+';';
  }else{
    const original=r3ProductAsset('/ia/r3-product/'+name);if(!original.ok)return response('Unknown application asset.','text/plain; charset=utf-8',404);
    body=await original.text();type=original.headers.get('Content-Type')||type;
    if(name.endsWith('.mjs'))body=getResearchQuoteSource(name,body);
    else if(name.endsWith('.css'))body=getResearchQuoteStyleSource(name,body);
  }
  // Versioned URLs fail closed after a build changes. An old artifact never
  // silently downloads newer JavaScript under its original source identity.
  body=body.replace(/\/ia\/research-assets\/(?![a-f0-9]{64}\/)/g,researchAssetBase);
  if(type.startsWith('text/javascript'))staticCache.set(name,Promise.resolve(body));
  return response(body,type);
}

export const researchApplicationCss=String.raw`
html,body{margin:0;min-height:100%;background:#fff}body{overflow-x:clip}#order-single{min-height:100dvh;width:100%;max-width:none;overflow:visible}#order-app-header{height:78px;box-sizing:border-box;padding:0 26px;display:flex;align-items:center;gap:12px;position:relative;z-index:60;background:white}#order-app-header [data-app-brand]{flex:1;min-width:0}#order-app-header [data-app-auth]{flex:none;background:transparent;border:0;font-family:inherit;font-size:14px;font-weight:500;line-height:1.5;min-height:44px;padding:0;color:inherit}#order-app-header [data-app-back]{height:40px;width:28px;padding:0;border:0;background:transparent;font-size:24px}#order-app-header [hidden],#order-app-page[hidden],#order-app-quote[hidden],#order-app-pricing[hidden]{display:none!important}#order-app-status{margin:12px 26px;padding:12px;border-radius:12px;background:#f2f5fb;color:#415675;font-size:14px;line-height:1.5}#order-app-page{min-height:calc(100dvh - 78px)}#order-app-page>.qa-screen{min-height:calc(100dvh - 78px);max-width:100%;width:100%}#order-app-page .ob-stage{min-height:calc(100dvh - 78px);grid-template-rows:minmax(410px,1fr) auto 74px}#order-app-page .ob-main{padding-top:36px}#order-app-page .mf-wait{min-height:calc(100dvh - 78px)}#order-app-page [data-order-result] .oq-brand{display:none}#order-app-page .page-head:empty{display:none}#order-app-quote,#order-app-pricing{min-height:calc(100dvh - 78px)}.research-drawer{position:fixed;inset:0;z-index:90;pointer-events:none}.research-drawer .drawer-scene{position:static;min-height:0}.research-drawer .drawer-dim{position:fixed;inset:0;pointer-events:auto}.research-drawer .functional-drawer{position:fixed;inset:auto 0 0;max-height:85dvh;overflow:auto;pointer-events:auto}.research-drawer .consult-tickets{max-height:25dvh;overflow:auto}.research-drawer [hidden]{display:none!important}@media(min-width:768px){#order-app-header{padding-inline:max(28px,calc((100vw - 960px)/2))}#order-app-page>.qa-screen>.page:not(.ops-page){max-width:960px;margin-inline:auto}}
`;

let foundation;
function researchFoundation(){return foundation??=(async()=>{
  styles??=inflate(cssGzip);const [css,panels,auth]=await Promise.all([styles,getProductPanelBootstrap(),getProductAuthSheetBootstrap()]);
  return {css:productFontCss+css+getProductUiBootstrap().css+panels.css+auth.css+researchApplicationCss+researchQuoteCss+researchOnboardingCss+researchInteractionCss+researchAuthPolishCss+researchNotificationsCss+researchOrderMenuCss,
    script:sharedCoreScript+'\n'+commonMotionScript+'\n'+brandMotionScript+'\n'+brandAccountScript+'\n'+researchInputMotionSource(getProductUiBootstrap().script)+'\n'+panels.script+'\n'+researchAuthSheetSource(auth.script)+'\nwindow.ORDER_CREATE_RESEARCH_ENV=config=>('+browserFunction(createResearchEnvironment)+')(config,('+researchNotificationFixtureSource(browserFunction(installQaFixtureAdapter))+'),('+productAccountAdapterSource()+'));'};
})();}

export async function renderResearchApplication(nonce,parameters=new URLSearchParams(),env,origin='https://order-ia-portal.pages.dev',labContext=null){
  if(parameters.has('mode'))researchReviewMode(parameters.get('mode'));
  const build=parameters.get('build')||researchBuild.digest,current=build===researchBuild.digest;
  const accountRun=labContext&&current&&parameters.get('version')!=='recorded'&&parameters.get('inspect')!=='1'?labContext:null;
  if(!current||env!==undefined&&hasResearchRelease(build)){
    const saved=hasResearchRelease(build)?await readResearchRelease(build,env,origin):null;if(!saved)throw Object.assign(Error('RESEARCH_BUILD_NOT_FOUND'),{status:404});
    const target=new URLSearchParams(parameters);
    if(current){const route=researchRoute(Object.fromEntries(['screen','state','variant','mode'].map(key=>[key,parameters.get(key)])));for(const key of ['screen','state','variant','mode'])target.set(key,route[key]);}
    return renderResearchReleaseApplication(saved,nonce,target,{inspectionVersion:current&&parameters.get('version')!=='recorded'?'current':'recorded',currentBuild:researchBuild.digest,accountRun});
  }
  const initial=researchRoute(Object.fromEntries(['screen','state','variant','mode'].map(key=>[key,parameters.get(key)])));
  const inspect=parameters.get('inspect')==='1',channel=parameters.get('channel'),artifact=parameters.get('artifact'),width=Number(parameters.get('width')||390);
  if(inspect){
    const id=[initial.screen,initial.state,initial.variant].join('/'),row=(await listResearchRows()).find(value=>value.id===id);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(channel||'')||!RESEARCH_RELEASE_WIDTHS.includes(width)||!row||artifact!==await researchArtifactHash(row,width,initial.mode))throw TypeError('INVALID_RESEARCH_INSPECTION');
  }
  const config={...(accountRun?{accountRun}:{}),build:researchBuild.digest,assetBase:researchAssetBase,initial,inspect,inspection:inspect?{channel,artifact,screen:initial.screen,state:initial.state,variant:initial.variant,viewport:width,version:parameters.get('version')==='recorded'?'recorded':'current',...(initial.mode==='detailed'?{mode:'detailed'}:{})}:null};
  return '<!doctype html><html lang="ko" data-product-runtime="research-application" data-product-build="'+researchBuild.digest+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Order · 연구본</title><link rel="stylesheet" href="'+researchAssetBase+'research/application.css"><script nonce="'+esc(nonce)+'" src="'+researchAssetBase+'research/bootstrap.js"></script></head><body><main id="order-single" class="ds" data-research-application><header id="order-app-header"><button data-app-back type="button" aria-label="이전 화면" hidden>‹</button><div data-app-brand></div><button data-app-auth type="button">회원가입</button></header><p id="order-app-status" role="status" hidden></p><section id="order-app-page"></section><section id="order-app-quote" hidden></section><section id="order-app-pricing" hidden></section></main><script type="application/json" id="order-app-config">'+js(config)+'</script><script type="module" nonce="'+esc(nonce)+'">import {mountResearchApplication} from "'+researchAssetBase+'research/application.mjs";const config=JSON.parse(document.getElementById("order-app-config").textContent);try{const app=await mountResearchApplication(config,window.ORDER_CREATE_RESEARCH_ENV(config));if(config.inspect){const {attachResearchReview}=await import("'+researchAssetBase+'research/review-bridge.mjs");await attachResearchReview(app,config);}}catch(error){const status=document.getElementById("order-app-status");status.hidden=false;status.textContent="화면을 불러오지 못했어요. 새로고침 후 다시 확인해 주세요.";console.error(error);}</script></body></html>';
}

export async function researchArtifactHash(row,width,mode='simple'){return sha(JSON.stringify(researchReviewIdentity(researchBuild.digest,row.id,width,mode)));}
export async function researchArtifact(row,width,env,origin='https://order-ia-portal.pages.dev',mode='simple'){
  const hash=await researchArtifactHash(row,width,mode),url=new URL('/ia','https://order.invalid');url.search=new URLSearchParams({view:'research-r3',screen:row.screen,state:row.state,variant:row.variant,mode,build:researchBuild.digest});
  const provenance=await regularServiceSourceIdentity();
  const source={kind:'research-application',build:researchBuild.digest,productSource:researchBuild.sources,regular:provenance,environment:'research-fixture',ownership:'application',promotion:'same-build'};
  const html=await renderResearchApplication('0123456789abcdef0123456789abcdef',url.searchParams,env,origin);
  const editable=html.replace('</body>','<script type="application/json" id="frame-meta">'+js({format:'order-research-route/v1',source,route:{screen:row.screen,state:row.state,variant:row.variant,...(mode==='detailed'?{mode}:{})},viewport:width,hash})+'</script></body>');
  return {release:'MSG0585-R3',version:'current',hash,viewport:width,...(mode==='detailed'?{mode}:{}),...(row.fixture?{fixture:row.fixture}:{}),application:{url:url.pathname+url.search,build:researchBuild.digest},source,
    html,editable,exportHash:await sha(editable),file:'ORDER_research_'+row.id.replaceAll('/','_')+'_'+(mode==='detailed'?'detailed_':'')+width+'.html'};
}

export async function archivedResearchTarget(target){return findResearchReleaseTarget({rowId:[target.screen,target.state,target.variant].join('/'),width:target.viewport,hash:target.artifactHash,mode:target.mode});}
export async function archivedResearchArtifact(rowId,width,hash,env,origin,mode='simple'){
  const target=await findResearchReleaseTarget({rowId,width,hash,mode});if(!target)return null;
  const saved=await readResearchRelease(target.build,env,origin),row=saved.rows.find(value=>value.id===target.row.id);
  if(!row)throw Object.assign(Error('RESEARCH_RELEASE_ROW_NOT_FOUND'),{status:503});
  const parameters=new URLSearchParams({view:'research-r3',build:target.build,screen:row.screen,state:row.state,variant:row.variant,mode,version:'recorded'});
  const html=await renderResearchReleaseApplication(saved,'a'.repeat(36),parameters),source={kind:'research-application',build:target.build,productSource:saved.build.sources,environment:'research-fixture',archived:true};
  const editable=html.replace('</body>','<script type="application/json" id="frame-meta">'+js({source,hash,viewport:width,route:row.id,...(mode==='detailed'?{mode}:{})})+'</script></body>');
  return {release:'MSG0585-R3',version:'recorded',hash,viewport:width,...(mode==='detailed'?{mode}:{}),application:{url:'/ia?'+parameters,build:target.build},source,archivedSource:{epoch:'research-'+target.build},html,editable,exportHash:await sha(editable),file:'ORDER_research_'+row.id.replaceAll('/','_')+'_'+(mode==='detailed'?'detailed_':'')+width+'.html'};
}
