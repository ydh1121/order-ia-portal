"""Three independent, signed identities use the real menu and document endpoints."""
from pathlib import Path
from tempfile import mkdtemp
from urllib.parse import parse_qs, urlparse
import struct
import zlib
import json
import os
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright

evidence = Path(os.getenv('R3_ROLE_EVIDENCE_DIR') or mkdtemp())
evidence.mkdir(parents=True, exist_ok=True)
host = subprocess.Popen(['node','tests/r3-business-browser-host.mjs'], stdout=subprocess.PIPE, text=True)
base = host.stdout.readline().strip()
assert base.startswith('http://127.0.0.1:')
errors = []
paths = {}
try:
    with sync_playwright() as p:
        chromium = p.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'), args=['--no-sandbox'])
        def persona(subject,width):
            context = chromium.new_context(viewport={'width':width,'height':900},extra_http_headers={'x-test-subject':subject})
            page = context.new_page()
            page.on('pageerror',lambda error: errors.append(str(error)))
            return page
        def visit(page,menu,case=None):
            page.goto(base+'/ia?view=roles-r3&menu='+menu+('&case='+case if case else ''))
            expect(page.locator('#role-menu a').first).to_be_visible()
            expect(page.locator('#r3-practice')).to_be_hidden()
        def act(page,action,memo=None):
            form = page.locator('#detail form').last
            form.locator('[name=action]').select_option(action)
            if memo: form.locator('[name=memo]').fill(memo)
            with page.expect_response(lambda r:r.url.endswith('/api/ia/r3-role') and r.request.method=='POST') as response:
                form.get_by_role('button',name='선택한 처리 확인').click()
            assert response.value.status==200, response.value.status
            expect(page.locator('#status')).to_have_text('저장했습니다.')
        buyer, operator, supplier, other = (persona('buyer',390),persona('operator',1440),persona('supplier',320),persona('buyer2',390))
        visit(buyer,'quotes')
        expect(buyer.locator('#role-menu')).not_to_contain_text('검토함')
        expect(buyer.locator('#queue-list')).to_contain_text('시험 특란')
        buyer.locator('#queue-list').get_by_role('button',name='상담 예약').click()
        new = buyer.locator('#create')
        assert new.locator('select[name=targets]').evaluate('(e)=>e.selectedOptions.length') == 1
        new.locator('[name=desiredDate]').fill('2027-01-05')
        new.locator('[name=memo]').fill('이번 발급 견적 상담')
        expect(new).to_have_attribute('data-draft-saved','1')
        buyer.reload()
        expect(new.locator('[name=memo]')).to_have_value('이번 발급 견적 상담')
        new.get_by_role('button',name='작성 시작').click()
        expect(buyer.locator('#detail h2')).to_have_text('상담 · 작성 중')
        case=parse_qs(urlparse(buyer.url).query)['case'][0]
        act(buyer,'submit')
        expect(buyer.locator('#detail h2')).to_have_text('상담 · 상담 접수')
        visit(operator,'review')
        operator.locator('#list').get_by_role('button',name='상담 · 상담 접수').click()
        expect(operator.locator('#detail dl')).to_contain_text('이번 발급 견적 상담')
        expect(operator.locator('#detail dl')).to_contain_text('시험 특란')
        act(operator,'respond','운영자가 상담 가능일을 확인했습니다.')
        expect(operator.locator('#detail h2')).to_have_text('상담 · 답변 확인')
        visit(buyer,'activity')
        buyer.locator('#list').get_by_role('button',name='상담 · 답변 처리').click()
        expect(buyer.locator('#detail')).to_contain_text('운영자가 상담 가능일을 확인했습니다.')
        act(buyer,'resolve')
        buyer.reload()
        expect(buyer.locator('#detail h2')).to_have_text('상담 · 종료')
        visit(supplier,'supply')
        expect(supplier.locator('#role-menu')).to_contain_text('상품·단가표')
        expect(supplier.locator('#role-menu')).not_to_contain_text('내 견적·오더패스')
        assert supplier.request.get(base+'/api/ia/r3-role?context=1&id='+case).status==404
        visit(other,'quotes')
        expect(other.locator('#queue-list')).not_to_contain_text('시험 특란')
        assert other.request.get(base+'/api/ia/r3-role?context=1&id='+case).status==404
        visit(buyer,'quotes')
        buyer.locator('#queue-list').get_by_role('button',name='납품 요청').click()
        buyer.locator('#create').get_by_role('button',name='작성 시작').click()
        expect(buyer.locator('#detail h2')).to_have_text('납품 신청 · 작성 중')
        delivery=parse_qs(urlparse(buyer.url).query)['case'][0]
        act(buyer,'submit')
        for page,menu,action,state in [
            (operator,'review','accept','요청 수락'),(buyer,'delivery','payment-request','입금 검토 요청'),
            (operator,'review','payment-review','입금 검토 완료'),(supplier,'delivery','schedule','일정 확인'),
            (supplier,'delivery','dispatch','출고 확인'),(buyer,'delivery','receive','수령 확인'),
            (operator,'settlement','document-review','거래 문서 검토 완료'),(supplier,'settlement','settlement-review','정산 검토 대기'),
            (operator,'settlement','supplement','거래 문서 검토 완료'),(supplier,'settlement','settlement-review','정산 검토 대기'),
            (operator,'settlement','settle','정산 검토 완료')]:
            if action=='document-review':
                visit(supplier,'settlement',delivery)
                # A synthetic monochrome PNG goes into the actual local raster editor.
                chunk=lambda k,d:struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
                png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\0\0\0\xff'))+chunk(b'IEND',b'')
                supplier.locator('#detail input[type=file]').set_input_files({'name':'fixture-proof.png','mimeType':'image/png','buffer':png})
                expect(supplier.locator('#detail canvas')).to_be_visible()
                supplier.locator('#detail input[type=checkbox]').check()
                supplier.get_by_role('button',name='가림 처리본 제출').click()
                expect(supplier.get_by_role('button',name='연결된 증빙 열기')).to_be_visible()
            visit(page,menu,delivery);act(page,action)
            expect(page.locator('#detail h2')).to_have_text('납품 신청 · '+state)
        visit(buyer,'quotes')
        expect(buyer.locator('#queue-list')).to_contain_text('정산 검토 완료')
        expect(buyer.locator('#queue-list').get_by_role('button',name='납품 내역')).to_be_visible()
        expect(buyer.locator('#queue-list').get_by_role('button',name='납품 요청')).to_have_count(0)
        admin=operator.locator('#publication')
        for enabled in [True,False]:
            admin.get_by_role('checkbox').set_checked(enabled)
            admin.get_by_role('button').click()
            expect(operator.locator('#status')).to_have_text('공개 설정을 저장했습니다.')
            assert operator.request.get(base+'/api/order/features').json()=={'orderMenu':enabled}
        for subject,page,width in [('buyer',buyer,390),('supplier',supplier,320),('operator',operator,1440)]:
            assert page.locator('html').evaluate('(el)=>el.scrollWidth')<=width
            page.screenshot(path=evidence/('ROLE_MENU_'+subject+'.png'),full_page=True)
            paths[subject]=urlparse(page.url).query
        assert not errors, errors
        chromium.close()
    (evidence/'BROWSER_SIGNED_ROLE_MENU.json').write_text(json.dumps({'fixture':'generated signed Access subjects, real product handlers and SQLite; loopback only','cases':{'consultation':case,'delivery':delivery},'journeys':['buyer quote → consult → operator review → notification → close; other organizations denied','buyer issued quote → delivery → receipt → document review → settlement supplementation + completion','operator publishes and withdraws the default-off global menu'],'endpoints':paths,'browserErrors':errors},ensure_ascii=False,indent=2)+'\n')
    print('PASS signed cross-role browser workflows',list(paths))
finally:
    host.terminate()
