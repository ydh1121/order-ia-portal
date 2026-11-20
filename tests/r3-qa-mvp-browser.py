"""Chrome against the actual Pages router, signed session, product APIs and isolated SQLite D1.
No fetch fixtures, completion timers or mocked product responses are installed.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import urlencode
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/qa-mvp'
LABELS = {
    'store-purchase': '매장 구매·입금 확인',
    'delivery-request': '납품 요청·오더패스',
    'supplier-shipments': '농장 발송',
    'admin-shipments': '주문 출고·송장 관리',
    'admin-analytics': '매출 현황',
    'admin-revenue-rules': '수익 배분율',
    'member-email-templates': '회원 이메일 양식',
    'component-library': '컴포넌트 라이브러리',
}


def frame(page):
    return page.frame_locator('#product-frame')


def open_screen(page, screen, persona='buyer'):
    if page.locator('#live-persona').input_value() != persona:
        page.locator('#live-persona').select_option(persona)
    page.locator('#live-navigation').get_by_role('button', name=LABELS[screen], exact=True).click()
    target = frame(page)
    expect(target.locator('#order-single[data-app-screen="'+screen+'"]')).to_be_visible()
    return target


def exact_product_url(origin, run_id, screen, state, persona='buyer'):
    return origin+'/ia?'+urlencode({'view':'product-r3','labRun':run_id,'persona':persona,'screen':screen,'state':state})


def create_run(page, origin, width):
    page.goto(origin+'/__lab-test-session')
    page.locator('#live-create').click()
    page.locator('#live-dialog input').fill('실제 공통 UI '+str(width))
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/ia/lab/runs')) as event:
        page.locator('#live-dialog').get_by_role('button',name='생성',exact=True).click()
    response=event.value
    assert response.ok,response.text()
    run=response.json()['run']
    expect(page.locator('#live-dialog')).not_to_be_visible()
    page.locator('#live-width').select_option(str(width))
    return run


def geometry(target, width, selector='#order-single'):
    result=target.locator(selector).evaluate("""(element)=>{
      const bounds=element.getBoundingClientRect();
      const controls=[...element.querySelectorAll('.field,.ops-select-field,.ops-panel,.ops-metric')]
        .filter(el=>el.getClientRects().length&&!el.closest('[inert]'))
        .map(el=>({className:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,
          over:el.scrollWidth>el.clientWidth+2}));
      return {viewport:innerWidth,document:document.documentElement.scrollWidth,root:bounds.width,controls,
        font:getComputedStyle(element).fontFamily,hasSvg:!!element.querySelector('.brand svg.brand-mark')};
    }""")
    assert result['viewport']==width,result
    assert result['document']<=width+1,result
    assert result['root']<=width+1,result
    assert result['hasSvg'],result
    assert 'Pretendard' in result['font'] and 'Arial' not in result['font'],result
    for control in result['controls']:
        assert control['left']>=-1 and control['right']<=width+1,control
    return result


def button_design(target, selector):
    return target.locator(selector).first.evaluate("""button=>{
      const s=getComputedStyle(button);return {fontFamily:s.fontFamily,fontSize:s.fontSize,
        minHeight:s.minHeight,borderRadius:s.borderRadius,fontWeight:s.fontWeight};
    }""")


def record_response(page, suffix, action):
    return page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith(suffix)
        and (action is None or (r.request.post_data_json or {}).get('action')==action))


def check(page, origin, width):
    run=create_run(page,origin,width)
    run_id=run['id']
    receipt={'width':width,'runId':run_id,'source':run['source'],'checks':{},'geometry':{}}
    target=open_screen(page,'store-purchase')
    expect(target.locator('[data-purchase-confirm]')).to_be_enabled()
    receipt['geometry']['purchase']=geometry(target,width)
    expect(target.locator('[name=unit-price]')).to_have_attribute('readonly','')
    target.locator('[name=quantity]').fill('0')
    target.locator('[data-purchase-confirm]').click()
    expect(target.locator('[name=quantity]')).to_have_attribute('aria-invalid','true')
    target.locator('[name=quantity]').fill('31')
    with record_response(page,'/purchase-quote',None) as preview_event:
        target.locator('[data-purchase-confirm]').click()
    assert preview_event.value.ok,preview_event.value.text()
    quote=preview_event.value.json()
    assert quote['total']==5970*31,quote
    expect(target.locator('[data-purchase-confirm]')).to_have_text('주문 확정')
    totals=target.locator('[data-same-price]').all_text_contents()
    assert len(totals)==2 and totals[0]==totals[1],totals
    with record_response(page,'/purchases','create') as order_event:
        target.locator('[data-purchase-confirm]').click()
    assert order_event.value.ok,order_event.value.text()
    order=order_event.value.json()['item']
    assert order['status']=='AWAITING_CASH' and order['paid']==0,order
    submitted=order_event.value.request.post_data_json
    assert submitted['acceptedQuoteId']==quote['quoteId']
    assert 'unitPrice' not in submitted and 'total' not in submitted
    expect(frame(page).locator('[data-purchase-id]')).to_have_text(order['id'])
    receipt['checks']['serverQuoteBeforeOrder']={'quoteId':quote['quoteId'],'total':quote['total'],'orderId':order['id']}
    receipt['checks']['cashEqualsCard']=True

    # Operator confirmation is a real second persona and a server mutation.
    target=open_screen(page,'store-purchase','operator')
    expect(target.locator('[data-order-select]')).to_be_visible()
    target.locator('[data-order-select]').select_option(order['id'])
    expect(target.locator('[data-order-action=confirm-cash]')).to_be_visible()
    target.locator('[data-order-action=confirm-cash]').click()
    expect(target.locator('[name=cash-reference]')).to_have_attribute('aria-invalid','true')
    target.locator('[name=cash-reference]').fill('BROWSER-BANK-'+str(width))
    with record_response(page,'/purchases','confirm-cash') as paid_event:
        target.locator('[data-order-action=confirm-cash]').click()
    assert paid_event.value.ok,paid_event.value.text()
    paid=paid_event.value.json()['item']
    assert paid['paid']==order['total'] and paid['status']=='PAID',paid
    expect(target.locator('[data-order-state]')).to_have_text('결제 확인')
    receipt['checks']['separateManualConfirmer']={'revision':paid['revision'],'paid':paid['paid']}

    target=open_screen(page,'supplier-shipments','supplier')
    expect(target.locator('[data-shipment-order] option')).to_have_count(1)
    target.locator('[data-shipment-order]').select_option(order['id'])
    target.locator('[name=shipment-status]').select_option('dispatched')
    target.locator('[name=shipment-method]').select_option('parcel')
    target.locator('[data-shipment-apply]').click()
    expect(target.locator('[name=tracking-number]')).to_have_attribute('aria-invalid','true')
    target.locator('[name=tracking-number]').fill('TRACK-'+str(width))
    with record_response(page,'/purchases','dispatch') as dispatched_event:
        target.locator('[data-shipment-apply]').click()
    assert dispatched_event.value.ok,dispatched_event.value.text()
    dispatched=dispatched_event.value.json()['item']
    assert dispatched['status']=='DISPATCHED' and dispatched['tracking']=='TRACK-'+str(width),dispatched
    expect(target.locator('[data-shipment-apply]')).to_be_disabled()
    receipt['geometry']['shipment']=geometry(target,width)
    receipt['checks']['dispatchPersisted']={'revision':dispatched['revision'],'tracking':dispatched['tracking']}

    target=open_screen(page,'store-purchase','buyer')
    target.locator('[data-order-select]').select_option(order['id'])
    expect(target.locator('[data-order-state]')).to_have_text('배송 중')
    with record_response(page,'/purchases','receive') as received_event:
        target.locator('[data-order-action=receive]').click()
    assert received_event.value.ok,received_event.value.text()
    expect(target.locator('[data-order-state]')).to_have_text('납품 완료')
    target.locator('[data-order-documents-open]').click()
    expect(target.locator('[data-document-id]')).to_have_text(order['id'])
    expect(target.locator('[data-document-payment]')).to_contain_text('영수증 발급')
    receipt['checks']['receiptAfterPayment']=True
    target=open_screen(page,'delivery-request','buyer')
    expect(target.locator('[data-pass-product]').first).to_have_text(order['product'])
    target.locator('[data-qa-flip]').first.click()
    expect(target.locator('[data-pass-card]')).to_have_attribute('data-face','back')
    expect(target.locator('[data-pass-amount]')).to_have_text(f"{order['total']:,}원")
    receipt['checks']['passUsesStoredOrder']=True

    target=open_screen(page,'admin-analytics','operator')
    expect(target.locator('[data-sales-provenance]')).to_contain_text('운영 매출과 분리')
    target.locator('[data-sales-period]').select_option('all')
    expect(target.locator('[data-sales-total=orders]')).to_have_text('1건')
    expect(target.locator('[data-sales-total=net]')).to_have_text(f"{order['total']:,}원")
    expect(target.locator('[data-sales-total=unpaid]')).to_have_text('0원')
    target.locator('[data-sales-search]').fill(order['id'])
    expect(target.locator('[data-sales-total=orders]')).to_have_text('1건')
    target.locator('[data-sales-search]').fill('no-such-order')
    expect(target.locator('[data-sales-total=orders]')).to_have_text('0건')
    target.locator('[data-sales-search]').fill('')
    receipt['geometry']['sales']=geometry(target,width)
    metrics=target.locator('.ops-metric').evaluate_all("""cards=>cards.map(card=>{
      const n=card.querySelector('strong');return {card:card.getBoundingClientRect().width,
        value:n.getBoundingClientRect().width,fits:n.scrollWidth<=n.clientWidth+1};
    })""")
    assert len(metrics)==6 and all(metric['fits'] for metric in metrics),metrics
    receipt['checks']['salesReadsActualOrders']=True
    target.locator('[data-qa-state=campaign-sales]').click()
    expect(target.locator('[data-sales-channel=campaign]')).to_be_visible()
    target.locator('[data-sales-period]').select_option('all')
    expect(target.locator('[data-sales-total=orders]')).to_have_text('0건')
    receipt['checks']['campaignDoesNotIncludeStoreOrder']=True

    target=open_screen(page,'admin-revenue-rules','operator')
    expect(target.locator('[data-name]')).to_be_visible()
    target.locator('[name=gross]').fill('100000')
    target.locator('[name=cost]').fill('40000')
    target.locator('[data-rate]').fill('100')
    target.locator('[data-revenue-apply]').click()
    expect(target.locator('[data-name]')).to_have_attribute('aria-invalid','true')
    target.locator('[data-name]').fill('최초 기여자')
    target.locator('[data-code]').fill('FIRST-'+str(width))
    with record_response(page,'/revenue',None) as revenue_event:
        target.locator('[data-revenue-apply]').click()
    assert revenue_event.value.ok,revenue_event.value.text()
    expect(target.locator('[data-revenue-note]')).to_contain_text('저장했어요')
    receipt['geometry']['revenue']=geometry(target,width)
    shared_button=button_design(target,'[data-revenue-apply]')
    page.locator('#live-reload').click()
    target=frame(page)
    expect(target.locator('[data-name]')).to_have_value('최초 기여자')
    expect(target.locator('[data-rate]')).to_have_value('100')
    receipt['checks']['revenueReloadedFromDb']=True

    target=open_screen(page,'member-email-templates','operator')
    expect(target.locator('[data-email-save]')).to_be_enabled()
    target.locator('[data-email-subject]').fill('회원가입 완료 안내 '+str(width))
    target.locator('[data-email-body]').fill('{회원명}님, 가입이 완료되었습니다.\n사업장을 확인해 주세요.')
    with record_response(page,'/email-templates',None) as email_event:
        target.locator('[data-email-save]').click()
    assert email_event.value.ok,email_event.value.text()
    expect(target.locator('[data-email-status]')).to_contain_text('저장했어요')
    receipt['geometry']['email']=geometry(target,width)
    page.locator('#live-reload').click()
    expect(frame(page).locator('[data-email-subject]')).to_have_value('회원가입 완료 안내 '+str(width))
    receipt['checks']['emailReloadedFromDb']=True

    # Compare new admin controls with the preserved operations component, not an
    # invented numeric token snapshot. This page is read only in the test.
    baseline=page.context.new_page()
    baseline.set_viewport_size({'width':width,'height':900})
    baseline.goto(exact_product_url(origin,run_id,'admin-settlements','summary','operator'))
    expected=button_design(baseline,'.ops-page .btn.primary')
    assert shared_button==expected,{'new':shared_button,'canonical':expected}
    baseline.close()
    receipt['checks']['canonicalAdminButtonDesign']=shared_button

    target=open_screen(page,'component-library','buyer')
    expect(target.locator('.qa-asset-card')).not_to_have_count(0)
    receipt['geometry']['libraryBoard']=geometry(target,width)
    target.locator('.qa-asset-card').filter(has=target.get_by_role('heading',name='이메일 입력',exact=True)).get_by_role('button',name='사용처와 동작 보기',exact=True).click()
    expect(target.locator('[data-component-runtime]')).to_contain_text('원본 화면과 런타임이 연결')
    source=target.locator('[data-component-source]')
    email=source.locator('[data-component-target]')
    email.fill('shared@example.test')
    expect(email).to_have_value('shared@example.test')
    expect(email.locator('xpath=ancestor::label[1]')).to_have_class(re.compile('has-value'))
    password=source.locator('input[type=password]').first
    password.fill('shared-field-test')
    source.locator('[data-action=password-visibility]').first.click()
    expect(source.locator('input[name=password]')).to_have_attribute('type','text')
    assert source.get_attribute('inert') is None
    assert source.locator('input[type=email]').evaluate("el=>!!el.closest('.field.is-floating')")
    receipt['checks']['libraryUsesWholeRootAndRuntime']=True
    target.locator('[data-qa-state=components]').first.click()
    target.locator('.qa-asset-card').filter(has=target.get_by_role('heading',name='선택·휠 피커',exact=True)).get_by_role('button',name='사용처와 동작 보기',exact=True).click()
    expect(target.locator('[data-source-usage="store-purchase/select/email"]')).to_have_count(1)
    receipt['checks']['newUsageIndexed']=True

    # Brand popover behaviour is independently covered by its dedicated test;
    # this verifies the new pages actually consume that same module.
    target=open_screen(page,'member-email-templates','operator')
    expect(target.locator('[data-order-account-trigger]')).to_have_count(1)
    target.locator('[data-order-account-trigger]').click()
    expect(target.locator('[data-obm-item=profile]')).to_be_visible()
    expect(target.locator('[data-obm-item=notifications]')).to_be_visible()
    expect(target.locator('[data-obm-item=manage]')).to_be_visible()
    target.locator('[data-order-account-trigger]').click()
    receipt['checks']['newHeaderUsesSharedAccountMenu']=True

    target.locator('#order-single').screenshot(path=str(OUT/f'common-email-{width}.png'))
    print(json.dumps(receipt,ensure_ascii=False),flush=True)
    return receipt


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    host=subprocess.Popen(['node','tests/product-lab-browser-host.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    receipts=[]
    try:
        origin=host.stdout.readline().strip()
        assert origin.startswith('http://127.0.0.1:'),origin
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            for width in (320,390,768,1440):
                context=browser.new_context(viewport={'width':max(1280,width+500),'height':1000},reduced_motion='reduce')
                page=context.new_page();errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                receipts.append(check(page,origin,width))
                assert not errors,errors
                context.close()
            browser.close()
        (OUT/'receipt.json').write_text(json.dumps({'result':'PASS','source':'canonical Pages + isolated D1','widths':receipts},ensure_ascii=False,indent=2))
    finally:
        host.terminate();host.wait(timeout=5)


if __name__=='__main__':
    main()
