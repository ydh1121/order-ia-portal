"""Exercise detailed quote feedback through the QA host and its opaque child frame."""
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

    def action(frame, name):
        return frame.locator(f'[data-qa-action="{name}"]')

    def swipe(locator, horizontal, vertical):
        locator.dispatch_event("pointerdown", {"pointerId": 4, "isPrimary": True, "button": 0, "clientX": 150, "clientY": 50})
        locator.dispatch_event("pointerup", {"pointerId": 4, "isPrimary": True, "button": 0, "clientX": 150-horizontal, "clientY": 50+vertical})

    frame = screen("q1", "before")
    rows = frame.locator("[data-item-row]")
    expect(rows).to_have_count(0)
    expect(action(frame, "finish-q1")).to_be_hidden()
    expect(action(frame, "add-item")).to_have_text("계란 추가")
    action(frame, "add-item").click()
    action(frame, "save-egg").click()
    expect(rows).to_have_count(1)
    expect(rows.locator(".qf-tag")).to_have_count(0)
    expect(action(frame, "finish-q1")).to_be_visible()
    expect(action(frame, "add-item")).to_have_css("border-top-style", "dashed")
    rows.locator(".qf-main").press("Enter")
    expect(frame.get_by_role("dialog")).to_be_visible()
    action(frame, "close-egg").last.click()
    rows.locator(".qf-main").press("Delete")
    dialog = frame.locator("[data-qf-confirm]")
    expect(dialog.get_by_text("취소")).to_be_focused()
    dialog.get_by_text("취소").press("Escape")
    expect(rows).to_have_count(1)
    action(frame, "remove-item").click()
    dialog.get_by_role("button", name="삭제").click()
    expect(rows).to_have_count(0)
    expect(action(frame, "finish-q1")).to_be_hidden()

    frame = screen("q1", "selected")
    expect(frame.locator("[data-item-row] .qf-tag").first).to_have_text("월 600판")
    frame = screen("q1", "error")
    shell = frame.locator('[data-choice="shell"]').first
    expect(shell).to_have_attribute("aria-invalid", "true")
    selected = frame.locator('[data-choice="size"][aria-pressed="true"] .qa-egg-shape')
    unselected = frame.locator('[data-choice="size"][aria-pressed="false"] .qa-egg-shape').first
    expect(selected).to_have_css("background-color", "rgb(255, 255, 255)")
    expect(unselected).to_have_css("background-color", "rgb(166, 176, 188)")
    expect(unselected).to_have_css("border-top-width", "0px")
    shell.click()
    expect(shell).not_to_have_attribute("aria-invalid", "true")

    frame = screen("q3", "open")
    venues = frame.locator("[data-venue]")
    first = venues.first
    expect(first.locator(".qa-row-summary")).to_be_hidden()
    expect(first.locator("[data-contact-phone]")).to_have_css("text-align", "start")
    expect(first.locator("[data-contact-phone] + button")).to_be_visible()
    assigned = first.locator(".qa-assigned-item")
    expect(assigned).to_have_count(3)
    swipe(assigned.first, 10, 75)
    expect(frame.locator("[data-qf-confirm]")).to_have_count(0)
    swipe(assigned.first, 85, 3)
    dialog = frame.locator("[data-qf-confirm]")
    expect(dialog.get_by_text("연결을 해제할까요?")).to_be_visible()
    dialog.get_by_role("button", name="취소").click()
    expect(assigned).to_have_count(3)
    assigned.first.locator(".qf-main").press("Delete")
    dialog.get_by_role("button", name="해제", exact=True).click()
    expect(assigned).to_have_count(2)
    expect(first.locator("[data-item-count]")).to_have_text("2개")
    expect(venues).to_have_count(3)
    for remaining in (2, 1, 0):
        first.locator(".qa-disclosure").press("Delete")
        dialog.get_by_role("button", name="삭제", exact=True).click()
        expect(venues).to_have_count(remaining)
    expect(action(frame, "finish-q3")).to_be_hidden()
    expect(action(frame, "add-venue")).to_be_visible()

    frame = screen("q4", "open")
    products = frame.locator(".qa-order-row")
    sites = products.first.locator(".qa-order-venue")
    expect(sites).to_have_count(3)
    swipe(sites.first.locator("strong"), 80, 2)
    frame.locator("[data-qf-confirm]").get_by_role("button", name="해제", exact=True).click()
    expect(sites).to_have_count(2)
    expect(products.first.locator("[data-order-venue-count]")).to_have_text("2개 사업장")
    expect(products.nth(1).locator(".qa-order-venue")).to_have_count(3)
    for _ in range(3):
        product = products.first
        head = product.locator(".qa-disclosure")
        if head.get_attribute("aria-expanded") == "false":
            head.click()
        for _ in range(product.locator(".qa-order-venue").count()):
            product.locator('[data-qa-action="unlink-venue"]').first.click()
            frame.locator("[data-qf-confirm]").get_by_role("button", name="해제", exact=True).click()
    expect(action(frame, "finish-q4")).to_be_hidden()

    for module, state in (("q2", "empty"), ("quote-review", "normal")):
        screen(module, state)
        links = page.locator("#quote-candidates")
        expect(links).to_be_visible()
        for mode in ("simple", "detailed"):
            expect(links.locator(f'a[href="/ia?view={mode}-r3#/form"]')).to_be_visible()
        page.locator("#points").click()
        page.locator('[data-drawer-tab="settings"]').click()
        page.locator("#version").select_option("previous")
        expect(links).to_be_hidden()
    print(json.dumps({"width": width, "checks": ["q1_empty_add_edit_delete", "q1_tags_icons_errors", "q3_header_contacts", "q3_swipe_cancel_scoped_detach", "q3_empty_completion", "q4_venue_unlink", "q4_empty_completion", "q2_review_product_links"]}))


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
