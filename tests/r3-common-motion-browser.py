"""Real Chromium frames for shared controls; isolated DOM, no network or business writes."""
import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/motion21/common'
OUT.mkdir(parents=True, exist_ok=True)
COMMON = (ROOT / 'src/server/r3-common-motion.mjs').read_text().replace('export function ', 'function ')
CONTROLS = (ROOT / 'src/server/r3-customer-controls.mjs').read_text().replace('export function ', 'function ')
HTML = '''<style>
body{font:16px/1.5 system-ui;margin:16px}button,input{font:inherit;box-sizing:border-box}
#content{position:relative;width:310px}#content h2{font-size:22px;margin:0 0 12px}#content p{margin:0}
#resize{box-sizing:border-box;width:300px;height:100px;overflow:hidden;background:#edf2f8}
#deck{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:342px;margin-top:18px}
#deck article{box-sizing:border-box;border:1px solid #ccd4df;padding:14px;height:180px;background:#f5f7fa;transform-origin:50% 85%}
#deck.deck article{grid-area:1/1;width:342px;transform:translate(calc(var(--depth)*3px),calc(var(--depth)*8px)) rotate(calc(var(--depth)*.7deg))}
#field{width:300px;height:48px;padding:10px;border:1px solid #aab7c8}
#wheel{width:140px;background:#f5f7fa}#wheel button{border:0;background:transparent}
#tags{display:flex;gap:6px}#tags button{border:0;border-radius:12px;padding:4px 12px;background:#e3ebfa}
#dropdown{background:white;border:1px solid #aab7c8;padding:10px;width:200px}
</style><section id="content"><h2>발급 견적의 실제 제목</h2><p>같은 줄바꿈 위치를 보존하는 실제 본문입니다. 두 번째 줄의 폭도 측정합니다.</p></section>
<div id="resize">높이가 달라지는 계정 패널</div>
<div id="deck"><article style="--depth:0">오늘의 견적</article><article style="--depth:1">어제의 견적</article><article style="--depth:2">이전 견적</article></div>
<input id="field" aria-label="입력" value="가"><button id="trigger">선택</button><div id="dropdown" hidden><button>선택 항목</button></div>
<div id="tags"><button>특란 30구</button><button>매장</button></div><button id="switch">알림 수신</button>
<div id="wheel" role="listbox" aria-label="시간">''' + ''.join(f'<button role="option" data-value="{i}">{i}시</button>' for i in range(10, 19)) + '''</div>
<button id="consult">상담 예약</button><section id="panel" aria-label="상담" hidden><h2>상담 내용</h2><input value="입력 보존"><button>저장</button></section>'''


def check_input_motion(page, reduced, report):
    field = page.locator('#field')
    field.scroll_into_view_if_needed()
    field.focus()
    field.press('End')
    # Settle focus scrolling before arming the measurement. Native scroll/select
    # deliberately cancels a mirror, so include those events in its receipt.
    page.evaluate('''async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}''')
    report['inputMotion'] = {}
    for name, key, value, caret, input_type in [('insert', 'x', '가x', 2, 'insertText'), ('delete', 'Backspace', '가', 1, 'deleteContentBackward')]:
        report['lastStep'] = 'native input '+name+' trusted event and painted glyph frames'
        expect(field).to_be_focused()
        page.evaluate('''name=>{
          const input=document.querySelector('#field'),controller=new AbortController(),armed=performance.now();
          const state={name,armed,eventAt:null,done:false,events:[],mutations:[],samples:[],before:{value:input.value,start:input.selectionStart,end:input.selectionEnd,fill:input.style.webkitTextFillColor,caret:input.style.caretColor}};
          window.__inputMotion=state;
          for(const type of ['beforeinput','input','keydown','keyup','select','scroll','blur','visibilitychange'])document.addEventListener(type,e=>{
            state.events.push({type:e.type,t:performance.now()-armed,trusted:e.isTrusted,target:e.target?.id||e.target?.nodeName,inputType:e.inputType||null,value:input.value,start:input.selectionStart,end:input.selectionEnd});
            if(e.type==='input'&&e.target===input&&state.eventAt===null)state.eventAt=performance.now();
          },{capture:true,signal:controller.signal});
          const observer=new MutationObserver(records=>{
            for(const record of records)for(const [type,nodes]of [['added',record.addedNodes],['removed',record.removedNodes]])for(const node of nodes)if(node.nodeType===1&&node.matches('.r3-input-mirror'))state.mutations.push({type,t:performance.now()-armed,text:node.textContent});
          });observer.observe(document.body,{childList:true,subtree:true});
          function sample(time){
            const box=input.getBoundingClientRect(),layers=[...document.querySelectorAll('.r3-input-mirror')];
            state.samples.push({t:time-armed,afterInput:state.eventAt===null?null:time-state.eventAt,mirrorCount:layers.length,value:input.value,start:input.selectionStart,end:input.selectionEnd,ownAnimations:input.getAnimations().length,scrollY,scrollLeft:input.scrollLeft,
              glyphs:layers.flatMap(layer=>[...layer.children].map(g=>{const s=getComputedStyle(g),r=g.getBoundingClientRect();return {text:g.textContent,opacity:Number(s.opacity),translate:s.translate,scale:s.scale,transform:s.transform,x:r.x-box.x,y:r.y-box.y,width:r.width,height:r.height};}))});
            if(state.eventAt!==null&&time-state.eventAt>=450||time-armed>=5000){
              observer.disconnect();controller.abort();state.after={value:input.value,start:input.selectionStart,end:input.selectionEnd,ownAnimations:input.getAnimations().length,fill:input.style.webkitTextFillColor,caret:input.style.caretColor,sameInput:document.querySelector('#field')===input,mirrors:document.querySelectorAll('.r3-input-mirror').length};state.done=true;
            }else requestAnimationFrame(sample);
          }requestAnimationFrame(sample);
        }''', name)
        # The observer and RAF are running before the real keyboard event. A
        # later Playwright polling call cannot miss the mirror's 300ms lifetime.
        page.keyboard.press(key)
        observed = page.evaluate('''async()=>{const state=window.__inputMotion;while(!state.done)await new Promise(requestAnimationFrame);return state;}''')
        report['inputMotion'][name] = observed
        events = [event for event in observed['events'] if event['type'] == 'input']
        assert len(events) == 1 and events[0]['trusted'] and events[0]['target'] == 'field' and events[0]['inputType'] == input_type, observed
        after = observed['after']
        assert (after['value'], after['start'], after['end']) == (value, caret, caret), observed
        assert after['sameInput'] and after['ownAnimations'] == 0 and after['mirrors'] == 0, observed
        assert (after['fill'], after['caret']) == (observed['before']['fill'], observed['before']['caret']), observed
        assert all(sample['ownAnimations'] == 0 for sample in observed['samples']), observed
        if reduced:
            assert not observed['mutations'] and all(sample['mirrorCount'] == 0 for sample in observed['samples']), observed
        else:
            assert any(event['type'] == 'added' for event in observed['mutations']) and any(event['type'] == 'removed' for event in observed['mutations']), observed
            glyphs = [glyph for sample in observed['samples'] for glyph in sample['glyphs'] if glyph['text'] == 'x']
            assert len(glyphs) >= 3 and any(0 < glyph['opacity'] < 1 for glyph in glyphs), observed
            assert len({(glyph['translate'], glyph['scale']) for glyph in glyphs}) >= 3, observed
            assert len({(glyph['y'], glyph['height']) for glyph in glyphs}) >= 3, observed
        if name == 'insert':
            report['input'] = {key:after[key] for key in ['value','start','end','ownAnimations']}


def run(browser, reduced=False):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce' if reduced else 'no-preference')
    page = context.new_page()
    page.set_default_timeout(6000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    name = '390-reduced' if reduced else '390-motion'
    report = {'width': 390, 'reduced': reduced, 'scope': 'shared product controllers in isolated DOM; no business writes', 'lastStep': 'initialize', 'errors': errors}
    try:
        page.set_content(HTML)
        page.add_script_tag(content=COMMON + '\n' + CONTROLS + '''
        window.common=createCommonMotion(window);window.controls=createCustomerControls();
        window.rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
        window.delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        window.frames=async(el,ms)=>{const start=performance.now(),out=[];while(performance.now()-start<ms){await new Promise(requestAnimationFrame);out.push({t:performance.now()-start,...rect(el)});}return out;};
        ''')
        report['lastStep'] = 'skeleton physical Range geometry'
        geometry = page.evaluate('''()=>{
          const content=document.querySelector('#content'),origin=content.getBoundingClientRect(),ranges=[];
          const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);for(let text=walker.nextNode();text;text=walker.nextNode()){const range=document.createRange();range.selectNodeContents(text);for(const r of range.getClientRects())ranges.push({x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height});}
          const skeleton=common.skeleton(content),bars=[...skeleton.layer.children].map(el=>{const r=el.getBoundingClientRect();return {x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};});
          const inlineStyles=[...skeleton.layer.children].map(el=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}));
          const context={devicePixelRatio,fontsStatus:document.fonts.status,font:getComputedStyle(content).font,origin:rect(content)};
          window.__testedSkeleton=skeleton;return {ranges,bars,inlineStyles,context};
        }''')
        report['geometry'] = geometry
        assert len(geometry['bars']) >= 3
        assert geometry['bars'] == geometry['ranges'], geometry
        page.evaluate('window.__testedSkeleton.destroy();delete window.__testedSkeleton')
        report['lastStep'] = 'resize painted-frame reversal'
        resize = page.evaluate('''async()=>{const el=document.querySelector('#resize');common.resize(el,{height:320});await delay(90);const before=rect(el);common.resize(el,{height:100});const after=rect(el);const samples=await frames(el,390);return {before,after,samples};}''')
        report['resize'] = resize
        if not reduced:
            assert 100 < resize['before']['height'] < 320
            assert abs(resize['before']['height']-resize['after']['height']) < 1
            heights = [sample['height'] for sample in resize['samples']]
            assert all(b <= a + .1 for a, b in zip(heights, heights[1:]))
        assert abs(resize['samples'][-1]['height']-100) < 1
        report['lastStep'] = 'deck painted-frame reversal'
        deck = page.evaluate('''async()=>{
          const stage=document.querySelector('#deck'),cards=[...stage.children],layout=controls.deckLayout(stage),before=cards.map(rect);
          layout.update(()=>stage.classList.add('deck'));const first=cards.map(rect);await delay(130);const middle=cards.map(rect);
          layout.update(()=>stage.classList.remove('deck'));const reverseFirst=cards.map(rect),samples=await frames(cards[0],500);return {before,first,middle,reverseFirst,samples,sameNodes:cards.every((card,i)=>stage.children[i]===card),after:cards.map(rect)};
        }''')
        report['deck'] = deck
        assert deck['sameNodes']
        if not reduced:
            for prior, first in zip(deck['before'], deck['first']):
                for key in ['x', 'y', 'width', 'height']:
                    assert abs(prior[key]-first[key]) < 1, ('deck entrance jump', key, prior, first)
            for prior, first in zip(deck['middle'], deck['reverseFirst']):
                for key in ['x', 'y', 'width', 'height']:
                    assert abs(prior[key]-first[key]) < 1, ('deck reversal jump', key, prior, first)
        for prior, final in zip(deck['before'], deck['after']):
            for key in ['x', 'y', 'width', 'height']:
                assert abs(prior[key]-final[key]) < 1
        check_input_motion(page, reduced, report)
        page.locator('#trigger').focus()
        report['lastStep'] = 'dropdown exit and reopen'
        dropdown = page.evaluate('''async()=>{const menu=document.querySelector('#dropdown'),popup=common.dropdown(menu,{trigger:document.querySelector('#trigger')});popup.set(true);await delay(270);popup.set(false);const exit={hidden:menu.hidden,opacity:getComputedStyle(menu).opacity,closing:menu.classList.contains('is-closing')};await delay(60);const middle=getComputedStyle(menu).opacity;popup.set(true);await delay(300);return {exit,middle,reopened:!menu.hidden,finalOpacity:getComputedStyle(menu).opacity};}''')
        report['dropdown'] = dropdown
        assert dropdown['reopened'] and dropdown['finalOpacity'] == '1'
        if not reduced:
            assert not dropdown['exit']['hidden'] and dropdown['exit']['closing']
            assert 0 < float(dropdown['middle']) < 1
        report['lastStep'] = 'tag width collapse'
        tag = page.evaluate('''async()=>{const chip=document.querySelector('#tags button'),before=rect(chip);const removal=common.tagRemove(chip);await delay(80);const middle=rect(chip);await removal;return {before,middle,removed:!chip.isConnected};}''')
        report['tag'] = tag
        assert tag['removed']
        if not reduced:
            assert 0 < tag['middle']['width'] < tag['before']['width']
        report['lastStep'] = 'switch save failure and retry'
        switch = page.evaluate('''async()=>{let reject,resolve,writes=0;const button=document.querySelector('#switch');const state=common.persistedSwitch(button,{save:()=>{writes++;return new Promise((yes,no)=>{resolve=yes;reject=no;});}});const request=state.commit(true);button.click();const pending=button.getAttribute('aria-busy');reject(Error('offline'));await request;const rollback=button.getAttribute('aria-checked');const retry=state.commit(true);resolve({ok:true});await retry;return {pending,rollback,saved:state.value,writes};}''')
        report['switch'] = switch
        assert switch == {'pending': 'true', 'rollback': 'false', 'saved': True, 'writes': 2}
        report['lastStep'] = 'wheel trusted pointer and settle'
        page.evaluate("window.wheel=common.wheel(document.querySelector('#wheel'),{value:10})")
        wheel = page.locator('#wheel')
        wheel.scroll_into_view_if_needed()
        box = wheel.bounding_box()
        page.mouse.move(box['x'] + 70, box['y'] + 110)
        page.mouse.down()
        page.mouse.move(box['x'] + 70, box['y'] + 40, steps=5)
        page.mouse.up()
        page.wait_for_function("Math.abs(Number(document.querySelector('#wheel').dataset.wheelPosition)-Math.round(Number(document.querySelector('#wheel').dataset.wheelPosition)))<.00001")
        wheel_receipt = page.evaluate("({value:wheel.value(),position:wheel.position(),selected:document.querySelectorAll('#wheel [aria-selected=true]').length,transform:document.querySelector('#wheel button').style.transform})")
        report['wheel'] = wheel_receipt
        assert 10 <= int(wheel_receipt['value']) <= 18 and wheel_receipt['selected'] == 1
        assert 'rotateX(' in wheel_receipt['transform'] and 'translateZ(' in wheel_receipt['transform']
        report['lastStep'] = 'panel real frames and Escape restoration'
        panel = page.evaluate('''async()=>{const panel=document.querySelector('#panel'),trigger=document.querySelector('#consult'),input=panel.querySelector('input');trigger.focus();const drawer=common.bottomPanel(panel,{trigger});drawer.set(true);const openSamples=await frames(panel,400);const focusIn=document.activeElement===input;panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await delay(280);return {openSamples,focusIn,focusBack:document.activeElement===trigger,hidden:panel.hidden,sameInput:panel.querySelector('input')===input,value:input.value,scrollUnlocked:document.documentElement.style.overflow===''};}''')
        report['panel'] = panel
        assert panel['focusIn'] and panel['focusBack'] and panel['hidden'] and panel['sameInput'] and panel['scrollUnlocked']
        assert panel['value'] == '입력 보존'
        if not reduced:
            samples = panel['openSamples']
            assert max(s['width'] for s in samples)-min(s['width'] for s in samples) < .1
            assert max(s['height'] for s in samples)-min(s['height'] for s in samples) < .1
            assert all(b['y'] <= a['y']+.1 for a, b in zip(samples, samples[1:]))
        assert not errors, errors
        report['lastStep'] = 'complete'
        (OUT / f'frames-{name}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report
    except Exception as error:
        report['error'] = str(error)
        (OUT / f'partial-{name}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        try:
            page.screenshot(path=OUT / f'failure-{name}.png', full_page=True)
        except Exception:
            pass
        raise
    finally:
        context.close()


if __name__ == '__main__':
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
        try:
            receipt = [run(browser), run(browser, True)]
        finally:
            browser.close()
    (OUT / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print('PASS shared controllers at 390px, normal and reduced motion; RAF receipt saved.')
