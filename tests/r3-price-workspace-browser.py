"""Real browser layout and interactions for the four-menu account price workspace."""
from pathlib import Path
import json, os, shutil, subprocess
from playwright.sync_api import expect, sync_playwright

evidence=Path('artifacts/price-workspace');evidence.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/r3-business-browser-host.mjs','--first-price'],stdout=subprocess.PIPE,text=True)
base=host.stdout.readline().strip();assert base.startswith('http://127.0.0.1:')
errors=[]

def settled_workspace_dialog(page):
    dialog=page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    # The shell fades the native dialog and backdrop for 200 ms. Visibility
    # alone can capture transparent content before that opening motion ends.
    page.wait_for_function("""() => {
        const dialog=document.querySelector('#pw-workspace-dialog[open]');
        const panel=dialog?.querySelector(':scope > .q4-regular-panel');
        return !!panel && getComputedStyle(dialog).opacity==='1'
            && getComputedStyle(panel).opacity==='1'
            && !dialog.getAnimations({subtree:true}).some(animation=>animation.pending||animation.playState==='running');
    }""")
    return dialog

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
        page.locator('[data-section=products]').click()
        expect(page.locator('.pw-product-table tbody tr')).to_have_count(160)
        def product_row(name):
            return page.locator('.pw-product-table tbody tr').filter(has=page.get_by_text(name,exact=True))
        product_row('1번 왕란 30구').locator('[data-product-price]').fill('8000')
        product_row('1번 특란 30구').locator('[data-product-price]').fill('10000')
        page.locator('[data-product-audience=consumer]').click()
        expect(page.locator('.pw-product-table tbody tr')).to_have_count(160)
        for name in ['1번 왕란 30구','1번 특란 30구','1번 왕란 6구']:
            product_row(name).locator('[data-consumer-select]').check()
        expect(page.locator('#pw-consumer-count')).to_have_text('3개 선택')
        page.locator('#pw-markup-value').fill('10');page.locator('[data-action=consumer-markup]').click()
        expect(page.get_by_role('dialog')).to_contain_text('2개 적용 · 1개 제외')
        page.locator('.pw-dialog [data-close]').first.click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(product_row('1번 왕란 30구').locator('[data-product-price]')).to_have_value('')
        page.locator('[data-action=consumer-markup]').click();page.locator('.pw-dialog button[type=submit]').click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(product_row('1번 왕란 30구').locator('[data-product-price]')).to_have_value('8800')
        expect(product_row('1번 특란 30구').locator('[data-product-price]')).to_have_value('11000')
        expect(product_row('1번 왕란 6구').locator('[data-product-price]')).to_have_value('')
        page.locator('#pw-markup-kind').select_option('amount');page.locator('#pw-markup-value').fill('250')
        page.locator('[data-action=consumer-markup]').click();page.locator('.pw-dialog button[type=submit]').click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(product_row('1번 왕란 30구').locator('[data-product-price]')).to_have_value('8250')
        expect(product_row('1번 특란 30구').locator('[data-product-price]')).to_have_value('10250')
        product_row('1번 왕란 30구').locator('[data-product-price]').fill('7999')
        expect(product_row('1번 왕란 30구').locator('[data-product-mode]')).to_have_text('직접 입력')
        page.screenshot(path=evidence/'consumer-markup-desktop.png')
        page.locator('[data-section=carriers]').click()
        for name,kind,fare in [('택배 QA','parcel','3000'),('화물 QA','freight','')]:
            page.locator('[data-action=add-carrier]').first.click()
            page.locator('.pw-dialog [name=name]').fill(name);page.locator('.pw-dialog [name=type]').select_option(kind)
            page.locator('.pw-dialog button[type=submit]').click();expect(page.get_by_role('dialog')).to_have_count(0)
            if fare:page.locator('[data-carrier-field=base]').fill(fare)
        def delivery_rule(unit,minimum,maximum,carrier):
            page.locator('[data-action=add-delivery-rule]').click()
            page.locator('.pw-dialog [name=package]').select_option('pack-30')
            page.locator('.pw-dialog [name=carrier]').select_option(label=carrier)
            page.locator('.pw-dialog [name=unit]').select_option(unit)
            page.locator('.pw-dialog [name=min]').fill(str(minimum));page.locator('.pw-dialog [name=max]').fill(str(maximum))
        delivery_rule('pack',1,10,'택배 QA')
        expect(page.locator('.pw-delivery-conversion')).to_have_text('1~10묶음 · 30~300알')
        page.locator('.pw-dialog button[type=submit]').click();expect(page.get_by_role('dialog')).to_have_count(0)
        delivery_rule('egg',360,660,'화물 QA')
        expect(page.locator('.pw-delivery-conversion')).to_have_text('360~660알 · 12~22묶음')
        page.locator('.pw-dialog button[type=submit]').click();expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.locator('[data-delivery-rule]')).to_have_count(2)
        delivery_rule('egg',300,360,'화물 QA')
        page.locator('.pw-dialog button[type=submit]').click()
        expect(page.locator('.pw-dialog-error')).to_contain_text('겹칩니다')
        expect(page.locator('[data-delivery-rule]')).to_have_count(2)
        expect(page.locator('.pw-delivery-conversion')).to_have_text('300~360알 · 10~12묶음')
        page.locator('.pw-dialog [data-close]').first.click();expect(page.get_by_role('dialog')).to_have_count(0)
        page.locator('[data-action=save]').click();page.locator('.pw-dialog button[type=submit]').click()
        expect(page.locator('#pw-notice')).to_contain_text('반영했습니다')
        page.reload();expect(page.locator('[data-cost=raw]').first).to_be_visible()
        page.locator('[data-section=products]').click();expect(page.locator('.pw-product-table tbody tr')).to_have_count(160)
        expect(product_row('1번 왕란 30구').locator('[data-product-price]')).to_have_value('8000')
        page.locator('[data-product-audience=consumer]').click()
        expect(product_row('1번 왕란 30구').locator('[data-product-price]')).to_have_value('7999')
        expect(product_row('1번 특란 30구').locator('[data-product-price]')).to_have_value('10250')
        page.locator('[data-section=carriers]').click();expect(page.locator('[data-delivery-rule]')).to_have_count(2)
        expect(page.locator('[data-delivery-rule]').nth(0)).to_contain_text('1~10묶음 · 30~300알')
        expect(page.locator('[data-delivery-rule]').nth(1)).to_contain_text('360~660알 · 12~22묶음')
        expect(page.locator('[data-delivery-rule]').nth(1)).to_contain_text('미입력')
        widths=[]
        for width in [320,390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            for menu in ['costs','products','classification','carriers']:
                page.locator('[data-section="'+menu+'"]').first.click()
                expect(page.locator('#pw-main h2')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,menu)
                if menu=='products':
                    expect(page.locator('[data-product-audience=consumer]')).to_have_attribute('aria-pressed','true')
                    box=page.locator('.pw-product-table').evaluate('(table)=>({table:table.scrollWidth,region:table.parentElement.clientWidth,overflow:getComputedStyle(table.parentElement).overflowX})')
                    assert box['overflow']=='auto',box
                    if width==320:
                        assert box['table']>box['region'],box
                        product_row('1번 특란 30구').locator('[data-consumer-select]').check()
                        page.locator('[data-action=consumer-markup]').click()
                        dialog=settled_workspace_dialog(page)
                        bounds=dialog.bounding_box()
                        assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,bounds
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,'consumer dialog')
                        page.screenshot(path=evidence/'consumer-markup-320.png')
                        page.locator('.pw-dialog [data-close]').first.click();expect(page.get_by_role('dialog')).to_have_count(0)
                        page.locator('[data-action=clear-consumer-selection]').click()
                if menu=='carriers' and width==320:
                    page.locator('[data-edit-delivery-rule]').first.click()
                    dialog=settled_workspace_dialog(page)
                    bounds=dialog.bounding_box()
                    assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,bounds
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,'delivery dialog')
                    page.screenshot(path=evidence/'delivery-rule-320.png')
                    page.locator('.pw-dialog [data-close]').first.click();expect(page.get_by_role('dialog')).to_have_count(0)
            widths.append(width)
            if width in [390,1440]:page.screenshot(path=evidence/('carriers-'+str(width)+'.png'))
        elbow=page.locator('#pw-nav ul ul>li').first.evaluate('(item)=>{const line=getComputedStyle(item,"::before"),list=getComputedStyle(item.parentElement);return {left:line.borderLeftWidth,bottom:line.borderBottomWidth,listLeft:list.borderLeftWidth,width:line.width,height:line.height}}')
        assert elbow['left']=='1px' and elbow['bottom']=='1px' and elbow['listLeft']=='0px',elbow
        page.locator('[data-action=save]').click();page.locator('.pw-dialog [value=schedule]').check()
        expect(page.locator('.pw-schedule select[size="5"]')).to_have_count(5)
        expect(page.locator('.pw-schedule')).to_be_visible()
        page.screenshot(path=evidence/'schedule-wheel.png');page.locator('.pw-dialog [data-close]').first.click()
        assert not errors,errors
        (evidence/'receipt.json').write_text(json.dumps({'environment':'signed SQLite fixture; no production prices changed','widths':widths,'allTableWidth':wide,'filteredTableWidth':narrow,'saveReload':True,'pgReversible':True,'shiftSelection':True,'catalogBusinessRows':160,'catalogConsumerRows':160,'consumerMarkup':{'percent':True,'amount':True,'cancelPreservesInput':True,'blankBaseSkipped':True,'manualOverride':True,'saveReload':True},'deliveryRules':{'packRange':[1,10],'eggRange':[360,660],'convertedPackRange':[12,22],'overlapRejected':True,'missingFarePreserved':True,'saveReload':True},'elbowConnector':elbow,'mobileDialogWidth':320,'scheduleWheels':5,'pageErrors':errors},ensure_ascii=False,indent=2))
        browser.close()
finally:
    host.terminate();host.wait(timeout=5)
