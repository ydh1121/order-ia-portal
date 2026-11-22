import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {installProductAdminMotion,productAdminMotionCss} from '../src/server/product-admin-motion.mjs';
import {mountReviewControls} from '../scripts/r3/authored/admin-common.mjs';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const supplied={title:'서버에서 받은 현황',scopeLabel:'승인된 주문 3건 · 현재 계정',unit:'건',periods:[
  {id:'week',label:'이번 주',total:12,change:5,points:Array.from({length:12},(_,i)=>({label:'11월 '+(i+1)+'일',value:i+1,note:i===4?'접수 마감':''}))},
  {id:'month',label:'이번 달',total:45,change:-2,points:Array.from({length:12},(_,i)=>({label:'10월 '+(i+1)+'일',value:24-i}))},
],segments:[{id:'ready',label:'접수',amount:9,color:'#4169e1'},{id:'done',label:'완료',amount:3,color:'#51a7ae'}]};

function setup(t,{reduced=true,html='<main id="app"></main>'}={}){
  const dom=new JSDOM(html,{url:'https://order.test/ia',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  let now=0,seq=0;const frames=new Map(),observers=new Set();
  w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});
  w.requestAnimationFrame=fn=>{const id=++seq;frames.set(id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
  w.performance.now=()=>now;
  w.ResizeObserver=class{constructor(fn){this.fn=fn;observers.add(this);}observe(){}disconnect(){observers.delete(this);}};
  w.HTMLElement.prototype.setPointerCapture=function(id){this.__capture=id;};
  w.HTMLElement.prototype.releasePointerCapture=function(){delete this.__capture;};
  w.eval('('+installProductAdminMotion.toString()+')(window)');
  const api=w.ORDER_ADMIN_MOTION,root=w.document.querySelector('#app'),controls=[];
  const mount=options=>{const c=api.mount(root,options);controls.push(c);return c;};
  const advance=ms=>{for(let t=0;t<ms;t+=1000/60){now+=1000/60;const ready=[...frames.values()];frames.clear();for(const fn of ready)fn(now);}};
  const pointer=(el,type,props={})=>{const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:0,clientY:0,...props});for(const [key,value]of Object.entries({pointerId:7,pointerType:'mouse',...props}))if(['pointerId','pointerType','timeStamp'].includes(key))Object.defineProperty(event,key,{value});el.dispatchEvent(event);return event;};
  const key=(el,key,props={})=>{const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...props});el.dispatchEvent(event);return event;};
  const rect=(el,value)=>{el.getBoundingClientRect=()=>({x:value.left||0,y:value.top||0,left:value.left||0,top:value.top||0,width:value.width||0,height:value.height||0,right:(value.left||0)+(value.width||0),bottom:(value.top||0)+(value.height||0)});};
  t.after(()=>{for(const c of controls)c.destroy();dom.window.close();});
  return {w,root,api,mount,advance,frames,observers,pointer,key,rect,controls};
}

function dashboard(view,data=supplied){view.root.innerHTML=view.api.renderDashboard(data);return view.root.querySelector('[data-pm-widgets]');}
function gridGeometry(view,grid){
  view.rect(grid,{left:20,top:40,width:660,height:420});Object.defineProperty(grid,'clientWidth',{get:()=>660,configurable:true});
  const layout=()=>{let col=0,row=0;const result=new Map();for(const card of grid.children){const span=card.classList.contains('qa-widget-expanded')?3:1;if(col+span>3){col=0;row++;}result.set(card,{left:col*220,top:row*180,width:span*220-12,height:168});col+=span;if(col>=3){col=0;row++;}}return result;};
  for(const card of grid.children){for(const [property,field]of [['offsetLeft','left'],['offsetTop','top'],['offsetWidth','width'],['offsetHeight','height']])Object.defineProperty(card,property,{get:()=>layout().get(card)[field],configurable:true});card.getBoundingClientRect=()=>{const r=layout().get(card);return {...r,x:r.left+20,y:r.top+40,left:r.left+20,top:r.top+40,right:r.left+20+r.width,bottom:r.top+40+r.height};};}
}

test('self-contained product/QA runtime displays only supplied data and escapes document labels',t=>{
  const view=setup(t);dashboard(view);const c=view.mount({data:supplied,reduced:()=>true});
  assert.equal(view.root.querySelector('.pm-stat-value').textContent,'12건');
  assert.equal(view.root.querySelectorAll('.pm-periods button').length,4);
  c.updateData({...supplied,scopeLabel:'새 응답',periods:[],segments:[]});
  assert.equal(view.root.querySelector('.pm-data-scope').textContent,'새 응답');
  assert.equal(view.root.querySelector('.pm-stat-value').textContent,'—');
  assert.equal(view.root.querySelector('.pm-ring-wheel').hidden,true);
  const text=view.api.renderDashboard({title:'<img src=x onerror=bad()>',scopeLabel:'<script>bad()</script>'});
  const template=view.w.document.createElement('template');template.innerHTML=text;
  assert.equal(template.content.querySelector('img,script'),null);
  assert.deepEqual(JSON.parse(JSON.stringify(view.api.normalizeData({periods:[{id:'x',points:[{value:Infinity},{value:5,label:'real'}]}]}))).periods[0].points,[{label:'real',value:5,note:''}]);
  assert.equal(view.frames.size,0,'reduced-motion renders final values without an animation loop');
});

test('Stat Card retargets independent point springs left to right and stops when settled',t=>{
  const view=setup(t,{reduced:false});dashboard(view);view.mount({data:supplied});view.advance(5000);
  assert.equal(view.frames.size,0);
  const host=view.root.querySelector('[data-pm-stat]'),line=host.querySelector('.pm-graph-line'),dot=host.querySelector('.pm-graph-dot');
  const before=line.getAttribute('d'),tail=dot.getAttribute('cy');host.querySelector('[data-period=month]').click();
  view.advance(100);
  assert.notEqual(line.getAttribute('d').split(' C')[0],before.split(' C')[0],'the first point responds immediately');
  assert.equal(dot.getAttribute('cy'),tail,'the last point retains its old target during its stagger');
  view.advance(5000);
  assert.equal(host.querySelector('.pm-stat-value').textContent,'45건');
  assert.notEqual(dot.getAttribute('cy'),tail);
  assert.equal(view.frames.size,0,'there is no reference demo auto-cycle or idle RAF');
});

test('Metric pointer and keyboard range read the exact dates and values supplied by the adapter',t=>{
  const view=setup(t);dashboard(view);view.mount({data:supplied});
  const host=view.root.querySelector('[data-pm-metric]'),plot=host.querySelector('.pm-plot'),tip=host.querySelector('.pm-graph-tip');
  view.rect(plot,{left:100,top:20,width:320,height:112});
  view.pointer(plot,'pointermove',{clientX:100,pointerType:'mouse'});
  assert.equal(tip.textContent,'11월 1일 · 1건');
  view.key(plot,'End');assert.equal(tip.textContent,'11월 12일 · 12건');
  view.key(plot,'ArrowLeft',{shiftKey:true});assert.equal(tip.textContent,'11월 11일 – 11월 12일 · 합계 23건');
  view.key(plot,'Escape');assert.equal(tip.hidden,true);
  view.pointer(plot,'pointerdown',{clientX:100,timeStamp:1});view.pointer(plot,'pointermove',{clientX:158,timeStamp:17});view.pointer(plot,'pointerup',{clientX:158,timeStamp:32});
  assert.equal(tip.textContent,'11월 1일 – 11월 3일 · 합계 6건');
});

test('signed administrator menu uses the asymmetric moving indicator and native link focus',async t=>{
  const view=setup(t,{reduced:false,html:'<main id="app"><nav id="role-menu"><a href="?section=a" aria-current="page">업무</a><a href="?section=b">견적</a></nav></main>'});
  const nav=view.root.querySelector('nav'),links=[...nav.querySelectorAll('a')];view.rect(nav,{left:20,top:10,width:240,height:40});view.rect(links[0],{left:20,top:10,width:80,height:40});view.rect(links[1],{left:120,top:10,width:100,height:40});
  const c=view.mount({});view.advance(5000);const indicator=nav.querySelector('.pm-nav-indicator');
  assert.equal(parseFloat(indicator.style.width),80);view.pointer(links[1],'pointerover');view.advance(50);
  const left=Number(indicator.style.transform.match(/translate3d\(([-.\d]+)/)[1]);assert.ok(left>0&&left<100);assert.ok(parseFloat(indicator.style.width)>100,'leading edge travels ahead of the trailing edge');
  view.advance(5000);assert.equal(indicator.style.transform,'translate3d(100.00px,0.00px,0)');
  links[0].focus();view.key(links[0],'ArrowRight');assert.equal(view.w.document.activeElement,links[1]);
  assert.equal(links[0].getAttribute('href'),'?section=a');assert.ok(links[0].querySelector('.t-learn-arm-top'));
  nav.replaceChildren(links[1]);links[1].setAttribute('aria-current','page');await flush();assert.equal(nav.querySelectorAll('.pm-nav-indicator').length,1,'renderMenu replacement gets the same live indicator again');
  c.destroy();assert.equal(nav.querySelector('.pm-nav-indicator'),null);assert.equal(links[1].querySelector('.t-learn-chevron'),null);assert.equal(view.frames.size,0);
});

test('Spending Ring exposes distinct amount arcs, angular drag and keyboard selection',t=>{
  const view=setup(t);dashboard(view);view.mount({data:supplied});const wheel=view.root.querySelector('.pm-ring-wheel'),group=wheel.querySelector('g');view.rect(wheel,{left:0,top:0,width:240,height:240});
  const paths=[...group.querySelectorAll('path')];assert.equal(paths.length,2);assert.match(paths[0].getAttribute('d'),/A90 90 0 1 1/);assert.match(paths[1].getAttribute('d'),/A90 90 0 0 1/);
  const before=group.getAttribute('transform');view.key(wheel,'ArrowRight');assert.equal(wheel.getAttribute('aria-valuetext'),'완료 3건');assert.notEqual(group.getAttribute('transform'),before);
  view.pointer(wheel,'pointerdown',{clientX:120,clientY:20,timeStamp:1});view.pointer(wheel,'pointermove',{clientX:220,clientY:120,timeStamp:20});assert.equal(wheel.dataset.dragging,'true');view.pointer(wheel,'pointerup',{clientX:220,clientY:120,timeStamp:25});assert.equal(wheel.dataset.dragging,undefined);assert.ok(Number.isFinite(Number(group.getAttribute('transform').match(/rotate\(([-.\d]+)/)[1])));
  view.key(wheel,'Home');assert.equal(wheel.getAttribute('aria-valuetext'),'접수 9건');
});

test('Bento keyboard reorder and resize persist only after a matching server response and reload',async t=>{
  const view=setup(t),grid=dashboard(view);gridGeometry(view,grid);let stored={revision:4,data:{layout:[0,1,2].map(i=>({id:'widget-'+i,wide:false}))}},calls=0,resolve;
  const c=view.mount({data:supplied,loadLayout:async()=>structuredClone(stored),saveLayout:async(payload)=>{calls++;await new Promise(r=>{resolve=r;});stored={revision:payload.revision+1,data:{layout:structuredClone(payload.layout)}};return stored;}});await flush();
  view.root.querySelector('[data-layout=edit]').click();const grip=grid.querySelector('[data-widget-grip="widget-0"]');grip.focus();view.key(grip,' ');view.key(grip,'ArrowRight');view.key(grip,' ');
  assert.deepEqual([...grid.children].map(c=>c.dataset.widgetId),['widget-1','widget-0','widget-2']);
  const select=view.root.querySelector('[aria-label="배치를 바꿀 위젯"]');select.value='0';view.root.querySelector('[data-layout=size]').click();
  assert.equal(grid.querySelector('[data-widget-id="widget-0"]').classList.contains('qa-widget-expanded'),true);
  const save=view.root.querySelector('[data-layout=save]');save.click();save.click();await flush();assert.equal(calls,1);assert.equal(save.disabled,true);assert.match(view.root.querySelector('.pm-layout-status').textContent,/저장하고/);
  resolve();await flush();assert.equal(view.root.querySelector('.pm-layout-status').textContent,'배치를 저장했습니다.');assert.equal(stored.revision,5);
  c.destroy();view.root.innerHTML=view.api.renderDashboard(supplied);const second=view.root.querySelector('[data-pm-widgets]');gridGeometry(view,second);view.mount({data:supplied,loadLayout:async()=>structuredClone(stored),saveLayout:async()=>stored});await flush();
  assert.deepEqual([...second.children].map(c=>c.dataset.widgetId),['widget-1','widget-0','widget-2']);assert.ok(second.querySelector('[data-widget-id="widget-0"]').classList.contains('qa-widget-expanded'));
});

test('Bento rejects mismatched save acknowledgements and cancelled pointer moves restore the snapshot',async t=>{
  const view=setup(t),grid=dashboard(view);gridGeometry(view,grid);const c=view.mount({data:supplied,saveLayout:async()=>({revision:1,data:{layout:[]}})});
  view.root.querySelector('[data-layout=edit]').click();const grip=grid.querySelector('[data-widget-grip="widget-0"]');view.pointer(grip,'pointerdown',{clientX:40,clientY:55,timeStamp:1});view.pointer(view.w,'pointermove',{clientX:280,clientY:70,timeStamp:17});
  assert.deepEqual([...grid.children].map(c=>c.dataset.widgetId),['widget-1','widget-0','widget-2']);view.key(view.w,'Escape');assert.deepEqual([...grid.children].map(c=>c.dataset.widgetId),['widget-0','widget-1','widget-2']);
  view.root.querySelector('[data-layout=save]').click();await flush();assert.match(view.root.querySelector('.pm-layout-status').textContent,/저장하지 못/);assert.equal(view.root.querySelector('[data-layout=edit]').hidden,true);
  const before=[...grid.children].map(c=>c.dataset.widgetId);assert.equal(c.restoreLayout({layout:[{id:'not-a-card',wide:true}]}),false);assert.deepEqual([...grid.children].map(c=>c.dataset.widgetId),before);
  c.destroy();assert.equal(view.root.querySelector('[data-widget-grip]'),null);assert.equal(view.frames.size,0);assert.equal(view.observers.size,0);
});

test('Scroll Index measures real headings, follows scrolling and scrubs the actual document',t=>{
  const view=setup(t,{html:'<main id="app"><div class="terms-reading"><div class="terms-body"><div data-policy-content><section><h3>문서 1</h3><p>실제 본문</p></section><section><h3>문서 2</h3><p>두 번째 본문</p></section><section><h3>문서 3</h3><p>마지막 본문</p></section></div></div></div></main>'});
  const region=view.root.querySelector('.terms-body');Object.defineProperty(region,'clientHeight',{value:300});Object.defineProperty(region,'scrollHeight',{value:1500});view.rect(region,{left:0,top:20,width:340,height:300});
  [...region.querySelectorAll('h3')].forEach((h,i)=>{h.getBoundingClientRect=()=>({top:36+i*500-region.scrollTop,left:0,width:280,height:24});});
  const c=view.api.mountScrollIndex(view.root,{reduced:()=>true});view.controls.push(c);const rail=view.root.querySelector('.pm-scroll-index'),ticks=[...rail.querySelectorAll('button')];view.rect(rail,{top:44,left:300,width:34,height:252});
  ticks[1].click();view.advance(30);assert.equal(region.scrollTop,500);assert.equal(ticks[1].getAttribute('aria-current'),'location');
  ticks[1].focus();view.key(ticks[1],'ArrowDown');assert.equal(view.w.document.activeElement,ticks[2]);
  view.pointer(rail,'pointerdown',{clientY:50,timeStamp:1});view.pointer(rail,'pointermove',{clientY:200,timeStamp:17});assert.ok(region.scrollTop>700&&region.scrollTop<800);view.pointer(rail,'pointercancel',{clientY:200,timeStamp:18});assert.equal(rail.dataset.dragging,undefined);
  c.destroy();assert.equal(view.root.querySelector('.pm-scroll-index'),null);assert.equal(view.observers.size,0);assert.equal(view.frames.size,0);
});

test('Gooey FAB mirrors one spring clock into SVG blobs and crisp buttons, and closes accessibly',t=>{
  const view=setup(t,{reduced:false,html:'<main id="app"><div class="ob-quick"><button data-action="quick" aria-label="알림"><svg class="ob-notice-icon" aria-hidden="true"><path d="M6 6L18 18"/></svg></button></div></main>'});
  const trigger=view.root.querySelector('[data-action=quick]'),container=trigger.parentElement;let invoked=0;
  const icon='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6H20V18H4Z"/></svg>';
  const c=view.mount({trigger,container,actions:[{id:'order-pass',label:'오더 패스',icon,run(){invoked++;}},{id:'market-price',label:'시세 알림',icon,run(){invoked++;}}]});
  const group=view.root.querySelector('[data-product-gooey]'),items=[...group.querySelectorAll('.pm-gooey-action')],item=items[0],blobs=group.querySelectorAll('g>circle');
  assert.equal(view.root.querySelectorAll('.pm-gooey-trigger').length,1);assert.equal(view.root.querySelector('.pm-gooey-trigger'),trigger);assert.equal(items.length,2);
  assert.equal(group.querySelector('feColorMatrix').getAttribute('values'),'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7');
  trigger.click();assert.equal(view.frames.size,1,'both radial actions share one animation clock');view.advance(150);
  const center={x:Number(blobs[0].getAttribute('cx')),y:Number(blobs[0].getAttribute('cy'))};
  for(const [i,action]of items.entries()){
    const [,x,y]=action.style.transform.match(/translate(?:3d)?\(([-.\d]+)px,\s*([-.\d]+)px/).map(Number);
    assert.ok(x<0&&y<0,'each action moves diagonally instead of in a vertical column');
    assert.equal(Number(blobs[i+1].getAttribute('cx')),Number((center.x+x).toFixed(2)));
    assert.equal(Number(blobs[i+1].getAttribute('cy')),Number((center.y+y).toFixed(2)),'content and liquid share both coordinates in the same RAF');
  }
  view.advance(5000);view.key(trigger,'ArrowUp');assert.equal(view.w.document.activeElement,item);view.key(item,'Escape');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(item.inert,true);assert.equal(view.w.document.activeElement,trigger);assert.equal(invoked,0);
  trigger.click();view.advance(5000);item.click();assert.equal(invoked,1);assert.equal(trigger.getAttribute('aria-expanded'),'false');c.destroy();assert.equal(view.root.querySelector('[data-product-gooey]'),null);assert.equal(view.root.querySelector('.ob-quick>button'),trigger);assert.equal(view.frames.size,0);
});

test('reduced motion keeps direct manipulation but schedules no chart/ring/FAB spring frames',t=>{
  const view=setup(t);dashboard(view);const container=view.w.document.createElement('div');container.className='ob-quick';container.innerHTML='<button data-action="quick" aria-label="알림"></button>';view.root.append(container);const trigger=container.querySelector('button');
  const icon='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6H20V18H4Z"/></svg>';
  view.mount({data:supplied,trigger,container,actions:[{id:'order-pass',label:'오더 패스',icon,run(){}},{id:'market-price',label:'시세 알림',icon,run(){}}]});
  view.root.querySelector('[data-pm-stat] [data-period=month]').click();view.key(view.root.querySelector('.pm-ring-wheel'),'End');view.root.querySelector('.pm-gooey-trigger').click();
  assert.equal(view.frames.size,0);assert.deepEqual([...view.root.querySelectorAll('.pm-gooey-action')].map(b=>b.style.transform.match(/translate(?:3d)?\(([-.\d]+)px,\s*([-.\d]+)px/).slice(1).map(Number)),[[-82,-20],[-22,-82]]);
  assert.match(productAdminMotionCss,/@media \(prefers-reduced-motion: reduce\)/);
});

test('terms reads published text/version safely, distinguishes QA text and cannot approve an absent document',async t=>{
  const source=await readFile(new URL('../scripts/r3/authored/account.js',import.meta.url),'utf8'),view=setup(t),{w}=view;
  w.ORDER_DESIGN_MODULES=[];w.QAUI={esc:x=>String(x),icon:()=>'',button:(label,action)=>'<button data-action="'+action+'">'+label+'</button>',field:()=>'',head:()=>'',states:rows=>rows.map(r=>r[0]),note:text=>text,shake(){}};
  w.eval(source);const terms=w.ORDER_DESIGN_MODULES.find(m=>m.id==='terms');let response={id:'required',status:'unpublished',sections:[]};const adapter={request:async()=>response};
  view.root.innerHTML=terms.render('required');let dispose=terms.mount(view.root,'required',{mode:'product',adapter,reduced:()=>true});await flush();
  assert.equal(view.root.querySelector('[name=terms-check]').disabled,true);assert.equal(view.root.querySelector('[data-action=terms-done]').disabled,true);assert.match(view.root.querySelector('[data-policy-status]').textContent,/게시된 약관 본문이 없습니다/);
  response={id:'required',status:'published',version:'2026-11-21',title:'승인된 문서',sections:[{id:'a',title:'제목 <script>',paragraphs:['<img src=x onerror=bad()>']},{id:'b',title:'두 번째 제목',paragraphs:['실제 제공된 문서 내용.']}]};view.root.querySelector('[data-policy-retry]').click();await flush();
  assert.equal(view.root.querySelector('[data-policy-content] img'),null);assert.equal(view.root.querySelector('[data-policy-content] p').textContent,'<img src=x onerror=bad()>');assert.equal(view.root.querySelector('[name=terms-check]').dataset.policyVersion,'2026-11-21');assert.equal(view.root.querySelector('[name=terms-check]').checked,false);assert.ok(view.root.querySelector('.pm-scroll-index'));
  dispose();adapter.fixture={};response={...response,status:'fixture',fixture:{format:'order-qa-fixture/v1',kind:'dummy',commercial:false},version:'qa-review-v1'};view.root.innerHTML=terms.render('required');dispose=terms.mount(view.root,'required',{adapter,reduced:()=>true});await flush();assert.match(view.root.querySelector('[data-policy-meta]').textContent,/검수용 본문 · 실제 약관이 아닙니다/);dispose();
  delete adapter.fixture;view.root.innerHTML=terms.render('required');dispose=terms.mount(view.root,'required',{mode:'product',adapter});await flush();assert.equal(view.root.querySelector('[name=terms-check]').disabled,true,'a fixture cannot be treated as a published policy in the product');dispose();
});

test('the preserved authored overview consumes the same dashboard and retains the R1 QA layout transport',async t=>{
  const artifact=await preservedReviewArtifact('admin-overview/normal/email'),view=setup(t),template=view.w.document.createElement('template');template.innerHTML=artifact.html;
  view.root.innerHTML=template.content.querySelector('#order-single').innerHTML;const oldGrid=view.root.querySelector('.qa-widget-grid'),oldStats=view.root.querySelector('.qa-stats'),calls=[],saved=[];
  view.w.QAUI={};view.w.ORDER_DESIGN_MODULES=[{id:'admin-overview',states:['normal','loading']}];view.w.ORDER_APP_ADAPTER={fixture:{source:'dummy'},request:async path=>{calls.push(path);return supplied;}};
  view.w.__api={screen:'admin-overview',mode:'review',reduced:()=>true,select(){},saveReviewLayout:rows=>saved.push(rows),demoSuccess:async(button,done)=>{done();return true;}};
  view.w.__root=view.root;view.w.eval('window.__dispose=('+mountReviewControls.toString()+')(__root,"normal",__api)');view.controls.push({destroy:()=>view.w.__dispose()});await flush();
  assert.deepEqual(calls,['/dashboard']);assert.equal(oldStats.hidden,true);assert.equal(view.root.querySelectorAll('[data-pm-widgets]>article').length,3);assert.equal(view.root.querySelector('.pm-stat-value').textContent,'12건');
  view.root.dispatchEvent(new view.w.CustomEvent('r3-widget-layout',{detail:{layout:[{index:2,wide:true},{index:0,wide:false},{index:1,wide:false}]}}));
  assert.deepEqual([...view.root.querySelector('[data-pm-widgets]').children].map(c=>c.dataset.widgetId),['widget-2','widget-0','widget-1']);
  view.root.querySelector('[data-layout=edit]').click();view.root.querySelector('[data-layout=save]').click();await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)),[[{index:2,wide:true},{index:0,wide:false},{index:1,wide:false}]],'legacy host receives the unchanged index/wide contract');
  view.w.__dispose();assert.equal(view.root.querySelector('.qa-widget-grid'),oldGrid);assert.equal(oldStats.hidden,false);
});

test('authored business actions are delegated once to the actual workflow owner',t=>{
  const view=setup(t,{html:'<main id="app"><div class="qa-admin"><button data-qa-action="issue-receipt">발급</button></div></main>'});let actual=0,simulated=0,cleaned=0;
  view.w.QAUI={};view.w.ORDER_DESIGN_MODULES=[{id:'receipt',states:['before','complete']}];view.w.ORDER_WORKFLOW_MOTION={mount(root){const click=e=>{if(e.target.closest('[data-qa-action="issue-receipt"]'))actual++;};root.addEventListener('click',click);return {handlesAction:a=>a==='issue-receipt',destroy(){cleaned++;root.removeEventListener('click',click);}};}};
  view.w.__api={screen:'receipt',mode:'product',reduced:()=>true,select(){assert.fail('a workflow response cannot be replaced with navigation');},demoSuccess(){simulated++;}};view.w.__root=view.root;
  view.w.eval('window.__dispose=('+mountReviewControls.toString()+')(__root,"before",__api)');view.root.querySelector('button').click();assert.equal(actual,1);assert.equal(simulated,0);view.w.__dispose();assert.equal(cleaned,1);
});
