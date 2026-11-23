"""Rendered regressions for the scoped login and Order-menu correction."""
from playwright.sync_api import expect
from r3_feedback_browser_support import frame_click, frame_pointer_position


def wordmark_geometry(word):
    geometry = word.evaluate("""node => {
        const r=node.getBoundingClientRect(),s=getComputedStyle(node),text=node.firstChild;
        if(text?.nodeType!==Node.TEXT_NODE||text.textContent!=='Order')throw Error('The original Order text node is missing');
        const range=document.createRange();range.selectNodeContents(text);const letters=range.getBoundingClientRect();
        const dot=node.querySelector('.brand-dot'),d=getComputedStyle(dot),period=dot.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,
            fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,
            authenticated:node.closest('.order-product-brand').dataset.authenticated==='true',
            wordText:{x:letters.x,y:letters.y,width:letters.width,height:letters.height},
            period:{text:dot.textContent,position:d.position,display:d.display,width:period.width,
                opacity:Number(d.opacity),marginInlineStart:d.marginInlineStart}};
    }""")
    period = geometry['period']
    assert period['text'] == '.' and period['display'] == 'inline-block', geometry
    if geometry['authenticated']:
        assert period['position'] == 'absolute' and period['width'] == 0 and period['opacity'] == 0, geometry
    else:
        assert period['position'] == 'static' and period['width'] > 0 and period['opacity'] == 1, geometry
        assert period['marginInlineStart'] == '3px', geometry
    return geometry


def same_wordmark_geometry(before, after):
    # The existing guest period occupies inline space, while the original
    # member animation hides it at width zero. Compare the actual Order text
    # range in both states instead of requiring those two containers to match.
    for key in ('x', 'y', 'height'):
        assert abs(before[key]-after[key]) < .5, {"before": before, "after": after}
    for key in ('x', 'y', 'width', 'height'):
        assert abs(before['wordText'][key]-after['wordText'][key]) < .5, {"before": before, "after": after}
    if before['authenticated'] == after['authenticated']:
        assert abs(before['width']-after['width']) < .5, {"before": before, "after": after}
    for key in ('font', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'):
        assert before[key] == after[key], {"before": before, "after": after}


def check_guest_order(page, frame):
    header = frame.locator('#order-app-header')
    expect(header.locator('.research-order-trigger')).to_be_hidden()
    expect(header.locator('.research-order-arrow')).to_be_hidden()
    expect(header.locator('.research-order-stack')).to_be_hidden()
    word = header.locator('.brand-word')
    assert word.evaluate("node => !node.closest('button,a,[role=button]')"), 'Guest Order must not retain a dropdown trigger'
    frame_click(page, word)
    expect(header.locator('.research-order-stack')).to_be_hidden()
    return wordmark_geometry(word)


def observe_order_arrival(brand):
    """Read rendered frames while the original brand controller authenticates."""
    brand.evaluate("""brand => {
        const word=brand.querySelector('.brand-word'),armed=performance.now();
        const probe={samples:[],done:false,error:null,started:null};
        brand.__loginOrderArrival=probe;
        function sample(now){
            const moving=brand.dataset.accountArrival==='moving';
            if(moving && probe.started===null)probe.started=now;
            if(probe.started!==null){
                const trigger=brand.querySelector('.research-order-trigger'),arrow=trigger?.querySelector('.research-order-arrow');
                const r=arrow?.getBoundingClientRect(),s=arrow&&getComputedStyle(arrow);
                probe.samples.push({elapsed:now-probe.started,moving,
                    attached:!!arrow&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden',
                    opacity:s?Number(s.opacity):0,sameWord:brand.querySelector('.brand-word')===word,
                    unified:!!trigger&&trigger.contains(word)&&trigger.contains(arrow)});
                if(!moving){probe.done=true;return;}
            }
            if(now-armed>6000){probe.error='No completed native member arrival was observed';probe.done=true;return;}
            requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
    }""")


def finish_order_arrival(brand):
    receipt = brand.evaluate("""brand => new Promise(resolve=>{
        function read(){const p=brand.__loginOrderArrival;if(p.done)resolve(p);else requestAnimationFrame(read);}read();
    })""")
    assert receipt['error'] is None, receipt
    moving = [sample for sample in receipt['samples'] if sample['moving']]
    assert len(moving) >= 3 and all(sample['attached'] and sample['unified'] for sample in moving), receipt
    assert all(sample['sameWord'] for sample in receipt['samples']), receipt
    assert any(sample['opacity'] > .1 for sample in moving), receipt
    return receipt


def check_order_panel(page, frame):
    """Exercise both halves of the unified trigger, real keyboard, and outside close."""
    trigger = frame.locator('.research-order-trigger')
    panel = frame.locator('.research-order-stack')
    rows = panel.locator('[data-order-mode]')
    expect(panel).to_be_visible()
    expect(rows).to_have_count(2)
    expect(rows.nth(0)).to_have_text('간편 견적')
    expect(rows.nth(1)).to_have_text('상세 견적')
    expect(panel.locator('header,h1,h2,h3,[aria-checked]')).to_have_count(0)
    expect(panel.locator('.research-order-icon')).to_have_count(2)
    geometry = panel.evaluate("""panel => {
        const r=panel.getBoundingClientRect(),trigger=document.querySelector('.research-order-trigger');
        const word=trigger.querySelector('.brand-word').getBoundingClientRect(),arrow=trigger.querySelector('.research-order-arrow').getBoundingClientRect();
        const rows=[...panel.querySelectorAll('[data-order-mode]')];
        return {width:r.width,arrowGap:arrow.left-word.right,buttonCount:panel.querySelectorAll('button').length,
            iconsBeforeLabels:rows.every(row=>row.firstElementChild?.matches('svg.research-order-icon')),
            noCheckmarks:rows.every(row=>!row.textContent.includes('✓')&&['none','normal'].includes(getComputedStyle(row,'::after').content)),
            unified:trigger.tagName==='BUTTON'&&!!trigger.querySelector('.brand-word')&&!!trigger.querySelector('.research-order-arrow')};
    }""")
    assert 120 <= geometry['width'] <= 200 and 0 <= geometry['arrowGap'] <= 10, geometry
    assert geometry['buttonCount'] == 2 and geometry['iconsBeforeLabels'] and geometry['noCheckmarks'] and geometry['unified'], geometry
    rows.first.press('End')
    expect(rows.last).to_be_focused()
    rows.last.press('Home')
    expect(rows.first).to_be_focused()
    rows.first.press('ArrowDown')
    expect(rows.last).to_be_focused()
    rows.last.press('Escape')
    expect(panel).to_be_hidden()
    expect(trigger).to_be_focused()
    frame_click(page, trigger.locator('.brand-word'))
    expect(panel).to_be_visible()
    rows.first.press('Escape')
    frame_click(page, trigger.locator('.research-order-arrow'))
    expect(panel).to_be_visible()
    frame_click(page, frame.locator('#order-app-page h1').first)
    expect(panel).to_be_hidden()
    return geometry


def check_login_input_layout(page, frame):
    """Use only the supplied QA form and disposable native input values."""
    sheet = frame.locator('.product-auth-sheet')
    email = sheet.locator('[name=email]')
    password = sheet.locator('[name=password]')
    expect(sheet).to_be_visible()
    expect(email).to_have_attribute('inputmode', 'email')
    email.fill('layout.native@example.invalid')
    password.fill('LayoutOnly!2026')
    password.press('Tab')
    geometry = sheet.evaluate("""sheet => {
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
        const field=name=>{const input=sheet.querySelector('[name='+name+']'),shell=input.closest('.input-shell'),caption=shell.querySelector('.float-caption'),s=getComputedStyle(input);
            return {input:rect(input),shell:rect(shell),caption:rect(caption),fontSize:s.fontSize,lineHeight:s.lineHeight,
                paddingTop:parseFloat(s.paddingTop),paddingBottom:parseFloat(s.paddingBottom),paddingLeft:parseFloat(s.paddingLeft),paddingRight:parseFloat(s.paddingRight),
                textTop:input.getBoundingClientRect().top+parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop)};};
        const status=sheet.querySelector('.ui-feedback-sr'),sr=getComputedStyle(status);
        return {email:field('email'),password:field('password'),wrapper:rect(sheet.querySelector('.ui-email-field')),
            status:{...rect(status),position:sr.position,overflow:sr.overflow,clip:sr.clip,clipPath:sr.clipPath,role:status.getAttribute('role')},
            detachedErrors:sheet.querySelectorAll('.research-field-error').length};
    }""")
    for field in (geometry['email'], geometry['password']):
        assert abs(field['shell']['height']-64) < .5, geometry
        assert field['caption']['bottom'] <= field['textTop']+1, geometry
        assert field['input']['x'] >= field['shell']['x'] and field['input']['bottom'] <= field['shell']['bottom']+.5, geometry
    for key in ('height', 'width'):
        assert abs(geometry['email']['input'][key]-geometry['password']['input'][key]) < .5, geometry
        assert abs(geometry['wrapper'][key]-geometry['email']['input'][key]) < .5, geometry
    assert geometry['email']['paddingTop'] == geometry['password']['paddingTop'] == 25, geometry
    assert geometry['email']['paddingLeft'] == geometry['password']['paddingLeft'] == 14, geometry
    for key in ('fontSize', 'lineHeight', 'paddingBottom'):
        assert geometry['email'][key] == geometry['password'][key], geometry
    assert geometry['status']['width'] <= 1 and geometry['status']['height'] <= 1 and geometry['status']['position'] == 'absolute', geometry
    assert geometry['status']['role'] == 'status' and geometry['detachedErrors'] == 0, geometry
    email.fill('layout.native@')
    suggestions = sheet.locator('.ui-email-suggestions')
    expect(suggestions).to_be_visible()
    list_geometry = suggestions.evaluate("""list=>{const r=list.getBoundingClientRect(),shell=list.closest('.input-shell').getBoundingClientRect();return {top:r.top,bottom:shell.bottom,width:r.width,shellWidth:shell.width};}""")
    assert 0 <= list_geometry['top']-list_geometry['bottom'] <= 8, list_geometry
    assert abs(list_geometry['width']-list_geometry['shellWidth']) <= 2, list_geometry
    email.press('ArrowDown')
    email.press('Enter')
    assert email.input_value().startswith('layout.native@') and email.input_value() != 'layout.native@'
    email.fill('invalid-layout-address')
    frame_pointer_position(page, sheet.locator('[data-action=submit-login]'))
    frame_click(page, sheet.locator('[data-action=submit-login]'))
    message = email.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," field ")]').locator('.inline-field-state')
    expect(message).to_be_visible()
    expect(message).to_have_text('이메일 양식을 확인해 주세요.')
    expect(email).to_have_attribute('aria-invalid', 'true')
    expect(message).to_be_hidden(timeout=3500)
    expect(email).to_have_value('invalid-layout-address')
    expect(email).to_have_attribute('aria-invalid', 'true')
    expect(password).to_have_value('LayoutOnly!2026')
    expect(password).to_have_attribute('type', 'password')
    eye = sheet.locator('[data-action=password-visibility]')
    frame_click(page, eye)
    expect(password).to_have_attribute('type', 'text')
    expect(password).to_have_value('LayoutOnly!2026')
    frame_click(page, eye)
    expect(password).to_have_attribute('type', 'password')
    email.fill('layout.native@example.invalid')
    password.press('Tab')
    return {**geometry,'suggestions':list_geometry,'transientErrorRestoresValue':True,'passwordVisibilityPreservesValue':True}
