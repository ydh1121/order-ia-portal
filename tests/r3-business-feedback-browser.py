"""Exercise the compiled business forms, proof meter and signature controls in a sandboxed frame."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def check(page, origin, width):
    def screen(module, state):
        query = urlencode({"view": "qa-lab", "screen": f"{module}/{state}/email", "width": width})
        page.goto(origin + "/ia?" + query)
        frame = page.frame_locator("#frame")
        frame.locator("#r3-veil").wait_for(state="attached")
        return frame

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
    option = frame.get_by_role("option", name="음식점업")
    expect(option).to_be_visible()
    after = next_input.evaluate("e=>e.getBoundingClientRect().top + scrollY")
    assert abs(before - after) < 1
    field.press("ArrowDown"); field.press("Enter")
    expect(field).to_have_value("음식점업")
    expect(frame.locator("[name=owner-name]")).to_have_attribute("placeholder", "대표자명")
    expect(frame.locator(".opening-date output")).to_have_text(
        page.evaluate("()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','/')"))
    assert not frame.locator("[type=file]").evaluate("el=>el.multiple")
    frame = screen("business", "checking")
    expect(frame.get_by_role("button",name="사업자 정보 조회 중")).to_be_disabled()
    expect(frame.locator("[name=business-number]")).to_be_disabled()
    frame = screen("business", "verified")
    expect(frame.locator("[name=owner-name]")).to_be_disabled()
    expect(frame.locator(".verification-mark")).to_be_visible()

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
    thumbnails.first.click()
    dialog = frame.get_by_role("dialog",name="제출 자료 미리보기")
    expect(dialog).to_be_visible()
    display = dialog.locator("output")
    expect(display).to_contain_text("1 / 2")
    dialog.get_by_role("button",name="다음").click()
    expect(display).to_contain_text("2 / 2")
    dialog.get_by_role("button",name="확대",exact=True).click()
    expect(dialog.locator(".document-viewport")).to_have_class("document-viewport is-zoomed")
    dialog.get_by_role("button",name="추가 가림").click()
    dialog.get_by_role("button",name="가운데 행 가리기").click()
    dialog.get_by_role("button",name="가림 저장").click()
    marker = dialog.locator("canvas").evaluate("c=>Array.from(c.getContext('2d').getImageData(c.width*.2,c.height*.45,1,1).data)")
    assert marker == [0,0,0,255], marker
    dialog.get_by_role("button",name="닫기").press("Escape")
    expect(dialog).to_be_hidden()
    frame.get_by_role("button",name="제출하기").click()
    expect(frame.locator(".signature-error")).to_contain_text("서명이 필요해요.")
    frame = screen("signature", "processing")
    expect(frame.get_by_role("button",name="제출 중")).to_be_disabled()
    expect(frame.locator("[data-action=submit-signature] .spinner")).to_be_visible()
    frame = screen("signature","done")
    expect(frame.locator("h1")).to_have_count(0)
    expect(frame.get_by_role("status")).to_contain_text("검토를 요청했어요")
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
                page.goto(fixture["url"]+"/ia?view=qa-lab")
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
