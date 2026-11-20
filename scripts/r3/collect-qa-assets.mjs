// Derive shared UI, component roots and actual use sites from the shipped product.
// A thumbnail is only a visual index. Live details retain the entire source frame.
import {writeFile,readFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {catalog,frames} from '../../src/server/r3-ui/catalog.gen.mjs';
import {approvedRegistry} from '../../src/server/r3-ui/approved-registry.mjs';
import {runtimes} from '../../src/server/r3-ui/runtime.gen.mjs';
import {registerQaMvp} from '../../src/server/r3-ui/qa-mvp-runtime.mjs';
import {browserFunction} from '../../src/server/browser-source.mjs';
import {mountMagneticAction} from '../../src/server/order-engine/browser/magnetic-action.mjs';
import {mountSheetGesture} from './authored/sheet-motion.mjs';
const require=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const digest=value=>createHash('sha256').update(value).digest('hex');
const source=new Map();
const body=row=>{if(!source.has(row.current))source.set(row.current,gunzipSync(Buffer.from(frames[row.current],'base64')).toString());return source.get(row.current);};
const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
const specs=[
  ['email','components','이메일 입력','input[type=email]','input','.field'],
  ['password','components','비밀번호 입력','input[type=password]','input','.field'],
  ['select','components','선택·휠 피커','select','select','.ops-select-field,.field,label'],
  ['checkbox','components','동의·복수 선택','input[type=checkbox]','checkbox','.check-row,label'],
  ['toggle','components','알림 스위치','[role=switch]','switch','.mf-setting-row,.nav-setting-row,.setting-row'],
  ['upload','components','파일 업로드','input[type=file]','file','.upload-zone,.upload-field,.field,label'],
  ['dialog','components','바텀시트·대화상자','[role=dialog]','dialog','.auth-scene,.ob-company-shade,.nav-modal-shade'],
  ['tags','components','태그·자동 추천','.tag-field','tag-field','.field'],
  ['skeleton','components','스켈레톤','[class*=skeleton],[class*=skel]','skel','.t-skel,.ops-panel'],
  ['button-primary','components','기본 행동 버튼','.btn.primary','primary',null],
  ['button-secondary','components','보조 행동 버튼','.btn.secondary','secondary',null],
  ['pass','components','오더 패스 카드','.pass-card,.pass-ticket,.nav-ticket,.nav-pass,.order-pass','pass',null],
  ['result','components','견적 결과·상세 카드','[data-order-result]','data-order-result',null],
  ['header-logo','logos','헤더 로고','.brand,.ob-brand,.oq-brand','brand',null],
  ['footer-logo','logos','푸터·소개 로고','footer .brand,footer .ob-dots-logo,.ob-drawer .ob-dots-logo','logo',null],
  ['logo-menu','components','로고 케밥·팝오버','[data-order-menu],.ob-mark-btn,.brand[data-brand-account]','brand','.ob-header,.page-head,.brand'],
  ['pass-floating','components','오더 패스 플로팅 버튼','.ob-quick,.pass-fab,[data-pass-fab]','quick',null],
  ['footer','components','푸터·약관','footer','footer',null],
  ['spinner','svg','처리 중 SVG 아이콘','.spinner,.t-spinner','spinner',null],
  ['brand-motion','svg','브랜드 점 애니메이션','svg[data-code1-jelly],svg.brand-mark','svg','.brand,.ob-brand'],
  ['back-icon','svg','이전 아이콘','button[data-action=back] svg','svg','button'],
  ['status-icon','svg','확인·상태 아이콘','.mf-row-icon svg,.inline-field-state svg,.field-error-icon svg','svg',null],
  ['intro-art','three-d','첫 화면 3D 원본','.ob-art','ob-art',null]
];
const assets=specs.map(([id,board,name,selector,needle,rootSelector])=>({id,board,name,selector,needle,rootSelector,usages:[],variants:[],preview:'',previewContext:null}));
function collect(row,html,{supplemental=false,runtime=null}={}){
  const possible=assets.filter(a=>html.includes(a.needle));if(!possible.length)return;
  const doc=new JSDOM(html).window.document;
  for(const a of possible){
    const family=row.runtimeFamily||fallback[row.screen]||null;
    // Verified authored consumers: other families merely bundle the module and
    // must not be counted as menu usages without a matching mount call path.
    const brandConsumer=supplemental||(['onboarding','profile','login','signup','otp','password'].includes(row.screen)&&Boolean(runtimes[family]?.includes('mountBrandAccountMenu')));
    const selector=a.id==='logo-menu'&&brandConsumer?'.brand,.ob-brand':a.selector;
    const elements=[...doc.querySelectorAll(selector)];if(!elements.length)continue;
    const usage={id:row.id,screen:row.screen,state:row.state,variant:row.variant,label:row.label,stateLabel:row.stateLabel,routes:approvedRegistry[row.screen]?.routeIds||[],source:row.current||digest(html),runtimeFamily:supplemental?'qaMvp':family,runtimeSource:runtime?digest(runtime):family&&runtimes[family]?digest(runtimes[family]):null,...(a.id==='logo-menu'&&brandConsumer?{binding:'mountBrandAccountMenu'}:{}),supplemental,count:elements.length};
    a.usages.push(usage);
    elements.forEach((el,index)=>{
      const component=(a.rootSelector&&el.closest(a.rootSelector))||el;
      // Preserve labels, ARIA references, errors, controls and original root classes.
      // No hidden/ID rewriting: visual thumbnails are isolated/inert in the index.
      const preview=component.outerHTML;
      const structural=component.cloneNode(true);
      for(const n of [structural,...structural.querySelectorAll('*')]){
        n.removeAttribute('id');n.removeAttribute('value');n.removeAttribute('for');n.removeAttribute('aria-labelledby');n.removeAttribute('aria-describedby');
        n.removeAttribute('data-source-target');
      }
      const signature=digest(structural.outerHTML.replace(/qa-[a-z0-9_-]+-\d+/g,'qa-field'));
      let variant=a.variants.find(v=>v.signature===signature);
      if(!variant){variant={id:a.id+'-'+signature.slice(0,12),signature,rootTag:component.tagName.toLowerCase(),rootClass:component.className?.baseVal??component.className??'',label:row.label+' · '+row.stateLabel,index,source:usage.id,uses:[]};a.variants.push(variant);}
      variant.uses.push({id:usage.id,index});
      const rank=a.id==='logo-menu'?(row.screen==='onboarding'&&row.state==='member-1'?100:0):['brand-motion','header-logo'].includes(a.id)?(row.screen==='onboarding'&&row.state==='intro-1'?100:0):0;
      if(!a.previewContext||rank>(a.previewRank??-1)){a.previewRank=rank;a.preview=preview.length<22000?preview:'';a.previewContext={...usage,index,selector,rootSelector:a.rootSelector};}
    });
  }
  doc.defaultView.close();
}
for(const row of catalog)if(row.screen!=='common')collect(row,body(row));
const art=JSON.parse(await readFile(new URL('./authored/onboarding-art.json',import.meta.url),'utf8'));
const intro=assets.find(a=>a.id==='intro-art');
if(intro)intro.preview='<img alt="첫 화면 3D 일러스트" width="'+art.width+'" height="'+art.height+'" src="data:image/webp;base64,'+art.data+'">';
const coreEnd=runtimes.accountFeedback.indexOf('})(window);');
if(coreEnd<0||!runtimes.accountFeedback.startsWith('(function (w) {'))throw Error('Original shared QAUI core missing');
const sharedCoreScript=runtimes.accountFeedback.slice(0,coreEnd+'})(window);'.length);
const coreBody=sharedCoreScript.slice('(function (w) {'.length,-'})(window);'.length);
const shellRow=catalog.find(r=>r.id==='admin-settlements/summary/email');
const shellDom=new JSDOM(body(shellRow)),shell=shellDom.window.document.querySelector('.ops-page');
const brand=shell.querySelector('.brand').outerHTML;
shell.querySelector('.ops-content').innerHTML='<!--ORDER_CONTENT-->';
shell.querySelector('.ops-topline').innerHTML='<span>관리자</span><span data-app-identity></span>';
shell.dataset.opsModule='__ORDER_SCREEN__';
for(const nav of shell.querySelectorAll('.ops-nav'))nav.classList.remove('active');
const opsShell=shell.outerHTML;shellDom.window.close();
const supplierRow=catalog.find(r=>r.id==='supplier-shipments/packing/email');
const supplierDom=new JSDOM(body(supplierRow)),supplierShell=supplierDom.window.document.querySelector('.ops-page');
supplierShell.querySelector('.ops-content').innerHTML='<!--ORDER_CONTENT-->';
supplierShell.querySelector('.ops-topline').innerHTML='<span>공급처</span><span data-app-identity></span>';
supplierShell.dataset.opsModule='__ORDER_SCREEN__';
for(const nav of supplierShell.querySelectorAll('.ops-nav'))nav.classList.remove('active');
const supplierOpsShell=supplierShell.outerHTML;supplierDom.window.close();
const commonRow=catalog.find(r=>r.id==='common/default/email');
const libraryCss=[...body(commonRow).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n').replaceAll('#r3-component-library','.qa-library-chrome');
const begin=runtimes.onboarding.indexOf('(()=>{/* CODE1 jelly motion v2.'),end='window.Code1Jelly=Code1Jelly;})();';
if(begin<0||!runtimes.onboarding.includes(end))throw Error('Original brand motion runtime missing');
const brandMotionScript=runtimes.onboarding.slice(begin,runtimes.onboarding.indexOf(end,begin)+end.length);
const commonMotionScript='window.OrderMagneticAction=('+browserFunction(mountMagneticAction)+');\nwindow.ORDER_QA_SHEET=('+browserFunction(mountSheetGesture)+');';
let brandAccountScript='',brandAccountCss='';
try{
  const module=await import('../../src/server/order-engine/browser/brand-account-menu.mjs');
  brandAccountScript='window.mountBrandAccountMenu=('+browserFunction(module.mountBrandAccountMenu)+');';brandAccountCss=module.brandAccountMenuCss;
}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const data=()=>assets.filter(a=>a.usages.length).map(({needle,previewRank,...a})=>({...a,sourceSha256:digest(a.preview)}));
async function save(){
  const values={assetPack:gzipSync(JSON.stringify(data())).toString('base64'),brandMotionScript,commonMotionScript,brandAccountScript,brandAccountCss,sharedCoreScript,sharedTemplates:{brand,opsShell,supplierOpsShell,libraryCss},sharedUiProvenance:{coreSha256:digest(sharedCoreScript),shellId:shellRow.id,shellSource:shellRow.current},qaMvpRuntimeCode:browserFunction(registerQaMvp)};
  await writeFile(new URL('../../src/server/r3-ui/qa-assets.gen.mjs',import.meta.url),'// Derived from canonical product components. Regenerate with scripts/r3/collect-qa-assets.mjs.\n'+Object.entries(values).map(([k,v])=>'export const '+k+'='+JSON.stringify(v)+';').join('\n')+'\nexport function createSharedUi(w){'+coreBody+'\nreturn w.QAUI;\n}\n');
}
await save();
if(!process.argv.includes('--core-only')){
  // The first pass makes shared factories available without a generated-module cycle.
  // Supplemental library pages are excluded; they are consumers, never product usages.
  const {getQaSupplemental}=await import('../../src/server/r3-qa-assets.mjs');
  const supplemental=await getQaSupplemental();
  for(const [id,doc] of supplemental.documents)if(doc.row.screen!=='component-library'){
    for(const asset of assets){asset.usages=asset.usages.filter(u=>u.id!==id);for(const variant of asset.variants)variant.uses=variant.uses.filter(u=>u.id!==id);asset.variants=asset.variants.filter(v=>v.uses.length);}
    collect({...doc.row,current:digest(doc.body)},doc.body,{supplemental:true,runtime:doc.mount});
  }
  await save();
}
console.log(JSON.stringify(data().map(a=>({id:a.id,uses:a.usages.length,variants:a.variants.length,root:a.previewContext?.rootSelector})),null,2));
