"""Run account-panel business operations through actual Pages/domain handlers.

The owner session and isolated run come from the existing local test host. All
business state changes use rendered controls and real SQLite-backed handlers.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import traceback
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'artifacts/account-panels'


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    errors, writes = [], []
    receipt = {'status': 'RUNNING', 'environment': 'canonical Pages routes and domain handlers; isolated SQLite lab', 'commercialAcceptance': False}
    host_log = (EVIDENCE / 'host.stderr.log').open('w', encoding='utf-8')
    host = subprocess.Popen(['node', 'tests/product-lab-browser-host.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=host_log, text=True)
    pw = browser = context = None
    pages = []
    try:
        base = host.stdout.readline().strip()
        assert base.startswith('http://127.0.0.1:')
        pw = sync_playwright().start()
        browser = pw.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('google-chrome') or shutil.which('chromium'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        home = context.new_page()
        home.goto(base + '/__lab-test-session')
        home.locator('#live-create').click()
        home.locator('#live-dialog input').fill('같은 계정 패널의 업무 검증')
        home.get_by_role('button', name='생성', exact=True).click()
        expect(home.locator('#live-dialog')).not_to_be_visible()
        home.wait_for_function("()=>!!document.querySelector('#live-run').value")
        run = home.locator('#live-run').input_value()

        def persona(role, width):
            home.bring_to_front()
            home.locator('#live-persona').select_option(role)
            home.wait_for_function("role=>{const frame=document.querySelector('#product-frame'),link=document.querySelector('#live-open');return frame?.src&&frame.src===link?.href&&new URL(link.href).searchParams.get('persona')===role;}", arg=role)
            with context.expect_page() as opened:
                home.locator('#live-open').click()
            page = opened.value
            pages.append(page)
            page.set_default_timeout(15000)
            page.set_viewport_size({'width': width, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: writes.append({'path': response.url.split(base)[-1], 'status': response.status}) if response.request.method == 'POST' and '/api/ia/lab/' in response.url else None)
            page.bring_to_front()
            page.wait_for_load_state('domcontentloaded')
            expect(page.locator('html')).to_have_attribute('data-product-runtime', 'canonical')
            page.wait_for_function("role=>window.ORDER_APP_CONTEXT?.persona===role&&document.querySelector('.obm-brand')?.__orderAccountMenu", arg=role)
            page.evaluate("async()=>{await window.ORDER_APP_ADAPTER.ready;await document.fonts.ready;}")
            runtime = page.evaluate('window.ORDER_APP_CONTEXT')
            assert runtime['mode'] == 'lab' and runtime['runId'] == run and runtime['actor']['authenticated'] is True, runtime
            assert runtime['endpoints']['product'] == f'/api/ia/lab/runs/{run}/as/{role}/product', runtime
            page.evaluate("()=>{window.__accountPanelNodes={svg:document.querySelector('.obm-brand svg'),panel:document.querySelector('.obm-panel'),url:location.href};}")
            return page

        def settled(page, name):
            page.wait_for_function("name=>{const menu=document.querySelector('.obm-brand')?.__orderAccountMenu,panel=document.querySelector('.obm-panel');return menu?.inspect().page===name&&menu?.inspect().phase==='open'&&!panel.dataset.stackMoving;}", arg=name)
            content = page.locator('[data-obm-page="' + name + '"] .obm-panel-content')
            if content.count():
                expect(content).not_to_have_attribute('aria-busy', 'true')
            return content

        def menu(page, name):
            page.bring_to_front()
            if page.locator('.obm-panel').is_visible():
                page.keyboard.press('Escape')
                expect(page.locator('.obm-panel')).to_be_hidden()
            page.locator('.obm-trigger').click()
            settled(page, 'root')
            page.locator('[data-obm-item=manage]').click()
            settled(page, 'manage')
            page.locator('[data-obm-item="' + name + '"]').click()
            return settled(page, name)

        def stable(page):
            assert page.evaluate("()=>location.href===window.__accountPanelNodes.url&&document.querySelector('.obm-brand svg')===window.__accountPanelNodes.svg&&document.querySelector('.obm-panel')===window.__accountPanelNodes.panel")
            assert page.locator('.obm-panel').count() == 1
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            bounds = page.locator('.obm-panel').bounding_box()
            assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= page.viewport_size['width'] + 1, bounds
            assert page.evaluate("()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return ids.length===new Set(ids).size;}")

        buyer = persona('buyer', 320)
        receipt['checkpoint'] = 'business-save'
        business = menu(buyer, 'manage.business')
        business.locator('[name=name]').fill('Chrome 패널 검증 사업장')
        business.locator('[name=road]').fill('검증 소재지')
        business.locator('[name=postal]').fill('08843')
        business.locator('[data-business-ref=region-root]').select_option('1100000000')
        business.locator('[data-business-ref=region-leaf]').select_option('1162000000')
        with buyer.expect_response(lambda response: response.url.endswith('/role/businesses') and response.request.method == 'POST') as saved:
            business.get_by_role('button', name='저장', exact=True).click()
        assert saved.value.status == 200
        expect(business.locator('[data-business-ref=business-status]')).to_have_text('사업장을 저장했습니다.')
        stable(buyer)
        buyer.screenshot(path=EVIDENCE / 'business-saved-320.png')
        business = menu(buyer, 'manage.business')
        expect(business.locator('.business-card').filter(has_text='Chrome 패널 검증 사업장')).to_have_count(1)

        receipt['checkpoint'] = 'purchase-create'
        payments = menu(buyer, 'manage.payments')
        expect(payments.locator('[data-purchase-confirm]')).to_be_enabled()
        payments.locator('[name=quantity]').fill('31')
        payments.locator('[data-purchase-confirm]').click()
        expect(payments.locator('[data-purchase-confirm]')).to_contain_text('주문 확정')
        with buyer.expect_response(lambda response: response.url.endswith('/product/purchases') and response.request.method == 'POST') as ordered:
            payments.locator('[data-purchase-confirm]').click()
        assert ordered.value.status == 200
        order = ordered.value.json()['item']
        assert order['total'] == 31 * 5970 and order['status'] == 'AWAITING_CASH'
        detail = settled(buyer, 'manage.payments.view.store-purchase.cash')
        expect(detail.locator('[data-purchase-id]')).to_have_text(order['id'])
        stable(buyer)
        buyer.screenshot(path=EVIDENCE / 'purchase-saved-320.png')
        buyer.locator('[data-obm-page="manage.payments.view.store-purchase.cash"] .obm-back').click()
        payments = settled(buyer, 'manage.payments')
        expect(payments.locator('[data-order-select]')).to_have_value(order['id'])
        expect(payments.locator('[data-purchase-confirm]')).to_contain_text('금액 확인')
        stable(buyer)
        buyer.screenshot(path=EVIDENCE / 'purchase-parent-refreshed-320.png')

        operator = persona('operator', 1440)
        receipt['checkpoint'] = 'cash-confirm-and-dispatch'
        payments = menu(operator, 'manage.payments')
        expect(payments.locator('[data-order-action="confirm-cash"]')).to_be_visible()
        payments.locator('[name=cash-reference]').fill('panel-chrome-cash')
        payments.locator('[data-order-action="confirm-cash"]').click()
        expect(payments.locator('[data-order-status]')).to_have_text('입금을 확인했어요.')
        delivery = menu(operator, 'manage.delivery')
        expect(delivery.locator('[data-shipment-order]')).to_have_value(order['id'])
        delivery.locator('[name=shipment-status]').select_option('dispatched')
        expect(delivery.locator('[data-shipment-apply]')).to_be_enabled()
        delivery.locator('[data-shipment-apply]').click()
        expect(delivery.locator('[data-shipment-summary]')).to_have_text('배송 정보를 저장했어요.')
        stable(operator)
        operator.screenshot(path=EVIDENCE / 'dispatched-1440.png')

        receipt['checkpoint'] = 'receipt-and-sales'
        payments = menu(buyer, 'manage.payments')
        expect(payments.locator('[data-order-action=receive]')).to_be_visible()
        payments.locator('[data-order-action=receive]').click()
        expect(payments.locator('[data-order-status]')).to_have_text('수령 확인을 저장했어요.')
        quotes = menu(buyer, 'manage.quotes')
        expect(quotes.locator('[data-pass-payment]')).to_have_text('결제 확인')
        stable(buyer)
        dashboard = menu(operator, 'manage.dashboard')
        expect(dashboard.locator('[data-sales-total=orders]')).to_have_text('1건')
        expect(dashboard.locator('[data-sales-total=paid]')).to_have_text('185,070원')
        stable(operator)
        operator.screenshot(path=EVIDENCE / 'sales-1440.png')
        assert not errors, errors
        receipt.update(status='PASS', checkpoint='complete', runId=run, widths=[320, 1440], orderId=order['id'], actualBusinessSaveAndReload=True, actualOrderCashDispatchReceive=True, actualSalesRead=True, parentRefreshAfterBack=True, samePanelAndURL=True, originalSvgPreserved=True, pageErrors=errors, writes=writes, source=operator.evaluate('window.ORDER_APP_CONTEXT.source'))
        context.tracing.stop(path=EVIDENCE / 'account-panels-trace.zip')
        print(json.dumps({key: receipt[key] for key in ['status', 'widths', 'samePanelAndURL', 'actualBusinessSaveAndReload', 'actualOrderCashDispatchReceive']}, ensure_ascii=False))
    except Exception:
        receipt.update(status='FAIL', failure=traceback.format_exc(), pageErrors=errors, writes=writes)
        for index, page in enumerate(pages):
            try:
                page.screenshot(path=EVIDENCE / f'failure-{index}.png')
            except Exception:
                pass
        if context:
            try:
                context.tracing.stop(path=EVIDENCE / 'account-panels-trace.zip')
            except Exception:
                pass
        raise
    finally:
        (EVIDENCE / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        # Keep Playwright alive through failure evidence capture and cleanup.
        # A cleanup error must not replace the original assertion/traceback.
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        if pw:
            try:
                pw.stop()
            except Exception:
                pass
        try:
            host.terminate()
            try:
                host.wait(timeout=5)
            except subprocess.TimeoutExpired:
                host.kill()
                host.wait(timeout=5)
        finally:
            host_log.close()


if __name__ == '__main__':
    main()
