"""Drive protected original admin/common review frames, with isolated, controlled outcomes."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click

root=Path(__file__).resolve().parents[1]
out=root/'artifacts/motion-runtime'
out.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
evidence=[]
try:
    c=json.loads(host.stdout.readline())
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium'))
        for width,reduced in [(390,'reduce'),(1440,'no-preference')]:
            ctx=browser.new_context(viewport={'width':width,'height':900},reduced_motion=reduced)
            page=ctx.new_page()
            page.goto(c['url']+'/ia?view=qa-lab&screen=login%2Fempty%2Femail')
            page.locator('input[name=email]').fill(c['email'])
            page.locator('input[name=password]').fill(c['pass'])
            page.locator('button[type=submit]').click()
            page.wait_for_url('**/ia?view=qa-lab**')
            screens=ReviewScreens(page,c['url'],width)
            frame=screens.screen('common','default')
            doc=frame.locator('#order-single')
            expect(doc).to_have_attribute('data-motion-runtime','admin-common')
            doc.evaluate("""el=>{window.__steps=[];el.addEventListener('r3:async-state',e=>window.__steps.push({...e.detail,t:performance.now()}));}""")
            def scenario(mode,navigates=False):
                page.locator('#points').click()
                detail=page.locator('#motion-review')
                if not detail.evaluate('el=>el.open'):
                    detail.locator(':scope > summary').click()
                detail.locator(f'button[data-motion-mode="{mode}"]').click()
                if not navigates:
                    expect(page.locator('#motion-note')).to_contain_text('검수 입력')
                    page.locator('#close-drawer').click()
            save=frame.locator('[data-action=save-demo]')
            scenario('delay')
            frame_click(page,save)
            expect(save).to_have_attribute('data-async-phase','pending')
            save.press('Enter')
            assert doc.evaluate("el=>window.__steps.filter(e=>e.phase==='pending').length")==1
            scenario('complete')
            expect(save).to_have_attribute('data-async-phase','success')
            scenario('error')
            load=frame.locator('[data-action=load-demo]')
            frame_click(page,load)
            expect(load).to_have_attribute('data-async-phase','error')
            expect(doc.locator('.t-skel')).to_have_class(re.compile('is-revealed'))
            scenario('normal')
            frame_click(page,frame.locator('[data-action=error-demo]'))
            expect(doc.locator('[name=demo-name]')).to_have_attribute('aria-invalid','true')
            expect(doc.locator('.inline-field-state')).to_be_hidden()
            toggle=doc.locator('[role=switch]')
            frame_click(page,toggle)
            expect(toggle).to_have_attribute('aria-checked','true')
            frame_click(page,frame.locator('[data-action=resize-demo]'))
            expect(doc.locator('.demo-resize')).to_have_class(re.compile('is-compact'))
            frame_click(page,frame.locator('[data-action=toggle-options]'))
            expect(doc.locator('.common-options')).to_have_class(re.compile('is-open'))
            option=doc.locator('[data-option]').first
            name=option.text_content()
            frame_click(page,option)
            expect(doc.locator('[data-action=toggle-options]')).to_have_text(name)
            steps=doc.evaluate('el=>window.__steps')
            assert [s['phase'] for s in steps]==['pending','success','pending','error'],steps
            assert all(s['source']=='controlled-qa' for s in steps)
            assert steps[0]['requestId']==steps[1]['requestId'] and steps[2]['requestId']==steps[3]['requestId']
            doc.screenshot(path=out/f'common-{width}.png',animations='disabled')
            record={'width':width,'motionPreference':reduced,'commonPhases':steps}
            if width==1440:
                f=screens.screen('admin-overview','normal')
                panel=f.locator('#order-single')
                collapse=panel.locator('[data-qa-action=collapse-sidebar]')
                frame_click(page,collapse)
                expect(collapse).to_have_attribute('aria-expanded','false')
                frame_click(page,collapse)
                sub=panel.locator('[data-qa-action=toggle-submenu]')
                frame_click(page,sub)
                expect(sub).to_have_attribute('aria-expanded','true')
                frame_click(page,sub)
                nav=panel.locator('.qa-admin-nav-item').nth(1)
                nav.focus()
                expect(panel.locator('.qa-nav-hover')).to_have_css('opacity','1')
                legend=panel.locator('.qa-donut-legend button').first
                legend.focus()
                expect(panel.locator('.qa-donut strong')).to_have_text(legend.locator('strong').text_content())
                frame_click(page,panel.locator('.qa-cost-day').nth(1))
                expect(panel.locator('.qa-chart-tip')).to_contain_text('비용 미제공')
                grid=panel.locator('.qa-widget-grid')
                first=grid.locator(':scope > section').first.locator('h2').text_content()
                frame_click(page,panel.get_by_role('button',name='위젯 배치'))
                frame_click(page,panel.get_by_role('button',name='뒤로',exact=True))
                assert grid.locator(':scope > section').nth(1).locator('h2').text_content()==first
                frame_click(page,panel.get_by_role('button',name='너비 변경'))
                expect(grid.locator('.qa-widget-expanded')).to_have_count(1)
                frame_click(page,panel.get_by_role('button',name='배치 적용'))
                expect(panel.get_by_role('button',name='위젯 배치')).to_be_visible()
                page.reload()
                expect(grid.locator(':scope > section').nth(1).locator('h2')).to_have_text(first)
                expect(grid.locator('.qa-widget-expanded')).to_have_count(1)
                panel.screenshot(path=out/'admin-overview-1440.png',animations='disabled')
                loading=screens.screen('admin-overview','loading')
                expect(loading.locator('[data-async-region=pending]')).to_be_visible()
                scenario('complete',navigates=True)
                expect(page).to_have_url(re.compile('admin-overview(?:%2F|/)normal'))
                expect(loading.locator('.qa-widget-grid')).to_be_visible()
                loading=screens.screen('admin-overview','loading')
                expect(loading.locator('[data-async-region=pending]')).to_be_visible()
                scenario('offline',navigates=True)
                expect(page).to_have_url(re.compile('admin-overview(?:%2F|/)error'))
                expect(loading.locator('[data-qa-action=retry-overview]')).to_be_visible()
                f=screens.screen('admin-buyers','list')
                q=f.locator('[name=operationsSearch]')
                q.fill('두 번째')
                expect(f.locator('.ops-table tbody tr:visible')).to_have_count(1)
                f=screens.screen('admin-analytics','normal')
                item=f.locator('.ops-funnel button').nth(2)
                item.focus()
                expect(f.locator('.ops-chart-output')).to_have_text(re.compile(item.locator('span').text_content()))
                receipt=screens.screen('receipt','before')
                frame_click(page,receipt.locator('[data-qa-action=issue-receipt]'))
                expect(receipt.locator('.qa-receipt')).to_have_attribute('data-state','issuing')
                expect(receipt.locator('.qa-receipt-paper')).to_have_css('animation-name','qaPrintReceipt')
                expect(receipt.locator('.qa-receipt')).to_have_attribute('data-state','complete')
                with page.expect_download() as download:
                    frame_click(page,receipt.get_by_role('button',name='검수용 영수증 예시 HTML 저장'))
                content=Path(download.value.path()).read_text()
                assert 'frame-meta' in content and '정산 영수증' in content and '<iframe' not in content
                assert not re.search(r'<script(?! type="application/json")',content)
                record['admin']=['sidebar','submenu','shared hover background','ring keyboard','masked chart','widget layout reapplied on same-tab reload','filtered list','metric index']
                record['receiptDownload']={'type':'projected review HTML','name':download.value.suggested_filename,'commercialDocumentIssued':False}
                record['selectedLoading']=['held until controlled response','complete → normal','offline → retry state']
            evidence.append(record)
            ctx.close()
        browser.close()
    (out/'admin-common.json').write_text(json.dumps({'class':'protected Chromium QA, isolated examples','observations':evidence},ensure_ascii=False,indent=2))
    print('PASS common pending/success/error, duplicate gates, keyboard, resize, sheet and admin operational review controls.')
finally:
    host.terminate();host.wait(timeout=5)
