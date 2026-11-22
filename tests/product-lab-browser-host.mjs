// Local/CI host for actual Pages routes, auth, product handlers and two separate
// SQLite databases. No mocked fetch, outcome timer, or business response fixture.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import {handleIaRequest} from '../src/server/router.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
import {onRequest as features} from '../functions/api/order/features.js';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';

const canonicalOrigin='https://order-ia-portal.pages.dev';
export async function createLabTestSessionResponse(env,session){
 // The default QA URL remains the R1 review shell. Integration tests enter
 // their own real run explicitly, using the same owner and CSRF gates as UI.
 const seeded=await handleIaRequest(new Request(canonicalOrigin+'/api/ia/lab/runs',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:canonicalOrigin,Cookie:session.cookie.split(';')[0],'X-IA-CSRF':session.csrf},
  body:JSON.stringify({label:'Chrome integration setup',requestKey:randomUUID()})
 }),env);
 const result=await seeded.json();
 if(!seeded.ok||!/^[a-f0-9]{32}$/.test(result.run?.id||''))throw new Error('Lab test session setup failed: '+seeded.status+' '+(result.error||'INVALID_RUN'));
 return new Response(null,{status:303,headers:{'Set-Cookie':session.cookie,Location:'/ia?view=qa-lab&run='+encodeURIComponent(result.run.id)}});
}

function binding(sqlite){
 const prepare=(query,args=[])=>({query,args,bind:(...p)=>prepare(query,p),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>{const q=sqlite.prepare(s.query);return q.columns().length?{results:q.all(...s.args),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.args).changes)}};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function start(){
const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:');
for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())review.exec(fs.readFileSync('migrations/'+name,'utf8'));
lab.exec(fs.readFileSync('migrations/lab/0001_lab_registry.sql','utf8'));
const storage=new Map(),bucket={async put(key,value){const b=new Uint8Array(await new Response(value).arrayBuffer());storage.set(key,b);},async get(key){const value=storage.get(key);return value?{size:value.length,body:value,arrayBuffer:async()=>value.slice().buffer}:null;},async delete(key){storage.delete(key);}};
const env={ORDER_QA_DB:binding(review),ORDER_LAB_DB:binding(lab),ORDER_LAB_EVIDENCE:bucket,ASSETS:createPrivateResearchAssets(),IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'browser-owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(32).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'ci-working-tree'};
const session=await issueSession(env);
const server=createServer(async(req,res)=>{
 try{
  const origin='http://127.0.0.1:'+server.address().port;if(req.headers.host!==new URL(origin).host){res.writeHead(400);return res.end();}
  const url=new URL(req.url,origin);
  if(url.pathname==='/__lab-test-session'){const result=await createLabTestSessionResponse(env,session);res.writeHead(result.status,Object.fromEntries(result.headers));return res.end();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  // Normalize only this bound loopback transport to the canonical deployment
  // origin. The real same-origin/CSRF gates remain enabled and reject any other
  // incoming Origin; no HTTP request is sent to the production deployment.
  const headers=new Headers(req.headers);
  if(headers.get('Origin')===origin)headers.set('Origin',canonicalOrigin);
  const request=new Request(canonicalOrigin+url.pathname+url.search,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  let result;
  if(url.pathname.startsWith('/api/ia/'))result=await handleIaRequest(request,env);
  else if(url.pathname==='/api/order/features')result=await features({request,env});
  else if(url.pathname==='/ia'||url.pathname.startsWith('/ia/'))result=await onRequest({request,env});
  else if(url.pathname.startsWith('/vendor/')&&!url.pathname.includes('..')){const path='public'+url.pathname;if(fs.existsSync(path)&&fs.statSync(path).isFile())result=new Response(fs.readFileSync(path),{headers:{'Content-Type':path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream'}});}
  result??=new Response('Not found',{status:404});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Host failure');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');console.log('http://127.0.0.1:'+server.address().port);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await start();
