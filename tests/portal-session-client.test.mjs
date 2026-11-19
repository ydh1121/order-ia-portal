import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountPortalSession} from '../src/server/portal-session-client.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

test('portal shows a server-based 12-hour countdown before logout and ignores wall-clock jumps',async()=>{
  const dom=new JSDOM('<div id="account">열람 전용<button>로그아웃</button></div>',{url:'https://order-ia-portal.pages.dev/ia/',runScripts:'outside-only'}),w=dom.window;
  let elapsed=0,tick,checks=0;const requests=[];
  Object.defineProperty(w.performance,'now',{value:()=>elapsed});
  w.setInterval=fn=>(tick=fn,1);w.clearInterval=()=>{};
  w.fetch=async(url,options)=>{requests.push({url,options});return Response.json({authenticated:true,csrf:'test-csrf-1234567890123456',expiresAt:2000043200,absoluteExpiresAt:2000043200,serverNow:2000000000});};
  w.document.addEventListener('ia-session-check',()=>checks++);
  try{
    await w.eval('('+browserFunction(mountPortalSession)+')')(w.document.getElementById('account'),()=>{});
    const banner=w.document.getElementById('account'),counter=banner.querySelector('[data-session-countdown]');
    assert.equal(counter.textContent,'로그인 만료까지 12:00:00');
    assert.equal(counter.nextElementSibling.textContent,'로그아웃');assert.doesNotMatch(banner.textContent,/열람 전용/);
    w.Date.now=()=>9000000000000;elapsed=61000;tick();assert.equal(counter.textContent,'로그인 만료까지 11:58:59');
    elapsed=43200001;tick();tick();assert.equal(counter.textContent,'로그인 만료까지 00:00:00');assert.equal(checks,1,'deadline confirmation is bounded');
    w.document.dispatchEvent(new w.CustomEvent('ia-session-expired'));
    assert.equal(banner.querySelector('button').textContent,'다시 로그인');
    assert.equal(requests.length,1);
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
});

test('portal keeps source-load failure visible and logout uses the current authenticated CSRF',async()=>{
  const dom=new JSDOM('<div id="account" data-source-error="자료를 불러오지 못했습니다."></div>',{url:'https://order-ia-portal.pages.dev/ia/',runScripts:'outside-only'}),w=dom.window,requests=[];
  w.setInterval=()=>1;w.clearInterval=()=>{};
  w.fetch=async(url,options)=>{requests.push({url,options});return url.endsWith('/me')?Response.json({authenticated:true,csrf:'first',expiresAt:50000,serverNow:6800}):Response.json({error:'CSRF_DENIED'},{status:403});};
  try{
    const banner=w.document.getElementById('account');
    await w.eval('('+browserFunction(mountPortalSession)+')')(banner,()=>{});
    assert.match(banner.textContent,/자료를 불러오지 못했습니다/);
    w.document.dispatchEvent(new w.CustomEvent('ia-session-updated',{detail:{csrf:'current',expiresAt:70000,serverNow:26800}}));
    banner.querySelector('button').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(requests[1].options.headers['X-IA-CSRF'],'current');
    assert.match(banner.textContent,/로그아웃하지 못했습니다/);assert.equal(banner.querySelector('button').disabled,false);
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
});
