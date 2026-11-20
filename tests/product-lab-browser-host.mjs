// Local/CI host for actual Pages routes, auth, product handlers and two separate
// SQLite databases. No mocked fetch, outcome timer, or business response fixture.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {handleIaRequest} from '../src/server/router.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
import {onRequest as features} from '../functions/api/order/features.js';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';

function binding(sqlite){
 const prepare=(query,args=[])=>({query,args,bind:(...p)=>prepare(query,p),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>{const q=sqlite.prepare(s.query);return q.columns().length?{results:q.all(...s.args),meta:{changes:0}}:{results:[],meta:{changes:Number(q.run(...s.args).changes)}};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:');
for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())review.exec(fs.readFileSync('migrations/'+name,'utf8'));
lab.exec(fs.readFileSync('migrations/lab/0001_lab_registry.sql','utf8'));
const storage=new Map(),bucket={async put(key,value){const b=new Uint8Array(await new Response(value).arrayBuffer());storage.set(key,b);},async get(key){const value=storage.get(key);return value?{size:value.length,body:value,arrayBuffer:async()=>value.slice().buffer}:null;},async delete(key){storage.delete(key);}};
const env={ORDER_QA_DB:binding(review),ORDER_LAB_DB:binding(lab),ORDER_LAB_EVIDENCE:bucket,IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'browser-owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(32).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'ci-working-tree'};
const session=await issueSession(env);
const server=createServer(async(req,res)=>{
 try{
  const origin='http://127.0.0.1:'+server.address().port;if(req.headers.host!==new URL(origin).host){res.writeHead(400);return res.end();}
  const url=new URL(req.url,origin);
  if(url.pathname==='/__lab-test-session'){res.writeHead(303,{'Set-Cookie':session.cookie,'Location':'/ia?view=qa-lab'});return res.end();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  let result;
  if(url.pathname.startsWith('/api/ia/'))result=await handleIaRequest(request,env);
  else if(url.pathname==='/api/order/features')result=await features({request,env});
  else if(url.pathname==='/ia'||url.pathname.startsWith('/ia/'))result=await onRequest({request,env});
  else if(url.pathname.startsWith('/vendor/')&&!url.pathname.includes('..')){const path='public'+url.pathname;if(fs.existsSync(path)&&fs.statSync(path).isFile())result=new Response(fs.readFileSync(path),{headers:{'Content-Type':path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream'}});}
  result??=new Response('Not found',{status:404});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Host failure');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');console.log('http://127.0.0.1:'+server.address().port);
