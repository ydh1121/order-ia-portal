import {createServer} from 'node:http';
import {onRequest as page} from '../functions/ia/[[path]].js';
import {onRequest as features} from '../functions/api/order/features.js';
import {handleIaRequest} from '../src/server/router.mjs';
import {signedWorkspace,issueExampleQuote,origin} from './r3-business-identities.fixture.mjs';

// Ephemeral loopback identity provider for the Chromium fixture. Each browser
// context receives a distinct signed subject; all authorization runs in the normal Page/API.
const fixture=signedWorkspace();
await issueExampleQuote(fixture);
globalThis.fetch=fixture.certs;
const subjects=new Set(['buyer','operator','supplier','buyer2']);
const server=createServer(async(req,res)=>{
  try{
    const localOrigin='http://127.0.0.1:'+server.address().port;
    if(req.headers.host!==new URL(localOrigin).host){res.writeHead(400);return res.end();}
    const subject=req.headers['x-test-subject'];
    if(!subjects.has(subject)){res.writeHead(403);return res.end();}
    const url=new URL(req.url,origin),headers=new Headers(req.headers);
    if(headers.get('origin')===localOrigin)headers.set('origin',origin);
    headers.delete('cookie');headers.set('Cf-Access-Jwt-Assertion',fixture.assertion(subject));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request(url,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
    const context={request,env:fixture.env};let response;
    if(url.pathname==='/ia')response=await page(context);
    else if(url.pathname==='/api/order/features')response=await features(context);
    else if(url.pathname.startsWith('/api/ia/'))response=await handleIaRequest(request,fixture.env,{fetcher:fixture.certs});
    else response=new Response(null,{status:404});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(err){console.error(err);res.writeHead(500);res.end();}
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
