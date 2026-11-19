"""Exercise copied carrier data through the authenticated screen and the existing D1-shaped transaction."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import json,os,re,shutil,subprocess
from playwright.sync_api import sync_playwright,expect

root=Path(__file__).resolve().parents[1]
evidence=root/'artifacts/freight-browser'
evidence.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
try:
    cfg=json.loads(server.stdout.readline())
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
        page=browser.new_page(viewport={'width':390,'height':844})
        page.set_default_timeout(9000)
        page.goto(cfg['url']+'/ia?view=pricing-r3&mode=contract')
        page.locator('input[name=email]').fill(cfg['email'])
        page.locator('input[name=password]').fill(cfg['pass'])
        page.locator('button[type=submit]').click()
        page.locator('details.price-utilities > summary').click()
        page.get_by_role('link',name='연습 화면',exact=True).click()
        page.locator('#startPractice').click()
        expect(page.locator('#scope option')).to_have_count(1)
        page.locator('#practiceSample').click()
        page.locator('#shippingTab').click()
        carrier=page.locator('#carrier-editor')
        reference=carrier.get_by_label('공개표 선택')
        expect(reference.locator('option')).to_have_count(4)
        def capture_pair(name,focus):
            for width in [390,1440]:
                page.set_viewport_size({'width':width,'height':844})
                focus.scroll_into_view_if_needed()
                page.screenshot(path=str(evidence/f'{name}-{width}.png'))
        capture_pair('empty',reference)
        reference.select_option('SEMA_DISTANCE_VEHICLE_PUBLIC')
        expect(carrier.get_by_text('112개 요금',exact=False)).to_be_visible()
        reference.select_option('EPOST_PICKUP_PUBLIC')
        carrier.get_by_role('checkbox',name='우체국',exact=True).check()
        carrier.get_by_role('checkbox',name='한진',exact=True).check()
        carrier.get_by_role('button',name='선택한 운송사 추가').click()
        contract_list=carrier.locator('[data-contract-list]')
        expect(contract_list.locator('tbody tr')).to_have_count(2)
        expect(contract_list.locator('input:checked')).to_have_count(0)
        # Selecting an already copied source reopens its draft without duplicating it.
        carrier.get_by_role('button',name='계약표로 복사',exact=True).click()
        expect(contract_list.locator('tbody tr')).to_have_count(2)
        expect(carrier.get_by_label('계약 사용',exact=True)).not_to_be_checked()
        expect(carrier.get_by_label('요금 상태')).to_have_value('UNSET')
        # Distinct quantities belong to this practice product and the supplier's practice contract.
        for name,value in [('상자당 판수','5'),('한 상자 최대 총중량 (kg)','3'),('한 상자 부피 (㎥)','0.02'),('상자 세 변 합 (cm)','80'),('상자 최장변 (cm)','40')]:
            carrier.get_by_label(name,exact=True).fill(value)
        carrier.get_by_label('이 상품의 포장·적재값을 확인함').check()
        carrier.get_by_label('운송사·서비스 계약명').fill('운송 회귀 검수')
        carrier.get_by_label('계약 사용',exact=True).check()
        carrier.get_by_label('요금 상태').select_option('FEE')
        carrier.get_by_label('계약 시작일',exact=True).fill('2025-01-01')
        carrier.get_by_label('적용 시도·시군구').select_option('11')
        carrier.get_by_role('button',name='지역 추가',exact=True).click()
        carrier.get_by_label('해당 포장의 계란 수탁·온도 조건을 계약에서 확인함').check()
        carrier.get_by_label('권역·운임·중첩 할증·작업비·반올림 등 적용 조건을 확인함').check()
        carrier.get_by_role('spinbutton',name='계약 요금',exact=True).first.fill('137')
        rate=carrier.get_by_role('spinbutton',name='계약 요금',exact=True).first
        capture_pair('contract-rates',rate)
        markup=carrier.evaluate('''element=>{
          const clone=element.cloneNode(true);
          element.querySelectorAll('input,select').forEach((field,i)=>{
            const copy=clone.querySelectorAll('input,select')[i];
            if(field.tagName==='SELECT') [...copy.options].forEach((opt,j)=>opt.toggleAttribute('selected',j===field.selectedIndex));
            else if(field.type==='checkbox') copy.toggleAttribute('checked',field.checked);
            else copy.setAttribute('value',field.value);
          });
          return clone.outerHTML;
        }''')
        (evidence/'edited-contract.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>합성 계약 편집 검증</title>'+markup,encoding='utf-8')
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.split('?')[0].endswith('/supplier/version')) as result:
            page.locator('[data-action=save]').click()
        assert result.value.ok,result.value.text()
        expect(page.locator('#current')).to_contain_text('r1')
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/supplier/simulate')) as simulation:
            page.locator('#simulate').click()
        data=simulation.value.json()
        assert simulation.value.ok,data
        fee=data['issuer']['freight'][0]
        assert [fee['chosen']['name'],fee['chosen']['total'],fee['load']['TRAYS'],fee['load']['BOXES']]==['운송 회귀 검수','274',10,2]
        expect(contract_list.locator('tbody tr')).to_have_count(2)
        expect(contract_list.locator('input:checked')).to_have_count(1)
        expect(page.locator('#freightResult')).to_contain_text('운송 회귀 검수')
        expect(page.locator('#result')).to_contain_text('배송 274원')
        capture_pair('cost-review',page.locator('#freightResult'))
        destination=page.locator('#scenario [data-field=region]')
        # Only Seoul is in the isolated signed policy. Choose a named non-Seoul destination from the region register.
        alternate=destination.locator('option').evaluate_all("options=>options.find(o=>o.value&&!o.value.startsWith('11'))?.value")
        assert alternate
        destination.select_option(alternate)
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/supplier/simulate')) as denied:
            page.locator('#simulate').click()
        assert not denied.value.ok
        expect(page.locator('#freightResult')).to_contain_text('운송 회귀 검수')
        capture_pair('out-of-scope',page.locator('#freightResult'))
        destination.select_option('11')
        page.locator('[data-action=submit]').click()
        expect(page.locator('#current')).to_contain_text('r2')
        capture_pair('pending',page.locator('#current'))
        page.locator('#persona').select_option('operator')
        expect(page.locator('#versions option')).to_have_count(2)
        page.locator('#versions').select_option(index=1)
        page.locator('#open').click()
        expect(page.locator('#current')).to_contain_text('r2')
        page.locator('[data-action=approve]').click();expect(page.locator('#current')).to_contain_text('r3')
        page.locator('#next').click()
        expected=carrier.get_by_role('spinbutton',name='계약 요금',exact=True).first
        expected.fill('139')
        expect(expected.locator('xpath=..')).to_have_class('is-changed')
        capture_pair('previous-comparison',expected)
        page.locator('#persona').select_option('buyer');expect(page.locator('#buyerSite option')).to_have_count(2);page.locator('#buyerSite').select_option(index=1)
        expect(page.locator('#offerSelect option')).to_have_count(1)
        page.locator('#quoteQty').fill('10')
        page.locator('#quoteDay').fill((datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat())
        # Hold only the delivery of the genuine signed response. The operation still
        # issues one immutable server snapshot; the pending player cannot manufacture it.
        pending=[]
        quote_url='**/api/ia/r3-price/**/quote'
        page.route(quote_url,lambda route:pending.append(route))
        page.locator('#quoteIssue').click()
        wait=page.locator('#quotePending')
        expect(wait).to_have_attribute('data-emitted',re.compile(r'^(?:[4-9]|[1-9]\d+)$'),timeout=12000)
        expect(wait.locator('[data-banner-index]')).to_have_count(3)
        assert int(wait.get_attribute('data-visual-ms'))>=4990
        request_id=wait.get_attribute('data-wait-request')
        assert len(pending)==1 and pending[0].request.method=='POST'
        response=pending[0].fetch();assert response.ok,response.text()
        pending[0].fulfill(response=response);page.unroute(quote_url)
        expect(wait).to_be_hidden()
        expect(page.locator('#buyerResult')).to_contain_text('524원')
        assert '운송 회귀 검수' not in page.locator('#buyerResult').inner_text()
        page.reload();page.locator('#persona').select_option('buyer');page.locator('#buyerSite').select_option(index=1)
        page.locator('#quoteHistory option').first.wait_for(state='attached')
        # Recall an issued quote, disconnect before its response and retry the same
        # authorized read. A cancelled read cannot repaint or issue another quote.
        pending.clear();recall='**/api/ia/r3-price/**/quote?id=*'
        page.route(recall,lambda route:pending.append(route))
        page.get_by_role('button',name='다시 보기').click()
        expect(wait).to_have_attribute('data-phase','entry');old=wait.get_attribute('data-wait-request')
        page.context.set_offline(True)
        expect(wait).to_have_attribute('data-phase','offline')
        expect(wait.locator('[data-banner-index]')).to_have_count(0)
        for route in pending: route.abort()
        page.unroute(recall);page.context.set_offline(False)
        page.locator('#retryQuote').click()
        expect(wait).to_have_attribute('data-phase','complete');assert old!=wait.get_attribute('data-wait-request')
        expect(page.locator('#buyerResult')).to_contain_text('524원')
        (evidence/'receipt.json').write_text(json.dumps({'scope':'isolated synthetic practice data, browser on 390 and 1440 px','referenceCounts':[4,137,12],'serviceRows':112,'trays':10,'boxes':2,'shipping':'274','quotedTotal':'524','realBusinessAccountVerified':False,'ownerAcceptance':None},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('PASS freight reference 4/137, Sema 112, copied reference remains inactive, signed review → approved contract, 10 trays/2 boxes, freight 274 + merchandise 250 = 524, immutable snapshot reload')
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
