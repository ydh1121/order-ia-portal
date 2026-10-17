import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto,randomBytes} from 'node:crypto';
import {onRequest as rootRoute} from '../functions/index.js';
import {onRequest as cleanLogin} from '../functions/login.js';
import {issueSession,deriveVerifier} from '../src/server/owner-session.mjs';
const root='https://order-ia-portal.pages.dev';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
let env;
before(async()=>{
 env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(28).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url')};
});
const route=(path,opts={})=>rootRoute({request:new Request(root+path,{method:opts.method||'GET',headers:opts.cookie?{Cookie:opts.cookie}:{}}),env:opts.env||env});
test('signed-out root redirects to clean /login with no private body',async()=>{
 const r=await route('/');assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/login');assert.equal(await r.text(),'');assert.match(r.headers.get('Cache-Control'),/no-store/);
});
test('signed-out root ignores query and does not loop',async()=>{const r=await route('/?utm_source=chatgpt.com');assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/login');});
test('signed-in OWNER goes to /ia/ without leaking cookie or Sheets',async()=>{
 const session=await issueSession(env);const r=await route('/',{cookie:session.cookie.split(';')[0]});assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/ia/');assert.equal(await r.text(),'');
});
test('tampered/expired session cannot reach dashboard from root',async()=>{
 const s=await issueSession(env);const bad=s.cookie.split(';')[0].replace(/.$/,'x');assert.equal((await route('/',{cookie:bad})).headers.get('Location'),'/login');
});
test('unconfigured owner credentials fail closed to login',async()=>assert.equal((await route('/',{env:{}})).headers.get('Location'),'/login'));
test('root HEAD supported and POST rejected',async()=>{
 assert.equal((await route('/',{method:'HEAD'})).status,302);const r=await route('/',{method:'POST'});assert.equal(r.status,405);
});
test('clean /login handler serves exactly existing login.html and query alias',async()=>{
 const html=readFileSync(new URL('../public/login.html',import.meta.url),'utf8');const mock={...env,ASSETS:{fetch:async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}})}};
 for(const path of ['/login','/login?utm_source=chatgpt.com']){
  const r=await cleanLogin({request:new Request(root+path),env:mock});assert.equal(r.status,200);assert.match(await r.text(),/login\.css/);assert.match(r.headers.get('Content-Type'),/text\/html/);assert.match(r.headers.get('Cache-Control'),/no-store/);
 }
});
test('clean login asset failure fails closed',async()=>{
 const r=await cleanLogin({request:new Request(root+'/login'),env});assert.equal(r.status,503);assert.equal(await r.text(),'');
});
test('login form uses isolated responsive CSS and no dashboard CSS',()=>{
 const html=readFileSync(new URL('../public/login.html',import.meta.url),'utf8');const css=readFileSync(new URL('../public/login.css',import.meta.url),'utf8');
 assert.match(html,/href="\/login\.css"/);assert.doesNotMatch(html,/href="\/owner\.css"/);assert.match(css,/\.login-card/);assert.match(css,/@media\(max-width:520px\)/);assert.match(css,/#owner-login/);assert.doesNotMatch(css,/\.registry-grid/);
});
test('fallback root does not contain stale holding page or private data',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/url=\/login/);assert.doesNotMatch(html,/서비스 준비 중입니다|PENDING-01|F17|docs\.google\.com|사업자등록증/);
});
