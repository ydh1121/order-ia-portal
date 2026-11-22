import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createResearchExportTools} from '../src/server/research-app/export-snapshot.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url)),{JSDOM}=require('jsdom');
const origin='https://order-ia-portal.pages.dev',build='a'.repeat(64),artifact='b'.repeat(64),channel='00000000-0000-4000-8000-000000000001';
const digest=value=>createHash('sha256').update(value).digest('hex');
const markup=`<!doctype html><html lang="ko"><head><style>
body{margin:0;font-family:system-ui}#order-single{color:rgb(12,24,48)}
.quote-input{padding:12px;background-image:url("https://unavailable.invalid/image.png")}
@media (max-width:500px){.quote-input{font-size:18px}}
@media (min-width:800px){.quote-input{font-size:8px}}
.logo{background-image:url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")}
</style><style data-research-inspector>#r3-pins{color:purple}</style></head><body>
<main id="order-single"><header>Order</header><form id="quote" action="/api/regular/save" onsubmit="fetch('/secret')">
<input id="phone" class="quote-input" value="old-phone"><input id="amount" type="number" value="1">
<input id="checked" type="checkbox"><input id="unchecked" type="checkbox" checked>
<textarea id="memo">old memo</textarea><select id="unit"><option>개</option><option>판</option></select>
<input id="password" type="password" value="SECRET_DEFAULT_PASSWORD"><input id="csrf" type="hidden" value="SECRET_CSRF">
<input id="visible-password" type="text" autocomplete="new-password" value="SECRET_VISIBLE_PASSWORD">
<input id="authToken" value="SECRET_AUTH_TOKEN"><textarea name="access_token">SECRET_TEXTAREA_TOKEN</textarea>
<input id="upload" type="file" value="SECRET_CHOSEN_FILE"><button formaction="/submit">견적 저장</button>
</form><details id="details"><summary>내용</summary>요약</details>
<img alt="logo" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"><a href="https://unavailable.invalid">외부 연결</a>
<div data-session-token="SECRET_DATA_TOKEN" onclick="fetch('/live')">화면</div>
<script>fetch('/live-script')</script><template><script>SECRET_NESTED_SCRIPT</script></template>
<iframe src="https://unavailable.invalid"></iframe><div id="r3-pins">QA PIN</div>
</main><aside id="outside">PRIVATE_OUTSIDE_APP</aside></body></html>`;

function client(t,{factory=createResearchExportTools,url=origin+'/ia?view=research-r3&build='+build}={}){
  const dom=new JSDOM(markup,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  t.after(()=>w.close());Object.defineProperty(w,'crypto',{configurable:true,value:webcrypto});w.TextEncoder=TextEncoder;
  Object.defineProperty(w,'innerWidth',{value:390});Object.defineProperty(w,'innerHeight',{value:844});
  w.matchMedia=query=>({matches:!query.includes('min-width'),addEventListener(){},removeEventListener(){}});
  let network=0;w.fetch=()=>{network++;throw Error('No network during export');};
  const route={screen:'q2',state:'filled',variant:'email',mode:'detailed'},session={channel,artifact,viewport:390,version:'current',...route};
  let active=true,pendingRoute=null,instance='one-application';
  const root=d.getElementById('order-single');d.documentElement.dataset.productBuild=build;
  root.__orderResearchInspector={inspect:()=>({active,pendingRoute,session:{...session}})};
  w.ORDER_RESEARCH_APP={snapshot:()=>({build,instance,route:{...route}})};
  const frame={isConnected:true,inert:false,contentWindow:w,contentDocument:d};
  const expected={build,artifact,channel,width:390,version:'current',screen:route.screen,state:route.state,variant:route.variant,mode:'detailed'};
  const acknowledged={...expected,hash:artifact,application:build};
  const args={frame,expected,acknowledged,origin,application:{build,url:'/ia?view=research-r3&screen=q2&state=filled&variant=email&mode=detailed'}};
  const tools=w.eval('('+browserFunction(factory)+')')();
  d.getElementById('phone').value='01012345678';d.getElementById('amount').value='10';
  d.getElementById('checked').checked=true;d.getElementById('unchecked').checked=false;
  d.getElementById('memo').value='현재 입력한 메모';d.getElementById('unit').selectedIndex=1;d.getElementById('details').open=true;
  d.getElementById('password').value='SECRET_CURRENT_PASSWORD';
  return {dom,w,d,root,args,tools,route,session,network:()=>network,setActive:value=>active=value,setPending:value=>pendingRoute=value,setInstance:value=>instance=value};
}

test('static export captures the confirmed app DOM, loaded CSS and current controls without active content or secrets',async t=>{
  const h=client(t),result=await h.tools.snapshot(h.args),saved=new JSDOM(result.html),d=saved.window.document;t.after(()=>saved.window.close());
  assert.equal(result.sha256,digest(result.html));assert.equal(d.querySelectorAll('#order-single').length,1);
  assert.equal(d.getElementById('phone').value,'01012345678');assert.equal(d.getElementById('amount').value,'10');
  assert.equal(d.getElementById('checked').checked,true);assert.equal(d.getElementById('unchecked').checked,false);
  assert.equal(d.getElementById('memo').value,'현재 입력한 메모');assert.equal(d.getElementById('unit').value,'판');assert.equal(d.getElementById('details').open,true);
  assert.equal(d.querySelectorAll('form,script,iframe,link,input[type=hidden],#outside,#r3-pins').length,0);
  assert.equal(d.querySelector('[onclick],[onsubmit],[action],[formaction],[data-session-token]'),null);
  assert.equal(d.getElementById('password').value,'');assert.equal(d.getElementById('visible-password').value,'');assert.equal(d.getElementById('authToken').value,'');
  assert.equal(d.getElementById('upload').getAttribute('value'),null);assert.equal(d.getElementById('upload').disabled,true);
  assert.doesNotMatch(result.html,/SECRET_|PRIVATE_OUTSIDE_APP|QA PIN|unavailable\.invalid|\/api\/regular\/save/);
  assert.match(d.querySelector('style').textContent,/@media all\s*\{/);assert.match(d.querySelector('style').textContent,/@media not all\s*\{/);
  assert.match(d.querySelector('style').textContent,/data:image\/svg\+xml/);assert.doesNotMatch(d.querySelector('style').textContent,/#r3-pins/);
  assert.match(d.querySelector('[http-equiv="Content-Security-Policy"]').content,/connect-src 'none'/);
  const metadata=JSON.parse(d.getElementById('order-export-metadata').content.textContent);
  assert.equal(metadata.build,build);assert.equal(metadata.artifactHash,artifact);assert.equal(metadata.route.mode,'detailed');assert.equal(metadata.viewport.width,390);assert.equal(metadata.stylesheets,1);
  assert.equal(d.querySelector('#order-single').hasAttribute('inert'),true);assert.equal(h.network(),0);
  assert.equal(h.d.getElementById('quote').tagName,'FORM','live product DOM remains untouched');
  assert.equal(h.d.getElementById('password').value,'SECRET_CURRENT_PASSWORD');
});

test('export rejects missing acknowledgement, origin, route, inspector and build identity before reading input',async t=>{
  for(const mutate of [h=>h.args.acknowledged.hash='c'.repeat(64),h=>{delete h.args.acknowledged.mode;},h=>{delete h.session.mode;},h=>h.route.mode='simple',h=>h.args.expected.mode='unknown',h=>h.args.origin='https://different.invalid',h=>h.route.screen='q3',h=>h.session.channel='different-channel',h=>h.d.documentElement.dataset.productBuild='c'.repeat(64),h=>h.setActive(false),h=>h.setPending({screen:'q3'}),h=>h.args.frame.inert=true]){
    const h=client(t);let reads=0;Object.defineProperty(h.d.getElementById('phone'),'value',{get(){reads++;return 'PRIVATE';}});mutate(h);
    await assert.rejects(h.tools.snapshot(h.args),/RESEARCH_EXPORT_/);assert.equal(reads,0);assert.equal(h.network(),0);
  }
});

test('export refuses a route or application replacement while the downloaded bytes are hashed',async t=>{
  for(const change of [h=>{h.route.screen='q3';},h=>{h.route.mode='simple';},h=>h.setInstance('replacement')]){
    const h=client(t);Object.defineProperty(h.w,'crypto',{value:{subtle:{async digest(...args){const result=await webcrypto.subtle.digest(...args);change(h);return result;}}}});
    await assert.rejects(h.tools.snapshot(h.args),/RESEARCH_EXPORT_(?:ROUTE_CHANGED|APPLICATION_CHANGED)/);
  }
});

test('unreadable same-origin CSS and unloaded images fail instead of producing a blank partial artifact',async t=>{
  const css=client(t);Object.defineProperty(css.d,'styleSheets',{value:[{href:origin+'/private.css',get cssRules(){throw Error('Unavailable');}}]});
  await assert.rejects(css.tools.snapshot(css.args),/CSS_UNAVAILABLE/);
  const image=client(t);image.d.querySelector('img').src='/not-loaded.png';await assert.rejects(image.tools.snapshot(image.args),/IMAGE_UNAVAILABLE/);
});

test('execution download is an explicit immutable research build link, without application inputs or bootstrap',async t=>{
  const h=client(t),result=await h.tools.link(h.args),saved=new JSDOM(result.html),d=saved.window.document;t.after(()=>saved.window.close());
  const url=new URL(d.querySelector('a').href);assert.equal(url.origin,origin);assert.equal(url.pathname,'/ia');
  assert.equal(url.searchParams.get('view'),'research-r3');assert.equal(url.searchParams.get('build'),build);assert.equal(url.searchParams.get('mode'),'detailed');
  assert.equal(url.searchParams.has('inspect'),false);assert.equal(url.searchParams.has('channel'),false);
  assert.equal(d.querySelector('h1').textContent,'연구본 실행 링크');assert.match(d.body.textContent,/인터넷 연결과 접근 권한/);
  assert.equal(d.querySelector('script,input,#order-single'),null);assert.doesNotMatch(result.html,/SECRET_|01012345678|현재 입력한 메모|offline|frameBootstrap/);
  assert.equal(result.sha256,digest(result.html));assert.equal(h.network(),0);
  await assert.rejects(h.tools.link({...h.args,application:{build,url:'https://foreign.invalid/ia?view=research-r3'}}),/APPLICATION_URL/);
  await assert.rejects(h.tools.link({...h.args,application:{build,url:'/ia?view=research-r3&build='+artifact}}),/APPLICATION_URL/);
  await assert.rejects(h.tools.link({...h.args,application:{build,url:'/ia?view=research-r3&mode=simple'}}),/APPLICATION_URL/);
});

test('export factory survives Worker keepNames serialization without a module-local closure',async t=>{
  const {build:bundle}=require('esbuild'),output=await bundle({entryPoints:[fileURLToPath(new URL('../src/server/research-app/export-snapshot.mjs',import.meta.url))],bundle:true,platform:'browser',format:'esm',target:'es2022',keepNames:true,write:false,logLevel:'silent'});
  const worker=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  const h=client(t,{factory:worker.createResearchExportTools}),result=await h.tools.snapshot(h.args);assert.equal(result.sha256,digest(result.html));
});

async function host(t,{research=true,mode='simple'}={}){
  const row={id:'q2/filled/email',screen:'q2',state:'filled',variant:'email',label:'Q2',stateLabel:'입력',group:'견적',role:'customer',phase:'current',application:research,defaultWidth:390,hashes:{390:artifact},...(mode==='detailed'?{mode}:{})};
  const dom=new JSDOM(approvedShellBody(),{url:origin+'/ia?view=qa-lab&screen='+row.id+'&width=390'+(mode==='detailed'?'&mode=detailed':''),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  t.after(()=>w.close());Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.Blob=Blob;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  const downloads=[],writes=[];w.URL.createObjectURL=value=>{downloads.push(value);return 'blob:export';};w.URL.revokeObjectURL=()=>{};
  const frame=w.document.getElementById('frame'),child=client(t),legacy='<!doctype html><html><body>LEGACY_SOURCE<!--R3-FRAME--></body></html>';
  child.route.mode=mode;if(mode==='detailed')child.session.mode=mode;else delete child.session.mode;
  let context,src='',srcdoc='';Object.defineProperty(frame,'contentWindow',{get:()=>child.w});Object.defineProperty(frame,'contentDocument',{get:()=>child.d});
  child.w.postMessage=()=>{};
  const ready=(currentChannel,hash)=>queueMicrotask(()=>w.dispatchEvent(new w.MessageEvent('message',{source:child.w,origin:research?origin:'null',data:{scope:'ORDER_R3_FRAME',channel:currentChannel,artifact:hash,type:'ready',payload:{...(mode==='detailed'?{mode}:{})}}})));
  Object.defineProperty(frame,'src',{get:()=>src,set:value=>{src=value;const query=new URL(value).searchParams;child.session.channel=query.get('channel');ready(child.session.channel,artifact);}});
  Object.defineProperty(frame,'srcdoc',{get:()=>srcdoc,set:value=>{srcdoc=value;const match=value.match(/"channel":"([^"]+)"/);ready(match?.[1],artifact);}});
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);
    if(options.method==='POST'){const packet=JSON.parse(options.body);writes.push(packet);return Response.json({...packet,revision:1,cursor:writes.length});}
    if(url.pathname==='/api/ia/auth/me')return Response.json({csrf:'fixture',email:'fixture@example.invalid'});
    if(url.pathname==='/api/order/features')return Response.json({orderMenu:false});
    if(url.pathname.endsWith('/navigation'))return Response.json({revision:0,layout:{}});
    if(url.pathname.endsWith('/artifact'))return Response.json(url.searchParams.has('id')?{hash:artifact,version:'current',html:legacy,file:'legacy.html',editable:'LEGACY_EDITABLE',exportHash:'c'.repeat(64),...(mode==='detailed'?{mode}:{}),...(research?{application:{build,url:'/ia?view=research-r3&build='+build+'&screen=q2&state=filled&variant=email&mode='+mode}}:{})}:{items:[row],release:'MSG0585-R3',...(url.searchParams.get('mode')==='detailed'?{mode:'detailed'}:{})});
    if(url.pathname.endsWith('/legacy')||url.pathname.endsWith('/records'))return Response.json({items:[],hasMore:false,nextCursor:0});
    throw Error('Unexpected export host API '+url.pathname);
  };
  const shell={render(){},focusForPoint(){},setTab(){},setActiveMode(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  w.eval('('+browserFunction(bootQaHost)+')')('fixture-nonce','function oldFrame(session){if(window===parent)return;}',value=>{context=value;return shell;},null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]},w.eval('('+browserFunction(createResearchExportTools)+')'));
  for(let i=0;i<150&&!context?.snapshot().current;i++)await new Promise(resolve=>setTimeout(resolve,2));
  for(let i=0;i<150&&frame.inert;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(frame.inert,false);
  w.document.getElementById('body-text').value='PRIVATE_HOST_COMMENT';w.document.getElementById('snapshot').textContent='PRIVATE_BUYER_QUOTE';
  return {w,child,frame,downloads,writes};
}

test('host downloads confirmed current DOM and audits only the exact file hash; link never uses the old bootstrap',async t=>{
  const h=await host(t),d=h.w.document;assert.equal(h.downloads.length,0);assert.equal(h.writes.length,0);
  assert.equal(d.getElementById('export-runnable').textContent,'연구본 실행 링크');
  await d.getElementById('export').onclick();assert.equal(h.downloads.length,1);const html=await h.downloads[0].text();
  assert.match(html,/01012345678/);assert.doesNotMatch(html,/PRIVATE_HOST_COMMENT|PRIVATE_BUYER_QUOTE|LEGACY_EDITABLE|oldFrame/);
  assert.equal(h.writes[0].data.evidenceRef,'sha256:'+digest(html));assert.deepEqual(Object.keys(h.writes[0].data).sort(),['evidenceRef','status','target']);
  assert.equal(h.writes[0].data.target.artifactHash,artifact);assert.doesNotMatch(JSON.stringify(h.writes),/01012345678|현재 입력한 메모/);
  assert.equal(Object.hasOwn(h.writes[0].data.target,'mode'),false,'simple audit targets retain their historical shape');
  await d.getElementById('export-runnable').onclick();assert.equal(h.downloads.length,2);const link=await h.downloads[1].text();
  assert.match(link,/연구본 실행 링크/);assert.doesNotMatch(link,/oldFrame|01012345678/);assert.equal(h.writes[1].data.evidenceRef,'sha256:'+digest(link));
  h.child.setPending({screen:'q3'});await d.getElementById('export').onclick();assert.equal(h.downloads.length,2);assert.equal(h.writes.length,2);
});

test('detailed host exports and audit targets stay in the confirmed mode and reject an in-place mode change',async t=>{
  const h=await host(t,{mode:'detailed'}),d=h.w.document;
  await d.getElementById('export').onclick();assert.equal(h.downloads.length,1);
  const saved=new JSDOM(await h.downloads[0].text());t.after(()=>saved.window.close());
  const metadata=JSON.parse(saved.window.document.getElementById('order-export-metadata').content.textContent);
  assert.equal(metadata.route.mode,'detailed');assert.equal(h.writes[0].data.target.mode,'detailed');
  await d.getElementById('export-runnable').onclick();assert.equal(h.downloads.length,2);
  const linked=new JSDOM(await h.downloads[1].text());t.after(()=>linked.window.close());
  assert.equal(new URL(linked.window.document.querySelector('a').href).searchParams.get('mode'),'detailed');assert.equal(h.writes[1].data.target.mode,'detailed');
  h.child.route.mode='simple';await d.getElementById('export').onclick();assert.equal(h.downloads.length,2);assert.equal(h.writes.length,2);
});

test('host keeps the existing source snapshot and standalone legacy export behavior',async t=>{
  const h=await host(t,{research:false}),d=h.w.document;assert.equal(d.getElementById('export-runnable').textContent,'실행용 HTML');
  await d.getElementById('export').onclick();assert.equal(await h.downloads[0].text(),'LEGACY_EDITABLE');assert.equal(h.writes[0].data.evidenceRef,'sha256:'+'c'.repeat(64));
  await d.getElementById('export-runnable').onclick();const html=await h.downloads[1].text();assert.match(html,/LEGACY_SOURCE/);assert.match(html,/oldFrame/);assert.doesNotMatch(html,/if\(window===parent\)return/);assert.equal(h.writes[1].data.evidenceRef,'sha256:'+digest(html));
});
