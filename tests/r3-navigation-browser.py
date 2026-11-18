"""Exercise recovered navigation through the QA host and its opaque child frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def check(page, origin, width):
    def screen(module, state):
        query = urlencode({"view": "qa-lab", "screen": f"{module}/{state}/email", "width": width})
        page.goto(origin + "/ia?" + query)
        frame = page.frame_locator("#frame")
        frame.locator("#r3-veil").wait_for(state="attached")
        return frame

    frame = screen("passes", "grid")
    cards = frame.locator("[data-pass-id]")
    expect(cards).to_have_count(4)
    frame.locator('[data-site="샘플카페"]').click()
    expect(cards).to_have_count(1)
    frame.locator('[data-site="전체"]').click()
    frame.locator('[data-view="deck"]').click()
    frame.get_by_role("button", name="다음", exact=True).click()
    expect(frame.locator(".deck-position")).to_have_text("2 / 4")
    frame.locator('[data-view="grid"]').click()
    frame.locator('[data-pass-id="b17"] button').click()
    expect(frame.locator(".expanded-pass .ticket-item")).to_have_count(2)
    frame.locator('[data-action="close-ticket"]').click()
    frame.locator('[data-action="dismiss-expired"]').click()
    expect(frame.locator(".expired-reminder")).to_be_hidden()

    frame = screen("search", "empty")
    field = frame.locator(".tag-field input")
    field.fill("특란")
    frame.locator('[data-suggestion="특란"]').click()
    expect(field).to_have_attribute("placeholder", "")
    frame.locator('[data-detail="b17"]').click()
    expect(frame.locator("[data-search-detail] .ticket-item")).to_have_count(2)
    frame.locator('[data-action="back-results"]').click()
    field.press("Backspace")
    expect(frame.locator("[data-tag]")).to_have_count(0)

    frame = screen("profile", "default")
    frame.locator('[data-action="account-menu"]').click()
    frame.locator('[data-action="panel-alerts"]').click()
    toggle = frame.get_by_role("switch", name="시세 변동 알림")
    toggle.click()
    expect(toggle).to_have_attribute("aria-checked", "true")
    toggle.press("Escape")
    expect(frame.locator(".account-panel")).to_be_hidden()

    frame = screen("drawer", "wheel")
    expect(frame.locator('[data-hour="9"]')).to_have_count(0)
    expect(frame.locator('[data-hour="10"]')).to_have_count(1)
    frame.locator('[data-hour="18"]').click()
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
