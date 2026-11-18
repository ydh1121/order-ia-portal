"""Exercise QA purchase input, review hand-off and each read-only result design in Chromium."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlencode
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click

ROOT = Path(__file__).resolve().parents[1]
def capture_reference_viewports(context, origin, folder):
    # Match the five preserved Figma artboards at the original 375 × 828 CSS pixels.
    # Use the current editable export; issued customer numbers cannot enter this file.
    out = Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    page = context.new_page()
    page.set_viewport_size({'width':375,'height':828})
    try:
        for state in ['saving','new-detail','current-detail','equal','current-lower']:
            url = origin+'/api/ia/r3-qa/artifact?'+urlencode({'id':'quote-result/'+state+'/email','width':375,'version':'current'})
            response = context.request.get(url)
            assert response.ok,(state,response.status)
            artifact = response.json()
            page.set_content(artifact['editable'],wait_until='load')
            expect(page.locator('.journey-result')).to_have_attribute('data-view',state)
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(out/('reference-'+state+'-375x828.png')),animations='disabled')
    finally:
        page.close()

def run(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("q2","empty")
    frame_click(page,frame.get_by_role("button",name="입력 내용 확인"))
    expect(frame.locator('[name=qty]')).to_have_attribute('aria-invalid','true')
    frame.locator('[name=qty]').fill('27')
    frame.locator('[name=price]').fill('7300')
    frame_click(page,frame.get_by_role("button",name="입력 내용 확인"))
    expect(frame.locator('[data-summary-qty]')).to_have_text('월 27판')
    expect(frame.locator('[data-summary-price]')).to_have_text('7,300원 / 판')
    frame_click(page,frame.get_by_role('button',name='구매 조건 수정'))
    expect(frame.locator('[name=qty]')).to_have_value('27')
    frame_click(page,frame.locator('.journey-check'))
    expect(frame.locator('[name=unknown]')).to_be_checked()
    frame_click(page,frame.get_by_role("button",name="입력 내용 확인"))
    expect(frame.locator('[data-summary-price]')).to_have_text('현재 구매가 모름')
    for state in ['saving','new-detail','new-only-detail','equal','current-lower','no-current','expired','recompare','no-result']:
        frame = screens.screen('quote-result',state)
        view=frame.locator('.journey-result')
        expect(view).to_have_attribute('data-view',state)
        expect(view.locator('h1')).to_be_visible()
        assert '7,300' not in view.inner_text()
        assert view.evaluate('(el)=>document.documentElement.scrollWidth<=innerWidth')
        if state in ('saving','equal','current-lower'):expect(view.locator('.bars .journey-series')).to_have_count(2)
        if state in ('no-current','new-only-detail'):expect(view.locator('.journey-series')).to_have_count(1)
        if state == 'recompare':expect(view.get_by_role('button',name='새로운 견적')).to_be_visible()
        folder=os.environ.get('R3_EVIDENCE_DIR')
        if folder and width==390:
            path=Path(folder);path.mkdir(parents=True,exist_ok=True)
            view.screenshot(path=str(path / ('result-'+state+'-'+str(width)+'.png')))
    print('PASS browser: Q2 → review → edit, 9 masked result states and viewport',width,flush=True)
if __name__=='__main__':
    host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        conf=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            for width in (320,390,1440):
                context=browser.new_context(viewport={'width':width,'height':852},reduced_motion='reduce')
                page=context.new_page()
                page.goto(conf['url']+'/ia?view=qa-lab')
                page.locator('input[name=email]').fill(conf['email'])
                page.locator('input[name=password]').fill(conf['pass'])
                page.locator('button[type=submit]').click()
                page.wait_for_url('**/ia?view=qa-lab**')
                run(page,conf['url'],width)
                if width==390 and os.environ.get('R3_EVIDENCE_DIR'):
                    capture_reference_viewports(page.context,conf['url'],os.environ['R3_EVIDENCE_DIR'])
                context.close()
            browser.close()
    finally:
        host.terminate();host.wait(timeout=5)
