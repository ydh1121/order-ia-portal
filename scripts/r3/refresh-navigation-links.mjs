import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as data from '../../src/server/r3-ui/catalog.gen.mjs';
import {runtimes as base,frameCode} from '../../src/server/r3-ui/runtime.gen.mjs';
import {quoteFiles,quoteCommit,quoteSourceHashes} from '../../src/server/r3-product-sources.mjs';
import {bootQaHost} from '../../src/server/r3-ui/host.mjs';
import {consultationDate} from './authored/consult-date.mjs';
import {connectNoticePreferences} from './authored/notice-preferences.mjs';
const ref=JSON.parse(await readFile(new URL('./authored/consult-date-reference.json',import.meta.url),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
if(quoteCommit!==ref.commit||quoteSourceHashes[ref.source]!==ref.sha256||hash(gunzipSync(Buffer.from(quoteFiles[ref.source],'base64')))!==ref.sha256)throw Error('Consultation calendar source differs from sealed product.');
const notice=';('+connectNoticePreferences.toString()+')();';
const calendar=';('+consultationDate.toString()+')(new AbortController().signal,document.querySelector("#order-single"),'+JSON.stringify({coverage:ref.coverage,records:ref.records})+');';
const template=(await readFile(new URL('./authored/consult-date.html',import.meta.url),'utf8')).trim();
const css=await readFile(new URL('./authored/consult-date.css',import.meta.url),'utf8');
const runtimes={...base,consultation:base.navigation+calendar,profileNotice:base.navigation+notice,termsNotice:base.accountFeedback+notice};
const frames={...data.frames};
const catalog=data.catalog.map(row=>{
  const isTerms=row.id==='terms/optional/email';
  const booking=row.screen==='drawer'&&['closed','booking','wheel','saving'].includes(row.state);
  const family=isTerms?'termsNotice':booking?'consultation':row.screen==='profile'?'profileNotice':null;
  if(!family)return row;
  let current=row.current;
  if(booking){
    let doc=gunzipSync(Buffer.from(frames[current],'base64')).toString();
    if(!doc.includes('class="consult-date-dialog"')){
      const original=/<div class="booking-day">[\s\S]*?<\/div>(?=<div class="wheel-picker")/;
      if(!original.test(doc))throw Error('Missing existing booking value: '+row.id);
      doc=doc.replace(original,()=>template+'<style>'+css+'</style>');
      current=hash(doc);frames[current]=gzipSync(doc).toString('base64');
    }
  }
  if(isTerms){
    let doc=gunzipSync(Buffer.from(frames[current],'base64')).toString();
    if(!doc.includes('data-action="open-notice-settings"')){
      doc=doc.replace('</main>','<div class="bottom-actions"><button type="button" class="btn text" data-action="open-notice-settings">알림 수신 설정</button></div></main>');
      current=hash(doc);frames[current]=gzipSync(doc).toString('base64');
    }
  }
  const scriptHash=hash(frameCode.replace(/^function /,'')+runtimes[family]);
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,hash([row.id,'current',current,data.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:true,runtimeFamily:family};
});
const used=new Set(catalog.flatMap(row=>[row.current,row.previous]));
async function update(file,fields){
  const path=new URL('../../src/server/r3-ui/'+file,import.meta.url);
  const lines=(await readFile(path,'utf8')).split('\n').map(line=>{const k=/^export const (\w+)=/.exec(line)?.[1];return Object.hasOwn(fields,k)?'export const '+k+'='+JSON.stringify(fields[k])+';':line;});
  await writeFile(path,lines.join('\n'));
}
await update('catalog.gen.mjs',{catalog,frames:Object.fromEntries(Object.entries(frames).filter(([k])=>used.has(k)))});
await update('runtime.gen.mjs',{runtimes,hostCode:bootQaHost.toString()});
