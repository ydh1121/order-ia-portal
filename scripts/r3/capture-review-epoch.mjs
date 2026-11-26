// Capture an immutable reviewed release by executing its own artifact endpoint.
// The source checkout must be the approved release, never the changing worktree.
// Existing output is verified byte-for-byte; a different epoch needs a new file.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';

const options=new Map();
for(let i=2;i<process.argv.length;i+=2){
  if(!/^--[a-z-]+$/.test(process.argv[i])||!process.argv[i+1])throw Error('Expected named option and value');
  options.set(process.argv[i].slice(2),process.argv[i+1]);
}
for(const name of ['source-root','commit','tree','epoch','output'])if(!options.has(name))throw Error('Missing --'+name);
const sourceRoot=resolve(options.get('source-root')),output=resolve(options.get('output'));
const commit=options.get('commit'),tree=options.get('tree'),epoch=options.get('epoch');
if(!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{40}$/.test(tree)||!/^[a-z0-9-]+$/.test(epoch))throw Error('Invalid immutable source identity');
if(output===sourceRoot||output.startsWith(sourceRoot+'/'))throw Error('The source checkout is read only');
const targetsOnly=options.get('targets-only')==='true';
if(options.has('targets-only')&&!targetsOnly)throw Error('--targets-only must be true');
if(targetsOnly){
  if(!options.has('review-targets'))throw Error('Explicit capture requires --review-targets');
  const git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==commit||git('rev-parse','HEAD^{tree}')!==tree||git('status','--porcelain','--untracked-files=no'))throw Error('Explicit capture must use the exact clean source commit and tree');
}
globalThis.crypto??=webcrypto;
const sha=value=>createHash('sha256').update(value).digest('hex');
const zip=value=>gzipSync(Buffer.from(value),{level:9,mtime:0}).toString('base64');
const source=path=>import(pathToFileURL(resolve(sourceRoot,path)));
const [{serveR3Artifact,isR3ReviewTarget},{approvedWidths},{browserFunction},{frameCode},{mountQuoteJourneyBridge},{installReviewShortcut},{installReviewMotion}]=await Promise.all([
  source('src/server/r3-qa-page.mjs'),source('src/server/r3-ui/approved-width-list.mjs'),source('src/server/browser-source.mjs'),
  source('src/server/r3-ui/runtime.gen.mjs'),source('src/server/r3-ui/quote-journey-bridge.mjs'),source('src/server/r3-ui/approved-markers.mjs'),source('src/server/r3-ui/review-motion-bridge.mjs')
]);
const origin='https://order-ia-portal.pages.dev/api/ia/r3-artifact';
async function artifact(query=''){
  const response=await serveR3Artifact(new Request(origin+query),{});
  if(response.status!==200)throw Error('Baseline artifact failed '+query+': '+response.status);
  return response.json();
}
const inventory=await artifact(),records=Object.create(null),fragments=[],fragmentHashes=[],captureHashes=Object.create(null),nodes=[];
const fragmentsByHash=new Map(),recipesByHash=new Map(),htmlRecipesByHash=new Map();
const capturedRows=new Set();
const nodesByValue=new Map();
const gear=Array.from({length:256},(_,i)=>Math.imul(i+1,0x9e3779b1)>>>0);
let sourceBytes=0,recordCount=0;
function fragment(value){
  const hash=sha(value);if(fragmentsByHash.has(hash))return fragmentsByHash.get(hash);
  const index=fragments.length;fragmentsByHash.set(hash,index);fragmentHashes.push(hash);fragments.push(value);return index;
}
function intern(value){
  const node=value===null?['null']:Array.isArray(value)?['array',value.map(intern)]:typeof value==='object'?['object',Object.entries(value).map(([key,entry])=>[key,intern(entry)])]:[typeof value,value];
  const key=JSON.stringify(node);if(nodesByValue.has(key))return nodesByValue.get(key);
  const id=nodes.length;nodesByValue.set(key,id);nodes.push(node);return id;
}
function textRecipe(value){
  const digest=sha(value);if(recipesByHash.has(digest))return recipesByHash.get(digest);
  const recipe=[];let start=0,rolling=0;
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);rolling=((rolling<<1)+gear[code&255])>>>0;
    const length=i+1-start;
    if(length>=4096&&((rolling&8191)===0||length>=32768)&&!(code>=0xd800&&code<=0xdbff)){
      recipe.push(fragment(value.slice(start,i+1)));start=i+1;rolling=0;
    }
  }
  if(start<value.length||!recipe.length)recipe.push(fragment(value.slice(start)));
  recipesByHash.set(digest,recipe);return recipe;
}
function htmlRecipe(value){
  const digest=sha(value);if(htmlRecipesByHash.has(digest))return htmlRecipesByHash.get(digest);
  const inline=/<script type="application\/json" id="frame-meta">([\s\S]*?)<\/script>/.exec(value);
  if(inline){
    const metadata=JSON.parse(inline[1]);
    if(JSON.stringify(metadata).replaceAll('<','\\u003c')!==inline[1])throw Error('Non-canonical frame metadata must be captured without reserialization');
    const start=inline.index+inline[0].indexOf('>')+1,end=start+inline[1].length;
    // Width/hash/source metadata is stored in the compressed record index,
    // not as thousands of separately gzipped copies of one JSON script tag.
    const recipe=[...htmlRecipe(value.slice(0,start)),{json:metadata},...htmlRecipe(value.slice(end))];
    htmlRecipesByHash.set(digest,recipe);return recipe;
  }
  // Whole structural blocks recur in both the live and editable documents.
  // Content-defined chunks also share their CSS/JS tails when a small prefix changes.
  const blocks=/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>|<svg\b[^>]*>[\s\S]*?<\/svg>|data:image\/[^"'\s<>]+/g;
  const recipe=[];let start=0;
  for(const match of value.matchAll(blocks)){
    if(match.index>start)recipe.push(...textRecipe(value.slice(start,match.index)));
    recipe.push(...textRecipe(match[0]));start=match.index+match[0].length;
  }
  if(start<value.length)recipe.push(...textRecipe(value.slice(start)));
  htmlRecipesByHash.set(digest,recipe);return recipe;
}
function capture(row,width,value){
  capturedRows.add(row.id);
  const key=[row.id,width,value.hash].join('|');
  if(Object.hasOwn(records,key)){
    if(captureHashes[key]!==sha(JSON.stringify(value)))throw Error('One historical identity returned different bytes: '+key);
    return;
  }
  const json=JSON.stringify(value),fields={},metadata={...value};sourceBytes+=Buffer.byteLength(json);
  // Recomputed from the preserved editable bytes; the independent capture
  // manifest keeps the original complete response digest outside the Worker.
  delete metadata.exportHash;
  for(const name of ['html','editable','mount','qaRuntime','replayFrame'])if(typeof value[name]==='string'){
    fields[name]=['html','editable'].includes(name)?htmlRecipe(value[name]):textRecipe(value[name]);delete metadata[name];
  }
  records[key]=intern({metadata,fields,propertyOrder:Object.keys(value)});captureHashes[key]=sha(json);recordCount++;
}
const replay='function replayReviewedEpoch(session){window.ORDER_QA_REVIEW_RUNTIME?.(session);('+browserFunction(mountQuoteJourneyBridge)+')(session);('+browserFunction(installReviewShortcut)+')(session);('+browserFunction(installReviewMotion)+')(session);('+frameCode+')(session);}';
const replayRecipe=textRecipe(replay);
const targetChecks=[],unavailableTargets=[];
if(options.has('review-targets')){
  const targets=JSON.parse(await readFile(resolve(options.get('review-targets')),'utf8')).targets;
  for(const item of targets){
    const target=item.target,id=[target.screen,target.state,target.variant].join('/');
    const valid=await isR3ReviewTarget(target,item.release);
    const response=await serveR3Artifact(new Request(origin+'?'+new URLSearchParams({id,width:String(target.viewport),version:'recorded',artifactHash:target.artifactHash})),{});
    if(item.baseline&&(valid!==item.baseline.valid||response.status!==item.baseline.status))throw Error('Baseline target availability changed: '+id);
    if(!valid||response.status!==200){
      if(item.baseline?.valid!==false||item.baseline?.status!==404||response.status!==404)throw Error('Unexpected unavailable review target: '+id);
      unavailableTargets.push({...item,error:await response.json()});continue;
    }
    const result=await response.json();
    if(item.sourceResponseSha256&&sha(JSON.stringify(result))!==item.sourceResponseSha256)throw Error('Baseline response bytes changed: '+id);
    capture({id},target.viewport,result);
    targetChecks.push({...item,sha256:sha(JSON.stringify(result))});
  }
}
for(const [number,row] of (targetsOnly?[]:inventory.items).entries()){
  for(const width of approvedWidths){
    const query='?'+new URLSearchParams({id:row.id,width:String(width),version:'current'});
    const current=await artifact(query);if(current.hash!==row.hashes[width])throw Error('Inventory and current identity differ: '+row.id+' '+width);
    capture(row,width,current);
    const contentHash=row.contentHashes[width];
    if(contentHash&&contentHash!==current.hash)capture(row,width,await artifact(query+'&artifactHash='+contentHash));
  }
  if((number+1)%50===0)console.error(JSON.stringify({capturedRows:number+1,totalRows:inventory.items.length,records:recordCount,fragments:fragments.length}));
}
// The old catalogue also contains raw bodies used by earlier immutable history
// rows. They may no longer be current/previous after the next product build.
// Preserve all of them in this same content-addressed fragment pool so those
// histories can resolve their exact original bytes without another full copy.
const baselineBodies=targetsOnly?{}:(await source('src/server/r3-ui/catalog.gen.mjs')).frames;
const bodies=Object.create(null),bodyHashes=Object.create(null);
let bodyBytes=0;
for(const [digest,packed] of Object.entries(baselineBodies)){
  const body=gunzipSync(Buffer.from(packed,'base64')).toString('utf8');
  if(sha(body)!==digest)throw Error('Baseline body digest mismatch: '+digest);
  bodies[digest]=htmlRecipe(body);bodyHashes[digest]={sha256:digest,utf8Bytes:Buffer.byteLength(body)};bodyBytes+=Buffer.byteLength(body);
}
const index={format:'order-reviewed-epoch/v1',release:inventory.release,records,nodes,replayRecipe,bodies};
const indexJson=JSON.stringify(index),epochIndexGzip=zip(indexJson);
const fragmentsJson=JSON.stringify(fragments),epochFragmentsGzip=zip(fragmentsJson);
const files=['src/server/r3-qa-page.mjs','src/server/r3-qa-review-runtime.mjs','src/server/r3-ui/catalog.gen.mjs','src/server/r3-ui/runtime.gen.mjs','src/server/r3-ui/qa-review-runtime.gen.mjs','src/server/r3-ui/approved-widths.gen.mjs'];
if(targetsOnly)files.push('src/server/r3-price-workspace-qa.mjs','src/server/r3-price-workspace-qa-runtime.gen.mjs','src/server/product-ui/bootstrap.gen.mjs','src/server/r3-common-motion.mjs');
const sourceFiles=Object.fromEntries(await Promise.all(files.map(async path=>[path,sha(await readFile(resolve(sourceRoot,path)))])));
const capturedInventory=targetsOnly?inventory.items.filter(row=>capturedRows.has(row.id)):inventory.items;
if(targetsOnly&&!recordCount)throw Error('Explicit capture must contain available source targets');
const epochMetadata={format:index.format,epoch,release:inventory.release,commit,tree,widths:approvedWidths,rowCount:capturedInventory.length,recordCount,bodyCount:Object.keys(bodies).length,fragmentCount:fragments.length,indexSha256:sha(indexJson),fragmentsSha256:sha(fragmentsJson),replaySha256:sha(replay),sourceFiles,...(targetsOnly?{scope:'explicit-review-targets',sourceInventoryRowCount:inventory.items.length}:{})};
const result='// Immutable release captured by scripts/r3/capture-review-epoch.mjs. Never regenerate from a later checkout.\n'+
  'export const epochMetadata='+JSON.stringify(epochMetadata)+';\n'+
  'export const epochIndexGzip='+JSON.stringify(epochIndexGzip)+';\n'+
  'export const epochFragmentsGzip='+JSON.stringify(epochFragmentsGzip)+';\n';
await mkdir(dirname(output),{recursive:true});
try{await writeFile(output,result,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(await readFile(output,'utf8')!==result)throw Error('Refusing to replace a different immutable epoch: '+relative(process.cwd(),output));}
const manifest={...epochMetadata,inventory:capturedInventory,fragmentHashes,bodyHashes,captures:captureHashes,targetChecks,unavailableTargets};
const manifestPath=resolve(options.get('manifest-output')||output+'.capture.json.gz');
await mkdir(dirname(manifestPath),{recursive:true});
const manifestBytes=gzipSync(JSON.stringify(manifest),{level:9,mtime:0});
try{await writeFile(manifestPath,manifestBytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(!(await readFile(manifestPath)).equals(manifestBytes))throw Error('Refusing to replace a different capture manifest');}
console.log(JSON.stringify({...epochMetadata,output,manifestPath,outputBytes:Buffer.byteLength(result),sourceBytes,bodyBytes,indexBytes:Buffer.byteLength(indexJson),indexGzipBytes:Buffer.from(epochIndexGzip,'base64').length,fragmentGzipBytes:Buffer.from(epochFragmentsGzip,'base64').length}));
