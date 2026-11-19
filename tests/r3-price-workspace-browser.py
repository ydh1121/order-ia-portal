"""Real browser layout and interactions for the four-menu account price workspace."""
from pathlib import Path
import json, os, shutil, subprocess
from playwright.sync_api import expect, sync_playwright

evidence=Path('artifacts/price-workspace');evidence.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/r3-business-browser-host.mjs','--first-price'],stdout=subprocess.PIPE,text=True)
base=host.stdout.readline().strip();assert base.startswith('http://127.0.0.1:')
errors=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000},extra_http_headers={'x-test-subject':'supplier'})
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(base+'/ia?view=pricing-r3')
        expect(page.locator('[data-cost=raw]').first).to_be_visible()
        page.locator('[data-shell="1"]').click()
        assert page.locator('.pw-main-menu>li>button').all_text_contents()==['단가표','판매 상품','상품 분류','배송수단 및 운임']
        expect(page.locator('[data-cost=raw]').first).to_have_value('5980')
        wide=page.locator('.pw-cost-table').bounding_box()['width']
        page.locator('[data-grade=king]').click()
        expect(page.locator('[data-cost]')).to_have_count(38)
        narrow=page.locator('.pw-cost-table').bounding_box()['width']
        assert narrow<wide,{'all':wide,'king':narrow}
        page.locator('[data-cost=raw]').first.fill('7000')
        page.locator('#pw-pg-rate').fill('3.3');page.locator('[data-action=pg]').click()
        expect(page.locator('[data-cost=raw]').first).to_have_value('7231')
        page.locator('[data-action=pg]').click();expect(page.locator('[data-cost=raw]').first).to_have_value('7000')
        page.locator('[data-action=draft]').click();expect(page.locator('#pw-notice')).to_contain_text('임시저장했습니다')
        page.locator('[data-action=save]').click()
        expect(page.get_by_role('dialog')).to_contain_text('반영할까요')
        page.locator('.pw-dialog button[type=submit]').click();expect(page.locator('#pw-notice')).to_contain_text('반영했습니다')
        page.reload();expect(page.locator('[data-cost=raw]').first).to_be_visible();page.locator('[data-shell="1"]').click();expect(page.locator('[data-cost=raw]').first).to_have_value('7000')
        page.screenshot(path=evidence/'costs-desktop.png')
        page.locator('[data-section=classification]').click();page.locator('[data-class-tab=delivery]').click()
        page.locator('[data-class-cell="king/pack-6"]').click()
        page.locator('[data-class-cell="xl/pack-10"]').click(modifiers=['Shift'])
        expect(page.locator('.pw-selected')).to_have_count(4)
        page.locator('[data-class-cell="king/pack-6"]').click();expect(page.locator('.pw-selected')).to_have_count(3)
        page.screenshot(path=evidence/'shipping-selection-desktop.png')
        widths=[]
        for width in [320,390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            for menu in ['costs','products','classification','carriers']:
                page.locator('[data-section="'+menu+'"]').first.click()
                expect(page.locator('#pw-main h2')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,menu)
            widths.append(width)
            if width in [390,1440]:page.screenshot(path=evidence/('carriers-'+str(width)+'.png'))
        page.locator('[data-action=save]').click();page.locator('.pw-dialog [value=schedule]').check()
        expect(page.locator('.pw-schedule select[size="5"]')).to_have_count(5)
        expect(page.locator('.pw-schedule')).to_be_visible()
        page.screenshot(path=evidence/'schedule-wheel.png');page.locator('.pw-dialog [data-close]').first.click()
        assert not errors,errors
        (evidence/'receipt.json').write_text(json.dumps({'environment':'signed SQLite fixture; no production prices changed','widths':widths,'allTableWidth':wide,'filteredTableWidth':narrow,'saveReload':True,'pgReversible':True,'shiftSelection':True,'scheduleWheels':5,'pageErrors':errors},ensure_ascii=False,indent=2))
        browser.close()
finally:
    host.terminate();host.wait(timeout=5)
