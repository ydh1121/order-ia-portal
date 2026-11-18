"""Check guest/member onboarding, restored auth origin, editable art and footer in the QA frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position

ROOT = Path(__file__).resolve().parents[1]


def check(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("onboarding", "guest-2")
    illustration = frame.locator(".ob-art")
    expect(illustration).to_have_js_property("naturalWidth", 287)
    expect(frame.get_by_role("button",name="회원가입")).to_be_visible()
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","2")

    frame_click(page, frame.get_by_role("button",name="로그인",exact=True))
    expect(page.locator('#state-buttons [data-variant="compact"]')).to_have_class("active")
    for name in ("카카오 로그인", "네이버 로그인", "Google 로그인"):
        expect(frame.get_by_role("button",name=name).locator("img")).to_be_visible()
    frame_click(page, frame.locator('[data-action="close-sheet"]'))
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","2")
    frame_click(page, frame.get_by_role("button",name="소개 3페이지"))
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","3")
    expect(frame.locator(".ob-art")).to_have_count(0)
    frame.locator(".ob-main").press("ArrowRight")
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","4")
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","4")
    box = frame.locator(".ob-mode-grid button").first.bounding_box()
    assert box and abs(box["width"]-box["height"]) < 1.1, box

    frame = screens.screen("onboarding", "member-1")
    frame_click(page, frame.get_by_role("button",name="알림과 빠른 메뉴"))
    expect(frame.get_by_role("button",name="오더패스")).to_be_visible()
    frame.get_by_role("button",name="알림과 빠른 메뉴").press("Escape")
    expect(frame.get_by_role("button",name="오더패스")).to_be_hidden()
    profile = screens.screen("profile", "notification")
    for label in ("소식", "혜택"):
        toggle = profile.get_by_role("switch",name=label)
        old = toggle.get_attribute("aria-checked")
        frame_click(page, toggle)
        expect(toggle).to_have_attribute("aria-checked","false" if old=="true" else "true")
    expect(profile.locator(".terms-reading")).to_have_count(0)

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
    print(json.dumps({"width":width,"originalArtWidth":287,"authReturn":"guest-2","memberProduct":"detailed-r3"}))


def main():
    host=subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            for width in (320,375,1440):
                context=browser.new_context(viewport={"width":width,"height":844},reduced_motion="reduce")
                page=context.new_page()
                page.goto(fixture["url"]+"/ia?view=qa-lab")
                page.locator("input[name=email]").fill(fixture["email"])
                page.locator("input[name=password]").fill(fixture["pass"])
                page.locator("button[type=submit]").click()
                page.wait_for_url("**/ia?view=qa-lab**")
                check(page,fixture["url"],width)
                context.close()
            browser.close()
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == "__main__":
    main()
