import {browserFunction} from './browser-source.mjs';
import {installQaSession} from './qa-session-client.mjs';
import {catalog, cssHash, cssGzip, previousCssGzip, previousCssHash, frames, release} from './r3-ui/catalog.gen.mjs';
import {hostCode,frameCode,runtimes} from './r3-ui/runtime.gen.mjs';

import {archivedRows,archivedBodies,archivedScripts} from './r3-ui/reviewed-r3.gen.mjs';
import * as beforeRework from './r3-ui/pre-rework.gen.mjs';
import * as beforeMotion from './r3-ui/motion-history.gen.mjs';
import * as beforeInteraction from './r3-ui/interaction-history.gen.mjs';
import * as beforeBrand from './r3-ui/brand-history.gen.mjs';
import * as beforeLogoCorrection from './r3-ui/logo-correction-history.gen.mjs';
import {approvedShellBody,shellStyles} from './r3-ui/approved-shell.mjs';
import {approvedHash,reviewHashes,approvedWidths} from './r3-ui/approved-width.mjs';
import {installReviewShortcut, mountApprovedMarkers} from './r3-ui/approved-markers.mjs';
import {installPinProjection} from './r3-ui/pin-projection.mjs';
import {installReviewPanels} from './r3-ui/review-panels.mjs';
import {approvedRegistry} from './r3-ui/approved-registry.mjs';
import {bootApprovedShell} from './r3-ui/approved-controller.mjs';
import {mountQuoteJourneyBridge} from './r3-ui/quote-journey-bridge.mjs';
import {installReviewMotion} from './r3-ui/review-motion-bridge.mjs';
import {motionRequirements} from './r3-ui/motion-requirements.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {buyerResultClient,projectBuyerResult,buyerResultCss} from './r3-quote-result.mjs';
import {mountReviewDownloads} from './r3-qa-downloads.mjs';
import {readPublication} from './r3-qa-publication.mjs';
import {getQaSupplemental,qaMvpCss} from './r3-qa-assets.mjs';
import {defaultQaNavigation} from './r3-qa-navigation.mjs';
import * as supplementalHistory from './r3-ui/supplemental-history.gen.mjs';
import {isProductLiveTarget} from './product-lab-page.mjs';
import {qaReviewHash,qaReviewHashes,withQaReviewRuntime} from './r3-qa-review-runtime.mjs';
import {isReviewedEpochTarget,readReviewedEpochArtifact,readReviewedEpochBody} from './r3-qa-epoch-history.mjs';

const utf8=new TextEncoder();
// The product runtime is byte-identical. Shortcuts and marker decoration belong to the QA tool.
// Pin presentation is part of the review tool, not the preserved product HTML,
// CSS or released frame identity. Historical replay code is still executed intact.
const pinPresentationStyle='.r3-pin.is-resolved{background:#315de6;border-style:dashed}.r3-pin.is-previous{background:#7c3aed}.r3-pin.is-mixed{background:linear-gradient(135deg,#7c3aed 0 50%,#315de6 50% 100%)}.r3-pin.is-previous:hover,.r3-pin.is-previous.is-selected{box-shadow:0 0 0 4px #7c3aed33}.r3-pin.is-resolved::before{content:"✓";position:absolute;left:-5px;bottom:-5px;display:grid;place-items:center;width:12px;height:12px;border-radius:50%;background:white;color:#087f5b;font:800 9px/1 system-ui}.r3-pin.is-previous[data-cluster]:not([data-cluster=""])::after{color:#7c3aed}';
const reviewPanelAuthStates=[...new Map(catalog.filter(row=>['login','signup','otp','password','terms'].includes(row.screen)).map(row=>[row.screen+'/'+row.state,[row.screen,row.state]])).values()];
const reviewFrameCode='function presentReviewFrame(session,replay){('+browserFunction(installReviewPanels)+')(session,'+JSON.stringify(reviewPanelAuthStates)+');('+browserFunction(installPinProjection)+')(session);const pinStyle=document.createElement("style");pinStyle.textContent='+JSON.stringify(pinPresentationStyle)+';document.head.append(pinStyle);if(replay){replay(session);}else{window.ORDER_QA_REVIEW_RUNTIME?.(session);('+browserFunction(mountQuoteJourneyBridge)+')(session);('+browserFunction(installReviewShortcut)+')(session);('+browserFunction(installReviewMotion)+')(session);('+frameCode+')(session);}('+browserFunction(mountApprovedMarkers)+')(session);}';
const js=v=>JSON.stringify(v).replaceAll('<','\\u003c');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cached=new Map();
async function sha(s){const b=await crypto.subtle.digest('SHA-256',utf8.encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function inflate(data){const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
let historicalBodyIndex,publishedBootstrap,interactionBootstrap,brandBootstrap,logoCorrectionBootstrap;
export async function resolveR3HistoricalBody(digest){
  const reviewed=await readReviewedEpochBody(digest);
  if(reviewed!==null)return reviewed;
  historicalBodyIndex??=inflate(beforeMotion.archivedBodyPack).then(JSON.parse);
  const {fragments,paths}=await historicalBodyIndex;
  return paths[digest].map(index=>fragments[index]).join('');
}
let stylesheet,oldStylesheet;
const styles=version=>version==='previous'?(oldStylesheet??=inflate(previousCssGzip)):(stylesheet??=inflate(cssGzip));
const frameStyle=`
[data-order-menu]{position:relative;display:inline-block;z-index:10;margin-inline-start:4px}[data-order-menu] summary{list-style:none;cursor:pointer;padding:8px}[data-order-menu] summary::-webkit-details-marker{display:none}[data-order-menu]>div{position:absolute;min-width:9rem;display:grid;background:white;padding:.45rem;border-radius:.7rem;box-shadow:0 4px 22px #1f355533}[data-order-menu] button{min-height:44px;background:white;color:#203149;border:0;text-align:start}

#r3-veil{position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:pan-x pan-y;background:transparent;outline:none}#r3-veil:not([hidden]):focus-visible:after{content:"+";position:absolute;left:var(--x,50%);top:var(--y,50%);color:#214ca8}
#r3-pins{position:fixed;inset:0;pointer-events:none;z-index:2147483646}.r3-pin,.approval-draft-pin{position:absolute;transform:translate(-50%,-50%);width:25px;height:25px;min-width:25px;border:2px solid white;border-radius:50% 50% 50% 4px;background:#315de6;color:white;box-shadow:0 2px 7px #19316f40;font:750 10px/1 system-ui;padding:0;display:grid;place-items:center}.r3-pin{pointer-events:auto;cursor:pointer}.r3-pin:hover,.r3-pin.is-selected{background:#213c9a;box-shadow:0 0 0 4px #315de62b}.r3-pin.is-resolved{background:#74808e}.r3-pin[data-cluster]:not([data-cluster=""])::after{content:attr(data-cluster);position:absolute;left:16px;top:-6px;font:700 9px/12px system-ui;padding:0 3px;border-radius:5px;background:white;color:#315de6;box-shadow:0 0 0 1px #d5dff5}.approval-draft-pin{position:fixed;background:#fa8b13;pointer-events:none;z-index:2147483646}.approval-draft-pin[hidden]{display:none}.r3-options{position:fixed;z-index:10000;left:var(--left);top:var(--top);width:var(--width);max-height:32vh;overflow:auto;background:white;border:1px solid #b0b8c1;box-shadow:0 3px 12px #0002;scrollbar-width:thin;scrollbar-color:#c4ccd8 transparent;overscroll-behavior:contain}.r3-options::-webkit-scrollbar{display:block;width:5px;height:0}.r3-options::-webkit-scrollbar-thumb{border-radius:8px;background:#c4ccd8}.r3-options[hidden]{display:none}.r3-options button{display:block;text-align:left;padding:8px;width:100%;border:0;background:white}
`;
export async function isR3ReviewTarget(target,revision=release){
  if(revision!==release||!target||!approvedWidths.includes(target.viewport))return false;
  if(isProductLiveTarget(target))return true;
  if(await isReviewedEpochTarget(target,revision))return true;
  const preserved=supplementalHistory.supplementalHistoryRows[[target.screen,target.state,target.variant].join('/')];
  if(preserved?.hashes[target.viewport]===target.artifactHash)return true;
  const additional=(await getQaSupplemental()).documents.get([target.screen,target.state,target.variant].join('/'));
  if(additional?.hashes[target.viewport]===target.artifactHash)return true;
  if(additional&&await qaReviewHash(additional.row,additional.hashes[target.viewport])===target.artifactHash)return true;
  const row=catalog.find(f=>f.screen===target.screen&&f.state===target.state&&f.variant===target.variant);
  if(!row)return false;
  const [current,previous]=await Promise.all(['current','previous'].map(version=>approvedHash(row,target.viewport,version)));
  if(await qaReviewHash(row,current)===target.artifactHash)return true;
  if(current===target.artifactHash||previous===target.artifactHash)return true;
  for(const archive of [beforeLogoCorrection.archivedRows,beforeBrand.archivedRows,beforeInteraction.archivedRows,beforeMotion.publishedRows,archivedRows,beforeRework.archivedRows,beforeMotion.archivedRows,beforeMotion.stageRows]){
    const preserved=archive[row.id];if(preserved&&await approvedHash(preserved,target.viewport,'current')===target.artifactHash)return true;
  }
  return false;
}
const apiHeaders={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none';frame-ancestors 'none';sandbox",'X-Robots-Tag':'noindex'};
const json=(j,status=200)=>Response.json(j,{status,headers:apiHeaders});
export async function serveR3Artifact(request,env){
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  const q=new URL(request.url).searchParams;
  if(!q.has('id')){
    if(q.size)return json({error:'INVALID_CATALOG_REQUEST'},400);
    // Reference metadata belongs to the outer review tool. Rendered product documents keep their release identities.
    const additions=await getQaSupplemental(),byId=new Map(additions.rows.map(row=>[row.id,row]));
    const supplemental=additions.rows.filter(row=>row.supplemental),sales=supplemental.filter(row=>row.screen==='admin-analytics');
    let salesInserted=false;
    const inventory=[...catalog.flatMap(row=>{
      const selected=byId.get(row.id)||row;
      if(row.screen==='admin-analytics'&&!salesInserted){salesInserted=true;return [...sales,selected];}
      return [selected];
    }),...supplemental.filter(row=>row.screen!=='admin-analytics')];
    const items=await Promise.all(inventory.map(async row=>{
      const {id,screen,state,variant,group,label,stateLabel,defaultWidth,phase,role,authoredChange,supplemental}=row;
      const reference=approvedRegistry[screen];
      const contentHashes=await reviewHashes(row);
      return {hashes:await qaReviewHashes(row,contentHashes),contentHashes,id,screen,state,variant,group,label:screen==='admin-analytics'?'매출 현황':label,stateLabel,defaultWidth,phase,role,
        description:row.description||reference?.description||'',routeIds:reference?.routeIds||[],variantLabel:reference?.variants?.[variant]||variant,
        authoredChange:Boolean(authoredChange),supplemental:Boolean(supplemental)};
    }));
    return json({release,items,navigationDefaults:defaultQaNavigation(items.map(row=>row.screen)),publication:await readPublication(env?.ORDER_QA_DB,new URL(request.url).hostname)});
  }
  // An explicit pinned identity belongs to the captured release, even after
  // the current HTML, shared QA fixture runtime or source catalogue changes.
  if(['recorded','current'].includes(q.get('version'))&&q.has('artifactHash')&&[...q.keys()].every(k=>['id','width','version','artifactHash'].includes(k))){
    const saved=await readReviewedEpochArtifact(q.get('id'),Number(q.get('width')),q.get('artifactHash'));
    if(saved)return json({...saved.artifact,replayFrame:saved.replayFrame,archivedSource:saved.archivedSource});
  }
  const savedSupplement=supplementalHistory.supplementalHistoryRows[q.get('id')];
  if(savedSupplement&&['recorded','current','prior-r3'].includes(q.get('version'))&&approvedWidths.includes(Number(q.get('width')))&&q.get('artifactHash')===savedSupplement.hashes[Number(q.get('width'))]&&[...q.keys()].every(k=>['id','width','version','artifactHash'].includes(k))){
    const width=Number(q.get('width')),artifactHash=savedSupplement.hashes[width],body=await inflate(supplementalHistory.supplementalHistoryBodies[savedSupplement.body]);
    const css=await inflate(supplementalHistory.supplementalHistoryCssGzip)+supplementalHistory.supplementalHistoryExtraCss;
    const mount=await inflate(supplementalHistory.supplementalHistoryScripts[savedSupplement.script]);
    const common='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(savedSupplement.row.label)+'</title>';
    const html=common+'<!--R3-POLICY--><style>'+css+frameStyle+'</style></head><body>'+body+'<!--R3-FRAME--></body></html>';
    const editable=common+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:;form-action \'none\';base-uri \'none\'"><style>'+css+'\nbody{max-width:'+width+'px}</style></head><body>'+body+'</body></html>';
    return json({release,version:'prior-r3',hash:artifactHash,html,editable,exportHash:await sha(editable),mount,file:release+'_'+q.get('id').replaceAll('/','_')+'_'+width+'.html'});
  }
  const supplement=(await getQaSupplemental()).documents.get(q.get('id'));
  if(supplement&&approvedWidths.includes(Number(q.get('width')))&&['current','recorded'].includes(q.get('version'))&&[...q.keys()].every(k=>['id','width','version','artifactHash'].includes(k))){
    const width=Number(q.get('width')),artifactHash=supplement.hashes[width],pinned=q.get('artifactHash');
    const reviewHash=await qaReviewHash(supplement.row,artifactHash);
    if((q.get('version')==='current'&&!pinned)||pinned===artifactHash||pinned===reviewHash){
      const css=await styles('current'),extraCss=supplement.css||qaMvpCss,title=esc(supplement.row.label+' · '+supplement.row.stateLabel),body=supplement.body;
      const common='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+title+'</title>';
      const meta=js({release,artifactHash,version:'current',screen:supplement.row.screen,state:supplement.row.state,variant:'email',viewport:width,bodySha256:await sha(body),cssSha256:await sha(css+extraCss)});
      const html=common+'<!--R3-POLICY--><style>'+css+extraCss+frameStyle+'</style></head><body>'+body+'<!--R3-FRAME--></body></html>';
      const editable=common+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:;form-action \'none\';base-uri \'none\'"><style>'+css+extraCss+'\nbody{max-width:'+width+'px}</style></head><body>'+body+'<script type="application/json" id="frame-meta">'+meta+'</script></body></html>';
      const result={release,version:'current',hash:artifactHash,html,editable,viewport:width,exportHash:await sha(editable),mount:supplement.mount,file:release+'_'+supplement.row.id.replaceAll('/','_')+'_'+width+'.html'};
      return json(!pinned||pinned===reviewHash?await withQaReviewRuntime(result,supplement.row):result);
    }
  }
  const r=catalog.find(f=>f.id===q.get('id')); const width=Number(q.get('width'));let version=q.get('version');
  if(!r||!approvedWidths.includes(width)||!['current','previous','prior-r3','recorded'].includes(version)||[...q.keys()].some(k=>!['id','width','version','artifactHash'].includes(k)))return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  const requestedHash=q.get('artifactHash'),currentReviewHash=await qaReviewHash(r,await approvedHash(r,width,'current'));
  const useRuntime=(!requestedHash&&version==='current')||requestedHash===currentReviewHash;
  const pinned=requestedHash===currentReviewHash?await approvedHash(r,width,'current'):requestedHash;
  const history=[beforeLogoCorrection.archivedRows[r.id],beforeBrand.archivedRows[r.id],beforeInteraction.archivedRows[r.id],beforeMotion.publishedRows[r.id],archivedRows[r.id],beforeRework.archivedRows[r.id],beforeMotion.archivedRows[r.id],beforeMotion.stageRows[r.id]].filter(Boolean);
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
  if(pinned&&pinned!==artifactHash)return json({error:'UNKNOWN_REVIEW_TARGET'},404);
  // Old logo/brand bodies remain in the reviewed epoch fragment pack when the
  // current/previous catalogue no longer references them. Their original
  // archive modules are unchanged and need not be duplicated in this bundle.
  const packed=frames[bodyDigest]||beforeInteraction.archivedBodies[bodyDigest]||archivedBodies[bodyDigest]||beforeRework.archivedBodies[bodyDigest];
  const body=packed?await inflate(packed):await resolveR3HistoricalBody(bodyDigest);
  const interactionArchive=archived&&archived===beforeInteraction.archivedRows[r.id];
  const brandArchive=archived&&archived===beforeBrand.archivedRows[r.id];
  const logoCorrectionArchive=archived&&archived===beforeLogoCorrection.archivedRows[r.id];
  const archivedCssHash=logoCorrectionArchive?beforeLogoCorrection.cssHash:brandArchive?beforeBrand.cssHash:interactionArchive?beforeInteraction.cssHash:beforeMotion.cssHash;
  const css=archived&&cssHash!==archivedCssHash?await inflate(logoCorrectionArchive?beforeLogoCorrection.cssGzip:brandArchive?beforeBrand.cssGzip:interactionArchive?beforeInteraction.cssGzip:beforeMotion.cssGzip):await styles(sourceVersion);
  const title=esc(r.label+' · '+r.stateLabel);
  const common='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+title+'</title>';
  const meta=js({release,artifactHash,version,screen:r.screen,state:r.state,variant:r.variant,viewport:width,bodySha256:bodyDigest,cssSha256:version==='previous'?previousCssHash:archived?archivedCssHash:cssHash});
  const page=common+'<!--R3-POLICY--><style>'+css+frameStyle+'</style></head><body>'+body+'<!--R3-FRAME--></body></html>';
  const editable=common+'<meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:;form-action \'none\';base-uri \'none\'"><style>'+css+'\nbody{max-width:'+width+'px}</style></head><body>'+body+'<script type="application/json" id="frame-meta">'+meta+'</script></body></html>';
  const candidates={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member', 'quote-wait':'member'};
  const family=r.runtimeFamily || candidates[r.screen];
  let mount=sourceVersion==='current' && Object.hasOwn(runtimes,family) ? runtimes[family] : null;
  if(archived){
    mount=null;
    if(archived.script){
      if(!cached.has(archived.script))cached.set(archived.script,inflate(beforeLogoCorrection.archivedScripts[archived.script]||beforeBrand.archivedScripts[archived.script]||beforeInteraction.archivedScripts[archived.script]||archivedScripts[archived.script]||beforeRework.archivedScripts[archived.script]||beforeMotion.archivedScripts[archived.script]));
      mount=await cached.get(archived.script);
    }
  }
  let replayFrame=beforeMotion.replayFrame;
  if(archived&&archived===beforeMotion.stageRows[r.id])replayFrame=beforeMotion.stageFrame;
  if(archived&&archived===beforeMotion.publishedRows[r.id])replayFrame=await (publishedBootstrap??=inflate(beforeMotion.publishedFrameGzip));
  if(interactionArchive)replayFrame=await (interactionBootstrap??=inflate(beforeInteraction.replayFrameGzip));
  if(brandArchive)replayFrame=await (brandBootstrap??=inflate(beforeBrand.replayFrameGzip));
  if(logoCorrectionArchive)replayFrame=await (logoCorrectionBootstrap??=inflate(beforeLogoCorrection.replayFrameGzip));
  const result={release,version,hash:artifactHash,html:page,editable,viewport:width,exportHash:await sha(editable),mount,...(archived||sourceVersion==='previous'?{replayFrame}:{}),file:release+'_'+r.id.replaceAll('/','_')+'_'+width+'.html'};
  return json(useRuntime&&!archived&&sourceVersion==='current'?await withQaReviewRuntime(result,r):result);
}
export function renderR3Qa(nonce){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Order · QA 검토</title><style>${shellStyles}
${buyerResultCss.replaceAll('#buyerResult','#snapshot')}</style></head><body>
${approvedShellBody()}
<script nonce="${esc(nonce)}">(${browserFunction(installQaSession)})();(${hostCode})(${js(nonce)},${js(reviewFrameCode)},(${browserFunction(bootApprovedShell)}),(${browserFunction(mountReviewDownloads)}),(${buyerResultClient}),(${browserFunction(projectBuyerResult)}),${js({product:quoteCommit,requirements:motionRequirements})})</script></body></html>`;
}
