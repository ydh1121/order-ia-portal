// Seal the approved product build into server-private assets. Never copy dist
// into public: every resource is returned by the existing OWNER gate.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const productRoot=process.argv[2]&&resolve(process.argv[2]);
if(!productRoot)throw Error('Usage: node scripts/seal-r3-product.mjs /path/to/verified/order');
const config=JSON.parse(await readFile(resolve(productRoot,'config/pages-build.json')));
const identity=JSON.parse(await readFile(resolve(productRoot,'dist/build-identity.json')));
const git=(...args)=>execFileSync('git',args,{cwd:productRoot});
const commit=git('rev-parse','HEAD').toString().trim();
if(!/^[0-9a-f]{40}$/.test(commit)||identity.scope!=='INTEGRATED_PRODUCT'||identity.repository!=='ydh1121/order'||identity.commitSha!==commit)throw Error('Rebuild order at the selected Git commit');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files={},sourceHashes={};
let html,quoteJellyRuntime;
function once(text,from,to){
 if(text.split(from).length!==2)throw Error('Private mount adapter no longer matches its pinned source: '+from);
 return text.replace(from,to);
}

for(const item of identity.files){
 const declared=config.frontendFiles.find(f=>f.output===item.path);
 const publicPath=declared?'web/'+declared.output:item.path;
 if(!/^(?:web\/[a-zA-Z0-9-]+\.(?:mjs|css)|src\/(?:engine|browser)\/[a-zA-Z0-9_./-]+\.mjs|web\/index\.html|assets\/iana-reference\.json)$/.test(publicPath))continue;
 const bytes=await readFile(resolve(productRoot,'dist',item.path));
 if(hash(bytes)!==item.sha256)throw Error('Changed dist file '+item.path);
 if(publicPath!=='assets/iana-reference.json'&&hash(git('show',commit+':'+(declared?.source||item.path)))!==item.sha256)throw Error('Uncommitted source '+item.path);
 sourceHashes[publicPath]=item.sha256;
 let text=bytes.toString('utf8');
 if(publicPath==='web/index.html'){html=text;continue;}
 if(publicPath==='web/code1-jelly.mjs'){
  const split=text.indexOf('\nexport const '),factory=text.slice(0,split);
  if(split<0||!factory.endsWith('globalThis);\n'))throw Error('Unexpected CODE1 module shape');
  quoteJellyRuntime='(()=>{'+factory+'window.Code1Jelly=Code1Jelly;})();\n';
 }
 if(publicPath==='web/main.mjs')text=once(text,"new URL(location.href).searchParams.get('mode')==='simple'","document.documentElement.dataset.r3QuoteMode==='simple'");
 // The private host's existing Access cookie is required even for its public boolean projection.
 if(publicPath==='web/order-menu.mjs')text=once(text,
  "fetch('/api/order/features',{credentials:'omit',redirect:'error'",
  "fetch('/api/order/features',{credentials:'same-origin',redirect:'error'");
 if(publicPath==='web/storage.mjs')text=once(text,'export function createBrowserStorage(options={}){',`export function createBrowserStorage(options={}){
 const partition=document.documentElement.dataset.r3QuotePartition;
 if(!/^[a-f0-9]{64}$/.test(partition))throw TypeError('Private quote scope unavailable');
 const mode=options.key==='order_simple_prework_0581'?'simple':'detailed';
 const privateKey='order_ia_r3_quote_v1_'+partition+'_'+mode;
 options={...options,key:privateKey,lockName:privateKey,migrateLegacy:false};`);
 if(publicPath==='web/app.mjs'){
  text=once(text,"if(toSimple)target.searchParams.set('mode','simple');else target.searchParams.delete('mode');","target.searchParams.set('view',toSimple?'simple-r3':'detailed-r3');target.searchParams.delete('mode');");
  text=once(text,"localStorage.getItem('order_quote_mode_notice_v1')","localStorage.getItem('order_ia_r3_notice_'+document.documentElement.dataset.r3QuotePartition)");
  text=once(text,"localStorage.setItem('order_quote_mode_notice_v1','dismissed')","localStorage.setItem('order_ia_r3_notice_'+document.documentElement.dataset.r3QuotePartition,'dismissed')");
 }
 if(publicPath==='web/contact-ui.mjs')text=once(text,'createBrowserIanaProvider({origin:location.origin,allowLocalOrigin:true})',"createBrowserIanaProvider({origin:location.origin,allowLocalOrigin:true,fetcher:(_url,init)=>fetch('/ia/r3-product/assets/iana-reference.json',{...init,credentials:'same-origin'})})");
 files[publicPath]=gzipSync(text,{level:9}).toString('base64');
}
if(!html||!quoteJellyRuntime||!files['web/main.mjs']||!files['assets/iana-reference.json'])throw Error('Incomplete product build');
const output=fileURLToPath(new URL('../src/server/r3-product-sources.mjs',import.meta.url));
const value='// Generated only by scripts/seal-r3-product.mjs from verified production assets.\n'+
 'export const quoteCommit='+JSON.stringify(commit)+';\nexport const quoteTemplate='+JSON.stringify(html)+';\n'+
 'export const quoteJellyRuntime='+JSON.stringify(quoteJellyRuntime)+';\n'+
 'export const quoteSourceHashes='+JSON.stringify(sourceHashes)+';\nexport const quoteFiles='+JSON.stringify(files)+';\n';
await writeFile(output,value);
// The Worker and offline QA generator execute the very same reviewed presentation module.
const sharedBrowserFiles=['quote-result-screen.mjs','magnetic-action.mjs'];
const copyDir=new URL('../src/server/order-engine/browser/',import.meta.url);
await mkdir(copyDir,{recursive:true});
for(const name of sharedBrowserFiles){
 if(!sourceHashes['web/'+name])throw Error('Missing verified product module '+name);
 await writeFile(new URL(name,copyDir),git('show',commit+':web/'+name));
}
const manifestPath=new URL('../src/server/order-engine/SOURCE.json',import.meta.url);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
for(const file of manifest.files.filter(file=>!file.path.startsWith('browser/'))){
  const source=git('show',commit+':src/engine/'+file.path);
  if(hash(source)!==hash(await readFile(new URL('../src/server/order-engine/'+file.path,import.meta.url))))throw Error('Private engine copy differs from product: '+file.path);
  file.sha256=hash(source);
}
manifest.commit=commit;
manifest.files=manifest.files.filter(file=>!file.path.startsWith('browser/'));
for(const name of sharedBrowserFiles)manifest.files.push({path:'browser/'+name,source:'web/'+name,sha256:sourceHashes['web/'+name]});
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({commit,files:Object.keys(files).length,bytes:Buffer.byteLength(value),sha256:hash(value)}));
