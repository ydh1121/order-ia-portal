"""R1 observes the shared research app's canonical pricing workspace.

The existing owner-login host has only ORDER_QA_DB, no business or product lab DB.
No browser fetch mocks or completion timers are installed by this test.
The explicitly pinned earlier source retains its opaque-frame security checks.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlencode, urlsplit
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import prepare_review_ready, wait_review_frame

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/r1-workspace"
STATES = {
    "costs": "단가표", "store-products": "사업장 판매가", "consumer-products": "소비자 판매가",
    "classification": "상품 분류", "delivery": "배송수단 및 운임", "loading": "불러오는 중",
    "error": "불러오기 실패", "empty": "가격 미입력", "guest": "로그인 확인",
}
# Last independent workspace source at candidate 38208acb, before shared-app
# composition. This is a fixed recorded identity, never the new current hash.
RECORDED_PRICE_HASH = "a88c8035b29c0cf1f9991b667b5be273a33a2e072b0600b12d36f81380b1711a"


def target_url(origin, state="consumer-products", width=1280):
    return origin + "/ia?" + urlencode({"view": "qa-lab", "screen": "price-workspace/" + state + "/email", "width": width})


def ready_frame(page, state="consumer-products"):
    expect(page.locator("#focus-unit")).to_have_attribute("data-state", state)
    frame = page.frame_locator("#frame")
    expect(frame.locator("html")).to_have_attribute("data-product-runtime", "research-application")
    expect(frame.locator("html")).to_have_attribute("data-product-screen", "price-workspace")
    expect(frame.locator("html")).to_have_attribute("data-product-state", state)
    expect(frame.locator("#order-app-header")).to_have_count(1)
    expect(frame.locator("#order-single")).to_have_count(1)
    expect(frame.locator("iframe")).to_have_count(0)
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(frame.locator("#price-workspace-app")).to_have_attribute("data-workspace-storage", "qa-memory")
    expect(page.locator("#frame")).to_have_js_property("inert", False)
    return frame


def choose_state(page, state):
    page.evaluate("""() => {
      const frame=document.querySelector('#frame'), doc=frame.contentDocument;
      window.__priceReviewBefore={frame,doc,app:frame.contentWindow.ORDER_RESEARCH_APP,
        header:doc.querySelector('#order-app-header'),brand:doc.querySelector('.order-product-brand svg')};
    }""")
    button = page.locator('#state-buttons button[data-state="' + state + '"]')
    button.click()
    expect(button).to_have_attribute("aria-pressed", "true")
    frame = ready_frame(page, state)
    assert page.evaluate("""() => {
      const before=window.__priceReviewBefore, frame=document.querySelector('#frame'), doc=frame.contentDocument;
      return frame===before.frame && doc===before.doc && frame.contentWindow.ORDER_RESEARCH_APP===before.app &&
        doc.querySelector('#order-app-header')===before.header && doc.querySelector('.order-product-brand svg')===before.brand;
    }"""), "Selecting a QA state must keep the running application document and common header"
    return frame


def product_row(frame, name):
    return frame.locator(".pw-product-table tbody tr").filter(has=frame.get_by_text(name, exact=True))


def settled_dialog(frame):
    dialog = frame.locator("#pw-workspace-dialog[open]")
    expect(dialog).to_be_visible()
    dialog.evaluate("""async dialog => {
      await Promise.all(dialog.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const panel=dialog.querySelector(':scope > .q4-regular-panel');
      if(!panel || getComputedStyle(dialog).opacity!=='1' || getComputedStyle(panel).opacity!=='1' ||
        dialog.getAnimations({subtree:true}).some(a=>a.pending||a.playState==='running'))
        throw Error('Price modal did not settle');
    }""")
    expect(dialog).to_have_attribute("data-modal-role", "editor")
    assert dialog.evaluate("() => [...window.ORDER_RESEARCH_APP.priceWorkspace.modal.activeIds]") == ["pw-workspace-dialog"]
    return dialog


def submit_dialog(frame):
    frame.locator(".pw-dialog button[type=submit]").click()
    try:
        expect(frame.locator(".pw-dialog")).to_have_count(0)
    except Exception as failure:
        details = frame.locator(".pw-dialog").evaluate_all("""dialogs=>dialogs.map(dialog=>({
          title:dialog.querySelector('h2')?.textContent,error:dialog.querySelector('.pw-dialog-error')?.textContent,
          open:dialog.open,opacity:getComputedStyle(dialog).opacity,
          submitDisabled:dialog.querySelector('[type=submit]')?.disabled,
          invalid:[...dialog.querySelectorAll(':invalid')].map(el=>({name:el.name,validation:el.validationMessage}))
        }))""")
        raise AssertionError("Price modal remained after click: " + json.dumps(details, ensure_ascii=False)) from failure


def memory_state(frame):
    return frame.locator("#order-app-pricing").evaluate("""root=>{
      const control=window.ORDER_RESEARCH_APP.priceWorkspace;
      if(!control || root.priceWorkspaceQa?.workspace!==control.workspace)throw Error('PRICE_WORKSPACE_OWNER');
      const s=control.transport.inspect();
      return {mode:s.mode,scenario:s.scenario,revision:s.revision,pending:s.pending,calls:s.calls};
    }""")


def review_identity(page):
    return page.evaluate("""() => {
      const doc=document.querySelector('#frame').contentDocument;
      const inspector=doc.querySelector('#order-single').__orderResearchInspector.inspect();
      return {url:location.href,caption:document.querySelector('#caption').textContent,
        width:document.querySelector('#width').value,version:document.querySelector('#version').value,
        session:inspector.session,routeRevision:inspector.routeRevision,pendingRoute:inspector.pendingRoute};
    }""")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    host = subprocess.Popen(["node", "tests/r3-browser-host.mjs"], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    result = {"environment": "loopback owner-login Pages host; QA review DB only; no business DB", "checks": {}, "pageErrors": [], "businessRequests": [], "externalRequests": []}
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium") or shutil.which("google-chrome"))
            context = browser.new_context(viewport={"width": 1800, "height": 1100}, reduced_motion="no-preference")
            page = context.new_page()
            page.set_default_timeout(20000)
            page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))

            def observe(request):
                parsed = urlsplit(request.url)
                if parsed.scheme in ("http", "https") and parsed.netloc != urlsplit(fixture["url"]).netloc:
                    result["externalRequests"].append({"method": request.method, "host": parsed.netloc, "path": parsed.path})
                if ((parsed.path.startswith("/api/") and parsed.path != "/api/order/features"
                     and not parsed.path.startswith(("/api/ia/auth/", "/api/ia/r3-qa")))
                        or parsed.path.startswith("/__qa_fixture/")):
                    result["businessRequests"].append({"method": request.method, "path": parsed.path})

            context.on("request", observe)
            page.goto(target_url(fixture["url"]))
            page.locator("input[name=email]").fill(fixture["email"])
            page.locator("input[name=password]").fill(fixture["pass"])
            page.locator("button[type=submit]").click()
            expect(page.locator("#lab")).to_be_visible()
            expect(page.locator("#product-lab")).to_have_count(0)
            frame = ready_frame(page)
            assert page.locator(".lab-topbar button[data-mode]").all_text_contents() == ["집중 보기", "상태 한눈에", "모바일·PC"]
            assert set(page.locator("#state-buttons button[data-state]").evaluate_all("els=>els.map(el=>el.dataset.state)")) == set(STATES)
            sandbox = page.locator("#frame").get_attribute("sandbox").split()
            assert "allow-scripts" in sandbox and "allow-same-origin" in sandbox
            assert page.locator("#frame").evaluate("frame=>frame.contentDocument!==null")
            ownership = frame.locator("html").evaluate("""root=>({origin:window.origin,
              build:root.dataset.productBuild,runtime:root.dataset.productRuntime,
              appInstance:window.ORDER_RESEARCH_APP.instance,headerCount:document.querySelectorAll('#order-app-header').length})""")
            assert ownership["origin"] == fixture["url"] and ownership["runtime"] == "research-application", ownership
            assert ownership["headerCount"] == 1 and ownership["build"], ownership
            result["checks"]["sharedApplicationFrame"] = ownership
            expect(frame.locator("[data-sales-product]")).to_have_count(160)
            expected_specs = {f"{shell}번 {grade} {pack}구" for shell in (1, 2, 3, 4)
                              for grade in ("왕란", "특란", "대란", "중란", "소란")
                              for pack in (6, 10, 15, 20, 30, 60, 150, 300)}
            assert set(frame.locator("[data-sales-product] th").all_text_contents()) == expected_specs

            # Current controlled modules must also render in the R1 state board.
            page.locator("button[data-mode=board]").click()
            expect(page.locator(".lab-stage")).to_have_attribute("data-mode", "board")
            expect(page.locator(".preview-unit:not([hidden])")).to_have_count(9)
            board = page.locator('.preview-unit:not([hidden])[data-state="consumer-products"]').locator("iframe").content_frame
            expect(board.locator("[data-sales-product]")).to_have_count(160)
            page.screenshot(path=str(OUT / "states-board.png"))
            page.locator("button[data-mode=dual]").click()
            expect(page.locator(".lab-stage")).to_have_attribute("data-mode", "dual")
            expect(page.locator(".preview-unit:not([hidden])")).to_have_count(2)
            widths = page.locator(".preview-unit:not([hidden])").evaluate_all("els=>els.map(el=>Number(el.dataset.width))")
            assert sorted(widths) == [390, 1280], widths
            page.locator("button[data-mode=focus]").click()
            frame = ready_frame(page)
            result["checks"]["r1Modes"] = {"focus": True, "board": 9, "dualWidths": widths}

            initial_revision = memory_state(frame)["revision"]
            assert initial_revision > 0, "the normal workspace contains published chart history"
            frame.locator("[data-product-audience=store]").click()
            expect(frame.locator("[data-sales-product]")).to_have_count(160)
            product_row(frame, "1번 왕란 30구").locator("[data-product-price]").fill("8000")
            frame.locator("[data-product-audience=consumer]").click()
            for name in ("1번 왕란 30구", "1번 왕란 6구"):
                product_row(frame, name).locator("[data-consumer-select]").check()
            frame.locator("#pw-markup-value").fill("10")
            frame.locator("[data-action=consumer-markup]").click()
            expect(settled_dialog(frame)).to_contain_text("1개 적용 · 1개 제외")
            page.locator("#frame").screenshot(path=str(OUT / "consumer-modal-1280.png"))
            submit_dialog(frame)
            expect(product_row(frame, "1번 왕란 30구").locator("[data-product-price]")).to_have_value("8800")
            expect(product_row(frame, "1번 왕란 6구").locator("[data-product-price]")).to_have_value("")
            frame.locator("#pw-markup-kind").select_option("amount")
            frame.locator("#pw-markup-value").fill("250")
            frame.locator("[data-action=consumer-markup]").click()
            submit_dialog(frame)
            expect(product_row(frame, "1번 왕란 30구").locator("[data-product-price]")).to_have_value("8250")
            product_row(frame, "1번 왕란 30구").locator("[data-product-price]").fill("7999")
            expect(product_row(frame, "1번 왕란 30구").locator("[data-product-mode]")).to_have_text("직접 입력")
            frame.locator("[data-action=save]").click()
            submit_dialog(frame)
            expect(frame.locator("#pw-notice")).to_contain_text("반영했습니다")
            frame.locator("[data-action=active]").click()
            expect(frame.locator("[data-cost=raw]").first).to_be_visible()
            frame.locator("[data-section=products]").click()
            expect(product_row(frame, "1번 왕란 30구").locator("[data-product-price]")).to_have_value("7999")
            assert memory_state(frame)["revision"] == initial_revision + 1
            result["checks"]["consumer"] = {"businessRows": 160, "consumerRows": 160, "percent": 8800, "amount": 8250, "manualSavedAndReloaded": 7999, "blankBaseSkipped": True}

            frame.locator("[data-section=carriers]").click()
            frame = ready_frame(page, "delivery")
            frame.locator("[data-action=add-carrier]").first.click()
            dialog = settled_dialog(frame)
            dialog.locator("[name=name]").fill("QA 편집 중인 운송사")
            before_editor = frame.locator("#order-app-pricing").evaluate("() => ORDER_RESEARCH_APP.priceWorkspace.snapshot()")
            assert before_editor["model"]["dirty"] is False, "open editor alone must block QA replacement even when the saved document is clean"
            dialog.evaluate("""dialog => {
              const control=window.ORDER_RESEARCH_APP.priceWorkspace;
              window.__qaOpenPriceEditor={dialog,control,workspace:control.workspace};
            }""")
            before_target = review_identity(page)
            # The dialog lives in the app; outside R1 controls must not destroy
            # it or bind the inspector to a target that the app rejected.
            for destination in ("state", "campaign"):
                if destination == "state":
                    page.locator('#state-buttons [data-state="empty"]').click()
                else:
                    page.locator('.lab-role-filter [data-role="all"]').click()
                    page.locator('#catalog-search').fill('admin-campaigns')
                    page.locator('#catalog button[data-module="admin-campaigns"]').click()
                frame = ready_frame(page, "delivery")
                expect(page.locator('#live')).to_contain_text('현재 화면과 입력은 유지됩니다')
                expect(page.locator('#state-buttons [data-state="delivery"]')).to_have_attribute('aria-pressed', 'true')
                expect(page.locator('#points')).to_be_enabled()
                assert review_identity(page) == before_target
                dialog = settled_dialog(frame)
                expect(dialog.locator('[name=name]')).to_have_value('QA 편집 중인 운송사')
                assert dialog.evaluate("""dialog => {
                  const before=window.__qaOpenPriceEditor,control=window.ORDER_RESEARCH_APP.priceWorkspace;
                  return dialog===before.dialog && control===before.control && control.workspace===before.workspace;
                }""")
                current_editor = frame.locator("#order-app-pricing").evaluate("() => ORDER_RESEARCH_APP.priceWorkspace.snapshot()")
                assert current_editor['document'] == before_editor['document']
                assert current_editor['model'] == before_editor['model']
            page.locator('#catalog-search').fill('price-workspace')
            result["checks"]["openEditorQaBoundary"] = {"cleanDocument": True, "sameModalAndOwner": True,
                "stateChangeRefused": True, "campaignChangeRefused": True, "captionUrlTargetAndInspectorRestored": True}
            dialog.locator('[name=name]').fill('')
            frame.locator(".pw-dialog button[type=submit]").click()
            expect(frame.locator(".pw-dialog")).to_be_visible()
            assert frame.locator(".pw-dialog [name=name]").evaluate("input=>input.validity.valueMissing")
            frame.locator(".pw-dialog [name=name]").fill("QA 검토용 화물")
            frame.locator(".pw-dialog [name=type]").select_option("freight")
            frame.locator(".pw-dialog [name=name]").press("Enter")
            expect(frame.locator(".pw-dialog")).to_have_count(0)
            expect(frame.locator("[data-carrier-field=base]")).to_have_value("")
            frame.locator("[data-action=add-delivery-rule]").click()
            frame.locator(".pw-dialog [name=package]").select_option("pack-30")
            frame.locator(".pw-dialog [name=unit]").select_option("egg")
            frame.locator(".pw-dialog [name=min]").fill("360")
            frame.locator(".pw-dialog [name=max]").fill("660")
            expect(frame.locator(".pw-delivery-conversion")).to_have_text("360~660알 · 12~22묶음")
            settled_dialog(frame)
            page.locator("#frame").screenshot(path=str(OUT / "delivery-modal-1280.png"))
            submit_dialog(frame)
            expect(frame.locator("[data-delivery-rule]")).to_have_count(1)
            expect(frame.locator("[data-delivery-rule]")).to_contain_text("미입력")
            frame.locator("[data-action=save]").click()
            submit_dialog(frame)
            expect(frame.locator("#pw-notice")).to_contain_text("반영했습니다")
            assert memory_state(frame)["revision"] == initial_revision + 2
            result["checks"]["delivery"] = {"eggRange": [360, 660], "packRange": [12, 22], "blankFarePreserved": True, "invalidInputBlocked": True, "enterCommit": True}

            for state in ("loading", "error", "guest", "empty"):
                frame = choose_state(page, state)
                if state == "loading":
                    expect(frame.locator("#pw-main")).to_contain_text("불러오는 중")
                    expect(frame.locator("#pw-main")).to_have_js_property("inert", True)
                elif state == "error":
                    expect(frame.locator("#pw-notice")).to_contain_text("저장소에 연결하지 못했습니다")
                elif state == "guest":
                    expect(frame.locator("#pw-notice")).to_contain_text("계정 권한을 확인해 주세요")
                    expect(frame.locator("#pw-login")).to_have_count(0)
                    assert urlsplit(page.url).path == "/ia"
                else:
                    expect(frame.locator("[data-sales-product]")).to_have_count(160)
                    assert frame.locator("[data-product-price]").evaluate_all("els=>els.every(el=>el.value==='')")
                result["checks"][state] = memory_state(frame)
                if state == "empty":
                    assert result["checks"][state]["revision"] == 0

            frame = choose_state(page, "consumer-products")
            expect(product_row(frame, "1번 왕란 30구").locator("[data-product-price]")).to_have_value("")
            assert memory_state(frame)["revision"] == initial_revision, "reset restores the seeded table and discards both review edits"
            page.locator("#new").click()
            expect(frame.locator("#r3-veil")).to_be_visible()
            expect(page.locator("#new")).to_have_attribute("aria-pressed", "true")
            frame.locator("#r3-veil").press("Escape")
            expect(frame.locator("#r3-veil")).to_be_hidden()
            expect(page.locator("#new")).to_have_attribute("aria-pressed", "false")
            result["checks"]["r1PositionPinToggle"] = True

            page.goto(target_url(fixture["url"], width=320))
            frame = ready_frame(page)
            product_row(frame, "1번 왕란 30구").locator("[data-consumer-select]").check()
            frame.locator("#pw-markup-value").fill("10")
            frame.locator("[data-action=consumer-markup]").click()
            dialog = settled_dialog(frame)
            geometry = dialog.evaluate("dialog=>{const r=dialog.getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,document:document.documentElement.scrollWidth};}")
            assert geometry["width"] == 320 and geometry["left"] >= 0 and geometry["right"] <= 321 and geometry["document"] <= 321, geometry
            page.locator("#frame").screenshot(path=str(OUT / "consumer-modal-320.png"))
            result["checks"]["mobileModal"] = geometry

            # The old renderer remains isolated only on its explicit recorded
            # identity. Current pricing must never fall back to this document.
            recorded_url = fixture["url"] + "/ia?" + urlencode({
                "view": "qa-lab", "screen": "price-workspace/consumer-products/email", "width": 1280,
                "version": "recorded", "artifactHash": RECORDED_PRICE_HASH,
            })
            # The immutable document is restored asynchronously. Observe its
            # actual ready receipt before inspecting the archived opaque frame.
            prepare_review_ready(page)
            page.goto(recorded_url)
            recorded = wait_review_frame(page, {"hash": RECORDED_PRICE_HASH})
            expect(recorded.locator("title")).to_have_js_property("textContent", "단가표 · " + STATES["consumer-products"])
            recorded.locator("#r3-veil").wait_for(state="attached")
            expect(recorded.locator("#price-workspace-app")).to_have_attribute("data-workspace-storage", "qa-memory")
            expect(recorded.locator("[data-sales-product]")).to_have_count(160)
            expect(page.locator("#frame")).to_have_js_property("inert", False)
            sandbox = page.locator("#frame").get_attribute("sandbox").split()
            assert "allow-scripts" in sandbox and "allow-same-origin" not in sandbox
            assert page.locator("#frame").evaluate("frame=>frame.contentDocument===null"), "host must not read the recorded opaque frame DOM"
            security = recorded.locator("html").evaluate("root=>({origin:window.origin,policy:root.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content,sharedApp:!!window.ORDER_RESEARCH_APP})")
            assert security["origin"] == "null" and "connect-src 'none'" in security["policy"], security
            assert not security["sharedApp"], security
            result["checks"]["opaqueInlineFrame"] = {"version": "recorded", "artifactHash": RECORDED_PRICE_HASH, **security}
            result["chromium"] = browser.version
            assert not result["businessRequests"], result["businessRequests"]
            assert not result["externalRequests"], result["externalRequests"]
            assert not result["pageErrors"], result["pageErrors"]
            result["status"] = "PASS"
            context.close()
            browser.close()
    finally:
        host.terminate()
        host.wait(timeout=5)
        (OUT / "receipt.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("PASS R1 workspace: one current application/header, recorded opaque source, three R1 modes, 160-spec catalog, real price/delivery modals, memory save/reload, controlled states and position pins; zero business API requests.")


if __name__ == "__main__":
    main()
