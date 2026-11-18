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
    frame_click(page, frame.locator('[data-pass-id="b09"] button'))
    expect(frame.locator('[data-action="tear-ticket"]')).to_have_count(0)
    frame_click(page, frame.locator('[data-action="close-ticket"]'))
    frame_click(page, frame.locator('[data-pass-id="c15"] button'))
    frame_click(page, frame.get_by_role("button", name="수령 확인하기", exact=False))
    confirm = frame.get_by_role("alertdialog", name="납품 수령 확인")
    expect(confirm).to_contain_text("복원할 수 없어요")
    frame_click(page, confirm.get_by_role("button", name="취소", exact=True))
    expect(confirm).to_be_hidden()
    frame_click(page, frame.locator('[data-action="tear-ticket"]'))
    frame_click(page, confirm.get_by_role("button", name="수령 확인", exact=True))
    expect(cards.last).to_have_attribute("data-pass-id","c15")
    expect(cards.last.locator(".pass-state")).to_have_text("수령 확인")

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
    frame = screen("search", "none")
    frame_click(page, frame.get_by_role("button",name="태그 지우기"))
    expect(frame.locator(".quote-search-row")).to_have_count(4)

    frame = screen("profile", "default")
    frame_click(page, frame.locator('[data-action="account-menu"]'))
    frame_click(page, frame.locator('[data-action="panel-alerts"]'))
    toggle = frame.get_by_role("switch", name="시세 변동 알림")
    frame_click(page, toggle)
    expect(toggle).to_have_attribute("aria-checked", "true")
    frame_click(page, toggle)
    expect(toggle).to_have_attribute("aria-checked", "false")
    frame_click(page, frame.locator('[data-action="panel-home"]'))
    frame_click(page, frame.locator('[data-action="panel-business"]'))
    url=page.url
    frame.locator('[name="profile-name"]').fill("검수 매장")
    frame_click(page,frame.locator('[data-action="save-business"]'))
    expect(frame.locator('[name="profile-name"]')).to_have_value("검수 매장")
    frame_click(page,frame.locator('[data-action="panel-home"]'))
    frame_click(page,frame.locator('[data-action="panel-people"]'))
    frame.locator('[name="profile-email"]').fill('test@example.invalid')
    frame_click(page,frame.locator('[data-action="add-member"]'))
    expect(frame.locator(".account-panel ul")).to_contain_text("test@example.invalid · 구성원")
    frame_click(page,frame.locator('[data-action="member-role-1"]'))
    expect(frame.locator(".account-panel ul")).to_contain_text("test@example.invalid · 매장 관리자")
    assert page.url==url
    frame.locator(".account-panel h2").press("Escape")
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
    frame = screen("drawer", "closed")
    expect(frame.locator("[data-consult-ready=true]")).to_have_count(1)
    first = frame.locator(".consult-ticket").first
    frame_click(page, first.locator('[data-action="consult-ticket-detail"]'))
    expect(first.locator(".ticket-item")).to_have_count(2)
    frame_click(page, first.locator('[name="consult-pass"]'))
    frame_click(page, frame.locator('[data-action="open-drawer"]'))
    frame = page.frame_locator("#frame")
    expect(frame.locator(".consult-topics")).to_be_visible()
    expect(frame.locator("[data-consult-ready=true]")).to_have_count(1)
    expect(frame.locator(".consult-summary")).to_contain_text("샘플베이커리")
    frame_click(page,frame.get_by_label("납품 일정",exact=True))
    frame.locator("textarea").fill("제품 검수용 메모")
    frame_click(page,frame.get_by_role("button",name="시간 선택하기"))
    expect(frame.locator(".consult-summary")).to_contain_text("제품 검수용 메모")
    expect(frame.locator(".consult-summary")).to_contain_text("납품 일정")
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
    frame = screen("profile", "notification")
    # Only the fixed menu is passed. The real page derives grants and cases from the signed-in session.
    with page.expect_navigation(wait_until="domcontentloaded"):
        frame_click(page,frame.get_by_role("button",name="내 업무 알림 열기"))
    assert page.url == origin+"/ia?view=roles-r3&menu=activity"
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
