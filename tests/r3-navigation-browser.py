"""Exercise recovered navigation through the QA host and its opaque child frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import PreservedReviewScreens, ReviewScreens, frame_click
from r3_brand_browser_support import ArchivedBrandScreens, check_current_brand_menu
from r3_workflow_browser_support import check_consultation_flow, inspect_fixture

ROOT = Path(__file__).resolve().parents[1]
LAYOUT_OUT = ROOT / 'artifacts/frame-pointer'


def record_pass_layout(page, frame, width, checkpoint):
    """Read physical layout without scrolling, clicking or changing product styles."""
    snapshot = frame.locator('#order-single').evaluate('''root=>{
      const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left};};
      const details=el=>{if(!el)return null;const s=getComputedStyle(el);return {
        node:el.localName,id:el.id,className:typeof el.className==='string'?el.className:'',rect:rect(el),
        position:s.position,display:s.display,overflowX:s.overflowX,overflowY:s.overflowY,
        height:s.height,minHeight:s.minHeight,maxHeight:s.maxHeight,flex:s.flex,
        paddingBottom:s.paddingBottom,scrollPaddingBottom:s.scrollPaddingBottom,
        scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
        scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
        hidden:el.hidden,inert:el.inert};};
      const target=root.querySelector('[data-pass-id="b09"] button'),ancestors=[];
      for(let el=target;el;el=el.parentElement)ancestors.push(details(el));
      const box=rect(target),x=box?box.x+box.width/2:0,y=box?box.y+box.height/2:0;
      const hit=box?document.elementFromPoint(x,y):null;
      return {viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,devicePixelRatio},
        root:details(root),stage:details(root.querySelector('.pass-stage')),
        cards:[...root.querySelectorAll('[data-pass-id]')].map(el=>({id:el.dataset.passId,...details(el)})),
        clearances:[...root.querySelectorAll('.pm-gooey-clearance')].map(details),
        gooey:details(root.querySelector('[data-product-gooey]')),
        target:details(target),centerHit:details(hit),centerReachesTarget:!!target&&target.contains(hit),
        documentScroller:details(document.scrollingElement),ancestors};
    }''')
    snapshot['checkpoint'] = checkpoint
    LAYOUT_OUT.mkdir(parents=True, exist_ok=True)
    path = LAYOUT_OUT / f'navigation-layout-{width}.json'
    report = json.loads(path.read_text()) if path.exists() else {
        'width': width, 'scope': 'canonical current pass controls in protected QA frame; read-only physical layout', 'snapshots': []}
    report['snapshots'].append(snapshot)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return snapshot


def check_preserved_pass_receipt(page, origin, width):
    """Keep the historical sample's tear/sort contract at its exact source hash."""
    frame = PreservedReviewScreens(page, origin, width).screen("passes", "grid")
    digest = page.locator("#frame").get_attribute("data-test-ready-hash")
    cards = frame.locator("[data-pass-id]")
    expect(cards).to_have_count(4)
    frame_click(page, frame.locator('[data-pass-id="c15"] button'))
    frame_click(page, frame.locator('[data-action="tear-ticket"]'))
    confirm = frame.get_by_role("alertdialog", name="납품 수령 확인")
    expect(confirm).to_contain_text("복원할 수 없어요")
    frame_click(page, confirm.get_by_role("button", name="취소", exact=True))
    expect(confirm).to_be_hidden()
    frame_click(page, frame.locator('[data-action="tear-ticket"]'))
    frame_click(page, confirm.get_by_role("button", name="수령 확인", exact=True))
    expect(cards.last).to_have_attribute("data-pass-id", "c15")
    expect(cards.last.locator(".pass-state")).to_have_text("수령 확인")
    expect(frame.locator('.expanded-pass')).to_be_hidden()
    return {"source": "preserved authored document", "artifactHash": digest,
            "scope": "historical in-memory sample only", "received": "c15", "sortedLast": True}


def check(page, origin, width):
    screens = ReviewScreens(page, origin, width)
    screen = screens.screen

    frame = screen("passes", "grid")
    cards = frame.locator("[data-pass-id]")
    expect(cards).to_have_count(4)
    frame_click(page, frame.locator('[data-site="샘플카페"]'))
    expect(cards).to_have_count(1)
    frame_click(page, frame.locator('[data-site="전체"]'))
    cards.first.evaluate("(card)=>{window.originalPass=card}")
    frame_click(page, frame.locator('[data-view="deck"]'))
    assert cards.first.evaluate("(card)=>card===window.originalPass")
    frame_click(page, frame.get_by_role("button", name="다음", exact=True))
    expect(frame.locator(".deck-position")).to_have_text("2 / 4")
    front=cards.nth(1)
    front.evaluate("""card=>{
      const fire=(name,x,y)=>card.dispatchEvent(new PointerEvent(name,{bubbles:true,button:0,pointerId:4,isPrimary:true,clientX:x,clientY:y}));
      fire('pointerdown',150,90);fire('pointermove',152,130);fire('pointerup',152,130);
    }""")
    expect(frame.locator(".deck-position")).to_have_text("2 / 4")
    frame_click(page, frame.locator('[data-view="grid"]'))
    frame_click(page, frame.locator('[data-pass-id="b17"] button'))
    expect(frame.locator(".expanded-pass .ticket-item")).to_have_count(2)
    frame_click(page, frame.locator('[data-action="close-ticket"]'))
    frame_click(page, frame.locator('[data-action="dismiss-expired"]'))
    expect(frame.locator(".expired-reminder")).to_be_hidden()
    layout = record_pass_layout(page, frame, width, 'before-expired-pass-detail')
    try:
        # Ticket paper styling must not turn the absolute grid/deck cards into
        # relative normal-flow blocks extending beyond the stage's height.
        assert len(layout['cards']) == 4
        assert all(card['position'] == 'absolute' for card in layout['cards']), layout
        stage = layout['stage']['rect']
        assert all(card['rect']['top'] >= stage['top'] - 1 and card['rect']['bottom'] <= stage['bottom'] + 1
                   for card in layout['cards']), layout
        frame_click(page, frame.locator('[data-pass-id="b09"] button'))
    except Exception:
        record_pass_layout(page, frame, width, 'failed-expired-pass-detail')
        page.screenshot(path=str(LAYOUT_OUT / f'navigation-layout-{width}-failure.png'), full_page=True)
        raise
    expect(frame.locator('[data-action="tear-ticket"]')).to_have_count(0)
    frame_click(page, frame.locator('[data-action="close-ticket"]'))
    frame_click(page, frame.locator('[data-pass-id="c15"] button'))
    frame_click(page, frame.get_by_role("button", name="수령 확인하기", exact=False))
    confirm = frame.get_by_role("alertdialog", name="납품 수령 확인")
    expect(confirm).to_contain_text("복원할 수 없어요")
    frame_click(page, confirm.get_by_role("button", name="취소", exact=True))
    expect(confirm).to_be_hidden()
    frame_click(page, frame.locator('[data-action="tear-ticket"]'))
    # Current product mode has no receipt handler for these authored sample IDs.
    # It must keep the original detail and data instead of manufacturing success.
    before = inspect_fixture(frame)
    detail = frame.locator('.expanded-pass')
    detail_node, detail_before = detail.element_handle(), detail.text_content()
    cards_before = cards.evaluate_all('els=>els.map(el=>({id:el.dataset.passId,state:el.querySelector(".pass-state").textContent}))')
    frame_click(page, confirm.get_by_role("button", name="수령 확인", exact=True))
    expect(frame.locator('#order-app-status')).to_have_text('아직 연결되지 않은 기능이에요.')
    expect(confirm).to_be_visible()
    assert detail_node.evaluate('el=>el===document.querySelector(".expanded-pass")')
    assert detail.text_content() == detail_before
    assert cards.evaluate_all('els=>els.map(el=>({id:el.dataset.passId,state:el.querySelector(".pass-state").textContent}))') == cards_before
    expect(frame.locator('.ticket-received')).to_have_count(0)
    after = inspect_fixture(frame)
    assert after['data'] == before['data']
    writes = lambda snapshot: [call for call in snapshot['calls'] if call['method'] != 'GET']
    assert writes(after) == writes(before)
    pass_receipt = {"width": width, "current": {
        "source": "current standalone research application", "mode": "product",
        "artifactHash": page.locator('#frame').get_attribute('data-test-ready-hash'),
        "outcome": "unconnected", "detailUnchanged": True, "cardsUnchanged": True,
        "dataUnchanged": True, "newMutationCalls": 0}}
    frame_click(page, confirm.get_by_role("button", name="취소", exact=True))
    frame_click(page, frame.locator('[data-action="close-ticket"]'))

    frame = screen("search", "empty")
    field = frame.locator(".tag-field input")
    field.evaluate("""e=>{e.dispatchEvent(new CompositionEvent('compositionstart'));e.value='특';e.dispatchEvent(new InputEvent('input',{isComposing:true,bubbles:true}));}""")
    expect(field).to_have_attribute("aria-expanded","false")
    field.evaluate("""e=>e.dispatchEvent(new CompositionEvent('compositionend'))""")
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

    pass_receipt['preserved'] = check_preserved_pass_receipt(page, origin, width)
    assert pass_receipt['current']['artifactHash'] != pass_receipt['preserved']['artifactHash']
    LAYOUT_OUT.mkdir(parents=True, exist_ok=True)
    (LAYOUT_OUT / f'navigation-receipt-{width}.json').write_text(
        json.dumps(pass_receipt, ensure_ascii=False, indent=2), encoding='utf-8')

    # Local sample edits belong to the immutable pre-shared-brand document.
    # They must not be mistaken for the authenticated product's account writes.
    archived = ArchivedBrandScreens(page, origin, width)
    frame = archived.screen("profile", "default")
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

    frame = archived.screen("terms", "optional")
    archived.notices()
    consent = frame.locator('[name="terms-check"]')
    expect(frame.locator("html")).to_have_attribute("data-notice-ready", "true")
    frame_click(page, consent)
    expect(consent).to_be_checked()
    page.wait_for_function("window.__brandArchiveFixture.flags[1] && window.__brandArchiveFixture.flags[2]")
    assert archived.read_flags() == [False, True, True]
    frame_click(page, frame.get_by_role("button", name="알림 수신 설정"))
    archived.expect_navigation("profile", "notification")
    frame = archived.screen("profile", "notification")
    archived.notices()
    market_alert = page.frame_locator("#frame").get_by_role("switch", name="시세 변동 알림")
    expect(market_alert).to_have_attribute("aria-checked", "false")
    news = page.frame_locator("#frame").locator('[data-action="notice-2"]')
    expect(news).to_have_attribute("aria-checked", "true")
    frame_click(page, news)
    expect(news).to_have_attribute("aria-checked", "false")
    expect(page.frame_locator("#frame").locator('[data-action="notice-3"]')).to_have_attribute("aria-checked", "true")
    page.wait_for_function("!window.__brandArchiveFixture.flags[1]")
    assert archived.read_flags() == [False, False, True]

    # The current menu reads the signed account endpoint; no archived sample
    # profile or notice fixture is supplied to this product document.
    check_current_brand_menu(page, origin)
    screens = ReviewScreens(page, origin, width)
    screen = screens.screen

    frame = screen("common", "default")
    library = frame.locator("#r3-component-library")
    expect(library.get_by_role("heading", name="공통 컴포넌트")).to_be_visible()
    expect(library.locator("header small")).to_have_text("MSG0585-R3")
    expect(library.locator("details")).to_have_count(9)
    skeleton = library.locator("details").filter(has_text="목록 뼈대·데이터 표시")
    frame_click(page, skeleton.locator("summary"))
    frame_click(page, skeleton.locator('[data-mf-go="passes"][data-mf-state="loading"]'))
    expect(page.frame_locator("#frame").locator(".r3-geometry-skeleton i").first).to_be_visible()

    page.clock.set_fixed_time("2026-12-15T05:00:00Z")
    frame = screen("drawer", "closed")
    consultation = check_consultation_flow(page, frame)
    receipt_path = ROOT / 'artifacts/motion21/consultation'
    receipt_path.mkdir(parents=True, exist_ok=True)
    (receipt_path / f'consultation-{width}.json').write_text(json.dumps(consultation, ensure_ascii=False, indent=2), encoding='utf-8')
    frame = archived.screen("profile", "notification")
    archived.notices()
    read = frame.locator('[data-action="read-notice"]')
    frame_click(page,read)
    expect(read).to_be_hidden()
    expect(frame.locator('p[role=status]').first).to_have_text('모두 읽었어요.')
    assert page.evaluate("window.__brandArchiveFixture.read") is True
    # Preserve the original requested route while the current archive host
    # intentionally prevents a historical sample from entering live business UI.
    url = page.url
    frame_click(page,frame.get_by_role("button",name="내 업무 알림 열기"))
    archived.expect_navigation("role-work", "activity")
    assert page.url == url
    print(json.dumps({"width": width, "screens": ["passes","search","profile","drawer"],
                      "historicalProfile": "exact brand-history hash; in-memory fixture only",
                      "currentProfile": "authenticated product account API"}))


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
                page.goto(fixture["url"]+"/ia?view=qa-lab&screen=login%2Fempty%2Femail")
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
