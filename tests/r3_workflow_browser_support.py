"""Shared assertions against canonical workflow UI with the isolated QA transport."""
import base64
from playwright.sync_api import expect
from r3_feedback_browser_support import frame_click, frame_pointer_position

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
    compound = frame.locator('[name="consult-pass"][data-id="b17"]')
    expect(frame.locator('[name="consult-pass"]')).to_have_count(2)
    layout = frame.locator('.consult-tickets').evaluate("""list=>{
      const cards=[...list.children].map(card=>card.getBoundingClientRect());
      const bounds=list.getBoundingClientRect(),cta=list.parentElement.querySelector('[data-action="open-drawer"]').getBoundingClientRect();
      return {sameRow:Math.abs(cards[0].top-cards[1].top)<1,sideBySide:cards[1].left>=cards[0].right,
        listShowsCards:cards.every(card=>card.bottom<=bounds.bottom+1),ctaBelow:cta.top>=bounds.bottom-1};
    }""")
    assert all(layout.values()), layout
    card = frame.locator('.consult-ticket').filter(has=compound)
    expect(card.locator('label')).to_contain_text('특란 30구 · 대란 30구 · 복합 주문')
    frame_click(page, card.get_by_role('button', name='패스 상세'))
    detail = frame.get_by_role('dialog', name='오더 패스 상세')
    expect(detail.locator('h2')).to_have_text('샘플베이커리')
    expect(detail.locator('.ticket-item')).to_have_count(2)
    for item, values in zip(detail.locator('.ticket-item').all(), [('특란 30구','1,200판','정기 주문'),('대란 30구','800판','소진 시 주문')]):
        for value in values:
            expect(item).to_contain_text(value)
    frame_click(page, detail.get_by_role('button', name='패스 상세 닫기'))
    expect(detail).to_be_hidden()
    opener = frame.locator('[data-action="open-drawer"]')
    panel = frame.locator('.functional-drawer')
    frame_click(page, opener)
    expect(panel).to_be_hidden()
    expect(frame.locator('.consult-selection-message')).to_contain_text('선택')
    frame_click(page, compound)
    listing = frame.locator('.consult-tickets')
    if listing.evaluate('el=>el.scrollWidth>el.clientWidth'):
        x, y = frame_pointer_position(page, card.locator('label'))
        page.mouse.move(x,y)
        page.mouse.wheel(680,0)
        moved = listing.evaluate("""async el=>{
          for(let i=0;i<100&&el.scrollLeft<el.scrollWidth-el.clientWidth-1;i++)await new Promise(requestAnimationFrame);
          return el.scrollLeft>0;
        }""")
        assert moved, 'the horizontal pass list must accept a real horizontal scroll'
    frame_click(page, target)
    expect(compound).to_be_checked()
    expect(target).to_be_checked()
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
    expect(frame.locator('.consult-complete h2')).to_have_text('상담을 예약했어요')
    expect(frame.locator('.consult-complete')).to_contain_text('예약시간 확정 후 담당자가 연락드릴 예정이에요')
    expect(memo).to_be_hidden()
    expect(submit).to_be_hidden()
    saved = next(item for item in inspect_fixture(frame)['data']['cases'] if item['kind'] == 'consult')
    assert saved['state'] == 'OPEN'
    writes = frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__consultationWrites')
    creates = [item for item in writes if item['action'] == 'create']
    assert len(creates) == 2 and creates[0] == creates[1]
    assert creates[-1]['context']['targets'] == ['b17', 'qa-existing-quote']
    assert creates[-1]['context']['desiredDate'] == '2026-12-17'
    assert '제품 검수용 상담 메모' in creates[-1]['context']['memo']
    assert '희망 시간: 18:00' in creates[-1]['context']['memo']
    return {'scope': 'frame-memory QA consultation via canonical product adapter', 'sameForm': True, 'requestRetryPreserved': True, 'savedCase': saved, 'submittedContext': creates[-1]['context']}


def check_signature_flow(page, frame, *, open_proof, open_signature=None, fail_first=True, on_step=lambda name: None):
    on_step('signature review and proof editor startup')
    expect(frame.get_by_role('heading', name='서명이 필요해요', exact=True)).to_be_visible()
    expect(frame.locator('.wf-panel')).to_have_attribute('data-review-scenario', 'signature/empty')
    expect(frame.locator('.wf-panel')).to_have_attribute('data-review-ready', 'true')
    expect(frame.locator('[name=document-memo]')).to_be_hidden()
    expect(frame.locator('.research-file-drop')).to_be_hidden()
    assert not any(call['path'] == '/evidence' and call['method'] == 'POST' for call in inspect_fixture(frame)['calls'])
    cases_before = inspect_fixture(frame)['data']['cases']
    # The signature review is a read-only presentation of already prepared
    # documents. Install the observer before entering the real proof editor:
    # its single existing case now opens automatically and captures its fetcher
    # during preparation, rather than after the removed manual-start step.
    frame.locator('#order-single').evaluate('''el=>{
      const w=el.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER,original=a.workflows.evidenceOptions;
      w.__signaturePackets=[];w.__signatureEditorPreparations=0;w.__signatureObservedAdapter=a;
      const role=a.roleRequest;w.__signatureAttachments=[];
      a.roleRequest=(path,body,signal)=>{if(body?.action==='attach')w.__signatureAttachments.push(JSON.parse(JSON.stringify(body)));return role(path,body,signal);};
      a.workflows.evidenceOptions=async()=>{w.__signatureEditorPreparations++;const options=await original();return {...options,fetcher:async(url,settings={})=>{
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
    # The caller selects proof/empty through the real QA sidebar. This keeps
    # the review artifact identity aligned with the application route as well
    # as retaining the adapter whose evidence preparation was just observed.
    frame = open_proof()
    entered = frame.locator('#order-single').evaluate('''root=>{
      const w=root.ownerDocument.defaultView,app=w.ORDER_RESEARCH_APP,adapter=w.ORDER_APP_ADAPTER;
      if(!app||adapter.fixture.inspect().source.kind!=='dummy')throw Error('SIGNED_EVIDENCE_REQUIRES_CURRENT_DUMMY_APP');
      return {sameAdapter:app.adapter===w.__signatureObservedAdapter,route:app.snapshot().route,inspection:root.__orderResearchInspector.inspect().session};
    }''')
    assert entered['sameAdapter'] is True, entered
    assert entered['route']['screen'] == 'proof' and entered['route']['state'] == 'empty', entered
    assert entered['inspection']['screen'] == 'proof' and entered['inspection']['state'] == 'empty', entered
    expect(frame.get_by_role('heading', name='거래내역 증빙', exact=True)).to_be_visible()
    expect(frame.locator('.wf-panel')).to_have_attribute('data-review-scenario', 'proof/empty')
    expect(frame.locator('.wf-panel')).to_have_attribute('data-review-ready', 'true')
    expect(frame.locator('.wf-panel select').first.locator('option')).not_to_have_count(0)
    expect(frame.get_by_role('button', name='자료와 서명 준비', exact=True, include_hidden=True)).to_be_hidden()
    assert frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__signatureEditorPreparations') == 1
    assert inspect_fixture(frame)['data']['cases'] == cases_before
    memo = frame.locator('[name=document-memo]')
    memo_value = '👨‍👩‍👧‍👦' * 500
    frame_click(page, memo)
    page.keyboard.insert_text(memo_value)
    expect(memo).to_have_value(memo_value)
    expect(frame.locator('.memo-meter output')).to_have_text('0자 남음')
    page.keyboard.insert_text('가')
    expect(memo).to_have_value(memo_value)
    file = frame.locator('.wf-panel input[type=file]')
    expect(frame.locator('.research-file-drop')).to_be_visible()
    expect(file).to_be_attached()
    expect(file).to_be_enabled()
    on_step('signature actual image load and missing-signature rejection')
    file.set_input_files({'name': 'synthetic-proof.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(frame.locator('canvas[aria-label="1쪽 가림 영역 선택"]')).to_be_visible()
    original_document = frame.locator('canvas[aria-label="1쪽 가림 영역 선택"]').element_handle()
    frame_click(page, frame.get_by_role('button', name='다음', exact=True))
    expect(frame.locator('.research-evidence-page')).to_have_attribute('data-evidence-step', 'signature')
    assert original_document.evaluate("canvas=>canvas.isConnected&&document.querySelector('canvas[aria-label=\"1쪽 가림 영역 선택\"]')===canvas")
    confirmation = frame.get_by_label('제출 자료와 서명 내용을 확인했어요.', exact=True)
    on_step('signature explicit confirmation with trusted frame click')
    expect(confirmation).not_to_be_checked()
    confirmation.evaluate('''el=>{
      const w=el.ownerDocument.defaultView;
      w.__signatureConfirmation={before:{checked:el.checked,disabled:el.disabled},events:[]};
      w.__signatureConfirmationInput=el;
      for(const type of ['pointerdown','click'])el.addEventListener(type,e=>{
        w.__signatureConfirmation.events.push({type:e.type,trusted:e.isTrusted,targetIsInput:e.target===el,checked:el.checked});
      },{once:true});
    }''')
    frame_click(page, confirmation)
    confirmation_state = confirmation.evaluate('''el=>{
      const w=el.ownerDocument.defaultView;
      w.__signatureConfirmation.after={checked:el.checked,disabled:el.disabled,sameInput:el===w.__signatureConfirmationInput};
      return w.__signatureConfirmation;
    }''')
    expect(confirmation).to_be_checked()
    assert confirmation_state['after'] == {'checked': True, 'disabled': False, 'sameInput': True}, confirmation_state
    assert [event['type'] for event in confirmation_state['events']] == ['pointerdown', 'click'], confirmation_state
    assert all(event['trusted'] and event['targetIsInput'] for event in confirmation_state['events']), confirmation_state
    submit = frame.locator('.wf-panel [data-evidence-submit]')
    on_step('signature missing-signature rejection after explicit confirmation')
    frame_click(page, submit)
    expect(frame.locator('.wf-signature [data-workflow-error]')).to_contain_text('서명')
    assert not any(call['path'] == '/evidence' and call['method'] == 'POST' for call in inspect_fixture(frame)['calls'])
    canvas = frame.locator('.research-signature-pad canvas')
    ink = '''canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<175)count++;return count;}'''
    start = frame_pointer_position(page, canvas, {'x': 40, 'y': 60})
    end = frame_pointer_position(page, canvas, {'x': 122, 'y': 85})
    if page.evaluate('navigator.maxTouchPoints>0'):
        touch = page.context.new_cdp_session(page)
        try:
            for phase, points in [('touchStart', [start]), ('touchMove', [end]), ('touchEnd', [])]:
                touch.send('Input.dispatchTouchEvent', {'type': phase, 'touchPoints': [{'x': x, 'y': y} for x, y in points]})
        finally:
            touch.detach()
    else:
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=4)
        page.mouse.up()
    drawn = canvas.evaluate(ink)
    assert drawn > 30, drawn
    expect(frame.locator('.wf-signature [data-workflow-error]')).to_be_hidden()
    frame_click(page, frame.get_by_role('button', name='자료 수정', exact=True))
    frame_click(page, frame.get_by_role('button', name='다음', exact=True))
    assert canvas.evaluate(ink) == drawn
    frame_click(page, frame.get_by_role('button', name='다시 하기', exact=True))
    assert canvas.evaluate(ink) == 0
    frame_click(page, frame.locator('.research-signature-alternative > summary'))
    frame.get_by_label('또는 이름 입력으로 서명', exact=True).fill('검수용 합성 서명')
    typed_ink = canvas.evaluate(ink)
    assert typed_ink > 30, typed_ink
    if fail_first:
        on_step('signature sealed upload failure and retention')
        configure(frame, {'requests': {'role POST /evidence': {'scenario': 'error', 'status': 503}}})
        frame_click(page, submit)
        expect(frame.locator('.wf-status')).to_contain_text('다시 시도')
        assert inspect_fixture(frame)['data']['cases'][0]['evidenceId'] is None
    on_step('signature same sealed upload retry pending')
    configure(frame, {'requests': {'role POST /evidence': {'scenario': 'loading'}}})
    frame_click(page, submit)
    expect(submit).to_be_disabled()
    expect(submit).to_have_attribute('data-async-phase', 'pending')
    on_step('signature attach acknowledgement and digest readback')
    release(frame)
    expect(frame.locator('.wf-panel')).to_have_attribute('data-success', 'true')
    expect(frame.locator('.wf-status')).to_contain_text('검토 중')
    expect(frame.locator('.research-workflow-receipt')).to_contain_text('거래내역 증빙과 서명을 접수했어요.')
    expect(frame.locator('.research-workflow-receipt')).to_contain_text('최대 2영업일 이내')
    expect(frame.get_by_role('heading', name='거래내역 증빙', exact=True, include_hidden=True)).to_be_hidden()
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
    assert len(attachments) == 1 and attachments[0]['context']['memo'] == memo_value
    assert fixture['source']['persistent'] is False and fixture['source']['commercial'] is False
    if open_signature:
        saved = open_signature()
        expect(saved.get_by_role('heading', name='제출한 자료와 서명', exact=True)).to_be_visible()
        expect(saved.locator('.wf-signature')).to_have_count(0)
        frame_click(page, saved.get_by_role('button', name='연결된 증빙 열기', exact=True))
        saved_pages = saved.locator('.research-evidence-pages canvas')
        expect(saved_pages).to_have_count(2)
        assert saved_pages.last.evaluate(ink) > 0
        assert saved_pages.last.evaluate('c=>[c.width,c.height]') == [360, 100]
        assert len(inspect_fixture(saved)['calls']) >= len(fixture['calls'])
    return {'scope': 'current proof preparation and signature submission through the same product editor and canonical adapter with frame-memory QA transport', 'drawnInkPixels': drawn, 'typedInkPixelsBeforeSubmission': typed_ink, 'reopenedSignedPacket': bool(open_signature), 'entry': entered, 'observerBeforeAutomaticPreparation': True, 'savedCase': case, 'packets': packets, 'attachments': attachments, 'confirmation': confirmation_state, 'missingSignatureBlocked': True, 'failureRetry': fail_first, 'pendingAwaited': True}
