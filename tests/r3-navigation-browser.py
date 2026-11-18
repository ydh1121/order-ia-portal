"""Exercise recovered navigation through the QA host and its opaque child frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click

ROOT = Path(__file__).resolve().parents[1]


def check(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    screen = screens.screen

    frame = screen("passes", "grid")
    cards = frame.locator("[data-pass-id]")
    expect(cards).to_have_count(4)
    frame_click(page, frame.locator('[data-site="샘플카페"]'))
    expect(cards).to_have_count(1)
    frame_click(page, frame.locator('[data-site="전체"]'))
    frame_click(page, frame.locator('[data-view="deck"]'))
    frame_click(page, frame.get_by_role("button", name="다음", exact=True))
    expect(frame.locator(".deck-position")).to_have_text("2 / 4")
    frame_click(page, frame.locator('[data-view="grid"]'))
    frame_click(page, frame.locator('[data-pass-id="b17"] button'))
    expect(frame.locator(".expanded-pass .ticket-item")).to_have_count(2)
    frame_click(page, frame.locator('[data-action="close-ticket"]'))
    frame_click(page, frame.locator('[data-action="dismiss-expired"]'))
    expect(frame.locator(".expired-reminder")).to_be_hidden()

    frame = screen("search", "empty")
    field = frame.locator(".tag-field input")
    field.fill("특란")
    frame_click(page, frame.locator('[data-suggestion="특란"]'))
    expect(field).to_have_attribute("placeholder", "")
    frame_click(page, frame.locator('[data-detail="b17"]'))
    expect(frame.locator("[data-search-detail] .ticket-item")).to_have_count(2)
    frame_click(page, frame.locator('[data-action="back-results"]'))
    field.press("Backspace")
    expect(frame.locator("[data-tag]")).to_have_count(0)

    frame = screen("profile", "default")
    frame_click(page, frame.locator('[data-action="account-menu"]'))
    frame_click(page, frame.locator('[data-action="panel-alerts"]'))
    toggle = frame.get_by_role("switch", name="시세 변동 알림")
    frame_click(page, toggle)
    expect(toggle).to_have_attribute("aria-checked", "true")
    frame_click(page, toggle)
    expect(toggle).to_have_attribute("aria-checked", "false")
    toggle.press("Escape")
    expect(frame.locator(".account-panel")).to_be_hidden()

    frame = screen("terms", "optional")
    consent = frame.locator('[name="terms-check"]')
    expect(frame.locator("html")).to_have_attribute("data-notice-ready", "true")
    frame_click(page, consent)
    expect(consent).to_be_checked()
    frame_click(page, frame.get_by_role("button", name="알림 수신 설정"))
    market_alert = page.frame_locator("#frame").get_by_role("switch", name="시세 변동 알림")
    expect(market_alert).to_have_attribute("aria-checked", "false")
    news = page.frame_locator("#frame").locator('[data-action="notice-2"]')
    expect(news).to_have_attribute("aria-checked", "true")
    frame_click(page, news)
    expect(news).to_have_attribute("aria-checked", "false")
    expect(page.frame_locator("#frame").locator('[data-action="notice-3"]')).to_have_attribute("aria-checked", "true")

    frame = screen("common", "default")
    library = frame.locator("#r3-component-library")
    expect(library.get_by_role("heading", name="공통 컴포넌트")).to_be_visible()
    expect(library.locator("header small")).to_have_text("MSG0585-R3")
    expect(library.locator("details")).to_have_count(9)
    skeleton = library.locator("details").filter(has_text="목록 뼈대·데이터 표시")
    frame_click(page, skeleton.locator("summary"))
    frame_click(page, skeleton.locator('[data-mf-go="passes"][data-mf-state="loading"]'))
    expect(page.frame_locator("#frame").locator(".skeleton-ticket").first).to_be_visible()

    page.clock.set_fixed_time("2026-12-15T05:00:00Z")
    frame = screen("drawer", "booking")
    frame_click(page, frame.locator('[data-action="choose-consult-date"]'))
    dialog = frame.get_by_role("dialog", name="상담 희망일")
    expect(dialog).to_be_visible()
    expect(dialog.locator('[data-day="2026-12-25"]')).to_be_disabled()
    expect(dialog.locator('[data-day="2026-12-26"]')).to_be_disabled()
    expect(dialog.locator('[data-day="2026-12-14"]')).to_be_disabled()
    frame_click(page, dialog.locator('[data-day="2026-12-17"]'))
    expect(dialog).to_be_hidden()
    expect(frame.locator('[data-action="choose-consult-date"] strong')).to_have_text("2026-12-17")
    frame = screen("drawer", "wheel")
    expect(frame.locator('[data-hour="9"]')).to_have_count(0)
    expect(frame.locator('[data-hour="10"]')).to_have_count(1)
    frame_click(page, frame.locator('[data-hour="18"]'))
    expect(frame.locator('[data-minute="10"]')).to_be_disabled()
    frame = screen("drawer", "done")
    expect(frame.get_by_text("상담을 예약했어요", exact=True)).to_be_visible()
    expect(frame.locator(".functional-drawer .empty button")).to_have_count(0)
    print(json.dumps({"width": width, "screens": ["passes","search","profile","drawer"]}))


def main():
    host = subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            for width in (320,390,1440):
                context = browser.new_context(viewport={"width":width,"height":860},reduced_motion="reduce")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(fixture["url"]+"/ia?view=qa-lab")
                page.locator("input[name=email]").fill(fixture["email"])
                page.locator("input[name=password]").fill(fixture["pass"])
                page.locator("button[type=submit]").click()
                page.wait_for_url("**/ia?view=qa-lab**")
                check(page, fixture["url"], width)
                assert not errors, errors
                context.close()
            browser.close()
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == "__main__":
    main()
