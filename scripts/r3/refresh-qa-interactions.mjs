// One-time, scoped refresh from an immutable source checkout. Run with the path
// to the verified pre-change checkout; old artifacts and their code stay replayable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {bootReviewFrame} from '../../src/server/r3-ui/frame.mjs';
import {bootQaHost} from '../../src/server/r3-ui/host.mjs';
import {mountReviewRequests} from '../../src/server/r3-ui/review-fixture-request.mjs';
import {mountAsyncMotion,asyncMotionCss} from '../../src/server/r3-async-motion.mjs';
import {browserFunction} from '../../src/server/browser-source.mjs';
import {quoteJellyRuntime} from '../../src/server/r3-product-sources.mjs';
import {mountSheetGesture} from './authored/sheet-motion.mjs';
import {mountMagneticAction} from '../../src/server/order-engine/browser/magnetic-action.mjs';
import {mountIntroPagination} from './authored/intro-pagination.mjs';
import {introSearchIcon,mountIntroIcons} from './authored/intro-icons.mjs';
import {createCustomerControls} from '../../src/server/r3-customer-controls.mjs';
import {mountIntegratedLogin} from './authored/integrated-login.mjs';

if(!process.argv[2])throw Error('Provide the verified pre-change checkout directory.');
const baseline=path.resolve(process.argv[2]);
const old=async name=>import(pathToFileURL(path.join(baseline,'src/server/r3-ui',name)).href);
const [source,engine,quote,markers,motion]=await Promise.all(['catalog.gen.mjs','runtime.gen.mjs','quote-journey-bridge.mjs','approved-markers.mjs','review-motion-bridge.mjs'].map(old));
const {JSDOM}=createRequire(new URL('../../tests/build-tools/package.json',import.meta.url))('jsdom');
const sha=s=>createHash('sha256').update(s).digest('hex');
const zip=s=>gzipSync(s).toString('base64');
const unzip=s=>gunzipSync(Buffer.from(s,'base64')).toString();
const directory=new URL('../../src/server/r3-ui/',import.meta.url);
const read=relative=>fs.readFile(new URL(relative,import.meta.url),'utf8');
const [account,board,accountCss,boardCss,providerJson]=await Promise.all(['account.js','onboarding.js','account.css','onboarding.css','login-provider-buttons.json'].map(f=>read('./authored/'+f)));
const providers=JSON.parse(providerJson);
for(const value of Object.values(providers)){
  const bytes=Buffer.from(value.png.replace(/^data:image\/png;base64,/,''),'base64');
  if(sha(bytes)!==value.pngSha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Unverified native login image.');
}
const end=engine.runtimes.accountFeedback.indexOf('})(window);');
if(end<0)throw Error('Shared account helpers missing.');
const core=engine.runtimes.accountFeedback.slice(0,end+'})(window);'.length);
const sheet='\nwindow.ORDER_QA_SHEET=('+browserFunction(mountSheetGesture)+');\n';
const providerRuntime='window.ORDER_QA_PROVIDER_BUTTONS='+JSON.stringify(providers)+';\n';
const updated={
  accountFeedback:core+sheet+providerRuntime+account,
  onboarding:core+sheet+'window.ORDER_CUSTOMER_CONTROLS=('+browserFunction(createCustomerControls)+')();\n'+
    'window.OrderMagneticAction=('+browserFunction(mountMagneticAction)+');\n'+
    'window.ORDER_INTRO_PAGINATION=('+browserFunction(mountIntroPagination)+');\n'+
    'window.ORDER_INTRO_ICON=('+browserFunction(introSearchIcon)+');\n'+
    'window.ORDER_INTRO_ICONS=('+browserFunction(mountIntroIcons)+');\n'+quoteJellyRuntime+'\n'+board
};
for(const [key,script] of Object.entries(engine.runtimes))
  if(script.startsWith(engine.runtimes.accountFeedback+';'))updated[key]=updated.accountFeedback+script.slice(engine.runtimes.accountFeedback.length);
updated.integratedLogin=updated.accountFeedback+';('+browserFunction(mountIntegratedLogin)+')();';
const runtimes={...engine.runtimes,...updated};
const frameCode='function runCurrentReviewFrame(session){return ('+browserFunction(bootReviewFrame)+')(session,'+
  browserFunction(mountAsyncMotion)+','+browserFunction(mountReviewRequests)+','+JSON.stringify(asyncMotionCss)+');}';
const fallback={login:'account',signup:'account',otp:'account',password:'account',terms:'account',business:'business',proof:'business',signature:'business',onboarding:'member','quote-wait':'member'};
const archiveRows={},archiveBodies={},archiveScripts={};
for(const row of source.catalog){
  const code=engine.runtimes[row.runtimeFamily||fallback[row.screen]],script=code?sha(code):null;
  if(code)archiveScripts[script]??=zip(code);
  archiveRows[row.id]={hashes:row.hashes,body:row.current,script};
  archiveBodies[row.current]??=source.frames[row.current];
}
const replay='function presentReviewFrame(session){('+browserFunction(quote.mountQuoteJourneyBridge)+')(session);('+browserFunction(markers.installReviewShortcut)+')(session);('+browserFunction(motion.installReviewMotion)+')(session);('+engine.frameCode+')(session);('+browserFunction(markers.mountApprovedMarkers)+')(session);}';
const archives={archivedRows:archiveRows,archivedBodies:archiveBodies,archivedScripts:archiveScripts,replayFrameGzip:zip(replay),cssHash:source.cssHash,cssGzip:source.cssGzip};
await fs.writeFile(new URL('interaction-history.gen.mjs',directory),'// Immutable pre-interaction-change review artifacts. Never edit original feedback identities.\n'+Object.entries(archives).map(([key,value])=>'export const '+key+'='+JSON.stringify(value)+';').join('\n')+'\n');

const frames={...source.frames};
const authScreens=new Set(['login','signup','password','otp','terms']);
let bodyChanges=0;
const catalog=source.catalog.map(row=>{
  let body=unzip(source.frames[row.current]);
  const accountScreen=authScreens.has(row.screen)&&Object.hasOwn(updated,row.runtimeFamily);
  if(accountScreen||row.screen==='onboarding'){
    if(row.screen==='login'&&row.state==='closed'){
      const empty=source.catalog.find(r=>r.screen==='login'&&r.state==='empty'&&r.variant===row.variant);
      if(!empty)throw Error('Missing matching login form for '+row.id);
      body=unzip(source.frames[empty.current]);
    }
    const dom=new JSDOM(body),doc=dom.window.document,root=doc.querySelector('#order-single');
    if(!root)throw Error('Missing approved frame root: '+row.id);
    root.querySelectorAll('#r3-qa-interaction-auth,#r3-qa-interaction-intro').forEach(el=>el.remove());
    const style=doc.createElement('style');
    style.id=accountScreen?'r3-qa-interaction-auth':'r3-qa-interaction-intro';
    style.textContent=accountScreen?accountCss:boardCss;
    if(accountScreen){
      root.querySelectorAll('.sheet-close').forEach(el=>el.remove());
      if(row.screen==='login'){
        const scene=root.querySelector('.auth-scene'),sheet=root.querySelector('.auth-sheet'),dim=root.querySelector('.sheet-dim'),background=root.querySelector('.auth-background');
        let reopen=scene?.querySelector('.auth-return-action');
        if(scene&&!reopen){reopen=doc.createElement('div');reopen.className='auth-return-action';reopen.innerHTML='<button type="button" class="btn primary" data-action="open-login">로그인</button>';scene.append(reopen);}
        const closed=row.state==='closed';
        scene?.classList.toggle('is-closed',closed);
        if(reopen)reopen.hidden=!closed;
        if(sheet)sheet.hidden=closed;
        if(dim)dim.hidden=closed;
        if(background){background.toggleAttribute('inert',!closed);if(closed)background.removeAttribute('aria-hidden');else background.setAttribute('aria-hidden','true');}
      }
    }else{
      for(const dl of root.querySelectorAll('.ob-drawer dl'))for(const dt of [...dl.children].filter(el=>el.tagName==='DT')){
        const dd=dt.nextElementSibling,wrap=doc.createElement('div');wrap.className='ob-company-line';dt.before(wrap);wrap.append(dt);if(dd?.tagName==='DD')wrap.append(dd);
      }
    }
    root.append(style);body=root.outerHTML;dom.window.close();
  }
  const digest=sha(body);if(digest!==row.current)bodyChanges++;
  frames[digest]=zip(body);
  const scriptHash=sha(frameCode.replace(/^function /,'')+(runtimes[row.runtimeFamily||fallback[row.screen]]||''));
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,sha([row.id,'current',digest,source.cssHash,width,scriptHash].join('|'))]));
  return {...row,current:digest,hashes};
});
async function rewrite(name,updates){
  const file=new URL(name+'.gen.mjs',directory),text=await fs.readFile(file,'utf8');
  await fs.writeFile(file,text.split('\n').map(line=>{const key=/^export const (\w+)=/.exec(line)?.[1];return Object.hasOwn(updates,key)?'export const '+key+'='+JSON.stringify(updates[key])+';':line;}).join('\n'));
}
await rewrite('catalog',{catalog,frames});
await rewrite('runtime',{frameCode,hostCode:browserFunction(bootQaHost),runtimes});
console.log(JSON.stringify({catalog:catalog.length,bodyChanges,archivedArtifacts:Object.keys(archiveRows).length,archivedScripts:Object.keys(archiveScripts).length}));
