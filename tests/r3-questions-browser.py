"""Exercise detailed quote feedback through the QA host and its opaque child frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position

ROOT = Path(__file__).resolve().parents[1]


def check(page, origin, width):
    screen = ReviewScreens(page, origin, width).screen

    def confirm(frame, label):
        dialog=frame.locator("[data-qf-confirm]")
        phase="pointerup" if page.evaluate("navigator.maxTouchPoints>0") else "click"
        frame_click(page, dialog.get_by_role("button",name=label,exact=True), activation=phase)
        expect(dialog).to_have_count(0)

    def action(frame, name):
        return frame.locator(f'[data-qa-action="{name}"]')

    def swipe(locator, horizontal, vertical):
        box = locator.evaluate("e=>({width:e.clientWidth,height:e.clientHeight})")
        position = {"x": min(box["width"] - 2, max(100, box["width"] * 0.70)), "y": box["height"] / 2}
        x, y = frame_pointer_position(page, locator, position)
        scale = page.locator("#frame").evaluate("f=>f.getBoundingClientRect().width/f.offsetWidth")
        if page.evaluate("navigator.maxTouchPoints>0"):
            session = page.context.new_cdp_session(page)
            try:
                session.send("Input.dispatchTouchEvent", {"type":"touchStart", "touchPoints":[{"x":x,"y":y}]})
                for i in range(1, 9):
                    session.send("Input.dispatchTouchEvent", {"type":"touchMove", "touchPoints":[
                        {"x":x-horizontal*scale*i/8, "y":y+vertical*scale*i/8}]})
                session.send("Input.dispatchTouchEvent", {"type":"touchEnd", "touchPoints":[]})
            finally:
                session.detach()
        else:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x-horizontal*scale, y+vertical*scale, steps=8)
            page.mouse.up()

    frame = screen("q1", "before")
    rows = frame.locator("[data-item-row]")
    expect(rows).to_have_count(0)
    expect(action(frame, "finish-q1")).to_be_hidden()
    expect(action(frame, "add-item")).to_have_text("계란 추가")
    frame_click(page, action(frame, "add-item"))
    frame_click(page, action(frame, "save-egg"))
    expect(rows).to_have_count(1)
    expect(rows.locator(".qf-tag")).to_have_count(0)
    expect(action(frame, "finish-q1")).to_be_visible()
    expect(action(frame, "add-item")).to_have_css("border-top-style", "dashed")
    rows.locator(".qf-main").press("Enter")
    expect(frame.get_by_role("dialog")).to_be_visible()
    frame_click(page, action(frame, "close-egg").last)
    rows.locator(".qf-main").press("Delete")
    dialog = frame.locator("[data-qf-confirm]")
    expect(dialog.get_by_text("취소")).to_be_focused()
    dialog.get_by_text("취소").press("Escape")
    expect(rows).to_have_count(1)
    frame_click(page, action(frame, "remove-item"))
    confirm(frame, "삭제")
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
    frame_click(page, shell)
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
    confirm(frame, "취소")
    expect(assigned).to_have_count(3)
    assigned.first.locator(".qf-main").press("Delete")
    confirm(frame, "해제")
    expect(assigned).to_have_count(2)
    expect(first.locator("[data-item-count]")).to_have_text("2개")
    expect(venues).to_have_count(3)
    for remaining in (2, 1, 0):
        first.locator(".qa-disclosure").press("Delete")
        confirm(frame, "삭제")
        expect(venues).to_have_count(remaining)
    expect(action(frame, "finish-q3")).to_be_hidden()
    expect(action(frame, "add-venue")).to_be_visible()

    frame = screen("q4", "open")
    products = frame.locator(".qa-order-row")
    sites = products.first.locator(".qa-order-venue")
    expect(sites).to_have_count(3)
    item_name = sites.first.locator("strong").inner_text()
    parent_name = products.first.locator(".qa-disclosure strong").inner_text()
    first_id = sites.first.get_attribute("id")
    other_ids = sites.locator("strong").all_text_contents()[1:]
    swipe(sites.first.locator("strong"), 80, 2)
    expect(frame.locator("[data-qf-confirm]")).to_have_attribute("data-subject", first_id)
    expect(frame.locator("[data-qf-confirm] p")).to_have_text(parent_name+" · "+item_name)

    confirm(frame, "해제")
    expect(frame.locator("#"+first_id)).to_have_count(0)
    expect(sites).to_have_count(2)
    assert sites.locator("strong").all_text_contents()==other_ids
    expect(products.first.locator("[data-order-venue-count]")).to_have_text("2개 사업장")
    expect(products.nth(1).locator(".qa-order-venue")).to_have_count(3)
    for _ in range(3):
        product = products.first
        head = product.locator(".qa-disclosure")
        if head.get_attribute("aria-expanded") == "false":
            frame_click(page, head)
        for _ in range(product.locator(".qa-order-venue").count()):
            frame_click(page, product.locator('[data-qa-action="unlink-venue"]').first)
            confirm(frame, "해제")
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
        # Version selection persists while navigating the approved shell.
        if not page.locator("#version").is_visible():
            page.locator("#points").click()
            page.locator('[data-drawer-tab="settings"]').click()
        page.locator("#version").select_option("current")
        expect(links).to_be_visible()
        if page.locator("#drawer").is_visible():
            page.locator("#close-drawer").click()
    print(json.dumps({"width": width, "checks": ["q1_empty_add_edit_delete", "q1_tags_icons_errors", "q3_header_contacts", "q3_swipe_cancel_scoped_detach", "q3_empty_completion", "q4_venue_unlink", "q4_empty_completion", "q2_review_product_links"]}))


def main():
    host = subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            for width in (320,390,1440):
                context = browser.new_context(viewport={"width":width,"height":860},reduced_motion="reduce",has_touch=width<768)
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(fixture["url"]+"/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail")
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
