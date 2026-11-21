"""Real Chromium RAF/paint mechanics of the shared product modules.

The data below is explicitly synthetic and remains in this page. The companion
r3-admin-common-browser.py exercises the canonical QA adapter and complete
receipt/billing workflows. These checks measure the same implementation with
non-proportional chart values and controlled layout acknowledgements.
"""
import json
import hashlib
import os
import re
import shutil
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/motion21/admin'
OUT.mkdir(parents=True,exist_ok=True)
ADMIN=(ROOT/'src/server/product-admin-motion.mjs').read_text().replace('export function ','function ').replace('export const ','const ')
WORKFLOW=(ROOT/'src/server/product-workflow-motion.mjs').read_text().replace('export function ','function ').replace('export const ','const ')
HTML='''<style>
*{box-sizing:border-box}body{margin:20px;font:14px/1.5 system-ui;color:#192438;background:#f6f8fb}button,a,select{font:inherit}button{min-height:36px}
#role-menu{display:flex;gap:24px;margin-bottom:20px;width:max-content;max-width:100%}#role-menu a{padding:12px 16px;text-decoration:none;color:#273e62;white-space:nowrap}
.sidebar-shell{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:110px}.qa-admin-sidebar{width:220px;background:#eaf0f9;padding:12px;overflow:hidden}.qa-admin-sidebar span{display:block;white-space:nowrap}
#depth-sub{padding:16px;background:#e9eff8}#terms{max-width:620px;margin:28px 0;position:relative}.terms-body{height:260px;overflow:auto;background:white;padding:16px}.terms-body section{min-height:210px}.terms-body h3{margin:0 0 16px}.terms-body p{line-height:1.8}
#workflow{margin:24px 0;max-width:700px}#receipt-stage{max-width:380px}#amount{max-width:340px}.test-actions{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}
.ob-quick{position:fixed;right:24px;bottom:24px;width:46px;height:46px;z-index:50}.ob-quick>button{width:46px;height:46px;border:1px solid #dce3ee;border-radius:50%;background:white;color:#365fd2;display:grid;place-items:center;padding:0}
</style><main id="app"><nav id="role-menu" aria-label="관리 메뉴"><a id="nav-home" href="#home" aria-current="page">현황</a><a id="nav-last" href="#billing">거래 및 청구 관리</a></nav>
<div class="sidebar-shell"><aside class="qa-admin-sidebar"><button id="collapse" data-pm-collapse aria-expanded="true">메뉴 접기</button><span data-pm-label>거래 관리</span><span data-pm-label>현재 계정</span></aside><div></div></div>
<button id="depth" data-pm-depth aria-expanded="false" aria-controls="depth-sub">하위 메뉴</button><div id="depth-sub" hidden>견적 목록 · 발급 내역</div>
<div id="dashboard"></div><section id="terms"><h2>명시된 검수용 문서</h2><div class="terms-body"><div data-policy-content>'''+''.join(f'<section><h3>{i}. 검수 항목</h3><p>이 본문은 목차, 실제 스크롤 위치와 끌기 동작을 측정하는 합성 문서입니다. 게시된 서비스 약관이 아닙니다.</p></section>' for i in range(1,5))+'''</div></div></section>
<section id="workflow"><div class="test-actions"><button id="print-example">검수용 종이 표시</button><button id="amount-add">금액 12,340</button><button id="amount-remove">금액 8</button></div><div id="amount" class="wf-amount"></div><div id="receipt-stage"></div></section><nav class="ob-quick" aria-label="알림"><button id="existing-bell" data-action="quick" aria-label="알림"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg></button></nav><output id="quick-result"></output></main>'''
HARNESS=r'''
const style=document.createElement('style');style.textContent=productAdminMotionCss+productWorkflowMotionCss;document.head.append(style);
window.nativeRAF=window.requestAnimationFrame.bind(window);const cancelRAF=window.cancelAnimationFrame.bind(window);window.moduleFrames=new Set();
window.requestAnimationFrame=fn=>{let id=nativeRAF(t=>{moduleFrames.delete(id);fn(t);});moduleFrames.add(id);return id;};
window.cancelAnimationFrame=id=>{moduleFrames.delete(id);cancelRAF(id);};
window.trustedInputs=[];for(const type of ['pointerdown','pointerup','click','keydown'])document.addEventListener(type,e=>trustedInputs.push({type,trusted:e.isTrusted,key:e.key||'',target:e.target.id||e.target.className?.baseVal||e.target.className||e.target.tagName}),true);
window.fixture={kind:'dummy',commercial:false,persistent:false,data:{title:'합성 RAF 측정 현황',scopeLabel:'브라우저 검수 전용',unit:'건',periods:[
 {id:'week',label:'이번 주',total:12,change:5,points:[1,2,3,4,5,6,7,8,9,10,11,12].map((value,i)=>({label:'검수 '+(i+1)+'일',value}))},
 {id:'month',label:'이번 달',total:45,change:-2,points:[24,22,23,15,18,12,13,11,7,8,6,3].map((value,i)=>({label:'검수 '+(i+1)+'일',value}))}
],segments:[{id:'a',label:'접수',amount:9,color:'#4169e1'},{id:'b',label:'완료',amount:3,color:'#51a7ae'},{id:'c',label:'검토',amount:6,color:'#a08add'}]}};
window.adminAPI=installProductAdminMotion(window);window.workflow=installProductWorkflowMotion(window);
window.stored={revision:0,data:{layout:[0,1,2].map(i=>({id:'widget-'+i,wide:false}))}};window.layoutWrites=[];window.quickRuns=[];
window.originalBell=document.querySelector('#existing-bell');
const passIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5H20V19H4Z"/><path d="M8 9H16M8 13H14"/></svg>';
const marketIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2C8.6 2 5 9.1 5 14a7 7 0 0 0 14 0c0-4.9-3.6-12-7-12Z"/><path data-currency="KRW" stroke-width="1.5" d="M8 9l2 7 2-5 2 5 2-7M7.5 11.5h9M8 14h8"/></svg>';
window.options={data:fixture.data,loadLayout:async()=>structuredClone(stored),saveLayout:async(payload,{signal})=>{
 layoutWrites.push(structuredClone(payload));return new Promise((resolve,reject)=>{window.ackLayout=()=>{stored={revision:stored.revision+1,data:{layout:structuredClone(payload.layout)}};resolve(structuredClone(stored));};signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});
},trigger:originalBell,container:originalBell.parentElement,actions:[{id:'order-pass',label:'오더 패스',icon:passIcon,run:()=>quickRuns.push('manage.quotes')},{id:'market-price',label:'시세 알림',icon:marketIcon,run:()=>quickRuns.push('notifications')}]};
window.remount=()=>{window.admin?.destroy();document.querySelector('#dashboard').innerHTML=adminAPI.renderDashboard(fixture.data);window.admin=adminAPI.mount(document.querySelector('#app'),options);};remount();
document.querySelector('#collapse').addEventListener('click',e=>e.currentTarget.setAttribute('aria-expanded',String(e.currentTarget.getAttribute('aria-expanded')==='false')));
document.querySelector('#depth').addEventListener('click',e=>admin.toggleDepth(e.currentTarget));
window.index=adminAPI.mountScrollIndex(document.querySelector('#terms'));
window.paperAbort=new AbortController();document.querySelector('#print-example').addEventListener('click',()=>workflow.receiptPaper(document.querySelector('#receipt-stage'),{number:'QA-RAF-001',model:'order-to-business',recipient:{kind:'site',siteId:'검수 사업장'},product:'합성 검수 품목',quantity:2,paid:12340,issuedAt:'2026-11-20T00:00:00Z',documentDigest:'synthetic-browser-visual-only'},{signal:paperAbort.signal}));
workflow.amountDigits(document.querySelector('#amount'),8);document.querySelector('#amount-add').addEventListener('click',()=>workflow.amountDigits(document.querySelector('#amount'),12340));document.querySelector('#amount-remove').addEventListener('click',()=>workflow.amountDigits(document.querySelector('#amount'),8));
window.rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
window.matrix=e=>{const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return {x:m.m41,y:m.m42,z:m.m43,sx:m.m11,sy:m.m22};};
window.take=kind=>{
 const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
 if(kind==='stat'){const h=q('[data-pm-stat]');return {path:h.querySelector('.pm-graph-line').getAttribute('d'),tail:Number(h.querySelector('.pm-graph-dot').getAttribute('cy')),value:h.querySelector('.pm-stat-value').textContent,pill:matrix(h.querySelector('.pm-period-pill'))};}
 if(kind==='nav')return {...rect(q('.pm-nav-indicator')),opacity:Number(getComputedStyle(q('.pm-nav-indicator')).opacity)};
 if(kind==='sidebar')return {width:rect(q('.qa-admin-sidebar')).width,labels:all('[data-pm-label]').map(e=>({opacity:Number(getComputedStyle(e).opacity),...matrix(e)}))};
 if(kind==='depth')return {height:rect(q('.t-acc-panel')).height,opacity:Number(getComputedStyle(q('.t-acc-panel-inner')).opacity)};
 if(kind==='ring')return {angle:Number(q('.pm-ring-wheel g').getAttribute('transform').match(/rotate\(([-.\d]+)/)[1]),selected:q('.pm-ring-wheel').getAttribute('aria-valuetext')};
 if(kind==='widgets')return all('[data-pm-widgets]>[data-widget-id]').map(e=>({id:e.dataset.widgetId,wide:e.classList.contains('qa-widget-expanded'),matrix:matrix(e),rect:rect(e)}));
 if(kind==='index')return {top:q('.terms-body').scrollTop,end:q('.terms-body').scrollHeight-q('.terms-body').clientHeight,thumb:matrix(q('.pm-scroll-head')).y,current:q('.pm-scroll-tick[aria-current]')?.getAttribute('aria-label')};
 if(kind==='gooey'){const circles=all('.pm-gooey-surface g>circle');return {open:q('[data-product-gooey]').dataset.open,center:{x:Number(circles[0].getAttribute('cx')),y:Number(circles[0].getAttribute('cy'))},items:all('.pm-gooey-action').map((e,i)=>({...matrix(e),opacity:Number(getComputedStyle(e).opacity),cx:Number(circles[i+1].getAttribute('cx')),cy:Number(circles[i+1].getAttribute('cy')),r:Number(circles[i+1].getAttribute('r')),radius:parseFloat(getComputedStyle(e).width)/2}))};}
 if(kind==='paper'){const e=q('.wf-paper');return e?{...matrix(e),opacity:Number(getComputedStyle(e).opacity),animations:e.getAnimations().length}:null;}
 if(kind==='amount')return {label:q('#amount').getAttribute('aria-label'),nodes:all('#amount [data-place]').map(e=>({place:e.dataset.place,text:e.textContent,position:getComputedStyle(e).position,opacity:Number(getComputedStyle(e).opacity),...matrix(e),translate:getComputedStyle(e).translate}))};
};
window.arm=(kind,selector,ms,type='click',key=null)=>{
 window.captureDone=false;window.captured=null;window.capturePromise=new Promise(resolve=>{
 const listener=e=>{if(!e.isTrusted||!e.target.closest(selector)||(key&&e.key!==key))return;document.removeEventListener(type,listener,true);const start=performance.now(),samples=[];
 const sample=()=>{samples.push({t:performance.now()-start,value:take(kind)});if(performance.now()-start<ms)nativeRAF(sample);else{window.captureDone=true;window.captured={kind,trigger:{type:e.type,trusted:e.isTrusted,key:e.key||''},samples};resolve(captured);}};sample();};document.addEventListener(type,listener,true);
 });
};
'''


def capture(page, kind, selector, action, reduced, ms=1200, event='click', key=None):
    page.evaluate('(x)=>arm(...x)',[kind,selector,180 if reduced else ms,event,key])
    action()
    page.wait_for_function('window.captureDone')
    value=page.evaluate('window.captured')
    assert value['trigger']['trusted'] is True,value
    assert len(value['samples'])>=3,value
    return value


def idle(page):
    page.wait_for_function('window.moduleFrames.size===0',timeout=10000)


def check_gooey(page, reduced, name, evidence):
    trigger=page.locator('.ob-quick>button[data-action=quick]')
    expect(trigger).to_have_count(1)
    expect(page.locator('.pm-gooey-trigger')).to_have_count(1)
    expect(page.locator('[data-product-gooey]')).to_have_count(1)
    assert trigger.evaluate('el=>el===window.originalBell')
    expect(page.locator('.pm-gooey-action')).to_have_count(2)
    expect(page.locator('.pm-gooey-label')).to_have_count(0)
    assert page.locator('.pm-gooey-action').evaluate_all('(els)=>els.map(el=>el.getAttribute("aria-label"))')==['오더 패스','시세 알림']
    assert page.locator('.pm-gooey-action').evaluate_all('(els)=>els.every(el=>!el.innerText.trim()&&el.querySelector("svg"))')
    gooey=capture(page,'gooey','.pm-gooey-trigger',trigger.click,reduced)
    for row in gooey['samples']:
        center=row['value']['center']
        for item in row['value']['items']:
            assert abs(item['x']-(item['cx']-center['x']))<.02,item
            assert abs(item['y']-(item['cy']-center['y']))<.02,item
            assert abs(item['sx']*item['radius']-item['r'])<.01,item
    if not reduced:
        assert any(0<i['r']<22 and i['x']<0 and i['y']<0 for row in gooey['samples'] for i in row['value']['items'])
    idle(page)
    settled=page.evaluate("take('gooey')")
    for item,expected in zip(settled['items'],[(-82,-20),(-22,-82)]):
        assert abs(item['x']-expected[0])<.02 and abs(item['y']-expected[1])<.02,item
        assert item['radius']==22
    assert abs(settled['items'][0]['x']-settled['items'][1]['x'])>50
    assert abs(settled['items'][0]['y']-settled['items'][1]['y'])>50
    assert page.locator('.pm-gooey-surface feGaussianBlur').get_attribute('stdDeviation')=='6'
    assert '18 -7' in page.locator('.pm-gooey-surface feColorMatrix').get_attribute('values')
    page.screenshot(path=OUT/f'gooey-{name}.png')
    trigger.press('Escape')
    expect(trigger).to_have_attribute('aria-expanded','false')
    expect(trigger).to_be_focused()
    idle(page)
    trigger.press('ArrowUp')
    expect(page.locator('.pm-gooey-action').first).to_be_focused()
    page.keyboard.press('End')
    expect(page.locator('.pm-gooey-action').last).to_be_focused()
    page.locator('.pm-gooey-action').last.click()
    assert page.evaluate('quickRuns')==['notifications']
    expect(trigger).to_have_attribute('aria-expanded','false')
    trigger.click()
    page.locator('.pm-gooey-action').first.click()
    assert page.evaluate('quickRuns')==['notifications','manage.quotes']
    expect(trigger).to_have_attribute('aria-expanded','false')
    trigger.click()
    page.mouse.click(2,2)
    expect(trigger).to_have_attribute('aria-expanded','false')
    idle(page)
    evidence['samples']['gooey']=gooey
    evidence['gooey']={'entrypoints':1,'actions':['order-pass','market-price'],'visualLabelBoxes':0,'settled':settled,'destinations':page.evaluate('quickRuns')}


def run(browser,width,reduced):
    context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce' if reduced else 'no-preference')
    page=context.new_page()
    page.set_default_timeout(10000)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    name=f'{width}-'+('reduced' if reduced else 'motion')
    evidence={'width':width,'reducedMotion':reduced,'source':{'kind':'dummy','commercial':False,'persistent':False},'sourceHashes':{name:hashlib.sha256((ROOT/'src/server'/name).read_bytes()).hexdigest() for name in ['product-admin-motion.mjs','product-workflow-motion.mjs']},'samples':{}}
    try:
        page.set_content(HTML)
        page.add_script_tag(content=ADMIN+'\n'+WORKFLOW+'\n'+HARNESS)
        idle(page)
        if os.environ.get('R3_GOOEY_ONLY')=='1':
            check_gooey(page,reduced,name,evidence)
            page.evaluate('admin.destroy();index.destroy();paperAbort.abort();')
            idle(page)
            expect(page.locator('[data-product-gooey],.pm-gooey-action,.pm-gooey-trigger')).to_have_count(0)
            expect(page.locator('.ob-quick>button[data-action=quick]')).to_have_count(1)
            assert page.evaluate('document.querySelector(".ob-quick>button")===originalBell')
            assert not errors,errors
            evidence.update(scope='Gooey only; synthetic callback destinations, not a commerce result',cleanup={'pendingRAF':page.evaluate('moduleFrames.size'),'originalBellRetained':True,'pageErrors':errors})
            (OUT/f'gooey-frames-{name}.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
            print(f'PASS existing bell Gooey real RAF {name}',flush=True)
            return
        period=page.locator('[data-pm-stat] [data-period=month]')
        stat=capture(page,'stat','[data-pm-stat] [data-period=month]',period.click,reduced,1900)
        idle(page)
        expect(page.locator('[data-pm-stat] .pm-stat-value')).to_have_text('45건')
        first=stat['samples'][0]['value']
        after=page.evaluate("take('stat')")
        assert after['path']!=first['path'] and abs(after['tail']-first['tail'])>30
        if not reduced:
            changed=[v['value'] for v in stat['samples'] if v['value']['path']!=first['path']]
            assert len({v['path'] for v in changed})>=6
            assert any(abs(v['tail']-first['tail'])<.001 for v in changed),'head responds while the staggered tail retains its old value'
        evidence['samples']['stat']=stat

        page.mouse.move(0,0)
        link=page.locator('#nav-last')
        link.scroll_into_view_if_needed()
        nav=capture(page,'nav','#nav-last',link.hover,reduced,event='pointerover')
        idle(page)
        final=page.evaluate("take('nav')")
        target=link.bounding_box()
        assert abs(final['x']-target['x'])<1 and abs(final['width']-target['width'])<1
        if not reduced:
            assert max(x['value']['width'] for x in nav['samples'])>target['width']+1,'leading edge must lead the trailing spring'
        assert link.get_attribute('href')=='#billing'
        link.press('Home')
        expect(page.locator('#nav-home')).to_be_focused()
        evidence['samples']['nav']=nav

        sidebar=capture(page,'sidebar','#collapse',page.locator('#collapse').click,reduced)
        idle(page)
        assert abs(page.evaluate("take('sidebar').width")-64)<.1
        if not reduced:
            assert any(65<x['value']['width']<219 for x in sidebar['samples'])
        page.locator('#collapse').click()
        idle(page)
        expect(page.locator('#collapse')).to_have_attribute('aria-expanded','true')
        depth=capture(page,'depth','#depth',page.locator('#depth').click,reduced,450)
        expect(page.locator('#depth')).to_have_attribute('aria-expanded','true')
        if not reduced:
            end=depth['samples'][-1]['value']['height']
            assert any(0<x['value']['height']<end-.5 for x in depth['samples'])
        evidence['samples'].update(sidebar=sidebar,depth=depth)

        ring=capture(page,'ring','.pm-ring-legend button:nth-child(2)',page.locator('.pm-ring-legend button').nth(1).click,reduced)
        idle(page)
        expect(page.locator('.pm-ring-wheel')).to_have_attribute('aria-valuetext','완료 3건')
        assert len(page.locator('.pm-ring-wheel g path').all())==3
        if not reduced:
            assert len({x['value']['angle'] for x in ring['samples']})>=6
        wheel=page.locator('.pm-ring-wheel')
        wheel.scroll_into_view_if_needed()
        r=wheel.bounding_box()
        page.mouse.move(r['x']+r['width']/2,r['y']+20)
        page.mouse.down()
        page.mouse.move(r['x']+r['width']-20,r['y']+r['height']/2,steps=8)
        expect(wheel).to_have_attribute('data-dragging','true')
        page.mouse.up()
        expect(wheel).not_to_have_attribute('data-dragging','true')
        idle(page)
        wheel.press('Home')
        expect(wheel).to_have_attribute('aria-valuetext','접수 9건')
        evidence['samples']['ring']=ring

        page.locator('[data-layout=edit]').click()
        grip=page.locator('[data-widget-grip=widget-0]')
        grip.focus()
        grip.press('Space')
        expect(grip).to_have_attribute('aria-pressed','true')
        bento=capture(page,'widgets','[data-widget-grip=widget-0]',lambda:grip.press('ArrowDown'),reduced,800,event='keydown',key='ArrowDown')
        grip.press('Space')
        idle(page)
        assert page.locator('[data-pm-widgets]>[data-widget-id]').evaluate_all('els=>els.map(e=>e.dataset.widgetId)')==['widget-1','widget-0','widget-2']
        if not reduced:
            assert any(abs(v['matrix']['y'])>.1 or abs(v['matrix']['x'])>.1 for row in bento['samples'][1:] for v in row['value'])
        page.locator('[data-layout=size]').click()
        expect(page.locator('[data-widget-id=widget-0]')).to_have_class(re.compile('qa-widget-expanded'))
        page.locator('[data-layout=save]').click()
        expect(page.locator('[data-pm-widgets]')).to_have_attribute('aria-busy','true')
        assert page.evaluate('layoutWrites.length')==1
        page.evaluate('ackLayout()')
        expect(page.locator('.pm-layout-status')).to_have_text('배치를 저장했습니다.')
        page.evaluate('remount()')
        idle(page)
        assert page.locator('[data-pm-widgets]>[data-widget-id]').evaluate_all('els=>els.map(e=>e.dataset.widgetId)')==['widget-1','widget-0','widget-2']
        expect(page.locator('[data-widget-id=widget-0]')).to_have_class(re.compile('qa-widget-expanded'))
        evidence['samples']['bento']=bento
        evidence['savedLayout']=page.evaluate('stored')

        tick=page.locator('.pm-scroll-tick').nth(1)
        tick.scroll_into_view_if_needed()
        scroll=capture(page,'index','.pm-scroll-index',tick.click,reduced,800,event='pointerdown')
        idle(page)
        expect(tick).to_have_attribute('aria-current','location')
        end=scroll['samples'][-1]['value']['top']
        assert end>100
        if not reduced:
            assert any(0<x['value']['top']<end-1 for x in scroll['samples'])
        tick.press('ArrowDown')
        expect(page.locator('.pm-scroll-tick').nth(2)).to_be_focused()
        rail=page.locator('.pm-scroll-index')
        r=rail.bounding_box()
        page.mouse.move(r['x']+r['width']/2,r['y']+20)
        page.mouse.down()
        page.mouse.move(r['x']+r['width']/2,r['y']+r['height']*.7,steps=8)
        expect(rail).to_have_attribute('data-dragging','true')
        assert page.evaluate("take('index').top/take('index').end")>.5
        page.mouse.up()
        expect(rail).not_to_have_attribute('data-dragging','true')
        evidence['samples']['scrollIndex']=scroll

        check_gooey(page,reduced,name,evidence)

        amount=capture(page,'amount','#amount-add',page.locator('#amount-add').click,reduced,650)
        expect(page.locator('#amount')).to_have_attribute('aria-label','12,340원')
        expect(page.locator('#amount [data-place]')).to_have_count(6)
        if not reduced:
            assert any(abs(n['y'])>.3 and n['opacity']<.99 for row in amount['samples'] for n in row['value']['nodes'])
        shrink=capture(page,'amount','#amount-remove',page.locator('#amount-remove').click,reduced,600)
        expect(page.locator('#amount [data-place]')).to_have_count(1)
        expect(page.locator('#amount')).to_have_attribute('aria-label','8원')
        if not reduced:
            assert any(n['position']=='absolute' and 0<n['opacity']<1 for row in shrink['samples'] for n in row['value']['nodes'])
        paper=capture(page,'paper','#print-example',page.locator('#print-example').click,reduced,1200)
        expect(page.locator('.wf-paper')).to_contain_text('QA-RAF-001')
        samples=[row['value'] for row in paper['samples'] if row['value']]
        assert samples and abs(samples[-1]['y'])<.1 and samples[-1]['opacity']==1
        if not reduced:
            assert min(v['y'] for v in samples)<-20
            assert any(-20<v['y']<0 for v in samples)
        else:
            assert all(v['animations']==0 and v['y']==0 for v in samples)
        receipt=page.locator('.wf-paper')
        receipt.scroll_into_view_if_needed()
        r=receipt.bounding_box()
        page.mouse.move(r['x']+r['width']/2,r['y']+40)
        page.mouse.down()
        page.mouse.move(r['x']+r['width']/2+30,r['y']+140,steps=8)
        dragged=page.evaluate("take('paper')")
        assert 0<dragged['y']<90
        page.mouse.up()
        receipt.evaluate('async el=>{await Promise.allSettled(el.getAnimations().map(a=>a.finished));}')
        assert abs(page.evaluate("take('paper').y"))<.1
        native_selection=page.evaluate('()=>{const selection=getSelection();return {collapsed:selection?.isCollapsed??true,text:selection?.toString()||""};}')
        assert native_selection['collapsed'] or native_selection['text']=='','paper drag must not leave native text selection behind'
        evidence['samples'].update(amount=amount,amountExit=shrink,receipt=paper)
        evidence['receiptDrag']=dragged
        evidence['nativeSelectionAfterReceiptDrag']=native_selection
        page.screenshot(path=OUT/f'workflow-{name}.png')
        page.evaluate('admin.destroy();index.destroy();paperAbort.abort();')
        idle(page)
        expect(page.locator('[data-product-gooey],.pm-nav-indicator,.pm-scroll-index,.pm-widget-grip')).to_have_count(0)
        assert page.evaluate('moduleFrames.size')==0
        assert not errors,errors
        evidence['trustedInputs']=page.evaluate('trustedInputs')
        assert evidence['trustedInputs'] and all(e['trusted'] for e in evidence['trustedInputs'])
        evidence['cleanup']={'pendingRAF':0,'controllersRemoved':True,'pageErrors':errors}
        (OUT/f'frames-{name}.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
        print(f'PASS shared administrator/workflow real RAF {name}',flush=True)
    except Exception:
        page.screenshot(path=OUT/f'failure-{name}.png',full_page=True)
        (OUT/f'partial-{name}.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
        raise
    finally:
        context.close()


with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium'))
    try:
        for viewport,preference in [(390,False),(1440,False),(390,True)]:
            run(browser,viewport,preference)
    finally:
        browser.close()
