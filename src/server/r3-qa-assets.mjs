import {marketPriceIconAsset,marketPriceIconPreview} from './product-ui/market-price-icon.mjs';
import {signatureLibraryStates,signatureLibrarySlot,signatureLibraryCss,signatureLibraryRuntime} from './signature-library.mjs';
import {catalog,frames,cssHash} from './r3-ui/catalog.gen.mjs';
import {assetPack,brandMotionScript,commonMotionScript,brandAccountScript,brandAccountCss,sharedCoreScript,sharedTemplates,sharedUiProvenance,createSharedUi,qaMvpRuntimeCode} from './r3-ui/qa-assets.gen.mjs';
import {approvedWidths} from './r3-ui/approved-width-list.mjs';
import {bloubScript,bloubMontages} from './r3-bloub.mjs';
import {waitMontages} from './r3-quote-wait.mjs';
import {runtimes} from './r3-ui/runtime.gen.mjs';
import {createProductDocumentContext,getProductDocuments,productUiCss} from './product-ui/documents.mjs';
import {getPriceWorkspaceQaDocuments} from './r3-price-workspace-qa.mjs';

export const supplementalScreenIds=['component-library','admin-revenue-rules','member-email-templates','store-purchase','price-workspace'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function inflate(value){return new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}

// Only composition/placement belongs here. Typography, fields, buttons, panels,
// tables, navigation and their feedback come from the preserved common UI.
export const qaMvpCss=productUiCss+`
.qa-mvp-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block:20px}
.qa-mvp-toolbar>h2{margin-inline-end:auto}
.qa-asset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}
.qa-asset-card{min-width:0;display:flex;flex-direction:column;gap:12px}
.qa-asset-card>.btn{align-self:flex-start;margin-top:auto}
.qa-asset-thumbnail{contain:layout paint;isolation:isolate;position:relative;pointer-events:none;min-width:0;height:220px;overflow:hidden;background:var(--surface)}
.qa-asset-thumbnail>.ds{width:100%;min-height:220px;transform-origin:top left;max-width:none}
.qa-asset-thumbnail img{max-width:100%;height:200px;object-fit:contain}
.qa-asset-uses{display:grid;gap:10px}.qa-asset-uses .btn{justify-content:space-between;text-align:start;white-space:normal;gap:16px}
.qa-asset-uses small{display:block;color:var(--muted);overflow-wrap:anywhere}
.qa-component-context{position:relative;max-width:100%;min-width:0;overflow:auto;border-block:1px solid var(--line);margin-block:24px}
.qa-component-context>[data-component-source]{max-width:100%;min-width:0;margin-inline:auto}
.qa-component-context [data-component-target]{outline:2px solid var(--blue);outline-offset:4px}
.qa-component-controls{margin-block:20px}
.qa-bloub-stage{max-width:380px;min-height:300px;margin:12px auto;display:grid;place-items:center}.qa-bloub-stage>div{width:100%}
.qa-bloub-preview{position:relative}.qa-bloub-preview[data-result=true] .qa-bloub-stage{position:absolute;inset:0 auto auto 50%;transform:translateX(-50%);width:min(100%,380px);opacity:0;pointer-events:none}
.qa-result-composition{max-width:390px;margin:10px auto;text-align:initial}.qa-result-composition [data-order-result]{min-height:640px}
.qa-art-stage{display:grid;place-items:center;max-width:600px;min-height:250px;margin:auto}.qa-art-stage img{max-width:100%;max-height:320px;object-fit:contain}
.qa-art-stage[data-qa-art-motion=float]:is([data-qa-art-status=playing],[data-qa-art-status=paused]) img{animation:qa-art-float 3.6s ease-in-out infinite}.qa-art-stage[data-qa-art-motion=emphasis]:is([data-qa-art-status=playing],[data-qa-art-status=paused]) img{animation:qa-art-emphasis 2.4s ease-in-out infinite}.qa-art-stage[data-qa-art-status=paused] img{animation-play-state:paused!important}
@keyframes qa-art-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-8px) rotate(-1deg)}}@keyframes qa-art-emphasis{0%,100%{transform:scale(1)}45%{transform:scale(1.045)}65%{transform:scale(1.015)}}
@media(prefers-reduced-motion:reduce){.qa-art-stage img{animation:none!important;transform:none!important}}
`+(sharedTemplates.libraryCss||'');

let built;
export function getQaSupplemental(){return built??=build();}
export async function getQaApplicationDocument(screen,state='default',variant='email',componentVariant){
  const collection=await getQaSupplemental(),{documents}=collection;
  const defaultStates={'store-purchase':'select','admin-revenue-rules':'settings','member-email-templates':'welcome','admin-analytics':'business-sales','component-library':'components','admin-shipments':'packing','supplier-shipments':'packing','delivery-request':'ready'};
  let source=documents.get([screen,state,variant].join('/'))||(state==='default'&&defaultStates[screen]?documents.get([screen,defaultStates[screen],variant].join('/')):null);
  if(componentVariant!==undefined&&componentVariant!==null){
    if(!source||screen!=='component-library')return null;
    source=await selectedComponentDocument(collection,source,componentVariant);
  }
  return source&&!source.qaOnly?{...source,css:source.css||qaMvpCss,source:{kind:'product',sharedUi:sharedUiProvenance}}:null;
}
async function selectedComponentDocument(collection,base,variantId){
  const asset=collection.assets.find(asset=>asset.id===base.libraryContext?.assetId),variant=asset?.variants.find(variant=>variant.id===variantId);
  if(!variant||!base.libraryContext?.contextMarkup)return null;
  const point=variant.uses.find(point=>point.id===variant.source&&point.index===variant.index)||variant.uses[0];
  if(!point?.selector||!Number.isInteger(point.selectorIndex)||point.selectorIndex<0)return null;
  const source=collection.documents.get(point.id),row=source?.row||catalog.find(row=>row.id===point.id);
  if(!row||row.screen==='component-library')return null;
  const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
  const originalBody=source?.body||await inflate(frames[row.current]),sourceMount=source?.mount||runtimes[row.runtimeFamily||fallback[row.screen]]||'';
  const componentSource={rowId:row.id,selector:point.selector,index:point.selectorIndex,label:point.controlLabel||point.name||row.stateLabel};
  const context={screen:row.screen,state:row.state,variant:row.variant,selector:point.selector,index:point.selectorIndex,variantId,source:source?await sha(originalBody):row.current};
  const contextMarkup='<section class="qa-component-context" aria-label="원본 컴포넌트 사용 화면">'+originalBody.replace('id="order-single"','id="order-component-source" data-component-source')+'</section>';
  const heading='<div class="qa-component-controls"><h2>원본 동작 화면</h2><p class="muted">'+esc(row.label+' · '+row.stateLabel+' · '+componentSource.label)+'</p><p class="muted" data-component-runtime role="status" aria-live="polite">원본 런타임을 연결하는 중이에요.</p></div>';
  const body=base.body.replace(base.libraryContext.contextMarkup,contextMarkup).replace(base.libraryContext.headingMarkup,heading);
  const dependencies=sharedCoreScript+'\n'+brandMotionScript+'\n'+commonMotionScript+'\n'+brandAccountScript;
  const mount=sourceMount+'\n'+dependencies+'\nwindow.ORDER_LIBRARY_SOURCE='+js(context)+';\n('+qaMvpRuntimeCode+')();';
  const hashes=Object.fromEntries(await Promise.all(approvedWidths.map(async width=>[width,await sha([base.row.id,width,body,cssHash,qaMvpCss,mount].join('|'))])));
  return {...base,body,mount,hashes,row:{...base.row,hashes},componentVariantId:variantId,componentSource};
}
async function build(){
  const {shared,attrs,button,go,field,select,check,status,panel,page:productPage}=createProductDocumentContext();
  const page=(title,content,options={})=>options.library?'<main id="order-single" class="qa-screen ds" data-qa-mvp data-app-screen="component-library"><section id="r3-component-library" class="qa-library-chrome"><header>'+sharedTemplates.brand+'<h1>'+esc(title)+'</h1></header>'+content+'</section></main>':productPage(title,content,options);
  const assets=JSON.parse(await inflate(assetPack));
  const art=assets.find(asset=>asset.id==='intro-art');
  // Existing review IDs stay addressable. These two experiments are explicitly
  // labelled as variants; they are not presented as original-product motion.
  if(art)for(const [motion,name] of [['float','부유'],['emphasis','강조']])assets.push({id:'intro-art-'+motion,board:'three-d',name:'첫 화면 3D · '+name+' 변형',preview:art.preview,previewContext:art.previewContext,sourceSha256:art.sourceSha256,derivedFrom:art.id,motion,usages:[],variants:[],sourceUsages:art.usages});
  const product=await getProductDocuments();
  const rows=[...product.rows],documents=new Map(product.documents),boards=[['components','공통·파생 컴포넌트'],['logos','헤더·푸터 로고'],['svg','일반·애니메이션 SVG'],['three-d','3D 일반·애니메이션'],['bloub','BLOUB_EGG 상태 조합']];
  const dependencies=sharedCoreScript+'\n'+brandMotionScript+'\n'+commonMotionScript+'\n'+brandAccountScript;
  const standardMount=dependencies+'\n('+qaMvpRuntimeCode+')();';
  const add=async({screen,state,label,stateLabel,group='공통 자산',role='common',body,mount=standardMount,original,description='',css=qaMvpCss,qaOnly=false,provenance,fixture,sourceFiles,defaultWidth})=>{
    const id=screen+'/'+state+'/email';
    const hashes=Object.fromEntries(await Promise.all(approvedWidths.map(async width=>[width,await sha([id,width,body,cssHash,css,mount].join('|'))])));
    const row={...(original||{}),id,screen,state,variant:'email',group,label,stateLabel,phase:'current',role,defaultWidth:defaultWidth||(screen==='component-library'||role==='admin'?1280:390),hashes,previousHashes:original?.previousHashes||{},authoredChange:true,supplemental:!original,description,
      ...(fixture?{fixture}:{}),...(provenance?{provenance}:{}),...(sourceFiles?{sourceFiles}:{})};
    rows.push(row);documents.set(id,{body,mount,css,hashes,row,original,qaOnly,provenance});
  };
  const nav=boards.map(([id,label])=>go(label,'component-library',id)).join('');
  const use=(u,control)=>shared.button('<span>'+esc(u.label)+' · '+esc(u.stateLabel)+(control?' · '+esc(control.controlLabel||control.name||'컴포넌트 '+(control.index+1)):'')+'<small>'+esc((u.routes||[]).join(' / ')||'/ia?view=qa-lab&screen='+u.id)+'</small>'+(control?'<small>'+esc(control.selector||'')+' · '+((control.selectorIndex??control.index)+1)+'번째</small>':'')+'</span><small>'+esc(u.id)+'</small>','app-action','secondary',attrs({'data-qa-go':u.screen,'data-qa-state':u.state,'data-source-usage':u.id,...(control?{'data-component-variant':control.variantId,'data-source-label':control.controlLabel||'','data-source-name':control.name||'','data-source-selector':control.selector||'','data-source-index':control.selectorIndex??control.index,'data-source-collection-index':control.index}:{})}));
  const scopeThumbnail=(html,id)=>{
    const prefix='thumb-'+id+'-',ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],prefix+m[1]]));
    return html.replace(/\b(id|for|aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g,(_,attr,value)=>attr+'="'+value.split(' ').map(v=>ids.get(v)||v).join(' ')+'"');
  };
  for(const [state,name] of boards.filter(([state])=>state!=='bloub')){
    const hasSignature=state==='components';
    const signatureCard=hasSignature?'<article class="ops-panel qa-asset-card qa-signature-demo"><h2>서명 패드</h2><p class="muted">사용 상태 5개</p>'+signatureLibrarySlot+'<div class="qa-asset-uses">'+signatureLibraryStates.map(state=>{const row=catalog.find(row=>row.id==='signature/'+state+'/email');return use({...row,routes:[]});}).join('')+'</div></article>':'';
    let marketIconCard='';
    if(state==='svg'){
      const icon=marketPriceIconAsset(catalog);
      marketIconCard='<article class="ops-panel qa-asset-card" data-icon="market-price">'+marketPriceIconPreview+'<h2>'+esc(icon.name)+'</h2><p class="muted">사용 상태 '+icon.usages.length+'개</p><div class="qa-asset-uses">'+icon.usages.map(row=>use(row)).join('')+'</div></article>';
    }
    const content='<nav class="qa-mvp-toolbar" aria-label="자산 종류">'+nav+'</nav><p class="muted">미리보기에서 자산을 찾고, 원본 화면에서 입력과 동작을 확인할 수 있어요.</p><div class="qa-asset-grid">'+assets.filter(a=>a.board===state).map(a=>'<article class="ops-panel qa-asset-card"><div class="qa-asset-thumbnail" aria-hidden="true" inert><div class="ds">'+(scopeThumbnail(a.preview,a.id)||'<p>'+esc(a.name)+' · 전체 화면에서 보기</p>')+'</div></div><h2>'+esc(a.name)+'</h2><p class="muted">사용 상태 '+(a.sourceUsages||a.usages).length+'개 · '+a.variants.length+'개 변형</p>'+go('사용처와 동작 보기','component-library','asset-'+a.id)+'</article>').join('')+marketIconCard+signatureCard+'</div>';
    await add({...(hasSignature?{css:qaMvpCss+signatureLibraryCss,mount:standardMount+'\n'+signatureLibraryRuntime}:{}),screen:'component-library',state,label:'컴포넌트 라이브러리',stateLabel:name,body:page(name,content,{library:true,screen:'component-library'}),description:'보드는 시각적 색인입니다. 각 상세는 컴포넌트 루트·원본 사용 화면·런타임을 연결합니다.'});
  }
  const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
  for(const asset of assets){
    const usages=asset.sourceUsages||asset.usages,source=catalog.find(r=>r.id===asset.previewContext?.id);
    const context=source?{screen:source.screen,state:source.state,variant:source.variant,selector:asset.previewContext.selector,index:asset.previewContext.index||0,runtimeFamily:source.runtimeFamily||fallback[source.screen]||null,source:source.current}:null;
    let contextBody=source?await inflate(frames[source.current]):'';
    contextBody=contextBody.replace('id="order-single"','id="order-component-source" data-component-source');
    const isArt=asset.board==='three-d';
    const controls=isArt?'<nav class="qa-mvp-toolbar" aria-label="3D 이미지 상태">'+go('원본','component-library','asset-intro-art')+go('부유 변형','component-library','asset-intro-art-float')+go('강조 변형','component-library','asset-intro-art-emphasis')+'</nav>':'';
    const variants='<details class="ops-panel"><summary>컴포넌트 변형 '+asset.variants.length+'개</summary><div class="qa-asset-uses">'+asset.variants.map(v=>{const control=v.uses.find(point=>point.id===v.source&&point.index===v.index)||v.uses[0],u=control&&usages.find(u=>u.id===control.id);return u?use(u,{...control,variantId:v.id}):'';}).join('')+'</div></details>';
    const headingMarkup='<div class="qa-component-controls"><h2>원본 동작 화면</h2><p class="muted">'+esc(source?source.label+' · '+source.stateLabel:'원본 화면 연결 대기')+'</p>'+status('component-runtime','원본 런타임을 연결하는 중이에요.')+'</div>';
    const contextMarkup='<section class="qa-component-context" aria-label="원본 컴포넌트 사용 화면">'+contextBody+'</section>';
    const preview=asset.motion?'<section class="ops-panel"><p class="muted" data-qa-motion-provenance>원본 3D 이미지의 '+(asset.motion==='float'?'부유':'강조')+' 변형입니다. 원본 화면의 동작과 별도로 검토해 주세요.</p><div class="qa-art-stage" data-qa-art-motion="'+asset.motion+'" data-qa-art-status="idle">'+asset.preview+'</div><div class="qa-mvp-toolbar">'+button('재생',{'data-qa-art-play':''},'primary')+button('일시정지',{'data-qa-art-pause':'',disabled:''})+button('초기화',{'data-qa-art-reset':'',disabled:''})+'</div>'+status('qa-art-status-text','정지 · 재생을 눌러 확인해 주세요.')+'</section>':
      headingMarkup+contextMarkup;
    const before='<div class="qa-mvp-toolbar">'+go('보드로 돌아가기','component-library',asset.board)+(asset.id==='brand-motion'?button('로고 동작 다시 재생',{'data-qa-brand-replay':''}):'')+'</div>'+controls;
    const after='<p class="muted">이 자산에 대한 의견과 미해결·재검토·해결 상태는 우측 검토에 기록합니다.</p>'+variants+'<h2>사용처 '+usages.length+'개</h2><div class="qa-asset-uses">'+usages.map(u=>use(u)).join('')+'</div>';
    let body=page(asset.name,before,{library:true,screen:'component-library'}).replace('</main>',preview+'<section class="qa-library-chrome">'+after+'</section></main>');
    // The live source is a sibling of library chrome, so admin/new-page selectors
    // cannot restyle its buttons, fields or dialogs. Its complete root is retained.
    const mount=(context?.runtimeFamily?runtimes[context.runtimeFamily]+'\n':'')+dependencies+'\nwindow.ORDER_LIBRARY_SOURCE='+js(context)+';\n('+qaMvpRuntimeCode+')();';
    await add({screen:'component-library',state:'asset-'+asset.id,label:'컴포넌트 라이브러리',stateLabel:asset.name,body,mount,description:asset.motion?'원본 이미지의 별도 모션 변형입니다.':'전체 원본 문맥과 런타임을 보존한 컴포넌트 · '+asset.name});
    if(!asset.motion)documents.get('component-library/asset-'+asset.id+'/email').libraryContext={assetId:asset.id,contextMarkup,headingMarkup};
  }
  const montages={...bloubMontages,...waitMontages};
  const resultTemplates=(await Promise.all(['saving','equal','current-lower','no-current'].map(async state=>{
    const row=catalog.find(r=>r.screen==='quote-result'&&r.state===state),body=await inflate(frames[row.current]);
    return '<template data-result-template="'+state+'"><h2>'+esc(row.stateLabel)+'</h2><div class="qa-result-composition">'+body.replace('id="order-single"','data-result-preview="true"')+'</div>'+button('이 결과 화면 검토',{'data-result-open':''})+'</template>';
  }))).join('');
  const bloubBody=page('BLOUB_EGG 상태 조합','<nav class="qa-mvp-toolbar">'+nav+'</nav><div class="ops-form-grid">'+
    select('상위 상태','bloub-upper',[['entry','등장 → 비교'],['comparing','비교 중'],['delayed','지연']],{'data-bloub-upper':''})+
    select('결과 상태','bloub-result',[['complete','견적 완료']],{'data-bloub-result':''})+
    select('결과 화면','bloub-outcome',[['saving','절감'],['equal','동일 가격'],['current-lower','현재가 우위'],['no-current','현재가 미입력']],{'data-bloub-outcome':''})+'</div>'+check('연속 반복','bloub-loop',{'data-bloub-loop':''})+
    '<div class="qa-mvp-toolbar">'+button('상위 → 결과 연속 재생',{'data-bloub-play':''},'primary')+button('상위 상태만 재생',{'data-bloub-single':''})+button('일시정지',{'data-bloub-pause':''})+button('처음으로',{'data-bloub-reset':''})+'</div><div class="qa-bloub-preview" data-bloub-preview data-result="false"><div class="qa-bloub-stage" data-bloub-player-slot></div><div data-bloub-result-panel hidden></div></div>'+resultTemplates+status('bloub-status','재생할 상태를 선택해 주세요.')+'<h2>사용처</h2><div class="qa-asset-uses">'+catalog.filter(r=>['quote-wait','quote-result'].includes(r.screen)).map(r=>use({...r,routes:[]})).join('')+'</div>',{library:true,screen:'component-library'});
  await add({screen:'component-library',state:'bloub',label:'컴포넌트 라이브러리',stateLabel:'BLOUB_EGG 상태 조합',body:bloubBody,mount:dependencies+'\n'+bloubScript+'\n('+qaMvpRuntimeCode+')('+js(montages)+');'});

  // These chips control only the injected response state. They render the same
  // purchase form and mount function as the product and preserve all old IDs.
  const purchase=documents.get('store-purchase/select/email');
  for(const [state,stateLabel,fixture] of [
    ['qa-loading','불러오는 중',{scenario:'loading'}],['qa-error','요청 실패',{scenario:'error'}],
    ['qa-empty','판매 상품 없음',{scenario:'empty'}],['qa-guest','로그인 전',{authenticated:false}]
  ])await add({...purchase.row,state,stateLabel,body:purchase.body,mount:purchase.mount,qaOnly:true,fixture,
    description:'실제 구매 화면을 QA 더미 응답으로 제어합니다. 상태를 다시 선택하면 초기 자료로 돌아갑니다.'});
  for(const document of await getPriceWorkspaceQaDocuments())await add({...document.row,...document,css:qaMvpCss+document.css,
    screen:document.row.screen,state:document.row.state,label:document.row.label,stateLabel:document.row.stateLabel,qaOnly:true});
  return {rows,documents,assets};
}
