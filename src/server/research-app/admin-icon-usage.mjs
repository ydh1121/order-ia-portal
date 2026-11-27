// The library's existing asset pack owns the mapping from icons to controls,
// screen states and routes. Read that same index for the administrator view.
import {marketPriceIconAsset,marketPriceIconPreview} from '../product-ui/market-price-icon.mjs';
import {catalog} from '../product-ui/catalog.gen.mjs';
import {assetPack} from '../r3-ui/qa-assets.gen.mjs';

export const adminIconRow=Object.freeze({id:'admin-icon-library/list/email',screen:'admin-icon-library',state:'list',variant:'email',group:'관리자 · 공통 자산',label:'아이콘 라이브러리',stateLabel:'사용처',defaultWidth:390,role:'admin',phase:'current',runtimeFamily:'researchAdminIcons',supplemental:true});

export function adminIconMenu(body){
  const match=/<nav\b[^>]*aria-label="관리자 메뉴"[^>]*>[\s\S]*?<\/nav>/.exec(body);
  if(!match)return body;
  const legacy=match[0].includes('qa-admin-nav-item');
  const button='<button type="button" class="'+(legacy?'qa-admin-nav-item':'ops-nav')+'" data-op-route="admin-icon-library" data-qa-action="admin-route" data-target="admin-icon-library" title="아이콘 사용처"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M3 21l3.5-7 3.5 7z"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg><span>아이콘 사용처</span></button>';
  return body.replace(match[0],match[0].replace('</nav>',button+'</nav>'));
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qaLink=id=>'/ia?view=qa-lab&amp;screen='+encodeURIComponent(id);
function usageGroup(asset){
  const grouped=new Map(),points=new Map();
  for(const variant of asset.variants)for(const point of variant.uses){if(!points.has(point.id))points.set(point.id,point);}
  for(const row of asset.usages){
    if(!grouped.has(row.screen))grouped.set(row.screen,{label:row.label,rows:[]});
    grouped.get(row.screen).rows.push(row);
  }
  return [...grouped].map(([screen,{label,rows}])=>{
    const list=rows.map(row=>{
      const point=points.get(row.id);
      const control=point?.controlLabel;
      return '<li><a href="'+qaLink(row.id)+'" target="_blank" rel="noopener">'+esc(row.stateLabel||row.state)+'</a>'
        +'<span>'+esc([row.variant,...row.routes||[]].join(' · '))+'</span>'
        +(control?'<small>'+esc(control)+'</small>':'')+'</li>';
    }).join('');
    return '<details'+(asset.id==='empty-ticket'?' open':'')+'><summary>'+esc(label)+' <small>'+rows.length+'개 상태</small></summary><ul>'+list+'</ul></details>';
  }).join('');
}

let cached;
export function adminIconMarkup(isCurrent){
  return cached??=(async()=>{
    const bytes=Uint8Array.from(atob(assetPack),c=>c.charCodeAt(0));
    const assets=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    const pass=assets.find(a=>a.id==='pass');
    const empty={...pass,id:'empty-ticket',name:'오더 패스 · 빈 견적',usages:pass.usages.filter(u=>u.id==='passes/empty/email')};
    if(!empty.usages.length)throw Error('EMPTY_TICKET_USAGE_MISSING');
    const locks=['locked','locked-guest'].map(state=>({id:'quote-result/'+state+'/email',screen:'quote-result',label:'견적 결과',state,stateLabel:state==='locked'?'사업장 인증 전':'비회원',variant:'email',routes:[]}));
    const registeredIcons=assets.filter(a=>a.board==='svg').map(a=>({...a,usages:a.usages.filter(isCurrent)}));
    const brand=registeredIcons.find(a=>a.id==='brand-motion');
    if(brand)brand.usages.push(locks[1]);
    const market=marketPriceIconAsset(catalog.filter(isCurrent));
    const icons=[empty,market,...registeredIcons,{id:'quote-lock',name:'견적 결과 자물쇠',usages:locks,variants:[]}];
    const options=icons.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
    const sections=icons.map((a,i)=>'<section data-icon-uses="'+esc(a.id)+'"'+(i?' hidden':'')+'>'+(a===market?marketPriceIconPreview:'')+'<h2>'+esc(a.name)+'</h2><p>사용 상태 '+a.usages.length+'개</p>'+usageGroup(a)+'</section>').join('');
    return '<section class="admin-icon-usage" aria-label="아이콘 사용처"><h1>아이콘 사용처</h1><label>아이콘<select>'+options+'</select></label>'+sections+'</section>';
  })();
}

export function installAdminIconUsage(){
  (window.ORDER_DESIGN_MODULES||=[]).push({id:'admin-icon-library',mount(root){
    const select=root.querySelector('.admin-icon-usage select');
    const onChange=()=>{for(const section of root.querySelectorAll('[data-icon-uses]'))section.hidden=section.dataset.iconUses!==select.value;};
    select.addEventListener('change',onChange);return ()=>select.removeEventListener('change',onChange);
  }});
}

export const adminIconCss=`
.admin-icon-usage{box-sizing:border-box;width:min(100%,760px);margin:0 auto;padding:28px 24px 48px;color:#20272b;font-family:var(--font,Pretendard,sans-serif)}
.admin-icon-usage h1{font-size:26px;line-height:1.4;margin:0 0 24px}.admin-icon-usage label{display:grid;gap:8px;font-size:14px;font-weight:600}
.admin-icon-usage select{width:100%;max-width:360px;height:44px;padding:0 12px;border:1px solid #cdd4df;border-radius:8px;background:#fff;color:inherit;font:inherit}
.admin-icon-usage section{margin-top:32px}.admin-icon-usage [hidden]{display:none!important}.admin-icon-usage h2{font-size:19px;margin:0}
.admin-icon-usage p,.admin-icon-usage small,.admin-icon-usage li span{color:#545e6c;font-size:13px}.admin-icon-usage details{border-bottom:1px solid #dce1e7}.admin-icon-usage summary{padding:14px 0;cursor:pointer;font-weight:600}.admin-icon-usage ul{margin:0 0 16px;padding:0 0 0 18px}
.admin-icon-usage li{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;padding:6px 0}.admin-icon-usage li a{font-weight:600;color:#315de6;text-decoration:underline}.admin-icon-usage li small{flex-basis:100%}
`;
