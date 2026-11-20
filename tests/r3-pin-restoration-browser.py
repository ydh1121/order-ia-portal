"""Restore pins captured from real archived frames into the current R1 review UI.

All records are synthetic and live only in the loopback host's ephemeral SQLite.
The archived picker supplies the anchor; no coordinates, source hashes or records
are rewritten to make a historical pin look current.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import frame_click, prepare_frame_pointer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/r1-pin-restoration"
WIDTH = 1920
SCREEN = "login/empty/email"
EMAIL = '#order-single input[name="email"]'
PASSWORD = '#order-single input[name="password"]'
OLD_BODY = "합성 이전 판 입력칸 위치 의견"
NEW_BODY = "합성 현재 판 비밀번호 위치 의견"
MIXED_BODY = "합성 현재 판 같은 입력칸 위치 의견"


def url(origin, version="current", artifact_hash=None, width=WIDTH, screen=SCREEN):
    query = {"view": "qa-lab", "screen": screen, "width": width}
    if version != "current":
        query["version"] = version
    if artifact_hash:
        query["artifactHash"] = artifact_hash
    return origin + "/ia?" + urlencode(query)


def install_probe(page):
    prepare_frame_pointer(page)
    page.add_init_script("""if(window===top){
      window.__pinMessages=[];window.addEventListener('message',event=>{
        const frame=document.getElementById('frame'),m=event.data;
        if(event.source!==frame?.contentWindow||m?.scope!=='ORDER_R3_FRAME')return;
        if(['ready','point','openPins'].includes(m.type))window.__pinMessages.push(m);
        if(m.type==='ready'){window.__pinSession={channel:m.channel,artifact:m.artifact};frame.dataset.pinReadyHash=m.artifact;}
      });
    }""")


def read_json(page, path):
    return page.evaluate("""async path=>{
      const r=await fetch(path);if(!r.ok)throw Error(path+' '+r.status);return r.json();
    }""", path)


def records(page):
    return {row["id"]: row for row in read_json(page, "/api/ia/r3-qa/records?release=MSG0585-R3")["items"]}


def ready(page, artifact_hash, selector=EMAIL):
    expect(page.locator("#lab")).to_be_visible()
    expect(page.locator("#product-lab")).to_have_count(0)
    expect(page.locator("#frame")).to_have_attribute("data-pin-ready-hash", artifact_hash)
    expect(page.locator("#frame")).to_have_js_property("inert", False)
    frame = page.frame_locator("#frame")
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(frame.locator(selector)).to_be_visible()
    return frame


def actual_size(page):
    page.locator("#points").click()
    page.locator("[data-drawer-tab=settings]").click()
    page.locator("#scale-fit").set_checked(False)
    page.locator("#close-drawer").click()
    assert page.locator("#focus-unit .preview-canvas").evaluate(
        "el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a") == 1


def capture_anchor(page, frame, selector):
    """Use the real archived frame's picker, including its own fingerprint index.

    Historical UI correctly disables new review edits. This isolated fixture
    sends its existing authenticated parent/frame mode message, captures the
    real physical point and then seeds that immutable historical record by API.
    """
    target = frame.locator(selector)
    target.scroll_into_view_if_needed()
    target.element_handle().wait_for_element_state("stable")
    point = target.evaluate("el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}")
    start = page.evaluate("window.__pinMessages.length")
    page.evaluate("""()=>{
      const s=window.__pinSession;document.getElementById('frame').contentWindow.postMessage({
        scope:'ORDER_R3_HOST',channel:s.channel,artifact:s.artifact,type:'mode',payload:true},'*');
    }""")
    veil = frame.locator("#r3-veil")
    expect(veil).to_be_visible()
    frame_click(page, veil, position=point)
    page.wait_for_function("start=>window.__pinMessages.slice(start).some(m=>m.type==='point')", arg=start)
    anchor = page.evaluate("""start=>{
      const point=window.__pinMessages.slice(start).find(m=>m.type==='point').payload;
      const surface=document.getElementById('surface'),doc=document.scrollingElement;
      return {...point,scroll:[...point.scroll,{id:'host-surface',x:surface.scrollLeft,y:surface.scrollTop},
        {id:'host-document',x:doc.scrollLeft,y:doc.scrollTop}]};
    }""", start)
    page.evaluate("""()=>{
      const s=window.__pinSession;document.getElementById('frame').contentWindow.postMessage({
        scope:'ORDER_R3_HOST',channel:s.channel,artifact:s.artifact,type:'mode',payload:false},'*');
    }""")
    expect(veil).not_to_be_visible()
    assert anchor["id"] != "screen", "The fixture must capture the actual input, not an invented root position"
    assert anchor["instance"] == "login"
    return anchor


def store_pin(page, anchor, body):
    payload = {"release": "MSG0585-R3", "kind": "comment", "id": "pin-fixture-" + str(uuid4()),
               "expectedRevision": 0, "idempotencyKey": str(uuid4()),
               "data": {"body": body, "anchor": anchor, "target": {
                   "screen": "login", "state": "empty", "variant": "email", "viewport": WIDTH,
                   "artifactHash": anchor["artifactHash"]}}}
    saved = page.evaluate("""async payload=>{
      const me=await(await fetch('/api/ia/auth/me')).json();
      const r=await fetch('/api/ia/r3-qa/records',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':me.csrf},body:JSON.stringify(payload)});
      return {status:r.status,body:await r.json()};
    }""", payload)
    assert saved["status"] == 200 and saved["body"]["revision"] == 1, saved
    assert saved["body"]["data"] == payload["data"], saved
    return payload["id"]


def geometry(frame, marker, selector, anchor):
    frame.locator(selector).element_handle().wait_for_element_state("stable")
    result = marker.evaluate("""async (pin,args)=>{
      const label=pin.getAttribute('aria-label'),start=performance.now(),deadline=start+1500;
      let result;
      do{
        const el=document.querySelector(args.selector),r=el.getBoundingClientRect();
        // The frozen frame replaces marker buttons on every paint. Resolve the
        // same numbered marker again, rather than measuring a detached old node.
        const candidates=[...document.querySelectorAll('#r3-pins .r3-pin')]
          .filter(node=>node.getAttribute('aria-label')===label);
        const current=candidates.length===1?candidates[0]:null,p=current?.getBoundingClientRect();
        const expected=[r.left+args.anchor.x*r.width,r.top+args.anchor.y*r.height];
        const actual=p?[p.left+p.width/2,p.top+p.height/2]:null;
        result={expected,actual,error:actual?Math.hypot(expected[0]-actual[0],expected[1]-actual[1]):null,
          background:current?getComputedStyle(current).backgroundColor:null,repaintWaitMs:performance.now()-start};
        if(result.error!==null&&result.error<=3)return result;
        // Wait only for the real motion-end/host-message/frame repaint chain.
        // No resize, scroll, geometry stubs or DOM changes force a passing paint.
        await new Promise(requestAnimationFrame);
      }while(performance.now()<deadline);
      return result;
    }""", {"selector": selector, "anchor": anchor})
    assert result["error"] is not None and result["error"] <= 3, result
    return result


def check_legacy(context, origin, result):
    page = context.new_page()
    page.set_default_timeout(20000)
    install_probe(page)
    page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
    try:
        page.goto(url(origin, "previous", width=390))
        endpoint = "/api/ia/r3-qa/artifact?" + urlencode({"id": SCREEN, "width": 390})
        previous = read_json(page, endpoint + "&version=previous")
        assert previous["version"] == "previous"
        frame = ready(page, previous["hash"])
        # Legacy 1.0 paths start at #order-single's direct child and use the
        # original tag/nth-of-type chain. The synthetic point is measured at
        # the real email input's center relative to its original field label.
        legacy_anchor = frame.locator(EMAIL).evaluate("""input=>{
          const root=document.getElementById('order-single'),el=input.closest('label');
          if(!el||!root.contains(el))throw Error('Missing original legacy email label');
          const path=[];
          for(let node=el;node!==root;node=node.parentElement){
            if(!node?.parentElement)throw Error('Legacy path left its source root');
            const siblings=[...node.parentElement.children].filter(x=>x.localName===node.localName);
            path.unshift(node.localName+':nth-of-type('+(siblings.indexOf(node)+1)+')');
          }
          const selector=path.join(' > ');
          if(root.querySelectorAll(':scope > '+selector).length!==1||root.querySelector(':scope > '+selector)!==el)
            throw Error('Ambiguous legacy source path');
          const r=el.getBoundingClientRect(),i=input.getBoundingClientRect(),doc=document.scrollingElement;
          const point={x:i.left+i.width/2,y:i.top+i.height/2},contentHeight=Math.max(innerHeight,doc.scrollHeight);
          if(!r.width||!r.height)throw Error('Unmeasurable original legacy field');
          const nestedScroll=[];
          for(let node=el.parentElement;node&&node!==root;node=node.parentElement)
            if(node.scrollTop||node.scrollLeft)throw Error('The legacy fixture requires an initially unscrolled input');
          return {path:selector,tag:el.localName,label:'로그인 바텀시트 / 입력란',
            x:(point.x-r.left)/r.width,y:(point.y-r.top)/r.height,pageX:point.x/innerWidth,
            pageY:(point.y+doc.scrollTop)/contentHeight,height:r.height,contentHeight,scrollTop:doc.scrollTop,nestedScroll};
        }""")
        assert 0 <= legacy_anchor["x"] <= 1 and 0 <= legacy_anchor["y"] <= 1
        legacy_body = "합성 legacy 입력란 의견"
        unrelated_body = "합성 legacy 일반 의견"
        legacy_id = "legacy-email-fixture"
        fixture = {"sourceKey": SCREEN + "/390", "data": {"status": "fix", "comments": [
            {"id": legacy_id, "body": legacy_body, "status": "open", "anchor": legacy_anchor},
            {"id": "legacy-unrelated-fixture", "body": unrelated_body, "status": "open"}]}}
        original_fixture = json.dumps(fixture, ensure_ascii=False, sort_keys=True)
        before_records = records(page)
        # Only the legacy GET is mocked on this page. Its DOM/artifact, owner
        # session, current review records, projection, frame and markers are real.
        page.route(re.compile(r"/api/ia/r3-qa/legacy(?:\?|$)"), lambda route: route.fulfill(
            json={"items": [fixture], "hasMore": False, "nextCursor": 1}))
        current = read_json(page, endpoint + "&version=current")
        page.goto(url(origin, width=390))
        frame = ready(page, current["hash"])
        pin = frame.locator('.r3-pin.is-previous[data-previous-count="1"][data-current-count="0"]')
        expect(pin).to_have_count(1)
        expect(pin).to_have_css("background-color", "rgb(124, 58, 237)")
        frame_click(page, pin)
        card = page.locator("#notes article").filter(has=page.get_by_text(legacy_body, exact=True))
        expect(card).to_be_visible()
        expect(page.locator("#notes article").filter(has=page.get_by_text(unrelated_body, exact=True))).to_have_count(0)
        assert page.evaluate("window.__pinMessages.filter(m=>m.type==='openPins').at(-1).payload.ids") == ["legacy:" + legacy_id]
        source = card.get_by_role("link", name="의견을 남긴 화면 열기", exact=True)
        source_url = source.get_attribute("href")
        source_query = parse_qs(urlsplit(source_url).query)
        assert source_query["version"] == ["previous"] and source_query["width"] == ["390"]
        assert "artifactHash" not in source_query
        page.screenshot(path=str(OUT / "legacy-current-390.png"))
        source.click()
        frame = ready(page, previous["hash"])
        original_pin = frame.locator('.r3-pin.is-previous[data-previous-count="1"]')
        expect(original_pin).to_have_count(1)
        expect(original_pin).to_have_css("background-color", "rgb(124, 58, 237)")
        expect(frame.locator(".approval-draft-pin")).to_have_count(1)
        page.screenshot(path=str(OUT / "legacy-original-390.png"))
        other = read_json(page, "/api/ia/r3-qa/artifact?" + urlencode({"id": SCREEN, "width": 320, "version": "current"}))
        page.goto(url(origin, width=320))
        frame = ready(page, other["hash"])
        expect(frame.locator(".r3-pin")).to_have_count(0)
        page.locator("#points").click()
        expect(page.locator("#notes article").filter(has=page.get_by_text(legacy_body, exact=True))).to_have_count(0)
        page.goto(url(origin, width=390))
        frame = ready(page, current["hash"])
        expect(frame.locator('.r3-pin.is-previous[data-previous-count="1"]')).to_have_count(1)
        assert records(page) == before_records
        assert json.dumps(fixture, ensure_ascii=False, sort_keys=True) == original_fixture
        return {"sourceWidth": 390, "otherWidth": 320, "anchor": legacy_anchor,
                "previousHash": previous["hash"], "sourceUrl": source_url, "purpleCurrentAndOriginal": True,
                "clickedLegacyOnly": True, "otherWidthExcluded": True, "recordsAndFixtureUnchanged": True}
    except Exception:
        try:
            page.screenshot(path=str(OUT / "legacy-failure.png"))
        except Exception:
            pass
        raise
    finally:
        page.close()


def check_duplicate_original(context, origin, result):
    # Confirmed in projection-bridge-before-duplicate-fix.json: this exact
    # original q1/edit element shared its frozen fingerprint with five buttons.
    # The fixture keeps the real original DOM and measures a new synthetic point.
    screen = "q1/edit/email"
    path = "div:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(1) > fieldset:nth-of-type(2) > div:nth-of-type(1) > button:nth-of-type(2)"
    selector = "#order-single > " + path
    page = context.new_page()
    page.set_default_timeout(20000)
    install_probe(page)
    page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
    try:
        page.goto(url(origin, "previous", width=390, screen=screen))
        source = read_json(page, "/api/ia/r3-qa/artifact?" + urlencode({"id": screen, "width": 390, "version": "previous"}))
        frame = ready(page, source["hash"], selector)
        element = frame.locator(selector)
        element.scroll_into_view_if_needed()
        element.element_handle().wait_for_element_state("stable")
        captured = element.evaluate("""(el,path)=>{
          const root=document.getElementById('order-single'),fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
          const paths=new WeakMap(),all=[];
          for(const node of root.querySelectorAll('*')){
            if(node.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(node.tagName))continue;
            const key=(paths.get(node.parentElement)||'screen')+'/'+[node.localName,...fields.map(k=>node.getAttribute(k)||'')].join('|');
            paths.set(node,key);all.push(key);
          }
          const r=el.getBoundingClientRect(),doc=document.scrollingElement,contentHeight=Math.max(innerHeight,doc.scrollHeight);
          const point={x:r.left+r.width/2,y:r.top+r.height/2};
          const relativePath=node=>{
            const parts=[];
            for(;node!==root;node=node.parentElement){
              const siblings=[...node.parentElement.children].filter(s=>s.localName===node.localName);
              parts.unshift(node.localName+':nth-of-type('+(siblings.indexOf(node)+1)+')');
            }
            return parts.join(' > ');
          };
          const nestedScroll=[];
          for(let node=el.parentElement;node&&node!==root;node=node.parentElement)
            if(node.scrollTop||node.scrollLeft)nestedScroll.push({path:relativePath(node),top:node.scrollTop,left:node.scrollLeft});
          return {duplicateCount:all.filter(key=>key===paths.get(el)).length,
            attributes:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),
            anchor:{path,tag:el.localName,label:'Q1 계란 규격 / 버튼',
              x:(point.x-r.left)/r.width,y:(point.y-r.top)/r.height,
              pageX:point.x/innerWidth,pageY:(point.y+doc.scrollTop)/contentHeight,
              height:r.height,contentHeight,scrollTop:doc.scrollTop,nestedScroll}};
        }""", path)
        assert captured["duplicateCount"] >= 2, captured
        assert "id" not in captured["attributes"], captured
        anchor = captured["anchor"]
        legacy_id = "duplicate-original-button-fixture"
        body = "합성 원본 중복 구조 버튼 위치 의견"
        fixture = {"sourceKey": screen + "/390", "data": {"status": "fix", "comments": [
            {"id": legacy_id, "body": body, "status": "open", "anchor": anchor}]}}
        fixture_before = json.dumps(fixture, ensure_ascii=False, sort_keys=True)
        records_before = records(page)
        # Legacy GET only; the original source, geometry, projection and frozen
        # frame run without mocked DOM, rectangles, product IDs or current mapping.
        page.route(re.compile(r"/api/ia/r3-qa/legacy(?:\?|$)"), lambda route: route.fulfill(
            json={"items": [fixture], "hasMore": False, "nextCursor": 1}))
        page.reload()
        frame = ready(page, source["hash"], selector)
        pin = frame.locator('.r3-pin.is-previous[data-previous-count="1"][data-current-count="0"]')
        expect(pin).to_have_count(1)
        expect(pin).to_have_css("background-color", "rgb(124, 58, 237)")
        before = geometry(frame, pin, selector, anchor)
        # Move the actual scroll container, then let the frozen frame repaint.
        # A copied rectangle cannot pass when the real element has moved.
        movement = frame.locator(selector).evaluate("""async el=>{
          const before=el.getBoundingClientRect(),doc=document.scrollingElement;
          const candidates=[];for(let n=el.parentElement;n;n=n.parentElement)candidates.push(n);
          if(!candidates.includes(doc))candidates.push(doc);
          for(const node of candidates){
            const maximum=node.scrollHeight-node.clientHeight,old=node.scrollTop;
            if(maximum<24)continue;
            const next=old+24<=maximum?old+24:Math.max(0,old-24);
            if(Math.abs(next-old)<20)continue;
            node.scrollTo(node.scrollLeft,next);
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const after=el.getBoundingClientRect();
            if(Math.abs(node.scrollTop-old)>=20&&Math.hypot(after.left-before.left,after.top-before.top)>=15)
              return {from:old,to:node.scrollTop,before:[before.left,before.top],after:[after.left,after.top]};
            node.scrollTo(node.scrollLeft,old);
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          }
          throw Error('The original duplicate fixture has no real scroll movement');
        }""")
        after = geometry(frame, pin, selector, anchor)
        attributes_after = frame.locator(selector).evaluate("el=>Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]))")
        assert attributes_after == captured["attributes"], "A QA geometry proxy must not change the product element ID, class or other attributes"
        page.screenshot(path=str(OUT / "duplicate-original-after-scroll-390.png"))
        frame_click(page, pin)
        expect(page.locator("#notes article").filter(has=page.get_by_text(body, exact=True))).to_be_visible()
        assert page.evaluate("window.__pinMessages.filter(m=>m.type==='openPins').at(-1).payload.ids") == ["legacy:" + legacy_id]
        assert records(page) == records_before
        assert json.dumps(fixture, ensure_ascii=False, sort_keys=True) == fixture_before
        return {"sourceKey": screen + "/390", "sourceHash": source["hash"], "path": path,
                "duplicateFingerprintCount": captured["duplicateCount"], "beforeGeometry": before,
                "afterScrollGeometry": after, "movement": movement, "productAttributesUnchanged": True,
                "legacyClickId": "legacy:" + legacy_id, "recordsAndFixtureUnchanged": True}
    except Exception:
        try:
            page.screenshot(path=str(OUT / "duplicate-failure.png"))
        except Exception:
            pass
        raise
    finally:
        page.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    host = subprocess.Popen(["node", "tests/r3-browser-host.mjs"], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    result = {"environment": "loopback ephemeral review DB; actual archived/current frames", "pageErrors": [], "checks": {}}
    page = None
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            context = browser.new_context(viewport={"width": 1280, "height": 980})
            page = context.new_page()
            page.set_default_timeout(20000)
            install_probe(page)
            page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
            page.goto(url(fixture["url"]))
            page.locator("input[name=email]").fill(fixture["email"])
            page.locator("input[name=password]").fill(fixture["pass"])
            page.locator("button[type=submit]").click()
            page.wait_for_url("**/ia?view=qa-lab**")
            endpoint = "/api/ia/r3-qa/artifact?" + urlencode({"id": SCREEN, "width": WIDTH})
            current = read_json(page, endpoint + "&version=current")
            archived = read_json(page, endpoint + "&version=prior-r3")
            assert archived["version"] == "prior-r3"
            assert archived["hash"] not in (current["hash"], current["source"]["contentHash"])
            result["sources"] = {"archived": archived["hash"], "current": current["hash"], "content": current["source"]["contentHash"], "viewport": WIDTH}

            page.goto(url(fixture["url"], "recorded", archived["hash"]))
            frame = ready(page, archived["hash"])
            actual_size(page)
            old_anchor = capture_anchor(page, frame, EMAIL)
            assert old_anchor["artifactHash"] == archived["hash"]
            old_id = store_pin(page, old_anchor, OLD_BODY)
            original = records(page)[old_id]
            saved_scroll = next(s["x"] for s in old_anchor["scroll"] if s["id"] == "host-surface")
            assert saved_scroll > 0, old_anchor["scroll"]

            page.goto(url(fixture["url"]))
            frame = ready(page, current["hash"])
            actual_size(page)
            previous = frame.locator('.r3-pin.is-previous[data-previous-count="1"][data-current-count="0"]')
            expect(previous).to_have_count(1)
            expect(previous).to_have_css("background-color", "rgb(124, 58, 237)")
            prior_geometry = geometry(frame, previous, EMAIL, old_anchor)
            current_anchor = capture_anchor(page, frame, PASSWORD)
            current_id = store_pin(page, current_anchor, NEW_BODY)
            page.reload()
            frame = ready(page, current["hash"])
            page.mouse.move(4, 4)
            previous = frame.locator('.r3-pin.is-previous[data-current-count="0"]')
            present = frame.locator('.r3-pin[data-previous-count="0"][data-current-count="1"]')
            expect(previous).to_have_css("background-color", "rgb(124, 58, 237)")
            expect(present).to_have_css("background-color", "rgb(49, 93, 230)")
            geometry(frame, present, PASSWORD, current_anchor)
            page.screenshot(path=str(OUT / "previous-and-current.png"))
            frame_click(page, previous)
            old_card = page.locator("#notes article").filter(has=page.get_by_text(OLD_BODY, exact=True))
            expect(old_card).to_be_visible()
            source = old_card.get_by_role("link", name="의견을 남긴 화면 열기", exact=True)
            source_url = source.get_attribute("href")
            assert parse_qs(urlsplit(source_url).query)["artifactHash"] == [archived["hash"]]
            assert page.evaluate("window.__pinMessages.filter(m=>m.type==='openPins').at(-1).payload.ids") == [old_id]
            source.click()
            ready(page, archived["hash"])
            page.goto(url(fixture["url"]))
            frame = ready(page, current["hash"])

            mixed_anchor = capture_anchor(page, frame, EMAIL)
            mixed_id = store_pin(page, mixed_anchor, MIXED_BODY)
            page.reload()
            frame = ready(page, current["hash"])
            # A full reload restores the R1 shell's checked fit-to-space default.
            # Restore the recorded 1:1 preview scale before comparing its scroll.
            actual_size(page)
            mixed = frame.locator('.r3-pin.is-mixed[data-previous-count="1"][data-current-count="1"]')
            expect(mixed).to_have_count(1)
            expect(mixed).to_have_attribute("data-cluster", "+1")
            expect(mixed).to_have_attribute("aria-label", re.compile("이전 1개, 현재 1개"))
            mixed_colors = mixed.evaluate("el=>getComputedStyle(el).backgroundImage")
            assert "rgb(124, 58, 237)" in mixed_colors and "rgb(49, 93, 230)" in mixed_colors, mixed_colors
            expect(frame.locator(".r3-pin")).to_have_count(2)
            frame_click(page, mixed)
            expect(page.locator("#notes article").filter(has=page.get_by_text(OLD_BODY, exact=True))).to_be_visible()
            expect(page.locator("#notes article").filter(has=page.get_by_text(MIXED_BODY, exact=True))).to_be_visible()
            opened = page.evaluate("window.__pinMessages.filter(m=>m.type==='openPins').at(-1).payload.ids")
            assert set(opened) == {old_id, mixed_id}, opened
            page.screenshot(path=str(OUT / "mixed-cluster-comments.png"))

            # Restore the recorded real stage scroll through the old comment's UI.
            maximum_scroll = page.locator("#surface").evaluate("el=>el.scrollWidth-el.clientWidth")
            assert maximum_scroll >= saved_scroll, {"maximumScroll": maximum_scroll, "savedScroll": saved_scroll}
            page.locator("#surface").evaluate("el=>el.scrollTo(0,0)")
            assert page.locator("#surface").evaluate("el=>el.scrollLeft") == 0
            old_card = page.locator("#notes article").filter(has=page.get_by_text(OLD_BODY, exact=True))
            restore = old_card.get_by_role("button", name="위치 보기", exact=True)
            expect(restore).to_be_enabled()
            restore.click()
            expect(page.locator("#drawer")).to_have_js_property("hidden", True)
            page.wait_for_function("x=>Math.abs(document.getElementById('surface').scrollLeft-x)<=1", arg=saved_scroll)
            restored = geometry(frame, mixed, EMAIL, old_anchor)
            page.reload()
            frame = ready(page, current["hash"])
            expect(frame.locator('.r3-pin.is-mixed[data-previous-count="1"][data-current-count="1"]')).to_have_count(1)
            final_records = records(page)
            assert final_records[old_id] == original, "Display restoration must not rewrite the source comment or original anchor"
            assert set(final_records) == {old_id, current_id, mixed_id}
            assert not result["pageErrors"], result["pageErrors"]
            result["checks"] = {"actualArchivedSource": True, "previousPurple": True, "currentBlue": True,
                "mixedCluster": opened, "originalSourceLink": source_url, "oldRecordUnchanged": True,
                "priorGeometry": prior_geometry, "restoredGeometry": restored, "savedScrollX": saved_scroll,
                "restoredPreviewScale": 1, "maximumScrollX": maximum_scroll,
                "reload": True, "syntheticRecords": 3}
            result["checks"]["legacy"] = check_legacy(context, fixture["url"], result)
            result["checks"]["duplicateOriginal"] = check_duplicate_original(context, fixture["url"], result)
            assert not result["pageErrors"], result["pageErrors"]
            result["status"] = "PASS"
            context.close()
            browser.close()
    except Exception as error:
        result["status"] = "FAIL"
        result["failure"] = str(error)
        if page:
            try:
                page.screenshot(path=str(OUT / "failure.png"))
            except Exception:
                pass
        raise
    finally:
        (OUT / "receipt.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        host.terminate()
        host.wait(timeout=5)


if __name__ == "__main__":
    main()
