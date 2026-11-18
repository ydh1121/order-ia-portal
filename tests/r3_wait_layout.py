"""Measure R4 animation and banner geometry in the isolated QA frame."""
from urllib.parse import urlencode
from playwright.sync_api import expect


def check_wait_layout(context, origin):
    page = context.new_page()
    try:
        for width in (320, 390, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            query = urlencode({"view": "qa-lab", "screen": "quote-wait/comparing/email", "width": width})
            page.goto(origin + "/ia?" + query)
            frame = page.frame_locator("#frame")
            art = frame.locator(".mf-wait-avatar")
            expect(art.locator('div[aria-hidden="true"]:not([hidden])')).to_be_visible()
            rect = art.evaluate("""element => {
               const avatar = element.getBoundingClientRect();
               const stack = element.parentElement.querySelector('.mf-banner-stack').getBoundingClientRect();
               return {gap: avatar.top - stack.bottom, width: avatar.width,
                 screenWidth: innerWidth, clipped: document.documentElement.scrollWidth > innerWidth};
            }""")
            assert rect["gap"] >= 15 and 105 <= rect["width"] <= 161, rect
            assert not rect["clipped"], rect
            print("BLOUB R4", width, rect)
    finally:
        page.close()
