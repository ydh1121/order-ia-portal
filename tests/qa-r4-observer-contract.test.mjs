import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createR3ObserverSession} from '../src/server/qa-observer.mjs';
import {resolveArtifactTuple} from '../src/server/qa-registry.mjs';
import {fixedR3Source,createDriveSourceReader} from '../src/server/qa-drive-source.mjs';
import {mountR3HttpResearch} from '../src/server/qa-host.mjs';
import {generateKeyPairSync} from 'node:crypto';
import {R3_DOCUMENT_PROFILES} from '../src/server/qa-r3-document-profile.mjs';

// Synthetic transport contracts only. These tests never execute a UX document,
// assert native readiness, register R4, or grant file access/publication.
const R4=Object.freeze({artifact_id:'ORDER-DESIGN-QA-0569-R4',version:'R4',package_sha256:'b36f967d8ee08a9da46ba1a548961a342ca78b29d572ea4eca7d4c3e0eff9196',entrypoint_sha256:'b063eeb3142ec91ee961eca5fd656388aa5725fbf86b06c39cc088a26703033a',baseline_commit:'b7ca48c432cbd1284d15def276aea708a16dc99d'});
const R3={...R4,artifact_id:'ORDER-DESIGN-QA-0569-R3',version:'R3',package_sha256:'48f0ea4047c5f842d6a03fad2e0a7fb0af792176ef0f0b0cc8003bc2855988e9',entrypoint_sha256:'7e00018be24390ecbeb05b62f38903b7d53a6f9e6a319d3e416f8b97da9610e4'};
const capabilities={preset_control:false,wrapper_preset_observation:true,probe:true,cancel_style:true,dispose:true};
const checks={committed:true,validation:true,inputs:true,view:true,scroll:true,focus:true};
function setup(identity=R4,create=createR3ObserverSession){
 const events=[],timers=new Map(),delays=[],cleared=[],frame={},nonce='r4-contract-nonce-00000001';let id=0;
 const s=create(identity,e=>events.push(e),{nonce,setTimeout:(fn,ms)=>{delays.push(ms);timers.set(++id,{fn,ms});return id},clearTimeout:n=>{cleared.push(n);timers.delete(n)}});
 const init=s.attach(frame);
 const message=(type,payload,request_id)=>({source:frame,origin:'null',data:{...init,type,payload,...(request_id?{request_id}:{})}});
 const send=(type,payload,request)=>s.message(message(type,payload,request));
 const boot=(generation=1)=>send('boot',{stage:'iframe-document-requested',generation,child_observed:false,capabilities});
 const readyPayload=(generation=1)=>({gates:{modules:true,storage:true,pending:false},preset:'original',generation,active_request:null,active_phase:null});
 const ready=()=>{boot();send('stage',{stage:'child-document',generation:1});return send('ready',readyPayload())};
 return {s,events,timers,delays,cleared,frame,init,message,send,boot,readyPayload,ready};
}

test('R4 is exact pinned transport identity, not a generic version/hash permission',()=>{
 for(const [key,value] of Object.entries({artifact_id:'ORDER-COPY-CANDIDATES-0569-R4',version:'R3.1',baseline_commit:'0'.repeat(40),package_sha256:'0'.repeat(64),entrypoint_sha256:'0'.repeat(64)}))assert.throws(()=>setup({...R4,[key]:value}),/UNSUPPORTED_VIEWER_REVISION/);
 for(const value of [null,{}, {...R4,artifact_id:'ORDER-COPY-MOTION-0569-R3',version:'R3'}])assert.throws(()=>setup(value),/UNSUPPORTED_VIEWER_REVISION/);
 const h=setup();assert.equal(h.init.schema,'order.ia.viewer/1');assert.equal(h.init.revision,'ux-r3-observer-1');assert.equal(Object.keys(h.init).length,9);h.s.dispose();
});
test('two R4 import observations retain BOOTING and do not establish ready or renew the deadline',()=>{
 const h=setup();h.boot();const timersBefore=h.delays.length;
 for(const stage of ['child-document','module-import-started','module-import-resolved']){
  assert.equal(h.send('stage',{stage,generation:1}),true);assert.equal(h.s.lastStage,stage);assert.equal(h.s.state,'BOOTING');assert.equal(h.events.at(-1).observation_only,true);assert.equal(h.events.at(-1).accepted,false);
 }
 assert.equal(h.delays.length,timersBefore);assert.equal(h.send('pending',{preset:'ibm',accepted:false},'ux-1'),false);h.s.dispose();
});
test('new observations still require exact source, opaque origin, identity, nonce and generation',()=>{
 const h=setup();h.boot();const valid=h.message('stage',{stage:'module-import-started',generation:1});
 for(const event of [ {...valid,source:{}},{...valid,origin:'https://order-ia-portal.pages.dev'},{...valid,origin:'https://evil.invalid'},...['nonce','revision','artifact_id','version','entrypoint_sha256','package_sha256','baseline_commit'].map(key=>({...valid,data:{...valid.data,[key]:'wrong'}})),{...valid,data:{...valid.data,payload:{stage:'module-import-started',generation:0}}},{...valid,data:{...valid.data,payload:{stage:'module-import-started',generation:1,url:'private'}}},{...valid,data:{...valid.data,request_id:'ux-1'}},{...valid,data:{...valid.data,raw:'private'}}])assert.equal(h.s.message(event),false);
 assert.equal(h.s.lastStage,'iframe-document-requested');h.s.dispose();
});
test('R4 observed import completion cannot replace actual reported child/module/storage/pending gates',()=>{
 const h=setup();h.boot();h.send('stage',{stage:'module-import-resolved',generation:1});assert.equal(h.send('ready',h.readyPayload()),false);
 h.send('stage',{stage:'child-document',generation:1});
 for(const gates of [{modules:false,storage:true,pending:false},{modules:true,storage:false,pending:false},{modules:true,storage:true,pending:true}])assert.equal(h.send('ready',{...h.readyPayload(),gates}),false);
 assert.equal(h.send('ready',h.readyPayload()),true);assert.equal(h.s.state,'READY');assert.equal(h.events.at(-1).accepted,false);h.s.dispose();
});
for(const code of ['PARENT_ORIGIN_UNAVAILABLE','ENVELOPE_PARENT_ORIGIN_INVALID','MODULE_EXECUTION_ERROR'])test(`R4 preserves sanitized first-failure code ${code} as terminal, not readiness`,()=>{
 const h=setup();h.boot();assert.equal(h.send('error',{stage:'boot',code,generation:1,restored:false,accepted:false,terminal:true}),true);
 assert.equal(h.s.state,'BOOT_FAILED');assert.equal(h.events.at(-1).code,code);assert.equal(h.events.at(-1).stage,'boot');assert.equal(h.timers.size,0);
 assert.equal(h.send('stage',{stage:'child-document',generation:1}),false);assert.equal(h.send('ready',h.readyPayload()),false);assert.equal(h.boot(1),false);
 assert.equal(h.boot(2),true);assert.equal(h.send('stage',{stage:'child-document',generation:2}),true);assert.equal(h.send('ready',h.readyPayload(2)),true);h.s.dispose();
});
test('R4 error payload cannot carry raw stack, URL, input or a novel code',()=>{
 const h=setup();h.boot();const payload={stage:'boot',code:'MODULE_EXECUTION_ERROR',generation:1,restored:false,accepted:false,terminal:true};
 for(const extra of [{stack:'private'},{url:'private'},{input:'private'},{code:'RAW_ERROR_MESSAGE'},{generation:0}])assert.equal(h.send('error',{...payload,...extra}),false);
 assert.equal(h.s.state,'BOOTING');h.s.dispose();
});
test('R4 host initial wait allows package 12s failure, separate from legacy 8s style wait',()=>{
 const h=setup();assert.equal(h.delays.at(-1),15000);h.boot();assert.equal(h.delays.at(-1),15000);
 h.send('stage',{stage:'child-document',generation:1});h.send('ready',h.readyPayload());h.send('pending',{preset:'ibm',accepted:false},'ux-1');assert.equal(h.delays.at(-1),8000);h.s.dispose();
});
test('onload, progress and probe do not renew R4 wait or create readiness',()=>{
 const h=setup();h.boot();const id=[...h.timers.keys()][0],count=h.delays.length;
 h.s.onLoad();h.s.probe();h.send('stage',{stage:'module-import-started',generation:1});assert.equal(h.delays.length,count);h.timers.get(id).fn();assert.equal(h.s.state,'TIMEOUT');
 assert.equal(h.send('ready',h.readyPayload()),false);assert.equal(h.boot(2),false);assert.throws(()=>h.s.probe(),/VIEWER_CLOSED/);
});
test('terminal bounded style recovery has exact correlation and is neither rollback nor selected success',()=>{
 const h=setup();assert.equal(h.ready(),true);h.send('pending',{preset:'ibm',accepted:false},'ux-1');h.send('recovering',{preset:'ibm',accepted:false,code:'STYLE_RECOVERY_REQUESTED'},'ux-1');
 const p={stage:'style',code:'STYLE_RECOVERY_TIMEOUT',generation:1,restored:false,accepted:false,terminal:true,preset:'ibm'};
 assert.equal(h.send('error',p,'ux-2'),false);assert.equal(h.send('error',{...p,preset:'vercel'},'ux-1'),false);assert.equal(h.send('error',{...p,recovering:true},'ux-1'),false);
 assert.equal(h.send('error',p,'ux-1'),true);assert.equal(h.s.state,'STYLE_FAILED');assert.equal(h.s.selectedPreset,'original');assert.equal(h.events.at(-1).accepted,false);assert.equal(h.events.at(-1).code,'STYLE_RECOVERY_TIMEOUT');assert.equal(h.timers.size,0);
 assert.equal(h.send('ready',h.readyPayload()),false);assert.equal(h.send('accepted',{preset:'ibm',checks,accepted:true,recovery:true},'ux-1'),false);h.s.dispose();
});
test('R4 module stages cannot select a company during an outstanding applied transaction',()=>{
 const h=setup();h.ready();h.send('pending',{preset:'ibm',accepted:false},'ux-1');h.send('applied',{preset:'ibm',checks,accepted:false},'ux-1');const n=h.delays.length;
 h.send('stage',{stage:'module-import-resolved',generation:1});assert.equal(h.s.state,'APPLIED_PENDING_ACCEPT');assert.equal(h.events.at(-1).accepted,false);assert.equal(h.s.selectedPreset,'original');assert.equal(h.delays.length,n);
 assert.equal(h.send('accepted',{preset:'ibm',checks,accepted:true,recovery:false},'ux-1'),true);assert.equal(h.s.selectedPreset,'ibm');h.s.dispose();
});
test('R4 a real matching apply and six preservation checks remain necessary before accepted',()=>{
 const h=setup();h.ready();h.send('pending',{preset:'linear',accepted:false},'ux-1');
 assert.equal(h.send('accepted',{preset:'linear',checks,accepted:true,recovery:false},'ux-1'),false);
 assert.equal(h.send('applied',{preset:'linear',checks:{...checks,inputs:false},accepted:false},'ux-1'),false);
 assert.equal(h.send('applied',{preset:'linear',checks,accepted:false},'ux-1'),true);
 assert.equal(h.send('accepted',{preset:'linear',checks,accepted:true,recovery:false},'ux-1'),true);assert.equal(h.s.state,'ACCEPTED');h.s.dispose();
});
test('R4 dispose is final and same host cannot be rebound',()=>{
 const h=setup();h.ready();assert.throws(()=>h.s.attach({}),/VIEWER_ALREADY_ATTACHED/);h.s.dispose();assert.equal(h.s.state,'DISPOSED');assert.equal(h.send('stage',{stage:'module-import-started',generation:1}),false);assert.equal(h.boot(2),false);assert.equal(h.s.dispose(),false);
});
test('R3 protocol remains supported with its original 8s deadline and without R4 additions',()=>{
 const h=setup(R3);assert.equal(h.delays[0],8000);h.boot();assert.equal(h.send('stage',{stage:'module-import-started',generation:1}),false);assert.equal(h.send('error',{stage:'boot',code:'MODULE_EXECUTION_ERROR',generation:1,restored:false,accepted:false,terminal:true}),false);
 h.send('stage',{stage:'child-document',generation:1});assert.equal(h.send('ready',h.readyPayload()),true);assert.throws(()=>h.s.request(),/PACKAGE_OWNS_PRESET_CONTROL/);h.s.dispose();
});
test('serialized existing observer remains self-contained for nonce-bound portal runtime',()=>{
 const create=vm.runInNewContext('('+createR3ObserverSession.toString()+')');const h=setup(R4,create);assert.equal(h.boot(),true);assert.equal(h.send('stage',{stage:'module-import-resolved',generation:1}),true);assert.equal(h.s.state,'BOOTING');h.s.dispose();
});
test('R4 protocol preparation does not register or create a runtime document profile',()=>{
 assert.equal(resolveArtifactTuple(R3.artifact_id,'R3').artifact_id,R3.artifact_id);
 assert.equal(fixedR3Source({artifact_id:R3.artifact_id,version:'R3'}).artifact_id,R3.artifact_id);
 for(const artifact_id of ['ORDER-DESIGN-QA-0569-R4','ORDER-COPY-CANDIDATES-0569-R4']){
  assert.throws(()=>resolveArtifactTuple(artifact_id,'R4'),/MISSING_FILE/);
  assert.throws(()=>fixedR3Source({artifact_id,version:'R4'}),/SOURCE_TUPLE_NOT_ALLOWED/);
  assert.equal(R3_DOCUMENT_PROFILES.some(x=>x.artifact_id===artifact_id),false);
 }
});
test('real mounting remains R3 only and existing outer sandbox is not relaxed',()=>{
 const host=readFileSync(new URL('../src/server/qa-host.mjs',import.meta.url),'utf8');
 assert.match(host,/identity\.version!=='R3'/);assert.doesNotMatch(host,/ORDER-DESIGN-QA-0569-R4|ORDER-COPY-CANDIDATES-0569-R4|allow-same-origin/);
 const runtime=readFileSync(new URL('../src/server/qa-r3-runtime.mjs',import.meta.url),'utf8');assert.match(runtime,/sandbox allow-scripts/);assert.doesNotMatch(runtime,/allow-same-origin/);
});

test('even a configured synthetic IA reader refuses unadopted R4 before OAuth or media calls',async()=>{
 const kp=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={IA_QA_DRIVE_READ_ENABLED:'true',IA_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'ia-portal@order-511904.iam.gserviceaccount.com',token_uri:'https://oauth2.googleapis.com/token',private_key:kp.privateKey.export({type:'pkcs8',format:'pem'})})};let calls=0;const read=createDriveSourceReader(env,{fetcher:()=>{calls++;throw Error('NETWORK_MUST_NOT_RUN')}});
 for(const artifact_id of ['ORDER-DESIGN-QA-0569-R4','ORDER-COPY-CANDIDATES-0569-R4'])await assert.rejects(()=>read({artifact_id,version:'R4'}),/SOURCE_TUPLE_NOT_ALLOWED/);
 assert.equal(calls,0);
});
test('actual HTTP host refuses R4 before frame creation even with copied R3 permit fields',()=>{
 let calls=0;const document={createElement(){calls++;throw Error('NO_FRAME')}};
 const window={location:{origin:'https://order-ia-portal.pages.dev'}};
 for(const artifact_id of ['ORDER-DESIGN-QA-0569-R4','ORDER-COPY-CANDIDATES-0569-R4'])assert.throws(()=>mountR3HttpResearch({window,document,container:{},identity:{...R4,artifact_id},permit:{...R4,artifact_id}}),/UNSUPPORTED_VIEWER_REVISION/);
 assert.equal(calls,0);
});
