import {catalog, cssHash, cssGzip, previousCssGzip, previousCssHash, frames, release} from './r3-ui/catalog.gen.mjs';
import {hostCode,frameCode,runtimes} from './r3-ui/runtime.gen.mjs';

const utf8=new TextEncoder(),widths=[320,390,768,1440];
const js=v=>JSON.stringify(v).replaceAll('<','\\u003c');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cached=new Map();
async function sha(s){const b=await crypto.subtle.digest('SHA-256',utf8.encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function inflate(data){const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
let stylesheet,oldStylesheet;
const styles=version=>version==='previous'?(oldStylesheet??=inflate(previousCssGzip)):(stylesheet??=inflate(cssGzip));
const frameStyle=`
#r3-veil{position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:pan-x pan-y;background:transparent;outline:none}#r3-veil:not([hidden]):focus-visible:after{content:"+";position:absolute;left:var(--x,50%);top:var(--y,50%);color:#214ca8}
#r3-pins{position:fixed;inset:0;pointer-events:none;z-index:2147483646}.r3-pin{position:absolute;transform:translate(-50%,-50%);border:2px solid white;border-radius:1em;background:#214ca8;color:white;pointer-events:auto;font:700 15px/1 system-ui;padding:5px}.r3-options{position:fixed;z-index:10000;left:var(--left);top:var(--top);width:var(--width);max-height:32vh;overflow:auto;background:white;border:1px solid #b0b8c1;box-shadow:0 3px 12px #0002}.r3-options[hidden]{display:none}.r3-options button{display:block;text-align:left;padding:8px;width:100%;border:0;background:white}
`;
const hashFrame=(r,width,version)=>r[version==='previous'?'previousHashes':'hashes'][width];
export async function isR3ReviewTarget(target,revision=release){
  if(revision!==release||!target||!widths.includes(target.viewport))return false;
  const row=catalog.find(f=>f.screen===target.screen&&f.state===target.state&&f.variant===target.variant);
  return !!row && (row.hashes[target.viewport]===target.artifactHash||row.previousHashes[target.viewport]===target.artifactHash);
}
const apiHeaders={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none';frame-ancestors 'none';sandbox",'X-Robots-Tag':'noindex'};
const json=(j,status=200)=>Response.json(j,{status,headers:apiHeaders});
export async function serveR3Artifact(request){
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  const q=new URL(request.url).searchParams;
  if(!q.has('id')){
    if(q.size)return json({error:'INVALID_CATALOG_REQUEST'},400);
    // Hashes are cached per isolate and loaded only for the visible width.
    const items=catalog.map(({id,screen,state,variant,group,label,stateLabel,defaultWidth,phase,role,authoredChange,hashes})=>({hashes,id,screen,state,variant,group,label,stateLabel,defaultWidth,phase,role,authoredChange:Boolean(authoredChange)}));
    return json({release,items});
  }
  const r=catalog.find(f=>f.id===q.get('id')); const width=Number(q.get('width'));const version=q.get('version');
  if(!r||!widths.includes(width)||!['current','previous'].includes(version)||[...q.keys()].some(k=>!['id','width','version'].includes(k)))return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  const body=await inflate(frames[r[version]]),css=await styles(version),artifactHash=await hashFrame(r,width,version);
  const title=esc(r.label+' · '+r.stateLabel);
  const common='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+title+'</title>';
  const meta=js({release,artifactHash,version,screen:r.screen,state:r.state,variant:r.variant,viewport:width,bodySha256:r[version],cssSha256:version==='previous'?previousCssHash:cssHash});
  const page=common+'<!--R3-POLICY--><style>'+css+frameStyle+'</style></head><body>'+body+'<!--R3-FRAME--></body></html>';
  const editable=common+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:;form-action \'none\';base-uri \'none\'"><style>'+css+'\nbody{max-width:'+width+'px}</style></head><body>'+body+'<script type="application/json" id="frame-meta">'+meta+'</script></body></html>';
  const candidates={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',onboarding:'member', 'quote-wait':'member'};
  const mount=version==='current'&&Object.hasOwn(candidates,r.screen)?runtimes[candidates[r.screen]]:null;
  return json({release,hash:artifactHash,html:page,editable,exportHash:await sha(editable),mount,file:release+'_'+r.id.replaceAll('/','_')+'_'+width+'.html'});
}
export function renderR3Qa(nonce){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Order · QA 검토</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:#191f28;font:15px/1.5 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}button,a,select,input,textarea{font:inherit;color:inherit}button,a.tool,select{min-height:40px;padding:6px 11px;border:1px solid #d4d9df;border-radius:8px;background:white;cursor:pointer;text-decoration:none}button:hover,a.tool:hover{background:#f2f4f6}:focus-visible{outline:3px solid #1764dc;outline-offset:1px}button[aria-pressed=true],button[aria-current=true]{color:#12459e;border-color:#4787ed;background:#ecf3ff}header,.bar,.controls,nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{background:white;padding:8px 12px;border-bottom:1px solid #d9dde2}header strong{margin-right:6px}a{color:#164c9e}.bar{padding:7px 12px}.bar details{margin-left:auto}details>div{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px}.filters{display:flex;gap:6px;overflow:auto;flex-wrap:nowrap;padding:3px 12px}.filters button{white-space:nowrap}.surface{overflow:auto;margin:0 auto;max-width:100%;padding:4px 0 12px;text-align:center}.surface iframe{width:var(--width,390px);height:max(64vh,calc(100dvh - 185px));border:0;background:white;vertical-align:top}.sheet{position:fixed;z-index:2;inset:0 0 0 auto;width:min(386px,100%);padding:16px;background:white;overflow:auto;box-shadow:0 0 18px #0002}.sheet article{border-top:1px solid #e5e8eb;padding:10px 0}.sheet article p,.sheet small{overflow-wrap:anywhere;white-space:pre-wrap}.sheet textarea{width:100%;min-height:8em;padding:10px}.sheet .controls{padding:8px 0}.sheet .controls button{min-height:44px}.sheet[hidden],[hidden]{display:none!important}dialog{width:min(780px,96vw);max-height:90vh;border:0;border-radius:14px;padding:16px}.tile{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch}.tile button:last-child{font-size:12px;min-width:44px}dialog::backdrop{background:#191f2866}dialog input{padding:8px;max-width:100%;flex:1}#tiles{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));margin-top:12px}#tiles button{text-align:left}#tiles span,#tiles strong{display:block}#tiles span,small{color:#536171;font-size:12px}#live{min-height:1.5em;color:#344356;margin:0 12px}.drawer-title{justify-content:space-between}#conflict{background:#fff0de;padding:8px;white-space:pre-wrap}.surface:focus-within{outline:1px solid #b0b8c1}.bar summary{cursor:pointer}
@media(max-width:550px){header,.bar{gap:4px;padding:5px 7px}header strong{font-size:14px}button,a.tool,select{min-height:44px;padding-inline:7px}#caption{max-width:60vw}.filters{padding-inline:7px}.sheet{inset:auto 0 0;width:100%;max-height:78dvh;border-radius:16px 16px 0 0}.surface iframe{height:70dvh}.controls{gap:5px}}
</style></head><body><header><strong>Order QA</strong><button id="open">화면 목록</button><button id="next">다음 미해결</button><button id="points">의견</button><button id="new">위치 의견</button><button hidden id="pick-cancel">위치 선택 닫기</button></header>
<nav id="filters" class="filters" aria-label="검토 상태"></nav><div class="bar"><strong id="caption"></strong><small id="version-mark"></small><select id="width" aria-label="화면 너비"><option value="0">원본 폭</option><option>320</option><option>390</option><option>768</option><option>1440</option></select><select id="version" aria-label="비교할 화면"><option value="current">이번 판</option><option value="previous">이전 화면</option></select><details><summary>도구</summary><div><button id="sync">다시 읽기</button><button id="hide-pins" aria-pressed="false">핀 숨기기</button><button id="export">편집 HTML</button><button id="backup">의견 백업</button><button id="link-figma">Figma 연결</button><a class="tool" href="/ia?view=simple-r3">간편 견적</a><a class="tool" href="/ia?view=detailed-r3">상세 견적</a><a class="tool" href="/ia?view=pricing-r3">가격·배송</a><a class="tool" href="/ia?view=roles-r3">역할별 업무</a></div></details></div><p id="live" role="status"></p><section hidden id="buyer" class="bar" aria-label="사업장 인증 견적"><button id="quote-open">내 견적 불러오기</button><select id="buyer-sites" aria-label="인증 사업장"></select><select id="buyer-quotes" aria-label="기존 견적"></select><output id="snapshot"></output></section><main id="surface" class="surface"><iframe id="frame" sandbox="allow-scripts" title="선택한 화면"></iframe></main>
<dialog id="choose"><div class="controls"><input id="search" type="search" aria-label="화면·의견 검색" placeholder="화면 또는 의견 검색"><button id="close-choose">닫기</button></div><div id="tiles"></div></dialog>
<aside id="drawer" class="sheet" hidden aria-label="화면 의견"><div class="controls drawer-title"><strong>화면 의견</strong><button id="close-drawer">닫기</button></div><div id="blocks"><div class="controls"><button id="general">전체 의견 추가</button><button data-review="approved">사용자 통과</button><button data-review="changes_requested">수정 요청</button></div><div id="notes"></div></div><div id="authoring" hidden><p id="point-state"></p><button id="reposition">위치 다시 선택</button><p><label for="body-text">의견</label></p><textarea id="body-text" maxlength="10000"></textarea><p hidden id="conflict"></p><div class="controls"><button id="draft">임시저장</button><button id="save">의견 저장</button></div></div></aside>
<script nonce="${esc(nonce)}">(${hostCode})(${js(nonce)},${js(frameCode)})</script></body></html>`;
}
