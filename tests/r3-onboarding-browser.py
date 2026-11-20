"""Check guest/member onboarding, restored auth origin, editable art and footer in the QA frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import expect, sync_playwright

from r3_auth_motion_browser import check_auth_motion
from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position
from r3_brand_browser_support import ArchivedBrandScreens, check_current_brand_menu

ROOT = Path(__file__).resolve().parents[1]


def current_wordmark_typography(frame):
    """Read today's rendered QA wordmark; immutable archived frames keep their own styles."""
    word = frame.locator(".ob-brand-common > .ob-wordmark")
    expect(word).to_be_visible()
    typography = word.evaluate("e=>{const s=getComputedStyle(e);return {fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing};}")
    assert typography["fontFamily"].split(",")[0].strip().strip("\"'") == "Arial Black", typography
    assert typography["fontSize"] == "25px" and typography["fontWeight"] == "900" and typography["lineHeight"] == "25px", typography
    assert typography["letterSpacing"] in ("0px", "normal"), typography
    return typography


def frame_identity(locator):
    """Read the frozen frame's opaque identity for an actual DOM element."""
    return locator.evaluate("""el=>{
        const root=document.getElementById('order-single'),parts=[];
        const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
        if(!root.contains(el))throw Error('Review target is outside the screen root');
        for(let node=el;node!==root;node=node.parentElement)
            parts.unshift([node.localName,...fields.map(name=>node.getAttribute(name)||'')].join('|'));
        if(!parts.length)return 'screen';
        let hash=2166136261;
        for(const char of 'screen/'+parts.join('/'))hash=Math.imul(hash^char.charCodeAt(0),16777619);
        return 'a-'+(hash>>>0).toString(36);
    }""")


def pick_panel_point(page, frame, target, marker, *, native_popover=False):
    """Use the real QA toolbar and physical pointer, stopping before any save."""
    frame_pointer_position(page, target)
    expected_id = frame_identity(target)
    expected_layer = frame_identity(frame.locator(marker))
    page.evaluate("""()=>{
        window.__onboardingReviewPoint=null;
        if(window.__onboardingPointProbe)return;
        window.__onboardingPointProbe=true;
        addEventListener('message',event=>{
            const frame=document.getElementById('frame'),m=event.data;
            if(event.source===frame?.contentWindow&&event.origin==='null'&&
               m?.scope==='ORDER_R3_FRAME'&&m.type==='point'&&
               m.artifact===frame.dataset.testReadyHash)
                window.__onboardingReviewPoint=m;
        });
    }""")
    page.locator('#new').click()
    veil = frame.locator('#r3-veil')
    expect(veil).to_be_visible()
    expect(target).to_be_visible()
    if native_popover:
        expect(frame.locator('#r3-veil:popover-open')).to_have_count(1)
        expect(frame.locator('.obm-panel:popover-open')).to_have_count(1)
    # Opening the outer toolbar can move its viewport. Read the target again
    # after it has opened; frame_click maps this child point to the live canvas.
    point = target.evaluate("el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}")
    frame_click(page, veil, position=point)
    page.wait_for_function('window.__onboardingReviewPoint!==null')
    envelope = page.evaluate('window.__onboardingReviewPoint')
    anchor = envelope['payload']
    assert anchor['id'] == expected_id and anchor['id'] != 'screen', anchor
    assert anchor['instance'] == 'onboarding', anchor
    assert expected_layer in anchor['layers'], anchor
    expect(page.locator('#point-state')).to_have_text('위치 지정됨')
    expect(page.locator('#body-text')).to_have_value('')
    page.locator('#close-drawer').click()
    expect(veil).to_be_hidden()
    return envelope


def restore_panel_point(page, envelope):
    # Replay the captured, current-frame protocol without creating a comment.
    page.evaluate("""m=>document.getElementById('frame').contentWindow.postMessage({
        scope:'ORDER_R3_HOST',channel:m.channel,artifact:m.artifact,type:'restore',payload:m.payload
    },'*')""", envelope)


def check_auth_overlay(page, frame):
    url, digest = page.url, page.locator('#frame').get_attribute('data-test-ready-hash')
    frame.locator('#order-single').evaluate("""root=>{
        window.__introOverlayBaseline={root,document:window.__qaPointerDocument,
            main:root.querySelector('.ob-main'),stage:root.querySelector('.ob-stage'),
            brand:root.querySelector('.ob-brand-common svg')};
    }""")

    def unchanged():
        assert page.url == url
        expect(page.locator('#frame')).to_have_attribute('data-test-ready-hash', digest)
        expect(page.locator('#state-buttons [data-state="guest-2"]')).to_have_class('active')
        expect(frame.locator('.ob.guest')).to_have_attribute('data-intro-step', '2')
        assert frame.locator('#order-single').evaluate("""root=>{
            const before=window.__introOverlayBaseline;
            return before.document===window.__qaPointerDocument&&root===before.root&&
                root.querySelector('.ob-main')===before.main&&root.querySelector('.ob-stage')===before.stage&&
                root.querySelector('.ob-brand-common svg')===before.brand;
        }"""), 'Opening or closing auth must retain the introduction document, slide and brand'

    overlay = frame.locator('[data-product-auth-sheet]')
    frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
    expect(overlay).to_be_visible()
    expect(overlay).to_have_attribute('data-auth-screen', 'login')
    expect(overlay).to_have_attribute('data-auth-state', 'empty')
    expect(overlay).to_have_attribute('data-auth-variant', 'compact')
    expect(frame.locator('.ob.guest')).to_have_js_property('inert', True)
    expect(overlay.locator('.auth-background')).to_have_count(0)
    unchanged()
    for name in ('카카오 로그인', '네이버 로그인', 'Google 로그인'):
        expect(overlay.get_by_role('button', name=name).locator('img')).to_be_visible()
    expect(overlay.locator('[data-action="close-sheet"]')).to_have_count(0)
    email = overlay.locator('[name=email]')
    envelope = pick_panel_point(page, frame, email, '#r3-panel-state-auth-login-empty')
    expect(email).to_have_value('')
    email.press('Escape')
    expect(overlay).to_have_count(0)
    unchanged()
    restore_panel_point(page, envelope)
    expect(email).to_be_focused()
    assert frame_identity(email) == envelope['payload']['id']
    unchanged()
    email.press('Escape')
    expect(overlay).to_have_count(0)

    frame_click(page, frame.get_by_role('button', name='회원가입', exact=True))
    expect(overlay).to_have_attribute('data-auth-screen', 'signup')
    frame_click(page, overlay.locator('.sheet-dim'), position={'x':12,'y':8})
    expect(overlay).to_have_count(0)
    unchanged()

    frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
    sheet, grip = overlay.locator('.auth-sheet'), overlay.locator('.sheet-handle')
    x, y = frame_pointer_position(page, grip)
    travel = sheet.evaluate('el=>Math.max(120,el.getBoundingClientRect().height)*.5+12')
    scale = page.locator('#frame').evaluate('el=>el.getBoundingClientRect().height/el.offsetHeight')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + travel * scale, steps=12)
    page.mouse.up()
    expect(overlay).to_have_count(0)
    unchanged()
    expect(frame.locator('.ob.guest')).to_have_js_property('inert', False)
    print('PASS canonical auth overlay: original slide/DOM/hash retained, real provider assets, inner QA pin and restore, Escape/scrim/drag close')


def drag_intro(page, frame, *, forward, expected_step):
    title = frame.locator('.ob-copy h1')
    size = title.evaluate('el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})')
    left = {'x':size['width']*.15,'y':size['height']/2}
    right = {'x':size['width']*.85,'y':size['height']/2}
    start = frame_pointer_position(page, title, right if forward else left)
    end = frame_pointer_position(page, title, left if forward else right)
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=12)
    page.mouse.up()
    expect(frame.locator('.ob.guest')).to_have_attribute('data-intro-step', str(expected_step))
    assert frame.locator('#order-single').evaluate("""root=>
        window.__introOverlayBaseline.document===window.__qaPointerDocument&&
        window.__introOverlayBaseline.brand===root.querySelector('.ob-brand-common svg')""")


def check_notification_pin(page, screens):
    frame = screens.screen('onboarding', 'member-1')
    typography = current_wordmark_typography(frame)
    bell, panel = frame.locator('[data-action=quick]'), frame.locator('.obm-panel')
    expect(bell).to_be_enabled()
    frame_click(page, bell)
    expect(panel).to_be_visible()
    read = panel.get_by_role('button', name='읽음', exact=True)
    expect(read).to_be_visible()
    snapshot = frame.locator('#order-single').evaluate('()=>window.ORDER_APP_ADAPTER.fixture.inspect()')
    envelope = pick_panel_point(page, frame, read, '#r3-panel-state-account-notifications', native_popover=True)
    after = frame.locator('#order-single').evaluate('()=>window.ORDER_APP_ADAPTER.fixture.inspect()')
    assert after['data']['notifications'] == snapshot['data']['notifications'], 'Selecting the read-button location must not activate it'
    assert not any(call['method'] == 'POST' for call in after['calls']), after['calls']
    panel.locator('.obm-heading').press('Escape')
    expect(panel).to_be_hidden()
    restore_panel_point(page, envelope)
    expect(read).to_be_focused()
    assert frame_identity(read) == envelope['payload']['id']
    panel.locator('.obm-heading').press('Escape')
    expect(panel).to_be_hidden()
    print('PASS real notification popover: inner read-button pin, native top-layer veil, focus retained, restore and zero mutation')
    return typography


def check_archived_entry(page, origin):
    old_hash = "bf83c284c019ab7306cb6ca2c75f7344e50e3dae825b414f26d776b02c5de68c"
    # The private release has an existing 320px email review anchor on this exact document.
    query = {"view":"qa-lab","archive":"1","screen":"login/empty/email","width":320,
             "version":"recorded","artifactHash":old_hash}
    page.goto(origin + "/ia?" + urlencode(query))
    frame = page.frame_locator("#frame")
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(page.locator("#version")).to_have_value("prior-r3")
    expect(page.locator("#version-mark")).to_have_text("이전 R3 검토판")
    for selector in ("#new","#general","#link-figma"):
        expect(page.locator(selector)).to_be_disabled()
    assert len(frame.locator('[data-action^="social-"] img').all()) == 0
    assert parse_qs(urlsplit(page.url).query)["artifactHash"] == [old_hash]
    page.reload()
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(page.locator("#version")).to_have_value("prior-r3")
    query.pop("version"); query.pop("artifactHash")
    page.goto(origin + "/ia?" + urlencode(query))
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(frame.locator('[data-action^="social-"] img')).to_have_count(3)
    expect(page.locator("#version")).to_have_value("current")
    print("PASS retained 320px prior email review, exact hash and reload; today's same email frame contains three native provider assets")


def check_direct_company_state(page, screens, width):
    # Choosing the company state directly must carry the same guest identity as
    # its authored header, rather than moving an authenticated mark into signup.
    frame = screens.screen('onboarding', 'company')
    expect(frame.locator('.ob.guest.footer-open')).to_be_visible()
    modal = frame.get_by_role('dialog', name='사업자 정보')
    expect(modal).to_be_visible()
    expect(frame.locator('.ob-stage')).to_have_js_property('inert', True)
    expect(frame.locator('.ob-stage > header .obm-brand')).to_have_attribute('data-authenticated', 'false')
    geometry = frame.locator('.ob-stage > header').evaluate("""async header=>{
        await document.fonts.ready;
        const rect=selector=>{const r=header.querySelector(selector).getBoundingClientRect();
            return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {authenticated:window.ORDER_APP_ADAPTER.fixture.inspect().controls.authenticated,
            word:rect('.ob-wordmark'),mark:rect('.obm-trigger svg'),signup:rect('.ob-join')};
    }""")
    assert geometry['authenticated'] is False, geometry
    assert all(geometry[key]['width'] > 0 and geometry[key]['height'] > 0 for key in ('word', 'mark', 'signup')), geometry
    assert max(geometry['word']['right'], geometry['mark']['right']) < geometry['signup']['left'], geometry
    out = ROOT / 'artifacts' / 'qa-mvp'
    out.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(out / f'company-direct-{width}.png'))
    modal.locator('[data-company-close]').press('Escape')
    expect(modal).to_be_hidden()
    expect(frame.locator('.ob-stage')).to_have_js_property('inert', False)
    expect(frame.locator('.ob-stage > header .obm-brand')).to_have_attribute('data-authenticated', 'false')
    return geometry


def check(page, origin, width):
    review_writes = []
    def record_write(request):
        if '/r3-qa/records' in request.url and request.method not in ('GET','HEAD'):
            review_writes.append({'method':request.method,'url':request.url})
    page.on('request', record_write)
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("onboarding", "guest-2")
    guest_typography = current_wordmark_typography(frame)
    illustration = frame.locator(".ob-art")
    expect(illustration).to_have_js_property("naturalWidth", 287)
    expect(frame.get_by_role("button",name="회원가입")).to_be_visible()
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","2")

    check_auth_overlay(page, frame)
    drag_intro(page, frame, forward=False, expected_step=1)
    drag_intro(page, frame, forward=True, expected_step=2)
    frame_click(page, frame.get_by_role("button",name="소개 3페이지"))
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","3")
    expect(frame.locator(".ob-art")).to_have_count(0)
    frame.locator(".ob-main").press("ArrowRight")
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","4")
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","4")
    box = frame.locator(".ob-mode-grid button").first.bounding_box()
    assert box and abs(box["width"]-box["height"]) < 1.1, box
    company_geometry = check_direct_company_state(page, screens, width)

    # Keep the old quick-menu and sample notification behavior tied to its
    # immutable source. The current account menu is checked on a real document.
    archived = ArchivedBrandScreens(page, origin, width)
    frame = archived.screen("onboarding", "member-1")
    frame_click(page, frame.get_by_role("button",name="알림과 빠른 메뉴"))
    expect(frame.get_by_role("button",name="오더패스")).to_be_visible()
    frame.get_by_role("button",name="알림과 빠른 메뉴").press("Escape")
    expect(frame.get_by_role("button",name="오더패스")).to_be_hidden()
    profile = archived.screen("profile", "notification")
    archived.notices()
    for label in ("소식", "혜택"):
        toggle = profile.get_by_role("switch",name=label)
        old = toggle.get_attribute("aria-checked")
        frame_click(page, toggle)
        expect(toggle).to_have_attribute("aria-checked","false" if old=="true" else "true")
    expect(profile.locator(".terms-reading")).to_have_count(0)

    check_current_brand_menu(page, origin, "onboarding", "member-1")
    screens = ReviewScreens(page, origin, width)
    member_typography = check_notification_pin(page, screens)

    frame = screens.screen("onboarding", "member-4")
    expect(frame.locator(".ob-pages")).to_have_count(0)
    expect(frame.locator(".ob-tasks button")).to_have_count(0)
    expect(frame.locator(".ob-mode-grid button")).to_have_count(2)

    frame_click(page, frame.get_by_role("button",name="사업자 정보",exact=True))
    modal = frame.get_by_role("dialog",name="사업자 정보")
    expect(modal).to_be_visible()
    expect(frame.locator(".ob-stage")).to_have_js_property("inert",True)
    expect(modal.get_by_text("Cloudflare")).to_be_visible()
    frame_click(page, modal.get_by_role("button",name="배송·취소·환불"))
    expect(modal.get_by_role("button",name="문의하기")).to_be_visible()
    modal.get_by_role("button",name="문의하기").press("Escape")
    expect(modal).to_be_hidden()
    expect(frame.get_by_role("button",name="사업자 정보",exact=True)).to_be_focused()
    # The CTA replaces the whole QA shell. Observe the browser's document request
    # and the authenticated product it rendered after the source iframe is gone.
    x, y = frame_pointer_position(page, frame.get_by_role("button",name="상세 견적"))
    destination = origin + "/ia?view=detailed-r3"
    def detailed_document(response):
        request = response.request
        return (response.url == destination and request.is_navigation_request()
                and request.frame == page.main_frame and request.resource_type == "document")
    with page.expect_response(detailed_document) as navigation:
        if page.evaluate("navigator.maxTouchPoints > 0"):
            page.touchscreen.tap(x, y)
        else:
            page.mouse.click(x, y)
    assert navigation.value.status == 200, navigation.value.status
    expect(page.locator("html")).to_have_attribute("data-r3-quote-mode","detailed")
    expect(page.locator("html")).to_have_attribute("data-storage-ready","true")
    expect(page.get_by_role("link",name="QA LAB으로")).to_be_visible()
    target_url = urlsplit(page.url)
    assert target_url.netloc == urlsplit(origin).netloc and target_url.path == "/ia"
    assert parse_qs(target_url.query) == {"view":["detailed-r3"]}
    page.remove_listener('request', record_write)
    assert not review_writes, review_writes
    print(json.dumps({"width":width,"originalArtWidth":287,"authReturn":"guest-2","memberProduct":"detailed-r3",
                      "oldQuickMenu":"exact brand-history replay","currentBrand":"authenticated three-root menu",
                      "authOverlay":"same introduction, Escape/scrim/drag close","horizontalDrag":"2→1→2",
                      "wordTypography":{"guest":guest_typography,"member":member_typography},
                      "directCompanyHeader":company_geometry,
                      "panelPins":"auth email + real notification read button; restore without comment save","reviewWrites":0}))


def main():
    host=subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            for width in (320,375,1440):
                context=browser.new_context(viewport={"width":width,"height":844},reduced_motion="reduce")
                page=context.new_page()
                page.goto(fixture["url"]+"/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail")
                page.locator("input[name=email]").fill(fixture["email"])
                page.locator("input[name=password]").fill(fixture["pass"])
                page.locator("button[type=submit]").click()
                page.wait_for_url("**/ia?view=qa-lab**")
                if width == 320:
                    check_archived_entry(page,fixture["url"])
                check(page,fixture["url"],width)
                if width == 375:
                    page.emulate_media(reduced_motion="no-preference")
                    check_auth_motion(page,fixture["url"],width)
                context.close()
            browser.close()
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == "__main__":
    main()
