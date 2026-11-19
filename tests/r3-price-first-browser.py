"""First price-table entry on the normal business route with isolated signed identities."""
import csv
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "artifacts/price-matrix/registration"
REFERENCE = ROOT / "tests/fixtures/egg-price-reference-20261109.tsv"
with REFERENCE.open() as file:
    reader = csv.reader(file, delimiter="\t")
    columns = next(reader)
    reference = list(reader)

def cell(page, row, col):
    return page.locator(f'#matrix input[data-r="{row}"][data-c="{col}"]')

def open_personal_settings(page):
    page.locator('#personalSettingsOpen').click()
    expect(page.locator('#personalSettings')).to_be_visible()

def close_personal_settings(page):
    page.locator('#personalSettings [data-price-close]').click()
    expect(page.locator('#personalSettings')).not_to_be_visible()

def set_matrix_bounds(page, editing):
    tools = page.locator('#matrix details[data-mx=tools]')
    if not tools.evaluate('el => el.open'):
        tools.locator(':scope > summary').click()
    toggle = tools.locator('[data-mx=bounds]')
    if toggle.get_attribute('aria-pressed') != str(editing).lower():
        toggle.click()
    if tools.evaluate('el => el.open'):
        tools.locator(':scope > summary').click()

def paste(target, rows):
    target.focus()
    target.evaluate("""(el, text) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:dt, bubbles:true, cancelable:true}));
    }""", "\n".join("\t".join(row) for row in rows))

def paste_native(page, target, rows):
    # Use the browser clipboard and an actual Ctrl+V so the replaced origin cell loses focus natively.
    origin=urlparse(page.url)
    page.context.grant_permissions(['clipboard-read','clipboard-write'],origin=origin.scheme+'://'+origin.netloc)
    page.bring_to_front()
    text="\n".join("\t".join(row) for row in rows)
    target.focus()
    page.evaluate("text=>navigator.clipboard.writeText(text)",text)
    target.press('Control+v')
    expect(target).to_have_value(f"{int(rows[0][0].replace(',','').replace('원','')):,}")

def matrix_values(page):
    return page.locator("#matrix tbody tr").evaluate_all("""rows => rows.map(
        row => Array.from(row.querySelectorAll('input[data-c]'), input => input.value.replaceAll(',','').replace(/원$/, ''))
    )""")

def check_reference_ui(page):
    expect(page.locator("#matrix tbody tr")).to_have_count(19)
    assert matrix_values(page) == reference
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")

def shoot(page, label, width):
    page.screenshot(path=EVIDENCE / f"{width}-{label}.png", animations="disabled")

def new_page(browser, subject, width):
    context = browser.new_context(
        viewport={"width": width, "height": 850}, reduced_motion="reduce",
        extra_http_headers={"x-test-subject": subject},
    )
    page = context.new_page()
    page.set_default_timeout(7000)
    return page

def save(page, rev):
    with page.expect_response(lambda r: r.url.endswith('/api/ia/r3-price/version') and r.request.method == 'POST') as received:
        page.locator('[data-action=save]').click()
    assert received.value.ok, received.value.text()
    expect(page.locator("#current")).to_contain_text(f"r{rev}")

def save_personal(page, status):
    with page.expect_response(lambda r: r.url.endswith('/api/ia/r3-price/personal-draft') and r.request.method=='POST') as received:
        page.locator('#savePersonalDraft').click()
    assert received.value.status==status,received.value.text()
    return received.value.json()

def exercise_personal(page, reopen, origin, label, width):
    # Neither the owner login nor the signed unassigned account gets a contract price scope.
    route='/api/ia/r3-price/personal-draft'
    entry=origin+'/ia?view=pricing-r3'
    grid=page.locator('#matrix')
    open_personal_settings(page)
    expect(page.locator('#personalProduct')).to_be_visible()
    original_viewport = page.viewport_size
    minimum = page.locator('#personalMinimum')
    expect(minimum).to_have_value('10')
    for field_width in (390, 1363):
        page.set_viewport_size({'width': field_width, 'height': original_viewport['height']})
        geometry = minimum.evaluate('''input => {
            const label = input.closest('label');
            const caption = label.querySelector('.r3-floating-title').getBoundingClientRect();
            const field = label.getBoundingClientRect();
            return {captionBottom: caption.bottom, valueTop: input.getBoundingClientRect().top,
                    captionRight: caption.right, fieldRight: field.right, hitHeight: field.height};
        }''')
        assert geometry['captionBottom'] < geometry['valueTop'], (field_width, geometry)
        assert geometry['captionRight'] <= geometry['fieldRight'] and geometry['hitHeight'] >= 44
    page.set_viewport_size(original_viewport)
    expect(grid.locator('tbody tr')).to_have_count(19)
    assert all(row[2:]==['']*8 for row in matrix_values(page))
    page.locator('#personalSupplier').fill('입력 검토 공급처')
    page.locator('#personalOrigin').fill('입력 검토 출고장')
    page.locator('#personalProduct').fill('개인 초안 계란')
    # A pack specification was not supplied in the historical reference.
    assert page.locator('#personalPack').input_value()==''
    close_personal_settings(page)
    paste_native(page,cell(page,0,2),[row[2:] for row in reference])
    check_reference_ui(page)
    first=save_personal(page,200)
    assert first['revision']==1
    page.reload()
    expect(cell(page,0,2)).to_have_value('5,980')
    check_reference_ui(page)
    shoot(page,'personal-'+label+'-reopened',width)
    second=page.context.new_page()
    second.goto(entry)
    expect(cell(second,0,2)).to_have_value('5,980')
    cell(second,0,2).fill('6,002원')
    cell(page,0,2).fill('6,001원')
    assert save_personal(page,200)['revision']==2
    save_personal(second,409)
    expect(second.locator('#personalConflict')).to_be_visible()
    assert matrix_values(second)[0][2]=='6002'
    # Preserve the second editor's explicit choice, then save it as a fresh revision.
    second.locator('#keepPersonalLocal').click()
    assert save_personal(second,200)['revision']==3
    second.close()
    page.context.close()
    renewed=reopen()
    open_personal_settings(renewed)
    expect(renewed.locator('#personalProduct')).to_have_value('개인 초안 계란')
    close_personal_settings(renewed)
    expect(cell(renewed,0,2)).to_have_value('6,002')
    assert matrix_values(renewed)[1:]==reference[1:]
    # Use the signed page's own cookie jar. Chromium allows its secure __Host cookie
    # on loopback while the standalone request client treats this HTTP URL differently.
    def signed_read(path):
        response=renewed.evaluate('''async path=>{
            const response=await fetch(path,{credentials:'same-origin'});
            return {status:response.status,body:await response.json()};
        }''',path)
        assert response['status']==200,(path,response['status'],response['body'].get('error'))
        return response['body']
    desk=signed_read('/api/ia/r3-price/desk')
    assert desk['versions']==[] and desk['scopes']==[]
    stored=signed_read(route)
    assert stored['revision']==3 and stored['draft']['productName']=='개인 초안 계란'
    assert stored['draft']['packSize'] is None
    renewed.context.close()
    return {'subject':label,'viewport':width,'savedMoneyCells':152,'conflictStatus':409,
            'concurrentEdits':['6001','6002'],'finalRestoredValue':'6002','commercialVersions':0}

def independent_owner_check(browser):
    host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        # Credentials exist only inside this loopback owner fixture. Never include them in evidence.
        conf=json.loads(host.stdout.readline())
        origin=conf['url']
        def login():
            context=browser.new_context(viewport={'width':390,'height':850},reduced_motion='reduce')
            p=context.new_page()
            p.goto(origin+'/ia?view=pricing-r3')
            p.locator('input[name=email]').fill(conf['email'])
            p.locator('input[name=password]').fill(conf['pass'])
            p.locator('button[type=submit]').click()
            p.wait_for_url('**/ia?view=pricing-r3')
            return p
        return exercise_personal(login(),login,origin,'portal-owner',390)
    finally:
        host.terminate()
        host.wait(timeout=7)

def check(browser, subject, width):
    host = subprocess.Popen(["node", "tests/r3-business-browser-host.mjs", "--first-price"],
                            cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        origin = host.stdout.readline().strip()
        assert origin.startswith("http://127.0.0.1:")
        entry = origin + "/ia?view=pricing-r3"
        page = new_page(browser, subject, width)
        requests = []
        page.on("request", lambda request: requests.append(request.url))
        page.goto(entry)
        registration = page.locator('#price-registration')
        expect(registration).to_be_visible()
        if not registration.evaluate('el => el.open'):
            registration.locator(':scope > summary').click()
        expect(page.locator("#setupOrg")).to_be_visible()
        before = page.request.get(origin + "/api/ia/r3-price/desk").json()
        assert before["scopes"] == [] and before["versions"] == []
        shoot(page, "empty", width)
        # Only real user-facing names/pack specs; no SQL IDs or precreated catalog.
        page.locator("#setupSupplier").fill("등록 시험 공급처")
        page.locator("#setupOrigin").fill("등록 시험 출고장")
        page.locator("#setupProduct").fill("등록 시험 계란")
        page.locator("#setupShell").select_option("4")
        page.locator("#setupPack").fill("30")
        page.locator("#registerProduct").click()
        grid = page.locator("#matrix")
        expect(grid).to_be_visible()
        expect(grid.locator("thead tr").first.locator("[data-grade-col]")).to_have_count(4)
        expect(page.locator("#notice")).to_contain_text("새 가격표에 단가를 입력")
        expect(grid.locator("tbody tr")).to_have_count(19)
        blank = matrix_values(page)
        assert [row[:2] for row in blank] == [row[:2] for row in reference]
        assert all(row[2:] == [""] * 8 for row in blank)
        assert len(reference) == 19 and sum(len(r[2:]) for r in reference) == 152
        assert [e.strip() for e in grid.locator('thead tr').first.locator('[data-grade-col]').all_text_contents()] == ["왕란","특란","대란","중란"]
        # Vary number formatting across the 152 cells to exercise real spreadsheet input.
        prices = []
        for row in reference:
            prices.append([str(value) if i % 3 == 0 else f"{int(value):,}" + ("원" if i % 3 == 2 else "")
                           for i, value in enumerate(row[2:])])
        paste_native(page,cell(page, 0, 2), prices)
        check_reference_ui(page)
        # Review mapping before applying the 10-column spreadsheet (two bounds + eight prices).
        cell(page, 0, 2).fill("7,777원")
        set_matrix_bounds(page, True)
        page.once("dialog", lambda dialog: dialog.dismiss())
        paste(cell(page, 0, 0), [columns, *reference])
        assert matrix_values(page)[0][2] == "7777"
        page.once("dialog", lambda dialog: dialog.accept())
        paste(cell(page, 0, 0), [columns, *reference])
        check_reference_ui(page)
        set_matrix_bounds(page, False)
        grid.scroll_into_view_if_needed()
        shoot(page, "entered", width)
        save(page, 1)
        version = parse_qs(urlparse(page.url).query)["priceVersion"][0]
        snapshot = page.request.get(origin + "/api/ia/r3-price/version", params={"id": version}).json()
        matrix = snapshot["version"]["policy"]["matrix"]
        assert [r["cells"] for r in matrix["rows"]] == [r[2:] for r in reference]
        assert snapshot["version"]["status"] == "DRAFT"
        page.reload()
        expect(page.locator("#current")).to_contain_text("r1")
        check_reference_ui(page)
        page.locator("#shippingTab").click()
        expect(grid).to_be_hidden()
        shoot(page, "shipping-tab", width)
        page.locator("#priceTab").click()
        expect(grid).to_be_visible()
        check_reference_ui(page)
        page.context.close()

        # A new browser context has no address bookmark, local storage, or session cookie.
        page = new_page(browser, subject, width)
        page.goto(entry)
        expect(page.locator("#current")).to_contain_text("r1")
        check_reference_ui(page)
        grid = page.locator("#matrix")
        grid.scroll_into_view_if_needed()
        shoot(page, "reopened", width)
        # The editor scrolls within the sheet. Capture the last open-ended tier as well
        # as its first rows, including each grade in the phone's one-grade layout.
        start=cell(page,18,0)
        expect(start).to_have_value('501')
        grade_names=['왕란','특란','대란','중란']
        for index,name in enumerate(grade_names if width<680 else ['왕란']):
            grid.locator('[data-mx=grade-chips]').get_by_role('button', name=name, exact=True).click()
            last=cell(page,18,3+index*2)
            last.scroll_into_view_if_needed()
            expect(last).to_have_value(f'{int(reference[-1][3+index*2]):,}')
            expect(last).to_be_in_viewport()
            shoot(page,f'reopened-501-grade-{index+1}',width)
        grid.locator('[data-mx=grade-chips]').get_by_role('button', name='왕란', exact=True).click()

        # Persist distinct blank, zero, negotiated, unavailable cells on a second revision.
        paste(cell(page, 0, 2), [["", "0", "협의", "미판매"]])
        save(page, 2)
        page.reload()
        expect(page.locator("#current")).to_contain_text("r2")
        values = matrix_values(page)
        assert values[0][2:6] in (["", "0", "협의", "미판매"], ["", "0", "협의", "판매 안 함"])
        assert values[1:] == reference[1:]
        outside = new_page(browser, "supplier2", width)
        outside.goto(entry)
        assert outside.request.get(origin + "/api/ia/r3-price/version", params={"id": version}).status in (403,404)
        assert not outside.request.get(origin + "/api/ia/r3-price/desk").json()["versions"]
        outside.context.close()
        applicant = new_page(browser, "unassigned", width)
        applicant.goto(entry)
        setup=applicant.locator("#price-registration")
        expect(setup).to_be_visible()
        if not setup.evaluate('el=>el.open'):
            setup.locator(':scope > summary').click()
        applicant.locator("#requestCompany").fill("등록 시험 공급처")
        applicant.locator("#requestConnection").click()
        expect(applicant.locator("#connectionStatus")).to_contain_text("연결 대기")
        applicant.reload()
        expect(applicant.locator("#connectionStatus")).to_contain_text("연결 대기")
        expect(applicant.locator('#savePersonalDraft')).to_be_visible()
        assert applicant.request.get(origin + "/api/ia/r3-price/version", params={"id":version}).status in (403,404)
        personal=None
        if subject=='operator':
            def sign_in_again():
                p=new_page(browser,'unassigned',width)
                p.goto(entry)
                return p
            personal=exercise_personal(applicant,sign_in_again,origin,'unassigned',width)
            verify_other=new_page(browser,'supplier2',width)
            verify_other.goto(entry)
            read=verify_other.request.get(origin+'/api/ia/r3-price/personal-draft')
            assert read.ok and '개인 초안 계란' not in read.text()
            verify_other.context.close()
        else:
            applicant.context.close()
        assert not any("/practice/" in url or "practice=1" in url for url in requests)
        page.context.close()
        return {"subject":subject, "width":width, "route":"/ia?view=pricing-r3",
                "before":{"catalogScopes":0,"priceVersions":0},
                "savedReferenceMoneyCells":152,"savedState":"DRAFT",
                "freshContextReopenedRevision":1,"distinctStatesAfterReload":values[0][2:6],
                "personalDraft":personal,"otherSupplierRead":"denied","unassignedConnection":"pending without access","sourceDate":"2026-11-09"}
    finally:
        host.terminate()
        host.wait(timeout=7)

if __name__ == "__main__":
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.getenv("R3_BROWSER_BINARY") or shutil.which("chromium") or shutil.which("google-chrome"))
        records = [check(browser, who, width) for who,width in (("operator",1440),("supplier",390))]
        owner=independent_owner_check(browser)
        browser.close()
    (EVIDENCE/"receipts.json").write_text(json.dumps({"environment":"isolated signed identities and SQLite, no commercial account or production writes","runs":records,"ownerPersonalDraft":owner},ensure_ascii=False,indent=2))
    print("PASS: both fixture business identities registered their first product on the normal route; 152 reference amounts each persisted after refresh and fresh sign-in context.")
