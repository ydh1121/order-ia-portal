"""Measure the original logo and account stack in the actual product runtime.

The existing Pages host owns session issuance, lab personas, domain handlers and
two separate SQLite databases. All navigation URLs come from the QA lab UI. The
init script only observes rendered frames; it never changes authentication,
responses, animation clocks, application state or DOM geometry.
"""
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from contextlib import contextmanager
import hashlib
import json
import os
import re
import shutil
import subprocess
import traceback

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / os.getenv("R3_LOGO_EVIDENCE_DIR", "artifacts/logo-correction")
EVIDENCE.mkdir(parents=True, exist_ok=True)

# Figma 1063:21997 / 1034:18316, recovered from the retained source metadata.
# These are the union of the three visible paths, not the padded SVG viewport.
MEMBER = {"x": 299, "y": 32, "width": 51.8740081787, "height": 20.7477855682}
GUEST = {"x": 103.999954, "y": 31.2667446, "width": 51.874136, "height": 20.747786}

OBSERVER = r"""(() => {
  if (window !== top) return;
  const ids = new WeakMap(); let next = 0;
  const id = node => { if (!node) return null; if (!ids.has(node)) ids.set(node, ++next); return ids.get(node); };
  const number = value => Math.round(value * 100000) / 100000;
  const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return Object.fromEntries(['x','y','width','height'].map(k => [k, number(r[k])])); };
  const union = nodes => { const r = nodes.map(rect); if (!r.length) return null; const x = Math.min(...r.map(v=>v.x)), y = Math.min(...r.map(v=>v.y)); return {x,y,width:number(Math.max(...r.map(v=>v.x+v.width))-x),height:number(Math.max(...r.map(v=>v.y+v.height))-y)}; };
  const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); };
  const receipt = window.__logoEvidence = {frames:[], animations:[], href:location.href, started:Date.now()};
  const seen = new WeakSet();
  const snapshot = () => {
    const brand = document.querySelector('.obm-brand'), trigger = brand?.querySelector('.obm-trigger'), svg = trigger?.querySelector('svg');
    if (!svg) return null;
    const paths = [...svg.querySelectorAll('g > path')], panel = document.querySelector('.obm-panel');
    // Bounding boxes remain nonzero at opacity:0. Record the actual opacity and
    // visibility chain so an invisible moving logo cannot satisfy this test.
    const painted = new Map();
    const paint = node => {
      if (!node) return 0;
      if (painted.has(node)) return painted.get(node);
      const style = getComputedStyle(node), opacity = Number.parseFloat(style.opacity);
      const value = style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse' ? 0 :
        (Number.isFinite(opacity)?opacity:1)*(node.parentElement?paint(node.parentElement):1);
      painted.set(node,value); return value;
    };
    const stack = panel?.querySelector('.obm-stack'), opened = panel && !panel.hidden;
    const state = brand.__orderAccountMenu?.inspect();
    const current = state?.page;
    const page = opened ? [...panel.querySelectorAll('[data-obm-page]')].find(n=>n.dataset.obmPage===current) : null;
    const layers = opened ? [...panel.querySelectorAll('.obm-stack-layer')].map(n=>({node:id(n),side:n.dataset.obmLayer,rect:rect(n),contentOpacity:number(paint(n.firstElementChild)),transform:getComputedStyle(n).transform})) : [];
    const flights = [...document.querySelectorAll('.obm-flight')].map(n=>{const path=n.querySelector('path');return {node:id(n),point:path?.getAttribute('data-jelly'),rect:rect(n),pathRect:rect(path),opacity:number(paint(path))};});
    const rootPoints = opened ? [...panel.querySelectorAll('[data-obm-page="root"] [data-obm-point] path')].map(n=>({point:n.getAttribute('data-jelly'),rect:rect(n),opacity:number(paint(n))})) : [];
    const title = document.querySelector('.obm-title-flight');
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (!(target instanceof Element) || !((brand.contains(target)) || panel?.contains(target)) || seen.has(animation)) continue;
      seen.add(animation);
      const timing = animation.effect.getTiming();
      receipt.animations.push({id:animation.id,node:id(target),className:target.getAttribute('class'),at:number(performance.now()),duration:timing.duration,delay:timing.delay,easing:timing.easing,keyframes:animation.effect.getKeyframes().map(f=>Object.fromEntries(Object.entries(f).filter(([k])=>['offset','computedOffset','easing','transform','opacity','filter','width','height','borderRadius'].includes(k))))});
    }
    return {t:number(performance.now()),visibility:document.visibilityState,svg:id(svg),paths:paths.map(id),pathRects:paths.map(rect),pathShape:paths.map(p=>hash(p.getAttribute('d')||'')),mark:union(paths),markOpacity:number(Math.min(...paths.map(paint))),trigger:rect(trigger),word:rect(brand.querySelector('.obm-wordmark')),arrival:state?.arrival,arrivalCount:state?.arrivalCount,motion:svg.dataset.motionState,authenticated:state?.authenticated,phase:state?.phase,page:current,step:document.querySelector('.ob')?.dataset.introStep,panel:opened?rect(panel):null,panelNode:id(panel),surface:opened?rect(panel.querySelector('.obm-surface')):null,stack:opened?rect(stack):null,pageNode:id(page),labels:page?[...page.querySelectorAll('.obm-label')].map(n=>({text:n.textContent,hidden:Boolean(n.closest('[hidden]')),opacity:number(paint(n))})):[],layers,title:title?{rect:rect(title),text:title.textContent,opacity:number(paint(title))}:null,flights,rootPoints,activeItem:document.activeElement?.dataset.obmItem||null};
  };
  receipt.snapshot = snapshot;
  const frame = () => {
    const value = snapshot();
    if (value) receipt.frames.push(value);
    // Longer than the complete test sequence; bounded even after a failure.
    if (performance.now() < 120000 && receipt.frames.length < 7200) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();"""


def write_json(name, data):
    (EVIDENCE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def near(actual, wanted, label, tolerance=1):
    assert abs(actual - wanted) <= tolerance, {"label": label, "actual": actual, "expected": wanted, "tolerance": tolerance}


def state(page):
    return page.evaluate("window.__logoEvidence.snapshot()")


def settled(page):
    page.wait_for_function("() => {const b=document.querySelector('.obm-brand'),s=b?.__orderAccountMenu?.inspect(),svg=b?.querySelector('.obm-trigger>svg');return s&&s.arrival==='rest'&&svg?.dataset.motionState==='rest';}")


def product_ready(page, persona):
    expect(page.locator("html")).to_have_attribute("data-product-runtime", "canonical")
    expect(page.locator("html")).to_have_attribute("data-product-screen", "onboarding")
    page.wait_for_function("p=>window.ORDER_APP_CONTEXT?.persona===p&&document.querySelector('.obm-brand')?.__orderAccountMenu", arg=persona)
    # The guest product deliberately cannot obtain a member session. Its
    # introduction and logo mount without one; a denied session must not be
    # mistaken for a failed guest page or silently accepted for a member.
    readiness = page.evaluate("""async()=>{
      try { await window.ORDER_APP_ADAPTER.ready; return {status:'fulfilled'}; }
      catch(error) { return {status:'rejected',error:error.message}; }
    }""")
    if persona == "guest":
        assert readiness == {"status": "rejected", "error": "AUTHENTICATION_REQUIRED"}, readiness
    else:
        assert readiness == {"status": "fulfilled"}, readiness
    page.evaluate("async()=>{await document.fonts.ready;}")
    context = page.evaluate("window.ORDER_APP_CONTEXT")
    assert context["mode"] == "lab" and context["actor"]["authenticated"] is (persona != "guest"), context
    assert f"/as/{persona}/product" in context["endpoints"]["product"], context
    return context


def geometry(page, expected, label):
    settled(page)
    actual = state(page)
    assert actual["visibility"] == "visible" and actual["markOpacity"] > .99, {"label": label, "visibility": actual["visibility"], "opacity": actual["markOpacity"]}
    for key, value in expected.items():
        near(actual["mark"][key], value, label + ": path " + key)
    for key, value in {"x": 24, "y": 29.0234375, "width": 72, "height": 25}.items():
        near(actual["word"][key], value, label + ": word " + key)
    assert page.locator(".obm-wordmark").evaluate("e=>getComputedStyle(e).backgroundImage") == "none"
    assert page.locator(".obm-wordmark").evaluate("e=>getComputedStyle(e).color") == "rgb(36, 41, 46)"
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    return actual


def save_timeline(page, name):
    data = page.evaluate("(()=>{const r=window.__logoEvidence;return {href:r.href,started:r.started,frames:r.frames,animations:r.animations,last:r.snapshot()};})()")
    write_json(name + ".json", data)
    return data


def menu_settled(page, current, phase="open"):
    page.wait_for_function("([current,phase])=>{const b=document.querySelector('.obm-brand'),p=document.querySelector('.obm-panel'),s=b?.__orderAccountMenu?.inspect();return s?.page===current&&s?.phase===phase&&!p?.dataset.stackMoving;}", arg=[current, phase])
    if phase == "open":
        actual = state(page)
        rect = actual["panel"]
        assert rect and rect["x"] >= 0 and rect["y"] >= 0 and rect["x"] + rect["width"] <= 376 and rect["y"] + rect["height"] <= 829, rect
        # Permission-denied entries remain in the DOM with hidden=true. They
        # must stay unpainted; every permitted entry must finish fully visible.
        assert all(label["opacity"] == 0 if label["hidden"] else label["opacity"] > .99
                   for label in actual["labels"]), actual["labels"]


def change_persona(home, persona):
    home.bring_to_front()
    home.locator("#live-persona").select_option(persona)
    home.wait_for_function("p=>new URL(document.querySelector('#live-open').href).searchParams.get('persona')===p", arg=persona)
    href = home.locator("#live-open").get_attribute("href")
    assert parse_qs(urlsplit(href).query)["persona"] == [persona]
    return href


def read_json(page, url):
    result = page.evaluate("async url=>{const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});return {status:response.status,body:await response.json()};}", url)
    assert result["status"] == 200, result
    return result["body"]


def prices(page, base, run):
    # Read the actual approved policy, without editing the user/workspace table.
    prefix = base + f"/api/ia/lab/runs/{run}/as/operator/price"
    desk = read_json(page, prefix + "/desk")
    versions = []
    for item in desk["versions"]:
        versions.append(read_json(page, prefix + "/version?id=" + item["id"]))
    assert len(versions) == 1, versions
    rows = versions[0]["version"]["policy"]["matrix"]["rows"]
    assert len(rows) == 19 and sum(len(row["cells"]) for row in rows) == 152
    return {"versions": versions, "rows": len(rows), "cells": 152,
            "sha256": hashlib.sha256(json.dumps(versions, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}


def check_stack_motion(timeline):
    pushes = [a for a in timeline["animations"] if "obm-stack-layer" in (a["className"] or "")]
    distances = [float(match[1]) for a in pushes for f in a["keyframes"] if (match := re.fullmatch(r"translateX\(([-\d.]+)px\)", f.get("transform", "")))]
    assert any(abs(distance - 300) < 1 for distance in distances), pushes
    assert any(abs(distance + 90) < 1 for distance in distances), pushes
    assert any(a["duration"] == 420 for a in pushes), pushes
    moving = [f for f in timeline["frames"] if len(f["layers"]) == 2]
    assert len(moving) >= 6, "No real rendered frames of the panel stack were captured"
    assert any(layer["contentOpacity"] > .2 and abs(layer["rect"]["x"] - f["stack"]["x"]) > 35 for f in moving for layer in f["layers"]), moving[:3]
    assert any(f["title"] and f["title"]["opacity"] > .99 and f["title"]["text"] == "프로필" for f in moving), "Tapped title never flew visibly into the next heading"
    flights = [f for f in timeline["frames"] if len(f["flights"]) == 3]
    assert len(flights) >= 3, "The three original colored paths did not fly separately"
    assert all(sorted(p["point"] for p in f["flights"]) == ["0", "1", "2"] for f in flights)
    first = next(i for i, frame in enumerate(timeline["frames"]) if frame["phase"] == "opening" and len(frame["flights"]) == 3)
    finished = next(i for i in range(first + 1, len(timeline["frames"])) if timeline["frames"][i]["phase"] == "open" and timeline["frames"][i]["page"] == "root")
    arrival = timeline["frames"][finished]
    assert len(arrival["rootPoints"]) == 3 and all(point["opacity"] > .99 for point in arrival["rootPoints"])
    trajectories = []
    for point in ("0", "1", "2"):
        samples = [flight for frame in timeline["frames"][first:finished] for flight in frame["flights"] if flight["point"] == point and flight["opacity"] > .99]
        assert len(samples) >= 3, {"point": point, "visibleFlightSamples": len(samples)}
        displacement = max(sample["pathRect"]["x"] for sample in samples) - min(sample["pathRect"]["x"] for sample in samples)
        assert displacement > 120, {"point": point, "visibleTravelX": displacement}
        target = next(item["rect"] for item in arrival["rootPoints"] if item["point"] == point)
        for coordinate in ("x", "y"):
            near(samples[-1]["pathRect"][coordinate], target[coordinate], "point " + point + " landed " + coordinate, tolerance=3)
        trajectories.append({"point": point, "visibleSamples": len(samples), "travelX": displacement, "destination": target})
    surfaces = [f["surface"]["width"] for f in timeline["frames"] if f["surface"]]
    assert any(70 < width < 305 for width in surfaces), "Popover surface never rendered an intermediate morph width"
    return {"renderedStackFrames": len(moving), "threePathFlightFrames": len(flights), "pointTrajectories": trajectories,
            "titleFlightFrames": sum(bool(f["title"]) for f in timeline["frames"]), "fullWidth": 300, "parallax": 90}


def main():
    errors, responses, pages = [], [], []
    receipt = {"status": "RUNNING", "checkpoint": "host-start", "environment": "actual Pages routes, canonical product source, server-issued lab personas, separate SQLite databases", "viewport": {"width": 375, "height": 828}}
    host_log = (EVIDENCE / "host.stderr.log").open("w", encoding="utf-8")
    host = subprocess.Popen(["node", "tests/product-lab-browser-host.mjs"], cwd=ROOT, stdout=subprocess.PIPE, stderr=host_log, text=True)
    browser = context = product = None

    def listen(page):
        pages.append(page)
        page.set_default_timeout(15000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: responses.append({"url": response.url, "method": response.request.method, "status": response.status}) if "/api/ia/" in response.url else None)
        return page

    @contextmanager
    def preserve_failure_evidence():
        # Exit this guard before sync_playwright stops its connection, so an
        # assertion failure still retains the live rendered frame and trace.
        try:
            yield
        except Exception:
            if product and not product.is_closed():
                try:
                    save_timeline(product, "failure-timeline")
                except Exception:
                    pass
                try:
                    product.screenshot(path=EVIDENCE / "failure.png")
                except Exception:
                    pass
            if context:
                try:
                    context.tracing.stop(path=EVIDENCE / "product-logo-trace.zip")
                except Exception:
                    pass
            raise

    try:
        base = host.stdout.readline().strip()
        assert base.startswith("http://127.0.0.1:"), base
        with sync_playwright() as pw, preserve_failure_evidence():
            receipt["checkpoint"] = "browser-launch"
            browser = pw.chromium.launch(executable_path=os.getenv("R3_BROWSER_BINARY") or shutil.which("google-chrome") or shutil.which("chromium"), args=["--no-sandbox"])
            # Screenshots and frame JSON work without an optional ffmpeg binary.
            # A Playwright trace records the actual UI actions and network reads.
            context = browser.new_context(viewport={"width": 375, "height": 828}, reduced_motion="no-preference")
            context.add_init_script(OBSERVER)
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            receipt["checkpoint"] = "create-isolated-run"
            home = listen(context.new_page())
            home.goto(base + "/__lab-test-session")
            home.locator("#live-create").click()
            home.locator("#live-dialog input").fill("R1 로고·계정 메뉴 실제 구동 검사")
            home.get_by_role("button", name="생성", exact=True).click()
            expect(home.locator("#live-dialog")).not_to_be_visible()
            home.wait_for_function("()=>!!document.querySelector('#live-run').value")
            run = home.locator("#live-run").input_value()
            before_prices = prices(home, base, run)
            home.locator("#live-width").select_option("375")
            guest_url = change_persona(home, "guest")
            with context.expect_page() as opened:
                home.locator("#live-open").click()
            product = listen(opened.value)
            product.bring_to_front()
            product.wait_for_load_state("domcontentloaded")
            assert product.url == guest_url
            guest_context = product_ready(product, "guest")
            receipt["checkpoint"] = "guest-geometry-and-visible-idle"
            guest = geometry(product, GUEST, "guest")
            assert guest["arrivalCount"] == 0
            product.screenshot(path=EVIDENCE / "guest-375.png")
            # Observe the original random idle schedule (10–15 s). Do not click
            # the mark, call its player or alter the animation clock to trigger it.
            product.wait_for_function("()=>new Set(window.__logoEvidence.frames.filter(f=>f.motion==='idle'&&f.visibility==='visible'&&f.markOpacity>.99).map(f=>f.pathShape.join('|'))).size>=3", timeout=22000)
            product.screenshot(path=EVIDENCE / "guest-idle-375.png")
            settled(product)
            idle_timeline = save_timeline(product, "guest-timeline")
            idle_frames = [frame for frame in idle_timeline["frames"] if frame["motion"] == "idle" and frame["markOpacity"] > .99]
            idle_ranges = [max(frame["pathRects"][index][key] for frame in idle_frames) - min(frame["pathRects"][index][key] for frame in idle_frames) for index in range(3) for key in ("x", "y", "width", "height")]
            assert max(idle_ranges) > .15, {"idlePathBoundsVariation": idle_ranges}

            # Use the destination produced by the actual role picker. The lab
            # server validates run ownership and signs the buyer context; this
            # is a server persona transition, not an external email-login claim.
            member_url = change_persona(home, "buyer")
            product.bring_to_front()
            receipt["checkpoint"] = "server-member-arrival"
            member_document = product.goto(member_url)
            assert member_document.ok, member_document.status
            member_context = product_ready(product, "buyer")
            assert member_context["runId"] == guest_context["runId"] == run
            member = geometry(product, MEMBER, "member")
            assert member["arrivalCount"] == 1
            arrival = save_timeline(product, "arrival-timeline")
            motion = [a for a in arrival["animations"] if a["id"] == "order-brand-arrival"]
            assert len(motion) == 1 and motion[0]["duration"] == 620, motion
            moving = [f for f in arrival["frames"] if f["arrival"] == "moving"]
            assert len(moving) >= 6 and min(f["trigger"]["x"] for f in moving) < 135, moving[:2]
            assert all(frame["markOpacity"] > .99 and frame["visibility"] == "visible" for frame in moving), "Arrival moved an invisible or background mark"
            assert max(f["trigger"]["x"] for f in moving) > 300, "Missing arrival overshoot"
            assert any(f["motion"] == "gather" for f in arrival["frames"]), "The original CODE1 jelly never ran"
            assert len({tuple(f["pathShape"]) for f in arrival["frames"]}) > 3
            assert all(f["svg"] == member["svg"] and f["paths"] == member["paths"] for f in arrival["frames"])
            product.screenshot(path=EVIDENCE / "member-1-375.png")

            # The actual intro controls update only content, keeping one header,
            # one original SVG, three original paths and the account panel.
            steps = [member]
            receipt["checkpoint"] = "four-intro-steps-and-reload"
            for step in (2, 3, 4):
                product.get_by_role("button", name=f"소개 {step}페이지", exact=True).click()
                expect(product.locator(".ob.member")).to_have_attribute("data-intro-step", str(step))
                current = geometry(product, MEMBER, f"member step {step}")
                assert (current["svg"], current["paths"], current["panelNode"]) == (member["svg"], member["paths"], member["panelNode"])
                assert current["arrivalCount"] == 1
                steps.append(current)
                product.screenshot(path=EVIDENCE / f"member-{step}-375.png")
            save_timeline(product, "four-intro-steps-timeline")
            product.reload()
            product_ready(product, "buyer")
            after_reload = geometry(product, MEMBER, "member reload")
            assert after_reload["arrivalCount"] == 0
            reload_timeline = save_timeline(product, "reload-timeline")
            assert not any(a["id"] == "order-brand-arrival" for a in reload_timeline["animations"])

            # A buyer cannot see the operator dashboard. Read the actual account
            # response before testing that authorization-dependent menu entry.
            buyer_account = read_json(product, base + member_context["endpoints"]["product"] + "/account")
            assert buyer_account["capabilities"]["dashboard"] is False
            product.locator(".obm-trigger").click()
            menu_settled(product, "root")
            product.locator('[data-obm-item="manage"]').click()
            menu_settled(product, "manage")
            expect(product.locator('[data-obm-item="manage.dashboard"]')).to_be_hidden()
            product.locator(".obm-heading").press("Escape")
            expect(product.locator(".obm-panel")).to_be_hidden()
            save_timeline(product, "buyer-menu-timeline")

            operator_url = change_persona(home, "operator")
            product.bring_to_front()
            product.goto(operator_url)
            operator_context = product_ready(product, "operator")
            operator_account = read_json(product, base + operator_context["endpoints"]["product"] + "/account")
            assert operator_account["capabilities"]["dashboard"] is True
            operator = geometry(product, MEMBER, "operator")
            panel_id, svg_id, path_ids = operator["panelNode"], operator["svg"], operator["paths"]
            stable_url = product.url
            receipt["checkpoint"] = "operator-menu-and-real-account-reads"
            trigger, panel = product.locator(".obm-trigger"), product.locator(".obm-panel")
            trigger.press("ArrowDown")
            menu_settled(product, "root")
            expect(panel.locator('[data-obm-page="root"] > [data-obm-item] .obm-label')).to_have_text(["프로필", "알림", "관리"])
            expect(panel.locator('[data-obm-item="profile"]')).to_be_focused()
            panel.locator('[data-obm-item="profile"]').press("ArrowDown")
            expect(panel.locator('[data-obm-item="notifications"]')).to_be_focused()
            panel.locator('[data-obm-item="notifications"]').press("Home")
            expect(panel.locator('[data-obm-item="profile"]')).to_be_focused()
            root_height = panel.bounding_box()["height"]
            root_page = state(product)["pageNode"]
            product.screenshot(path=EVIDENCE / "menu-root-375.png")
            panel.locator('[data-obm-item="profile"]').press("Enter")
            menu_settled(product, "profile")
            expect(panel.locator('[data-obm-page="profile"] [data-obm-item] .obm-label')).to_have_text(["계정", "개인정보", "연결된 계정"])
            profile_node = state(product)["pageNode"]
            account_prefix = base + operator_context["endpoints"]["product"]
            leaves = []
            for item in ("profile.account", "profile.personal", "profile.connections"):
                with product.expect_response(lambda response: response.url == account_prefix + "/account" and response.request.method == "GET") as loaded:
                    panel.locator(f'[data-obm-item="{item}"]').click()
                assert loaded.value.ok, loaded.value.status
                menu_settled(product, item)
                expect(panel.locator(f'[data-obm-page="{item}"] .obm-panel-content')).not_to_have_attribute("aria-busy", "true")
                if item != "profile.connections":
                    account = loaded.value.json()
                    expect(panel.locator('[name="name"]')).to_have_value(account["profile"]["name"])
                    expect(panel.locator('[name="phone"]')).to_have_value(account["profile"]["phone"])
                else:
                    expect(panel).to_contain_text("연결된 간편 로그인 계정이 없어요.")
                assert product.url == stable_url and state(product)["panelNode"] == panel_id
                leaves.append(item)
                product.screenshot(path=EVIDENCE / (item.replace(".", "-") + "-375.png"))
                panel.locator(".obm-back").click()
                menu_settled(product, "profile")
                assert state(product)["pageNode"] == profile_node
                expect(panel.locator(f'[data-obm-item="{item}"]')).to_be_focused()
            panel.locator(".obm-heading").press("ArrowLeft")
            menu_settled(product, "root")
            assert state(product)["pageNode"] == root_page
            near(panel.bounding_box()["height"], root_height, "root height restored")

            with product.expect_response(lambda response: response.url == account_prefix + "/notifications" and response.request.method == "GET") as notices:
                panel.locator('[data-obm-item="notifications"]').click()
            assert notices.value.ok and notices.value.json()["items"] == []
            menu_settled(product, "notifications")
            expect(panel).to_contain_text("새 알림이 없어요.")
            panel.locator(".obm-back").click()
            menu_settled(product, "root")
            panel.locator('[data-obm-item="manage"]').click()
            menu_settled(product, "manage")
            expect(panel.locator('[data-obm-page="manage"] [data-obm-item]:visible .obm-label')).to_have_text(["납품일정", "결제 및 정산", "내 견적", "사업장 정보", "대시보드"])
            assert panel.bounding_box()["height"] > root_height + 80
            manage_node = state(product)["pageNode"]
            product.screenshot(path=EVIDENCE / "menu-manage-375.png")
            for item in ("manage.delivery", "manage.payments", "manage.quotes", "manage.business", "manage.dashboard"):
                panel.locator(f'[data-obm-item="{item}"]').click()
                menu_settled(product, item)
                expect(panel.locator(f'[data-obm-page="{item}"] .obm-panel-content')).not_to_have_attribute("aria-busy", "true")
                assert product.url == stable_url and state(product)["panelNode"] == panel_id
                leaves.append(item)
                panel.locator(".obm-back").click()
                menu_settled(product, "manage")
                assert state(product)["pageNode"] == manage_node

            # Native pointer input exercises the Stack Panel's back gesture.
            receipt["checkpoint"] = "native-stack-back-and-rapid-reverse"
            bounds = panel.locator(".obm-stack").bounding_box()
            product.mouse.move(bounds["x"] + 5, bounds["y"] + 92)
            product.mouse.down()
            product.mouse.move(bounds["x"] + bounds["width"] * .55, bounds["y"] + 92, steps=14)
            product.mouse.up()
            menu_settled(product, "root")
            assert state(product)["pageNode"] == root_page
            near(panel.bounding_box()["height"], root_height, "root height after drag")
            product.keyboard.press("Escape")
            expect(panel).to_be_hidden()
            expect(trigger).to_be_focused()

            # Three physical clicks within the morph duration: open, reverse,
            # reopen. No stale completion may close the latest request.
            b = trigger.bounding_box()
            product.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
            product.wait_for_timeout(65)
            product.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
            product.wait_for_timeout(65)
            product.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
            menu_settled(product, "root")
            assert product.locator(".obm-flight").count() == 0
            assert product.url == stable_url
            current = state(product)
            assert (current["svg"], current["paths"], current["panelNode"]) == (svg_id, path_ids, panel_id)
            product.screenshot(path=EVIDENCE / "menu-reopened-375.png")
            menu_timeline = save_timeline(product, "operator-menu-timeline")
            motion_receipt = check_stack_motion(menu_timeline)

            product.keyboard.press("Escape")
            expect(panel).to_be_hidden()
            product.emulate_media(reduced_motion="reduce")
            receipt["checkpoint"] = "reduced-motion-and-price-preservation"
            trigger.click()
            menu_settled(product, "root")
            panel.locator('[data-obm-item="profile"]').click()
            menu_settled(product, "profile")
            assert product.locator(".obm-flight,.obm-title-flight,.obm-stack-layer").count() == 0
            assert product.evaluate("document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.closest('.obm-brand,.obm-panel')).length") == 0
            panel.locator(".obm-back").click()
            menu_settled(product, "root")
            product.keyboard.press("Escape")
            expect(panel).to_be_hidden()
            expect(trigger).to_be_focused()
            after_prices = prices(product, base, run)
            assert before_prices["versions"] == after_prices["versions"], "The original 152 prices changed during a logo/menu check"
            assert not errors, errors
            receipt.update(status="PASS", checkpoint="complete", source=operator_context.get("source"), runId=run,
                           guest=guest, member=member, introSteps=steps, arrivalFrames=len(moving), arrivalAnimations=1,
                           originalRandomIdle={"visibleFrames": len(idle_frames), "maximumBoundsVariation": max(idle_ranges)},
                           reloadArrivalCount=after_reload["arrivalCount"], preservedSvgAndPaths=True, roots=["프로필", "알림", "관리"],
                           profileAndManagementLeaves=leaves, buyerDashboardHidden=True, operatorDashboardVisible=True,
                           samePanelAndURL=True, realAccountResponse=True, nativeBackSwipe=True, rapidReverse=True,
                           reducedMotion=True, motion=motion_receipt, originalPrices={k:v for k,v in after_prices.items() if k!="versions"}, pageErrors=errors)
            write_json("receipt.json", receipt)
            write_json("network.json", responses)
            context.tracing.stop(path=EVIDENCE / "product-logo-trace.zip")
            context.close(); context = None
            browser.close(); browser = None
            print(json.dumps({k:receipt[k] for k in ("status", "arrivalFrames", "reloadArrivalCount", "preservedSvgAndPaths", "profileAndManagementLeaves", "originalPrices")}, ensure_ascii=False))
    except Exception:
        receipt.update(status="FAIL", failure=traceback.format_exc(), pageErrors=errors)
        write_json("receipt.json", receipt)
        write_json("network.json", responses)
        raise
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        host.terminate(); host.wait(timeout=5); host_log.close()


if __name__ == "__main__":
    main()
