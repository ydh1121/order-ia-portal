// Delivery only: read original bytes from the authenticated release projection.
// No user data, session or pending request I/O is stored between invocations.
import {deliveryBuild,deliveryManifest} from './research-delivery-identity.gen.mjs';
import {researchReleases} from './research-release-runtime-index.gen.mjs';
import {researchBuild} from './research-app/assets.gen.mjs';
import {researchRoute} from './research-app/routes.mjs';
import {RESEARCH_RELEASE_WIDTHS,renderResearchReleaseApplication,researchReviewIdentity,researchReviewMode} from './research-app/release-store.mjs';

export {deliveryBuild};
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
async function readBlob(env,origin,name,descriptor){
  const url=new URL('/ia/research-releases/'+deliveryBuild+'/'+name,origin);
  if(!['https:','http:'].includes(url.protocol)||typeof env?.ASSETS?.fetch!=='function')throw error();
  try{
    const response=await env.ASSETS.fetch(new Request(url,{redirect:'manual',headers:{'Accept-Encoding':'identity'}}));
    if(response.status!==200||response.redirected)throw error();
    const compressed=await exactBytes(response.body,descriptor[0]);
    if(await sha(compressed)!==descriptor[2])throw error();
    return await exactBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),descriptor[1]);
  }catch{throw error();}
}
async function indexFor(env,origin){
  if(!env?.ASSETS)throw error();
  const cached=verifiedIndexes.get(env.ASSETS);if(cached)return cached;
  const index=JSON.parse(utf8.decode(await readBlob(env,origin,'index.bin',deliveryManifest)));
  if(index.build!==deliveryBuild||index.source!==researchReleases[deliveryBuild]?.packSha256)throw error();
  verifiedIndexes.set(env.ASSETS,index);
  return index;
}
async function memberBytes(index,tuple,env,origin,partBytes){
  const [part,offset,length,digest]=tuple;
  const bytes=partBytes||await readBlob(env,origin,part+'.bin',index.parts[part]);
  if(offset<0||length<0||offset+length>bytes.length)throw error();
  const body=bytes.subarray(offset,offset+length);
  if(await sha(body)!==digest)throw error();
  return body;
}
const missing=()=>new Response('Research asset not found.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','X-Order-Research-Build':deliveryBuild}});
export async function deliverResearchAsset(path,env,origin){
  if(!validPath(path))return missing();
  try{
    const index=await indexFor(env,origin);
    if(!Object.hasOwn(index.assets,path))return missing();
    const entry=index.assets[path],body=await memberBytes(index,entry,env,origin);
    return new Response(body,{headers:{'Content-Type':index.types[entry[4]],'X-Order-Research-Build':deliveryBuild,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }catch{return new Response(null,{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}
export async function deliveryResearchRow(id,env,origin){
  const index=await indexFor(env,origin);if(!Object.hasOwn(index.rows,id))return null;
  return JSON.parse(utf8.decode(await memberBytes(index,index.rows[id],env,origin)));
}
async function shellHeader(env,origin,index){
  const cached=verifiedHeaders.get(env.ASSETS);if(cached)return cached;
  const result=JSON.parse(utf8.decode(await readBlob(env,origin,'shell.bin',index.shell)));
  verifiedHeaders.set(env.ASSETS,result);
  return result;
}
export async function readDeliveryShell(build,env,origin){
  if(build!==deliveryBuild)return null;
  const index=await indexFor(env,origin),header=await shellHeader(env,origin,index),rows=[];
  // Metadata rows were stored in order. Keep only one small row shard resident.
  let part=-1,bytes;
  for(const entry of Object.values(index.rows)){
    if(entry[0]!==part){part=entry[0];bytes=await readBlob(env,origin,part+'.bin',index.parts[part]);}
    rows.push(JSON.parse(utf8.decode(await memberBytes(index,entry,env,origin,bytes))));
  }
  return {...header,rows};
}
async function projectedShell(route,env,origin){
  const id=[route.screen,route.state,route.variant].join('/'),index=await indexFor(env,origin);
  // The sealed renderer uses only id, screen, state and variant during shell
  // binding. Full row metadata stays available to the QA catalog and artifacts.
  const rows=Object.hasOwn(index.rows,id)?[{id,screen:route.screen,state:route.state,variant:route.variant}]:[];
  return {...await shellHeader(env,origin,index),rows};
}
export async function renderDeliveryApplication(nonce,parameters,env,origin,labContext=null){
  const build=parameters.get('build')||researchBuild.digest;
  if(build!==deliveryBuild){
    const {renderResearchApplication}=await import('./research-app/page.mjs');
    return renderResearchApplication(nonce,parameters,env,origin,labContext);
  }
  if(parameters.has('mode'))researchReviewMode(parameters.get('mode'));
  const current=build===researchBuild.digest,target=new URLSearchParams(parameters);
  const route=researchRoute(Object.fromEntries(['screen','state','variant','mode'].map(key=>[key,parameters.get(key)])));
  if(current)for(const key of ['screen','state','variant','mode'])target.set(key,route[key]);
  const version=current&&parameters.get('version')!=='recorded'?'current':'recorded';
  return renderResearchReleaseApplication(await projectedShell(route,env,origin),nonce,target,{
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
export async function deliveryArchivedResearchArtifact(rowId,width,hash,env,origin,mode='simple'){
  if(!RESEARCH_RELEASE_WIDTHS.includes(Number(width)))return null;
  const expected=await textHash(JSON.stringify(researchReviewIdentity(deliveryBuild,rowId,Number(width),mode)));
  if(expected!==hash){
    const {archivedResearchArtifact}=await import('./research-app/page.mjs');return archivedResearchArtifact(rowId,width,hash,env,origin,mode);
  }
  const row=await deliveryResearchRow(rowId,env,origin);if(!row)return null;
  const parameters=new URLSearchParams({view:'research-r3',build:deliveryBuild,screen:row.screen,state:row.state,variant:row.variant,mode,version:'recorded'});
  const shell=await projectedShell(row,env,origin),html=await renderResearchReleaseApplication(shell,'a'.repeat(36),parameters);
  const source={kind:'research-application',build:deliveryBuild,productSource:shell.build.sources,environment:'research-fixture',archived:true};
  const editable=html.replace('</body>','<script type="application/json" id="frame-meta">'+js({source,hash,viewport:width,route:row.id,...(mode==='detailed'?{mode}:{})})+'</script></body>');
  return {release:'MSG0585-R3',version:'recorded',hash,viewport:width,...(mode==='detailed'?{mode}:{}),application:{url:'/ia?'+parameters,build:deliveryBuild},source,archivedSource:{epoch:'research-'+deliveryBuild},html,editable,exportHash:await textHash(editable),file:'ORDER_research_'+row.id.replaceAll('/','_')+'_'+(mode==='detailed'?'detailed_':'')+width+'.html'};
}
