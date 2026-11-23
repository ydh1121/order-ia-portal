import {researchReleases} from '../research-release-runtime-index.gen.mjs';

// Call this server-only store after the application's ordinary authorization.
// The static binding bypasses the public route; the public pack URL is denied
// by the authenticated Pages function and is never a browser asset URL.
export const RESEARCH_RELEASE_FORMAT='order-research-release/v1';
export const RESEARCH_RELEASE_FULL_ROWS='order-research-rows/v1';
export const RESEARCH_RELEASE_ROW_IDENTITIES='order-research-row-identities/v1';
export const RESEARCH_RELEASE_NONCE='f0'.repeat(18);
export const RESEARCH_RELEASE_WIDTHS=Object.freeze([320,360,375,390,430,768,1024,1280,1440,1920]);
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[\w-]{1,100}$/;
const MAX_COMPRESSED=24*1024*1024,MAX_EXPANDED=128*1024*1024;
const safePath=value=>typeof value==='string'&&value.length<=350&&/^[\w./-]+$/.test(value)&&!value.startsWith('/')&&!value.includes('..')&&!value.includes('//');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const textHash=value=>hash(new TextEncoder().encode(value));
const bytes64=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const fail=code=>{throw Object.assign(new Error(code),{code,status:503});};
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;};

export function researchReviewMode(mode='simple'){
  if(mode!=='simple'&&mode!=='detailed')throw TypeError('INVALID_RESEARCH_MODE');
  return mode;
}
/** Missing mode is the historical simple identity, never an inferred detailed
 * review. Preserve its bytes; append the mode only for explicit detailed work. */
export function researchReviewIdentity(build,id,width,mode='simple'){
  const identity=['order-research-application/v1',build,id,width];
  if(researchReviewMode(mode)==='detailed')identity.push('detailed');
  return identity;
}

async function boundedBytes(stream,limit){
  if(!stream)fail('RESEARCH_RELEASE_EMPTY');
  const reader=stream.getReader(),parts=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('RESEARCH_RELEASE_TOO_LARGE');}parts.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return bytes;
}
async function inflate(bytes,limit=MAX_EXPANDED){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),limit));}
  catch(error){if(error.code)throw error;fail('RESEARCH_RELEASE_COMPRESSION_INVALID');}
}
function validateRows(rows,{identities=false}={}){
  if(!Array.isArray(rows)||!rows.length||rows.length>10000)fail('RESEARCH_RELEASE_ROWS_INVALID');
  const ids=new Set();
  for(const row of rows){
    if(!plain(row)||typeof row.id!=='string'||row.id.length>350||!TOKEN.test(row.screen||'')||!TOKEN.test(row.state||'')||!TOKEN.test(row.variant||'')||row.id!==[row.screen,row.state,row.variant].join('/')||ids.has(row.id))fail('RESEARCH_RELEASE_ROW_INVALID');
    if(identities&&(Object.keys(row).length!==4||Object.keys(row).some(key=>!['id','screen','state','variant'].includes(key))))fail('RESEARCH_RELEASE_ROW_INVALID');
    ids.add(row.id);
  }
  return rows;
}
/** The index needs only route identity. Full immutable metadata stays in the
 * checksummed pack and is validated after the private asset has been loaded. */
export function researchReleaseRowIdentities(rows){
  return validateRows(rows).map(({id,screen,state,variant})=>({id,screen,state,variant}));
}
function validateEntry(build,entry){
  if(!HEX.test(build)||!plain(entry)||!HEX.test(entry.packSha256||'')||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_COMPRESSED||typeof entry.rowsGzip!=='string'||entry.rowsGzip.length>4*1024*1024)fail('RESEARCH_RELEASE_INDEX_INVALID');
  if(entry.rowsFormat!==undefined&&![RESEARCH_RELEASE_FULL_ROWS,RESEARCH_RELEASE_ROW_IDENTITIES].includes(entry.rowsFormat))fail('RESEARCH_RELEASE_INDEX_INVALID');
  return entry;
}
function validatePack(pack,build,indexRows,rowsFormat=RESEARCH_RELEASE_FULL_ROWS){
  if(!plain(pack)||pack.format!==RESEARCH_RELEASE_FORMAT||pack.build?.digest!==build||pack.build?.format!=='order-research-build/v1'||!plain(pack.build.sources))fail('RESEARCH_RELEASE_IDENTITY_INVALID');
  for(const [path,digest]of Object.entries(pack.build.sources))if(!safePath(path)||!HEX.test(digest))fail('RESEARCH_RELEASE_SOURCE_INVALID');
  validateRows(pack.rows);
  const expected=rowsFormat===RESEARCH_RELEASE_ROW_IDENTITIES?researchReleaseRowIdentities(pack.rows):pack.rows;
  if(JSON.stringify(expected)!==JSON.stringify(indexRows))fail('RESEARCH_RELEASE_ROWS_MISMATCH');
  if(!plain(pack.shell)||typeof pack.shell.html!=='string'||pack.shell.nonce!==RESEARCH_RELEASE_NONCE||!pack.shell.html.startsWith('<!doctype html>'))fail('RESEARCH_RELEASE_SHELL_INVALID');
  if(!plain(pack.assets)||!Object.keys(pack.assets).length||Object.keys(pack.assets).length>20000)fail('RESEARCH_RELEASE_ASSETS_INVALID');
  for(const [path,asset]of Object.entries(pack.assets)){
    if(!safePath(path)||!plain(asset)||typeof asset.body!=='string'||typeof asset.type!=='string'||!/^(text\/(javascript|css|html|plain)|application\/(javascript|json)|image\/svg\+xml)(;[^\r\n]*)?$/.test(asset.type))fail('RESEARCH_RELEASE_ASSET_INVALID');
  }
  return deepFreeze(pack);
}

/** Factory permits deterministic binding/index fixtures without network calls. */
export function createResearchReleaseStore(index=researchReleases,{maxCachedReleases=2}={}){
  if(!Number.isSafeInteger(maxCachedReleases)||maxCachedReleases<1||maxCachedReleases>8)throw TypeError('RESEARCH_RELEASE_CACHE_LIMIT');
  const releases=new Map(),rowSets=new Map();
  const entry=build=>HEX.test(build||'')&&Object.hasOwn(index,build)?validateEntry(build,index[build]):null;
  async function rows(build){
    const record=entry(build);if(!record)return null;
    if(!rowSets.has(build))rowSets.set(build,(async()=>{
      let parsed;try{parsed=JSON.parse(await inflate(bytes64(record.rowsGzip),8*1024*1024));}catch(error){if(error.code)throw error;fail('RESEARCH_RELEASE_ROWS_INVALID');}
      return deepFreeze(validateRows(parsed,{identities:record.rowsFormat===RESEARCH_RELEASE_ROW_IDENTITIES}));
    })().catch(error=>{rowSets.delete(build);throw error;}));
    return rowSets.get(build);
  }
  async function read(build,env,origin){
    const record=entry(build);if(!record)return null;
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')fail('RESEARCH_RELEASE_BINDING_REQUIRED');
    const base=new URL(origin);if(!['http:','https:'].includes(base.protocol))fail('RESEARCH_RELEASE_ORIGIN_INVALID');
    if(releases.has(build)){const existing=releases.get(build);releases.delete(build);releases.set(build,existing);return existing;}
    let pending;pending=(async()=>{
      const url=new URL('/ia/research-releases/'+build+'.json.gz',base);
      const response=await env.ASSETS.fetch(new Request(url,{method:'GET',redirect:'manual',headers:{'Accept':'application/gzip','Accept-Encoding':'identity'}}));
      if(response.status!==200||response.redirected)fail('RESEARCH_RELEASE_NOT_AVAILABLE');
      const bytes=await boundedBytes(response.body,Math.min(MAX_COMPRESSED,record.bytes));
      if(bytes.byteLength!==record.bytes||await hash(bytes)!==record.packSha256)fail('RESEARCH_RELEASE_CHECKSUM_MISMATCH');
      let pack;try{pack=JSON.parse(await inflate(bytes));}catch(error){if(error.code)throw error;fail('RESEARCH_RELEASE_JSON_INVALID');}
      if(await textHash(JSON.stringify(pack?.build?.sources))!==build)fail('RESEARCH_RELEASE_SOURCE_IDENTITY_MISMATCH');
      return validatePack(pack,build,await rows(build),record.rowsFormat);
    })().catch(error=>{if(releases.get(build)===pending)releases.delete(build);throw error;});
    releases.set(build,pending);
    while(releases.size>maxCachedReleases)releases.delete(releases.keys().next().value);
    return pending;
  }
  async function findRow(build,id){return (await rows(build))?.find(row=>row.id===id)||null;}
  async function artifactHash(build,id,width,mode='simple'){
    const identity=researchReviewIdentity(build,id,Number(width),mode);
    if(!RESEARCH_RELEASE_WIDTHS.includes(Number(width))||!await findRow(build,id))return null;
    return textHash(JSON.stringify(identity));
  }
  async function findTarget({build,id,rowId=id,width,hash:expected,mode='simple'}){
    researchReviewMode(mode);
    if(!HEX.test(expected||''))return null;
    for(const candidate of build?[build]:Object.keys(index)){
      const actual=await artifactHash(candidate,rowId,width,mode);if(actual&&actual===expected)return {build:candidate,row:await findRow(candidate,rowId),width:Number(width),hash:actual,...(mode==='detailed'?{mode}:{})};
    }
    return null;
  }
  return Object.freeze({read,rows,findRow,artifactHash,findTarget,has:build=>!!entry(build),builds:()=>Object.keys(index).sort()});
}
const store=createResearchReleaseStore();
export const readResearchRelease=(build,env,origin)=>store.read(build,env,origin);
export const listResearchReleaseRows=build=>store.rows(build);
export const findResearchReleaseRow=(build,id)=>store.findRow(build,id);
export const researchReleaseArtifactHash=(build,id,width,mode='simple')=>store.artifactHash(build,id,width,mode);
export const findResearchReleaseTarget=target=>store.findTarget(target);
export const hasResearchRelease=build=>store.has(build);
export const listResearchReleaseBuilds=()=>store.builds();

/** A caller serves one known logical asset, never the compressed pack. */
export function serveResearchReleaseAsset(release,path){
  const asset=safePath(path)&&Object.hasOwn(release?.assets||{},path)?release.assets[path]:null;
  return new Response(asset?asset.body:'Research asset not found.',{status:asset?200:404,headers:{'Content-Type':asset?.type||'text/plain; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Order-Research-Build':release?.build?.digest||''}});
}

/** Rebind only request nonce and route data in a sealed application shell.
 * A trusted current-build identity is required to label an inspection current;
 * the URL alone cannot relabel an archived release. */
export async function renderResearchReleaseApplication(release,nonce,parameters=new URLSearchParams(),{inspectionVersion='recorded',currentBuild=null}={}){
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce||''))throw TypeError('RESEARCH_RELEASE_NONCE_INVALID');
  const html=release?.shell?.html,token=release?.shell?.nonce;
  const marker=/<script type="application\/json" id="order-app-config">([\s\S]*?)<\/script>/g;
  const blocks=typeof html==='string'?[...html.matchAll(marker)]:[];
  if(blocks.length!==1||token!==RESEARCH_RELEASE_NONCE)fail('RESEARCH_RELEASE_SHELL_CONFIG_INVALID');
  let prior;try{prior=JSON.parse(blocks[0][1]);}catch{fail('RESEARCH_RELEASE_SHELL_CONFIG_INVALID');}
  const build=release.build.digest,base='/ia/research-assets/'+build+'/';
  if(prior.build!==build||prior.assetBase!==base)fail('RESEARCH_RELEASE_SHELL_IDENTITY_INVALID');
  if(!['current','recorded'].includes(inspectionVersion)||inspectionVersion==='current'&&currentBuild!==build)throw TypeError('RESEARCH_RELEASE_INSPECTION_VERSION_INVALID');
  const initial={screen:parameters.get('screen')||prior.initial.screen,state:parameters.get('state')||prior.initial.state,variant:parameters.get('variant')||prior.initial.variant,mode:researchReviewMode(parameters.has('mode')?parameters.get('mode'):'simple')};
  const row=release.rows.find(value=>value.id===[initial.screen,initial.state,initial.variant].join('/'));
  if(!row||!['simple','detailed'].includes(initial.mode))throw Object.assign(new Error('RESEARCH_RELEASE_ROUTE_NOT_FOUND'),{status:404});
  const inspect=parameters.get('inspect')==='1',width=Number(parameters.get('width')||390),channel=parameters.get('channel'),artifact=parameters.get('artifact');
  if(!RESEARCH_RELEASE_WIDTHS.includes(width))throw TypeError('RESEARCH_RELEASE_WIDTH_INVALID');
  const expected=await textHash(JSON.stringify(researchReviewIdentity(build,row.id,width,initial.mode)));
  if(inspect&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(channel||'')||artifact!==expected))throw TypeError('INVALID_RESEARCH_INSPECTION');
  const config={...prior,build,assetBase:base,initial,inspect,inspection:inspect?{channel,artifact,screen:row.screen,state:row.state,variant:row.variant,viewport:width,version:inspectionVersion,...(initial.mode==='detailed'?{mode:'detailed'}:{})}:null};
  const nonceAttribute='nonce="'+token+'"';if(!html.includes(nonceAttribute))fail('RESEARCH_RELEASE_NONCE_MISSING');
  return html.replaceAll(nonceAttribute,'nonce="'+nonce+'"').replace(blocks[0][0],'<script type="application/json" id="order-app-config">'+json(config)+'</script>');
}
