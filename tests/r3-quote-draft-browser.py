"""Real quote source + revisioned draft APIs in a physically separate SQLite lab.
No route mocks, injected result states, real credentials or production writes.
"""
from pathlib import Path
import json, os, re, shutil, subprocess, time
from playwright.sync_api import expect, sync_playwright

evidence=Path('artifacts/quote-draft');evidence.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/product-lab-browser-host.mjs'],stdout=subprocess.PIPE,text=True)
base=host.stdout.readline().strip();assert base.startswith('http://127.0.0.1:')
errors=[]

def listen(page):
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    return page

def ready(page):
    expect(page.locator('html')).to_have_attribute('data-storage-ready','true')
    page.wait_for_function("()=>window.ORDER_QUOTE_DRAFT_SYNC && ['ready','saved'].includes(window.ORDER_QUOTE_DRAFT_SYNC.inspect().state)")

def remote(page,mode):
    return page.evaluate("mode=>window.ORDER_APP_ADAPTER.request('/drafts/'+mode)",mode)

def saved_draft(page,mode,matches,description):
    # wait_for_function treats a returned Promise as truthy before it settles.
    # evaluate awaits each real API response; poll its data and the synchronous
    # UI state together instead of resolving on an async predicate's Promise.
    deadline=time.monotonic()+30
    last=None;state=None
    while time.monotonic()<deadline:
        last=remote(page,mode)
        state=page.evaluate("()=>window.ORDER_QUOTE_DRAFT_SYNC.inspect()")
        if state['state']=='saved' and matches(last.get('data')):
            return last
        page.wait_for_timeout(100)
    raise AssertionError({'expected':description,'mode':mode,'sync':state,'remote':last})

def saved_value(page,mode,field,value):
    return saved_draft(page,mode,lambda data:bool(data and data.get('lines') and data['lines'][0].get(field)==value),field+'='+value)

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':900},reduced_motion='reduce')
        home=listen(context.new_page());home.goto(base+'/__lab-test-session')
        home.locator('#live-create').click()
        home.locator('#live-dialog input').fill('R1 모드별 초안 검사')
        home.get_by_role('button',name='생성',exact=True).click()
        expect(home.locator('#live-dialog')).not_to_be_visible()
        home.wait_for_function("()=>document.querySelector('#live-run').value!==''")
        run=home.locator('#live-run').input_value()
        quote=listen(context.new_page())
        quote.goto(base+'/ia?view=simple-r3&labRun='+run+'&persona=buyer#/home');ready(quote)
        assert remote(quote,'simple')['data'] is None
        quote.locator('#start').click()
        for field,value in [('housing','4'),('size','특란'),('pack','30')]:
            quote.locator('[data-pick="'+field+'"][data-value="'+value+'"]').click()
        quote.locator('[data-line-qty]').fill('17');quote.locator('[data-line-price]').fill('8000')
        saved=saved_value(quote,'simple','price','8000')
        assert saved['data']['lines'][0]['qty']=='17'
        quote.screenshot(path=evidence/'simple-autosaved-390.png')
        quote.reload();ready(quote)
        assert remote(quote,'simple')['data']['lines'][0]['price']=='8000'
        quote.locator('#quote-mode-switch').click()
        modal=quote.locator('#quote-mode-dialog[open]')
        expect(modal.locator('[data-mode-option]')).not_to_be_checked()
        modal.locator('[data-mode-cancel]').click();expect(modal).not_to_be_visible()
        assert remote(quote,'detailed')['data'] is None
        quote.locator('#quote-mode-switch').click();modal.locator('label').click();expect(modal.locator('[data-mode-option]')).to_be_checked();modal.locator('[data-mode-confirm]').click()
        quote.wait_for_url(re.compile(r'.*[?&]view=detailed-r3.*'));ready(quote)
        detailed=remote(quote,'detailed')
        assert detailed['data']['lines'][0]['price']=='8000' and 'simpleQuote' not in detailed['data']
        quote.set_viewport_size({'width':1280,'height':900})
        quote.locator('#section-q2 > .accordion-trigger').click() if quote.locator('[data-line-price]').is_hidden() else None
        quote.locator('[data-line-price]').fill('8800');saved_value(quote,'detailed','price','8800')
        assert remote(quote,'simple')['data']['lines'][0]['price']=='8000'
        quote.screenshot(path=evidence/'detailed-autosaved-1280.png')

        # A fresh browser profile loads the same server draft. Its older revision
        # then loses a race, keeping the visible input until a deliberate choice.
        second=browser.new_context(viewport={'width':390,'height':900},reduced_motion='reduce',storage_state={'cookies':context.cookies(),'origins':[]})
        other=listen(second.new_page());other.goto(base+'/ia?view=detailed-r3&labRun='+run+'&persona=buyer#/form');ready(other)
        assert remote(other,'detailed')['data']['lines'][0]['price']=='8800'
        quote.locator('[data-line-price]').fill('8900');saved_value(quote,'detailed','price','8900')
        if other.locator('[data-line-price]').is_hidden():other.locator('#section-q2 > .accordion-trigger').click()
        other.locator('[data-line-price]').fill('9300')
        expect(other.locator('.r3-draft-status')).to_have_attribute('data-state','conflict')
        expect(other.locator('[data-line-price]')).to_have_value(re.compile(r'9,?300'))
        assert remote(other,'detailed')['data']['lines'][0]['price']=='8900'
        other.screenshot(path=evidence/'conflict-input-kept-390.png')
        other.get_by_role('button',name='현재 입력으로 서버 초안 변경',exact=True).click();saved_value(other,'detailed','price','9300')
        quote.reload();ready(quote)
        assert remote(quote,'detailed')['data']['lines'][0]['price']=='9300'

        # Each lab persona gets the same server implementation with a distinct
        # server-selected identity, so operator input cannot read buyer drafts.
        separate=listen(context.new_page());separate.goto(base+'/ia?view=detailed-r3&labRun='+run+'&persona=operator#/form');ready(separate)
        assert remote(separate,'detailed')['data'] is None

        directory=listen(context.new_page());directory.goto(base+'/ia?view=businesses-r3&labRun='+run+'&persona=buyer')
        expect(directory.locator('#business-count')).to_have_text('1개')
        expect(directory.locator('#business-list')).to_contain_text('실험 매장')
        for field,value in [('name','초안 검사 사업장'),('road','테스트 소재지'),('contactName','검사 담당자')]:directory.locator('#business-'+field).fill(value)
        directory.locator('#region-root').select_option(label='서울특별시');directory.locator('#region-leaf').select_option(label='종로구')
        directory.get_by_role('button',name='저장',exact=True).click();expect(directory.locator('#business-status')).to_have_text('사업장을 저장했습니다.')
        expect(directory.locator('#business-count')).to_have_text('2개')
        expect(directory.locator('#business-list')).to_contain_text('실험 매장')
        widths=[]
        for width in [320,390,768,1440]:
            directory.set_viewport_size({'width':width,'height':900})
            assert directory.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
            widths.append(width)
        assert directory.locator('#business-name').evaluate("e=>getComputedStyle(e).color")=='rgb(25, 31, 40)'
        assert directory.locator('button[type=submit]').evaluate("e=>getComputedStyle(e).backgroundColor")=='rgb(49, 93, 230)'
        directory.screenshot(path=evidence/'business-common-style-1440.png')
        quote.locator('#section-q3 > .accordion-trigger').click()
        quote.get_by_role('button',name='저장된 사업장 추가',exact=True).click()
        picker=quote.get_by_role('dialog',name='저장된 사업장',exact=True)
        expect(picker).to_have_attribute('data-modal-role','selection')
        assert quote.evaluate("window.OrderModalShell.activeIds.includes('saved-business-picker')")
        expect(picker.get_by_role('checkbox')).to_have_count(2)
        picker.locator('label').filter(has_text='초안 검사 사업장').get_by_role('checkbox').check()
        expect(picker.locator('label').filter(has_text='실험 매장').get_by_role('checkbox')).not_to_be_checked()
        picker.get_by_role('button',name='불러오기',exact=True).click()
        expect(picker).not_to_be_visible();expect(quote.locator('#q3-sites')).to_contain_text('초안 검사 사업장')
        saved_draft(quote,'detailed',lambda data:any(site.get('name')=='초안 검사 사업장' for site in (data or {}).get('locations',[])),'selected Q3 business persisted')
        assert not errors,errors
        (evidence/'receipt.json').write_text(json.dumps({'environment':'Actual Pages routes + canonical quote source + isolated SQLite lab; production DB untouched','simpleReload':True,'detailedReload':True,'defaultOptIn':False,'optInCopyPreserved':True,'modeIsolation':True,'accountIsolation':True,'staleRevisionInputPreserved':True,'explicitConflictChoice':True,'sharedQ3Modal':True,'businessLayoutWidths':widths,'dsColorsVerified':True,'pageErrors':errors},ensure_ascii=False,indent=2))
        browser.close()
finally:
    host.terminate();host.wait(timeout=5)
