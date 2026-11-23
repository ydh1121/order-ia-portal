"""Exercise the compiled business forms, proof meter and signature controls in a sandboxed frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright

from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position
from r3_workflow_browser_support import check_signature_flow

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "business-date"


def check_opening_date(page, frame, width):
    control = frame.locator(".opening-date>button")
    value = frame.locator(".opening-date output")
    panel = frame.locator(".opening-wheels")
    sheet = panel.get_by_role("dialog", name="개업일 선택")
    year = sheet.get_by_role("listbox", name="연도", exact=True)
    month = sheet.get_by_role("listbox", name="월", exact=True)
    day = sheet.get_by_role("listbox", name="일", exact=True)
    expect(value).to_have_text("2026/11/20")
    frame_click(page, control)
    expect(sheet).to_be_visible()
    sheet.element_handle().wait_for_element_state("stable")
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2026/11/20]")
    expect(year).to_be_focused()
    expect(frame.locator(".business-page")).to_have_js_property("inert", True)
    expect(panel.locator("select")).to_have_count(0)
    panel_id = panel.get_attribute("id")
    expect(control).to_have_attribute("aria-controls", panel_id)
    geometry = sheet.evaluate("""el=>{
        const r=el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
            viewportWidth:innerWidth,viewportHeight:innerHeight,
            clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
            popover:el.parentElement.matches(':popover-open')};
    }""")
    assert geometry["popover"], geometry
    assert abs(geometry["bottom"] - geometry["viewportHeight"]) <= 1.1, geometry
    assert geometry["top"] >= -1 and geometry["left"] >= -1, geometry
    assert geometry["right"] <= geometry["viewportWidth"] + 1, geometry
    assert abs(geometry["width"] - min(540, geometry["viewportWidth"])) <= 1.1, geometry
    assert abs(geometry["left"] * 2 + geometry["width"] - geometry["viewportWidth"]) <= 1.1, geometry
    assert geometry["scrollWidth"] <= geometry["clientWidth"] + 1, geometry

    # Use trusted wheel input against the common 3D drum. Observe a centered
    # settled option and real rotation; do not substitute scrollTop.
    year.evaluate("""el=>{
        el.__openingNative={wheel:0,settled:0};
        el.addEventListener('wheel',e=>{if(e.isTrusted)el.__openingNative.wheel++;},{passive:true});
        el.addEventListener('r3:wheel-settled',()=>el.__openingNative.settled++);
    }""")
    x, y = frame_pointer_position(page, year)
    page.mouse.move(x, y)
    page.mouse.wheel(0, -132)
    expect(year.locator('[aria-selected="true"]')).not_to_have_text("2026년")
    native = year.evaluate("""async el=>{
        const deadline=performance.now()+5000;let last=null,stable=0;
        while(performance.now()<deadline){
            await new Promise(requestAnimationFrame);
            const selected=el.querySelector('[aria-selected=true]'),c=el.getBoundingClientRect(),r=selected?.getBoundingClientRect();
            const now=[el.dataset.wheelPosition,selected?.id,r?.top].join('|');
            stable=now===last?stable+1:0;last=now;
            const offset=r?Math.abs(r.top+r.height/2-c.top-c.height/2):Infinity;
            if(stable>=4&&offset<=1.1&&el.__openingNative.settled>0)
                return {...el.__openingNative,value:Number(selected.dataset.openingValue),offset,transform:selected.style.transform,position:Number(el.dataset.wheelPosition)};
        }
        throw Error('Opening-date drum did not settle on one centered option');
    }""")
    assert native["wheel"] > 0 and native["settled"] > 0, native
    assert "rotateX(" in native["transform"] and "translateZ(" in native["transform"], native
    assert abs(native["position"] - round(native["position"])) < .001, native
    assert 1900 <= native["value"] < 2026, native
    expect(value).to_have_text("2026/11/20")

    # Keyboard selection must use the same draft and dependent month/day range.
    year.press("End"); year.press("ArrowUp"); year.press("ArrowUp")
    expect(sheet.get_by_role("heading")).to_contain_text("2024/")
    month.press("Home"); month.press("ArrowDown")
    expect(sheet.get_by_role("heading")).to_contain_text("2024/02/")
    day.press("End")
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2024/02/29]")
    expect(day.locator('[aria-selected="true"]')).to_have_text("29일")
    expect(day.locator('[data-opening-value="30"]')).to_have_count(0)
    expect(value).to_have_text("2026/11/20")
    done = sheet.get_by_role("button", name="완료", exact=True)
    done.press("Tab")
    expect(sheet.get_by_role("button", name="개업일 선택 닫기", exact=True)).to_be_focused()
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"opening-date-{width}.png"))
    frame_click(page, done)
    expect(panel).to_be_hidden()
    expect(value).to_have_text("2024/02/29")
    expect(control).to_be_focused()
    expect(frame.locator(".business-page")).to_have_js_property("inert", False)

    frame_click(page, control)
    expect(panel).to_have_attribute("id", panel_id)
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2024/02/29]")
    year.press("ArrowDown")
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2025/02/28]")
    expect(day.locator('[data-opening-value="29"]')).to_have_count(0)
    frame_click(page, sheet.get_by_role("button", name="취소", exact=True))
    expect(value).to_have_text("2024/02/29")
    frame_click(page, control)
    expect(panel).to_have_attribute("id", panel_id)
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2024/02/29]")
    year.press("End")
    expect(sheet.get_by_role("heading")).to_contain_text("2026/")
    month.press("End")
    expect(sheet.get_by_role("heading")).to_contain_text("2026/11/")
    day.press("End"); day.press("ArrowDown")
    expect(sheet.get_by_role("heading")).to_have_text("개업일 [2026/11/20]")
    expect(month.locator('[data-opening-value="12"]')).to_have_count(0)
    expect(day.locator('[data-opening-value="21"]')).to_have_count(0)
    day.press("Escape")
    expect(panel).to_be_hidden()
    expect(value).to_have_text("2024/02/29")
    expect(control).to_be_focused()
    receipt = {"width":width,"panelId":panel_id,"geometry":geometry,"nativeWheel":native,
               "committed":"2024/02/29","cancelRestored":True,"keyboardLeapAndTodayLimits":True}
    (OUT / f"opening-date-{width}.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding="utf-8")
    print("PASS opening-date " + json.dumps(receipt,ensure_ascii=False),flush=True)


def check(page, origin, width):
    screen = ReviewScreens(page, origin, width).screen
    # It is already November 20 in Korea at this UTC instant. Only Date is fixed;
    # timers, animation frames and native scroll settling still run normally.
    page.clock.set_fixed_time("2026-11-19T15:30:00Z")

    frame = screen("business", "empty")
    expect(frame.get_by_role("heading", name="사업자 정보 등록", exact=True)).to_be_visible()
    field = frame.locator('[name="business-sector"]')
    next_input = frame.locator('[name="business-type"]')
    diagnostics = next_input.evaluate("""el=>({
        role:el.getAttribute('role'),
        label:el.ownerDocument.getElementById(el.getAttribute('aria-labelledby'))?.textContent,
        names:window.ORDER_DESIGN_MODULES?.map(x=>x.id),
        initialized:!!el.closest('.business-combobox'),
        date:el.ownerDocument.querySelector('.opening-date output')?.textContent
    })""")
    assert diagnostics["role"] == "combobox", diagnostics
    expect(next_input).to_have_accessible_name("업종 필수")
    field.focus()
    expect(frame.locator('[data-business-classification]')).to_have_text(
        "국세청 2026.04 공개 목록 · 사업자등록증과 동일하게 입력해 주세요.")
    catalogue = field.evaluate("""el=>{
        const data=el.ownerDocument.defaultView.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses;
        return {rows:data.rows.length,sectors:data.sectors.length};
    }""")
    assert catalogue == {"rows":1542,"sectors":20}, catalogue
    before = next_input.evaluate("e=>e.getBoundingClientRect().top + scrollY")
    field.fill("ㅅㅂ")
    option = frame.get_by_role("option", name="숙박 및 음식점업", exact=True)
    expect(option).to_be_visible()
    after = next_input.evaluate("e=>e.getBoundingClientRect().top + scrollY")
    assert abs(before - after) < 1
    # The complete official list has several matches for this short consonant
    # query. Keep that search check, then select one unambiguous keyboard result.
    field.fill("숙박 및 음식")
    expect(frame.get_by_role("option")).to_have_count(1)
    expect(option).to_be_visible()
    field.press("ArrowDown"); field.press("Enter")
    expect(field).to_have_value("숙박 및 음식점업")
    field.fill("정보통신")
    expect(frame.get_by_role("option",name="정보통신업",exact=True)).to_be_visible()
    next_input.fill("ㅍㅂㅁㅇ")
    expect(frame.get_by_role("option",name="피부 미용업",exact=True)).to_be_visible()
    next_input.fill("직접 입력한 업종")
    next_input.press("Tab")
    expect(next_input).to_have_value("직접 입력한 업종")
    expect(frame.locator("[name=owner-name]")).to_have_attribute("placeholder", "대표자명")
    expect(frame.locator(".opening-date output")).to_have_text(
        page.evaluate("()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','/')"))
    check_opening_date(page, frame, width)
    expect(next_input).to_have_value("직접 입력한 업종")
    assert not frame.locator("[type=file]").evaluate("el=>el.multiple")
    frame = screen("business", "checking")
    expect(frame.get_by_role("button",name="사업자 정보 조회 중")).to_be_disabled()
    expect(frame.locator("[name=business-number]")).to_be_disabled()
    expect(frame.locator(".opening-date>button")).to_be_disabled()
    expect(frame.locator(".opening-wheels")).to_be_hidden()
    frame = screen("business", "verified")
    expect(frame.locator("[name=owner-name]")).to_be_disabled()
    expect(frame.locator(".opening-date>button")).to_be_disabled()
    expect(frame.locator(".opening-wheels")).to_be_hidden()
    expect(frame.locator(".verification-mark")).to_be_visible()
    expect(frame.get_by_role("button",name="내 사업장 인증·보완")).to_be_visible()

    frame = screen("proof", "empty")
    expect(frame.get_by_role("heading",name="거래내역 증빙",exact=True)).to_be_visible()
    expect(frame.get_by_text("거래내역 증빙 시 주의사항",exact=True)).to_be_visible()
    expect(frame.get_by_text("최근 3개월 내 자료",exact=False)).to_be_visible()
    memo = frame.locator("[name=document-memo]")
    memo.fill("가 A 1 ! 👨‍👩‍👧")
    expect(frame.locator("progress")).to_have_js_property("value",5)
    expect(frame.locator(".memo-meter output")).to_have_text("495자 남음")
    memo.fill("가"*499 + " 👩‍🍳" + "과")
    expect(frame.locator("progress")).to_have_js_property("value",500)
    expect(memo).to_have_value("가"*499 + " 👩‍🍳")
    frame_click(page, frame.get_by_role("button",name="자료와 서명 준비",exact=True))
    file = frame.locator("[type=file]")
    expect(file).to_be_visible()
    assert file.evaluate("el=>el.multiple")
    file.set_input_files({"name":"invalid-content.png","mimeType":"image/png","buffer":b"not an image"})
    expect(frame.locator(".wf-status")).to_contain_text("파일을 열 수 없습니다.")
    expect(frame.locator(".wf-status")).to_contain_text("파일 형식과 크기")
    expect(frame.locator("canvas[aria-label='1쪽 가림 영역 선택']")).to_have_count(0)
    expect(memo).to_have_value("가"*499 + " 👩‍🍳")

    frame = screen("signature","empty")
    signed = check_signature_flow(page, frame)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"signature-{width}.json").write_text(json.dumps(signed,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"width":width,"business_dropdown_layout_shift_px":after-before,
                      "proof_limit":500,"signed_packet_pages":signed["packets"][-1]["pages"],
                      "signature_retry_preserved":True}))


def main():
    host = subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,
                            stdout=subprocess.PIPE,text=True)
    try:
        fixture = json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            for width in (320,390,1440):
                ctx = browser.new_context(viewport={"width":width,"height":860},has_touch=width<600,
                                          is_mobile=width<600,reduced_motion="reduce")
                page = ctx.new_page(); errors = []; page.on("pageerror",lambda error:(errors.append(str(error)),print(str(error),flush=True)))
                page.goto(fixture["url"]+"/ia?view=qa-lab&screen=login%2Fempty%2Femail")
                page.locator("input[name=email]").fill(fixture["email"])
                page.locator("input[name=password]").fill(fixture["pass"])
                page.locator("button[type=submit]").click()
                page.wait_for_url("**/ia?view=qa-lab**")
                check(page,fixture["url"],width)
                assert not errors, errors
                ctx.close()
            browser.close()
    finally:
        host.terminate(); host.wait(timeout=5)

if __name__=="__main__":
    main()
