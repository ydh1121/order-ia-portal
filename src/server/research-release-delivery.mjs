// Delivery only: read original bytes from the authenticated release projection.
// No user data, session or pending request I/O is stored between invocations.
import {deliveryBuild,deliveryManifests} from './research-delivery-identity.gen.mjs';
import {researchReleases} from './research-release-runtime-index.gen.mjs';
import {researchBuild} from './research-app/assets.gen.mjs';
import {researchRoute} from './research-app/routes.mjs';
import {RESEARCH_RELEASE_WIDTHS,renderResearchReleaseApplication,researchReviewIdentity,researchReviewMode} from './research-app/release-store.mjs';

export {deliveryBuild};
export const hasDeliveryBuild=build=>typeof build==='string'&&Object.hasOwn(deliveryManifests,build)&&Object.hasOwn(researchReleases,build);
const verifiedIndexes=new WeakMap(),verifiedHeaders=new WeakMap();
const utf8=new TextDecoder('utf-8',{fatal:true});
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const textHash=value=>sha(new TextEncoder().encode(value));
const error=()=>Object.assign(new Error('RESEARCH_DELIVERY_UNAVAILABLE'),{status:503});
const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
function validPath(path){return typeof path==='string'&&path.length<=350&&/^[\w./-]+$/.test(path)&&!path.startsWith('/')&&!path.includes('..')&&!path.includes('//');}
async function exactBytes(stream,length){
  if(!stream||!Number.isSafeInteger(length)||length<0||length>1024*1024)throw error();
  const result=new Uint8Array(length),reader=stream.getReader();let offset=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(value.length>length-offset){await reader.cancel();throw error();}
      result.set(value,offset);offset+=value.length;
    }
  }finally{reader.releaseLock();}
  if(offset!==length)throw error();
  return result;
}
async function readBlob(build,env,origin,name,descriptor){
  if(!hasDeliveryBuild(build))throw error();
  const url=new URL('/ia/research-releases/'+build+'/'+name,origin);
  if(!['https:','http:'].includes(url.protocol)||typeof env?.ASSETS?.fetch!=='function')throw error();
  try{
    const response=await env.ASSETS.fetch(new Request(url,{redirect:'manual',headers:{'Accept-Encoding':'identity'}}));
    if(response.status!==200||response.redirected)throw error();
    const compressed=await exactBytes(response.body,descriptor[0]);
    if(await sha(compressed)!==descriptor[2])throw error();
    return await exactBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),descriptor[1]);
  }catch{throw error();}
}
async function indexFor(env,origin,build=deliveryBuild){
  if(!env?.ASSETS)throw error();
  const cache=verifiedIndexes.get(env.ASSETS)||new Map(),cached=cache.get(build);if(cached)return cached;
  const index=JSON.parse(utf8.decode(await readBlob(build,env,origin,'index.bin',deliveryManifests[build])));
  if(index.build!==build||index.source!==researchReleases[build]?.packSha256)throw error();
  cache.set(build,index);verifiedIndexes.set(env.ASSETS,cache);
  return index;
}
async function memberBytes(index,tuple,env,origin,partBytes){
  const [part,offset,length,digest]=tuple;
  const bytes=partBytes||await readBlob(index.build,env,origin,part+'.bin',index.parts[part]);
  if(offset<0||length<0||offset+length>bytes.length)throw error();
  const body=bytes.subarray(offset,offset+length);
  if(await sha(body)!==digest)throw error();
  return body;
}
const missing=build=>new Response('Research asset not found.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','X-Order-Research-Build':hasDeliveryBuild(build)?build:''}});
export async function deliverResearchAsset(path,env,origin,build=deliveryBuild){
  if(!validPath(path)||!hasDeliveryBuild(build))return missing(build);
  try{
    const index=await indexFor(env,origin,build);
    if(!Object.hasOwn(index.assets,path))return missing(build);
    const entry=index.assets[path],body=await memberBytes(index,entry,env,origin);
    return new Response(body,{headers:{'Content-Type':index.types[entry[4]],'X-Order-Research-Build':build,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }catch{return new Response(null,{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}
export async function deliveryResearchRow(id,env,origin,build=deliveryBuild){
  const index=await indexFor(env,origin,build);if(!Object.hasOwn(index.rows,id))return null;
  return JSON.parse(utf8.decode(await memberBytes(index,index.rows[id],env,origin)));
}
async function shellHeader(env,origin,index){
  const cache=verifiedHeaders.get(env.ASSETS)||new Map(),cached=cache.get(index.build);if(cached)return cached;
  const result=JSON.parse(utf8.decode(await readBlob(index.build,env,origin,'shell.bin',index.shell)));
  if(result.build?.digest!==index.build)throw error();
  cache.set(index.build,result);verifiedHeaders.set(env.ASSETS,cache);
  return result;
}
export async function readDeliveryShell(build,env,origin){
  if(!hasDeliveryBuild(build))return null;
  const index=await indexFor(env,origin,build),header=await shellHeader(env,origin,index),rows=[];
  // Metadata rows were stored in order. Keep only one small row shard resident.
  let part=-1,bytes;
  for(const entry of Object.values(index.rows)){
    if(entry[0]!==part){part=entry[0];bytes=await readBlob(build,env,origin,part+'.bin',index.parts[part]);}
    rows.push(JSON.parse(utf8.decode(await memberBytes(index,entry,env,origin,bytes))));
  }
  return {...header,rows};
}
async function projectedShell(route,env,origin,build=deliveryBuild){
  const id=[route.screen,route.state,route.variant].join('/'),index=await indexFor(env,origin,build);
  // The sealed renderer uses only id, screen, state and variant during shell
  // binding. Full row metadata stays available to the QA catalog and artifacts.
  const rows=Object.hasOwn(index.rows,id)?[{id,screen:route.screen,state:route.state,variant:route.variant}]:[];
  return {...await shellHeader(env,origin,index),rows};
}
export async function renderDeliveryApplication(nonce,parameters,env,origin,labContext=null){
  const build=parameters.get('build')||researchBuild.digest;
  if(!hasDeliveryBuild(build)){
    const {renderResearchApplication}=await import('./research-app/page.mjs');
    return renderResearchApplication(nonce,parameters,env,origin,labContext);
  }
  if(parameters.has('mode'))researchReviewMode(parameters.get('mode'));
  const current=build===researchBuild.digest,target=new URLSearchParams(parameters);
  // Historical routes belong to the sealed application; current redirects
  // (including retired QA screens) must not change an original source pin.
  const input=Object.fromEntries(['screen','state','variant','mode'].map(key=>[key,parameters.get(key)]));
  const route=current?researchRoute(input):input;
  if(current)for(const key of ['screen','state','variant','mode'])target.set(key,route[key]);
  const version=current&&parameters.get('version')!=='recorded'?'current':'recorded';
  const shell=route.screen&&route.state&&route.variant?await projectedShell(route,env,origin,build):await readDeliveryShell(build,env,origin);
  return renderResearchReleaseApplication(shell,nonce,target,{
    inspectionVersion:version,currentBuild:researchBuild.digest,
    accountRun:version==='current'&&parameters.get('inspect')!=='1'?labContext:null
  });
}

export async function deliveryResearchArtifact(row,width,env,origin,mode='simple'){
  if(researchBuild.digest!==deliveryBuild){
    const {researchArtifact}=await import('./research-app/page.mjs');return researchArtifact(row,width,env,origin,mode);
  }
  const hash=await textHash(JSON.stringify(researchReviewIdentity(deliveryBuild,row.id,width,mode)));
  const parameters=new URLSearchParams({view:'research-r3',screen:row.screen,state:row.state,variant:row.variant,mode,build:deliveryBuild});
  const header=await shellHeader(env,origin,await indexFor(env,origin));
  const source={kind:'research-application',build:deliveryBuild,productSource:header.build.sources,regular:header.regular,environment:'research-fixture',ownership:'application',promotion:'same-build'};
  const html=await renderDeliveryApplication('0123456789abcdef0123456789abcdef',parameters,env,origin);
  const editable=html.replace('</body>','<script type="application/json" id="frame-meta">'+js({format:'order-research-route/v1',source,route:{screen:row.screen,state:row.state,variant:row.variant,...(mode==='detailed'?{mode}:{})},viewport:width,hash})+'</script></body>');
  return {release:'MSG0585-R3',version:'current',hash,viewport:width,...(mode==='detailed'?{mode}:{}),...(row.fixture?{fixture:row.fixture}:{}),application:{url:'/ia?'+parameters,build:deliveryBuild},source,html,editable,exportHash:await textHash(editable),file:'ORDER_research_'+row.id.replaceAll('/','_')+'_'+(mode==='detailed'?'detailed_':'')+width+'.html'};
}
export async function deliveryArchivedResearchArtifact(rowId,width,hash,env,origin,mode='simple',candidateBuild=null){
  if(!RESEARCH_RELEASE_WIDTHS.includes(Number(width)))return null;
  let build;
  for(const candidate of candidateBuild?[candidateBuild]:Object.keys(deliveryManifests)){
    if(hasDeliveryBuild(candidate)&&hash===await textHash(JSON.stringify(researchReviewIdentity(candidate,rowId,Number(width),mode)))){build=candidate;break;}
  }
  if(!build){
    const {archivedResearchArtifact}=await import('./research-app/page.mjs');return archivedResearchArtifact(rowId,width,hash,env,origin,mode);
  }
  const row=await deliveryResearchRow(rowId,env,origin,build);if(!row)return null;
  const parameters=new URLSearchParams({view:'research-r3',build,screen:row.screen,state:row.state,variant:row.variant,mode,version:'recorded'});
  const shell=await projectedShell(row,env,origin,build),html=await renderResearchReleaseApplication(shell,'a'.repeat(36),parameters);
  const source={kind:'research-application',build,productSource:shell.build.sources,environment:'research-fixture',archived:true};
  const editable=html.replace('</body>','<script type="application/json" id="frame-meta">'+js({source,hash,viewport:width,route:row.id,...(mode==='detailed'?{mode}:{})})+'</script></body>');
  return {release:'MSG0585-R3',version:'recorded',hash,viewport:width,...(mode==='detailed'?{mode}:{}),application:{url:'/ia?'+parameters,build},source,archivedSource:{epoch:'research-'+build},html,editable,exportHash:await textHash(editable),file:'ORDER_research_'+row.id.replaceAll('/','_')+'_'+(mode==='detailed'?'detailed_':'')+width+'.html'};
}
