"""Exercise QA purchase input, review hand-off and each read-only result design in Chromium."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlencode, urlsplit
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import PreservedReviewScreens, ReviewScreens, frame_click, frame_pointer_position

ROOT = Path(__file__).resolve().parents[1]
def capture_reference_viewports(qa_page, folder):
    # Match the five preserved Figma artboards at the original 375 × 828 CSS pixels.
    # Use the exact current application build URL, with the same isolated result
    # data. A module app must run on its authenticated origin, not set_content.
    out = Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    page = qa_page.context.new_page()
    page.set_viewport_size({'width':375,'height':828})
    errors=[]
    try:
        for state in ['saving','new-detail','current-detail','equal','current-lower']:
            path = '/api/ia/r3-qa/artifact?'+urlencode({'id':'quote-result/'+state+'/email','width':375,'version':'current'})
            artifact = qa_page.evaluate('''async path => {
                const response = await fetch(path, {credentials:'same-origin'});
                if (!response.ok) throw Error('Protected export returned HTTP '+response.status);
                return await response.json();
            }''', path)
            assert artifact.get('application') and artifact['source']['kind']=='research-application'
            origin=urlsplit(qa_page.url)
            page.goto(f'{origin.scheme}://{origin.netloc}'+artifact['application']['url'])
            expect(page.locator('html')).to_have_attribute('data-product-build',artifact['application']['build'])
            wrapper=page.locator('[data-review-result]')
            expect(wrapper).to_have_attribute('data-view',state)
            expect(wrapper).to_have_attribute('data-quote-fixture','figma-20261118')
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(out/('reference-'+state+'-375x828.png')),animations='disabled')
            try:
                check_result(wrapper.locator('[data-order-result]'),state)
                if state=='new-detail':
                    expect(wrapper.locator('.oq-clock:visible')).to_have_text('6일 21시간 13분 59초')
                assert page.locator('iframe').count()==0
            except AssertionError as error:
                errors.append((state,str(error)))
        assert not errors,errors
    finally:
        page.close()

def check_result(view, state):
    direct=['saving','new-detail','current-detail','equal','current-lower']
    if state in direct:
        state_name={'new-detail':'saving','current-detail':'saving'}.get(state,state)
        expect(view).to_have_attribute('data-state',state_name)
        expect(view.locator('.oq-series:visible')).to_have_count(2)
        current=view.locator('.oq-series[data-kind=current]')
        proposed=view.locator('.oq-series[data-kind=proposed]')
        expect(current).to_have_attribute('aria-label',re.compile('12,540,000원'))
        target={'equal':'12,540,000','current-lower':'13,140,000'}.get(state,'11,940,000')
        expect(proposed).to_have_attribute('aria-label',re.compile(target+'원'))
        if state in ('new-detail','current-detail'):
            front=proposed if state=='new-detail' else current
            expect(front).to_have_attribute('data-front','true')
            expect(front.locator('.oq-card-copy')).to_be_visible()
            expect(front.locator('.oq-annual')).to_contain_text('7,200,000')
            if state=='new-detail':
                expect(front.locator('.oq-rate')).to_contain_text('4.78%')
                expect(front.locator('.oq-clock')).to_have_text(re.compile(r'6일 21시간 13분 \d{2}초'))
                expect(view.locator('.oq-meta .oq-meta-line').first).to_have_text('동일한 1회 납품 기준 / 2,000판')
                expect(view.locator('.oq-meta')).to_contain_text('2026.11.21')
            else:
                expect(front.locator('.oq-rate')).to_contain_text('300원')
            boxes=[current.bounding_box(),proposed.bounding_box()]
            assert all(boxes)
            assert min(a['x']+a['width'] for a in boxes)>max(a['x'] for a in boxes),'the selected card should overlap the other card'
        elif state=='equal':
            heights=[el.bounding_box()['height'] for el in (current,proposed)]
            assert abs(heights[0]-heights[1])<=1,heights
        elif state=='current-lower':
            expect(current).to_have_attribute('data-accent','true')
    elif state in ('no-current','new-only-detail'):
        expect(view.locator('.oq-series:visible')).to_have_count(1)
        expect(view.locator('.oq-series[data-kind=proposed]')).to_be_visible()
    elif state=='recompare':
        expect(view.get_by_role('button',name='새로운 견적')).to_be_visible()
        expect(view.get_by_role('button',name='동일한 조건')).to_be_visible()
    else:
        expect(view).to_have_attribute('data-state',{'locked':'unverified','no-result':'no-offer','expired':'expired'}[state])
        expect(view.locator('.oq-series:visible')).to_have_count(0)
        assert not re.search(r'12,540,000|11,940,000|13,140,000',view.inner_text())


def check_motion(page, origin):
    # Collect actual animation values in the sandboxed frame before the module paints,
    # even if the host receives its ready acknowledgement after the animation starts.
    page.add_init_script("""if(window!==top){
      const trace=window.__resultTrace={graph:[],morph:[]};
      let last=null;
      const observer=new MutationObserver(records=>{
        const view=document.querySelector('[data-order-result]');
        if(!view || view.dataset.state!=='saving')return;
        const p=view.querySelector('[data-kind=proposed]'), c=view.querySelector('[data-kind=current]');
        if(!p||!c)return;
        const grow=Number(p.style.getPropertyValue('--grow'));
        const price=el=>Number(el.querySelector('.oq-price-value').textContent.replaceAll(',',''));
        if(last!==grow){trace.graph.push({grow,current:price(c),proposed:price(p),currentReels:c.querySelectorAll('.oq-reel-cell').length,proposedReels:p.querySelectorAll('.oq-reel-cell').length,turn:[...p.querySelectorAll('.oq-reel-face')].some(f=>Number(f.style.opacity)>0&&Number(f.style.opacity)<1)});last=grow;}
      });
      observer.observe(document,{subtree:true,attributes:true,attributeFilter:['style'],childList:true,characterData:true});
    }""")
    screens=ReviewScreens(page,origin,390)
    frame=screens.screen('quote-result','saving')
    view=frame.locator('[data-order-result]')
    proposed=view.locator('.oq-series[data-kind=proposed]')
    expect(proposed.locator('.oq-price-value')).to_have_text('11,940,000')
    graph=view.evaluate('el=>window.__resultTrace.graph')
    assert any(0 < item['grow'] < 1 for item in graph),graph
    animated=[item for item in graph if 0 < item['grow'] < 1]
    assert all(item['current']==12540000 and 0<item['proposed']<11940000 for item in animated),animated
    assert all(item['currentReels']==0 for item in graph),graph
    assert any(item['proposedReels']>0 and item['turn'] for item in animated),animated
    expect(proposed.locator('.oq-price-reel')).to_have_count(0)
    action=view.locator('button[data-action=recompare]')
    material=action.locator('[data-magnetic-material]')
    label=action.locator('[data-magnetic-label]')
    x,y=frame_pointer_position(page,action,{'x':105,'y':25})
    fixed=action.evaluate('b=>JSON.stringify(b.getBoundingClientRect().toJSON())')
    fixed_material=material.evaluate('s=>JSON.stringify(s.getBoundingClientRect().toJSON())')
    page.mouse.move(x,y);expect(action).to_have_attribute('data-magnetic-action','hover')
    # QA c51be820 keeps the button body still while its contents respond to hover.
    # Check the rendered surface as well as the hit target; the previous assertion
    # incorrectly required the rejected material-following-pointer behavior.
    expect(material).to_have_css('transform','none')
    expect(label).not_to_have_css('transform','none')
    assert material.evaluate('s=>JSON.stringify(s.getBoundingClientRect().toJSON())')==fixed_material
    assert action.evaluate('b=>JSON.stringify(b.getBoundingClientRect().toJSON())')==fixed
    page.mouse.down();expect(action).to_have_attribute('data-magnetic-action','pressed')
    expect(material).to_have_css('transform','matrix(0.98, 0, 0, 0.98, 0, 0)')
    assert material.bounding_box()['width']<json.loads(fixed_material)['width']
    expect(action).to_have_css('border-top-color','rgba(0, 0, 0, 0)')
    assert action.evaluate('b=>JSON.stringify(b.getBoundingClientRect().toJSON())')==fixed
    page.mouse.up();expect(view.locator('dialog[open]')).to_have_count(1)
    frame_click(page,view.get_by_role('button',name='닫기'));expect(view.locator('dialog[open]')).to_have_count(0)
    x,y=frame_pointer_position(page,action,{'x':100,'y':28})
    touch=page.context.new_cdp_session(page)
    try:
        touch.send('Emulation.setTouchEmulationEnabled',{'enabled':True})
        touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        expect(action).to_have_attribute('data-magnetic-action','pressed')
        touch.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
        expect(action).to_have_attribute('data-magnetic-action','rest')
        expect(view.locator('dialog[open]')).to_have_count(0)
    finally:
        touch.send('Emulation.setTouchEmulationEnabled',{'enabled':False});touch.detach()
    # The identical graph button grows into the card while the fresh-detail data loads.
    token=proposed.evaluate("el=>{window.__originalGraph=el;return el.getBoundingClientRect().width}")
    frame_click(page,proposed)
    expect(view).to_have_attribute('data-selection','proposed')
    expect(proposed.locator('.oq-card-copy')).to_be_visible()
    expect(proposed.locator('.oq-clock')).to_have_text(re.compile(r'6일 21시간 13분 \d{2}초'))
    assert proposed.evaluate('el=>el===window.__originalGraph')
    expect(proposed).to_have_css('border-top-width','3px')
    assert proposed.bounding_box()['width'] > token+60
    clock=proposed.locator('.oq-clock')
    before=clock.inner_text()
    expect(clock).not_to_have_text(before,timeout=2500)
    remaining=clock.inner_text()
    # Switch by keyboard, so the physically overlapped portion isn't used as a hit target.
    current=view.locator('.oq-series[data-kind=current]')
    current.press('Enter')
    expect(view).to_have_attribute('data-selection','current')
    expect(current.locator('.oq-rate')).to_contain_text('300원')
    view.get_by_role('button',name='상담 예약').wait_for()
    path=os.environ.get('R3_EVIDENCE_DIR')
    if path:
        (Path(path)/'result-motion.json').write_text(json.dumps({
            'environment':'protected QA frame, Chromium, isolated design amounts',
            'currentStaticAndProposedGrowing':animated, 'sameGraphButtonRetained':True,
            'magneticAction':{'stationaryHoverMaterial':True,'responsiveHoverContent':True,
                              'pressedMaterialScale':0.98,'outerBorderTransparent':True,'fixedHitTarget':True},
            'countdownObserved':[before,remaining],'textSwapSelection':'current'
        },ensure_ascii=False,indent=2))


def run(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("q2","empty")
    quote=frame.locator('#order-app-quote')
    quantity,price=quote.locator('[data-line-qty]').first,quote.locator('[data-line-price]').first
    frame_click(page,quote.locator('#q2-next'))
    expect(quote.locator('#err-q2')).to_be_visible()
    quantity.fill('27');quantity.blur()
    price.fill('7300');price.blur()
    frame_click(page,quote.locator('#input-review-open'))
    review=quote.locator('#input-review-dialog')
    expect(review).to_be_visible()
    expect(review.locator('#input-review-rows')).to_contain_text('월 27판')
    expect(review.locator('#input-review-rows')).to_contain_text('포장당 7,300원')
    frame_click(page,review.get_by_role('button',name='월 구매정보 수정',exact=True))
    expect(review).not_to_be_visible()
    expect(quantity).to_have_value('27')
    expect(price).to_have_value(re.compile(r'7,?300'))
    # The regular edit action schedules focus back to the opened accordion.
    # Re-enter the price as a user would: the trusted pointer cancels that
    # pending navigation, then native keys must actually clear the field.
    frame_click(page,price)
    expect(price).to_be_focused()
    price.press('ControlOrMeta+A');price.press('Backspace')
    expect(price).to_have_value('')
    price.press('Tab')
    expect(price).to_have_value('')
    frame_click(page,quote.locator('#input-review-open'))
    expect(review.locator('#input-review-rows')).to_contain_text('포장당 미입력')
    frame_click(page,review.locator('#input-review-back'))
    for state in ['saving','new-detail','current-detail','new-only-detail','equal','current-lower','no-current','expired','recompare','no-result','locked']:
        frame = screens.screen('quote-result',state)
        wrapper=frame.locator('[data-review-result]')
        expect(wrapper).to_have_attribute('data-view',state)
        view=wrapper.locator('[data-order-result]')
        if state=='saving':
            view.evaluate("el=>{window.originalReviewPlot=el.querySelector('.oq-plot')}")
        else:
            assert view.evaluate("el=>window.originalReviewPlot===el.querySelector('.oq-plot')"), (width,state,'preview replaced the live plot')
        check_result(view,state)
        assert '7,300' not in view.inner_text()
        layout=view.evaluate('''el=>{
            const limit=innerWidth;
            const excess=[...document.querySelectorAll('body *')].map(node=>{
                const b=node.getBoundingClientRect();return {tag:node.tagName,cls:typeof node.className==='string'?node.className:'',right:Math.ceil(b.right),left:Math.floor(b.left),width:Math.ceil(b.width)};
            }).filter(b=>b.width && (b.right>limit+1||b.left < -1)).sort((a,b)=>b.right-a.right).slice(0,8);
            return {width:limit,scroll:document.documentElement.scrollWidth,excess};
        }''')
        assert layout['scroll']<=layout['width'],(state,width,layout)
        folder=os.environ.get('R3_EVIDENCE_DIR')
        if folder and width in (390,1440):
            path=Path(folder);path.mkdir(parents=True,exist_ok=True)
            view.screenshot(path=str(path / ('result-'+state+'-'+str(width)+'.png')))
    # The former independent Q2 contract remains explicitly reproducible. Its
    # unknown-price checkbox is not substituted for the regular app's model.
    legacy=PreservedReviewScreens(page,origin,width).screen('q2','empty')
    frame_click(page,legacy.get_by_role('button',name='입력 내용 확인'))
    expect(legacy.locator('[name=qty]')).to_have_attribute('aria-invalid','true')
    frame_click(page,legacy.locator('.journey-check'))
    expect(legacy.locator('[name=unknown]')).to_be_checked()
    expect(legacy.locator('[name=price]')).to_be_disabled()
    frame_click(page,legacy.locator('.journey-check'))
    expect(legacy.locator('[name=price]')).to_be_enabled()
    print('PASS browser: current regular Q2 → input review → edit, 11 current shared result states, preserved authored Q2 validation/unknown toggle and viewport',width,flush=True)
if __name__=='__main__':
    host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        conf=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            for width in (320,390,1440):
                context=browser.new_context(viewport={'width':width,'height':852},reduced_motion='reduce')
                page=context.new_page()
                page.goto(conf['url']+'/ia?view=qa-lab&screen=login%2Fempty%2Femail')
                page.locator('input[name=email]').fill(conf['email'])
                page.locator('input[name=password]').fill(conf['pass'])
                page.locator('button[type=submit]').click()
                page.wait_for_url('**/ia?view=qa-lab**')
                if width==320 and os.environ.get('R3_EVIDENCE_DIR'):
                    capture_reference_viewports(page,os.environ['R3_EVIDENCE_DIR'])
                run(page,conf['url'],width)
                if width==390 and os.environ.get('R3_EVIDENCE_DIR'):
                    page.emulate_media(reduced_motion='no-preference')
                    check_motion(page, conf['url'])
                context.close()
            browser.close()
    finally:
        host.terminate();host.wait(timeout=5)
