import {updateGeneratedModule} from './generated-targets.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import * as original from '../../src/server/r3-ui/catalog.gen.mjs';
import {frameCode,runtimes} from '../../src/server/r3-ui/runtime.gen.mjs';
import {quoteJellyRuntime} from '../../src/server/r3-product-sources.mjs';
import {mountSheetGesture} from './authored/sheet-motion.mjs';
import {mountMagneticAction} from '../../src/server/order-engine/browser/magnetic-action.mjs';
import {mountIntroPagination} from './authored/intro-pagination.mjs';
import {introSearchIcon,mountIntroIcons} from './authored/intro-icons.mjs';
import {createCustomerControls} from '../../src/server/r3-customer-controls.mjs';
import {mountIntegratedLogin} from './authored/integrated-login.mjs';

const read=relative=>readFile(new URL(relative,import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const unpack=b64=>gunzipSync(Buffer.from(b64,'base64')).toString();
const sheet='\nwindow.ORDER_QA_SHEET=('+mountSheetGesture.toString()+');\n';
const controls='window.ORDER_CUSTOMER_CONTROLS=('+createCustomerControls.toString()+')();\n';
const magnetic='window.OrderMagneticAction=('+mountMagneticAction.toString()+');\n';
const pagination='window.ORDER_INTRO_PAGINATION=('+mountIntroPagination.toString()+');\n';
const iconRuntime='window.ORDER_INTRO_ICON=('+introSearchIcon.toString()+');\nwindow.ORDER_INTRO_ICONS=('+mountIntroIcons.toString()+');\n';
const [account,board,accountCss,boardCss]=await Promise.all(['account.js','onboarding.js','account.css','onboarding.css'].map(f=>read('./authored/'+f)));
const coreEnd=runtimes.accountFeedback.indexOf('})(window);');
if(coreEnd<0)throw Error('Missing shared QA helpers');
const core=runtimes.accountFeedback.slice(0,coreEnd+'})(window);'.length);
const updated={
  accountFeedback:core+sheet+account,
  onboarding:core+sheet+controls+magnetic+pagination+iconRuntime+quoteJellyRuntime+'\n'+board
};
for(const [key,script] of Object.entries(runtimes))
  if(script.startsWith(runtimes.accountFeedback+';'))updated[key]=updated.accountFeedback+script.slice(runtimes.accountFeedback.length);
updated.integratedLogin=updated.accountFeedback+';('+mountIntegratedLogin.toString()+')();';
const frames={...original.frames};
const catalog=original.catalog.map(row=>{
  if(!Object.hasOwn(updated,row.runtimeFamily))return row;
  let body=unpack(frames[row.current]).replace(/<style id="r3-auth-motion">[\s\S]*?<\/style>/g,'');
  const board=row.screen==='onboarding';
  const css=board?boardCss.slice(boardCss.indexOf('.ob.footer-open .ob-stage{filter:none}')):accountCss.slice(accountCss.indexOf('/* Invalid inputs'));
  const style='<style id="r3-auth-motion">'+css+'</style>';
  body=body.replace(/<\/main>$/,style+'</main>');
  if(!body.includes(style))throw Error('Missing review root in '+row.id);
  if(board){
    body=body.replace(/(<button\b[^>]*\bclass="ob-mode (simple|detail) card[^"]*"[^>]*>)<svg\b[\s\S]*?<\/svg>/g,
      (_,button,kind)=>button+introSearchIcon(kind==='simple'));
  }else{
    body=body.replace(/(<div class="liquid-segments">)([\s\S]*?)(<\/div>)/g,(_,head,segments,tail)=>
      head+segments.replace(/<b><\/b><\/i>/g,'<b></b><em aria-hidden="true"></em></i>')+tail)
      .replace(/<span class="inline-field-state" aria-hidden="true">[^<]*<\/span>/g,'')
      .replace(/<div id="([^"]+)" data-otp-feedback/g,'<div id="$1" class="sr-only" data-otp-feedback')
      .replace(/(\bdata-otp-clock>)인증번호가 만료됐어요\./g,(_,clock)=>clock+'00분 00초');
  }
  const current=sha(body);
  frames[current]=gzipSync(body).toString('base64');
  const scriptHash=sha(frameCode.replace(/^function /,'')+updated[row.runtimeFamily]);
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,sha([row.id,'current',current,original.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:true};
});
const used=new Set(catalog.flatMap(row=>[row.current,row.previous]));
async function rewrite(module,entries){
  return updateGeneratedModule(new URL('../../src/server/r3-ui/'+module+'.gen.mjs',import.meta.url),entries);
}
await rewrite('catalog',{catalog,frames:Object.fromEntries(Object.entries(frames).filter(([k])=>used.has(k)))});
await rewrite('runtime',{runtimes:{...runtimes,...updated}});
console.log('Updated auth and onboarding fixture families',Object.keys(updated).join(', '));
