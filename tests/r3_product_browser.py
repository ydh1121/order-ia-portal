"""Real protected product in the existing authenticated IA browser context."""
from urllib.parse import urlsplit


def check_private_product(context, origin):
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        with page.expect_request(lambda request: request.url == origin + '/api/ia/product/features') as publication:
            page.goto(origin + '/ia?view=simple-r3#/home')
        assert '__Host-ia_session=' in publication.value.all_headers().get('cookie','')
        assert publication.value.redirected_from is None
        page.wait_for_function("() => document.documentElement.dataset.storageReady === 'true'")
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
        page.wait_for_function("() => document.documentElement.dataset.storageReady === 'true'")
        page.locator('#quote-mode-switch').click()
        dialog = page.locator('#quote-mode-dialog[open]')
        assert not dialog.locator('[data-mode-option]').is_checked()
        dialog.locator('[data-mode-cancel]').click()
        assert page.evaluate('k => localStorage.getItem(k)', key+'_detailed') is None
        page.locator('#quote-mode-switch').click()
        dialog.locator('label').click()
        dialog.locator('[data-mode-confirm]').click()
        page.wait_for_url('**/ia?view=detailed-r3#/form')
        page.wait_for_function("() => document.documentElement.dataset.storageReady === 'true'")
        assert page.locator('html').get_attribute('data-r3-quote-partition') == partition
        data = page.evaluate('k => JSON.parse(localStorage.getItem(k)).data', key+'_detailed')
        assert data['lines'][0]['price'] == '8000' and 'simpleQuote' not in data
        page.reload()
        page.wait_for_function("() => document.documentElement.dataset.storageReady === 'true'")
        assert page.evaluate('k => JSON.parse(localStorage.getItem(k)).data.lines[0].qty', key+'_detailed') == '17'
        assert page.evaluate("localStorage.getItem('order_q1_q4_v1')") is None
        assert page.evaluate("localStorage.getItem('order_simple_prework_0581')") is None
        assert page.locator('a[href="/ia?view=qa-lab"]').count() == 1
        assert urlsplit(page.url).netloc == urlsplit(origin).netloc and not errors, errors
        check_region_overlay(context, origin)
    finally:
        page.close()


def check_region_overlay(context, origin):
    """Measure the form below the regional selector at each requested width."""
    from playwright.sync_api import expect
    for width in (320, 390, 1440):
        touch = width < 500
        fixture = context.browser.new_context(
            viewport={'width': width, 'height': 844},
            has_touch=touch,
            reduced_motion='reduce',
            storage_state={'cookies': context.cookies(), 'origins': []},
        )
        try:
            tab = fixture.new_page()
            tab.set_default_timeout(10000)
            tab.goto(origin + '/ia?view=simple-r3#/home')
            tab.wait_for_function("() => document.documentElement.dataset.storageReady === 'true'")
            tab.locator('#start').click()
            tab.locator('[data-open="q3"][aria-controls]').click()
            root = tab.locator('#simple-region-root')
            root.scroll_into_view_if_needed()
            tab.wait_for_function("() => !document.querySelector('#body-q3>div').inert")
            below = tab.locator('#q3-next')
            coordinate = '(el)=>el.getBoundingClientRect().top + window.scrollY'
            before = below.evaluate(coordinate)
            toggle = tab.locator('[data-region-toggle="root"]').first
            (toggle.tap if touch else toggle.click)()
            expect(root).to_have_attribute('aria-expanded', 'true')
            opened = below.evaluate(coordinate)
            menu = tab.locator('.simple-region-overlay:visible')
            rect = menu.bounding_box()
            assert rect and rect['width']>0 and rect['height']>0
            assert rect['x']>=0 and rect['x']+rect['width']<=width+1
            assert rect['y']>=0 and rect['y']+rect['height']<=845
            root.press('Escape')
            expect(root).to_have_attribute('aria-expanded', 'false')
            closed = below.evaluate(coordinate)
            assert max(abs(opened-before), abs(closed-before))<=1, (width, before, opened, closed)
            (toggle.tap if touch else toggle.click)()
            region = tab.locator('[data-region-option="4100000000"]')
            (region.tap if touch else region.click)()
            district = tab.locator('[data-region-option="4111700000"]')
            (district.tap if touch else district.click)()
            leaf = tab.locator('#simple-region-leaf')
            assert leaf.input_value()
            assert tab.evaluate('document.documentElement.scrollWidth<=innerWidth')
            print(f'R3 Q3 region selector width={width} touch={touch} yBefore={before} yOpen={opened} yClosed={closed} selection={leaf.input_value()}')
        finally:
            fixture.close()
