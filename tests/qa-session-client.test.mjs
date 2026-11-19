import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installQaSession} from '../src/server/qa-session-client.mjs';
const initial=1900000000000,csrf='synthetic-session-csrf-for-tests';
function harness(){
 const document=new EventTarget(),window=new EventTarget(),requests=[],events=[];
 document.visibilityState='visible';let now=initial,elapsed=0,tick,cleared=false;
 let respond=async()=>Response.json({authenticated:true,csrf,expiresAt:now/1000+1800,absoluteExpiresAt:initial/1000+43200});
 for(const name of ['ia-session-expired','ia-session-restored'])document.addEventListener(name,e=>events.push({type:e.type,detail:e.detail}));
 vm.runInNewContext('('+installQaSession.toString()+')()',{document,window,CustomEvent,Date:{now:()=>now},performance:{now:()=>elapsed},setInterval:f=>(tick=f,1),clearInterval:()=>{cleared=true;},fetch:async(...args)=>{requests.push(args);return respond(...args);}});
 return {document,window,requests,events,setTime(t){now=initial+t;elapsed=t;},setWallTime(t){now=initial+t;},setResponse(f){respond=f;},async tick(){tick();await new Promise(resolve=>setImmediate(resolve));},ready(expiresInSeconds=1800){document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:{csrf,expiresAt:initial/1000+expiresInSeconds}}));},activity(){document.dispatchEvent(new Event('ia-session-activity'));},get cleared(){return cleared;}};
}
test('review activity renews a valid session without navigation; hidden or idle tabs do not keep it alive',async()=>{
 const h=harness();h.ready();await h.tick();assert.equal(h.requests.length,0);
 h.setTime(6*60000);await h.tick();assert.equal(h.requests.length,0);
 h.activity();await h.tick();assert.equal(h.requests.length,1);
 assert.equal(h.requests[0][0],'/api/ia/auth/refresh');assert.equal(h.requests[0][1].method,'POST');assert.equal(h.requests[0][1].headers['X-IA-CSRF'],csrf);
 assert.equal(h.events.length,0);
 h.setTime(10*60000);h.activity();h.document.visibilityState='hidden';await h.tick();assert.equal(h.requests.length,1);
 h.document.visibilityState='visible';h.setTime(16*60000);await h.tick();assert.equal(h.requests.length,1);
});
test('entering QA with a nearly expired cookie renews before the normal initial cooldown',async()=>{
 const h=harness();h.ready(120);await h.tick();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0][0],'/api/ia/auth/refresh');
 for(let elapsed=30000;elapsed<=120000;elapsed+=30000){h.setTime(elapsed);h.activity();await h.tick();}
 assert.equal(h.requests.length,1,'activity does not bypass the cooldown after a real renewal');
 assert.equal(h.events.length,0,'continuous review survives the original cookie expiry');
});
test('early bootstrap renewal remains hidden-tab safe and bounded when offline',async()=>{
 const h=harness();h.document.visibilityState='hidden';h.ready(120);await h.tick();assert.equal(h.requests.length,0);
 h.document.visibilityState='visible';h.setResponse(async()=>{throw Error('NETWORK_OFFLINE');});
 h.activity();await h.tick();assert.equal(h.requests.length,1);
 for(let elapsed=1000;elapsed<120000;elapsed+=1000){h.setTime(elapsed);h.activity();await h.tick();}
 assert.equal(h.requests.length,1);assert.equal(h.events.length,0);
 h.setTime(120000);await h.tick();assert.equal(h.events.length,0,'local expiry while offline cannot establish server expiry');
 h.setTime(240000);h.activity();await h.tick();assert.equal(h.requests.length,2);assert.equal(h.events.length,0);
});
test('offline renewal does not become logout; server-confirmed expiration emits one recoverable event',async()=>{
 const h=harness();h.ready();h.setResponse(async()=>{throw Error('NETWORK_OFFLINE');});
 h.setTime(4*60000);h.activity();await h.tick();assert.equal(h.events.length,0);
 h.setTime(31*60000);await h.tick();await h.tick();assert.equal(h.events.length,0);assert.equal(h.requests.length,1,'idle tabs do not renew or infer authentication state');
 h.setResponse(async()=>Response.json({error:'SESSION_EXPIRED'},{status:401}));
 h.activity();await h.tick();await h.tick();assert.equal(h.events.length,1);assert.equal(h.events[0].type,'ia-session-expired');assert.equal(h.events[0].detail.reason,'SESSION_EXPIRED');
 h.setResponse(async()=>Response.json({authenticated:true,csrf:'new-synthetic-session-csrf',expiresAt:initial/1000+3600}));
 h.window.dispatchEvent(new Event('focus'));await h.tick();
 assert.equal(h.events[1].type,'ia-session-restored');assert.equal(h.events[1].detail.csrf,'new-synthetic-session-csrf');
});
test('forward and backward device-clock changes neither expire valid cookies nor bypass the renewal cooldown',async()=>{
 const h=harness();
 h.setResponse(async()=>Response.json({authenticated:true,csrf,expiresAt:initial/1000+1800}));
 h.ready();h.setTime(30000);h.setWallTime(40*24*60*60000);h.activity();await h.tick();
 assert.equal(h.requests.length,0);assert.equal(h.events.length,0);
 h.setTime(4*60000);h.setWallTime(40*24*60*60000);h.activity();await h.tick();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0][0],'/api/ia/auth/refresh');assert.equal(h.events.length,0);
 for(let i=0;i<20;i++){h.setWallTime((i+40)*24*60*60000);h.activity();await h.tick();}
 assert.equal(h.requests.length,1,'wall-clock jumps cannot bypass the monotonic cooldown');
 h.setTime(8*60000);h.setWallTime(-40*24*60*60000);h.activity();await h.tick();
 assert.equal(h.requests.length,2,'moving the device clock backward cannot stall active renewal');assert.equal(h.events.length,0);
});
test('bootstrap with an ahead device clock asks the server and bounds offline retries',async()=>{
 const h=harness();h.setWallTime(40*24*60*60000);h.setResponse(async()=>{throw Error('NETWORK_OFFLINE');});
 h.ready();await h.tick();assert.equal(h.requests.length,1);assert.equal(h.events.length,0);
 for(let elapsed=1000;elapsed<240000;elapsed+=1000){h.setTime(elapsed);h.setWallTime(40*24*60*60000);h.activity();await h.tick();}
 assert.equal(h.requests.length,1);assert.equal(h.events.length,0);
 h.setTime(240000);h.setWallTime(40*24*60*60000);h.activity();await h.tick();assert.equal(h.requests.length,2);assert.equal(h.events.length,0);
});
test('real authentication denial still expires the session regardless of the device clock',async()=>{
 for(const status of [401,403]){
  const h=harness();h.ready();h.setResponse(async()=>Response.json({error:'AUTHENTICATION_REQUIRED'},{status}));
  h.setTime(4*60000);h.setWallTime(-40*24*60*60000);h.activity();await h.tick();await h.tick();
  assert.equal(h.requests.length,1);assert.equal(h.events.length,1);assert.equal(h.events[0].type,'ia-session-expired');
 }
});
test('an authentication redirect emits a reauthentication event rather than following a login page',async()=>{
 const h=harness();h.ready();h.setResponse(async()=>({type:'opaqueredirect',redirected:false}));
 h.setTime(4*60000);h.activity();await h.tick();
 assert.equal(h.requests[0][1].redirect,'manual');assert.equal(h.events[0].type,'ia-session-expired');
});
test('a new login in another tab repairs stale CSRF by reading the current identity',async()=>{
 const h=harness();h.ready();h.setResponse(async url=>url.endsWith('/refresh')?Response.json({error:'CSRF_DENIED'},{status:403}):Response.json({authenticated:true,csrf:'other-tab-new-session-csrf',expiresAt:initial/1000+3600}));
 h.setTime(4*60000);h.activity();await h.tick();
 assert.deepEqual(h.requests.map(r=>r[0]),['/api/ia/auth/refresh','/api/ia/auth/me']);
 assert.equal(h.events[0].type,'ia-session-restored');assert.equal(h.events[0].detail.csrf,'other-tab-new-session-csrf');
});
test('returning from back-forward cache keeps the activity timer available',()=>{
 const h=harness(),persisted=new Event('pagehide');Object.defineProperty(persisted,'persisted',{value:true});h.window.dispatchEvent(persisted);assert.equal(h.cleared,false);
 h.window.dispatchEvent(new Event('pagehide'));assert.equal(h.cleared,true);
});
