"""Request-driven motion in the normal price/freight desk with a signed loopback account."""
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/motion-live/price'
OUT.mkdir(exist_ok=True, parents=True)


def check(browser, width, reduced):
    host = subprocess.Popen(['node', 'tests/r3-business-browser-host.mjs', '--first-price'],
                            cwd=ROOT, stdout=subprocess.PIPE, text=True)
    context = browser.new_context(viewport={'width': width, 'height': 850},
                                  reduced_motion='reduce' if reduced else 'no-preference',
                                  extra_http_headers={'x-test-subject': 'supplier'})
    page = context.new_page()
    page.set_default_timeout(9000)
    page.add_init_script("""window.motionReceipt=[]; document.addEventListener('r3:async-state',e=>{
      window.motionReceipt.push({phase:e.detail.phase,source:e.detail.source,id:e.detail.requestId,element:e.target.id||e.target.dataset.action});
    });""")
    def capture(name, target):
        target.scroll_into_view_if_needed()
        page.screenshot(path=OUT / f'{width}-{name}.png')
    try:
        origin = host.stdout.readline().strip()
        assert urlparse(origin).hostname == '127.0.0.1'
        reads, writes = [], []
        def route_desk(route):
            reads.append(route)
        page.route('**/api/ia/r3-price/desk', route_desk)
        page.goto(origin + '/ia?view=pricing-r3', wait_until='domcontentloaded')
        shell = page.locator('#price-workspace')
        expect(shell).to_have_attribute('data-async-region', 'pending')
        for _ in range(120):
            if reads:
                break
            page.wait_for_timeout(25)
        assert len(reads)==1
        capture('loading', shell)
        reads.pop().fulfill(status=503,content_type='application/json',body='{"error":"SERVICE_UNAVAILABLE"}')
        expect(shell).to_have_attribute('aria-busy','false')
        assert page.evaluate("motionReceipt.some(x=>x.element==='price-workspace'&&x.phase==='error')")
        capture('list-error',shell)
        page.unroute('**/api/ia/r3-price/desk',route_desk)
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#setupOrg')).to_be_visible()
        page.locator('#setupSupplier').fill('검수 공급처')
        page.locator('#setupOrigin').fill('검수 출고장')
        page.locator('#setupProduct').fill('검수용 가격표')
        page.locator('#setupShell').select_option('4')
        page.locator('#setupPack').fill('30')
        page.locator('#registerProduct').click()
        grid=page.locator('#matrix')
        expect(grid).to_be_visible()
        expect(page.locator('#notice')).to_contain_text('새 가격표')
        cell=grid.locator('input[data-r="0"][data-c="2"]')
        cell.fill('1250');cell.press('Tab')
        page.evaluate("window.initialCell=document.querySelector('#matrix input[data-r=\"0\"][data-c=\"2\"]')")
        save=page.locator('[data-action=save]')
        def hold_version(route):
            if route.request.method=='POST':
                writes.append(route)
            else:
                route.continue_()
        page.route('**/api/ia/r3-price/version',hold_version)
        def pending(screen):
            save.click()
            expect(save).to_have_attribute('data-async-phase','pending')
            assert save.get_attribute('data-async-source')=='server'
            page.wait_for_function("document.querySelector('[data-action=save]').disabled")
            save.evaluate('e=>e.click()')
            page.wait_for_timeout(80)
            assert len(writes)==1
            if reduced:
                assert save.locator('.r3-motion-glyph').evaluate("e=>getComputedStyle(e).animationName")=='none'
            capture(screen+'-pending',save)
            return writes.pop()
        wr=pending('price')
        key=wr.request.post_data_json['requestKey']
        with page.expect_response(lambda r: r.request.method=='POST' and r.url.endswith('/version')) as saved:
            wr.continue_()
        assert saved.value.status==200
        expect(page.locator('#current')).to_contain_text('r1')
        assert page.evaluate("initialCell===document.querySelector('#matrix input[data-r=\"0\"][data-c=\"2\"]')")
        assert page.evaluate("motionReceipt.some(x=>x.element==='save'&&x.phase==='success')")
        capture('price-saved',save)
        page.locator('#shippingTab').click()
        expect(page.locator('#shipping')).to_be_visible()
        page.locator('#shipping details').filter(has=page.locator('#groupBasis')).locator(':scope > summary').click()
        policy=page.locator('#groupBasis')
        policy.select_option('SITE')
        wr=pending('freight')
        failed=wr.request.post_data_json['requestKey']
        wr.fulfill(status=503,content_type='application/json',body='{"error":"SERVICE_UNAVAILABLE"}')
        expect(save).to_have_attribute('data-async-phase','error')
        expect(policy).to_have_value('SITE')
        capture('freight-error',save)
        wr=pending('retry')
        assert wr.request.post_data_json['requestKey']==failed
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/version')) as saved:
            wr.continue_()
        assert saved.value.status==200
        expect(page.locator('#current')).to_contain_text('r2')
        expect(policy).to_have_value('SITE')
        capture('freight-saved',save)
        events=page.evaluate("motionReceipt")
        assert [x['phase'] for x in events if x['element']=='save' and x['id']==key]==['pending','success']
        assert [x['phase'] for x in events if x['element']=='save' and x['id']==failed]==['pending','error','pending','success']
        page.reload();expect(page.locator('#current')).to_contain_text('r2');expect(policy).to_have_value('SITE')
        return {'width':width,'reduced':reduced,'retainedFirstCell':True,'freshServerRevision':2,
                'source':'signed loopback account and SQLite with HTTP failure injection','phases':events}
    finally:
        context.close();host.terminate();host.wait(timeout=7)


if __name__=='__main__':
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium'))
        try:
            results=[check(browser,390,False),check(browser,1440,True)]
        finally:
            browser.close()
    (OUT / 'receipts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
