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
    observe_requests(frame)
    number = frame.locator('[name=business-number]')
    number.fill('1234567890')
    frame.locator('[name=business-name]').fill('검수용 합성 사업장')
    frame.locator('[name=owner-name]').fill('검수 담당자')
    frame.locator('[name=business-sector]').fill('음식점업')
    frame.locator('[name=business-type]').fill('제과점업')
    frame.locator('[type=file]').set_input_files({'name': 'synthetic-registration.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(frame.locator('#order-single')).to_have_attribute('data-file-selected', 'true')
    verify = frame.locator('[data-action=verify-business]')
    configure(frame, {'requests': {'product POST /business-verifications': {'scenario': 'error', 'errorCode': 'BUSINESS_PROVIDER_UNAVAILABLE', 'status': 503}}})
    frame_click(page, verify)
    expect(verify).to_have_attribute('data-async-phase', 'error')
    expect(number).to_have_value('123-45-67890')
    expect(frame.locator('[name=owner-name]')).to_have_value('검수 담당자')
    assert inspect_fixture(frame)['data']['businessVerifications'] == []
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
    release(frame)
    expect(verify).to_have_attribute('data-async-phase', 'success')
    expect(frame.locator('.wf-status')).to_contain_text('검토용 인증 결과')
    expect(frame.locator('.wf-status')).to_contain_text('실제 국세청 조회가 아니')
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
      const mounted=w.ORDER_WORKFLOW_MOTION.mount(root,{screen:'receipt',adapter:a});mounted.destroy();
      a.fixture.configure({persona,requests:{},scenario:'normal'});
      const motion=w.ORDER_ASYNC_MOTION.mount(root,{source:'qa-fixture'});
      w.__workflowRemount=w.ORDER_WORKFLOW_MOTION.mount(root,{screen:'receipt',adapter:a,api:{adapter:a,motion}});
      w.addEventListener('pagehide',()=>{w.__workflowRemount.destroy();motion.destroy();},{once:true});
    }''', persona)


def check_receipt(page, frame, reduced, persona='operator'):
    if persona == 'supplier':
        fixture_persona_remount(frame, persona)
    observe_requests(frame)
    issue = frame.locator('button[data-label="영수증 발급"]')
    expect(issue).to_be_enabled()
    model = frame.locator('.wf-field select').nth(1)
    expected_model = 'order-to-business' if persona == 'operator' else 'supplier-to-site'
    expect(model).to_have_value(expected_model)
    recipient = frame.locator('.wf-field select').nth(2)
    recipient.select_option('supplier' if persona == 'operator' else 'site')
    before = len(inspect_fixture(frame)['data']['receipts'])
    configure(frame, {'requests': {'product POST /receipts': {'scenario': 'loading'}}})
    frame_click(page, issue)
    expect(issue).to_have_attribute('data-async-phase', 'pending')
    expect(issue).to_be_disabled()
    assert len(inspect_fixture(frame)['data']['receipts']) == before
    sample_frames(frame, 'receipt-'+persona, '.wf-paper', 1300)
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
    frame.locator('.wf-field select').last.select_option(saved['id'])
    frame_click(page, frame.locator('button[data-label="다시 열기"]'))
    expect(frame.locator('.wf-status')).to_contain_text(saved['number'])
    assert len(inspect_fixture(frame)['data']['receipts']) == before + 1
    assert any(call['path'] == '/receipts/'+saved['id'] and call['method'] == 'GET' for call in inspect_fixture(frame)['calls'])
    # Paper drag uses the real pointer and returns to its saved position. It does
    # not issue a second receipt or treat a visual gesture as a document write.
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
    amount.fill('8301')
    amount_frames = take_frames(frame, 'amount')
    if not reduced:
        assert len({sample['transform'] for sample in amount_frames}) > 3
    draft = frame.locator('button[data-label="임시 저장"]')
    configure(frame, {'requests': {'product POST /billing': {'scenario': 'error', 'status': 503}}})
    frame_click(page, draft)
    expect(draft).to_have_attribute('data-async-phase', 'error')
    expect(amount).to_have_value('8301')
    assert inspect_fixture(frame)['data']['billing'] == []
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
    frame_click(page, frame.locator('button[data-label="새 청구"]'))
    expect(amount).to_have_value('')
    frame.locator('.wf-field select').last.select_option(stored['id'])
    frame_click(page, frame.locator('button[data-label="불러오기"]'))
    expect(amount).to_have_value('8301')
    expect(frame.get_by_label('청구 내용', exact=True)).to_have_value('검수용 별도 청구')
    issue = frame.locator('button[data-label="청구서 발급"]')
    frame_click(page, issue)
    expect(frame.locator('.wf-status')).to_contain_text('발송과 결제는 아직 진행하지 않았어요.')
    expect(amount).to_be_disabled()
    saved = inspect_fixture(frame)['data']['billing'][0]
    assert saved['id'] == stored['id'] and saved['status'] == 'ISSUED' and saved['revision'] == 2
    assert saved['paid'] == 0 and saved['deliveryStatus'] == 'NOT_SENT'
    return {'sameDraftRetry': True, 'reloadPreserved': True, 'issuedRevision': saved['revision'], 'paid': saved['paid'], 'deliveryStatus': saved['deliveryStatus'], 'amountFrames': amount_frames}


def check(page, origin, reduced):
    screens = ReviewScreens(page, origin, 390)
    business = check_business(page, screens.screen('business', 'filled'), reduced)
    receipt = screens.screen('receipt', 'before')
    receipts = [check_receipt(page, receipt, reduced), check_receipt(page, receipt, reduced, 'supplier')]
    billing = check_billing(page, screens.screen('admin-billing', 'draft'), reduced)
    signature = check_signature_flow(page, screens.screen('signature', 'empty'))
    return {'width': 390, 'reducedMotion': reduced, 'scope': 'canonical product UI with isolated frame-memory QA transport', 'business': business, 'receipts': receipts, 'billing': billing, 'signature': signature, 'commercialWrites': 0}


def main():
    host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            reports = []
            try:
                for reduced in (False, True):
                    context = browser.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='reduce' if reduced else 'no-preference')
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(fixture['url']+'/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail')
                    page.locator('input[name=email]').fill(fixture['email'])
                    page.locator('input[name=password]').fill(fixture['pass'])
                    page.locator('button[type=submit]').click()
                    page.wait_for_url('**/ia?view=qa-lab**')
                    reports.append(check(page, fixture['url'], reduced))
                    assert not errors, errors
                    context.close()
            finally:
                browser.close()
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT/'receipt.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS canonical business, two receipt models, billing and signed evidence at 390px, normal and reduced motion; RAF receipt saved.')
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == '__main__':
    main()
