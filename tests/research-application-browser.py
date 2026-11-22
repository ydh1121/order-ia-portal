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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    log = (OUT / 'host.stderr.log').open('w')
    host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=log, text=True)
    driver = browser = None
    errors, console_errors, failed, aborted, review_writes, outside_writes = [], [], [], [], [], []
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
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return
        path = urlsplit(request.url).path
        if path == '/api/ia/r3-qa/records':
            review_writes.append({'method': request.method, 'path': path})
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

        critical = [item for item in failed if item['phase'] != 'owner-login' and (
            item['resource'] in ('document', 'script', 'stylesheet') or item['path'].startswith('/ia/research-assets/'))]
        assert not errors, errors
        assert not critical, critical
        assert not review_writes, review_writes
        assert not outside_writes, outside_writes
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
                        'abortedRequests': aborted, 'reviewWrites': review_writes, 'externalWrites': outside_writes})
        (OUT / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        print(json.dumps({'status': receipt['status'], 'checks': len(receipt['checks']),
                          'receipt': 'artifacts/research-application/receipt.json'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
