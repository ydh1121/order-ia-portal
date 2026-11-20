// Rebuild only the shared brand/account consumers from a verified immutable
// checkout. All pre-change artifact hashes, bodies and runtimes remain replayable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {browserFunction} from '../../src/server/browser-source.mjs';
import {quoteJellyRuntime} from '../../src/server/r3-product-sources.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../../src/server/order-engine/browser/brand-account-menu.mjs';

if(!process.argv[2])throw Error('Provide the verified pre-change checkout.');
const baseline=path.resolve(process.argv[2]),directory=new URL('../../src/server/r3-ui/',import.meta.url);
const old=name=>import(pathToFileURL(path.join(baseline,'src/server/r3-ui',name)).href);
const [source,engine,quote,markers,motion]=await Promise.all(['catalog.gen.mjs','runtime.gen.mjs','quote-journey-bridge.mjs','approved-markers.mjs','review-motion-bridge.mjs'].map(old));
const {JSDOM}=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url))('jsdom');
const sha=value=>createHash('sha256').update(value).digest('hex'),zip=value=>gzipSync(value).toString('base64'),unzip=value=>gunzipSync(Buffer.from(value,'base64')).toString();
const common='\nwindow.mountBrandAccountMenu=('+browserFunction(mountBrandAccountMenu)+');\n';
const updated={};
for(const [file,family] of [['account','accountFeedback'],['navigation','navigation'],['onboarding','onboarding']]){
  const [before,after]=await Promise.all([fs.readFile(path.join(baseline,'scripts/r3/authored',file+'.js'),'utf8'),fs.readFile(new URL('./authored/'+file+'.js',import.meta.url),'utf8')]);
  const script=engine.runtimes[family],at=script.indexOf(before);
  if(at<0||!script.endsWith(before))throw Error('The authored family does not match the verified runtime: '+family);
  updated[family]=script.slice(0,at)+(script.includes(quoteJellyRuntime)?'':quoteJellyRuntime)+common+after;
  for(const [key,value] of Object.entries(engine.runtimes))if(key!==family&&value.startsWith(script+';'))updated[key]=updated[family]+value.slice(script.length);
}
// The old profile-only fixture preference bridge cannot override the injected
// authenticated account/notification adapter.
updated.profileNotice=updated.navigation;
const runtimes={...engine.runtimes,...updated};
const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
const archivedRows={},archivedBodies={},archivedScripts={};
for(const row of source.catalog){
  const code=engine.runtimes[row.runtimeFamily||fallback[row.screen]],script=code?sha(code):null;
  if(code)archivedScripts[script]??=zip(code);
  archivedRows[row.id]={hashes:row.hashes,body:row.current,script};archivedBodies[row.current]??=source.frames[row.current];
}
const replay='function presentReviewFrame(session){('+browserFunction(quote.mountQuoteJourneyBridge)+')(session);('+browserFunction(markers.installReviewShortcut)+')(session);('+browserFunction(motion.installReviewMotion)+')(session);('+engine.frameCode+')(session);('+browserFunction(markers.mountApprovedMarkers)+')(session);}';
const archives={archivedRows,archivedBodies,archivedScripts,replayFrameGzip:zip(replay),cssHash:source.cssHash,cssGzip:source.cssGzip};
const archiveText='// Immutable pre-shared-brand revision. Preserve original feedback identities.\n'+Object.entries(archives).map(([key,value])=>'export const '+key+'='+JSON.stringify(value)+';').join('\n')+'\n';
const archiveFile=new URL('brand-history.gen.mjs',directory);
try{const existing=await fs.readFile(archiveFile,'utf8');if(existing!==archiveText)throw Error('The existing brand history must not be overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(archiveFile,archiveText);}
const frames={...source.frames};let bodyChanges=0;
const catalog=source.catalog.map(row=>{
  if(!Object.hasOwn(updated,row.runtimeFamily))return row;
  const dom=new JSDOM(unzip(source.frames[row.current])),doc=dom.window.document,root=doc.querySelector('#order-single');
  if(!root)throw Error('Missing canonical frame root: '+row.id);
  root.querySelectorAll('#r3-brand-account-menu').forEach(node=>node.remove());
  if(row.screen==='onboarding'){
    const header=root.querySelector('.ob-stage>header'),mark=header?.querySelector('svg');
    if(!mark||mark.querySelectorAll('g>path').length!==3)throw Error('Missing original CODE1: '+row.id);
    const brand=doc.createElement('div');brand.className='brand ob-brand-common';
    brand.innerHTML='<strong class="ob-wordmark brand-word">Order<span class="ob-period brand-dot" aria-hidden="true">.</span></strong>';
    brand.append(mark);const join=header.querySelector('.ob-join');header.replaceChildren(brand);if(join)header.append(join);
  }
  if(row.screen==='profile'){
    root.querySelector('.profile-picker')?.remove();
    if(!root.querySelector('[data-account-menu-host]')){const host=doc.createElement('div');host.dataset.accountMenuHost='';root.querySelector('.profile-page')?.append(host);}
  }
  const style=doc.createElement('style');style.id='r3-brand-account-menu';style.textContent=brandAccountMenuCss;root.append(style);
  const body=root.outerHTML,current=sha(body);dom.window.close();frames[current]=zip(body);if(current!==row.current)bodyChanges++;
  const scriptHash=sha(engine.frameCode.replace(/^function /,'')+runtimes[row.runtimeFamily]);
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,sha([row.id,'current',current,source.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:true};
});
async function rewrite(file,values){
  const target=new URL(file,directory),text=await fs.readFile(target,'utf8');
  await fs.writeFile(target,text.split('\n').map(line=>{const name=/^export const (\w+)=/.exec(line)?.[1];return Object.hasOwn(values,name)?'export const '+name+'='+JSON.stringify(values[name])+';':line;}).join('\n'));
}
await rewrite('catalog.gen.mjs',{catalog,frames});
await rewrite('runtime.gen.mjs',{runtimes});
console.log(JSON.stringify({catalog:catalog.length,bodyChanges,families:Object.keys(updated),preservedArtifacts:Object.keys(archivedRows).length,brandModuleSha256:sha(browserFunction(mountBrandAccountMenu)),brandCssSha256:sha(brandAccountMenuCss)}));
