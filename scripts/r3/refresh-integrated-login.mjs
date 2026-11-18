import {readFile, writeFile} from 'node:fs/promises';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as original from '../../src/server/r3-ui/catalog.gen.mjs';
import {frameCode,runtimes} from '../../src/server/r3-ui/runtime.gen.mjs';
import {mountIntegratedLogin} from './authored/integrated-login.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reference=JSON.parse(await readFile(new URL('./authored/login-provider-buttons.json',import.meta.url)));
const buttons=['kakao','naver','google'].map(provider=>{
  const ref=reference[provider],bytes=Buffer.from(ref.png,'base64');
  if(hash(bytes)!==ref.pngSha256||bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Invalid provider PNG: '+provider);
  return '<button type="button" class="integrated-provider" data-action="social-'+provider+'" aria-label="'+ref.label+'"><img width="48" height="48" alt="" src="data:image/png;base64,'+ref.png+'"></button>';
}).join('');
const css='<style class="integrated-login-style">.ds .auth-layout .integrated-providers{display:flex;align-items:center;justify-content:center;gap:12px}.ds .integrated-provider{display:grid;place-items:center;width:48px;height:48px;margin:0;padding:0;border:0;background:transparent;box-shadow:none}.ds .integrated-provider img{display:block;width:48px;height:48px;max-width:none;object-fit:contain}.ds .integrated-provider:focus-visible{outline:3px solid #5188ff;outline-offset:3px}</style>';
const mount=runtimes.accountFeedback+';('+mountIntegratedLogin.toString()+')();';
const scriptHash=hash(frameCode.replace(/^function /,'')+mount);
const frames={...original.frames};
const catalog=original.catalog.map(row=>{
  if(!['login','signup'].includes(row.screen)||row.state==='success')return row;
  let body=gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
  if(row.screen==='signup'&&!body.includes('class="integrated-login-style"')){
    if(!body.includes('data-submit-action="submit-signup"'))return row;
    const signupButtons=buttons.replaceAll(' 로그인"',' 가입"');
    const group='<div class="social-buttons integrated-providers" role="group" aria-label="간편 가입">'+signupButtons+'</div>';
    body=body.replace('</form>',()=>'</form>'+group).replace('</main>',()=>css+'</main>');
  }
  if(!body.includes('class="social-buttons"')&&!body.includes('class="integrated-login-style"'))return row;
  if(!body.includes('class="integrated-login-style"'))body=body.replace(/<div class="social-buttons">[\s\S]*?<\/div>/,()=>'<div class="social-buttons integrated-providers">'+buttons+'</div>').replace('</main>',()=>css+'</main>');
  const current=hash(body);
  frames[current]=gzipSync(body).toString('base64');
  const family=row.screen==='signup'?'accountFeedback':'integratedLogin';
  const effectiveHash=row.screen==='signup'?hash(frameCode.replace(/^function /,'')+runtimes.accountFeedback):scriptHash;
  const fingerprints=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,hash([row.id,'current',current,original.cssHash,width,effectiveHash].join('|'))]));
  return {...row,current,hashes:fingerprints,authoredChange:true,runtimeFamily:family};
});
const used=new Set(catalog.flatMap(r=>[r.current,r.previous]));
async function fields(file,updates){
  const path=new URL('../../src/server/r3-ui/'+file,import.meta.url);
  const lines=(await readFile(path,'utf8')).split('\n').map(line=>{
    const key=/^export const (\w+)=/.exec(line)?.[1];return Object.hasOwn(updates,key)?'export const '+key+'='+JSON.stringify(updates[key])+';':line;
  });
  await writeFile(path,lines.join('\n'));
}
await fields('catalog.gen.mjs',{catalog,frames:Object.fromEntries(Object.entries(frames).filter(([k])=>used.has(k)))});
await fields('runtime.gen.mjs',{runtimes:{...runtimes,integratedLogin:mount}});
