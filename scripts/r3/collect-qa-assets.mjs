// Read the shipped frames; the index never infers a component's usage from its name.
import {writeFile,readFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {catalog,frames} from '../../src/server/r3-ui/catalog.gen.mjs';
import {approvedRegistry} from '../../src/server/r3-ui/approved-registry.mjs';
import {runtimes} from '../../src/server/r3-ui/runtime.gen.mjs';
import {registerQaMvp} from '../../src/server/r3-ui/qa-mvp-runtime.mjs';
import {browserFunction} from '../../src/server/browser-source.mjs';
const require=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const source=new Map();
const body=row=>{if(!source.has(row.current))source.set(row.current,gunzipSync(Buffer.from(frames[row.current],'base64')).toString());return source.get(row.current);};
const specs=[
  ['email','components','이메일 입력','input[type=email]','input'],
  ['password','components','비밀번호 입력','input[type=password]','input'],
  ['select','components','선택·휠 피커','select','select'],
  ['checkbox','components','동의·복수 선택','input[type=checkbox]','checkbox'],
  ['toggle','components','알림 스위치','[role=switch]','switch'],
  ['upload','components','파일 업로드','input[type=file]','file'],
  ['dialog','components','바텀시트·대화상자','[role=dialog]','dialog'],
  ['tags','components','태그·자동 추천','.tag-field','tag-field'],
  ['skeleton','components','스켈레톤','[class*=skeleton],[class*=skel]','skel'],
  ['button-primary','components','기본 행동 버튼','.btn.primary','primary'],
  ['button-secondary','components','보조 행동 버튼','.btn.secondary','secondary'],
  ['pass','components','오더 패스 카드','.pass-card,.pass-ticket,.nav-ticket,.nav-pass','pass'],
  ['result','components','견적 결과·상세 카드','[data-order-result]','data-order-result'],
  ['header-logo','logos','헤더 로고','.brand,.ob-brand,.oq-brand','brand'],
  ['footer-logo','logos','푸터·소개 로고','footer .brand,footer .ob-dots-logo,.ob-drawer .ob-dots-logo','logo'],
  ['logo-menu','components','로고 케밥·팝오버','[data-order-menu],.ob-mark-btn','menu'],
  ['pass-floating','components','오더 패스 플로팅 버튼','.ob-quick,.pass-fab,[data-pass-fab]','quick'],
  ['footer','components','푸터·약관','footer','footer'],
  ['spinner','svg','처리 중 SVG 아이콘','.spinner,.t-spinner','spinner'],
  ['brand-motion','svg','브랜드 점 애니메이션','svg[data-code1-jelly],svg.brand-mark','svg'],
  ['back-icon','svg','이전 아이콘','button[data-action=back] svg','svg'],
  ['status-icon','svg','확인·상태 아이콘','.mf-row-icon svg,.inline-field-state svg','svg'],
  ['intro-art','three-d','첫 화면 3D 원본','.ob-art','ob-art']
];
const assets=specs.map(([id,board,name,selector,needle])=>({id,board,name,selector,needle,usages:[],preview:''}));
for(const row of catalog){
  if(row.screen==='common')continue; // The old component index is a reference, never a product usage.
  const html=body(row),possible=assets.filter(a=>html.includes(a.needle));if(!possible.length)continue;
  const doc=new JSDOM(html).window.document;
  for(const a of possible){
    const el=doc.querySelector(a.selector);if(!el)continue;
    a.usages.push({id:row.id,screen:row.screen,state:row.state,variant:row.variant,label:row.label,stateLabel:row.stateLabel,routes:approvedRegistry[row.screen]?.routeIds||[],source:row.current});
    if(!a.preview){
      const node=el.cloneNode(true);
      for(const sub of [node,...node.querySelectorAll('*')]){
        sub.removeAttribute('id');sub.removeAttribute('hidden');
        for(const attr of [...sub.attributes])if(attr.name.startsWith('on')||attr.name==='srcdoc'||['autofocus','action','formaction'].includes(attr.name))sub.removeAttribute(attr.name);
        if(sub.matches('input,textarea,select,button')){sub.setAttribute('tabindex','-1');sub.setAttribute('aria-hidden','true');}
      }
      // Complete result screens and long drawers retain an identified source and use a compact linked preview.
      a.preview=node.outerHTML.length<18000?node.outerHTML:'<strong>'+a.name+'</strong><p>'+row.label+' · '+row.stateLabel+'</p>';
    }
  }
  doc.defaultView.close();
}
const art=JSON.parse(await readFile(new URL('./authored/onboarding-art.json',import.meta.url),'utf8'));
const intro=assets.find(a=>a.id==='intro-art');
if(intro)intro.preview='<img alt="첫 화면 3D 일러스트" width="'+art.width+'" height="'+art.height+'" src="data:image/webp;base64,'+art.data+'">';
const data=assets.filter(a=>a.usages.length).map(({needle,selector,...a})=>({...a,sourceSha256:createHash('sha256').update(a.preview).digest('hex')}));
const begin=runtimes.onboarding.indexOf('(()=>{/* CODE1 jelly motion v2.'),end='window.Code1Jelly=Code1Jelly;})();';
if(begin<0||!runtimes.onboarding.includes(end))throw Error('Original brand motion runtime missing');
const brandMotionScript=runtimes.onboarding.slice(begin,runtimes.onboarding.indexOf(end,begin)+end.length);
await writeFile(new URL('../../src/server/r3-ui/qa-assets.gen.mjs',import.meta.url),'// Derived from preserved product frames by scripts/r3/collect-qa-assets.mjs.\n// Browser runtime is frozen here so Worker bundling cannot change review hashes.\nexport const assetPack='+JSON.stringify(gzipSync(JSON.stringify(data)).toString('base64'))+';\nexport const brandMotionScript='+JSON.stringify(brandMotionScript)+';\nexport const qaMvpRuntimeCode='+JSON.stringify(browserFunction(registerQaMvp))+';\n');
console.log(JSON.stringify(data.map(a=>({id:a.id,uses:a.usages.length,preview:a.preview.length}))));
