import {updateGeneratedModule} from './generated-targets.mjs';
// Refresh only executable frame identities. Historical URLs retain their original
// projected content, wrapper, styles and scripts from the verified deployment.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {bootReviewFrame} from '../../src/server/r3-ui/frame.mjs';
import {mountReviewRequests} from '../../src/server/r3-ui/review-fixture-request.mjs';
import {mountAsyncMotion,asyncMotionCss} from '../../src/server/r3-async-motion.mjs';
import {mountReviewControls} from './authored/admin-common.mjs';
import {mountSelectedLoading} from './authored/selected-loading.mjs';
import {browserFunction} from '../../src/server/browser-source.mjs';
import * as current from '../../src/server/r3-ui/catalog.gen.mjs';
import * as generated from '../../src/server/r3-ui/runtime.gen.mjs';
import * as reviewed from '../../src/server/r3-ui/reviewed-r3.gen.mjs';
import * as preRework from '../../src/server/r3-ui/pre-rework.gen.mjs';
const directory=new URL('../../src/server/r3-ui/',import.meta.url);
const baseline='deb3ad20fa5b4cab5eac3d80aedba91f22cbe910';
function oldFile(file){return execFileSync('git',['show',baseline+':src/server/r3-ui/'+file],{cwd:directory,maxBuffer:16_000_000});}
const original=async file=>import('data:text/javascript;base64,'+oldFile(file).toString('base64'));
const [old,engine,quoteBridge,markers]=await Promise.all(['catalog.gen.mjs','runtime.gen.mjs','quote-journey-bridge.mjs','approved-markers.mjs'].map(original));
const sha=s=>createHash('sha256').update(s).digest('hex');
const zip=s=>gzipSync(s).toString('base64');
const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
const selected=row=>row.role==='admin'||['common','receipt'].includes(row.screen);
const core=generated.runtimes.business.split('})(window);')[0]+'})(window);';
if(!core.includes('w.QAUI=')||core.length>20000)throw Error('Unexpected common R2 primitives');
const ids={};for(const row of current.catalog.filter(selected))(ids[row.screen]??=new Set()).add(row.state);
const registration=Object.entries(ids).map(([id,states])=>({id,states:[...states]}));
const shared=core+'\n;(()=>{const mount='+browserFunction(mountReviewControls)+';for(const row of '+JSON.stringify(registration)+')window.ORDER_DESIGN_MODULES.push({...row,mount});})();';
const selectedLoading=row=>row.state==='loading'&&['common','admin-overview','admin-ad-inventory','admin-analytics'].includes(row.screen);
const loadingCode=shared+';(()=>{const install='+browserFunction(mountAsyncMotion)+',start='+browserFunction(mountSelectedLoading)+';for(const row of window.ORDER_DESIGN_MODULES){const previous=row.mount;row.mount=(root,state,api)=>start(root,api,install,previous,state);}})();';
const runtimes={...generated.runtimes,adminCommon:shared,adminLoading:loadingCode};
const frameCode='function runCurrentReviewFrame(session){return ('+browserFunction(bootReviewFrame)+')(session,'+browserFunction(mountAsyncMotion)+','+browserFunction(mountReviewRequests)+','+JSON.stringify(asyncMotionCss)+');}';
const archivedRows={},archivedScripts={},archivedBodies={};
const loadingRevision='835d7c9c849799e271616ec3ddc79b52aa4f0ecc';
async function capturedRelease(revision){
  async function moduleAt(file){
    const source=execFileSync('git',['show',revision+':src/server/r3-ui/'+file],{cwd:directory,maxBuffer:16_000_000});
    return import('data:text/javascript;base64,'+source.toString('base64'));
  }
  const [catalog,runtime,bridge,markers,quote]=await Promise.all(['catalog.gen.mjs','runtime.gen.mjs','review-motion-bridge.mjs','approved-markers.mjs','quote-journey-bridge.mjs'].map(moduleAt));
  const frame='function presentReviewFrame(session){('+browserFunction(quote.mountQuoteJourneyBridge)+')(session);('+browserFunction(markers.installReviewShortcut)+')(session);('+browserFunction(bridge.installReviewMotion)+')(session);('+runtime.frameCode+')(session);('+browserFunction(markers.mountApprovedMarkers)+')(session);}';
  if(catalog.cssHash!==old.cssHash)throw Error('New stylesheet archive required for '+revision);
  return {catalog,runtime,frame};
}
const {catalog:stageCatalog,runtime:stageRuntime,frame:stageFrame}=await capturedRelease(loadingRevision);
const published=await capturedRelease('0624ca14ecd599fffc48b3217e87b569b61996e1');
const publishedRows={},stageRows={};
for(const row of stageCatalog.catalog.filter(selectedLoading)){
  const script=sha(stageRuntime.runtimes.adminCommon);archivedScripts[script]??=zip(stageRuntime.runtimes.adminCommon);
  if(!current.frames[row.current])archivedBodies[row.current]=stageCatalog.frames[row.current];
  stageRows[row.id]={hashes:row.hashes,body:row.current,script};
}
const replayFrame='function presentReviewFrame(session){('+browserFunction(quoteBridge.mountQuoteJourneyBridge)+')(session);('+browserFunction(markers.installReviewShortcut)+')(session);('+engine.frameCode+')(session);('+browserFunction(markers.mountApprovedMarkers)+')(session);}';
for(const row of old.catalog){
  const code=engine.runtimes[row.runtimeFamily||fallback[row.screen]],script=code?sha(code):null;
  if(code&&!archivedScripts[script])archivedScripts[script]=zip(code);
  const body=row.current;if(!current.frames[body])archivedBodies[body]=old.frames[body];
  archivedRows[row.id]={hashes:row.hashes,body,script};
}
// Earlier archives referenced bodies retained by the then-current catalog. Later
// family refreshes prune unused bodies, so retain any such still-pinned source here.
for(const archive of [reviewed,preRework])for(const row of Object.values(archive.archivedRows)){
  const body=row.body;
  if(current.frames[body]||archivedBodies[body]||reviewed.archivedBodies[body]||preRework.archivedBodies[body])continue;
  if(!old.frames[body])throw Error('Unresolved previously issued frame '+body);
  archivedBodies[body]=old.frames[body];
}
const fingerprints=new Map();
const frames={...current.frames};
const catalog=current.catalog.map(row=>{
  if(selected(row)){
    const oldBody=gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
    // The accessible message is the separately labelled sr-only element. Remove
    // the duplicate input overlay from the editable document as well as playback.
    const body=oldBody.replace(/<span\b[^>]*class="inline-field-state"[^>]*>[\s\S]*?<\/span>/g,'')
      .replace(/<p class="qa-field-error"[^>]*>[\s\S]*?<\/p>/g,'')
      .replace(/(<button\b[^>]*data-qa-action="save-receipt"[^>]*>)[^<]*(<\/button>)/g,'$1검수용 영수증 예시 HTML 저장$2')
      .replace(/(<button\b[^>]*data-qa-action="export-quotes"[^>]*>)[^<]*(<\/button>)/g,'$1검수용 견적 목록 HTML 저장$2');
    if(body!==oldBody){const id=sha(body);frames[id]??=zip(body);row={...row,current:id};}
  }
  const family=selectedLoading(row)?'adminLoading':selected(row)?'adminCommon':row.runtimeFamily||fallback[row.screen],mount=runtimes[family]||'';
  if(!fingerprints.has(family))fingerprints.set(family,sha(frameCode.replace(/^function /,'')+mount));
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,sha([row.id,'current',row.current,current.cssHash,width,fingerprints.get(family)].join('|'))]));
  return {...row,...(selected(row)?{runtimeFamily:family,authoredChange:true}:{}),hashes};
});
// The public private preview could already have attached review pins to 0624ca1.
// Freeze any changed target from its deployed inputs rather than today's generators.
const latestRows=new Map(catalog.map(row=>[row.id,row]));
for(const row of published.catalog.catalog){
  const live=latestRows.get(row.id);
  if(!live)throw Error('Removed published QA target '+row.id);
  if(Object.entries(row.hashes).every(([width,id])=>live.hashes[width]===id))continue;
  const code=published.runtime.runtimes[row.runtimeFamily||fallback[row.screen]],script=code?sha(code):null;
  if(code)archivedScripts[script]??=zip(code);
  const body=row.current;
  if(!frames[body])archivedBodies[body]??=published.catalog.frames[body];
  publishedRows[row.id]={hashes:row.hashes,body,script};
}
// The preserved screens repeat large SVG and CSS fragments. Store these once
// in a lossless dictionary to keep the deployed Worker compact. Every decoded
// document must match its original HTML digest before it joins the archive.
const fragments=[],fragmentIds=new Map(),paths={};
for(const [id,packed] of Object.entries(archivedBodies)){
  const original=gunzipSync(Buffer.from(packed,'base64')).toString();
  const parts=(original.match(/[<>]|[^<>]+/g)||[]).map(fragment=>{
    if(!fragmentIds.has(fragment)){fragmentIds.set(fragment,fragments.length);fragments.push(fragment);}
    return fragmentIds.get(fragment);
  });
  if(sha(parts.map(index=>fragments[index]).join(''))!==id)throw Error('Historical HTML does not match '+id);
  paths[id]=parts;
}
const history={archivedRows,stageRows,stageFrame,publishedRows,publishedFrameGzip:zip(published.frame),archivedScripts,archivedBodyPack:zip(JSON.stringify({fragments,paths})),replayFrame,cssHash:old.cssHash,cssGzip:old.cssGzip};
await fs.writeFile(new URL('motion-history.gen.mjs',directory),'// Verified pre-motion replay. Generated by refresh-review-motion.mjs.\n'+Object.entries(history).map(([k,v])=>'export const '+k+'='+JSON.stringify(v)+';').join('\n')+'\n');
async function replace(name,fields){
  return updateGeneratedModule(new URL(name,directory),fields);
}
await replace('runtime.gen.mjs',{frameCode,runtimes});
await replace('catalog.gen.mjs',{catalog,frames});
console.log('Current frame identities',catalog.length,'administration',catalog.filter(r=>r.role==='admin').length,'common',catalog.filter(r=>r.screen==='common').length);
