import {readFile, writeFile} from 'node:fs/promises';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as original from '../../src/server/r3-ui/catalog.gen.mjs';
import {frameCode, runtimes as existing} from '../../src/server/r3-ui/runtime.gen.mjs';
import {mountIntegratedLogin} from './authored/integrated-login.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const target = 'login/empty/compact';
const reference = JSON.parse(await readFile(new URL('./authored/login-provider-buttons.json',import.meta.url)));
const buttons = ['kakao','naver','google'].map(provider => {
  const ref = reference[provider], bytes = Buffer.from(ref.png, 'base64');
  if(hash(bytes) !== ref.pngSha256 || bytes.toString('hex',0,8)!=='89504e470d0a1a0a')
    throw Error('Invalid provider PNG: '+provider);
  return '<button type="button" class="integrated-provider" data-action="social-'+provider+'" aria-label="'+ref.label+'"><img width="48" height="48" alt="" src="data:image/png;base64,'+ref.png+'"></button>';
}).join('');
const controls = '<div class="social-buttons integrated-providers">'+buttons+'</div>';
const css = '<style class="integrated-login-style">.ds .auth-layout.compact .integrated-providers{display:flex;align-items:center;justify-content:center;gap:12px}.ds .integrated-providers .integrated-provider{display:grid;place-items:center;width:48px;height:48px;margin:0;padding:0;border:0;background:transparent;box-shadow:none}.ds .integrated-provider img{display:block;width:48px;height:48px;max-width:none;object-fit:contain}.ds .integrated-provider:focus-visible{outline:3px solid #5188ff;outline-offset:3px}</style>';
const matched = original.catalog.filter(row => row.id === target);
if(matched.length !== 1) throw Error('Missing integrated login frame');
const before=matched[0];
let body=gunzipSync(Buffer.from(original.frames[before.current],'base64')).toString();
if(!body.includes('class="integrated-login-style"')){
  if(!body.includes('<div class="auth-layout compact">') || !/<div class="social-buttons">[\s\S]*?<\/div>/.test(body))
    throw Error('Unexpected integrated login layout');
  body=body.replace(/<div class="social-buttons">[\s\S]*?<\/div>/,()=>controls).replace('</main>',()=>css+'</main>');
}
const current=hash(body);
const runtimeKey='integratedLogin';
const runtime=existing.accountFeedback+';('+mountIntegratedLogin.toString()+')();';
const scriptHash=hash(frameCode.replace(/^function /,'')+runtime);
const hashes=Object.fromEntries(Object.keys(before.hashes).map(width=>[width,hash([target,'current',current,original.cssHash,width,scriptHash].join('|'))]));
const catalog=original.catalog.map(row=>row.id===target?{...row,current,hashes,authoredChange:true,runtimeFamily:runtimeKey}:row);
const frames={...original.frames,[current]:gzipSync(body).toString('base64')};
const used=new Set(catalog.flatMap(row=>[row.current,row.previous]));
async function writeFields(name,fields){
  const path=new URL('../../src/server/r3-ui/'+name,import.meta.url);
  const lines=(await readFile(path,'utf8')).split('\n').map(line=>{
    const key=/^export const (\w+)=/.exec(line)?.[1];
    return Object.hasOwn(fields,key)?'export const '+key+'='+JSON.stringify(fields[key])+';':line;
  });
  await writeFile(path,lines.join('\n'));
}
await writeFields('catalog.gen.mjs',{catalog,frames:Object.fromEntries(Object.entries(frames).filter(([key])=>used.has(key)))});
await writeFields('runtime.gen.mjs',{runtimes:{...existing,[runtimeKey]:runtime}});
console.log(JSON.stringify({target,hashes}));
