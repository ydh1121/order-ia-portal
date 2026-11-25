import {quoteTemplate,quoteCommit} from '../r3-product-sources.mjs';
import {browserFunction} from '../browser-source.mjs';
import {mountSavedBusinessPicker} from '../r3-saved-business-client.mjs';
import {createQuoteDraftSync,mountQuoteDraftSync} from '../r3-quote-draft-client.mjs';
import {mountResearchClosedQuoteRows} from './quote-row-swipe.mjs';

// Only the research asset endpoint applies these adapters. The sealed source,
// current regular endpoint, business calculations and validation remain intact.
export const researchQuoteSourceVersion='regular-workspace-20261123-1';
export const researchQuoteOrigin=quoteCommit;
const once=(source,marker,replacement)=>{
  if(source.split(marker).length!==2)throw Error('RESEARCH_QUOTE_SOURCE_MISMATCH: '+marker.slice(0,100));
  return source.replace(marker,replacement);
};

const environmentBindings=`
const document=researchEnvironment?.document??globalThis.document;
const window=researchEnvironment?.window??globalThis.window;
const history=researchEnvironment?.history??globalThis.history;
const location=researchEnvironment?.location??globalThis.location;
const localStorage=researchEnvironment?.localStorage??globalThis.localStorage;
const sessionStorage=researchEnvironment?.sessionStorage??globalThis.sessionStorage;
const fetch=researchEnvironment?.fetch??globalThis.fetch.bind(globalThis);
const setTimeout=researchEnvironment?.setTimeout??globalThis.setTimeout.bind(globalThis);
const clearTimeout=researchEnvironment?.clearTimeout??globalThis.clearTimeout.bind(globalThis);
const requestAnimationFrame=researchEnvironment?.requestAnimationFrame??globalThis.requestAnimationFrame.bind(globalThis);
const cancelAnimationFrame=researchEnvironment?.cancelAnimationFrame??globalThis.cancelAnimationFrame.bind(globalThis);
const queueMicrotask=researchEnvironment?.queueMicrotask??globalThis.queueMicrotask.bind(globalThis);
const ResizeObserver=researchEnvironment?.ResizeObserver??globalThis.ResizeObserver;
const IntersectionObserver=researchEnvironment?.IntersectionObserver??globalThis.IntersectionObserver;
const MutationObserver=researchEnvironment?.MutationObserver??globalThis.MutationObserver;
const matchMedia=researchEnvironment?.matchMedia??globalThis.matchMedia.bind(globalThis);
`;

const appBridge=`
let researchDisposed=false;
const researchModalShell=window.OrderModalShell;
function prepareResearchNavigation(){
  if(researchDisposed)return false;
  const opened=[...document.querySelectorAll('dialog[open]')];
  if(!opened.length)return true;
  if(!guardPendingEdits('research-route')||opened.some(dialog=>dialog.id!=='input-review-dialog'))return false;
  // The input review is read-only. Retiring it through its owning shell also
  // releases the native top layer, scroll lock and workspace-local history.
  // Editors and confirmations must stay visible until the user finishes them.
  researchModalShell.close(opened[0],{immediate:true});
  return !document.querySelector('dialog[open]');
}
const researchBridge=Object.freeze({
  snapshot:()=>projectStoredPayload(bodyCheckpoint()),
  inspect:()=>researchDisposed?{mode:quoteMode,disposed:true}:({mode:quoteMode,page:current,step:S.open,ready:storageReady,pending:storagePending,
    storageStatus:storageFailure?.status??'READY',validation:orderValidationProjection()}),
  canLeave:()=>!researchDisposed&&guardPendingEdits('research-route'),
  prepareNavigation:prepareResearchNavigation,
  async save(){
    if(researchDisposed||!storageReady||!guardPendingEdits('research-save'))return {ok:false,status:'EDIT_PENDING'};
    return save(bodyCheckpoint(),{errorId:'form-error',canCommit:()=>!researchDisposed});
  },
  async applyScenario({screen='q1',state='before',payload=null}={}){
    if(!researchEnvironment?.fixtureScope)throw Error('QUOTE_SCENARIO_SCOPE_REQUIRED');
    if(researchDisposed)return {ok:false,status:'DISPOSED'};
    if(screen==='quote-review')screen='review';
    if(!['q1','q2','q3','q4','review'].includes(screen))throw Error('QUOTE_SCENARIO_SCREEN');
    if(document.querySelector('dialog[open]')||!guardPendingEdits('scenario'))return {ok:false,status:'SCENARIO_REMOUNT_REQUIRED'};
    let candidate=payload;
    if(!candidate){
      candidate={...blank(),allocationRevision:0,open:screen==='review'?'':screen};
      if(screen!=='q1'||!['before','error'].includes(state)){
        const line={...empty(),housing:'1',size:'대란',pack:'30',qty:screen==='q2'&&['empty','error'].includes(state)?'':'100',price:screen==='q2'&&['empty','error'].includes(state)?'':'5000',qtyUnit:'tray'};
        candidate.lines=[line];candidate.current=line.id;
        if(screen==='q2'&&state==='mixed'&&!simpleMode)candidate.lines.push({...empty(),housing:'2',size:'특란',pack:'10',qty:'',price:'',qtyUnit:'pack'});
        if(simpleMode){
          candidate.simpleQuote.sharedRegionSelection=regionSelection('1100000000','1111000000');
          candidate.simpleQuote.sharedRegion='서울특별시 종로구';
          if(screen==='q2'&&state==='unknown'){candidate.simpleQuote.specUnknown=true;candidate.simpleQuote.unknownMonthly={qty:'100',unit:'tray',budget:''};}
          if(['q4','review'].includes(screen)){candidate.simpleQuote.orderKind=state==='missing'?'':'FLEX';candidate.simpleQuote.flexBasis='WEEK';}
        }else if(['q3','q4','review'].includes(screen)){
          // These are editable model fixtures, never asserted address/DNS proof.
          const site={...blankSite(),name:state==='long-name'?'오더 연구 매장 서울 종로구 중앙시장 본점 별관 2층 식자재 입고 담당 사업장':'연구 매장 1',contactPhone:'010-1234-5678',email:'',basicInfoDraft:true};
          candidate.locations=[site];
          if(screen!=='q3')candidate.allocations=[{...blankAllocation(line.id,site.id),modeExplicit:state!=='missing',qty:state==='missing'?'':'10',qtySource:'user'}];
          if(screen==='q4'&&state==='mixed'){
            const second={...blankSite(),name:'연구 매장 2',contactPhone:'010-2345-6789'};candidate.locations.push(second);
            candidate.allocations.push({...blankAllocation(line.id,second.id),mode:'ONCE',modeExplicit:true,oneTimeDeliveryQty:'20',qty:'20',qtySource:'user'});
          }
        }
      }
    }
    const restored=await quoteDraftBridge.restore(candidate,{isCurrent:()=>!researchDisposed});
    if(!restored.ok||researchDisposed)return restored;
    if(!show('form',false))return {ok:false,status:'SCENARIO_NAVIGATION_BLOCKED'};
    changeOpen(screen==='review'?'':screen);
    if(screen==='q1'&&state==='edit')document.querySelector('[data-edit]')?.click();
    if(screen==='q3'&&['open','incomplete','long-name'].includes(state)&&!simpleMode)editSite(S.locations[0]?.id);
    if(screen==='q4'&&state==='open'&&!simpleMode&&S.allocations[0])openRegularQ4(S.allocations[0].id,document.querySelector('[data-edit-allocation]'));
    if(['q3','q4'].includes(screen)&&state==='closed')changeOpen('');
    if(state==='error'||state==='missing'){
      const issue=(simpleMode?simpleVerdict():orderVerdict('full')).fieldErrors.find(value=>value.stage===screen);
      if(issue)errorAt(screen,issue.message);
    }
    if(screen==='review')inputReview.open();
    researchEnvironment.notify({mode:quoteMode,page:current,step:S.open,scenario:{screen,state}});
    return {ok:true,status:'SCENARIO_READY',screen,state};
  },
  navigate({step=null,page='form'}={}){
    if(researchDisposed||!['home','form','result'].includes(page))return false;
    if(!(page==='form'&&step==='review'&&$('input-review-dialog').open)&&!prepareResearchNavigation())return false;
    if(!show(page,false))return false;
    if(page==='form'&&step==='review'){if(!canReviewInput())return false;inputReview.open();}
    else if(page==='form'&&['q1','q2','q3','q4'].includes(step)){
      if(!changeOpen(step))return false;navigateRegularStage(step);
    }
    researchEnvironment?.notify?.({mode:quoteMode,page:current,step:S.open});return true;
  },
  dispose(){
    if(researchDisposed)return;researchDisposed=true;
    releaseResearchClosedQuoteRows();
    pageSeq++;regularStageEpoch++;storageEpoch++;siteEditGeneration++;q3SaveRevision++;skuSaveRevision++;
    routeAnimation?.cancel();routeAnimation=null;
    issuedRequest?.abort();emailGateAttempt?.controller.abort();quoteService.detach();
    addressEditor.invalidate();simpleUI?.destroy?.();q2Numeric.destroy();q2UnitMenu.close();
    for(const counter of q2CostCounters.values())counter.destroy();q2CostCounters.clear();
    q4ReviewUI?.destroy?.();resultScreen.clear();resultStyle.remove();
    researchModalShell.destroy();
    researchEnvironment?.dispose?.();
  }
});
`;

/** The regular and review routes render the same expiry note from disclosed dates. */
export function researchQuoteResultSource(source){
  const expiry="m.state==='expired'&&dated(m.end)?'견적 만료일 '+dated(m.end):''";
  source=once(source,expiry,`m.state==='expired'&&dated(m.end)?(
    Number.isFinite(m.issued)&&m.issued>=-8640000000000000&&m.issued<m.end
      ? '견적 유효기간 '+dated(m.issued)+' ~ '+dated(m.end)
      : '견적 만료일 '+dated(m.end)):''`);
  // A graph click first updates the retained renderer, then the application
  // echoes the selected route. That identical echo must not remove the CSS
  // transition halfway through the graph-to-detail morph.
  source=once(source,"stage.toggleAttribute('data-morph',Boolean(prior && same && selection!==lastSelected));",
    "if(prior && same && selection!==lastSelected)stage.setAttribute('data-morph','');else if(!prior || !same)stage.removeAttribute('data-morph');");
  source=once(source,"  const plot = node('div','plot',stage);",`  const plot = node('div','plot',stage);
  const protectedPreview=options.preview?.tagName==='IMG'?options.preview:null;
  if(protectedPreview){protectedPreview.classList.add('research-quote-protected-preview');protectedPreview.hidden=true;plot.append(protectedPreview);}`);
  source=once(source,"    stage.dataset.state=host.dataset.state=m.state;","    stage.dataset.state=host.dataset.state=m.state;\n    if(protectedPreview)protectedPreview.hidden=m.state!=='unverified';");
  source=once(source,"[['new','새로운 견적'],['same','동일한 조건'],['close','닫기']]","[['new','새로운 견적'],['same','동일한 조건']]");
  source=source.replaceAll('동일한 조건으로 다시 비교하겠어요?','어떤 조건으로 다시 비교할까요?');
  source=once(source,'    own.showModal();',`    own.addEventListener('click',event=>{
      if(event.target!==own)return;
      const rect=own.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)own.close();
    });
    own.showModal();`);
  // This branch exists only in the review fixture wrapper. The regular quote
  // controller keeps its verified recompare/persistence implementation.
  if(source.includes("same:['quote-review','normal']")){
    source=once(source,"same:['quote-review','normal'],back:['quote-review','normal']","same:['quote-wait','entry'],back:['q2','filled']");
    source=once(source,"    const view=mount(host,{","    const view=mount(host,{\n      preview:root.querySelector('template[data-research-result-preview]')?.content.querySelector('img')?.cloneNode(true),");
  }
  return source;
}

/** Applies explicit integration seams to the *served*, extended regular asset. */
export function getResearchQuoteSource(path,source){
  if(typeof source!=='string')throw TypeError('RESEARCH_QUOTE_SOURCE_REQUIRED');
  if(path==='web/quote-result-screen.mjs')return researchQuoteResultSource(source);
  if(path==='web/app.mjs'){
    source=once(source,
      "export function createOrderApp({quoteProvider=null,quoteMode='detailed',onAuthRequest=null}={}){",
      "export function createOrderApp({quoteProvider=null,quoteMode='detailed',onAuthRequest=null,researchEnvironment=null}={}){"+environmentBindings);
    source=once(source,
      "const storage=createBrowserStorage(simpleMode?{key:'order_simple_prework_0581',lockName:'order-simple-prework-0581',migrateLegacy:false}:{}),storageHydration=storage.load();",
      "const storage=createBrowserStorage({...researchEnvironment?.storageOptions,...(simpleMode?{key:'order_simple_prework_0581',lockName:'order-simple-prework-0581',migrateLegacy:false}:{})}),storageHydration=storage.load();");
    source=once(source,'function storagePaint(){','function storagePaint(){if(researchEnvironment?.disposed)return;');
    source=once(source,"function changeOpen(target,persist=true){if(target!==S.open&&!guardPendingEdits(target==='q2'?'q2-repair':'step'))return false;S.open=target;render();return true;}","function changeOpen(target,persist=true){if(target!==S.open&&!guardPendingEdits(target==='q2'?'q2-repair':'step'))return false;S.open=target;render();researchEnvironment?.notify?.({mode:quoteMode,page:current,step:S.open});return true;}");
    source=once(source,'detailedStore:()=>createBrowserStorage(),','detailedStore:()=>createBrowserStorage(researchEnvironment?.storageOptions),');
    source=once(source,'bindQuoteModeSwitch({','bindQuoteModeSwitch({researchEnvironment,');
    source=once(source,"const q2UnitMenu=bindQuantityMenu($('q2-lines'));","const q2UnitMenu=bindQuantityMenu($('q2-lines'),researchEnvironment);");
    source=once(source,'counter=createSpinningCounter(output);','counter=createSpinningCounter(output,{view:researchEnvironment?.window});');
    source=once(source,'const addressEditor=createAddressEditor({','const addressEditor=createAddressEditor({\n document,service:researchEnvironment?.addressService,');
    source=once(source,'const resultScreen=mountQuoteResult($(\'receipt\'),{','const resultScreen=mountQuoteResult($(\'receipt\'),{\n brand:!researchEnvironment?.externalHeader,');
    source=once(source,'simpleUI=createSimpleQuoteUI({onAuthRequest,bridge:', 'simpleUI=createSimpleQuoteUI({researchEnvironment,onAuthRequest,bridge:');
    source=once(source,"if(seq!==regularStageEpoch||$('q4-regular-dialog').open)return;const target=","if(seq!==regularStageEpoch||$('q4-regular-dialog').open)return;if(researchEnvironment){for(let boundary=document.body;boundary;boundary=boundary.parentElement)if(boundary.hidden||boundary.inert)return;if(current!=='form')return;}const target=");
    // Presentation follows the regular saved model. These seams neither create
    // rows nor mark incomplete data valid; the original actions own all writes.
    source=once(source,"$('add-line').innerHTML='<span class=\"ui-text-plus\" aria-hidden=\"true\">+</span><span>계란 추가</span>';","$('add-line').textContent='계란 추가';");
    source=once(source,"bindSavedRowActions($('page-form'));","bindSavedRowActions($('page-form'));const releaseResearchClosedQuoteRows=("+browserFunction(mountResearchClosedQuoteRows)+")($('page-form'));");
    source=once(source,"label:esc(siteName(site)),content:","label:esc(siteName(site))+(!q3Expanded.get(site.id)&&itemCount?' <span class=\"research-q3-tags\">'+itemCount+'개 품목</span>':''),content:");
    source=once(source,"savedRowActions(name,'edit-allocation','delete-allocation',a.id,'수정','삭제','q4-allocation-item-actions')","savedRowActions(name,'edit-allocation','delete-allocation',a.id,'수정','해제','q4-allocation-item-actions')");
    source=once(source,"CODE1_UI.textAction('삭제','delete-allocation',esc(a.id),false)","CODE1_UI.textAction('해제','delete-allocation',esc(a.id),false)");
    source=once(source,'<span class="q4-body-subtitle">${esc(summary)}</span>','<span class="q4-body-subtitle">${rows.length?\'<span class="research-q4-tag">\'+esc(summary)+\'</span>\':esc(summary)}</span>');
    source=once(source,"}).join('');$('q3-empty').hidden=S.locations.length>0;","}).join('');$('q3-empty').hidden=S.locations.length>0;$('q3-next').hidden=!S.locations.length;");
    source=once(source," }).join('');\n updateResultCTA();\n}\n\nfunction invoiceDetails(stats){"," }).join('');\n $('q4-next').hidden=!S.allocations.length;updateResultCTA();\n}\n\nfunction invoiceDetails(stats){");
    source=once(source,'return Object.freeze({quoteDraftBridge,savedBusinessBridge,regularBridge:',appBridge+'\nreturn Object.freeze({researchBridge,quoteDraftBridge,savedBusinessBridge,regularBridge:');
    return source;
  }
  if(path==='web/common-ui.mjs'){
    // Live exports keep the exact shared UI/validation implementations; their
    // installation and globals now belong to this application's mount lifetime.
    source=once(source,'window.OrderRepeatContract=','export let CODE1_UI,CODE1_ORDER_VALIDATION,CODE1_ORDER_ERRORS;\nexport function installRegularQuoteUI(researchEnvironment){'+environmentBindings+'\nwindow.OrderRepeatContract=');
    source=once(source,'const CODE1_UI =','CODE1_UI =');
    source=once(source,'const CODE1_ORDER_VALIDATION=','CODE1_ORDER_VALIDATION=');
    source=once(source,'const CODE1_ORDER_ERRORS=','CODE1_ORDER_ERRORS=');
    source=once(source,'return {open,close,bind,requestClose,resize,sync:paintLock,','return {destroy(){version++;for(const dialog of [...entries.keys()].reverse())close(dialog,{immediate:true});cancelAnimationFrame(resizeFrame);},open,close,bind,requestClose,resize,sync:paintLock,');
    return once(source,'export {CODE1_UI,CODE1_ORDER_VALIDATION,CODE1_ORDER_ERRORS};','}\n');
  }
  if(path==='web/quote-mode-switch.mjs'){
    source=once(source,'export function bindQuoteModeSwitch({simple,dialog,trigger,shell,source,guard,saveCurrent,detailedStore,navigate,preference}){','export function bindQuoteModeSwitch({simple,dialog,trigger,shell,source,guard,saveCurrent,detailedStore,navigate,preference,researchEnvironment}){'+environmentBindings);
    // The regular module navigates to another document after a confirmed save.
    // In the retained app, finish that successful confirmation before routing.
    source=once(source,'if(active())navigate(!simple);','if(active()){if(researchEnvironment&&dialog.open)shell.close(dialog,{immediate:true});navigate(!simple);}');
    return once(source,'mountOrderMenu({simple,switchMode:()=>trigger.click()});','if(!researchEnvironment?.externalHeader)mountOrderMenu({simple,switchMode:()=>trigger.click()});');
  }
  if(path==='web/quantity-menu.mjs'){
    source=once(source,'export function bindQuantityMenu(root){','export function bindQuantityMenu(root,researchEnvironment){');
    return once(source,'const document=root.ownerDocument,view=document.defaultView,menu=document.createElement(\'div\');','const document=researchEnvironment?.document??root.ownerDocument,view=researchEnvironment?.window??document.defaultView,menu=document.createElement(\'div\');');
  }
  if(path==='web/q4-review.mjs'){
    source=once(source,'export function createQ4Review({bridge}){','export function createQ4Review({bridge,researchEnvironment=null}){'+environmentBindings);
    source=once(source,'window.OrderQ4Review=Object.freeze({open:',`window.OrderQ4Review=Object.freeze({destroy(){
      commitEpoch++;commitAttempt++;q4ValidationEpoch++;q4CancelNavigation();
      destroyApprovedDateFields();q4Numeric.destroy();monthlyEditor?.cancel();monthlyEditor=null;
      resultObserver?.disconnect();cancelAnimationFrame(popupBadgeFrame);popupBadgeFrame=0;
      const dialog=$('q4-regular-dialog');if(dialog?.open)window.OrderModalShell.close(dialog,{immediate:true});
      regularContext=null;
    },open:`);
    return source;
  }
  if(path==='web/simple-quote-ui.mjs'){
    source=once(source,'export function createSimpleQuoteUI({bridge}){','export function createSimpleQuoteUI({bridge,researchEnvironment=null}){'+environmentBindings);
    source=once(source,'return Object.freeze({render,resetLocal,','return Object.freeze({destroy(){resetLocal();numeric?.destroy();},render,resetLocal,');
    return source;
  }
  if(path==='web/storage.mjs'){
    source=once(source,'const partition=document.documentElement.dataset.r3QuotePartition;','const partition=options.partition??document.documentElement.dataset.r3QuotePartition;');
    source=once(source,"const privateKey='order_ia_r3_quote_v1_'+partition+'_'+mode;","const privateKey=(options.keyPrefix??'order_application_quote_v1_')+partition+'_'+mode;");
    return source;
  }
  // Keep the exact contact modules, changing only the resource address of their
  // already-validated IANA reference. No validator or input behavior is replaced.
  if(path==='web/contact-ui.mjs'){
    source=once(source,"'/ia/r3-product/assets/iana-reference.json'","'/ia/research-assets/assets/iana-reference.json'");
    // A full application installs its reusable contact owner before importing
    // quote modules. Keep that owner and its active field/proof controllers.
    source=once(source,'window.OrderPhone=createOrderPhoneAdapter();','if(!(window.OrderPhone&&window.OrderEmail&&window.OrderEmailDomain&&window.OrderEmailUI)){\nwindow.OrderPhone=createOrderPhoneAdapter();');
    return source+'\n}\n';
  }
  return source;
}

/** The regular app owns these view bodies/dialogs; the application owns header. */
export function getResearchQuoteMarkup(){
  let body=quoteTemplate.split('<body>')[1]?.split('</body>')[0];
  if(!body||body.split('<header class="header">').length!==2)throw Error('RESEARCH_QUOTE_TEMPLATE_MISMATCH');
  const from=body.indexOf('<header class="header">'),to=body.indexOf('</header>',from);
  if(to<0)throw Error('RESEARCH_QUOTE_TEMPLATE_HEADER_MISMATCH');
  body=body.slice(0,from)+body.slice(to+'</header>'.length);
  body=once(body,'<script type="module" src="/main.mjs"></script>','');
  body=once(body,'이 납품 조건을 삭제할까요?','이 납품 조건 연결을 해제할까요?');
  body=once(body,'해당 사업장의 납품 조건만 삭제됩니다.<br>삭제한 경우 다시 설정해야 합니다.','해당 사업장의 납품 조건 연결만 해제됩니다.<br>다시 연결하려면 납품 조건을 설정해 주세요.');
  body=once(body,'id="q4-delete-commit">삭제</button>','id="q4-delete-commit">해제</button>');
  if(/<script\b|<iframe\b/i.test(body))throw Error('RESEARCH_QUOTE_EXECUTABLE_TEMPLATE');
  return body;
}

export function getResearchQuoteStyleSource(path,source){
  if(!['web/styles.css','web/date-field.css','web/spinning-counter.css'].includes(path))return source;
  // @scope preserves complex selectors, keyframes and media queries without a
  // lossy selector parser, and confines the regular form's tokens to its root.
  const css=source.replace(/:root\b/g,':scope').replace(/(^|[},\s])(?:html|body)(?=[\s,.#[:{>+~])/g,'$1:scope');
  return '@scope ([data-research-quote]){\n'+css+'\n}\n';
}

/** Existing business/draft integrations, with the same scoped lifetime/IO. */
export function getResearchQuoteIntegrationSource(){
  return `export const createQuoteDraftSync=${browserFunction(createQuoteDraftSync)};
export function mountSavedBusinessPicker(app,researchEnvironment){${environmentBindings}
  return (${browserFunction(mountSavedBusinessPicker)})(app);
}
export function mountQuoteDraftSync(app,researchEnvironment){${environmentBindings}
  return (${browserFunction(mountQuoteDraftSync)})(app,createQuoteDraftSync);
}\n`;
}
