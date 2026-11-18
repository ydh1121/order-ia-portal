import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import * as data from '../../src/server/r3-ui/catalog.gen.mjs';
import {runtimes,frameCode} from '../../src/server/r3-ui/runtime.gen.mjs';
import {designResult,inputJourney,mountInputJourney} from './authored/quote-journey.mjs';
const base=import.meta.url;
const read=relative=>readFile(new URL(relative,base),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const [style,question]=await Promise.all(['quote-journey.css','quote-question-polish.css'].map(f=>read('./authored/'+f)));
const frames={...data.frames}, moduleText='('+mountInputJourney.toString()+')();';
const catalog=data.catalog.map(row=>{
  const isQuestion=['q1','q3','q4'].includes(row.screen),isInput=['q2','quote-review'].includes(row.screen);
  if(!isQuestion&&!isInput&&row.screen!=='quote-result')return row;
  const old=gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
  const head=old.match(/<header class="page-head">[\s\S]*?<\/header>/)?.[0];
  if(!isQuestion&&!head)throw Error('Missing Order brand in '+row.id);
  const body=isQuestion?old.replace(/<style id="r3-question-polish">[\s\S]*?<\/style>/,'')
    .replace('</main>','<style id="r3-question-polish">'+question+'</style></main>'):
    '<main id="order-single" class="qa-screen ds" data-motion="on"><style id="r3-journey">'+style+'</style><section class="page journey-page">'+
    head+(isInput?inputJourney(row.screen,row.state):designResult(row.state))+'</section></main>';
  const current=digest(body),runtime=isQuestion?runtimes[row.runtimeFamily]:isInput?moduleText:'';
  const scriptHash=digest(frameCode.replace(/^function /,'')+runtime);
  frames[current]=gzipSync(body).toString('base64');
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,digest([row.id,'current',current,data.cssHash,width,scriptHash].join('|'))]));
  return {...row,current,hashes,authoredChange:true,...(isInput?{runtimeFamily:'quoteJourney'}:{})};
});
const used=new Set(catalog.flatMap(r=>[r.current,r.previous]));
for(const key of Object.keys(frames))if(!used.has(key))delete frames[key];
for(const [file,changes] of [['catalog',{frames,catalog}],['runtime',{runtimes:{...runtimes,quoteJourney:moduleText}}]]){
  const path=new URL('../../src/server/r3-ui/'+file+'.gen.mjs',base);
  const next=(await readFile(path,'utf8')).split('\n').map(line=>{
    const name=/^export const (\w+)=/.exec(line)?.[1];
    return Object.hasOwn(changes,name)?'export const '+name+'='+JSON.stringify(changes[name])+';':line;
  }).join('\n');
  await writeFile(path,next);
}
