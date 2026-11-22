"""Separate immutable UI replay from the authenticated product account menu.

The archive bridge below supplies only the historical, in-memory notice fixture
protocol. It neither changes a served artifact nor substitutes a product API.
The current-menu check uses the real product document and its account endpoint.
"""
import json
from functools import lru_cache
from pathlib import Path
import subprocess
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import expect

from r3_feedback_browser_support import prepare_frame_pointer


ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=None)
def brand_archive_hash(module, state, width):
    source = """
      import {archivedRows} from './src/server/r3-ui/brand-history.gen.mjs';
      import {approvedHash} from './src/server/r3-ui/approved-width.mjs';
      const [id,width]=process.argv.slice(1),row=archivedRows[id];
      if(!row)throw Error('Missing immutable brand archive: '+id);
      console.log(JSON.stringify(await approvedHash(row,Number(width),'current')));
    """
    value = subprocess.check_output(
        ["node", "--input-type=module", "-e", source, f"{module}/{state}/email", str(width)],
        cwd=ROOT, text=True,
    )
    digest = json.loads(value)
    assert isinstance(digest, str) and len(digest) == 64, (module, state, width)
    return digest


class ArchivedBrandScreens:
    def __init__(self, page, origin, width):
        self.page, self.origin, self.width = page, origin, width
        self.flags = [False, False, False]
        prepare_frame_pointer(page)
        if not getattr(page, "_brand_archive_ready_installed", False):
            page._brand_archive_ready_installed = True
            page.add_init_script("""if(window===top)addEventListener('message',event=>{
              const frame=document.getElementById('frame'),m=event.data;
              if(frame&&event.source===frame.contentWindow&&event.origin==='null'&&
                 m?.scope==='ORDER_R3_FRAME'&&m.type==='ready'){
                window.__brandArchiveEnvelope={channel:m.channel,artifact:m.artifact};
                frame.dataset.testReadyHash=m.artifact;
              }
            });""")

    def screen(self, module, state):
        digest = brand_archive_hash(module, state, self.width)
        query = {"view": "qa-lab", "screen": f"{module}/{state}/email",
                 "width": self.width, "version": "recorded", "artifactHash": digest}
        page = self.page
        with page.expect_response(lambda res: "/r3-qa/artifact?" in res.url
                                  and f"artifactHash={digest}" in res.url) as loaded:
            page.goto(self.origin + "/ia?" + urlencode(query))
        response = loaded.value
        assert response.ok and response.json()["hash"] == digest
        assert response.json()["version"] == "prior-r3"
        expect(page.locator("#frame")).to_have_attribute("data-test-ready-hash", digest)
        expect(page.locator("#frame")).to_have_js_property("inert", False)
        expect(page.locator("#version")).to_have_value("prior-r3")
        assert parse_qs(urlsplit(page.url).query)["artifactHash"] == [digest]
        frame = page.frame_locator("#frame")
        frame.locator("#r3-veil").wait_for(state="attached")
        return frame

    def notices(self, *, unread=3):
        """Replay the old host's notice-only fixture, explicitly without writes.

        The current host intentionally does not hydrate historical fixtures or
        authorize their role navigation. Capture the original messages and use
        their emitted payload to open the next exact archived document in Python.
        """
        self.page.evaluate("""({flags,unread})=>{
          const frame=document.getElementById('frame'),envelope=window.__brandArchiveEnvelope;
          if(!envelope||frame.dataset.testReadyHash!==envelope.artifact)throw Error('Archive not ready');
          const send=(type,payload)=>frame.contentWindow.postMessage({scope:'ORDER_R3_HOST',...envelope,type,payload},'*');
          window.__brandArchiveFixture={flags:[...flags],navigation:null,read:false};
          addEventListener('message',event=>{
            const m=event.data;
            if(event.source!==frame.contentWindow||event.origin!=='null'||m?.scope!=='ORDER_R3_FRAME'||
               m.channel!==envelope.channel||m.artifact!==envelope.artifact)return;
            if(m.type==='setNoticeFixture'){
              if(!Array.isArray(m.payload)||m.payload.length!==3||m.payload.some(v=>typeof v!=='boolean'))throw Error('Invalid historical fixture message');
              window.__brandArchiveFixture.flags=[...m.payload];
            }
            if(m.type==='readNoticeFixture'){
              window.__brandArchiveFixture.read=true;send('noticeCountFixture',0);
            }
            if(m.type==='navigate'){
              event.stopImmediatePropagation();window.__brandArchiveFixture.navigation=m.payload;
            }
          },true);
          send('noticeFixture',flags);send('noticeCountFixture',unread);
        }""", {"flags": self.flags, "unread": unread})
        expect(self.page.frame_locator("#frame").locator("html")).to_have_attribute("data-notice-ready", "true")

    def read_flags(self):
        self.flags = self.page.evaluate("window.__brandArchiveFixture.flags")
        return self.flags

    def expect_navigation(self, module, state):
        wanted = {"screen": module, "state": state}
        self.page.wait_for_function(
            "wanted=>JSON.stringify(window.__brandArchiveFixture?.navigation)===JSON.stringify(wanted)", arg=wanted)
        assert self.page.evaluate("window.__brandArchiveFixture.navigation") == wanted
        return wanted


def check_current_brand_menu(page, origin, screen="profile", state="default"):
    """No injected account fixture: the signed product actor and API own data."""
    page.goto(origin + "/ia?" + urlencode({"view": "product-r3", "screen": screen, "state": state}))
    expect(page.locator("html")).to_have_attribute("data-product-runtime", "canonical")
    expect(page.locator("html")).to_have_attribute("data-product-screen", screen)
    page.evaluate("async()=>{await window.ORDER_APP_ADAPTER.ready;}")
    brand, trigger, panel = page.locator(".obm-brand"), page.locator(".obm-trigger"), page.locator(".obm-panel")
    expect(brand).to_have_count(1)
    expect(brand).to_have_attribute("data-authenticated", "true")
    expect(trigger.locator("svg g>path")).to_have_count(3)
    expect(page.locator('[data-action="account-menu"], [name="profile-name"]')).to_have_count(0)
    expect(panel).to_be_hidden()
    url = page.url
    trigger.click()
    expect(trigger).to_have_attribute("aria-expanded", "true")
    expect(panel.locator('[data-obm-page="root"] > [data-obm-item] .obm-label')).to_have_text(["프로필", "알림", "관리"])
    panel.locator('[data-obm-item="profile"]').click()
    expect(panel.locator('[data-obm-page="profile"] [data-obm-item] .obm-label')).to_have_text(["계정", "개인정보", "연결된 계정"])
    with page.expect_response(lambda res: urlsplit(res.url).path == "/api/ia/product/account"
                              and res.request.method == "GET") as read:
        panel.locator('[data-obm-item="profile.account"]').click()
    response = read.value
    assert response.ok, response.status
    account = response.json()
    expect(panel.locator('[name="name"]')).to_have_value(account["profile"]["name"])
    expect(panel.locator('[name="phone"]')).to_have_value(account["profile"]["phone"])
    assert page.url == url
    panel.locator('[name="name"]').press("Escape")
    expect(panel).to_be_hidden()
    expect(trigger).to_be_focused()
    trigger.click()
    panel.locator('[data-obm-item="manage"]').click()
    expect(panel.locator('[data-obm-item="manage.dashboard"]')).to_be_hidden()
    assert account["capabilities"]["dashboard"] is False
    expect(panel.locator('[data-obm-page="manage"] [data-obm-item]:visible .obm-label')).to_have_text(
        ["납품일정", "결제 및 정산", "내 견적", "사업장 정보"])
    panel.locator(".obm-heading").press("Escape")
    trigger.click()
    with page.expect_response(lambda res: urlsplit(res.url).path == "/api/ia/product/notifications"
                              and res.request.method == "GET") as notices:
        panel.locator('[data-obm-item="notifications"]').click()
    assert notices.value.ok and notices.value.json()["items"] == []
    expect(panel).to_contain_text("새 알림이 없어요.")
    expect(panel.locator('[data-action^="notice-"]')).to_have_count(0)
    assert page.url == url
    panel.locator(".obm-heading").press("Escape")
    expect(panel).to_be_hidden()
    print(json.dumps({"source": "authenticated product document + real account API", "screen": screen,
                      "roots": ["profile", "notifications", "manage"], "sampleAccount": False,
                      "dashboardAuthorized": False, "notifications": 0}, ensure_ascii=False))
