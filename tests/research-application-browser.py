"""Actual research routes, regular quote modules and the R1 inspection shell.

No request mocks, injected quote results or production writes. The host uses
throwaway owner credentials and its own in-memory review database.
"""
from pathlib import Path
from urllib.parse import urlsplit
import json
import os
import re
import shutil
import subprocess
from playwright.sync_api import sync_playwright, expect
from browser_predicate_support import wait_for_expression
from r3_feedback_browser_support import frame_click, frame_pointer_position, prepare_frame_pointer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/research-application'


def install_quote_diagnostics(page):
    """Observe original numeric events; never publish edits or replace handlers."""
    page.evaluate(r'''() => {
        const events=[], probeErrors=[], lineKeys=['id','housing','size','pack','qty','price','qtyUnit','qtyDisplayUnit'];
        const pickLine=line=>line && Object.fromEntries(lineKeys.filter(key=>Object.hasOwn(line,key)).map(key=>[key,line[key]]));
        const pickQuote=quote=>quote && ({lines:(quote.lines||[]).map(pickLine),current:quote.current,
            open:quote.open,allocationRevision:quote.allocationRevision,
            locationCount:quote.locations?.length,allocationCount:quote.allocations?.length});
        const element=node=>node && ({tag:node.tagName,id:node.id,type:node.getAttribute?.('type'),
            step:node.getAttribute?.('data-open'),connected:node.isConnected,hidden:node.hidden,inert:node.inert});
        function sample(){
            const app=window.ORDER_RESEARCH_APP, snapshot=app?.snapshot(), line=snapshot?.quote?.lines?.[0];
            return {route:snapshot?.route && Object.fromEntries(['screen','state','variant','mode','kind'].map(key=>[key,snapshot.route[key]])),
                build:snapshot?.build,quote:pickQuote(snapshot?.quote),
                originalLine:line && pickLine(window.OrderValidationState?.line?.(line.id)),
                fields:[...document.querySelectorAll('#order-app-quote [data-line-qty],#order-app-quote [data-line-price]')].map(node=>({
                    ...element(node),field:node.hasAttribute('data-line-qty')?'qty':'price',value:node.value,
                    numericState:node.dataset.numericState,disabled:node.disabled,readOnly:node.readOnly})),
                activeElement:element(document.activeElement)};
        }
        function observe(event){
            const node=event.target?.closest?.('#order-app-quote [data-line-qty],#order-app-quote [data-line-price],#order-app-quote .accordion-trigger[data-open]');
            if(!node)return;
            try{
                events.push({type:event.type,phase:event.eventPhase,key:event.type==='keydown'?event.key:undefined,
                    inputType:event.inputType,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented,
                    numeric:event.orderNumeric && Object.fromEntries(['valid','value','accepted','phase','reason'].filter(key=>Object.hasOwn(event.orderNumeric,key)).map(key=>[key,event.orderNumeric[key]])),
                    ...sample()});
                if(events.length>40)events.shift();
            }catch(error){probeErrors.push(String(error));if(probeErrors.length>5)probeErrors.shift();}
        }
        for(const type of ['beforeinput','input','change','keydown','focusin','focusout','click']){
            document.addEventListener(type,observe,true);window.addEventListener(type,observe);
        }
        window.__researchQuoteDiagnostic={sample,pickQuote,element,events,probeErrors};
    }''')


def capture_quote_diagnostics(page):
    """Read only quote fields and layout; omit credentials, contacts and tokens."""
    return page.evaluate(r'''async () => {
        const probe=window.__researchQuoteDiagnostic;
        if(!probe)return {available:false};
        const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        const layout=node=>{const css=getComputedStyle(node);return {...probe.element(node),rect:rect(node),
            display:css.display,visibility:css.visibility,opacity:css.opacity,filter:css.filter,
            backdropFilter:css.backdropFilter,pointerEvents:css.pointerEvents,position:css.position,
            overflow:css.overflow,scrollTop:node.scrollTop,scrollHeight:node.scrollHeight};};
        const report={available:true,...probe.sample(),events:probe.events,probeErrors:probe.probeErrors,
            viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,
                visual:visualViewport && {width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}},
            layout:['#order-single','#order-app-quote','[data-research-quote]','#app','#page-form','#section-q2','#q2-lines']
                .flatMap(selector=>[...document.querySelectorAll(selector)].map(node=>({selector,...layout(node)}))),
            dialogs:[...document.querySelectorAll('dialog')].map(node=>({...layout(node),open:node.open,
                modal:node.matches(':modal'),backdropFilter:getComputedStyle(node,'::backdrop').backdropFilter})),
            storage:[...document.querySelectorAll('[data-research-quote]')].map(node=>({pending:node.dataset.storagePending,status:node.dataset.storageStatus}))};
        try{
            const mode=report.route?.mode;
            if(['simple','detailed'].includes(mode)){
                let timer;
                const stored=await Promise.race([window.ORDER_RESEARCH_APP.repository.read(mode),
                    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Diagnostic storage read timed out')),1000);})]).finally(()=>clearTimeout(timer));
                report.stored={ok:stored.ok,status:stored.status,mode:stored.mode,revision:stored.revision,
                    schemaVersion:stored.schemaVersion,source:stored.source,data:probe.pickQuote(stored.data)};
            }
        }catch(error){report.storedError=String(error);}
        return report;
    }''')


def price_snapshot(surface):
    """Read the original workspace model through its application owner."""
    return surface.locator('#order-app-pricing').evaluate('''root => {
        const control=window.ORDER_RESEARCH_APP.priceWorkspace;
        if(!control || root.priceWorkspaceQa?.workspace!==control.workspace)throw Error('PRICE_WORKSPACE_OWNER');
        return control.snapshot();
    }''')


def remember_review_application(page):
    page.evaluate('''() => {
        const frame=document.querySelector('#frame'), doc=frame.contentDocument;
        window.__researchScopeBefore={frame,doc,app:frame.contentWindow.ORDER_RESEARCH_APP,
            header:doc.querySelector('#order-app-header'),brand:doc.querySelector('.order-product-brand svg')};
    }''')


def same_review_application(page, frame):
    assert page.evaluate('''() => {
        const before=window.__researchScopeBefore, frame=document.querySelector('#frame'), doc=frame.contentDocument;
        return frame===before.frame && doc===before.doc && frame.contentWindow.ORDER_RESEARCH_APP===before.app &&
            doc.querySelector('#order-app-header')===before.header && doc.querySelector('.order-product-brand svg')===before.brand;
    }'''), 'MVP routes must retain the same review iframe, application document and common header'
    expect(frame.locator('#order-single')).to_have_count(1)
    expect(frame.locator('#order-app-header')).to_have_count(1)
    expect(frame.locator('.order-product-brand')).to_have_count(1)
    expect(frame.locator('iframe')).to_have_count(0)


def ready_review_route(page, frame, screen, state):
    expect(frame.locator('html')).to_have_attribute('data-product-screen', screen, timeout=30000)
    expect(frame.locator('html')).to_have_attribute('data-product-state', state, timeout=30000)
    expect(page.locator('#focus-unit')).to_have_attribute('data-module', screen, timeout=30000)
    expect(page.locator('#focus-unit')).to_have_attribute('data-state', state, timeout=30000)
    expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
    same_review_application(page, frame)


def measured_badge(dot):
    return dot.evaluate('''node => {
        const r=node.getBoundingClientRect(), css=getComputedStyle(node);
        const range=document.createRange();range.selectNodeContents(node);
        const text=range.getBoundingClientRect(), row=node.closest('.obm-row')?.getBoundingClientRect();
        return {text:node.textContent,width:r.width,height:r.height,
            textCenterOffset:text.y+text.height/2-r.y-r.height/2,
            rowCenterOffset:row?r.y+r.height/2-row.y-row.height/2:null,
            alignItems:css.alignItems,justifyContent:css.justifyContent,borderRadius:css.borderRadius};
    }''')


def measured_arrow_hover(page, control, direction):
    """Use the real pointer and sample the rendered transition without clicks."""
    page.mouse.move(250, 140)
    arrow=control.locator('.order-arrow-direction')
    expect(arrow).to_have_attribute('data-direction', direction)
    x,y=frame_pointer_position(page, control)
    control.evaluate('''control => {
        const node=control.querySelector('.order-arrow-direction');
        const chevron=node.querySelector('.t-learn-chevron'),top=node.querySelector('.t-learn-arm-top');
        const probe={samples:[],started:false};
        probe.done=new Promise(resolve=>{probe.resolve=resolve;});control.__researchHoverProbe=probe;
        control.addEventListener('pointerenter',event=>{
            probe.started=true;probe.trusted=event.isTrusted;const start=performance.now();
            const sample=()=>{
                const c=getComputedStyle(chevron),a=getComputedStyle(top),m=new DOMMatrixReadOnly(c.transform);
                probe.samples.push({elapsed:performance.now()-start,x:m.m41,arm:a.transform,duration:c.transitionDuration});
                if(performance.now()-start<430)requestAnimationFrame(sample);
                else probe.resolve({trusted:probe.trusted,samples:probe.samples});
            };sample();
        },{once:true});
    }''')
    page.mouse.move(x,y)
    observed=control.evaluate('''async control => {
        const probe=control.__researchHoverProbe;
        if(!probe?.started)throw Error('The real pointer did not enter the observed control');
        return probe.done;
    }''')
    assert observed['trusted'], 'The hover receipt must come from native pointer input'
    samples=observed['samples']
    assert abs(samples[-1]['x']-2)<0.02, samples[-1]
    assert any(0<sample['x']<1.98 for sample in samples), 'Native hover must animate through intermediate positions'
    assert samples[-1]['arm']!='none', samples[-1]
    return {'direction':direction,**observed}


def review_target_snapshot(page):
    """Observe the acknowledged target, including its inspector identity."""
    return page.evaluate('''() => {
        const frame=document.querySelector('#frame'), root=frame.contentDocument.querySelector('#order-single');
        const inspection=root.__orderResearchInspector.inspect();
        return {url:location.href,caption:document.querySelector('#caption').textContent,
            width:document.querySelector('#width').value,version:document.querySelector('#version').value,
            session:inspection.session,routeRevision:inspection.routeRevision,pendingRoute:inspection.pendingRoute};
    }''')


def choose_review_route(page, frame, screen, state):
    """Select the exact QA row through its existing search and navigation UI."""
    page.locator('#catalog-search').fill(screen + '/' + state + '/email')
    page.locator('#catalog button[data-module="' + screen + '"]').click()
    ready_review_route(page, frame, screen, state)


def check_detailed_q3_actions(page, frame):
    """Measure the retained 390px product with two actual fixture locations."""
    choose_review_route(page, frame, 'q4', 'mixed')
    quote = frame.locator('#order-app-quote')
    expect(quote.locator('[data-research-quote]')).to_have_attribute('data-research-quote', 'detailed')
    frame_click(page, quote.locator('.accordion-trigger[data-open="q3"]'))
    sites = quote.locator('#q3-sites .q3-site-accordion')
    expect(sites).to_have_count(2)
    site = sites.first
    summary = site.locator(':scope > .accordion-trigger')
    if summary.get_attribute('aria-expanded') != 'true':
        frame_click(page, summary)
    expect(summary).to_have_attribute('aria-expanded', 'true')
    address = site.locator('.q3-address-row')
    edit = address.locator('[data-site-edit]')
    delete = address.locator('[data-site-delete]')
    if not delete.is_visible():
        frame_click(page, address.locator('[data-saved-actions-toggle]'))
    copy = site.locator('.q3-contact-grid [data-contact-copy]')
    expect(edit).to_have_accessible_name(re.compile('수정'))
    expect(edit).to_have_css('text-indent', '0px')
    for action in [edit, delete, copy]:
        expect(action).to_be_visible()

    address.scroll_into_view_if_needed()
    geometry = site.evaluate("""site => {
        const box = selector => {
            const r=site.querySelector(selector).getBoundingClientRect();
            return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
        };
        const addressValue = site.querySelector('[data-q3-summary-value="address"]');
        const valueRect = addressValue.getBoundingClientRect();
        const hit=site.ownerDocument.elementFromPoint(valueRect.left+2, valueRect.top+valueRect.height/2);
        return {viewport:innerWidth, addressEditTarget:!!hit?.closest('[data-site-edit]'),
            address:box('.q3-address-row'), edit:box('[data-site-edit]'),
            delete:box('[data-site-delete]'), email:box('[data-q3-summary-field="email"]'),
            contacts:box('.q3-contact-grid'), copy:box('[data-contact-copy]')};
    }""")
    assert geometry['viewport'] == 390, geometry
    assert geometry['addressEditTarget'], geometry
    assert 0 <= geometry['address']['right'] - geometry['delete']['right'] <= 1, geometry
    assert geometry['edit']['right'] <= geometry['delete']['left'] + 1, geometry
    assert geometry['address']['bottom'] <= geometry['contacts']['top'] + 1, geometry
    assert geometry['email']['bottom'] <= geometry['copy']['top'] + 1, geometry
    assert abs(geometry['contacts']['left'] - geometry['copy']['left']) <= 1, geometry
    for action in ['edit', 'delete', 'copy']:
        rect = geometry[action]
        assert 0 <= rect['left'] < rect['right'] <= geometry['viewport'] + 1, geometry

    site.screenshot(path=str(OUT / 'q3-detailed-site-actions-390.png'))
    model = quote.evaluate('() => JSON.stringify(ORDER_RESEARCH_APP.snapshot().quote.locations)')
    assert len(json.loads(model)) == 2
    for name, trigger, dialog_id, cancel in [
            ('copy', copy, 'q3-contact-copy', '[data-copy-cancel]'),
            ('edit', edit, 'site-editor-dialog', '#cancel-site'),
            ('delete', delete, 'q3-action-confirm', '[data-q3-confirm-cancel]')]:
        if name == 'delete' and not delete.is_visible():
            frame_click(page, address.locator('[data-saved-actions-toggle]'))
        frame_click(page, trigger)
        dialog = frame.locator('#' + dialog_id)
        expect(dialog).to_be_visible()
        assert dialog.evaluate("node => node.open && node.matches(':modal')"), name
        if name == 'copy':
            expect(dialog.locator('[data-contact-copy-target]')).to_have_count(1)
        frame_click(page, dialog.locator(cancel))
        expect(dialog).to_be_hidden()
        assert quote.evaluate('() => JSON.stringify(ORDER_RESEARCH_APP.snapshot().quote.locations)') == model, name
    return {'commentId': '86fd2971-843f-4444-8fb8-5e689f26ff8e',
            'legacySource': 'q3/open/email/390', 'mode': 'detailed', 'siteCount': 2,
            'fixtureOrigin': 'q4/mixed with the product Q3 accordion', 'geometry': geometry,
            'trustedOpenAndCancel': ['copy','edit','delete'], 'siteDataPreserved': True,
            'screenshot': 'q3-detailed-site-actions-390.png'}


def remember_review_quote(frame):
    """Observe the original quote document and model before hiding its owner."""
    return frame.locator('#order-app-quote').evaluate('''root => {
        window.__researchQuoteBoundary={root,content:root.querySelector('[data-research-quote]'),
            app:root.querySelector('#app'),review:root.querySelector('#input-review-dialog')};
        if(!window.__researchQuoteBoundary.content || !window.__researchQuoteBoundary.app)
            throw Error('QUOTE_BOUNDARY_OWNER');
        return ORDER_RESEARCH_APP.snapshot().quote;
    }''')


def same_review_quote(frame, snapshot):
    assert frame.locator('#order-app-quote').evaluate('''root => {
        const before=window.__researchQuoteBoundary;
        return root===before.root && root.querySelector('[data-research-quote]')===before.content &&
            root.querySelector('#app')===before.app && root.querySelector('#input-review-dialog')===before.review;
    }'''), 'Leaving the quote must retain its original workspace document'
    assert frame.locator('#order-single').evaluate('() => ORDER_RESEARCH_APP.snapshot().quote') == snapshot


def assert_no_hidden_modal(frame):
    hidden = frame.locator('dialog[open]').evaluate_all('''dialogs => dialogs.flatMap(dialog => {
        if(!dialog.matches(':modal'))return [];
        const hidden=[];
        for(let owner=dialog;owner;owner=owner.parentElement){
            const style=getComputedStyle(owner);
            if(owner.hidden || owner.inert || style.display==='none' || ['hidden','collapse'].includes(style.visibility))
                hidden.push(owner.id||owner.localName);
        }
        return hidden.length?[{id:dialog.id,hidden}]:[];
    })''')
    assert not hidden, 'A hidden native modal still blocks the application: ' + json.dumps(hidden)


def pick_native_modal_note(page, frame, dialog, heading, text):
    """Pick a real product heading through the veil while its native modal stays open."""
    page.locator('#points').click()
    page.locator('#general').click()
    page.locator('#body-text').fill(text)
    before = page.evaluate('window.__researchModalPoints.length')
    page.locator('#reposition').click()
    veil = frame.locator('#r3-veil')
    expect(veil).to_be_visible()
    assert dialog.evaluate("dialog => dialog.open && dialog.matches(':modal')")
    heading.element_handle().wait_for_element_state('stable')
    point = heading.evaluate('''heading => {
        const target=heading.getBoundingClientRect(),veil=document.getElementById('r3-veil').getBoundingClientRect();
        return {x:target.left+target.width/2-veil.left,y:target.top+target.height/2-veil.top};
    }''')
    # Physical input must hit the real annotation surface above the modal.
    # Do not dismiss the modal, lower the veil, or synthesize the point message.
    frame_click(page, veil, position=point)
    wait_for_expression(page, 'window.__researchModalPoints.length===' + str(before + 1))
    expect(page.locator('#drawer')).to_be_visible()
    expect(page.locator('#point-state')).to_have_text('위치 지정됨')
    expect(page.locator('#body-text')).to_have_value(text)
    expect(veil).to_be_hidden()
    assert dialog.evaluate("dialog => dialog.open && dialog.matches(':modal')")
    anchor = page.evaluate('window.__researchModalPoints.at(-1)')
    session = review_target_snapshot(page)['session']
    assert re.fullmatch(r'a-[a-z0-9]+', anchor['id']), 'A modal heading must resolve to a product element, not the screen fallback'
    assert anchor['instance'] == session['screen'] and anchor['artifactHash'] == session['artifact']
    assert anchor.get('mode', 'simple') == session.get('mode', 'simple')
    assert all(0 <= anchor[key] <= 1 for key in ('x', 'y')) and anchor['layers']
    expect(frame.locator('.approval-draft-pin')).to_be_visible()
    assert heading.evaluate('''heading => {
        const target=heading.getBoundingClientRect(),marker=document.querySelector('.approval-draft-pin').getBoundingClientRect();
        const x=marker.left+marker.width/2,y=marker.top+marker.height/2;
        return x>=target.left-2 && x<=target.right+2 && y>=target.top-2 && y<=target.bottom+2;
    }'''), 'The draft marker must remain at the picked modal heading after returning to the comment'
    return anchor


def capture_product_scope_diagnostics(page):
    """Read app ownership/layout only; omit account fields and private payloads."""
    return page.evaluate('''() => {
        const frame=document.querySelector('#frame');
        let win=window, doc=document;
        if(frame){if(!frame.contentDocument)return {available:false,opaque:true};win=frame.contentWindow;doc=frame.contentDocument;}
        const app=win.ORDER_RESEARCH_APP;if(!app)return {available:false};
        const price=app.priceWorkspace?.snapshot(), box=node=>{
            const r=node.getBoundingClientRect(),css=win.getComputedStyle(node);
            return {id:node.id,hidden:node.hidden,inert:node.inert,display:css.display,filter:css.filter,
                pointerEvents:css.pointerEvents,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
        };
        return {available:true,build:app.build,route:app.snapshot().route,
            frame:frame && {inert:frame.inert,src:frame.getAttribute('src')},
            headerCount:doc.querySelectorAll('#order-app-header').length,
            price:price && {state:price.state,scenario:price.scenario,source:price.source,model:price.model,
                ready:price.ready,error:price.error,pendingRequests:price.pendingRequests,pendingWrites:price.pendingWrites,
                transportMode:price.transportMode,disposed:price.disposed},
            layout:['#order-app-header','#order-app-page','#order-app-quote','#order-app-pricing','#pw-main','#pw-nav']
                .flatMap(selector=>[...doc.querySelectorAll(selector)].map(node=>({selector,...box(node)}))),
            dialogs:[...doc.querySelectorAll('dialog')].map(node=>({...box(node),open:node.open,
                modal:node.matches(':modal'),hiddenOwner:node.closest('[hidden]')?.id||null})),
            annotations:[...doc.querySelectorAll('#r3-veil,#r3-pins,.approval-draft-pin')].map(node=>({...box(node),
                parent:node.parentElement?.id,modalOwner:node.closest('dialog[open]')?.id||null,
                popoverOpen:node.matches(':popover-open')})),
            activeElement:{id:doc.activeElement?.id,tag:doc.activeElement?.tagName},
            appStatus:doc.querySelector('#order-app-status')?.textContent,
            priceStatus:doc.querySelector('#pw-notice')?.textContent};
    }''')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    log = (OUT / 'host.stderr.log').open('w')
    host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=log, text=True)
    driver = browser = None
    errors, console_errors, failed, aborted, review_writes, outside_writes = [], [], [], [], [], []
    operating_writes, price_api_requests = [], []
    receipt = {'status': 'RUNNING', 'commercialAcceptance': False, 'checks': []}
    cfg, phase = {}, 'owner-login'

    def safe(value):
        text = str(value)
        for key in ('email', 'pass'):
            if cfg.get(key):
                text = text.replace(cfg[key], '[throwaway-owner]')
        return text

    def response_received(response):
        if response.status >= 400:
            failed.append({'phase': phase, 'status': response.status,
                           'path': safe(response.url.removeprefix(cfg['url'])),
                           'resource': response.request.resource_type})

    def request_sent(request):
        path = urlsplit(request.url).path
        if path.startswith('/api/ia/r3-price'):
            price_api_requests.append({'method': request.method, 'path': path})
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return
        if path == '/api/ia/r3-qa/records':
            review_writes.append({'method': request.method, 'path': path})
        if path.startswith('/api/') and not path.startswith(('/api/ia/auth/', '/api/ia/r3-qa/')):
            operating_writes.append({'method': request.method, 'path': path})
        if urlsplit(request.url).netloc != urlsplit(cfg['url']).netloc:
            outside_writes.append({'method': request.method, 'url': safe(request.url)})

    def observe(page):
        page.on('pageerror', lambda error: errors.append({'phase': phase, 'message': safe(error)}))
        page.on('console', lambda message: console_errors.append(
            {'phase': phase, 'text': safe(message.text), 'location': message.location}
        ) if message.type == 'error' else None)
        page.on('response', response_received)
        page.on('request', request_sent)
        page.on('requestfailed', lambda request: aborted.append(
            {'phase': phase, 'path': safe(request.url.removeprefix(cfg['url'])),
             'resource': request.resource_type, 'error': safe(request.failure)}))

    def same_app(page):
        assert page.evaluate('''document.querySelector('#order-app-header')===__researchHeader &&
            document.querySelector('.order-product-brand svg')===__researchBrand &&
            ORDER_RESEARCH_APP.instance===__researchInstance''')
        assert page.locator('#order-single').count() == 1
        assert page.locator('#order-app-header').count() == 1
        assert page.locator('iframe').count() == 0

    try:
        line = host.stdout.readline()
        if not line:
            raise RuntimeError('Browser host did not start; see host.stderr.log')
        cfg = json.loads(line)
        assert re.fullmatch(r'http://127\.0\.0\.1:\d+', cfg['url'])
        driver = sync_playwright().start()
        browser = driver.chromium.launch(
            executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'),
            args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        context.on('page', observe)
        page = context.new_page()
        page.goto(cfg['url'] + '/ia?view=research-r3&screen=onboarding&state=guest-2')
        page.locator('input[name=email]').fill(cfg['email'])
        page.locator('input[name=password]').fill(cfg['pass'])
        page.locator('#submit').click()
        page.wait_for_url('**/ia?view=research-r3**')
        phase = 'standalone'
        wait_for_expression(page, '!!window.ORDER_RESEARCH_APP', timeout=30000)
        expect(page.locator('#order-app-page .ob')).to_be_visible(timeout=30000)
        page.evaluate('''window.__researchHeader=document.querySelector('#order-app-header');
            window.__researchBrand=document.querySelector('.order-product-brand svg');
            window.__researchInstance=ORDER_RESEARCH_APP.instance;''')
        try:
            install_quote_diagnostics(page)
        except Exception as diagnostic_error:
            receipt.setdefault('diagnosticErrors', []).append(safe(diagnostic_error))
        same_app(page)
        receipt['checks'].append('standalone application runs without a QA parent')
        page.screenshot(path=str(OUT / 'onboarding-390.png'), full_page=True)

        # Use the original onboarding controls, then the common app auth button.
        page.locator('#order-app-page [data-mf-intro="3"]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.state==="guest-3"')
        same_app(page)
        page.locator('#order-app-header [data-app-auth]').click()
        expect(page.locator('.product-auth-sheet')).to_be_visible()
        expect(page.locator('#order-app-page .ob')).to_be_visible()
        assert page.locator('#order-app-page .auth-background').count() == 0
        same_app(page)
        page.keyboard.press('Escape')
        expect(page.locator('.product-auth-sheet')).not_to_be_visible()
        receipt['checks'].append('authentication uses the real retained parent and common header')

        page.locator('#order-app-page [data-mf-intro="4"]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.state==="guest-4"')
        page.locator('#order-app-page [data-mf-go="simple-r3/"]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.screen==="q1"')
        expect(page.locator('#order-app-quote #app')).to_be_visible(timeout=30000)
        same_app(page)
        assert len(context.pages) == 1
        assert urlsplit(page.url).path == '/ia' and 'view=research-r3' in page.url
        receipt['checks'].append('the real onboarding quote action stays inside the same application document')

        # Actual regular controls, writes and snapshots; no scenario hydration.
        quote = page.locator('#order-app-quote')
        expect(quote.locator('#page-form')).to_have_css('filter', 'none')
        for field, value in [('housing', '1'), ('size', '대란'), ('pack', '30')]:
            quote.locator(f'[data-pick="{field}"][data-value="{value}"]:visible').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().quote?.lines?.[0]?.pack==="30"')
        # The original initial-SKU commit already advances to Q2. Toggling its
        # header here would close the real input owner before native typing.
        expect(quote.locator('.accordion-trigger[data-open="q2"]')).to_have_attribute('aria-expanded', 'true')
        expect(quote.locator('#body-q2 > *').first).to_have_js_property('inert', False)
        expect(quote.locator('[data-line-qty]')).to_be_visible()
        quote.locator('[data-line-qty]').fill('10')
        expect(quote.locator('[data-line-qty]')).to_be_focused()
        quote.locator('[data-line-price]').fill('5000')
        expect(quote.locator('[data-line-price]')).to_be_focused()
        quote.locator('[data-line-price]').press('Tab')
        wait_for_expression(page, '''(()=>{const line=ORDER_RESEARCH_APP.snapshot().quote?.lines?.[0];
            return line?.qty==='10' && line?.price==='5000';})()''')
        line = page.evaluate('ORDER_RESEARCH_APP.snapshot().quote.lines[0]')
        quote.locator('.accordion-trigger[data-open="q3"]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.screen==="q3"')
        quote.locator('.accordion-trigger[data-open="q2"]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.screen==="q2"')
        expect(quote.locator('[data-line-qty]')).to_have_value('10')
        expect(quote.locator('[data-line-price]')).to_have_value(re.compile(r'5,?000'))
        assert page.evaluate('ORDER_RESEARCH_APP.snapshot().quote.lines[0].id') == line['id']
        same_app(page)
        receipt['checks'].append('Q1→Q2→Q3→Q2 retains one regular quote model and the original line identity')

        quote.locator('#quote-mode-switch').click()
        modal = quote.locator('#quote-mode-dialog[open]')
        expect(modal).to_be_visible()
        expect(modal.locator('[data-mode-option]')).not_to_be_checked()
        modal.locator('label').click()
        expect(modal.locator('[data-mode-option]')).to_be_checked()
        modal.locator('[data-mode-confirm]').click()
        wait_for_expression(page, 'ORDER_RESEARCH_APP.snapshot().route.mode==="detailed"')
        wait_for_expression(page, '''(()=>{const line=ORDER_RESEARCH_APP.snapshot().quote?.lines?.[0];
            return line?.qty==='10' && line?.price==='5000';})()''')
        same_app(page)
        quote.locator('.accordion-trigger[data-open="q3"]').click()
        quote.locator('#add-site').click()
        expect(quote.locator('#site-editor-dialog')).to_be_visible()
        assert page.evaluate('''(()=>{const phone=document.querySelector('#site-contact-phone'),
            email=document.querySelector('#site-email');return Boolean(phone && email &&
            window.OrderPhone?.instance(phone) && window.OrderEmailUI?.instance(email));})()''')
        quote.locator('#cancel-site').click()
        expect(quote.locator('#site-editor-dialog')).not_to_be_visible()
        receipt['checks'].append('explicit mode copy retains regular quote values and Q3 mounts the existing contact controllers')
        page.screenshot(path=str(OUT / 'quote-390.png'), full_page=True)
        page.reload()
        wait_for_expression(page, '''window.ORDER_RESEARCH_APP && (()=>{const value=ORDER_RESEARCH_APP.snapshot();
            return value.route.mode==='detailed' && value.quote?.lines?.[0]?.qty==='10' && value.quote.lines[0].price==='5000';})()''', timeout=30000)
        receipt['checks'].append('the regular draft survives an actual research-app reload')

        # Server-only immutable assets must not become a public HTTP endpoint.
        build = page.evaluate('ORDER_RESEARCH_APP.build')
        private = context.request.get(cfg['url'] + '/ia/research-releases/' + build + '.json.gz')
        assert private.status == 404
        receipt['checks'].append('private release packs remain unavailable over HTTP')

        phase = 'qa-shell'
        prepare_frame_pointer(page)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.goto(cfg['url'] + '/ia?view=qa-lab&screen=onboarding%2Fguest-2%2Femail&width=390')
        wait_for_expression(page, 'document.querySelector("#frame")?.src.includes("view=research-r3")', timeout=30000)
        frame = page.frame_locator('#frame')
        frame.locator('#r3-veil').wait_for(state='attached', timeout=30000)
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        frame.locator('#order-single').evaluate('''()=>{window.__researchHeader=document.querySelector('#order-app-header');
            window.__researchInstance=ORDER_RESEARCH_APP.instance;}''')
        frame.locator('#order-app-page [data-mf-intro="3"]').click()
        expect(page.locator('#state-buttons [data-state="guest-3"]')).to_have_attribute('aria-pressed', 'true', timeout=30000)
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        page.locator('#state-buttons [data-state="guest-4"]').click()
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        expect(frame.locator('#order-app-page [data-mf-go="simple-r3/"]')).to_be_visible()
        assert frame.locator('#order-single').evaluate('''()=>ORDER_RESEARCH_APP.instance===__researchInstance &&
            document.querySelector('#order-app-header')===__researchHeader''')
        assert frame.locator('#order-single').count() == 1
        receipt['checks'].append('R1 observes app navigation and selects scenarios without replacing the running app')

        # Real mouse picking preserves an unsaved comment; no opinion is posted.
        page.locator('#points').click()
        expect(page.locator('#drawer')).to_be_visible()
        page.locator('#general').click()
        page.locator('#body-text').fill('브라우저 회귀 검사 · 저장하지 않는 위치 초안')
        page.locator('#reposition').click()
        expect(frame.locator('#r3-veil')).to_be_visible()
        frame.locator('#r3-veil').click(position={'x': 100, 'y': 160})
        expect(page.locator('#drawer')).to_be_visible()
        expect(page.locator('#body-text')).to_have_value('브라우저 회귀 검사 · 저장하지 않는 위치 초안')
        expect(page.locator('#point-state')).to_have_text('위치 지정됨')
        page.locator('#close-drawer').click()
        receipt['checks'].append('drawer location picking returns to the same unsaved text without creating a QA record')
        page.screenshot(path=str(OUT / 'qa-shell-1440.png'), full_page=True)

        # Exercise the new member paths through native Chrome input. The QA
        # controls select existing scenarios; no test changes fixture records,
        # invokes app.navigate, dispatches a click, or relaxes a native barrier.
        phase = 'qa-member-header-and-order'
        remember_review_application(page)
        choose_review_route(page, frame, 'onboarding', 'member-1')
        header = frame.locator('#order-app-header')
        account_trigger = header.locator('[data-order-account-trigger]')
        order_trigger = header.locator('.research-order-trigger')
        expect(header.locator('[data-app-auth]')).to_be_hidden()
        expect(frame.locator('[data-order-account-trigger]:visible')).to_have_count(1)
        expect(account_trigger).to_be_enabled()
        expect(order_trigger).to_be_visible()
        expect(header).to_have_js_property('inert', False)
        appearance={}
        quick_dot=frame.locator('#order-app-page .quick-unread .t-badge-dot')
        expect(quick_dot).to_be_visible()
        appearance['quickBadge']=measured_badge(quick_dot)
        quick=appearance['quickBadge']
        assert quick['text'].isdigit() and int(quick['text'])>0, quick
        assert abs(quick['height']-20)<0.5 and abs(quick['width']-quick['height'])<0.5, quick
        assert abs(quick['textCenterOffset'])<=2.5, quick
        page.screenshot(path=str(OUT / 'member-header-1440.png'), full_page=True)

        frame_click(page, account_trigger)
        ready_review_route(page, frame, 'profile', 'menu')
        expect(frame.locator('.obm-panel')).to_be_visible()
        assert frame.locator('.obm-panel').evaluate('''panel =>
            panel.getBoundingClientRect().top >=
            document.querySelector('#order-app-header').getBoundingClientRect().bottom
        '''), 'The native account popover must leave the retained header controls reachable'
        appearance['accountSurface']=frame.locator('.obm-panel').evaluate('''panel => {
            const surface=panel.querySelector('.obm-surface'),menu=panel.querySelector('.obm-menu');
            const s=getComputedStyle(surface),m=getComputedStyle(menu),p=getComputedStyle(panel);
            const trigger=document.querySelector('[data-order-account-trigger]'),t=getComputedStyle(trigger);
            return {surfaceShadow:s.boxShadow,menuBackground:m.backgroundColor,menuShadow:m.boxShadow,
                menuBorder:m.borderWidth,panelBorder:p.borderWidth,triggerBackground:t.backgroundColor,
                triggerShadow:t.boxShadow,triggerBorder:t.borderWidth};
        }''')
        surface=appearance['accountSurface']
        assert surface['menuBackground']=='rgb(255, 255, 255)' and surface['menuBorder']=='0px' and surface['panelBorder']=='0px', surface
        assert surface['surfaceShadow']!='none' and surface['menuShadow']=='none', surface
        assert surface['triggerBackground']=='rgba(0, 0, 0, 0)' and surface['triggerShadow']=='none' and surface['triggerBorder']=='0px', surface
        account_dot=frame.locator('.obm-panel [data-obm-item="notifications"] .t-badge-dot')
        appearance['accountBadge']=measured_badge(account_dot)
        badge=appearance['accountBadge']
        assert abs(badge['height']-20)<0.5 and abs(badge['width']-badge['height'])<0.5, badge
        assert abs(badge['textCenterOffset'])<=2.5 and abs(badge['rowCenterOffset'])<=0.5, badge
        page.emulate_media(reduced_motion='no-preference')
        appearance['rightHover']=measured_arrow_hover(page, frame.locator('.obm-panel [data-obm-item="profile"]'), 'right')
        expect(frame.locator('.obm-panel [data-obm-item="profile"]')).to_have_css('background-color','rgb(243, 244, 246)')
        page.screenshot(path=str(OUT / 'member-account-surface-1440.png'), full_page=True)
        page.emulate_media(reduced_motion='reduce')
        # One physical click must complete the account close and Order open.
        frame_click(page, order_trigger)
        expect(frame.locator('.research-order-stack')).to_be_visible()
        expect(order_trigger).to_have_attribute('aria-expanded', 'true')
        expect(frame.locator('.obm-panel')).to_be_hidden()
        ready_review_route(page, frame, 'onboarding', 'member-1')
        page.screenshot(path=str(OUT / 'member-account-to-order-1440.png'), full_page=True)
        frame.locator('.research-order-stack').press('Escape')
        expect(frame.locator('.research-order-stack')).to_be_hidden()
        receipt['checks'].append('the member header has one visible account opener; one trusted Order-selector click closes the account stack and opens Order')

        phase = 'qa-company-sheet-to-account'
        frame_click(page, frame.locator('#order-app-page [data-company-open]'))
        expect(frame.locator('.ob-shade')).to_be_visible()
        expect(header).to_have_js_property('inert', True)
        page.screenshot(path=str(OUT / 'company-sheet-1440.png'), full_page=True)
        # A parent QA control remains usable while the product header is inert.
        # The product itself must release its sheet before the next page opens.
        choose_review_route(page, frame, 'q1', 'before')
        expect(frame.locator('#order-app-quote #app')).to_be_visible()
        expect(header).to_have_js_property('inert', False)
        expect(frame.locator('.ob-shade')).to_have_count(0)
        expect(account_trigger).to_be_enabled()
        frame_click(page, account_trigger)
        ready_review_route(page, frame, 'profile', 'menu')
        expect(frame.locator('.obm-panel')).to_be_visible()
        assert_no_hidden_modal(frame)
        page.screenshot(path=str(OUT / 'company-to-quote-account-1440.png'), full_page=True)

        # Also cover the retained introduction -> account path, where the
        # onboarding controller stays mounted and must resume its shared brand.
        choose_review_route(page, frame, 'onboarding', 'member-1')
        frame_click(page, frame.locator('#order-app-page [data-company-open]'))
        expect(header).to_have_js_property('inert', True)
        choose_review_route(page, frame, 'profile', 'menu')
        expect(header).to_have_js_property('inert', False)
        expect(frame.locator('.ob-shade')).to_be_hidden()
        expect(frame.locator('.obm-panel')).to_be_visible()
        same_review_application(page, frame)
        receipt['checks'].append('leaving the open company sheet releases the header and shared account controller for quote navigation and a retained-parent account panel')

        phase = 'qa-notification-preview-to-full'
        frame_click(page, frame.locator('.obm-panel [data-obm-item="notifications"]'))
        ready_review_route(page, frame, 'profile', 'notification')
        preview = frame.locator('.research-notifications[data-notifications-mode="preview"]')
        expect(preview.locator('[data-action="research-all-notifications"]')).to_be_visible()
        messages = frame.locator('#order-single').evaluate('''async () => {
            const response=await ORDER_RESEARCH_APP.adapter.request('/notifications');
            return response.items.map(({id,title,body,createdAt,readAt})=>({id,title,body,createdAt,readAt}));
        }''')
        assert messages, 'The original member scenario must supply actual notification records'
        expect(preview.locator('[data-notification-id]')).to_have_count(min(3, len(messages)))
        assert preview.locator('time').evaluate_all('nodes => nodes.every(time => time.dateTime && time.title.startsWith("발송 "))')
        back=frame.locator('.obm-panel [data-obm-page="notifications"] .obm-back')
        appearance['backHeading']=back.evaluate('''button => {
            const b=button.getBoundingClientRect(),h=button.parentElement.querySelector('.obm-heading').getBoundingClientRect(),s=getComputedStyle(button);
            return {centerOffset:b.y+b.height/2-h.y-h.height/2,background:s.backgroundColor,border:s.borderWidth,shadow:s.boxShadow,radius:s.borderRadius};
        }''')
        alignment=appearance['backHeading']
        assert abs(alignment['centerOffset'])<=0.5, alignment
        assert alignment['background']=='rgba(0, 0, 0, 0)' and alignment['border']=='0px' and alignment['shadow']=='none' and alignment['radius']=='0px', alignment
        page.emulate_media(reduced_motion='no-preference')
        appearance['leftHover']=measured_arrow_hover(page, back, 'left')
        page.screenshot(path=str(OUT / 'notifications-preview-1440.png'), full_page=True)
        page.emulate_media(reduced_motion='reduce')
        receipt['memberAppearance']=appearance
        receipt['checks'].append('native 390px layout has circular centered unread badges, one borderless white account surface with an unclipped resting shadow, aligned plain Back and measured real-pointer left/right hover motion')
        frame_click(page, preview.locator('[data-action="research-all-notifications"]'))
        ready_review_route(page, frame, 'notifications', 'list')
        full = frame.locator('#order-app-page .research-notifications[data-notifications-mode="full"]')
        expect(full.locator('h1')).to_have_text('알림')
        expect(full.locator('[data-notification-id]')).to_have_count(min(20, len(messages)))
        expect(frame.locator('.obm-panel')).to_be_hidden()
        expect(full.locator('[data-notification-preferences]')).to_be_visible()
        page.screenshot(path=str(OUT / 'notifications-full-1440.png'), full_page=True)

        phase = 'qa-notification-detail-and-settings'
        unread = full.locator('[data-notification-id][data-read="false"]').first
        expect(unread).to_be_visible()
        notification_id = unread.get_attribute('data-notification-id')
        message = next(item for item in messages if item['id'] == notification_id)
        frame_click(page, unread)
        detail = full.locator('[data-notification-detail]')
        expect(detail).to_have_attribute('data-notification-detail', notification_id)
        expect(detail.locator('.research-notification-body')).to_have_text(message['body'])
        expect(detail.locator('time')).to_have_attribute('title', re.compile(r'^발송 '))
        expect(detail).not_to_have_attribute('aria-busy', 'true')
        readback = frame.locator('#order-single').evaluate('''async (root, id) => {
            const response=await root.ownerDocument.defaultView.ORDER_RESEARCH_APP.adapter.request('/notifications');
            return response.items.find(item=>item.id===id) || null;
        }''', notification_id)
        assert readback and readback['id'] == notification_id, notification_id
        assert readback['readAt'] and readback['createdAt'] == message['createdAt'], readback
        page.screenshot(path=str(OUT / 'notification-detail-1440.png'), full_page=True)
        frame_click(page, full.locator('[data-action="research-notification-back"]'))
        expect(full.locator('[data-notification-detail]')).to_have_count(0)
        expect(full.locator('[data-notification-id="' + notification_id + '"]')).to_have_attribute('data-read', 'true')

        preferences = full.locator('[data-notification-preferences]')
        frame_click(page, preferences.locator('summary'))
        expect(preferences).to_have_js_property('open', True)
        expect(preferences.locator('fieldset')).to_be_visible()
        expect(preferences.locator('fieldset')).to_be_enabled()
        before_preferences = frame.locator('#order-single').evaluate('() => ORDER_RESEARCH_APP.adapter.request("/notification-preferences")')
        price_preference = preferences.locator('[data-notification-preference="price"]')
        frame_click(page, price_preference)
        expect(preferences.locator('[role="status"]')).to_have_text('수신 설정을 저장했어요.')
        after_preferences = frame.locator('#order-single').evaluate('() => ORDER_RESEARCH_APP.adapter.request("/notification-preferences")')
        assert after_preferences['revision'] == before_preferences['revision'] + 1
        assert after_preferences['preferences'] == {**before_preferences['preferences'], 'price': not before_preferences['preferences']['price']}
        assert after_preferences['updatedAt']
        expect(preferences).to_contain_text('웹 푸시 발송은 아직 연결되지 않았어요.')
        same_review_application(page, frame)
        assert_no_hidden_modal(frame)
        page.screenshot(path=str(OUT / 'notification-preferences-1440.png'), full_page=True)
        receipt['checks'].append('trusted notification clicks open the three-item preview, full reader, actual message and consent settings; read and consent acknowledgements stay in the existing research fixture')
        receipt['nativeMemberInteractions'] = {
            'viewport': {'host': 1440, 'researchFrame': 390},
            'singleAccountOpener': True, 'oneClickAccountToOrder': True,
            'companyToQuoteAccountUsable': True, 'companyToRetainedAccountUsable': True,
            'notificationCount': len(messages), 'openedNotificationId': notification_id,
            'readAcknowledged': True, 'preferenceRevision': after_preferences['revision'],
            'trustedPointerReceipts': True, 'fixtureRecordsInjected': False,
            'commercialAcceptance': False,
        }

        # The remaining MVP product families use this same running app. Their
        # canonical phase metadata and explicit QA scenarios remain separate.
        phase = 'qa-product-scope'
        catalog_response = page.evaluate('''async () => {
            const response=await fetch('/api/ia/r3-qa/artifact',{credentials:'same-origin'});
            return {status:response.status,body:await response.json()};
        }''')
        assert catalog_response['status'] == 200, catalog_response
        catalog = catalog_response['body']['items']
        campaigns = [row for row in catalog if row['screen'] == 'admin-campaigns']
        pricing = [row for row in catalog if row['screen'] == 'price-workspace']
        campaign_states = ['normal', 'more', 'reviewing', 'approved', 'denied']
        price_states = ['costs', 'store-products', 'consumer-products', 'classification',
                        'delivery', 'loading', 'error', 'empty', 'guest']
        assert len(campaigns) == 5 and {row['state'] for row in campaigns} == set(campaign_states)
        assert all(row['application'] is True and row['phase'] == 'future' for row in campaigns)
        assert len(pricing) == 9 and {row['state'] for row in pricing} == set(price_states)
        assert all(row['application'] is True for row in pricing)
        # The first pricing mount can fail before it has any document. An
        # ordinary return must retry that same product owner without treating
        # the forced QA provider error as a successful load.
        phase = 'qa-pricing-initial-error'
        page.goto(cfg['url'] + '/ia?view=qa-lab&screen=price-workspace/error/email&width=1280')
        wait_for_expression(page, 'document.querySelector("#frame")?.src.includes("view=research-r3")', timeout=30000)
        frame = page.frame_locator('#frame')
        frame.locator('#r3-veil').wait_for(state='attached', timeout=30000)
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        remember_review_application(page)
        ready_review_route(page, frame, 'price-workspace', 'error')
        expect(frame.locator('#pw-notice')).to_contain_text('저장소에 연결하지 못했습니다')
        initial_error = price_snapshot(frame)
        assert initial_error['document'] is None and initial_error['error'] == 'SERVICE_UNAVAILABLE'
        frame.locator('#order-app-pricing').evaluate('''root => {
            const control=window.ORDER_RESEARCH_APP.priceWorkspace;
            window.__failedPriceOwner={control,workspace:control.workspace,transport:control.transport};
        }''')
        calls_before_retry = frame.locator('#order-app-pricing').evaluate("() => ORDER_RESEARCH_APP.priceWorkspace.transport.inspect().calls.length")
        assert frame.locator('#order-single').evaluate("() => ORDER_RESEARCH_APP.navigate({screen:'admin-campaigns',state:'normal'})")
        ready_review_route(page, frame, 'admin-campaigns', 'normal')
        campaign_target = review_target_snapshot(page)
        assert frame.locator('#order-single').evaluate("() => ORDER_RESEARCH_APP.navigate({screen:'price-workspace',state:'costs'})") is False
        ready_review_route(page, frame, 'admin-campaigns', 'normal')
        assert review_target_snapshot(page) == campaign_target
        retried = price_snapshot(frame)
        assert retried['document'] is None and retried['error'] == 'SERVICE_UNAVAILABLE'
        assert frame.locator('#order-app-pricing').evaluate('''root => {
            const before=window.__failedPriceOwner,control=window.ORDER_RESEARCH_APP.priceWorkspace;
            return control===before.control && control.workspace===before.workspace && control.transport===before.transport;
        }''')
        assert frame.locator('#order-app-pricing').evaluate("() => ORDER_RESEARCH_APP.priceWorkspace.transport.inspect().calls.length") > calls_before_retry
        page.locator('.lab-role-filter [data-role="all"]').click()
        page.locator('#catalog-search').fill('price-workspace')
        page.locator('#catalog button[data-module="price-workspace"]').click()
        ready_review_route(page, frame, 'price-workspace', 'costs')
        expect(frame.locator('[data-cost="raw"]').first).to_be_visible()
        assert price_snapshot(frame)['ready'] is True
        receipt['checks'].append('initial price provider failure retries on ordinary return without false success; explicit QA recovery keeps the same app and header')

        phase = 'qa-product-scope'
        page.locator('.lab-role-filter [data-role="all"]').click()
        page.locator('#catalog-search').fill('admin-campaigns')
        page.locator('#catalog button[data-module="admin-campaigns"]').click()
        ready_review_route(page, frame, 'admin-campaigns', 'normal')
        for state in campaign_states:
            page.locator('#state-buttons [data-state="' + state + '"]').click()
            ready_review_route(page, frame, 'admin-campaigns', state)
            expect(frame.locator('#order-app-page')).to_contain_text('공동구매 실적심사')
            if state == 'denied':
                expect(frame.locator('#order-app-page')).to_contain_text('접근 권한이 없어요')
            else:
                expect(frame.locator('#order-app-page [data-action="approve-performance"]')).to_be_visible()
        receipt['checks'].append('all five MVP campaign states retain one app and header without rewriting their future-phase metadata')

        phase = 'qa-pricing-draft'
        page.locator('#catalog-search').fill('price-workspace')
        page.locator('#catalog button[data-module="price-workspace"]').click()
        ready_review_route(page, frame, 'price-workspace', 'costs')
        page.locator('#state-buttons [data-state="store-products"]').click()
        ready_review_route(page, frame, 'price-workspace', 'store-products')
        expect(frame.locator('#price-workspace-app')).to_have_attribute('data-workspace-storage', 'qa-memory')
        expect(frame.locator('[data-sales-product]')).to_have_count(160)
        price_root = frame.locator('#order-app-pricing')
        price_root.evaluate('''root => {
            const control=window.ORDER_RESEARCH_APP.priceWorkspace;
            window.__researchPriceOwner={root,control,workspace:control.workspace,transport:control.transport};
        }''')
        product = frame.locator('.pw-product-table tbody tr').filter(has=frame.get_by_text('1번 왕란 30구', exact=True))
        price_input = product.locator('[data-product-price]')
        product_id = price_input.get_attribute('data-product-price')
        price_input.fill('8123')
        expect(price_input).to_have_value('8123')
        frame.locator('#pw-nav [data-section="costs"][aria-current]').click()
        ready_review_route(page, frame, 'price-workspace', 'costs')
        frame.locator('[data-shell="2"]').click()
        expect(frame.locator('[data-shell="2"]')).to_have_attribute('aria-pressed', 'true')
        raw_input = frame.locator('[data-cost="raw"]').first
        row_id, grade_id = raw_input.get_attribute('data-row-id'), raw_input.get_attribute('data-grade-id')
        raw_input.fill('6200')
        packing_input = frame.locator('[data-cost="packing"][data-row-id="' + row_id + '"][data-grade-id="' + grade_id + '"]')
        packing_input.fill('145')
        expect(raw_input).to_have_value('6200')
        expect(packing_input).to_have_value('145')
        frame.locator('#pw-nav [data-section="classification"]').click()
        ready_review_route(page, frame, 'price-workspace', 'classification')
        frame.locator('[data-class-tab="fees"]').click()
        expect(frame.locator('[data-class-tab="fees"]')).to_have_attribute('aria-pressed', 'true')
        draft = price_snapshot(frame)
        assert draft['source'] == 'canonical-price-workspace' and draft['transportMode'] == 'qa-memory'
        assert draft['model']['dirty'] is True and draft['model']['section'] == 'classification'
        assert next(row for row in draft['document']['products'] if row['id'] == product_id)['price'] == '8123'
        cost = next(row for row in draft['document']['costs']['2'] if row['id'] == row_id)['prices'][grade_id]
        assert cost['raw'] == '6200' and cost['packing'] == '145'

        # Normal application navigation must not hydrate a new QA fixture.
        # The route seam opens the actual shared auth sheet; Escape is native.
        assert frame.locator('#order-single').evaluate("() => ORDER_RESEARCH_APP.navigate({screen:'login',state:'empty'})")
        ready_review_route(page, frame, 'login', 'empty')
        expect(frame.locator('.product-auth-sheet')).to_be_visible()
        expect(price_root).to_be_visible()
        frame.locator('.product-auth-sheet [name="email"]:visible').press('Escape')
        expect(frame.locator('.product-auth-sheet')).not_to_be_visible()
        ready_review_route(page, frame, 'price-workspace', 'classification')
        assert price_snapshot(frame)['document'] == draft['document']

        assert frame.locator('#order-single').evaluate("() => ORDER_RESEARCH_APP.navigate({screen:'admin-campaigns',state:'normal'})")
        ready_review_route(page, frame, 'admin-campaigns', 'normal')
        expect(price_root).to_be_hidden()
        frame.locator('#order-app-page [data-action="more"]').click()
        ready_review_route(page, frame, 'admin-campaigns', 'more')
        frame.locator('#order-app-page [data-action="approve-performance"]').click()
        expect(frame.locator('#order-app-status')).to_contain_text('연결된 서비스의 응답을 확인하지 못했어요')
        ready_review_route(page, frame, 'admin-campaigns', 'more')
        assert frame.locator('#order-single').evaluate("() => ORDER_RESEARCH_APP.navigate({screen:'price-workspace',state:'classification'})")
        ready_review_route(page, frame, 'price-workspace', 'classification')
        expect(price_root).to_be_visible()
        expect(frame.locator('[data-class-tab="fees"]')).to_have_attribute('aria-pressed', 'true')
        expect(frame.locator('[data-shell="2"]')).to_have_attribute('aria-pressed', 'true')
        retained = price_snapshot(frame)
        assert retained['document'] == draft['document'] and retained['model'] == draft['model']
        assert price_root.evaluate('''root => {
            const saved=window.__researchPriceOwner, control=window.ORDER_RESEARCH_APP.priceWorkspace;
            return root===saved.root && control===saved.control && control.workspace===saved.workspace && control.transport===saved.transport;
        }''')
        assert len(context.pages) == 1
        receipt['checks'].append('original price and cost edits, menu and model survive auth and campaign return in the same application')

        # The QA shell may ask for another scenario, but it may not silently
        # replace a dirty original document or leave its frame inert on refusal.
        phase = 'qa-pricing-scenario-boundary'
        dirty_target = review_target_snapshot(page)
        page.locator('#state-buttons [data-state="empty"]').click()
        expect(frame.locator('#order-app-status')).to_contain_text('미저장 변경을 먼저 저장하거나 되돌려 주세요')
        ready_review_route(page, frame, 'price-workspace', 'classification')
        expect(page.locator('#state-buttons [data-state="classification"]')).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('#points')).to_be_enabled()
        expect(frame.locator('[data-class-tab="fees"]')).to_have_attribute('aria-pressed', 'true')
        refused = price_snapshot(frame)
        assert refused['document'] == draft['document'] and refused['model'] == draft['model']
        assert refused['state'] == retained['state'] and refused['scenario'] == retained['scenario']
        assert review_target_snapshot(page) == dirty_target
        # A different catalog family is also a QA scenario change. Ordinary
        # app navigation above may retain this draft; QA fixture replacement
        # must refuse it and restore the exact previous review target.
        page.locator('#catalog-search').fill('admin-campaigns')
        page.locator('#catalog button[data-module="admin-campaigns"]').click()
        ready_review_route(page, frame, 'price-workspace', 'classification')
        expect(page.locator('#live')).to_contain_text('현재 화면과 입력은 유지됩니다')
        assert review_target_snapshot(page) == dirty_target
        assert price_snapshot(frame)['document'] == draft['document']
        assert price_snapshot(frame)['model'] == draft['model']
        page.locator('#catalog-search').fill('price-workspace')
        # Exercise the recovered inspector, leaving no review record behind.
        page.locator('#new').click()
        expect(frame.locator('#r3-veil')).to_be_visible()
        frame.locator('#r3-veil').press('Escape')
        expect(frame.locator('#r3-veil')).to_be_hidden()
        expect(page.locator('#new')).to_have_attribute('aria-pressed', 'false')
        expect(page.locator('#drawer')).to_be_visible()
        page.locator('#close-drawer').click()
        expect(page.locator('#drawer')).to_be_hidden()

        frame.locator('#price-workspace-app [data-action="draft"]').click()
        expect(frame.locator('#pw-notice')).to_contain_text('임시저장했습니다')
        saved = price_snapshot(frame)
        assert saved['model']['dirty'] is False and saved['model']['revision'] == 1
        assert saved['transportMode'] == 'qa-memory' and saved['pendingWrites'] == 0
        assert next(row for row in saved['document']['products'] if row['id'] == product_id)['price'] == '8123'
        saved_cost = next(row for row in saved['document']['costs']['2'] if row['id'] == row_id)['prices'][grade_id]
        assert saved_cost['raw'] == '6200' and saved_cost['packing'] == '145'
        page.locator('#state-buttons [data-state="empty"]').click()
        ready_review_route(page, frame, 'price-workspace', 'empty')
        expect(frame.locator('[data-sales-product]')).to_have_count(160)
        assert frame.locator('[data-product-price]').evaluate_all("nodes => nodes.every(node => node.value==='')")
        assert price_snapshot(frame)['model']['revision'] == 0
        receipt['checks'].append('dirty QA state and cross-family selections restore caption, URL, source target and inspector; original memory-only draft save permits explicit reset')

        for state in price_states:
            page.locator('#state-buttons [data-state="' + state + '"]').click()
            ready_review_route(page, frame, 'price-workspace', state)
            if state == 'loading':
                expect(frame.locator('#pw-main')).to_contain_text('불러오는 중')
                expect(frame.locator('#pw-main')).to_have_js_property('inert', True)
            elif state == 'error':
                expect(frame.locator('#pw-notice')).to_contain_text('저장소에 연결하지 못했습니다')
            elif state == 'guest':
                expect(frame.locator('#pw-notice')).to_contain_text('계정 권한을 확인해 주세요')
                expect(frame.locator('#pw-login')).to_have_count(0)
            elif state in ('store-products', 'consumer-products', 'empty'):
                expect(frame.locator('[data-sales-product]')).to_have_count(160)
                if state == 'empty':
                    assert frame.locator('[data-product-price]').evaluate_all("nodes => nodes.every(node => node.value==='')")
            assert price_snapshot(frame)['transportMode'] == 'qa-memory'
        receipt['checks'].append('all nine price QA scenarios keep the same app document and header with local canonical transport')
        receipt['productScope'] = {'campaignStates': campaign_states, 'campaignPhase': 'future',
                                  'priceStates': price_states, 'sameApplicationDocument': True,
                                  'retainedDraft': {'productId': product_id, 'price': '8123', 'shell': '2',
                                                    'rowId': row_id, 'gradeId': grade_id, 'raw': '6200', 'packing': '145',
                                                    'section': 'classification', 'classTab': 'fees'},
                                  'qaDraftRevision': saved['model']['revision'], 'commercialAcceptance': False}
        page.screenshot(path=str(OUT / 'product-scope-1440.png'), full_page=True)

        # A retained native dialog can block the entire child document even
        # when its quote section is hidden and the QA frame itself is usable.
        # Start from the actual QA review scenario and use physical clicks to
        # exercise the next owner; never close the dialog from the test.
        phase = 'qa-quote-modal-boundary'
        prepare_frame_pointer(page)
        page.goto(cfg['url'] + '/ia?view=qa-lab&screen=quote-review/normal/email&width=390')
        frame = page.frame_locator('#frame')
        frame.locator('#r3-veil').wait_for(state='attached', timeout=30000)
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        remember_review_application(page)
        ready_review_route(page, frame, 'quote-review', 'normal')
        page.locator('.lab-role-filter [data-role="all"]').click()
        page.evaluate('''() => {
            window.__researchQuoteBoundaryErrors=[];
            window.addEventListener('message',event=>{
                const frame=document.querySelector('#frame'),message=event.data;
                if(event.source===frame?.contentWindow && event.origin===location.origin &&
                    message?.scope==='ORDER_R3_FRAME' && message.type==='researchError')
                    window.__researchQuoteBoundaryErrors.push(message.payload);
            });
        }''')
        read_only_targets = [('onboarding', 'guest-2'), ('admin-campaigns', 'normal'),
                             ('price-workspace', 'costs')]
        for index, (screen, state) in enumerate(read_only_targets):
            phase = 'qa-quote-modal-to-' + screen
            if index:
                choose_review_route(page, frame, 'quote-review', 'normal')
            review = frame.locator('#order-app-quote #input-review-dialog')
            expect(review).to_be_visible()
            expect(review).to_have_js_property('open', True)
            assert review.evaluate("dialog => dialog.matches(':modal')"), 'The regression requires a native top-layer modal'
            snapshot = remember_review_quote(frame)
            assert snapshot['lines'], 'The retained quote must have its real scenario model'

            choose_review_route(page, frame, screen, state)
            expect(frame.locator('#order-app-quote')).to_be_hidden()
            expect(review).to_have_js_property('open', False)
            expect(frame.locator('dialog:modal')).to_have_count(0)
            assert_no_hidden_modal(frame)
            same_review_quote(frame, snapshot)

            if screen == 'onboarding':
                frame_click(page, frame.locator('#order-app-page [data-mf-intro="3"]'))
                ready_review_route(page, frame, 'onboarding', 'guest-3')
                frame_click(page, frame.locator('#order-app-header [data-app-auth]'))
                ready_review_route(page, frame, 'signup', 'empty')
                expect(frame.locator('.product-auth-sheet')).to_be_visible()
                frame.locator('.product-auth-sheet [name="email"]:visible').press('Escape')
                expect(frame.locator('.product-auth-sheet')).not_to_be_visible()
                ready_review_route(page, frame, 'onboarding', 'guest-3')
                same_review_quote(frame, snapshot)
                assert_no_hidden_modal(frame)

                page.locator('#points').click()
                page.locator('#general').click()
                draft_text = '견적 검토 모달 전환 후 위치 선택 · 저장하지 않는 초안'
                page.locator('#body-text').fill(draft_text)
                page.locator('#reposition').click()
                veil = frame.locator('#r3-veil')
                expect(veil).to_be_visible()
                frame_click(page, veil, position={'x': 100, 'y': 160})
                expect(page.locator('#point-state')).to_have_text('위치 지정됨')
                expect(page.locator('#body-text')).to_have_value(draft_text)
                expect(veil).to_be_hidden()
                page.locator('#close-drawer').click()
                expect(page.locator('#drawer')).to_be_hidden()
            elif screen == 'admin-campaigns':
                frame_click(page, frame.locator('#order-app-page [data-action="more"]'))
                ready_review_route(page, frame, 'admin-campaigns', 'more')
            else:
                frame_click(page, frame.locator('#pw-nav [data-section="products"]'))
                ready_review_route(page, frame, 'price-workspace', 'store-products')
                expect(frame.locator('[data-sales-product]')).to_have_count(160)
            same_review_quote(frame, snapshot)
            assert_no_hidden_modal(frame)
        receipt['checks'].append('QA quote review releases its native modal before onboarding, campaign and pricing; original quote survives and trusted app/header/pin clicks work')

        # The exception is only for read-only input review. A different open
        # canonical dialog must retain its local choice and reject QA routing,
        # including another quote stage and an authentication overlay.
        phase = 'qa-quote-confirm-boundary'
        choose_review_route(page, frame, 'q2', 'filled')
        frame_click(page, frame.locator('#order-app-quote #quote-mode-switch'))
        confirm = frame.locator('#order-app-quote #quote-mode-dialog')
        expect(confirm).to_be_visible()
        assert confirm.evaluate("dialog => dialog.matches(':modal')")
        frame_click(page, confirm.locator('label'))
        expect(confirm.locator('[data-mode-option]')).to_be_checked()
        snapshot = remember_review_quote(frame)
        confirmed_target = review_target_snapshot(page)
        blocked_targets = [('q1', 'before'), ('login', 'empty'), ('onboarding', 'guest-2')]
        for screen, state in blocked_targets:
            rejected_before = page.evaluate('window.__researchQuoteBoundaryErrors.length')
            page.locator('#catalog-search').fill(screen + '/' + state + '/email')
            page.locator('#catalog button[data-module="' + screen + '"]').click()
            wait_for_expression(page, 'window.__researchQuoteBoundaryErrors.length===' + str(rejected_before + 1))
            assert page.evaluate('window.__researchQuoteBoundaryErrors.at(-1).code') == 'INSPECTION_NAVIGATION_CANCELLED'
            ready_review_route(page, frame, 'q2', 'filled')
            assert review_target_snapshot(page) == confirmed_target
            expect(confirm).to_be_visible()
            expect(confirm.locator('[data-mode-option]')).to_be_checked()
            assert confirm.evaluate("dialog => dialog.open && dialog.matches(':modal')")
            expect(frame.locator('.product-auth-sheet')).not_to_be_visible()
            same_review_quote(frame, snapshot)
            assert_no_hidden_modal(frame)
        frame_click(page, confirm.locator('[data-mode-cancel]'))
        expect(confirm).to_have_js_property('open', False)
        choose_review_route(page, frame, 'onboarding', 'guest-2')
        same_review_quote(frame, snapshot)
        frame_click(page, frame.locator('#order-app-page [data-mf-intro="3"]'))
        ready_review_route(page, frame, 'onboarding', 'guest-3')
        assert_no_hidden_modal(frame)

        # Completing that confirmation is legitimate navigation. The original
        # save/copy flow must finish and retire its own native modal before the
        # retained app changes mode; the guard must not block its success.
        phase = 'qa-quote-mode-confirm-success'
        choose_review_route(page, frame, 'q2', 'filled')
        assert frame.locator('#order-single').evaluate('() => ORDER_RESEARCH_APP.snapshot().route.mode') == 'simple'
        read_simple_draft = '''async () => {
            const {ok,status,data,revision,versionToken,hasInput}=await ORDER_RESEARCH_APP.repository.read('simple');
            return {ok,status,data,revision,versionToken,hasInput};
        }'''
        stored_simple_before = frame.locator('#order-single').evaluate(read_simple_draft)
        assert stored_simple_before['ok'] and stored_simple_before['hasInput'], 'The earlier ordinary simple draft must still exist'
        frame_click(page, frame.locator('#order-app-quote #quote-mode-switch'))
        confirm = frame.locator('#order-app-quote #quote-mode-dialog')
        expect(confirm).to_be_visible()
        expect(confirm.locator('[data-mode-option]')).not_to_be_checked()
        assert confirm.evaluate("dialog => dialog.open && dialog.matches(':modal')")
        original_confirmation = confirm.element_handle()
        frame_click(page, confirm.locator('[data-mode-confirm]'))
        expect(frame.locator('#order-app-quote [data-research-quote]')).to_have_attribute('data-research-quote', 'detailed', timeout=30000)
        ready_review_route(page, frame, 'q1', 'before')
        assert frame.locator('#order-single').evaluate('() => ORDER_RESEARCH_APP.snapshot().route.mode') == 'detailed'
        assert original_confirmation.evaluate("dialog => !dialog.open && !dialog.matches(':modal')"), 'The confirmed original dialog must release its native top-layer entry'
        expect(frame.locator('dialog:modal')).to_have_count(0)
        assert_no_hidden_modal(frame)
        # QA fixtures have their own storage scope. This comparison protects
        # the ordinary simple draft rather than treating a QA reset as a save.
        assert frame.locator('#order-single').evaluate(read_simple_draft) == stored_simple_before
        receipt['checks'].append('an open quote confirmation rejects unrelated QA navigation, cancel restores trusted clicks, and an actual successful confirmation closes its native modal before changing to detailed mode')
        receipt['quoteModalBoundary'] = {'readOnlyReviewTargets': read_only_targets,
                                        'blockedConfirmationTargets': blocked_targets,
                                        'retainedQuoteDocumentAndModel': True,
                                        'nativeModalReleased': True,
                                        'trustedOnboardingHeaderAndLocationClicks': True,
                                        'confirmedModeSwitch': {'from': 'simple', 'to': 'detailed', 'copy': False,
                                                                'originalDialogClosed': True,
                                                                'ordinarySimpleDraftUnchanged': True},
                                        'commercialAcceptance': False}
        page.screenshot(path=str(OUT / 'quote-modal-boundary-1440.png'), full_page=True)

        # A visible native modal also makes body-owned QA controls inert. The
        # location picker must operate within that modal without closing it or
        # losing the product editor's unsaved input.
        phase = 'qa-visible-modal-location-picking'
        page.goto(cfg['url'] + '/ia?view=qa-lab&screen=quote-review/normal/email&width=390&mode=detailed')
        frame = page.frame_locator('#frame')
        frame.locator('#r3-veil').wait_for(state='attached', timeout=30000)
        expect(page.locator('#frame')).to_have_js_property('inert', False, timeout=30000)
        remember_review_application(page)
        ready_review_route(page, frame, 'quote-review', 'normal')
        page.locator('.lab-role-filter [data-role="all"]').click()
        page.evaluate('''() => {
            window.__researchModalPoints=[];
            window.addEventListener('message',event=>{
                const frame=document.querySelector('#frame'),message=event.data;
                if(event.source===frame?.contentWindow && event.origin===location.origin &&
                    message?.scope==='ORDER_R3_FRAME' && message.type==='point')
                    window.__researchModalPoints.push(message.payload);
            });
        }''')
        review = frame.locator('#order-app-quote #input-review-dialog')
        expect(review).to_be_visible()
        assert review.evaluate("dialog => dialog.open && dialog.matches(':modal')")
        snapshot = remember_review_quote(frame)
        review_note = '열린 견적 검토 모달 안의 위치 · 저장하지 않는 초안'
        review_anchor = pick_native_modal_note(page, frame, review, review.locator('#input-review-title'), review_note)
        same_review_quote(frame, snapshot)
        same_review_application(page, frame)
        page.locator('#close-drawer').click()
        frame_click(page, review.locator('#input-review-back'))
        expect(review).to_have_js_property('open', False)
        expect(frame.locator('dialog:modal')).to_have_count(0)
        wait_for_expression(page, '''(() => {
            const frame=document.getElementById('frame'),state=frame.contentDocument.getElementById('order-single').__orderResearchInspector.inspect();
            return state.active && !state.pendingRoute && !frame.inert;
        })()''')

        # The detailed Q3 fixture opens the original site editor. It owns a
        # real unsaved text field, whose value and identity must survive both
        # selecting a point and cancelling another pick with Escape.
        phase = 'qa-detailed-business-actions'
        receipt['q3BusinessActions390'] = check_detailed_q3_actions(page, frame)
        phase = 'qa-visible-editor-location-picking'
        choose_review_route(page, frame, 'q3', 'open')
        expect(frame.locator('#q3-sites .q3-site-accordion')).to_have_count(1)
        expect(frame.locator('#q3-sites [data-contact-copy]')).to_have_count(0)
        receipt['q3BusinessActions390']['singleSiteSourceHasNoCopyDestination'] = True
        editor = frame.locator('#order-app-quote #site-editor-dialog')
        expect(editor).to_be_visible()
        assert editor.evaluate("dialog => dialog.open && dialog.matches(':modal')")
        name = editor.locator('#site-name')
        draft_name = '위치 선택 중 유지할 사업장 초안'
        name.fill(draft_name)
        original_name = name.element_handle()
        snapshot = remember_review_quote(frame)
        editor_note = '편집 모달 안의 위치 · 제품 입력을 유지하는 초안'
        editor_anchor = pick_native_modal_note(page, frame, editor, editor.locator('#site-editor-title'), editor_note)
        expect(name).to_have_value(draft_name)
        same_review_quote(frame, snapshot)
        points_before_cancel = page.evaluate('window.__researchModalPoints.length')
        page.locator('#reposition').click()
        veil = frame.locator('#r3-veil')
        expect(veil).to_be_visible()
        veil.press('Escape')
        expect(veil).to_be_hidden()
        expect(page.locator('#drawer')).to_be_visible()
        expect(page.locator('#point-state')).to_have_text('위치 지정됨')
        expect(page.locator('#body-text')).to_have_value(editor_note)
        assert page.evaluate('window.__researchModalPoints.length') == points_before_cancel
        assert editor.evaluate("dialog => dialog.open && dialog.matches(':modal')"), 'Cancelling annotation must not cancel the product editor'
        expect(name).to_have_value(draft_name)
        assert original_name.evaluate("input => input===document.getElementById('site-name') && input.isConnected")
        same_review_quote(frame, snapshot)
        same_review_application(page, frame)
        page.locator('#close-drawer').click()
        frame_click(page, name)
        name.press('End')
        name.press('X')
        expect(name).to_have_value(draft_name + 'X')
        assert editor.evaluate("dialog => dialog.open && dialog.matches(':modal')")
        assert_no_hidden_modal(frame)
        receipt['checks'].append('visible native quote review and editable site dialogs accept trusted location picks while retaining the modal, quote and input; annotation Escape preserves the editor and original controls remain usable')
        receipt['nativeModalPicking'] = {'reviewAnchor': review_anchor, 'editorAnchor': editor_anchor,
                                         'trustedModalHeadingPicks': True, 'draftMarkersAtHeadings': True,
                                         'retainedQuoteDocumentAndModel': True, 'unsavedEditorInputRetained': True,
                                         'annotationEscapeRetainsEditor': True, 'originalReviewBackButtonWorks': True,
                                         'editorAcceptsInputAfterPick': True, 'commercialAcceptance': False}
        page.screenshot(path=str(OUT / 'native-modal-location-picking-1440.png'), full_page=True)

        critical = [item for item in failed if item['phase'] != 'owner-login' and (
            item['resource'] in ('document', 'script', 'stylesheet') or item['path'].startswith('/ia/research-assets/'))]
        assert not errors, errors
        assert not critical, critical
        assert not review_writes, review_writes
        assert not outside_writes, outside_writes
        assert not operating_writes, operating_writes
        assert not price_api_requests, price_api_requests
        receipt['build'] = build
        receipt['status'] = 'PASS'
    except Exception as error:
        receipt['status'] = 'FAIL'
        receipt['error'] = safe(repr(error))
        # Capture while Playwright is still alive. Closing the driver first
        # would replace the actual failure with "Event loop is closed".
        if browser:
            for context_index, context in enumerate(browser.contexts):
                for page_index, page in enumerate(context.pages):
                    try:
                        diagnostic = capture_quote_diagnostics(page)
                        name = f'failure-{context_index}-{page_index}-quote.json'
                        (OUT / name).write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2))
                        receipt.setdefault('quoteDiagnostics', []).append(name)
                    except Exception as diagnostic_error:
                        receipt.setdefault('diagnosticErrors', []).append(safe(diagnostic_error))
                    try:
                        diagnostic = capture_product_scope_diagnostics(page)
                        name = f'failure-{context_index}-{page_index}-product-scope.json'
                        (OUT / name).write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2))
                        receipt.setdefault('productScopeDiagnostics', []).append(name)
                    except Exception as diagnostic_error:
                        receipt.setdefault('diagnosticErrors', []).append(safe(diagnostic_error))
                    try:
                        page.screenshot(path=str(OUT / f'failure-{context_index}-{page_index}.png'), full_page=True)
                    except Exception as capture_error:
                        receipt.setdefault('captureErrors', []).append(safe(capture_error))
        print(json.dumps({'phase': phase, 'error': receipt['error'], 'pageErrors': errors,
                          'consoleErrors': console_errors[-12:], 'failedRequests': failed[-12:]}, ensure_ascii=False))
        raise
    finally:
        # Cleanup errors are evidence, never replacements for the test failure.
        for name, resource, close in [('browser', browser, 'close'), ('playwright', driver, 'stop')]:
            if resource:
                try:
                    getattr(resource, close)()
                except Exception as cleanup_error:
                    receipt.setdefault('cleanupErrors', []).append({'resource': name, 'error': safe(cleanup_error)})
        host.terminate()
        try:
            host.wait(timeout=10)
        except subprocess.TimeoutExpired:
            host.kill()
            host.wait(timeout=5)
        if host.stdout:
            host.stdout.close()
        log.close()
        receipt.update({'errors': errors, 'consoleErrors': console_errors, 'failedRequests': failed,
                        'abortedRequests': aborted, 'reviewWrites': review_writes, 'externalWrites': outside_writes,
                        'operatingWrites': operating_writes, 'priceApiRequests': price_api_requests})
        (OUT / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        print(json.dumps({'status': receipt['status'], 'checks': len(receipt['checks']),
                          'receipt': 'artifacts/research-application/receipt.json'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
