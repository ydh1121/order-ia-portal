"""Compare the pinned, approved QA 1.0 tool with the authenticated candidate in the same Chrome."""
import base64
import gzip
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
from time import monotonic
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/approved-qa-1.0.html.gz"
REFERENCE_URL = "http://127.0.0.1:8159/approved.html"
SOURCE_SHA = "60263fc69f1bb8590c5b8902436d1e62d525eb077a018b0c8d8a1863ebe8993e"
OUT = ROOT / "artifacts/approved-shell"
# Each comparison uses the same browser viewport, document width, screen, state and review tab.
SCENES = [
    ("phone320", 320, 844, 320, "focus", None),
    ("phone390", 390, 844, 390, "focus", None),
    ("phone390-navigation", 390, 844, 390, "focus", "navigation"),
    ("phone390-review", 390, 844, 390, "focus", "review"),
    ("desktop390", 1440, 900, 390, "focus", None),
    ("desktop320", 1440, 900, 320, "focus", None),
    ("desktop-review", 1440, 900, 390, "focus", "review"),
    ("desktop-overview", 1440, 900, 390, "focus", "overview"),
    ("desktop-settings", 1440, 900, 390, "focus", "settings"),
    ("desktop-board", 1440, 900, 390, "board", None),
    ("desktop-pair", 1440, 900, 390, "dual", None),
    ("pc1280-pair", 1280, 900, 390, "dual", None),
]
MEASURE = """()=>{
 const all=(s)=>[...document.querySelectorAll(s)];
 const box=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100)};
 const visible=e=>!!(e.offsetWidth && e.offsetHeight && !e.hidden && getComputedStyle(e).visibility!=='hidden');
 const selects={sidebar:'.lab-sidebar',main:'.lab-main',bar:'.lab-topbar',chips:'.lab-states',stage:'.lab-stage',footer:'.lab-bottomline',drawer:'.lab-drawer'};
 const geometry=Object.fromEntries(Object.entries(selects).map(([k,s])=>[k,box(document.querySelector(s))]));
 const cards=all('#preview-list .preview-unit').filter(visible).map(e=>({screen:e.dataset.module,state:e.dataset.state,width:+e.dataset.width,height:+e.dataset.height,
   box:box(e),bound:box(e.querySelector('.preview-bound')),canvas:box(e.querySelector('.preview-canvas')),caption:box(e.querySelector('.preview-caption'))}));
 const rails={};
 for(const q of ['.lab-stage','.lab-catalog','.lab-states','.lab-drawer-body:not([hidden])']){
   const e=document.querySelector(q);if(!e || !visible(e))continue;
   const s=getComputedStyle(e),p=getComputedStyle(e,'::-webkit-scrollbar');
   const edges=parseFloat(s.borderLeftWidth)+parseFloat(s.borderRightWidth);
   const start=e.scrollTop, limit=e.scrollHeight-e.clientHeight;
   if(limit>1)e.scrollTop=start>0?0:Math.min(limit,25);
   const scrollWorked=limit<=1 || e.scrollTop!==start;e.scrollTop=start;
   rails[q]={overflow:s.overflowY,scrollbar:s.scrollbarWidth,webkitWidth:p.width,webkitDisplay:p.display,
     railPx:Math.max(0,e.offsetWidth-e.clientWidth-edges),scrollWorked,limit};
 }
 return {geometry,cards,rails,roles:all('button[data-role]').map(b=>b.dataset.role),
   modes:all('button[data-mode]').map(b=>b.dataset.mode),states:all('#state-buttons button[data-state]').map(b=>b.dataset.state),
   variants:all('#state-buttons button[data-variant]').map(b=>b.dataset.variant),mode:document.querySelector('.lab-stage').dataset.mode,
   drawerTabs:all('button[data-drawer-tab]').map(b=>b.dataset.drawerTab),
   modeButtons:all('.lab-topbar button[data-mode]').map(b=>b.textContent.trim()),
   navCount:all('#catalog button[data-module]').length,navModules:all('#catalog button[data-module]').map(b=>b.dataset.module),
   navEntries:all('#catalog button[data-module]').map(b=>({module:b.dataset.module,mode:b.dataset.quoteMode||null,states:Number(b.querySelector('.nav-count')?.textContent||0)})),
   navStateCounts:Object.fromEntries(all('#catalog button[data-module]').map(b=>[b.dataset.module,Number(b.querySelector('.nav-count')?.textContent||0)])),
   navGroups:all('#catalog [data-nav-group]').map(g=>g.dataset.navGroup),bodyOverflow:document.documentElement.scrollWidth-innerWidth,
   boardOpen:all('#preview-list button[data-open-state]').filter(visible).length,
   shellFonts:Object.fromEntries(['.lab-topbar','.lab-states','.lab-catalog'].map(s=>[s,getComputedStyle(document.querySelector(s)).fontFamily]))};
}"""


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def korean_font_for_mode_button(page):
    # Computed font-family only gives the CSS fallback list. Chromium reports the actual faces used.
    cdp=page.context.new_cdp_session(page)
    try:
        cdp.send("DOM.enable");cdp.send("CSS.enable")
        selector=page.evaluate("""()=>[...document.querySelectorAll('#state-buttons button[data-state]')].filter(e=>e.offsetWidth && e.innerText.match(/[가-힣]/g)?.length>=2).map(e=>'#state-buttons [data-state="'+e.dataset.state+'"]')[0]||'button[data-mode=focus]'""")
        root=cdp.send("DOM.getDocument")["root"]["nodeId"]
        node=cdp.send("DOM.querySelector",{"nodeId":root,"selector":selector})["nodeId"]
        fonts=cdp.send("CSS.getPlatformFontsForNode",{"nodeId":node})["fonts"]
        assert any("Noto Sans CJK" in f["familyName"] and f["glyphCount"]>=2 for f in fonts), fonts
        return fonts
    finally:cdp.detach()


def configure(page, url, candidate, preview_width, mode, panel):
    page.goto(url, wait_until="domcontentloaded")
    canvas = page.locator(".preview-unit:not([hidden]) .preview-canvas").first
    expect(canvas).to_be_visible()
    if candidate:
        page.frame_locator("#frame").locator("#r3-veil").wait_for(state="attached")
    if mode != "focus":
        page.locator(f'button[data-mode="{mode}"]').click()
    expect(page.locator(".lab-stage")).to_have_attribute("data-mode", mode)
    if panel == "navigation":
        page.locator('[data-lab-action="nav"]').click()
        expect(page.locator("#lab")).to_have_class(re.compile(r"nav-open"))
    elif panel:
        page.locator('[data-lab-action="notes"]').click()
        page.locator(f'button[data-drawer-tab="{panel}"]').click()
        expect(page.locator(f'[data-drawer-panel="{panel}"]')).to_be_visible()
    if mode != "board":
        expect(page.locator(".preview-unit:not([hidden])").first).to_have_attribute("data-width",str(preview_width))
    else:
        expect(page.locator(".preview-unit:not([hidden])").nth(1)).to_be_visible()
    if candidate and mode != "focus":
        for frame in page.locator(".preview-unit:not([hidden]) iframe").all():
            frame.content_frame.locator("#order-single").wait_for(state="attached")
    # CSS drawer transforms must finish before recording bounding rectangles.
    page.evaluate("async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.target?.matches?.('.lab-drawer,.lab-sidebar')).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}")


def compare(name, original, candidate, drawer, mode):
    errors = []
    def require(condition, message):
        if not condition: errors.append(message)
    for key in ("roles","modes","states","variants","drawerTabs","modeButtons","mode"):
        require(original[key]==candidate[key],f"{key}: {original[key]} / {candidate[key]}")
    # The user's 2026-11-20 directive replaces the flat menu with two editable
    # accordions. All existing preview geometry and other shell gates remain.
    # Nov 25 explicitly retires the 6 independent quote-review states and
    # the 2 result states new-only-detail/no-current. All other approved
    # modules and the shell geometry remain protected by this comparison.
    require(set(original["navModules"])-set(candidate["navModules"])=={"quote-review"},"the exact authorized retired module was not removed, or another approved module was lost")
    # Nov 27 explicitly separates simple/detailed calculator menu buttons.
    # Only q1–q4 gain a second entry; the underlying 102 modules stay intact.
    calculator_modules = {"q1", "q2", "q3", "q4"}
    module_counts = {module:candidate["navModules"].count(module) for module in set(candidate["navModules"])}
    require(candidate["navCount"]==106 and len(module_counts)==102 and {"price-workspace","notifications"}.issubset(module_counts),"MVP inventory, the canonical price workspace or the native notification page is missing")
    require({module for module,count in module_counts.items() if count!=1}==calculator_modules and all(module_counts.get(module)==2 for module in calculator_modules),"only q1–q4 may have the authorized pair of calculator entries")
    for module in calculator_modules:
        entries = [entry for entry in candidate["navEntries"] if entry["module"]==module]
        require(sorted(entry["mode"] or "" for entry in entries)==["detailed","simple"],f"{module} must expose simple and detailed exactly once")
        require(len(entries)==2 and entries[0]["states"]==entries[1]["states"]==candidate["navStateCounts"].get(module),f"{module} mode entries must preserve the original state inventory")
    require("quote-review" not in candidate["navStateCounts"] and candidate["navStateCounts"].get("quote-result")==9 and sum(candidate["navStateCounts"].values())==541,"current inventory must remove exactly the 8 retired states and retain all 541 review states")
    require(candidate["navGroups"]==["mvp","future"],"MVP and future accordions missing")
    require(candidate["bodyOverflow"] <= 1, f"document horizontal overflow {candidate['bodyOverflow']}px")
    def compare_box(what, a, b, axes=range(4), tol=2):
        if not a or not b: errors.append(f"{what} missing");return
        for i in axes:
            require(abs(a[i]-b[i])<=tol,f"{what}.{('x','y','width','height')[i]}: {a[i]} / {b[i]}")
    for key in ("sidebar","main","bar","chips","stage","footer"):
        compare_box(key,original["geometry"][key],candidate["geometry"][key])
    if drawer:
        a,b=original["geometry"]["drawer"],candidate["geometry"]["drawer"]
        compare_box("drawer",a,b,axes=(0,2))
        if a and b:
            require(abs((a[1]+a[3])-(b[1]+b[3]))<=2,"drawer bottom changed")
            bar=candidate["geometry"]["bar"]
            require(bool(bar) and b[1]>=bar[1]+bar[3]-1,"drawer obscures the position-comment toolbar")
    require(len(original["cards"])==len(candidate["cards"]),f"preview count {len(original['cards'])}/{len(candidate['cards'])}")
    for i,(a,b) in enumerate(zip(original["cards"],candidate["cards"])):
        for key in ("screen","state","width","height"):require(a[key]==b[key],f"preview[{i}] {key}: {a[key]} / {b[key]}")
        compare_box(f"preview[{i}]",a["bound"],b["bound"],tol=3)
        compare_box(f"canvas[{i}]",a["canvas"],b["canvas"],tol=3)
    if mode=="dual":require([b["width"] for b in candidate["cards"]]==[390,1280],"paired mobile/desktop dimensions")
    if mode=="board":require(candidate["boardOpen"]==len(candidate["cards"]),"missing board open controls")
    for key,rail in candidate["rails"].items():
        if rail["overflow"] in ("scroll","auto"):
            require(rail["railPx"]<=1,f"{key} visible rail {rail['railPx']}px")
            require(rail["scrollWorked"],f"{key} scroll not operable")
    return [f"{name}: {e}" for e in errors]


def check_stage_wheel(page):
    stage=page.locator(".lab-stage")
    assert stage.evaluate("e=>e.scrollHeight>e.clientHeight")
    box=stage.bounding_box()
    page.mouse.move(box["x"]+6,box["y"]+box["height"]/2)
    def wait_offset(check):
        deadline=monotonic()+4
        while monotonic()<deadline:
            offset=stage.evaluate("e=>e.scrollTop")
            if check(offset):return offset
            page.wait_for_timeout(40)
        raise AssertionError("Stage did not respond to wheel input")
    page.mouse.wheel(0,250)
    moved=wait_offset(lambda offset:offset>0)
    page.mouse.wheel(0,-1000)
    wait_offset(lambda offset:offset==0)
    return moved


def verify_review_controls(browser, auth, origin):
    ctx=browser.new_context(viewport={"width":1440,"height":900},storage_state=auth)
    page=ctx.new_page()
    url=origin+"/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390"
    page.goto(url)
    frame=page.frame_locator("#frame")
    frame.locator("#r3-veil").wait_for(state="attached")
    rail=frame.locator("html").evaluate("""root=>{
        const host=root.querySelector('.ds');
        const sample=document.createElement('div');
        sample.style.cssText='width:60px;height:20px;overflow:auto';
        const child=document.createElement('div');child.style.height='100px';sample.append(child);host.append(sample);
        const generic=getComputedStyle(sample).scrollbarWidth, documentWidth=getComputedStyle(root).scrollbarWidth;
        sample.scrollTop=12;const moved=sample.scrollTop;sample.className='r3-options scrollbar-select';
        const menu=getComputedStyle(sample).scrollbarWidth;sample.remove();return {documentWidth,generic,moved,menu};
    }""")
    assert rail["documentWidth"]=="none" and rail["generic"]=="none" and rail["moved"]>0 and rail["menu"]=="thin",rail
    page.locator("#points").focus()
    page.keyboard.press("c")
    expect(frame.locator("#r3-veil")).to_be_visible()
    frame.locator("#r3-veil").press("c")
    expect(page.locator("#body-text")).to_be_focused()
    page.keyboard.press("Escape")
    expect(page.locator("#drawer")).to_be_hidden()
    page.locator("#points").click()
    page.locator("#figma-stage").select_option("editing")
    page.locator("#figma-memo").fill("검토 셸 브라우저 검사")
    page.locator("#link-figma").click()
    expect(page.locator("#figma-status-badge")).to_have_text("수정 중")
    page.reload();page.frame_locator("#frame").locator("#r3-veil").wait_for(state="attached")
    page.locator("#points").click()
    expect(page.locator("#figma-memo")).to_have_value("검토 셸 브라우저 검사")
    page.locator("#close-drawer").click();page.locator("button[data-mode=board]").click()
    other=page.locator(".preview-unit:not([hidden])").nth(1)
    state=other.get_attribute("data-state");assert state and state!="empty"
    veil=other.locator("iframe").content_frame.locator("#r3-veil");veil.wait_for(state="attached")
    page.locator("#new").click();expect(veil).to_be_visible()
    veil.click(position={"x":22,"y":35})
    page.locator("#body-text").fill("보드 다른 상태의 위치 의견")
    with page.expect_response(lambda r:"/api/ia/r3-qa/records" in r.url and r.request.method=="POST" and r.status==200):
        page.locator("#save").click()
    saved=page.evaluate("""async()=>{const rows=(await(await fetch('/api/ia/r3-qa/records?release=MSG0585-R3')).json()).items;
        return rows.find(r=>r.kind==='comment' && r.data?.body==='보드 다른 상태의 위치 의견')?.data.target;}""")
    assert saved and saved["screen"]=="login" and saved["state"]==state and saved["viewport"]==390,saved
    # Give only this page one invented legacy opinion at its original width.
    # The 12 screenshot pairs above remain comparable with empty review data.
    source_key="login/empty/email/390"
    legacy_text="합성 시험용 390px 이전 의견"
    legacy_row={"sourceKey":source_key,"data":{"status":"fix","comments":[
        {"id":"qa-width-fixture","body":legacy_text,"status":"open"}]}}
    page.route("**/api/ia/r3-qa/legacy?**",lambda route:route.fulfill(
        json={"items":[legacy_row],"hasMore":False,"nextCursor":1}))
    page.goto(origin+"/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=320")
    page.frame_locator("#frame").locator("#r3-veil").wait_for(state="attached")
    previous=page.locator('#review-summary [data-metric="previous"] strong')
    expect(previous).to_have_text("1")
    page.locator("#points").click()
    expect(page.locator("#notes article").filter(has_text=legacy_text)).to_have_count(0)
    expect(page.locator('[data-review="unreviewed"]')).to_have_class(re.compile(r"\bactive\b"))
    page.locator("#other-width-history").get_by_role("button",name=re.compile("390px 이전 검토 보기")).click()
    expect(page).to_have_url(re.compile(r"[?&]width=390(?:&|$)"))
    expect(page.locator("#notes article").filter(has_text=legacy_text)).to_be_visible()
    ctx.close()
    return {"rails":rail,"figmaStage":"editing","figmaNoteAfterReload":True,"secondaryBoardTarget":saved,
            "legacyWidth":{"fixture":"one invented prior fix","sourceWidth":390,"startWidth":320,
                           "globalPreviousCount":1,"startWidthVerdict":"unreviewed","openedLegacyWidth":390}}

def make_pair(browser, first, second, out, viewport, height):
    page=browser.new_page(viewport={"width":viewport*2,"height":height},device_scale_factor=1)
    img=lambda b:"data:image/png;base64,"+base64.b64encode(b).decode("ascii")
    page.set_content('<style>*{margin:0}body{display:flex}img{display:block}</style>'+''.join('<img src="'+img(b)+'">' for b in (first,second)))
    page.evaluate("Promise.all([...document.images].map(x=>x.decode()))")
    page.screenshot(path=out)
    page.close()


def main():
    raw=gzip.decompress(FIXTURE.read_bytes())
    assert len(raw)==1098328 and hashlib.sha256(raw).hexdigest()==SOURCE_SHA, "Incorrect approved HTML"
    OUT.mkdir(parents=True, exist_ok=True)
    server=subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    results={"sourceSHA256":SOURCE_SHA,"commit":os.environ.get("GITHUB_HEAD_SHA") or "local","pairs":[],"errors":[]}
    try:
        cfg=json.loads(server.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            results["chromium"]=browser.version
            auth=browser.new_context()
            login=auth.new_page();login.goto(cfg["url"]+"/ia?view=qa-lab")
            login.locator("input[name=email]").fill(cfg["email"]);login.locator("input[name=password]").fill(cfg["pass"]);login.locator("button[type=submit]").click()
            login.wait_for_url("**/ia?view=qa-lab**")
            expect(login.locator("#lab")).to_be_visible()
            expect(login.locator("#product-lab")).to_have_count(0)
            expect(login.locator(".lab-topbar button[data-mode]")).to_have_count(3)
            login.frame_locator("#frame").locator("#r3-veil").wait_for(state="attached")
            state=auth.storage_state();auth.close()
            for name,width,height,preview,mode,panel in SCENES:
                evidence={"scene":name,"viewport":[width,height],"artifactWidth":preview,"mode":mode,"drawer":panel,"screen":"login/empty/email"}
                imgs=[]
                for current in (False,True):
                    key="candidate" if current else "approved"
                    context=browser.new_context(viewport={"width":width,"height":height},device_scale_factor=1,
                      has_touch=width<=680,locale="ko-KR",timezone_id="Asia/Seoul",reduced_motion="reduce",storage_state=state if current else None)
                    if not current:
                        # Serve only the verified document via a dedicated loopback origin.
                        context.route("**/*", lambda route:route.fulfill(content_type="text/html;charset=utf-8",body=raw) if route.request.url==REFERENCE_URL else route.abort())
                    page=context.new_page();page.set_default_timeout(12000)
                    url=(cfg["url"]+f"/ia?view=qa-lab&screen=login%2Fempty%2Femail&width={preview}") if current else REFERENCE_URL+f"#login/empty/email/{preview}"
                    try:
                        configure(page,url,current,preview,mode,panel)
                        evidence[key]=page.evaluate(MEASURE)
                        evidence[key]["koreanFonts"]=korean_font_for_mode_button(page)
                        if name=="desktop390":evidence[key]["wheelScrollPx"]=check_stage_wheel(page)
                        if current:
                            info=page.evaluate("""async w=>{const u='/api/ia/r3-qa/artifact?id=login%2Fempty%2Femail&version=current&width='+w; const j=await (await fetch(u)).json();return {release:j.release,artifact:j.hash}}""",preview)
                            evidence["identity"]=info
                    except Exception as exc:
                        results["errors"].append(f"{name}/{key}: {exc}");evidence[key]={}
                    imgs.append(page.screenshot(path=OUT/f"{name}-{key}.png",animations="disabled"))
                    context.close()
                make_pair(browser,*imgs,OUT/f"{name}-pair.png",width,height)
                if evidence["candidate"] and evidence["approved"]:
                    errors=compare(name,evidence["approved"],evidence["candidate"],panel not in (None,"navigation"),mode)
                    results["errors"].extend(errors)
                results["pairs"].append(evidence)
                write_json(OUT/"geometry.json",results)
            try:
                results["controls"]=verify_review_controls(browser,state,cfg["url"])
            except Exception as exc:
                results["errors"].append(f"review controls: {exc}")
            write_json(OUT/"geometry.json",results)
            browser.close()
    finally:server.terminate();server.wait(timeout=5)
    print(json.dumps({"cases":len(results["pairs"]),"sourceSHA256":SOURCE_SHA,"errors":results["errors"]},ensure_ascii=False))
    assert not results["errors"],"Approved shell geometry or behavior differs; inspect paired screenshots and geometry.json"


if __name__=="__main__":main()
