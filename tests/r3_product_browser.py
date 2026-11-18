"""Real protected product in the existing authenticated IA browser context."""
from urllib.parse import urlsplit


def check_private_product(context, origin):
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(origin + '/ia?view=simple-r3#/home')
        page.wait_for_function("document.documentElement.dataset.storageReady === 'true'")
        assert page.locator('html').get_attribute('data-r3-quote-mode') == 'simple'
        partition = page.locator('html').get_attribute('data-r3-quote-partition')
        key = 'order_ia_r3_quote_v1_' + partition
        page.locator('#start').click()
        for field, value in [('housing', '4'), ('size', '특란'), ('pack', '30')]:
            page.locator(f'[data-pick="{field}"][data-value="{value}"]').click()
        page.locator('[data-line-qty]').fill('17')
        page.locator('[data-line-price]').fill('8000')
        page.wait_for_function('key => {const s=JSON.parse(localStorage.getItem(key)); return s?.data.lines[0]?.qty==="17" && s.data.lines[0].price==="8000" && document.documentElement.dataset.storagePending!=="true";}', arg=key+'_simple')
        page.reload()
        page.wait_for_function("document.documentElement.dataset.storageReady === 'true'")
        page.locator('#quote-mode-switch').click()
        dialog = page.locator('#quote-mode-dialog[open]')
        assert not dialog.locator('[data-mode-option]').is_checked()
        dialog.locator('[data-mode-cancel]').click()
        assert page.evaluate('k => localStorage.getItem(k)', key+'_detailed') is None
        page.locator('#quote-mode-switch').click()
        dialog.locator('label').click()
        dialog.locator('[data-mode-confirm]').click()
        page.wait_for_url('**/ia?view=detailed-r3#/form')
        page.wait_for_function("document.documentElement.dataset.storageReady === 'true'")
        assert page.locator('html').get_attribute('data-r3-quote-partition') == partition
        data = page.evaluate('k => JSON.parse(localStorage.getItem(k)).data', key+'_detailed')
        assert data['lines'][0]['price'] == '8000' and 'simpleQuote' not in data
        page.reload()
        page.wait_for_function("document.documentElement.dataset.storageReady === 'true'")
        assert page.evaluate('k => JSON.parse(localStorage.getItem(k)).data.lines[0].qty', key+'_detailed') == '17'
        assert page.evaluate("localStorage.getItem('order_q1_q4_v1')") is None
        assert page.evaluate("localStorage.getItem('order_simple_prework_0581')") is None
        assert page.locator('a[href="/ia?view=qa-lab"]').count() == 1
        assert urlsplit(page.url).netloc == urlsplit(origin).netloc and not errors, errors
    finally:
        page.close()
