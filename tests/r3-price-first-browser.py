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

def paste(target, rows):
    target.focus()
    target.evaluate("""(el, text) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:dt, bubbles:true, cancelable:true}));
    }""", "\n".join("\t".join(row) for row in rows))

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
        paste(cell(page, 0, 2), prices)
        check_reference_ui(page)
        # Review mapping before applying the 10-column spreadsheet (two bounds + eight prices).
        cell(page, 0, 2).fill("7,777원")
        page.once("dialog", lambda dialog: dialog.dismiss())
        paste(cell(page, 0, 0), [columns, *reference])
        assert matrix_values(page)[0][2] == "7777"
        page.once("dialog", lambda dialog: dialog.accept())
        paste(cell(page, 0, 0), [columns, *reference])
        check_reference_ui(page)
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
        applicant.locator("#requestCompany").fill("등록 시험 공급처")
        applicant.locator("#requestConnection").click()
        expect(applicant.locator("#connectionStatus")).to_contain_text("연결 대기")
        applicant.reload()
        expect(applicant.locator("#connectionStatus")).to_contain_text("연결 대기")
        expect(applicant.locator("#pricing-editor")).to_be_hidden()
        assert applicant.request.get(origin + "/api/ia/r3-price/version", params={"id":version}).status in (403,404)
        applicant.context.close()
        assert not any("/practice/" in url or "practice=1" in url for url in requests)
        page.context.close()
        return {"subject":subject, "width":width, "route":"/ia?view=pricing-r3",
                "before":{"catalogScopes":0,"priceVersions":0},
                "savedReferenceMoneyCells":152,"savedState":"DRAFT",
                "freshContextReopenedRevision":1,"distinctStatesAfterReload":values[0][2:6],
                "otherSupplierRead":"denied","unassignedConnection":"pending without access","sourceDate":"2026-11-09"}
    finally:
        host.terminate()
        host.wait(timeout=7)

if __name__ == "__main__":
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.getenv("R3_BROWSER_BINARY") or shutil.which("chromium") or shutil.which("google-chrome"))
        records = [check(browser, who, width) for who,width in (("operator",1440),("supplier",390))]
        browser.close()
    (EVIDENCE/"receipts.json").write_text(json.dumps({"environment":"isolated signed identities and SQLite, no commercial account or production writes","runs":records},ensure_ascii=False,indent=2))
    print("PASS: both fixture business identities registered their first product on the normal route; 152 reference amounts each persisted after refresh and fresh sign-in context.")
