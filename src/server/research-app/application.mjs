import {createOrderBrand,mountOrderBrandElement} from '../order-engine/browser/brand.mjs';
import {createRegularServices} from './regular-services.mjs';
import {mountResearchQuote} from './quote-workspace.mjs';
import {mountResearchPriceWorkspace} from './price-workspace.mjs';
import {researchRoute,researchRouteUrl,AUTH_ROUTES,QUOTE_ROUTES} from './routes.mjs';
import {mountResearchAccountPanel} from './account-panels.mjs';
import {mountResearchBusinessPanel} from './business-panel.mjs';
import {mountResearchScenePanel} from './scene-panels.mjs';
import {mountResearchDrawer} from './drawer.mjs';
import {createResearchQuoteRepository} from './quote-repository.mjs';
import {mountResearchSavedQuotePanel} from './saved-quote-panel.mjs';
import {mountResearchArrowMotion} from './interaction-polish.mjs';
import {mountResearchNotifications} from './notifications.mjs';
import {installResearchWorkflowPolish} from './workflow-polish.mjs';
import {installResearchPasses} from './passes.mjs';
import {mountResearchOrderMenu} from './order-menu.mjs';

/** One document, one application session and one header. The review tool is an
 * optional observer; this application also runs without any parent frame. */
export async function mountResearchApplication(config, environment) {
  const doc=environment.document||document, win=doc.defaultView, root=doc.getElementById('order-single');
  if(!root||root.__researchApplication)throw Error('RESEARCH_APPLICATION_ROOT');
  const controller=new win.AbortController(), signal=controller.signal, instance=win.crypto.randomUUID();
  const header=doc.getElementById('order-app-header'), page=doc.getElementById('order-app-page'), quote=doc.getElementById('order-app-quote'), pricing=doc.getElementById('order-app-pricing');
  const status=doc.getElementById('order-app-status'), modules=new Map(), scenePromises=new Map(), fields=new Map(), brandListeners=new Set();
  const arrowMotion=mountResearchArrowMotion(doc,{signal});
  const workflowPolish=installResearchWorkflowPolish(win),releasePasses=installResearchPasses(win);
  let route=researchRoute(config.initial), pageRoute=null, epoch=0, pageDispose=null, sharedDispose=null, workspace=null, priceWorkspace=null, brandMenu=null, authSheet=null, drawerDispose=null, disposed=false,started=false,reviewSelecting=false,fixtureSelecting=false,navigating=0,activeAccountPanel=null,authReturn=null;
  const notify=text=>{status.textContent=String(text||'');status.hidden=!text;};
  const assetUrl=path=>config.assetBase+path;
  const loadScene=async r=>{
    const key=[r.screen,r.state,r.variant].join('/');
    if(!scenePromises.has(key))scenePromises.set(key,(environment.loadScene?environment.loadScene(r):import(assetUrl('scene/'+key+'.mjs'))).then(source=>{
      for(const module of source.modules||[])modules.set(module.id,module);
      return {...source.scene,module:(source.modules||[]).find(module=>module.id===source.scene.screen)};
    }).catch(error=>{scenePromises.delete(key);throw error;}));
    return scenePromises.get(key);
  };
  const services=await createRegularServices({document:doc,origin:win.location.origin,fetcher:environment.fetcher||win.fetch.bind(win),...environment.regular});
  const releaseRegular=services.installRegularGlobals(win);
  const repository=await createResearchQuoteRepository({window:win,namespace:environment.namespace||'research',storage:environment.quoteStorage,loadModule:environment.loadQuoteStorageModule});
  const adapter=await environment.createAdapter({initial:route,navigate:destination=>navigatePanelDestination(destination),signal});
  const context=adapter.context||win.ORDER_APP_CONTEXT||{};
  const authenticated=()=>context.actor?.authenticated===true;
  const emit=()=>{
    doc.documentElement.dataset.productScreen=route.screen;doc.documentElement.dataset.productState=route.state;
    doc.documentElement.dataset.productBuild=config.build;root.dataset.applicationInstance=instance;
    win.dispatchEvent(new win.CustomEvent('order:research-route',{detail:{...route,build:config.build,instance,origin:reviewSelecting?'review':'application'}}));
  };
  function updateLocation(replace=false){const url=researchRouteUrl(route,win.location.href);win.history[replace?'replaceState':'pushState']({research:true,route},'',url);}
  function localState(state){if(typeof state!=='string'||state===route.state)return;route={...route,state};updateLocation(true);emit();}
  async function performAction(action,detail={}){
    const scope=detail.root||root, validations=[];
    for(const [input,field] of fields)if(scope.contains(input)&&!input.disabled&&!input.readOnly)validations.push(field.validate());
    const checked=await Promise.all(validations);
    if(checked.some(result=>result?.valid===false||result?.ok===false))return {confirmed:false,error:'INVALID_CONTACT'};
    if(!environment.auth?.perform){notify('이메일 발송·인증 서버가 아직 연결되지 않았어요. 입력은 그대로 유지됩니다.');return {confirmed:false,error:'AUTH_PROVIDER_UNAVAILABLE'};}
    const response=await environment.auth.perform(action,{...detail,signal,services,adapter});
    if(response?.confirmed!==true)return {...response,confirmed:false};
    await adapter.refreshSession?.();refreshBrand();return response;
  }
  const api={mode:'product',interactive:true,adapter,variant:'email',get screen(){return route.screen;},get reviewScenario(){return fixtureSelecting;},get brandAccount(){return win.ORDER_BRAND_ACCOUNT_CONTEXT;},applicationHeader:{element:header,get menu(){return brandMenu;},subscribe(listener){brandListeners.add(listener);if(brandMenu)listener(brandMenu.inspect());return()=>brandListeners.delete(listener);}},signal,
    reduced:()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches,select:(screen,state,options={})=>{
      const destination=screen==='onboarding'&&route.kind==='auth'&&authenticated()&&authReturn?authReturn:screen==='onboarding'&&route.kind==='auth'&&route.parent?.screen!=='onboarding'?route.parent:{screen,state,...options};
      return navigate(destination);
    },
    localState,toast:notify,performAction,demoSuccess(){notify('연결된 서비스의 응답을 확인하지 못했어요.');return Promise.resolve({confirmed:false,error:'SERVICE_UNCONNECTED'});}};
  const originalBrandContext=win.ORDER_BRAND_ACCOUNT_CONTEXT||{};
  const panelTitles={'account-settings':'계정 설정','saved-quote':'내 견적','delivery-schedule':'납품 일정',passes:'오더 패스'};
  function panelRoute(id){
    const match=/^(?:profile|manage)\.research\.([\w-]+)\.([\w-]+)$/.exec(id||'');
    if(match)return {screen:match[1],state:match[2],...(match[1]==='passes'?{panel:id}:{})};
    return ({'profile.personal':{screen:'profile',state:'default'},'profile.account':{screen:'account-settings',state:'normal'},'profile.connections':{screen:'profile',state:'menu'},notifications:{screen:'profile',state:'notification'},'manage.business':{screen:'store-settings',state:'list'},'manage.quotes':{screen:'saved-quote',state:'list'},'manage.delivery':{screen:'delivery-schedule',state:'calendar'}})[id]||null;
  }
  function accountState(state){
    orderMenu?.update(state);
    for(const listener of brandListeners)listener(state);
    if(state.phase==='open')orderMenu?.close();
    if(navigating||reviewSelecting||disposed||!pageRoute)return;
    if(state.phase==='closed'&&route.kind==='account'){activeAccountPanel=null;route=researchRoute(route.parent||pageRoute);updateLocation(true);emit();return;}
    if(state.phase!=='open'||state.page===activeAccountPanel)return;
    activeAccountPanel=state.page;
    const next=panelRoute(state.page)||{screen:'profile',state:'menu'};
    route=researchRoute({...next,parent:pageRoute},route);updateLocation(true);emit();
  }
  function renderScenePanel(args,target){
    return mountResearchScenePanel({...args,scene:loadScene({...researchRoute(target,route),variant:route.variant}),module:scene=>scene.module||modules.get(scene.screen),api:{...api,screen:target.screen},services});
  }
  const brandContext={...originalBrandContext,navigate:navigatePanelDestination,onStateChange:accountState,
    renderPanel(args){
      if(['profile.personal','profile.account','profile.connections','notifications'].includes(args.id))return mountResearchAccountPanel({...args,adapter,services,beforeSwitch:()=>!doc.querySelector('dialog[open]')&&(!workspace||workspace.canLeave())&&(!priceWorkspace||priceWorkspace.canLeave()&&!priceWorkspace.snapshot().model?.dirty),onNavigate:navigate,setUnread:count=>brandMenu?.setUnread(count)});
      if(args.id==='manage.business')return mountResearchBusinessPanel({...args,adapter,services,onNavigate:navigate,loadModule:environment.loadBusinessModule,initialState:route.screen==='store-settings'?route.state:'list',businessId:reviewSelecting||config.inspect?adapter.fixture?.inspect().data.businesses.find(item=>item.id==='qa-business-01')?.id:undefined});
      const target=panelRoute(args.id);
      if(target?.screen==='saved-quote')return mountResearchSavedQuotePanel({...args,repository,onOpenDraft:async record=>{if(!await navigate({screen:'q1',mode:record.mode},{restartQuote:true}))return {ok:false,status:'NAVIGATION_CANCELLED'};return record.hasInput?workspace.restoreDraft(record):{ok:true};}});
      if(target)return renderScenePanel(args,target);
      return originalBrandContext.renderPanel?.(args);
    }};
  win.ORDER_BRAND_ACCOUNT_CONTEXT=brandContext;
  const brand=createOrderBrand(doc);header.querySelector('[data-app-brand]').append(brand);
  let orderMenu=null,closedAuthReview=false;
  function refreshBrand(){brandContext.authenticated=authenticated();brandContext.unread=originalBrandContext.unread||0;brandMenu=mountOrderBrandElement(brand,{...brandContext,authenticated:authenticated()});const action=header.querySelector('[data-app-auth]');action.hidden=authenticated();action.textContent='회원가입';action.onclick=()=>navigate({screen:'signup',state:'empty'});}
  async function closeAccountForOrder(){
    if(!brandMenu||brandMenu.inspect().phase==='closed')return true;
    let finish;
    const completed=new Promise(resolve=>{
      const observe=state=>{if(state.phase==='closed')finish(true);},abort=()=>finish(false);
      finish=value=>{brandListeners.delete(observe);signal.removeEventListener('abort',abort);resolve(value);};
      brandListeners.add(observe);signal.addEventListener('abort',abort,{once:true});
    });
    if(await brandMenu.requestClose()===false)finish(false);
    else if(brandMenu.inspect().phase==='closed')finish(true);
    return completed;
  }
  orderMenu=mountResearchOrderMenu({brand,adapter,signal,getAuthenticated:authenticated,getRoute:()=>route,beforeOpen:closeAccountForOrder,onChoose:mode=>{
    if(route.kind==='quote'&&workspace){quote.querySelector('#quote-mode-switch')?.click();return;}
    return navigate({screen:'q1',mode});
  }});
  // Start the selector's publication read before authentication arrival, but
  // never make a pending feature read block the application or QA loading state.
  refreshBrand();await adapter.ready;refreshBrand();
  const headerStyle=doc.createElement('style');headerStyle.dataset.researchBrandCss='';
  headerStyle.textContent=doc.querySelector('[data-order-brand-header-css]').textContent.replaceAll('.order-product-brand','#order-app-header .order-product-brand');doc.head.append(headerStyle);
  const back=header.querySelector('[data-app-back]');back.onclick=()=>{if(workspace&&route.kind==='quote'&&workspace.back())return;return route.kind==='quote'&&/^q[2-4]$/.test(route.screen)?navigate({screen:'q'+(Number(route.screen.slice(1))-1),mode:route.mode}):navigate(route.parent||{screen:'onboarding',state:authenticated()?'member-4':'guest-4'});};
  authSheet=win.ORDER_AUTH_SHEET?.attach(root,api,{getState:()=>pageRoute?.screen==='onboarding'&&/^(guest|member)-[1-4]$/.test(pageRoute.state)?pageRoute.state:authenticated()?'member-4':'guest-4'});
  function navigatePanelDestination(destination){
    if(typeof destination==='object')return navigate(destination);
    const scene=panelRoute(destination);if(scene?.screen==='passes'&&scene.panel)return navigate(scene);
    const map={'profile.personal':'profile','profile.account':'account-settings','profile.connections':'account-settings','manage.business':'store-settings','manage.quotes':'saved-quote','manage.delivery':'delivery-schedule','manage.payments':'store-purchase','manage.dashboard':'admin-analytics',notifications:'profile'};
    if(map[destination])return navigate({screen:map[destination],state:destination==='notifications'?'notification':'default',panel:destination});
    notify('연결할 화면을 찾지 못했어요.');
  }
  function clearPage(){pageDispose?.();sharedDispose?.();pageDispose=null;sharedDispose=null;win.ORDER_PRODUCT_UI?.dispose?.(page);page.replaceChildren();}
  function removeDocumentChrome(scope){
    // The parent app alone owns the brand; remove the inherited page chrome at
    // this composition boundary, before mounting its original content module.
    for(const inherited of scope.querySelectorAll('.brand')){
      if(inherited.closest('template'))continue;
      const container=inherited.closest('header');
      if(container&&container.matches('.ob-header,.ob-head,.page-head,header')&&!container.querySelector('h1,h2,[data-step]'))container.remove();else inherited.remove();
    }
    for(const inner of scope.querySelectorAll('#order-single')){inner.removeAttribute('id');inner.dataset.applicationScene='';}
  }
  const retainsIntroduction=next=>pageRoute?.screen==='onboarding'&&next.screen==='onboarding'&&pageRoute.state.split('-')[0]===next.state.split('-')[0];
  async function preparePrice(next){
    if(priceWorkspace&&!priceWorkspace.snapshot().disposed)return priceWorkspace;
    priceWorkspace=null;
    const created=mountResearchPriceWorkspace(pricing,{assetBase:config.assetBase,state:next.state,environment:{...environment,priceWorkspace:{...environment.priceWorkspace,onNotice:message=>{notify(message);environment.priceWorkspace?.onNotice?.(message);}}},signal,
      onState:state=>{if(!navigating&&!disposed&&route.kind==='pricing'&&state.state&&state.state!==route.state){route=researchRoute({screen:'price-workspace',state:state.state},route);pageRoute=route;updateLocation(true);emit();}}});
    try{await created.ready;if(disposed)throw Error('RESEARCH_APPLICATION_DISPOSED');priceWorkspace=created;return created;}
    catch(error){created.dispose();throw error;}
  }
  async function mountPage(next,sequence,{restartQuote=false,introScene=null,priceSelected=false,quoteFixtureScope=false}={}){
    if(next.screen==='notifications'){
      clearPage();page.hidden=false;quote.hidden=true;pricing.hidden=true;
      pageDispose=mountResearchNotifications({container:page,adapter,signal,mode:'full',setUnread:count=>brandMenu?.setUnread(count)});
      page.dataset.researchSceneConnection='connected';pageRoute=next;return;
    }
    if(next.kind==='pricing'){
      if(!priceWorkspace)await preparePrice(next);
      else if(!priceSelected&&await priceWorkspace.select({state:next.state,scenario:fixtureSelecting})===false)return false;
      if(sequence!==epoch||disposed)return false;
      clearPage();page.hidden=true;quote.hidden=true;pricing.hidden=false;pricing.dataset.researchSceneConnection='connected';pageRoute=next;return true;
    }
    pricing.hidden=true;
    if(QUOTE_ROUTES.has(next.screen)){
      clearPage();page.hidden=true;quote.hidden=false;
      const scenarioFixtureScope=!restartQuote&&(reviewSelecting||Boolean(config.inspect&&!pageRoute));
      // A confirmed mode copy keeps its existing repository. Only an explicit
      // review selection applies fixture values over a freshly mounted draft.
      const fixtureScope=scenarioFixtureScope||(!restartQuote&&quoteFixtureScope===true);
      if(workspace&&(workspace.mode!==next.mode||reviewSelecting||restartQuote||fixtureScope&&!workspace.fixtureScope)){workspace.dispose();workspace=null;quote.replaceChildren();}
      if(!workspace)workspace=await mountResearchQuote(quote,{mode:next.mode,step:next.screen==='quote-review'?'review':next.screen,namespace:environment.namespace||'research',fixtureScope,
        services:{regular:services,adapter,context,repository,fetcher:environment.quoteFetch||environment.fetcher||win.fetch.bind(win),addressService:services.addressService,quoteProvider:environment.quoteProvider},
        onNavigate:change=>{if(change.type==='back')return back.click();if(change.type==='mode')return navigate({screen:'q1',mode:change.mode},{quoteFixtureScope:fixtureScope});if(change.type==='application')return navigate(change);if(change.type==='quote'&&change.page==='home')return navigate({screen:'onboarding',state:authenticated()?'member-4':'guest-4'});if(change.type==='quote'&&change.page==='result'){route={...researchRoute({screen:'quote-result',state:'saving',mode:route.mode},route),kind:'quote'};pageRoute=route;updateLocation(true);emit();}},
        onState:state=>{if(!navigating&&QUOTE_ROUTES.has(route.screen)&&state.step&&state.step!==route.screen){route=researchRoute({screen:state.step,mode:route.mode},route);updateLocation(true);emit();}},signal});
      else await workspace.navigate({step:next.screen==='quote-review'?'review':next.screen});
      if(scenarioFixtureScope&&workspace.applyScenario)await workspace.applyScenario({screen:next.screen,state:next.state});
      pageRoute=next;return;
    }
    quote.hidden=true;page.hidden=false;
    if(pageRoute?.screen==='quote-result'&&next.screen==='quote-result'&&page.querySelector('[data-review-result]')){
      page.dispatchEvent(new win.CustomEvent('r3-result-state',{detail:{state:next.state,replay:false}}));pageRoute=next;return;
    }
    if(retainsIntroduction(next)){
      const source=introScene||await loadScene(next);if(sequence!==epoch||disposed)return;
      const template=doc.createElement('template');template.innerHTML=source.html;removeDocumentChrome(template.content);
      const event=new win.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:next.state,markup:template.innerHTML}});
      page.dispatchEvent(event);if(event.defaultPrevented){pageRoute=next;return;}
    }
    const scene=introScene||await loadScene(next);if(sequence!==epoch||disposed)return;
    if(next.state==='default'&&scene.state!==next.state){next={...next,state:scene.state};route=next;}
    clearPage();page.innerHTML=scene.html;removeDocumentChrome(page);
    for(const style of scene.styles||[]){const node=doc.createElement('style');node.textContent=style;page.prepend(node);}
    const module=scene.module||modules.get(scene.screen)||modules.get(next.screen);
    const mountedApi={...api,screen:next.screen,variant:next.variant,module};
    sharedDispose=win.QAUI?.sharedMount?.(page,mountedApi);
    pageDispose=win.ORDER_PRODUCT_UI?.mount(module,page,next.state,mountedApi)||module?.mount?.(page,next.state,mountedApi);
    page.dataset.researchSceneConnection=module?'connected':'unconnected';
    pageRoute=next;
    if(!module)notify('이 화면의 동작은 아직 서비스에 연결되지 않았어요.');
  }
  async function navigate(input,{replace=false,history=true,scenario=false,restartQuote=false,quoteFixtureScope=false}={}){
    const requested=typeof input==='string'?{screen:input}:input;
    // Returning to an existing workspace resumes its own menu and draft. A
    // review scenario remains an explicit, guarded request for another state.
    const resumePrice=!scenario&&priceWorkspace&&['price-workspace','pricing-r3'].includes(requested.screen)&&(!requested.state||requested.state==='default');
    const next=researchRoute(resumePrice?{...requested,state:priceWorkspace.snapshot().state}:requested,route), sequence=++epoch;notify('');
    navigating++;
    const priorFixtureSelecting=fixtureSelecting;fixtureSelecting=scenario;
    try{
    // Retained introduction transitions still need their build's complete
    // authored HTML, including the original artwork. Resolve it before any
    // route, fixture or parent-overlay changes so a missing source fails closed.
    let introScene=null;
    if(retainsIntroduction(next)){
      try{introScene=await loadScene(next);if(typeof introScene.html!=='string'||!introScene.html)throw Error('INTRO_SOURCE_UNAVAILABLE');}
      catch{if(sequence===epoch&&!disposed)notify('화면을 불러오지 못했어요. 다시 시도해 주세요.');return false;}
      if(sequence!==epoch||disposed)return false;
    }
    const resetsQuote=next.kind==='quote'&&(restartQuote||scenario||workspace?.mode!==next.mode);
    if(workspace&&(resetsQuote||(route.kind==='quote'||pageRoute?.kind==='quote')&&!['quote','auth','account','sheet'].includes(next.kind))&&!workspace.canLeave()){if(!history)updateLocation(true);return false;}
    if(scenario&&priceWorkspace&&(route.kind==='pricing'||pageRoute?.kind==='pricing')&&next.kind!=='pricing'&&priceWorkspace.snapshot().model?.dirty){
      notify('단가표의 미저장 변경을 먼저 저장하거나 되돌려 주세요. 현재 입력은 유지됩니다.');if(!history)updateLocation(true);return false;
    }
    if(priceWorkspace&&(route.kind==='pricing'||pageRoute?.kind==='pricing')&&next.kind!=='pricing'&&!priceWorkspace.canLeave()){
      notify('단가표의 편집 창이나 저장 작업을 먼저 마쳐 주세요. 현재 입력은 유지됩니다.');if(!history)updateLocation(true);return false;
    }
    // A native modal blocks the whole document even when its retained quote
    // owner is hidden. Check the actual owner on every route, including quote
    // steps and account/auth overlays, before changing any page or fixture.
    if(workspace&&!await workspace.prepareNavigation()){
      notify('열려 있는 견적 창의 편집이나 확인을 먼저 마쳐 주세요. 현재 입력은 유지됩니다.');if(!history)updateLocation(true);return false;
    }
    if(sequence!==epoch||disposed)return false;
    let priceSelected=false;
    if(next.kind==='pricing'){
      const existing=priceWorkspace;
      try{
        const prepared=await preparePrice(next);if(sequence!==epoch||disposed)return false;
        if((existing||prepared.snapshot().state!==next.state)&&await prepared.select({state:next.state,scenario:scenario||!existing})===false){notify('단가표의 미저장 변경을 먼저 저장하거나 되돌려 주세요. 열려 있는 편집 창이나 저장 작업도 마쳐 주세요.');if(!history)updateLocation(true);return false;}
      }catch{if(!disposed&&sequence===epoch)notify('단가표를 불러오지 못했어요. 현재 화면과 입력은 유지됩니다. 다시 선택해 주세요.');if(!history)updateLocation(true);return false;}
      if(sequence!==epoch||disposed)return false;
      priceSelected=true;
    }
    if(brandMenu?.requestClose&&brandMenu.inspect().phase!=='closed'){
      const accepted=await brandMenu.requestClose({focus:false,immediate:true});
      if(!accepted||sequence!==epoch){if(!history)updateLocation(true);return false;}
    }
    if(scenario&&environment.configure){await environment.configure(next,adapter,input.fixture);refreshBrand();}
    if(scenario&&next.screen==='login'&&next.state==='closed'){
      // This review example represents the completed return, while ordinary
      // sheet cancellation continues to preserve the real session state.
      const target=researchRoute(next.parent||pageRoute||{screen:'onboarding',state:'member-4'},route);
      const returned=target.screen==='onboarding'?{...target,state:target.state.replace(/^guest-/,'member-')}:target;
      authSheet?.close?.({immediate:true});authReturn=null;closedAuthReview=true;route=next;
      await mountPage(returned,sequence);if(sequence!==epoch||disposed)return false;
      refreshBrand();back.hidden=returned.screen==='onboarding'||returned.screen==='quote-result';header.dataset.appRoute=returned.screen;
      if(history)updateLocation(replace);emit();return true;
    }
    closedAuthReview=false;
    if(next.screen==='notifications'&&!authenticated()){
      authReturn=next;
      return await navigate({screen:'login',state:'empty',parent:pageRoute||{screen:'onboarding',state:'guest-4',variant:'email',mode:next.mode}},{replace,history});
    }
    page.dispatchEvent(new win.CustomEvent('order:research-leave'));
    drawerDispose?.();drawerDispose=null;
    if(['auth','account','sheet'].includes(next.kind)){
      const parent=researchRoute(next.parent||{},route);
      if(!pageRoute)await mountPage(parent,sequence);
      if(sequence!==epoch)return false;
      route=next;
      if(next.kind==='auth'){
        if(!authSheet?.select(next.screen,next.state,{variant:next.variant})){
          const state=next.screen==='password'?'request':next.screen==='terms'?'required':'empty';
          if(!authSheet?.select(next.screen,state))throw Error('AUTH_SHEET_MISSING');route={...next,state};
        }
      }
      else if(next.kind==='account'){
        authSheet?.close?.({immediate:true});
        const workingAccount=config.accountRun&&(next.screen==='profile'&&next.state==='restricted'||next.screen==='account-settings'&&next.state==='normal');
        const panel=workingAccount?'profile.account':input.panel||(next.screen==='profile'?(next.state==='notification'?'notifications':next.state==='menu'?null:'profile.personal'):next.screen==='account-settings'&&next.state==='edit'?'profile.personal':['account-settings','saved-quote','delivery-schedule'].includes(next.screen)?(next.screen==='account-settings'?'profile':'manage')+'.research.'+next.screen+'.'+next.state:next.panel);
        if(!authenticated())return await navigate({screen:'login',state:'empty',parent});
        activeAccountPanel=panel||'root';brandMenu?.open?.(panel,{title:panelTitles[next.screen]||null});
      }else{
        authSheet?.close?.({immediate:true});brandMenu?.close?.({immediate:true});
        const scene=await loadScene(next);if(sequence!==epoch)return false;
        drawerDispose=mountResearchDrawer({container:root,scene,module:scene.module||modules.get('drawer'),api,signal,
          onClose:()=>navigate(parent,{replace:true})});
      }
    }else{
      authSheet?.close?.({immediate:true});brandMenu?.close?.({immediate:true});
      const retained=!scenario&&!restartQuote&&pageRoute&&['screen','state','variant','mode'].every(key=>next[key]===pageRoute[key]);
      const previousRoute=route;route=next;
      if(!retained&&await mountPage(next,sequence,{restartQuote,introScene,priceSelected,quoteFixtureScope})===false){route=previousRoute;if(!history)updateLocation(true);return false;}
    }
    if(sequence!==epoch||disposed)return false;
    if(route.kind!=='auth')authReturn=null;
    back.hidden=route.screen==='onboarding'||route.screen==='quote-result'||route.kind==='quote';header.dataset.appRoute=route.screen;
    if(history)updateLocation(replace);emit();return true;
    }finally{navigating--;fixtureSelecting=priorFixtureSelecting;}
  }
  function mountFields(){
    for(const [input,field]of fields)if(!input.isConnected){field.dispose();fields.delete(input);}
    for(const input of root.querySelectorAll('input[type=email]'))if(!fields.has(input)&&!input.closest('[data-research-quote]')){
      const errorElement=input.closest('.product-auth-sheet .field')?.querySelector('[data-field-message]');
      const options=errorElement?{errorElement,onError:message=>win.QAUI?.setFieldError(input,message)}:undefined;
      fields.set(input,services.mountEmail(input,options));
    }
    // Account/business panels explicitly read phone controllers. Generic
    // legacy handlers still reading input.value must not receive a split DOM.
    if(started&&!navigating&&!disposed&&!closedAuthReview&&route.kind==='auth'){
      const current=authSheet?.inspect();
      if(!current?.open){authReturn=null;route=researchRoute(route.parent||pageRoute);updateLocation(true);emit();}
      else if(current.screen!==route.screen||current.state!==route.state){route={...route,screen:current.screen,state:current.state};updateLocation(true);emit();}
    }
  }
  const observer=new win.MutationObserver(mountFields);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-auth-screen','data-auth-state']});mountFields();
  root.addEventListener('click',event=>{
    const navigation=event.target.closest('[data-mf-go],[data-mf-state]');
    if(navigation?.closest('[data-research-scene-connection="unconnected"]')){event.preventDefault();const [screen,state]=(navigation.dataset.mfGo||'').split('/');navigate({screen:screen||route.screen,state:navigation.dataset.mfState||state||'default'});return;}
    const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented)return;
    const href=new URL(anchor.href,win.location.href);if(href.origin!==win.location.origin)return;
    const view=href.searchParams.get('view');
    if(['simple-r3','detailed-r3','product-r3','businesses-r3','roles-r3','pricing-r3'].includes(view)){event.preventDefault();navigate({screen:view==='product-r3'?href.searchParams.get('screen'):view==='businesses-r3'?'store-settings':view==='roles-r3'?'role-'+(href.searchParams.get('menu')||'consult'):view,state:href.searchParams.get('state')});}
  },{signal});
  win.addEventListener('popstate',event=>{const p=new URL(win.location.href).searchParams;navigate(event.state?.route||Object.fromEntries(['screen','state','variant','mode'].map(key=>[key,p.get(key)])),{history:false});},{signal});
  const app={instance,build:config.build,services,adapter,repository,navigate,
    get priceWorkspace(){return priceWorkspace;},
    snapshot:()=>({instance,build:config.build,route:{...route},pageRoute:{...pageRoute},quote:workspace?.snapshot?.()||null,price:priceWorkspace?.snapshot?.()||null,environment:environment.kind||'injected',headerOwners:header.querySelectorAll('[data-order-brand-source]').length}),
    async inspectRoute(next){reviewSelecting=true;try{return await navigate(next,{replace:true,scenario:true});}finally{reviewSelecting=false;}},
    dispose(){if(disposed)return;disposed=true;epoch++;controller.abort();observer.disconnect();arrowMotion();drawerDispose?.();authSheet?.dispose();brandMenu?.destroy();orderMenu?.destroy();brandListeners.clear();workspace?.dispose();priceWorkspace?.dispose();repository.dispose();clearPage();workflowPolish.destroy();releasePasses.destroy();for(const field of fields.values())field.dispose();fields.clear();headerStyle.remove();releaseRegular();services.dispose();environment.dispose?.();delete root.__researchApplication;}
  };
  root.__researchApplication=app;win.ORDER_RESEARCH_APP=app;
  win.addEventListener('pagehide',()=>app.dispose(),{once:true,signal});
  if(await navigate(route,{replace:true,scenario:Boolean(config.inspect)})===false){app.dispose();throw Error('RESEARCH_INITIAL_ROUTE_UNAVAILABLE');}
  started=true;mountFields();return app;
}
