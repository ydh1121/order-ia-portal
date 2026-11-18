"""Open a frame in the approved private sidebar and wait for that frame's ready receipt."""
import re

from playwright.sync_api import expect


class ReviewScreens:
    def __init__(self, page, origin, width):
        self.page = page
        self.width = width
        page.add_init_script("""if(window === top) window.addEventListener('message', event=>{
            const frame = document.getElementById('frame');
            if(frame && event.source===frame.contentWindow && event.origin==='null' &&
               event.data?.scope==='ORDER_R3_FRAME' && event.data.type==='ready') {
                frame.dataset.testReadyHash=event.data.artifact;
            }
        });""")
        page.goto(f"{origin}/ia?view=qa-lab&width={width}")
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", re.compile(r'^[0-9a-f]{64}$'))
        self.current_module = None

    def screen(self, module, state):
        page = self.page
        target = f"{module}/{state}/email"
        if self.current_module == module:
            control = page.locator(f'#state-buttons [data-state="{state}"]')
        else:
            if page.locator("#open").is_visible() and "nav-open" not in (page.locator("#lab").get_attribute("class") or ""):
                page.locator("#open").click()
            page.locator("#catalog-search").fill(target)
            control = page.locator(f'#catalog [data-module="{module}"]')
        expect(control).to_have_count(1)
        with page.expect_response(lambda res: "/r3-qa/artifact?" in res.url
                                  and f"id={module}%2F{state}%2Femail" in res.url
                                  and f"width={self.width}&" in res.url) as pending:
            control.click()
        response = pending.value
        assert response.ok, (target, self.width, response.status)
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", response.json()["hash"])
        frame = page.frame_locator("#frame")
        frame.locator("#r3-veil").wait_for(state="attached")
        self.current_module = module
        return frame
