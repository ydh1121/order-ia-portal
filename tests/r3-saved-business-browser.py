"""Account address book and both real Q3 forms, using independently signed fixtures."""
from pathlib import Path
import json, os, shutil, subprocess
from playwright.sync_api import expect, sync_playwright

evidence=Path('artifacts/saved-businesses')
evidence.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/r3-business-browser-host.mjs','--first-price'],stdout=subprocess.PIPE,text=True)
base=host.stdout.readline().strip()
assert base.startswith('http://127.0.0.1:')
errors=[]
def q3(quote,mode):
    with quote.expect_response(lambda r:r.url.endswith('/api/ia/r3-role/businesses') and r.request.method=='GET') as address_book:
        quote.goto(base+'/ia?view='+mode+'-r3#/form')
        expect(quote.locator('html')).to_have_attribute('data-storage-ready','true')
        stage=quote.locator('#section-q3 > .accordion-trigger')
        if stage.get_attribute('aria-expanded')!='true':
            stage.click()
    assert address_book.value.ok
    return quote.locator('.r3-saved-business-actions')

def site_fields(quote):
    dialog=quote.locator('#site-editor-dialog')
    expect(dialog).to_be_visible()
    fields=dialog.locator('[data-q3-field]')
    def positions():
        return fields.evaluate_all("""fields=>Object.fromEntries(fields.map(group=>{
          const label=group.querySelector('label'),target=label.control;
          const paint=target.closest('.order-phone-field')||target;
          const a=label.getBoundingClientRect(),b=paint.getBoundingClientRect();
          return [group.dataset.q3Field,{label:label.innerText,gap:b.top-a.bottom,left:a.left,targetLeft:b.left,transform:getComputedStyle(label).transform}];
        }))""")
    for item in positions().values():
        assert item['transform']=='none' and item['gap']>=0,item
    dialog.locator('#site-name').fill('입력 상태 확인')
    dialog.locator('#site-email').fill('test@example.com')
    dialog.locator('label[for=site-name]').click()
    expect(dialog.locator('#site-name')).to_be_focused()
    for item in positions().values():
        assert item['transform']=='none' and item['gap']>=0,item
    dialog.locator('#site-name').fill('')
    dialog.locator('#site-email').fill('')
    dialog.locator('#cancel-site').click()
    expect(dialog).not_to_be_visible()
    expect(quote.locator('#add-site')).to_be_focused()

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce',extra_http_headers={'x-test-subject':'unassigned'})
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(base+'/ia?view=businesses-r3')
        expect(page.locator('#business-count')).to_have_text('0개')
        for mode in ['detailed','simple']:
            empty=context.new_page()
            empty.set_viewport_size({'width':390,'height':844})
            row=q3(empty,mode)
            expect(row.get_by_role('button')).to_have_count(1)
            new=row.get_by_role('button',name='신규 사업장 추가',exact=True)
            expect(new).to_be_visible()
            assert abs(row.bounding_box()['width']-new.bounding_box()['width'])<2
            empty.screenshot(path=evidence/(mode+'-q3-no-saved.png'))
            new.click()
            if mode=='simple':
                expect(empty.locator('#simple-site-count')).to_have_value('2')
                expect(empty.locator('#simple-site-count')).to_be_focused()
            else:
                empty.screenshot(path=evidence/'detailed-q3-new-form.png')
                site_fields(empty)
            empty.close()
        for field,value in [('name','자동검사 사업장'),('road','시험 소재지'),('detail','2층'),('contactName','시험 담당자'),('contactPhone','01000000000'),('dropoff','입구 오른쪽')]:
            page.locator('#business-'+field).fill(value)
        page.locator('#region-root').select_option(label='서울특별시')
        page.locator('#region-leaf').select_option(label='종로구')
        with page.expect_response(lambda r:r.url.endswith('/api/ia/r3-role/businesses') and r.request.method=='POST') as saved:
            page.get_by_role('button',name='저장',exact=True).click()
        assert saved.value.status==200
        expect(page.locator('#business-status')).to_have_text('사업장을 저장했습니다.')
        page.reload()
        expect(page.locator('.business-card')).to_contain_text('자동검사 사업장')
        page.screenshot(path=evidence/'business-directory-desktop.png')
        other=browser.new_context(extra_http_headers={'x-test-subject':'supplier2'}).new_page()
        other.goto(base+'/ia?view=businesses-r3')
        expect(other.locator('#business-count')).to_have_text('0개')
        results=[]
        for mode,width in [('simple',390),('detailed',1280)]:
            quote=context.new_page();quote.set_viewport_size({'width':width,'height':900})
            quote.on('pageerror',lambda error:errors.append(str(error)))
            row=q3(quote,mode)
            saved=row.get_by_role('button',name='저장된 사업장 추가',exact=True)
            new=row.get_by_role('button',name='신규 사업장 추가',exact=True)
            expect(saved).to_be_visible()
            bounds=[button.bounding_box() for button in [saved,new]]
            left,right=bounds
            assert abs(left['y']-right['y'])<2 and left['x']+left['width']<=right['x'] and abs(left['width']-right['width'])<2,bounds
            assert saved.evaluate('e=>getComputedStyle(e).backgroundColor')!=new.evaluate('e=>getComputedStyle(e).backgroundColor')
            quote.screenshot(path=evidence/(mode+'-q3-with-saved.png'))
            saved.click()
            dialog=quote.get_by_role('dialog',name='저장된 사업장',exact=True)
            expect(dialog).to_contain_text('자동검사 사업장')
            dialog.get_by_role('checkbox').check()
            dialog.get_by_role('button',name='불러오기',exact=True).click()
            expect(dialog).not_to_be_visible()
            if mode=='simple':
                expect(quote.locator('#simple-site-count')).to_have_value('1')
                assert quote.evaluate('window.OrderSimpleQuoteReview.inspect().state.sharedRegion')=='서울특별시 종로구'
            else:
                expect(quote.locator('#q3-sites')).to_contain_text('자동검사 사업장')
                assert quote.evaluate('window.OrderRegularQ4Bridge.committed.locations[0].basicInfoDraft') is True
            quote.reload()
            expect(quote.locator('html')).to_have_attribute('data-storage-ready','true')
            if mode=='detailed':
                assert quote.evaluate('window.OrderRegularQ4Bridge.committed.locations[0].name')=='자동검사 사업장'
            else:
                assert quote.evaluate('window.OrderSimpleQuoteReview.inspect().state.sharedRegion')=='서울특별시 종로구'
            assert quote.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            quote.screenshot(path=evidence/(mode+'-q3.png'))
            results.append({'mode':mode,'width':width,'accountLoad':True,'durableAfterReload':True,'commercialGrant':False})
            quote.close()
        assert not errors,errors
        (evidence/'receipt.json').write_text(json.dumps({'environment':'signed SQLite fixture; no production records','accountIsolation':True,'routes':results,'pageErrors':errors},ensure_ascii=False,indent=2))
        browser.close()
finally:
    host.terminate();host.wait(timeout=5)
