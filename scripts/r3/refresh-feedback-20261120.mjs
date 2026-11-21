import {updateGeneratedModule} from './generated-targets.mjs';
// Rebuild the changed product families against the verified e8e12588 checkout.
// This script never edits the frozen review controller or any historical file.
// Usage: node scripts/r3/refresh-feedback-20261120.mjs /path/to/e8e12588-checkout
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {mountMagneticAction} from '../../src/server/order-engine/browser/magnetic-action.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../../src/server/order-engine/browser/brand-account-menu.mjs';
import {mountIntroPagination} from './authored/intro-pagination.mjs';
import {introSearchIcon} from './authored/intro-icons.mjs';
import {readReviewedEpochBody} from '../../src/server/r3-qa-epoch-history.mjs';

if(!process.argv[2])throw Error('A verified immutable baseline checkout is required.');
const baseline=path.resolve(process.argv[2]),here=fileURLToPath(new URL('.',import.meta.url));
const old=relative=>import(pathToFileURL(path.join(baseline,relative)).href);
const [source,engine,assets,oldMagnetic,oldBrand,oldPagination]=await Promise.all([
  'src/server/r3-ui/catalog.gen.mjs','src/server/r3-ui/runtime.gen.mjs','src/server/r3-ui/qa-assets.gen.mjs',
  'src/server/order-engine/browser/magnetic-action.mjs','src/server/order-engine/browser/brand-account-menu.mjs','scripts/r3/authored/intro-pagination.mjs'
].map(old));
const digest=value=>createHash('sha256').update(value).digest('hex');
const unzip=value=>gunzipSync(Buffer.from(value,'base64')).toString();
if(digest(assets.sharedCoreScript)!==assets.sharedUiProvenance.coreSha256||!engine.runtimes.business.startsWith(assets.sharedCoreScript+'\n'))throw Error('Pinned shared core provenance mismatch.');
const oldReview=await old('src/server/r3-ui/qa-review-runtime.gen.mjs');
if(oldReview.qaReviewRuntimeDigest!=='819eca4a4b65f5baca6a11eb5f5603554fed43852251a785e1b46837a76707f0')throw Error('Unexpected baseline review epoch.');
const functions=[
  [oldMagnetic.mountMagneticAction,mountMagneticAction],
  [oldBrand.mountBrandAccountMenu,mountBrandAccountMenu],
  [oldPagination.mountIntroPagination,mountIntroPagination]
];
const authored=new Map();
for(const family of ['onboarding','business']){
  const relative='scripts/r3/authored/'+family;
  const before=await fs.readFile(path.join(baseline,relative+'.js'),'utf8');
  const after=await fs.readFile(path.join(here,'authored',family+'.js'),'utf8');
  if(!engine.runtimes[family].endsWith(before))throw Error('The pinned authored suffix does not match '+family);
  authored.set(family,{before,after,css:await fs.readFile(path.join(here,'authored',family+'.css'),'utf8')});
}
const replaced={};
const runtimes=Object.fromEntries(Object.entries(engine.runtimes).map(([name,input])=>{
  let code=input;
  for(const [before,after] of functions)if(code.includes(before.toString())){code=code.replaceAll(before.toString(),after.toString());replaced[before.name]=(replaced[before.name]||0)+1;}
  for(const [family,{before,after}] of authored)if(name===family)code=code.slice(0,code.length-before.length)+after;
  return [name,code];
}));
for(const [before] of functions)if(!replaced[before.name])throw Error('No verified runtime occurrence for '+before.name);
const art=JSON.parse(await fs.readFile(path.join(here,'authored/onboarding-art.json'),'utf8'));
const artBytes=Buffer.from(art.data,'base64');
if(digest(artBytes)!==art.sha256||artBytes.subarray(0,4).toString()!=='RIFF'||artBytes.subarray(8,12).toString()!=='WEBP')throw Error('Invalid retained illustration.');
const rebuilt=new Map();
for(const [family,{after,css}] of authored){
  const window={ORDER_QA_ASSETS:{brand:assets.sharedTemplates.brand,avatar:''},ORDER_INTRO_ICON:introSearchIcon};
  const context=vm.createContext({window,console,setTimeout,clearTimeout,Uint8Array,Blob});
  vm.runInContext(assets.sharedCoreScript,context,{filename:'pinned-core.js'});
  vm.runInContext(after,context,{filename:family+'.js'});
  for(const module of window.ORDER_DESIGN_MODULES)for(const row of source.catalog.filter(row=>row.screen===module.id)){
    if(!module.states.some(state=>state.id===row.state))throw Error('A released state disappeared: '+row.id);
    const styleId=family==='onboarding'?'r3-qa-interaction-intro':'r3-business-feedback';
    rebuilt.set(row.id,{screen:row.screen,state:row.state,body:'<style id="'+styleId+'">'+css+'</style>'+module.render(row.state,{brand:assets.sharedTemplates.brand,variant:row.variant,interactive:true,fixtureOnly:true})});
  }
}
const normalized=JSON.parse(execFileSync('python',['-c',
  'import json,sys\nfrom review_document import prepare\nrows=json.load(sys.stdin)\nfor row in rows:\n row["body"]=prepare(row["body"],row["screen"],row["state"],extra_data=("intro-art","opening-date","date-part","date-value"))\njson.dump(rows,sys.stdout,ensure_ascii=False)'
],{cwd:here,input:JSON.stringify([...rebuilt].map(([id,value])=>({id,...value}))),encoding:'utf8',maxBuffer:32*1024*1024}));
for(const row of normalized)rebuilt.set(row.id,row);
const frames={...source.frames};let bodyChanges=0,runtimeChanges=0;
const catalog=source.catalog.map(row=>{
  let body=rebuilt.get(row.id)?.body||unzip(source.frames[row.current]);
  if(row.screen==='onboarding'&&rebuilt.has(row.id)){
    body=body.replaceAll('data-intro-art>','data-intro-art src="data:image/webp;base64,'+art.data+'">');
    // Reinsert the verified native icon after document sanitization, retaining
    // circle geometry and the existing WAAPI lens/page hooks.
    body=body.replace(/(<button\b[^>]*\bclass="ob-mode (simple|detail) card[^\"]*"[^>]*>)<svg\b[\s\S]*?<\/svg>/g,
      (_,button,kind)=>button+introSearchIcon(kind==='simple'));
  }
  const hadBrandStyle=/<style id="r3-brand-account-menu">/.test(body);
  if(hadBrandStyle)body=body.replace(/<style id="r3-brand-account-menu">[\s\S]*?<\/style>/g,()=>'<style id="r3-brand-account-menu">'+brandAccountMenuCss+'</style>');
  else if(row.screen==='onboarding')body=body.replace(/<\/main>$/,()=>'<style id="r3-brand-account-menu">'+brandAccountMenuCss+'</style></main>');
  const current=digest(body),family=row.runtimeFamily,code=runtimes[family]||'';
  if(current!==row.current)bodyChanges++;
  if(code!==(engine.runtimes[family]||''))runtimeChanges++;
  if(current!==row.current)frames[current]=gzipSync(body).toString('base64');
  if(current===row.current&&code===(engine.runtimes[family]||''))return row;
  const scriptHash=digest(engine.frameCode.replace(/^function /,'')+code);
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,digest([row.id,'current',current,source.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:row.authoredChange||current!==row.current};
});
const retained=new Set(catalog.flatMap(row=>[row.current,row.previous]));
// Older logo/brand publications refer to raw body hashes independently of the
// current catalog. Remove a duplicate only after proving its immutable copy.
let archivedBodies=0;
for(const [hash,packed] of Object.entries(source.frames))if(!retained.has(hash)){
  if(await readReviewedEpochBody(hash)!==unzip(packed))throw Error('Missing exact historical body '+hash);
  archivedBodies++;
}
async function rewrite(name,values){
  return updateGeneratedModule(new URL('../../src/server/r3-ui/'+name+'.gen.mjs',import.meta.url),values);
}
await rewrite('catalog',{catalog,frames:Object.fromEntries(Object.entries(frames).filter(([key])=>retained.has(key)))});
await rewrite('runtime',{runtimes});
console.log(JSON.stringify({catalog:catalog.length,rebuilt:rebuilt.size,bodyChanges,runtimeChanges,replaced,archivedBodies,frozenFrameSha256:digest(engine.frameCode)}));
