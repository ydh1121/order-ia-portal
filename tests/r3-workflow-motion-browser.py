"""Canonical product workflows in the compiled review frame and isolated QA transport.

The UI and adapters are the product implementations. Fixtures never authenticate to
an external provider, write commercial records, send documents, or take payment.
Actual handler authorization/attestation is covered by the companion SQLite tests.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright

from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position
from r3_workflow_browser_support import PNG, check_signature_flow, configure, inspect_fixture, release

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/motion21/workflow'
REPORT = {}
WORKFLOWS = ('business', 'receipt-operator', 'receipt-supplier', 'billing', 'signature')


def step(name):
    REPORT['lastStep'] = name


def save_failure(page, name, error):
    REPORT['error'] = str(error)
    REPORT['errorType'] = type(error).__name__
    try:
        if page is not None and not page.is_closed() and page.locator('#frame').count():
            REPORT['frame'] = page.frame_locator('#frame').locator('#order-single').evaluate('''root=>{
              const w=root.ownerDocument.defaultView;
              return {fixture:w.ORDER_APP_ADAPTER?.fixture?.inspect(),frames:w.__workflowFrames||{},requests:w.__workflowRequests||[],signaturePackets:w.__signaturePackets||[],signatureAttachments:w.__signatureAttachments||[],signatureConfirmation:w.__signatureConfirmation||null,activeElement:root.ownerDocument.activeElement?.outerHTML?.slice(0,600)};
            }''', timeout=2000)
    except Exception as capture_error:
        REPORT['captureError'] = str(capture_error)
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        if page is not None and not page.is_closed():
            page.screenshot(path=OUT/f'failure-{name}.png', full_page=True)
    except Exception as capture_error:
        REPORT['screenshotError'] = str(capture_error)
    (OUT/f'partial-{name}.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')


def observe_requests(frame):
    frame.locator('#order-single').evaluate('''el=>{
      const w=el.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER,send=a.request.bind(a);
      w.__workflowRequests=[];
      a.request=(path,body,signal)=>{w.__workflowRequests.push({path,body:body?JSON.parse(JSON.stringify(body)):null});return send(path,body,signal);};
    }''')


def requests(frame, path):
    return frame.locator('#order-single').evaluate('(el,path)=>el.ownerDocument.defaultView.__workflowRequests.filter(r=>r.path===path&&r.body)', path)


def sample_frames(frame, name, selector, duration=400):
    frame.locator('#order-single').evaluate('''(root,args)=>{
      const w=root.ownerDocument.defaultView,start=performance.now(),out={done:false,samples:[]};
      (w.__workflowFrames??={})[args.name]=out;
      function sample(time){const el=root.querySelector(args.selector);if(el){const r=el.getBoundingClientRect(),s=getComputedStyle(el);out.samples.push({t:time-start,x:r.x,y:r.y,width:r.width,height:r.height,transform:s.transform,opacity:Number(s.opacity),phase:el.dataset.asyncPhase||null});}
        if(time-start<args.duration)requestAnimationFrame(sample);else out.done=true;}
      requestAnimationFrame(sample);
    }''', {'name': name, 'selector': selector, 'duration': duration})


def take_frames(frame, name):
    result = frame.locator('#order-single').evaluate('''async(root,name)=>{
      const state=root.ownerDocument.defaultView.__workflowFrames[name];
      while(!state.done)await new Promise(requestAnimationFrame);return state.samples;
    }''', name)
    assert len(result) >= 4, (name, result)
    return result


def assert_spinner(samples, reduced):
    if not reduced:
        assert len({sample['transform'] for sample in samples}) > 2, samples


def check_business(page, frame, reduced):
    step('business input and suggestion confirmation')
    observe_requests(frame)
    number = frame.locator('[name=business-number]')
    number.fill('1234567890')
    frame.locator('[name=business-name]').fill('검수용 합성 사업장')
    frame.locator('[name=owner-name]').fill('검수 담당자')
    for name, value in [('business-sector', '숙박 및 음식점업'), ('business-type', '제과점업')]:
        field = frame.locator('[name='+name+']')
        field.fill(value)
        expect(frame.get_by_role('option', name=value, exact=True)).to_be_visible()
        field.press('ArrowDown')
        field.press('Enter')
        expect(field).to_have_value(value)
        expect(field).to_have_attribute('aria-expanded', 'false')
        expect(frame.locator('#'+field.get_attribute('aria-controls'))).to_be_hidden()
    frame.locator('[type=file]').set_input_files({'name': 'synthetic-registration.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(frame.locator('#order-app-page, #order-single:not([data-research-application])')).to_have_attribute('data-file-selected', 'true')
    verify = frame.locator('[data-action=verify-business]')
    step('business provider failure and input retention')
    configure(frame, {'requests': {'product POST /business-verifications': {'scenario': 'error', 'errorCode': 'BUSINESS_PROVIDER_UNAVAILABLE', 'status': 503}}})
    frame_click(page, verify)
    expect(verify).to_have_attribute('data-async-phase', 'error')
    expect(number).to_have_value('123-45-67890')
    expect(frame.locator('[name=owner-name]')).to_have_value('검수 담당자')
    assert inspect_fixture(frame)['data']['businessVerifications'] == []
    step('business retry pending spinner frames')
    configure(frame, {'requests': {'product POST /business-verifications': {'scenario': 'loading'}}})
    frame_click(page, verify)
    expect(verify).to_have_attribute('data-async-phase', 'pending')
    expect(number).to_be_disabled()
    expect(frame.locator('[data-action=business-next]')).to_be_disabled()
    sample_frames(frame, 'verify-pending', '[data-action=verify-business] .r3-motion-glyph')
    pending = take_frames(frame, 'verify-pending')
    assert_spinner(pending, reduced)
    assert inspect_fixture(frame)['pending'] == 1
    assert inspect_fixture(frame)['data']['businessVerifications'] == []
    step('business acknowledgement and registration file reuse')
    release(frame)
    expect(verify).to_have_attribute('data-async-phase', 'success')
    expect(frame.locator('.wf-status')).to_have_text('검토용 인증 응답입니다. 실제 국세청 인증이 아닙니다.')
    expect(frame.locator('[data-business-confirmed]')).to_have_text('사업자 정보를 확인했어요. 등록증을 제출해 주세요.')
    expect(frame.locator('.business-fields')).to_have_js_property('inert', True)
    writes = requests(frame, '/business-verifications')
    assert len(writes) == 2 and writes[0]['body'] == writes[1]['body'], writes
    snapshot = inspect_fixture(frame)
    assert len(snapshot['data']['businessVerifications']) == 1
    assert snapshot['data']['businessVerifications'][0]['provider'] == 'QA_FIXTURE'
    frame_click(page, frame.locator('[data-action=business-next]'))
    expect(frame.get_by_role('heading', name='사업자등록증 제출', exact=True)).to_be_visible()
    expect(frame.locator('canvas[aria-label="1쪽 가림 영역 선택"]')).to_be_visible()
    return {'provider': 'QA_FIXTURE', 'failureRestoredInputs': True, 'sameRetry': writes[0]['body'] == writes[1]['body'], 'selectedFileReused': True, 'pendingFrames': pending}


def fixture_persona_remount(frame, persona):
    """Select a second test identity, then remount the same product workflow factory."""
    frame.locator('#order-single').evaluate('''(root,persona)=>{
      const w=root.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER;
      if(a.fixture.inspect().source.persistent)throw Error('Fixture transport required');
      const scope=root.querySelector('#order-app-page')||root;
      const mounted=w.ORDER_WORKFLOW_MOTION.mount(scope,{screen:'receipt',adapter:a});mounted.destroy();
      a.fixture.configure({persona,requests:{},scenario:'normal'});
      const motion=w.ORDER_ASYNC_MOTION.mount(scope,{source:'qa-fixture'});
      w.__workflowRemount=w.ORDER_WORKFLOW_MOTION.mount(scope,{screen:'receipt',adapter:a,api:{adapter:a,motion}});
      w.addEventListener('pagehide',()=>{w.__workflowRemount.destroy();motion.destroy();},{once:true});
    }''', persona)


def check_receipt(page, frame, reduced, persona='operator'):
    step('receipt '+persona+' choices')
    if persona == 'supplier':
        fixture_persona_remount(frame, persona)
    observe_requests(frame)
    setup = inspect_fixture(frame)
    REPORT['receiptSetup'] = {'controls': setup['controls'], 'paidPurchaseIds': [item['id'] for item in setup['data']['purchases'] if item['paid'] > 0], 'calls': setup['calls']}
    assert setup['controls']['persona'] == persona, REPORT['receiptSetup']
    assert REPORT['receiptSetup']['paidPurchaseIds'], REPORT['receiptSetup']
    issue = frame.locator('button[data-label="영수증 발급"]')
    expect(issue).to_be_enabled()
    model = frame.locator('.wf-field select').nth(1)
    expected_model = 'order-to-business' if persona == 'operator' else 'supplier-to-site'
    expect(model).to_have_value(expected_model)
    recipient = frame.locator('.wf-field select').nth(2)
    recipient.select_option('supplier' if persona == 'operator' else 'site')
    before = len(inspect_fixture(frame)['data']['receipts'])
    configure(frame, {'requests': {'product POST /receipts': {'scenario': 'loading'}}})
    step('receipt '+persona+' pending request')
    frame_click(page, issue)
    expect(issue).to_have_attribute('data-async-phase', 'pending')
    expect(issue).to_be_disabled()
    assert len(inspect_fixture(frame)['data']['receipts']) == before
    sample_frames(frame, 'receipt-'+persona, '.wf-paper', 1300)
    step('receipt '+persona+' printer entry frames')
    release(frame)
    paper = frame.locator('.wf-paper')
    expect(paper).to_be_visible()
    frames = take_frames(frame, 'receipt-'+persona)
    if not reduced:
        assert len({sample['transform'] for sample in frames}) > 4, frames
        assert min(sample['y'] for sample in frames) < frames[-1]['y'] - 20
    snapshot = inspect_fixture(frame)
    saved = snapshot['data']['receipts'][-1]
    assert saved['model'] == expected_model
    assert saved['recipient']['kind'] == ('supplier' if persona == 'operator' else 'site')
    expect(paper).to_contain_text(saved['number'])
    expect(paper).to_contain_text(saved['documentDigest'])
    expect(paper).to_contain_text('공급사 → 사업장' if persona == 'supplier' else '오더 → 공급사')
    expect(frame.locator('button[data-label="다시 열기"]')).to_be_enabled()
    step('receipt '+persona+' saved document readback')
    frame.locator('.wf-field select').last.select_option(saved['id'])
    frame_click(page, frame.locator('button[data-label="다시 열기"]'))
    expect(frame.locator('.wf-status')).to_contain_text(saved['number'])
    assert len(inspect_fixture(frame)['data']['receipts']) == before + 1
    assert any(call['path'] == '/receipts/'+saved['id'] and call['method'] == 'GET' for call in inspect_fixture(frame)['calls'])
    # Paper drag uses the real pointer and returns to its saved position. It does
    # not issue a second receipt or treat a visual gesture as a document write.
    step('receipt '+persona+' trusted paper drag and return')
    x, y = frame_pointer_position(page, paper)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x+20, y+75, steps=6)
    drag = paper.evaluate('el=>getComputedStyle(el).transform')
    sample_frames(frame, 'release-'+persona, '.wf-paper', 800)
    page.mouse.up()
    settling = take_frames(frame, 'release-'+persona)
    assert drag != 'none'
    assert settling[-1]['transform'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)')
    if not reduced:
        assert len({sample['transform'] for sample in settling}) > 3
    assert len(requests(frame, '/receipts')) == 1
    return {'persona': persona, 'scope': 'frame-memory', 'model': saved['model'], 'recipient': saved['recipient'], 'number': saved['number'], 'reopened': True, 'entryFrames': frames, 'dragTransform': drag, 'releaseFrames': settling}


def check_billing(page, frame, reduced):
    step('billing account and amount input')
    observe_requests(frame)
    account = frame.locator('.wf-field select').first
    expect(account.locator('option')).not_to_have_count(0)
    frame.get_by_label('청구 내용', exact=True).fill('검수용 별도 청구')
    amount = frame.get_by_label('금액 직접 입력', exact=True)
    frame.get_by_label('납부 기한', exact=True).fill('2027-01-12')
    frame.get_by_label('메모 · 선택', exact=True).fill('검토 데이터이며 발송하지 않음')
    for digit in ['8', '3', '0', '0']:
        frame_click(page, frame.locator('.wf-number-pad').get_by_role('button', name=digit, exact=True))
    expect(amount).to_have_value('8300')
    expect(frame.locator('.wf-amount')).to_have_attribute('aria-label', '8,300원')
    # Keyed digit spans survive a place-preserving edit and expose real spring frames.
    sample_frames(frame, 'amount', '.wf-amount [data-place="digit-0"]', 600)
    step('billing amount digit frames')
    amount.fill('8301')
    amount_frames = take_frames(frame, 'amount')
    if not reduced:
        assert len({sample['transform'] for sample in amount_frames}) > 3
    draft = frame.locator('button[data-label="임시 저장"]')
    step('billing draft failure and retained input')
    configure(frame, {'requests': {'product POST /billing': {'scenario': 'error', 'status': 503}}})
    frame_click(page, draft)
    expect(draft).to_have_attribute('data-async-phase', 'error')
    expect(amount).to_have_value('8301')
    assert inspect_fixture(frame)['data']['billing'] == []
    step('billing draft retry and acknowledgement')
    configure(frame, {'requests': {'product POST /billing': {'scenario': 'loading'}}})
    frame_click(page, draft)
    expect(draft).to_have_attribute('data-async-phase', 'pending')
    expect(amount).to_be_disabled()
    release(frame)
    expect(frame.locator('.wf-status')).to_have_text('임시 저장했어요.')
    before = requests(frame, '/billing')
    assert len(before) == 2 and before[0]['body'] == before[1]['body'], before
    stored = inspect_fixture(frame)['data']['billing'][0]
    assert stored['status'] == 'DRAFT' and stored['revision'] == 1 and stored['amount'] == 8301
    expect(frame.locator('button[data-label="불러오기"]')).to_be_enabled()
    step('billing saved draft reopen')
    frame_click(page, frame.locator('button[data-label="새 청구"]'))
    expect(amount).to_have_value('')
    frame.locator('.wf-field select').last.select_option(stored['id'])
    frame_click(page, frame.locator('button[data-label="불러오기"]'))
    expect(amount).to_have_value('8301')
    expect(frame.get_by_label('청구 내용', exact=True)).to_have_value('검수용 별도 청구')
    issue = frame.locator('button[data-label="청구서 발급"]')
    step('billing immutable issuance')
    frame_click(page, issue)
    expect(frame.locator('.wf-status')).to_contain_text('발송과 결제는 아직 진행하지 않았어요.')
    expect(amount).to_be_disabled()
    saved = inspect_fixture(frame)['data']['billing'][0]
    assert saved['id'] == stored['id'] and saved['status'] == 'ISSUED' and saved['revision'] == 2
    assert saved['paid'] == 0 and saved['deliveryStatus'] == 'NOT_SENT'
    return {'sameDraftRetry': True, 'reloadPreserved': True, 'issuedRevision': saved['revision'], 'paid': saved['paid'], 'deliveryStatus': saved['deliveryStatus'], 'amountFrames': amount_frames}


def check(page, origin, reduced, workflow):
    step('opening canonical review screens')
    screens = ReviewScreens(page, origin, 390)
    if workflow == 'business':
        step('opening canonical business screen')
        REPORT['business'] = check_business(page, screens.screen('business', 'filled'), reduced)
    elif workflow in ('receipt-operator', 'receipt-supplier'):
        step('opening canonical receipt screen')
        persona = workflow.removeprefix('receipt-')
        REPORT['receipts'] = [check_receipt(page, screens.screen('receipt', 'before'), reduced, persona)]
    elif workflow == 'billing':
        step('opening canonical billing screen')
        REPORT['billing'] = check_billing(page, screens.screen('admin-billing', 'draft'), reduced)
    elif workflow == 'signature':
        step('opening canonical signature screen')
        REPORT['signature'] = check_signature_flow(page, screens.screen('signature', 'empty'), on_step=step)
    else:
        raise ValueError('Unknown workflow: '+workflow)
    step('complete')


def run_case(browser, fixture, workflow, reduced, login_state):
    name = workflow + ('-390-reduced' if reduced else '-390-motion')
    REPORT.clear()
    REPORT.update({'case': name, 'workflow': workflow, 'width': 390, 'reducedMotion': reduced, 'scope': 'canonical product UI with a new browser context and isolated frame-memory QA transport', 'authentication': 'one verified host session; no shared origin storage or review fixture state', 'commercialWrites': 0, 'lastStep': 'opening authenticated context', 'errors': []})
    context = page = None
    try:
        context = browser.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='reduce' if reduced else 'no-preference', storage_state=login_state)
        page = context.new_page()
        errors = REPORT['errors']
        page.on('pageerror', lambda error: errors.append(str(error)))
        check(page, fixture['url'], reduced, workflow)
        assert not REPORT['errors'], REPORT['errors']
        REPORT['result'] = 'PASS'
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT/f'frames-{name}.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS '+name, flush=True)
    except Exception as error:
        REPORT['result'] = 'FAIL'
        save_failure(page, name, error)
        print('FAIL '+name+' at '+REPORT['lastStep']+': '+str(error), flush=True)
    finally:
        if context is not None:
            try:
                context.close()
            except Exception as error:
                REPORT['result'] = 'FAIL'
                REPORT['cleanupError'] = str(error)
                (OUT/f'partial-{name}.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
                print('FAIL '+name+' at context cleanup: '+str(error), flush=True)
    return dict(REPORT)


def authenticate_once(browser, fixture):
    # The host's real login throttle remains enabled. A verified session may be
    # reused while every case still receives a new context and in-frame fixture.
    context = browser.new_context(viewport={'width': 390, 'height': 900})
    try:
        page = context.new_page()
        page.goto(fixture['url']+'/ia?view=qa-lab&screen=login%2Fempty%2Femail')
        page.locator('input[name=email]').fill(fixture['email'])
        page.locator('input[name=password]').fill(fixture['pass'])
        page.locator('button[type=submit]').click()
        page.wait_for_url('**/ia?view=qa-lab**')
        expect(page.locator('#frame')).to_be_attached()
        state = context.storage_state()
        state['origins'] = []
        return state
    finally:
        context.close()


def main():
    host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            reports = []
            try:
                login_state = authenticate_once(browser, fixture)
                for reduced in (False, True):
                    for workflow in WORKFLOWS:
                        reports.append(run_case(browser, fixture, workflow, reduced, login_state))
                        # Persist after every isolated case, including failures. A later
                        # infrastructure interruption must not erase earlier receipts.
                        OUT.mkdir(parents=True, exist_ok=True)
                        (OUT/'receipt.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
            finally:
                browser.close()
        failed = [report for report in reports if report['result'] != 'PASS']
        assert len(reports) == len(WORKFLOWS)*2, 'Every workflow must run in normal and reduced motion'
        if failed:
            raise AssertionError('Workflow cases failed ('+str(len(failed))+'/'+str(len(reports))+'): '+', '.join(report['case']+' ['+report['lastStep']+']' for report in failed))
        print('PASS canonical business, two receipt models, billing and signed evidence at 390px, normal and reduced motion; RAF receipt saved.')
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == '__main__':
    main()
