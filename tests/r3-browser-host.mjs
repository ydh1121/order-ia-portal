// Integration fixture only. Bind loopback, issue throwaway credentials and serve application handlers.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {deriveVerifier} from '../src/server/owner-session.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {onRequest as login} from '../functions/login.js';
const dir=resolve(import.meta.dirname,'..'), db=new DatabaseSync(':memory:');
for(const file of readdirSync(resolve(dir,'migrations')).filter(n=>n.endsWith('.sql')).sort()){
  db.exec(readFileSync(resolve(dir,'migrations',file),'utf8'));
}
const store={
  prepare(sql){return {bind(...args){const st=db.prepare(sql);return {
    first:async()=>st.get(...args),run:()=>({meta:st.run(...args)}),all:async()=>({results:st.all(...args)})};}};},
  async batch(statements){
    db.exec('BEGIN');
    try{const rows=statements.map(statement=>statement.run());db.exec('COMMIT');return rows;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
};
const sha='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
// Isolated synthetic empty set; live source import has its own raw-byte verification.
db.prepare('INSERT INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version,complete) VALUES (?,0,0,0,1,1)').run(sha);
const pass=randomBytes(32).toString('base64url'),email='test-owner@example.invalid';
const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html'};
const assets=async(req)=>{
  const file=new URL(req.url).pathname;
  if(!['/login.html','/login.js','/login.css'].includes(file))return new Response(null,{status:404});
  return new Response(readFileSync(resolve(dir,'public',file.slice(1))),{headers:{'Content-Type':mime[file.slice(file.lastIndexOf('.'))]}});
};
const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:email,IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(pass),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:store,ASSETS:{fetch:assets}};
const production='https://order-ia-portal.pages.dev';
const server=createServer(async (req,res)=>{
  try{
    const allowedHost='127.0.0.1:'+server.address().port;
    if(req.headers.host!==allowedHost){res.writeHead(400);res.end();return;}
    const u=new URL(req.url,'http://'+allowedHost);
    const headers=new Headers(req.headers);
    if(headers.get('origin')===u.origin)headers.set('origin',production);
    const chunks=[];for await(const c of req)chunks.push(c);
    const request=new Request(production+u.pathname+u.search,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
    const out=u.pathname.startsWith('/api/ia/')?await handleIaRequest(request,env):
      u.pathname==='/login'?await login({request,env}):u.pathname.startsWith('/ia')?await iaPage({request,env}):await assets(request);
    for(const [k,v] of out.headers){if(k!=='set-cookie')res.setHeader(k,v);}
    if(out.headers.getSetCookie().length)res.setHeader('set-cookie',out.headers.getSetCookie());
    res.writeHead(out.status);res.end(Buffer.from(await out.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
// Only the parent browser test reads this pipe. Never print it in the test log.
process.stdout.write(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,email,pass})+'\n');
