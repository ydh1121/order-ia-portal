"""Real Chrome, authenticated host, per-account SQLite menu persistence and opaque review interactions."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/qa-mvp'


def open_sidebar(page):
    if page.locator('#open').is_visible() and 'nav-open' not in (page.locator('#lab').get_attribute('class') or ''):
        page.locator('#open').click()


def check(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    expect(page.locator('#frame')).to_have_attribute('sandbox','allow-scripts')
    open_sidebar(page)
    page.locator('#catalog-search').fill('')
    heading = page.locator('[data-nav-group=mvp] summary')
    heading.dblclick()
    name = page.get_by_role('textbox', name='아코디언 이름')
    name.fill(f'첫 매장 MVP {width}')
    with page.expect_response(lambda r: r.url.endswith('/r3-qa/navigation') and r.request.method == 'POST') as saved:
        name.press('Enter')
    assert saved.value.ok
    page.locator('#catalog-search').fill('admin-rights')
    transfer = page.locator('[data-move-module="admin-rights"]')
    expect(transfer).to_be_enabled()
    with page.expect_response(lambda r: r.url.endswith('/r3-qa/navigation') and r.request.method == 'POST') as moved:
        transfer.click()
    assert moved.value.ok
    page.reload()
    expect(page.locator('[data-nav-group=mvp] summary')).to_contain_text(f'첫 매장 MVP {width}')
    open_sidebar(page)
    page.locator('#catalog-search').fill('admin-rights')
    expect(page.locator('[data-nav-group=mvp] [data-module="admin-rights"]')).to_have_count(1)
    expect(page.locator('[data-nav-group=future] [data-module="admin-rights"]')).to_have_count(0)
    # Desktop verifies native HTML drag/drop; touch has an explicit move action.
    if width >= 1000:
        page.locator('#catalog-search').fill('')
        with page.expect_response(lambda r: r.url.endswith('/r3-qa/navigation') and r.request.method == 'POST') as dropped:
            page.locator('[data-module="admin-rights"]').drag_to(page.locator('[data-nav-group=future] summary'))
        assert dropped.value.ok
    else:
        with page.expect_response(lambda r: r.url.endswith('/r3-qa/navigation') and r.request.method == 'POST'):
            page.locator('[data-move-module="admin-rights"]').click()
    page.reload()
    open_sidebar(page)
    page.locator('#catalog-search').fill('admin-rights')
    expect(page.locator('[data-nav-group=future] [data-module="admin-rights"]')).to_have_count(1)

    frame = screens.screen('component-library', 'asset-email')
    expect(frame.get_by_role('heading', name='이메일 입력', exact=True)).to_be_visible()
    page.screenshot(path=OUT/f'component-uses-{width}.png')
    page.locator('#points').click()
    page.locator('#general').click()
    note = f'컴포넌트 검토 {width}'
    page.locator('#body-text').fill(note)
    page.locator('#save').click()
    entry = page.locator('#notes article').filter(has=page.get_by_text(note, exact=True))
    expect(entry).to_be_visible()
    # The explicit history reason remains required by the existing QA engine.
    page.once('dialog', lambda dialog: dialog.accept('사용처 연결 확인'))
    with page.expect_response(lambda r:r.url.endswith('/r3-qa/records') and r.request.method=='POST' and r.request.post_data_json['kind']=='feedback') as reviewed:
        entry.locator('[data-feedback-state=resolved]').click()
    assert reviewed.value.ok
    page.locator('[data-comment-filter=all]').click()
    expect(page.locator('#notes article').filter(has=page.get_by_text(note, exact=True))).to_have_attribute('data-feedback-status','resolved')
    page.locator('#close-drawer').click()
    frame_click(page,frame.locator('.qa-asset-uses [data-qa-go=login][data-qa-state=empty]').first)
    expect(page.locator('#caption')).to_have_text('로그인 바텀시트')
    screens.current_module = None

    for motion in ('float','emphasis'):
        frame = screens.screen('component-library', 'asset-intro-art-'+motion)
        stage = frame.locator('[data-qa-art-motion]')
        play = frame.locator('[data-qa-art-play]')
        expect(play).to_be_disabled()
        expect(frame.locator('[data-qa-art-status-text]')).to_contain_text('모션 줄이기')
        expect(stage.locator('img')).to_have_css('animation-name','none')
        page.emulate_media(reduced_motion='no-preference')
        expect(play).to_be_enabled()
        frame_click(page,play)
        expect(stage).to_have_attribute('data-qa-art-status','playing')
        expect(stage.locator('img')).to_have_css('animation-name','qa-art-'+motion)
        frame_click(page,frame.locator('[data-qa-art-pause]'))
        expect(stage.locator('img')).to_have_css('animation-play-state','paused')
        frame_click(page,play)
        expect(stage.locator('img')).to_have_css('animation-play-state','running')
        frame_click(page,frame.locator('[data-qa-art-reset]'))
        expect(stage).to_have_attribute('data-qa-art-status','idle')
        expect(stage.locator('img')).to_have_css('animation-name','none')
        frame_click(page,play)
        page.emulate_media(reduced_motion='reduce')
        expect(play).to_be_disabled()
        expect(stage).to_have_attribute('data-qa-art-status','idle')
        expect(stage.locator('img')).to_have_css('animation-name','none')
    page.screenshot(path=OUT/f'3d-motion-controls-{width}.png')

    frame = screens.screen('delivery-request', 'ready')
    card = frame.locator('[data-pass-card]')
    frame_click(page,frame.get_by_role('button',name='뒤집어 상세 보기'))
    expect(card).to_have_attribute('data-face','back')
    expect(frame.locator('.mvp-pass-back')).to_contain_text('합천 농장')
    page.screenshot(path=OUT/f'pass-back-{width}.png')
    frame_click(page,frame.get_by_role('button',name='앞면 보기'))
    expect(card).to_have_attribute('data-face','front')

    frame = screens.screen('account-settings', 'withdraw')
    proceed = frame.locator('[data-withdraw-start]')
    expect(proceed).to_be_disabled()
    frame.locator('[name=withdraw-phrase]').fill('회원탈퇴')
    expect(proceed).to_be_disabled()
    frame.locator('[name=withdraw-reason]').select_option('other')
    expect(proceed).to_be_disabled()
    frame.locator('[name=withdraw-note]').fill('검토용 사유')
    expect(proceed).to_be_enabled()
    frame_click(page,proceed)
    expect(frame.locator('[data-withdraw-dialog]')).to_be_visible()
    frame_click(page,frame.locator('[data-withdraw-cancel]'))
    expect(frame.locator('[data-withdraw-dialog]')).to_be_hidden()
    expect(page.locator('#current-case')).to_have_text('탈퇴 확인')
    page.screenshot(path=OUT/f'withdraw-confirm-{width}.png')
    frame = screens.screen('admin-shipments', 'packing')
    frame.locator('[name=shipment-method]').select_option('parcel')
    expect(frame.locator('[name=tracking-number]')).to_have_attribute('required','')
    frame_click(page,frame.get_by_role('button',name='배송 정보 검토 반영'))
    expect(frame.locator('[data-shipment-summary]')).to_have_text('')
    frame.locator('[name=tracking-number]').fill('QA-1234-5678')
    frame.locator('[name=shipment-status]').select_option('dispatched')
    frame_click(page,frame.get_by_role('button',name='배송 정보 검토 반영'))
    expect(frame.locator('[data-shipment-summary]')).to_contain_text('합천 농장 · 택배 · 배송 중 · QA-1234-5678')
    frame.locator('[name=tracking-number]').fill('QA-ENTER-1234')
    frame.locator('[name=tracking-number]').press('Enter')
    expect(frame.locator('[data-shipment-summary]')).to_contain_text('QA-ENTER-1234')

    frame = screens.screen('store-purchase', 'select')
    frame_click(page,frame.locator('[data-purchase-confirm]'))
    expect(page.locator('#current-case')).to_have_text('카드·현금 선택')
    frame.locator('[name=unit-price]').fill('6000')
    frame.locator('[name=quantity]').fill('0')
    frame_click(page,frame.locator('[data-purchase-confirm]'))
    expect(page.locator('#current-case')).to_have_text('카드·현금 선택')
    frame.locator('[name=quantity]').fill('12')
    expect(frame.locator('[data-purchase-total]')).to_have_text('72,000원')
    frame_click(page,frame.locator('[name=payment][value=card]'))
    frame_click(page,frame.locator('[data-purchase-confirm]'))
    expect(page.locator('#current-case')).to_have_text('카드 연결 확인')

    frame = screens.screen('admin-revenue-rules', 'settings')
    frame.locator('[name=gross]').fill('100000')
    frame.locator('[name=cost]').fill('40000')
    frame.locator('[data-rate]').fill('100')
    expect(frame.locator('[data-revenue-apply]')).to_be_enabled()
    frame_click(page,frame.locator('[data-revenue-apply]'))
    expect(frame.locator('[data-revenue-note]')).to_have_text('')
    frame.locator('[data-name]').fill('첫 기여자')
    frame.locator('[name=cost]').fill('')
    frame_click(page,frame.locator('[data-revenue-apply]'))
    expect(frame.locator('[data-revenue-note]')).to_have_text('')
    frame.locator('[name=cost]').fill('40000')
    frame_click(page,frame.locator('[data-revenue-apply]'))
    expect(frame.locator('[data-revenue-note]')).to_contain_text('이 검토 화면에 설정을 반영했어요.')
    expect(page.locator('#frame')).to_have_attribute('sandbox','allow-scripts')
    print(json.dumps({'width':width,'navigationPersisted':True,'assetReviewResolved':True,'artMotionControls':True,'artReducedMotion':True,'passFlippedInPlace':True,'withdrawalGuarded':True,'trackingPreview':True,'trackingEnter':True,'purchasePreview':True,'revenuePreview':True,'sandboxFormsDisabled':True}))


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
            for width in (390,1440):
                context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
                page=context.new_page();errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(fixture['url']+'/ia?view=qa-lab')
                page.locator('input[name=email]').fill(fixture['email'])
                page.locator('input[name=password]').fill(fixture['pass'])
                page.locator('button[type=submit]').click()
                page.wait_for_url('**/ia?view=qa-lab**')
                check(page,fixture['url'],width)
                assert not errors,errors
                context.close()
            browser.close()
    finally:
        host.terminate();host.wait(timeout=5)


if __name__=='__main__':
    main()
