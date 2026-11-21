"""Shared assertions against canonical workflow UI with the isolated QA transport."""
import base64
from playwright.sync_api import expect
from r3_feedback_browser_support import frame_click

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


def inspect_fixture(frame):
    return frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.ORDER_APP_ADAPTER.fixture.inspect()')


def configure(frame, value):
    return frame.locator('#order-single').evaluate('(el,value)=>el.ownerDocument.defaultView.ORDER_APP_ADAPTER.fixture.configure(value)', value)


def release(frame, value=None):
    return frame.locator('#order-single').evaluate('(el,value)=>el.ownerDocument.defaultView.ORDER_APP_ADAPTER.fixture.releasePending(value)', value or {'scenario': 'normal', 'requests': {}})


def check_consultation_flow(page, frame):
    target = frame.locator('[name="consult-pass"][data-id="qa-existing-quote"]')
    expect(target).to_have_count(1)
    expect(frame.locator('[name="consult-pass"]')).to_have_count(1)
    opener = frame.locator('[data-action="open-drawer"]')
    panel = frame.locator('.functional-drawer')
    frame_click(page, opener)
    expect(panel).to_be_hidden()
    expect(frame.locator('.consult-selection-message')).to_contain_text('선택')
    frame_click(page, target)
    frame_click(page, opener)
    expect(panel).to_be_visible()
    memo = frame.locator('.consult-memo textarea')
    memo.fill('제품 검수용 상담 메모')
    memo.evaluate('el=>window.__retainedConsultationMemo=el')
    frame_click(page, frame.locator('[name="topic"]').first)
    date_button = frame.locator('[data-action="choose-consult-date"]')
    if date_button.count():
        frame_click(page, date_button)
        calendar = frame.get_by_role('dialog', name='상담 희망일')
        expect(calendar).to_be_visible()
        for day in ['2026-12-25', '2026-12-26', '2026-12-14']:
            expect(calendar.locator('[data-day="'+day+'"]').first).to_be_disabled()
        frame_click(page, calendar.locator('[data-day="2026-12-17"]'))
        expect(calendar).to_be_hidden()
        expect(date_button.locator('strong')).to_have_text('2026-12-17')
    else:
        frame.locator('[name="desiredDate"]').fill('2026-12-17')
    hour = frame.get_by_role('listbox', name='시', exact=True)
    hour.press('End')
    expect(hour.locator('[aria-selected="true"]')).to_have_text('18시')
    expect(frame.locator('[data-minute="10"]')).to_be_disabled()
    memo.press('Escape')
    expect(panel).to_be_hidden()
    expect(opener).to_be_focused()
    frame_click(page, opener)
    expect(memo).to_have_value('제품 검수용 상담 메모')
    assert memo.evaluate('el=>el===window.__retainedConsultationMemo')
    frame.locator('#order-single').evaluate('''root=>{
      const w=root.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER,send=a.roleRequest;
      w.__consultationWrites=[];
      a.roleRequest=(path,body,signal)=>{if(body)w.__consultationWrites.push(JSON.parse(JSON.stringify(body)));return send(path,body,signal);};
    }''')
    submit = frame.locator('[data-action="request-booking"]')
    configure(frame, {'requests': {'role POST ': {'scenario': 'error', 'status': 503}}})
    frame_click(page, submit)
    expect(submit).to_have_attribute('data-async-phase', 'error')
    expect(memo).to_have_value('제품 검수용 상담 메모')
    assert not any(item['kind'] == 'consult' for item in inspect_fixture(frame)['data']['cases'])
    configure(frame, {'requests': {'role POST ': {'scenario': 'loading'}}})
    frame_click(page, submit)
    expect(submit).to_have_attribute('data-async-phase', 'pending')
    expect(memo).to_be_disabled()
    release(frame)
    expect(submit).to_have_attribute('data-request-saved', 'true')
    expect(frame.locator('.consult-request-message')).to_contain_text('상담 요청을 접수했습니다.')
    saved = next(item for item in inspect_fixture(frame)['data']['cases'] if item['kind'] == 'consult')
    assert saved['state'] == 'OPEN'
    writes = frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__consultationWrites')
    creates = [item for item in writes if item['action'] == 'create']
    assert len(creates) == 2 and creates[0] == creates[1]
    assert creates[-1]['context']['targets'] == ['qa-existing-quote']
    assert creates[-1]['context']['desiredDate'] == '2026-12-17'
    assert '제품 검수용 상담 메모' in creates[-1]['context']['memo']
    assert '희망 시간: 18:00' in creates[-1]['context']['memo']
    return {'scope': 'frame-memory QA consultation via canonical product adapter', 'sameForm': True, 'requestRetryPreserved': True, 'savedCase': saved, 'submittedContext': creates[-1]['context']}


def check_signature_flow(page, frame, *, fail_first=True):
    expect(frame.get_by_role('heading', name='거래내역 증빙과 서명', exact=True)).to_be_visible()
    expect(frame.locator('.wf-panel select').first.locator('option')).not_to_have_count(0)
    frame.locator('#order-single').evaluate('''el=>{
      const w=el.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER,original=a.workflows.evidenceOptions;
      w.__signaturePackets=[];
      const role=a.roleRequest;w.__signatureAttachments=[];
      a.roleRequest=(path,body,signal)=>{if(body?.action==='attach')w.__signatureAttachments.push(JSON.parse(JSON.stringify(body)));return role(path,body,signal);};
      a.workflows.evidenceOptions=async()=>{const options=await original();return {...options,fetcher:async(url,settings={})=>{
        if(settings.method==='POST'){
          const bytes=settings.body,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sizes=[];let offset=6,last=6;
          for(let i=0;i<bytes[5];i++){last=offset;const width=view.getUint16(offset),height=view.getUint16(offset+2);sizes.push([width,height]);offset+=4+width*height;}
          const document=bytes.slice(0,last);document[5]--;
          const sha=async data=>Array.from(new Uint8Array(await w.crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
          const header=JSON.parse(settings.headers['X-Order-Submission']);
          w.__signaturePackets.push({requestKey:settings.headers['Idempotency-Key'],pages:bytes[5],bytes:bytes.length,sizes,documentDigest:await sha(document),signatureDigest:await sha(bytes.subarray(last)),packetDigest:await sha(bytes),header});
        }
        return options.fetcher(url,settings);
      }};};
    }''')
    frame.locator('[name=document-memo]').fill('제출 증빙의 검수용 추가 요청')
    frame_click(page, frame.get_by_role('button', name='자료와 서명 준비', exact=True))
    file = frame.locator('.wf-panel input[type=file]')
    expect(file).to_be_visible()
    file.set_input_files({'name': 'synthetic-proof.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(frame.locator('canvas[aria-label="1쪽 가림 영역 선택"]')).to_be_visible()
    confirmation = frame.get_by_label('가림 처리한 모든 페이지를 확인했습니다.', exact=True)
    confirmation.check()
    submit = frame.locator('.wf-panel button').filter(has_text='가림 처리본 제출')
    frame_click(page, submit)
    expect(frame.locator('.wf-status')).to_contain_text('서명')
    assert not any(call['path'] == '/evidence' and call['method'] == 'POST' for call in inspect_fixture(frame)['calls'])
    frame.get_by_label('또는 이름 입력으로 서명', exact=True).fill('검수용 합성 서명')
    if fail_first:
        configure(frame, {'requests': {'role POST /evidence': {'scenario': 'error', 'status': 503}}})
        frame_click(page, submit)
        expect(frame.locator('.wf-status')).to_contain_text('다시 시도')
        assert inspect_fixture(frame)['data']['cases'][0]['evidenceId'] is None
    configure(frame, {'requests': {'role POST /evidence': {'scenario': 'loading'}}})
    frame_click(page, submit)
    expect(submit).to_be_disabled()
    expect(submit).to_have_attribute('data-async-phase', 'pending')
    release(frame)
    expect(frame.locator('.wf-panel')).to_have_attribute('data-success', 'true')
    expect(frame.locator('.wf-status')).to_contain_text('검토 중')
    packets = frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__signaturePackets')
    assert len(packets) == (2 if fail_first else 1), packets
    for packet in packets:
        assert packet['pages'] == 2 and packet['sizes'][-1] == [360, 100]
        assert packet['documentDigest'] == packet['header']['documentDigest']
        assert packet['signatureDigest'] == packet['header']['signatureDigest']
        assert packet['header']['consentVersion'] == 'masked-evidence-v1'
    if fail_first:
        assert packets[0] == packets[1], 'retry must keep the exact sealed pixels, hashes and request key'
    fixture = inspect_fixture(frame)
    case = next(row for row in fixture['data']['cases'] if row['id'] == 'qa-reprice-case')
    assert case['state'] == 'REVIEW' and case['evidenceId']
    attachments = frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__signatureAttachments')
    assert len(attachments) == 1 and attachments[0]['context']['memo'] == '제출 증빙의 검수용 추가 요청'
    assert fixture['source']['persistent'] is False and fixture['source']['commercial'] is False
    return {'scope': 'same product editor and canonical adapter with frame-memory QA transport', 'savedCase': case, 'packets': packets, 'attachments': attachments, 'missingSignatureBlocked': True, 'failureRetry': fail_first, 'pendingAwaited': True}
