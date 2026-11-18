import {browserFunction} from './browser-source.mjs';
import {catalog, cssHash, cssGzip, previousCssGzip, previousCssHash, frames, release} from './r3-ui/catalog.gen.mjs';
import {hostCode,frameCode,runtimes} from './r3-ui/runtime.gen.mjs';

import {archivedRows,archivedBodies,archivedScripts} from './r3-ui/reviewed-r3.gen.mjs';
import * as beforeRework from './r3-ui/pre-rework.gen.mjs';
import {approvedShellBody,shellStyles} from './r3-ui/approved-shell.mjs';
import {approvedHash,reviewHashes,approvedWidths} from './r3-ui/approved-width.mjs';
import {installReviewShortcut, mountApprovedMarkers} from './r3-ui/approved-markers.mjs';
import {approvedRegistry} from './r3-ui/approved-registry.mjs';
import {bootApprovedShell} from './r3-ui/approved-controller.mjs';
import {mountQuoteJourneyBridge} from './r3-ui/quote-journey-bridge.mjs';
import {buyerResultClient,projectBuyerResult,buyerResultCss} from './r3-quote-result.mjs';
import {mountReviewDownloads} from './r3-qa-downloads.mjs';

const utf8=new TextEncoder();
// The product runtime is byte-identical. Shortcuts and marker decoration belong to the QA tool.
const reviewFrameCode='function presentReviewFrame(session){('+browserFunction(mountQuoteJourneyBridge)+')(session);('+browserFunction(installReviewShortcut)+')(session);('+frameCode+')(session);('+browserFunction(mountApprovedMarkers)+')(session);}';
const js=v=>JSON.stringify(v).replaceAll('<','\\u003c');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cached=new Map();
async function sha(s){const b=await crypto.subtle.digest('SHA-256',utf8.encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function inflate(data){const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
let stylesheet,oldStylesheet;
const styles=version=>version==='previous'?(oldStylesheet??=inflate(previousCssGzip)):(stylesheet??=inflate(cssGzip));
const frameStyle=`
[data-order-menu]{position:relative;display:inline-block;z-index:10;margin-inline-start:4px}[data-order-menu] summary{list-style:none;cursor:pointer;padding:8px}[data-order-menu] summary::-webkit-details-marker{display:none}[data-order-menu]>div{position:absolute;min-width:9rem;display:grid;background:white;padding:.45rem;border-radius:.7rem;box-shadow:0 4px 22px #1f355533}[data-order-menu] button{min-height:44px;background:white;color:#203149;border:0;text-align:start}

#r3-veil{position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:pan-x pan-y;background:transparent;outline:none}#r3-veil:not([hidden]):focus-visible:after{content:"+";position:absolute;left:var(--x,50%);top:var(--y,50%);color:#214ca8}
#r3-pins{position:fixed;inset:0;pointer-events:none;z-index:2147483646}.r3-pin,.approval-draft-pin{position:absolute;transform:translate(-50%,-50%);width:25px;height:25px;min-width:25px;border:2px solid white;border-radius:50% 50% 50% 4px;background:#315de6;color:white;box-shadow:0 2px 7px #19316f40;font:750 10px/1 system-ui;padding:0;display:grid;place-items:center}.r3-pin{pointer-events:auto;cursor:pointer}.r3-pin:hover,.r3-pin.is-selected{background:#213c9a;box-shadow:0 0 0 4px #315de62b}.r3-pin.is-resolved{background:#74808e}.r3-pin[data-cluster]:not([data-cluster=""])::after{content:attr(data-cluster);position:absolute;left:16px;top:-6px;font:700 9px/12px system-ui;padding:0 3px;border-radius:5px;background:white;color:#315de6;box-shadow:0 0 0 1px #d5dff5}.approval-draft-pin{position:fixed;background:#fa8b13;pointer-events:none;z-index:2147483646}.approval-draft-pin[hidden]{display:none}.r3-options{position:fixed;z-index:10000;left:var(--left);top:var(--top);width:var(--width);max-height:32vh;overflow:auto;background:white;border:1px solid #b0b8c1;box-shadow:0 3px 12px #0002;scrollbar-width:thin;scrollbar-color:#c4ccd8 transparent;overscroll-behavior:contain}.r3-options::-webkit-scrollbar{display:block;width:5px;height:0}.r3-options::-webkit-scrollbar-thumb{border-radius:8px;background:#c4ccd8}.r3-options[hidden]{display:none}.r3-options button{display:block;text-align:left;padding:8px;width:100%;border:0;background:white}
`;
export async function isR3ReviewTarget(target,revision=release){
  if(revision!==release||!target||!approvedWidths.includes(target.viewport))return false;
  const row=catalog.find(f=>f.screen===target.screen&&f.state===target.state&&f.variant===target.variant);
  if(!row)return false;
  const [current,previous]=await Promise.all(['current','previous'].map(version=>approvedHash(row,target.viewport,version)));
  return current===target.artifactHash||previous===target.artifactHash;
}
const apiHeaders={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none';frame-ancestors 'none';sandbox",'X-Robots-Tag':'noindex'};
const json=(j,status=200)=>Response.json(j,{status,headers:apiHeaders});
export async function serveR3Artifact(request){
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  const q=new URL(request.url).searchParams;
  if(!q.has('id')){
    if(q.size)return json({error:'INVALID_CATALOG_REQUEST'},400);
    // Reference metadata belongs to the outer review tool. Rendered product documents keep their release identities.
    const items=await Promise.all(catalog.map(async row=>{
      const {id,screen,state,variant,group,label,stateLabel,defaultWidth,phase,role,authoredChange}=row;
      const reference=approvedRegistry[screen];
      return {hashes:await reviewHashes(row),id,screen,state,variant,group,label,stateLabel,defaultWidth,phase,role,
        description:reference?.description||'',routeIds:reference?.routeIds||[],variantLabel:reference?.variants?.[variant]||variant,
        authoredChange:Boolean(authoredChange)};
    }));
    return json({release,items});
  }
  const r=catalog.find(f=>f.id===q.get('id')); const width=Number(q.get('width'));let version=q.get('version');
  if(!r||!approvedWidths.includes(width)||!['current','previous','prior-r3','recorded'].includes(version)||[...q.keys()].some(k=>!['id','width','version','artifactHash'].includes(k)))return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  const pinned=q.get('artifactHash');
  const history=[archivedRows[r.id],beforeRework.archivedRows[r.id]].filter(Boolean);
  let archived=null;
  if(version==='prior-r3'&&!pinned)archived=archivedRows[r.id]||null;
  if(pinned){
    if(!/^[0-9a-f]{64}$/.test(pinned))return json({error:'UNKNOWN_REVIEW_TARGET'},404);
    const requested=version;
    if(requested==='recorded'||requested==='current'||requested==='prior-r3'){
      if(requested!=='prior-r3' && pinned===await approvedHash(r,width,'current'))version='current';
      else {
        for(const row of history)if(pinned===await approvedHash(row,width,'current')){archived=row;break;}
        if(archived)version='prior-r3';
        else if(requested==='recorded')version='previous';
      }
    }
  }else if(version==='recorded')return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  const sourceVersion=version==='previous'?'previous':'current';
  const bodyDigest=archived?.body??r[sourceVersion];
  const artifactHash=await approvedHash(archived||r,width,sourceVersion);
  if(q.has('artifactHash')&&q.get('artifactHash')!==artifactHash)return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  const body=await inflate(frames[bodyDigest]||archivedBodies[bodyDigest]||beforeRework.archivedBodies[bodyDigest]),css=await styles(sourceVersion);
  const title=esc(r.label+' · '+r.stateLabel);
  const common='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+title+'</title>';
  const meta=js({release,artifactHash,version,screen:r.screen,state:r.state,variant:r.variant,viewport:width,bodySha256:bodyDigest,cssSha256:version==='previous'?previousCssHash:cssHash});
  const page=common+'<!--R3-POLICY--><style>'+css+frameStyle+'</style></head><body>'+body+'<!--R3-FRAME--></body></html>';
  const editable=common+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:;form-action \'none\';base-uri \'none\'"><style>'+css+'\nbody{max-width:'+width+'px}</style></head><body>'+body+'<script type="application/json" id="frame-meta">'+meta+'</script></body></html>';
  const candidates={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member', 'quote-wait':'member'};
  const family=r.runtimeFamily || candidates[r.screen];
  let mount=sourceVersion==='current' && Object.hasOwn(runtimes,family) ? runtimes[family] : null;
  if(archived){
    mount=null;
    if(archived.script){
      if(!cached.has(archived.script))cached.set(archived.script,inflate(archivedScripts[archived.script]||beforeRework.archivedScripts[archived.script]));
      mount=await cached.get(archived.script);
    }
  }
  return json({release,version,hash:artifactHash,html:page,editable,exportHash:await sha(editable),mount,file:release+'_'+r.id.replaceAll('/','_')+'_'+width+'.html'});
}
export function renderR3Qa(nonce){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Order · QA 검토</title><style>${shellStyles}
${buyerResultCss.replaceAll('#buyerResult','#snapshot')}</style></head><body>
${approvedShellBody()}
<script nonce="${esc(nonce)}">(${hostCode})(${js(nonce)},${js(reviewFrameCode)},(${browserFunction(bootApprovedShell)}),(${browserFunction(mountReviewDownloads)}),(${buyerResultClient}),(${browserFunction(projectBuyerResult)}))</script></body></html>`;
}
