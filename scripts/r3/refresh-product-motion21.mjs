// Refresh the current product from an exact release10 baseline. Review host,
// annotation frame and all historical modules are read-only inputs.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import * as current from '../../src/server/product-ui/catalog.gen.mjs';
import {runtimes as currentRuntimes} from '../../src/server/product-ui/runtime.gen.mjs';
import {frameCode} from '../../src/server/r3-ui/review-engine.gen.mjs';
import {browserFunction} from '../../src/server/browser-source.mjs';
import {updateGeneratedModule} from './generated-targets.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../../src/server/order-engine/browser/brand-account-menu.mjs';
import {createCustomerControls} from '../../src/server/r3-customer-controls.mjs';
import {mountAsyncMotion} from '../../src/server/r3-async-motion.mjs';
import {mountReviewControls} from './authored/admin-common.mjs';
import {introSearchIcon} from './authored/intro-icons.mjs';

if(!process.argv[2])throw Error('Provide the immutable release10 baseline checkout.');
const baseline=resolve(process.argv[2]),here=fileURLToPath(new URL('.',import.meta.url));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:baseline,encoding:'utf8'}).trim();
if(commit!=='e5f97029b58d1f1d90bb910bebfed7237e84e2bb')throw Error('Expected the verified release10 baseline, received '+commit);
execFileSync('git',['diff','--quiet',commit,'--','src/server/r3-ui/catalog.gen.mjs','src/server/r3-ui/runtime.gen.mjs','src/server/r3-ui/qa-assets.gen.mjs','scripts/r3/authored/account.js','scripts/r3/authored/business.js','scripts/r3/authored/navigation.js','scripts/r3/authored/navigation.css','scripts/r3/authored/onboarding.js','scripts/r3/authored/admin-common.mjs','src/server/r3-customer-controls.mjs','src/server/r3-async-motion.mjs','src/server/order-engine/browser/brand-account-menu.mjs'],{cwd:baseline});
const old=relative=>import(pathToFileURL(join(baseline,relative)).href);
const [source,engine,assets,brand,customer,asyncMotion,admin]=await Promise.all([
 'src/server/r3-ui/catalog.gen.mjs','src/server/r3-ui/runtime.gen.mjs','src/server/r3-ui/qa-assets.gen.mjs',
 'src/server/order-engine/browser/brand-account-menu.mjs','src/server/r3-customer-controls.mjs',
 'src/server/r3-async-motion.mjs','scripts/r3/authored/admin-common.mjs'
].map(old));
const sha=value=>createHash('sha256').update(value).digest('hex');
const unpack=value=>gunzipSync(Buffer.from(value,'base64')).toString();
if(frameCode!==engine.frameCode)throw Error('The fixed review frame changed before the product refresh.');
if(current.cssHash!==source.cssHash)throw Error('This scoped refresh does not replace canonical CSS.');
if(sha(assets.sharedCoreScript)!==assets.sharedUiProvenance.coreSha256)throw Error('Baseline shared core provenance mismatch.');
const navigationScreens=new Set(['passes','search','profile','drawer']);
const navigationCssBefore=await readFile(join(baseline,'scripts/r3/authored/navigation.css'),'utf8');
const navigationCssAfter=await readFile(new URL('./authored/navigation.css',import.meta.url),'utf8');
const navigationStyleBefore='<style>'+navigationCssBefore+'</style>';
const navigationStyleAfter='<style id="r3-navigation">'+navigationCssAfter+'</style>';
let navigationStyleChanges=0;
function refreshNavigationStyle(body,row){
 if(!navigationScreens.has(row.screen)||navigationCssBefore===navigationCssAfter)return body;
 const originalCount=body.split(navigationStyleBefore).length-1;
 const owned=[...body.matchAll(/<style id="r3-navigation">[\s\S]*?<\/style>/g)];
 if(originalCount===1&&owned.length===0){navigationStyleChanges++;return body.replace(navigationStyleBefore,()=>navigationStyleAfter);}
 // Later refreshes replace only this explicitly owned current style. The first
 // migration above requires the immutable baseline's complete bytes to match.
 if(originalCount===0&&owned.length===1){
  if(owned[0][0]===navigationStyleAfter)return body;
  navigationStyleChanges++;return body.replace(owned[0][0],()=>navigationStyleAfter);
 }
 throw Error('Expected one exact baseline or owned current navigation style: '+row.id);
}
const {JSDOM}=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url))('jsdom');
const authored=[];
for(const [file,key] of [['account','accountFeedback'],['business','business'],['navigation','navigation'],['onboarding','onboarding']]){
 const before=await readFile(join(baseline,'scripts/r3/authored',file+'.js'),'utf8');
 const after=await readFile(new URL('./authored/'+file+'.js',import.meta.url),'utf8');
 if(!engine.runtimes[key]?.endsWith(before))throw Error('Baseline authored suffix does not match '+key);
 authored.push({file,key,before,after,changed:before!==after});
}
const functionPairs=[
 ['brand account menu',brand.mountBrandAccountMenu,mountBrandAccountMenu],
 ['customer controls',customer.createCustomerControls,createCustomerControls],
 ['asynchronous motion',asyncMotion.mountAsyncMotion,mountAsyncMotion],
 ['admin controls',admin.mountReviewControls,mountReviewControls]
];
const counts={},runtimes={},rebuiltFamilies=[];
for(const [key,input] of Object.entries(currentRuntimes)){
 const baselineCode=engine.runtimes[key];
 // Rebuild only keys containing a declared authored or shared-function owner.
 // This permits another edit after an intermediate generation: the authoritative
 // source is the latest tracked file, never an unrecorded intermediate suffix.
 // Other current families (including new ones) remain byte-for-byte inputs.
 const owned=typeof baselineCode==='string'&&(authored.some(family=>baselineCode.includes(family.before))||functionPairs.some(([,before])=>baselineCode.includes(browserFunction(before))||baselineCode.includes(before.toString())));
 let code=owned?baselineCode:input;
 const priorBounce="if(api.reduced?.())return;const shell=input.closest('.input-shell');",guardedBounce="if(w.ORDER_COMMON_MOTION||api.reduced?.())return;const shell=input.closest('.input-shell');";
 // Undo only the exact earlier all-family guard transformation on unowned
 // compatibility runtimes; their preserved implementation remains unchanged.
 if(!owned&&typeof baselineCode==='string'&&input===baselineCode.replaceAll(priorBounce,guardedBounce))code=baselineCode;
 if(owned)rebuiltFamilies.push(key);
 for(const family of authored.filter(item=>item.changed)){
  if(code.includes(family.before)){code=code.replaceAll(family.before,family.after);counts[family.key]=(counts[family.key]||0)+1;}
  else if(code.includes(family.after))counts[family.key]??=0;
 }
 for(const [name,before,after] of functionPairs){
  if(before.toString()===after.toString())continue;
  const oldWrapped=browserFunction(before),newWrapped=browserFunction(after);
  if(code.includes(oldWrapped)){code=code.replaceAll(oldWrapped,newWrapped);counts[name]=(counts[name]||0)+1;}
  else if(code.includes(before.toString())){code=code.replaceAll(before.toString(),after.toString());counts[name]=(counts[name]||0)+1;}
  else if(code.includes(newWrapped)||code.includes(after.toString()))counts[name]??=0;
 }
 // Input error handling remains unchanged; the common glyph overlay owns the
 // typing animation, so the former whole-field bounce must not run as well.
 if(owned)code=code.replaceAll(priorBounce,guardedBounce);
 runtimes[key]=code;
}
for(const family of authored.filter(item=>item.changed))if(!runtimes[family.key]?.includes(family.after))throw Error('Current authored target was not updated: '+family.key);
for(const [name,before,after] of functionPairs)if(before.toString()!==after.toString()&&!Object.hasOwn(counts,name))throw Error('No exact current runtime occurrence for '+name);

const coreScript=new vm.Script(assets.sharedCoreScript,{filename:'verified-product-core.js'});
function render(script,row){
 const window={ORDER_QA_ASSETS:{brand:assets.sharedTemplates.brand,avatar:''},ORDER_INTRO_ICON:introSearchIcon};
 const context=vm.createContext({window,console,setTimeout,clearTimeout,Uint8Array,Blob});
 coreScript.runInContext(context);script.runInContext(context);
 const module=window.ORDER_DESIGN_MODULES?.find(module=>module.id===row.screen);
 if(!module)return null;
 if(!module.states.some(state=>state.id===row.state))throw Error('A released state disappeared: '+row.id);
 return {body:module.render(row.state,{brand:assets.sharedTemplates.brand,variant:row.variant,interactive:true,fixtureOnly:true}),description:module.description};
}
const rebuilt=new Map();
for(const family of authored.filter(item=>item.changed)){
 const before=new vm.Script(family.before,{filename:'before-'+family.file+'.js'});
 const after=new vm.Script(family.after,{filename:'after-'+family.file+'.js'});
 const screens={account:['login','signup','password','otp','terms'],business:['business','proof','signature'],navigation:['passes','search','profile','drawer'],onboarding:['onboarding']}[family.file];
 for(const row of current.catalog.filter(row=>screens.includes(row.screen))){
  const oldRender=render(before,row);if(!oldRender)continue;
  const next=render(after,row);
  if(oldRender.body!==next.body)rebuilt.set(row.id,{id:row.id,screen:row.screen,state:row.state,...next});
 }
}
if(rebuilt.size){
 const python='import json,sys\nfrom review_document import prepare\nrows=json.load(sys.stdin)\nfor row in rows:\n row["body"]=prepare(row["body"],row["screen"],row["state"],extra_data=("intro-art","opening-date","date-part","date-value","policy-content","policy-meta","policy-status","policy-retry"))\njson.dump(rows,sys.stdout,ensure_ascii=False)';
 const normalized=JSON.parse(execFileSync('python',['-c',python],{cwd:here,input:JSON.stringify([...rebuilt.values()]),encoding:'utf8',maxBuffer:32*1024*1024}));
 for(const item of normalized)rebuilt.set(item.id,item);
}
const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
const frames={...current.frames};let bodyChanges=0,runtimeChanges=0;
const catalog=current.catalog.map(row=>{
 const oldBody=unpack(current.frames[row.current]);let body=oldBody;
 const replacement=rebuilt.get(row.id);
 if(replacement){
  const dom=new JSDOM(oldBody),root=dom.window.document.querySelector('#order-single');
  if(!root)throw Error('Canonical root missing: '+row.id);
  const styles=[...root.querySelectorAll('style')].map(style=>style.cloneNode(true));
  const template=dom.window.document.createElement('template');template.innerHTML=replacement.body;
  const rendered=template.content.querySelector('#order-single');
  if(!rendered)throw Error('Prepared product root missing: '+row.id);
  root.replaceChildren(...styles,...rendered.childNodes);
  if(row.screen==='profile'){
   root.querySelector('.profile-picker')?.remove();
   if(!root.querySelector('[data-account-menu-host]')){const host=dom.window.document.createElement('div');host.dataset.accountMenuHost='';root.querySelector('.profile-page')?.append(host);}
  }
  body=root.outerHTML;dom.window.close();
 }
 body=body.replace(/<style id="r3-brand-account-menu">[\s\S]*?<\/style>/g,()=>'<style id="r3-brand-account-menu">'+brandAccountMenuCss+'</style>');
 body=refreshNavigationStyle(body,row);
 const next=sha(body),family=row.runtimeFamily||fallback[row.screen],code=runtimes[family]||'';
 const changedBody=next!==row.current,changedRuntime=code!==(currentRuntimes[family]||'');
 if(!changedBody&&!changedRuntime)return row;
 if(changedBody){bodyChanges++;frames[next]=gzipSync(body).toString('base64');}
 if(changedRuntime)runtimeChanges++;
 const scriptHash=sha(frameCode.replace(/^function /,'')+code);
 const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,sha([row.id,'current',next,current.cssHash,width,scriptHash].join('|'))]));
 return {...row,current:next,hashes,authoredChange:true,...(replacement?.description?{description:replacement.description}:{})};
});
await updateGeneratedModule(new URL('../../src/server/product-ui/runtime.gen.mjs',import.meta.url),{runtimes});
await updateGeneratedModule(new URL('../../src/server/product-ui/catalog.gen.mjs',import.meta.url),{catalog,frames});
console.log(JSON.stringify({baseline:commit,bodyChanges,runtimeChanges,navigationStyleChanges,rendered:rebuilt.size,rebuiltFamilies,replacements:counts,hostWrites:0,frameWrites:0,historicalWrites:0}));
