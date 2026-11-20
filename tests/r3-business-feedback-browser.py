"""Exercise the compiled business forms, proof meter and signature controls in a sandboxed frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright

from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position

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

    # Use trusted browser wheel input, then wait for native scrolling and the
    # selected row to settle. Do not substitute scrollTop or synthetic events.
    year.evaluate("""el=>{
        el.__openingNative={wheel:0,scroll:0,end:0};
        for(const [event,key] of [['wheel','wheel'],['scroll','scroll'],['scrollend','end']])
            el.addEventListener(event,e=>{if(e.isTrusted)el.__openingNative[key]++;},{passive:true});
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
            const now=[el.scrollTop,selected?.id,r?.top].join('|');
            stable=now===last?stable+1:0;last=now;
            const offset=r?Math.abs(r.top+r.height/2-c.top-c.height/2):Infinity;
            if(stable>=4&&offset<=1.1&&el.__openingNative.end>0)
                return {...el.__openingNative,value:Number(selected.dataset.openingValue),offset};
        }
        throw Error('Native opening-date wheel did not settle on one centered option');
    }""")
    assert native["wheel"] > 0 and native["scroll"] > 0, native
    assert 1900 <= native["value"] < 2026, native
    expect(value).to_have_text("2026/11/20")

    # Keyboard selection must use the same draft and dependent month/day range.
    year.press("End"); year.press("ArrowUp"); year.press("ArrowUp")
    month.press("Home"); month.press("ArrowDown"); day.press("End")
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
    year.press("End"); month.press("End"); day.press("End"); day.press("ArrowDown")
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
    before = next_input.evaluate("e=>e.getBoundingClientRect().top + scrollY")
    field.fill("ㅇㅅ")
    option = frame.get_by_role("option", name="음식점업", exact=True)
    expect(option).to_be_visible()
    after = next_input.evaluate("e=>e.getBoundingClientRect().top + scrollY")
    assert abs(before - after) < 1
    field.press("ArrowDown"); field.press("Enter")
    expect(field).to_have_value("음식점업")
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
    assert frame.locator("[type=file]").evaluate("el=>el.multiple")
    memo = frame.locator("[name=document-memo]")
    memo.fill("가 A 1 ! 👨‍👩‍👧")
    expect(frame.locator("progress")).to_have_js_property("value",5)
    expect(frame.locator(".memo-meter output")).to_have_text("495자 남음")
    memo.fill("가"*499 + " 👩‍🍳" + "과")
    expect(frame.locator("progress")).to_have_js_property("value",500)
    expect(memo).to_have_value("가"*499 + " 👩‍🍳")
    for state, label in [("blocked","이 파일은 차단됐어요."),("error","파일을 올리지 못했어요.")]:
        frame = screen("proof",state)
        expect(frame.get_by_role("alert")).to_contain_text(label)
        expect(frame.get_by_role("alert")).to_contain_text("다시")

    frame = screen("signature","empty")
    expect(frame.get_by_role("heading",name="서명이 필요해요")).to_be_visible()
    expect(frame.get_by_role("button",name="다시 하기")).to_be_visible()
    thumbnails = frame.locator(".document-thumb")
    expect(thumbnails).to_have_count(2)
    frame_click(page, thumbnails.first)
    dialog = frame.get_by_role("dialog",name="제출 자료 미리보기")
    expect(dialog).to_be_visible()
    display = dialog.locator("output")
    expect(display).to_contain_text("1 / 2")
    frame_click(page, dialog.get_by_role("button",name="다음"))
    expect(display).to_contain_text("2 / 2")
    frame_click(page, dialog.get_by_role("button",name="확대",exact=True))
    expect(dialog.locator(".document-viewport")).to_have_class("document-viewport is-zoomed")
    frame_click(page, dialog.get_by_role("button",name="추가 가림"))
    frame_click(page, dialog.get_by_role("button",name="가운데 행 가리기"))
    frame_click(page, dialog.get_by_role("button",name="가림 저장"))
    marker = dialog.locator("canvas").evaluate("c=>Array.from(c.getContext('2d').getImageData(c.width*.2,c.height*.45,1,1).data)")
    assert marker == [0,0,0,255], marker
    dialog.get_by_role("button",name="닫기").press("Escape")
    expect(dialog).to_be_hidden()
    frame_click(page, frame.get_by_role("button",name="제출하기"))
    expect(frame.locator(".signature-error")).to_contain_text("서명이 필요해요.")
    expect(frame.locator(".signature-canvas")).to_be_focused()
    expect(frame.locator(".signature-canvas")).to_have_attribute("aria-invalid","true")
    frame = screen("signature", "processing")
    expect(frame.get_by_role("button",name="제출 중")).to_be_disabled()
    expect(frame.locator("[data-action=submit-signature] .spinner")).to_be_visible()
    frame = screen("signature","done")
    expect(frame.locator("h1")).to_have_count(0)
    expect(frame.get_by_role("status").filter(has_text="검토를 요청했어요")).to_be_visible()
    expect(frame.get_by_role("button",name="내 증빙 가리기·제출")).to_be_visible()
    print(json.dumps({"width":width,"business_dropdown_layout_shift_px":after-before,
                      "proof_limit":500,"signed_gallery_mask_pixel":marker}))


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
                page.goto(fixture["url"]+"/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail")
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
