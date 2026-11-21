import {getProductUiBootstrap} from './product-ui/bootstrap.gen.mjs';
import {browserFunction} from './browser-source.mjs';
import {priceWorkspaceFragment} from './r3-price-workspace-page.mjs';
import {mountPriceWorkspace} from './r3-price-workspace-client.mjs';
import {createPriceWorkspaceModel} from './r3-price-workspace-model.mjs';
import {defaultPriceRows} from './r3-price-workspace-defaults.mjs';
import {createPriceWorkbookReader} from './r3-price-workspace-xlsx.mjs';
import {importPriceWorkbook} from './r3-price-workspace-import.mjs';
import {mountPriceWorkspaceTree} from './r3-price-workspace-tree.mjs';
import {r3ProductAsset} from './r3-product-page.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {priceWorkspaceQaRuntimeSource} from './r3-price-workspace-qa-runtime.gen.mjs';

const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');

export const priceWorkspaceQaStates=[
  {id:'costs',label:'단가표',section:'costs'},
  {id:'store-products',label:'사업장 판매가',section:'products',audience:'store'},
  {id:'consumer-products',label:'소비자 판매가',section:'products',audience:'consumer'},
  {id:'classification',label:'상품 분류',section:'classification'},
  {id:'delivery',label:'배송수단 및 운임',section:'carriers'},
  {id:'loading',label:'불러오는 중',section:'costs',scenario:'loading'},
  {id:'error',label:'불러오기 실패',section:'costs',scenario:'error'},
  {id:'empty',label:'가격 미입력',section:'products',audience:'consumer',scenario:'empty'},
  {id:'guest',label:'로그인 확인',section:'costs',scenario:'guest'}
];

// This transport is a disposable design-review database, never a proxy. It has
// no fetch/storage dependency and cannot select an operational or personal API.
// All price validation and calculations remain in the canonical product model.
export function createPriceWorkspaceQaTransport(model,reference,options={}){
  const now=options.now||'2026-11-20T00:00:00.000Z';
  const modes=new Set(['normal','loading','error','empty','guest']);
  const fail=code=>{throw Error(code);};
  const scenarioFor=value=>modes.has(value)?value:fail('QA_SCENARIO_INVALID');
  let scenario=scenarioFor(options.scenario||'normal'),disposed=false,records=[];
  const pending=new Set(),calls=[];
  const initial=mode=>{
    const document=model.initial(now.slice(0,10),model.clone(reference));
    if(mode==='empty')for(const rows of Object.values(document.costs))for(const row of rows)for(const price of Object.values(row.prices)){price.raw='';price.packing='';price.packedOverride=null;}
    model.syncCatalogProducts(document);
    if(mode==='empty')for(const product of document.products){product.price='';product.auto=false;delete product.markup;}
    return model.normalize(document);
  };
  let baseline=initial(scenario);
  const project=entry=>entry?model.clone({revision:entry.revision,action:entry.action,date:entry.date,effectiveAt:entry.effectiveAt,savedAt:entry.savedAt,document:entry.document}):null;
  const latest=()=>records.at(-1)||null;
  const effective=()=>records.filter(entry=>entry.action!=='draft'&&entry.effectiveAt<=now).sort((a,b)=>a.effectiveAt.localeCompare(b.effectiveAt)||a.revision-b.revision).at(-1)||null;
  function execute(path,body){
    if(disposed)fail('QA_TRANSPORT_DISPOSED');
    if(scenario==='guest')fail('ACCESS_REQUIRED');
    if(path==='/session')return {csrf:'qa-memory-only',practiceAllowed:false,serverTime:now};
    if(scenario==='error')fail('SERVICE_UNAVAILABLE');
    const query=new URLSearchParams(path.slice('/workspace'.length));
    if(body!==undefined){
      if(!body||!['draft','apply','schedule'].includes(body.action)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestKey!=='string'||!/^[-\da-f]{36}$/i.test(body.requestKey))fail('INVALID_REQUEST');
      const document=model.normalize(body.document),content=JSON.stringify(document);
      const prior=records.find(entry=>entry.requestKey===body.requestKey);
      if(prior){
        if(prior.content!==content||prior.revision!==body.expectedRevision+1||prior.action!==body.action||body.action==='schedule'&&prior.effectiveAt!==body.effectiveAt)fail('IDEMPOTENCY_CONFLICT');
        return {saved:project(prior),serverTime:now};
      }
      if(body.expectedRevision!==(latest()?.revision||0))fail('REVISION_CONFLICT');
      const effectiveAt=body.action==='draft'?null:body.action==='apply'?now:body.effectiveAt;
      if(body.action==='schedule'&&(typeof effectiveAt!=='string'||!Number.isFinite(Date.parse(effectiveAt))||new Date(effectiveAt).toISOString()!==effectiveAt||effectiveAt<=now))fail('WORKSPACE_SCHEDULE_INVALID');
      const entry={revision:body.expectedRevision+1,requestKey:body.requestKey,action:body.action,date:document.date,effectiveAt,savedAt:now,document,content};
      records.push(entry);return {saved:project(entry),serverTime:now};
    }
    const selected=query.has('revision')?records.find(entry=>entry.revision===Number(query.get('revision'))):latest();
    if(query.has('revision')&&!selected)fail('NOT_FOUND');
    const result={revision:latest()?.revision||0,versions:records.slice().reverse().map(({revision,action,date,effectiveAt,savedAt})=>({revision,action,date,effectiveAt,savedAt})),effective:project(effective()),serverTime:now};
    if(query.get('metadata')!=='1'){result.selectedRevision=selected?.revision||0;result.document=model.clone(selected?.document||baseline);}
    return result;
  }
  const flush=()=>{
    if(scenario==='loading'&&!disposed)return;
    for(const item of [...pending]){pending.delete(item);try{item.resolve(execute(item.path,item.body));}catch(error){item.reject(error);}}
  };
  return {
    async request(path,body){
      if(disposed)fail('QA_TRANSPORT_DISPOSED');
      if(typeof path!=='string'||!/^\/(?:session|workspace(?:\?(?:metadata=1|revision=[1-9]\d*))?)$/.test(path)||body!==undefined&&path!=='/workspace')fail('QA_REQUEST_NOT_ALLOWED');
      calls.push({path,method:body===undefined?'GET':'POST'});
      const value=body===undefined?undefined:model.clone(body);
      if(scenario==='loading'&&path!=='/session')return new Promise((resolve,reject)=>pending.add({path,body:value,resolve,reject}));
      return execute(path,value);
    },
    setScenario(value){scenario=scenarioFor(value);flush();},
    reset(value='normal'){scenario=scenarioFor(value);records=[];baseline=initial(scenario);flush();},
    inspect(){return {mode:'qa-memory',scenario,revision:latest()?.revision||0,document:model.clone(latest()?.document||baseline),pending:pending.size,calls:model.clone(calls)};},
    destroy(){disposed=true;flush();}
  };
}

// A normal authored module: the R1 host owns state selection and annotations.
// Its existing motion controls may send r3-motion-scenario. Tests/tools can send
// r3-price-workspace-scenario with {scenario:'normal'|'loading'|...} as well.
export function registerPriceWorkspaceQa(config,makeModel,makeReader,importWorkbook,mountTree,mountWorkspace,makeTransport){
  const id='price-workspace';
  const module={id,states:config.states.map(state=>({id:state.id,label:state.label})),mount(root,state){
    const view=config.states.find(entry=>entry.id===state)||config.states[0];
    const model=makeModel(),transport=makeTransport(model,config.reference,{scenario:view.scenario||'normal',now:config.now});
    const workspaceRoot=root.querySelector('#price-workspace-app');
    if(!workspaceRoot)throw Error('QA_WORKSPACE_ROOT_MISSING');
    workspaceRoot.dataset.workspaceStorage='qa-memory';
    const workspace=mountWorkspace(workspaceRoot,model,makeReader(),importWorkbook,mountTree,{transport,initialSection:view.section,initialAudience:view.audience});
    const control={workspace,transport,ready:workspace.ready,
      setScenario(scenario){if(scenario==='empty')transport.reset(scenario);else transport.setScenario(scenario);return workspace.reconnect();},
      reset(){transport.reset(view.scenario||'normal');return workspace.reconnect();}};
    root.priceWorkspaceQa=control;
    const scenario=event=>{if(event.detail?.scenario)void control.setScenario(event.detail.scenario);};
    const motion=event=>{
      const mode=event.detail?.mode;
      if(mode==='replay'){void control.reset();return;}
      const selected={normal:'normal',delay:'loading',error:'error',offline:'error',complete:'normal'}[mode];
      if(selected)void control.setScenario(selected);
    };
    root.addEventListener('r3-price-workspace-scenario',scenario);root.addEventListener('r3-motion-scenario',motion);
    return ()=>{root.removeEventListener('r3-price-workspace-scenario',scenario);root.removeEventListener('r3-motion-scenario',motion);workspace.destroy();transport.destroy();if(root.priceWorkspaceQa===control)delete root.priceWorkspaceQa;};
  }};
  window.ORDER_DESIGN_MODULES=(window.ORDER_DESIGN_MODULES||[]).filter(entry=>entry.id!==id);
  window.ORDER_DESIGN_MODULES.push(module);
}

async function canonicalModalSource(){
  const common=await r3ProductAsset('/ia/r3-product/web/common-ui.mjs').text();
  const start=common.indexOf('window.OrderModalShell='),end=common.indexOf('/* MSG0465:',start);
  if(start<0||end<=start)throw Error('CANONICAL_WORKSPACE_MODAL_SOURCE_MISSING');
  // This exact, self-contained assignment is also used by the standalone page;
  // the surrounding common-ui imports concern unrelated quote form policies.
  const modal=common.slice(start,end);
  if(!modal.trimEnd().endsWith('})());')||/^\s*(?:import|export)\s/m.test(modal))throw Error('CANONICAL_WORKSPACE_MODAL_SOURCE_INVALID');
  return modal;
}

// Called by the build/check script, before bundling. Serving uses the frozen
// string below so minifiers cannot change a reviewed frame's source identity.
export async function getPriceWorkspaceQaRuntimeSource(){
  const modal=await canonicalModalSource();
  const config={states:priceWorkspaceQaStates,reference:defaultPriceRows,now:'2026-11-20T00:00:00.000Z'};
  return getProductUiBootstrap().script+'\n'+modal+'\n('+browserFunction(registerPriceWorkspaceQa)+')('+js(config)+','+[
    createPriceWorkspaceModel,createPriceWorkbookReader,importPriceWorkbook,mountPriceWorkspaceTree,mountPriceWorkspace,createPriceWorkspaceQaTransport
  ].map(fn=>'('+browserFunction(fn)+')').join(',')+');';
}

let documents;
export function getPriceWorkspaceQaDocuments(){return documents??=buildDocuments();}
async function buildDocuments(){
  const mount=priceWorkspaceQaRuntimeSource;
  if(!mount)throw Error('QA_WORKSPACE_RUNTIME_NEEDS_BUILD');
  const modal=await canonicalModalSource();
  const fragment=priceWorkspaceFragment({header:false});
  const body='<main id="order-single" class="qa-screen ds" data-qa-price-workspace>'+fragment.body+'</main>';
  const provenance={mode:'controlled-qa',storage:'per-frame-memory',productCommit:quoteCommit,modalSource:'web/common-ui.mjs#OrderModalShell',modalSha256:await digest(modal),referenceSha256:await digest(JSON.stringify(defaultPriceRows)),mountSha256:await digest(mount),cssSha256:await digest(fragment.css)};
  return priceWorkspaceQaStates.map(state=>({
    qaOnly:true,
    row:{id:'price-workspace/'+state.id+'/email',screen:'price-workspace',state:state.id,variant:'email',label:'단가표',stateLabel:state.label,group:'관리자 · 가격·매출·수익',role:'admin',phase:'current',defaultWidth:1280,authoredChange:true,supplemental:true,description:'실제 단가표 컴포넌트 · QA 전용 메모리 데이터로 상태와 입력을 검토합니다.',routeIds:['/ia?view=pricing-r3']},
    body,mount,css:fragment.css,provenance
  }));
}
