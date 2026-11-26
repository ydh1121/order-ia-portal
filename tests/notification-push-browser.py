"""Real Chromium rendering and trusted clicks; permission/provider are fixtures.

This checks the exact shared component with isolated browser/API substitutes.
It never requests actual device permission or contacts a push provider.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('R3_NOTIFICATION_EVIDENCE_DIR', ROOT / 'artifacts/notification-push'))


def snapshot(page):
    return page.evaluate('''() => ({...notificationFixture,
      state:document.querySelector('[data-notification-push]').dataset.pushState,
      text:document.querySelector('main').innerText,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
      font:getComputedStyle(document.querySelector('main')).fontFamily,
      fontLoaded:document.fonts.check('16px Pretendard'),
      switches:[...document.querySelectorAll('[data-notification-preference]')].map(input=>{
        const track=input.nextElementSibling,thumb=track?.querySelector('.r3-switch-thumb');
        const r=track?.getBoundingClientRect(),t=thumb?.getBoundingClientRect();
        return {name:input.name,checked:input.checked,width:r?.width,height:r?.height,
          thumbWidth:t?.width,thumbOffset:t&&r?t.x-r.x:null,
          background:track&&getComputedStyle(track).backgroundColor,
          visible:!!(r?.width&&r?.height&&t?.width&&t?.height&&getComputedStyle(track).visibility==='visible')};
      })})''')


def main():
    binary = os.environ.get('R3_BROWSER_BINARY') or shutil.which('google-chrome') or shutil.which('chromium')
    if not binary:
        raise RuntimeError('A real Chromium binary is required; this check does not synthesize screenshots.')
    OUT.mkdir(parents=True, exist_ok=True)
    host = subprocess.Popen(['node', 'tests/notification-push-browser-host.mjs'], cwd=ROOT, text=True, stdout=subprocess.PIPE)
    try:
        origin = json.loads(host.stdout.readline())['origin']
        receipt = {'kind': 'notification-native-renderer/v1', 'permissionProviderAndApi': 'controlled-fixtures',
                   'actualDevicePermissionRequested': False, 'actualProviderRequests': 0, 'screens': {}}
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=binary, headless=True, args=['--disable-background-networking'])
            errors = []
            for mode, width in [('product', 390), ('qa-fixture', 1440)]:
                context = browser.new_context(viewport={'width': width, 'height': 1000}, device_scale_factor=1)
                # The host serves module and font bytes. Every non-loopback
                # request is blocked, including accidental provider calls.
                unexpected = []
                def route(request_route):
                    if urlparse(request_route.request.url).netloc == urlparse(origin).netloc:
                        request_route.continue_()
                    else:
                        unexpected.append(request_route.request.url)
                        request_route.abort()
                context.route('**/*', route)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(origin + '/?mode=' + mode)
                page.wait_for_function('window.notificationFixture?.ready')
                expect(page.locator('[data-notification-preference]')).to_have_count(3)
                toggle = page.locator('[data-notification-push-toggle]')
                before = snapshot(page)
                assert before['permission'] == 0 and before['subscribe'] == 0
                assert before['fontLoaded'] and not before['horizontalOverflow'], before
                assert len(before['switches']) == 3 and all(
                    s['visible'] and s['width'] >= 32 and s['height'] >= 18 and s['thumbWidth'] >= 12
                    and s['background'] not in ['transparent', 'rgba(0, 0, 0, 0)']
                    for s in before['switches']), before['switches']
                page.screenshot(path=str(OUT / (mode + '-initial.png')), full_page=True)
                if mode == 'product':
                    expect(toggle).to_be_enabled()
                    assert before['state'] == 'off'
                    page.locator('[data-notification-preference=price]').check()
                    page.wait_for_function("notificationFixture.calls.some(c=>c.path==='/notification-preferences'&&c.body?.preferences.price)")
                    assert snapshot(page)['permission'] == 0
                    toggle.click()
                    page.wait_for_function("document.querySelector('[data-notification-push]').dataset.pushState==='registered'")
                    page.locator('[data-notification-preference=price]').evaluate('''async input => {
                        await Promise.all(input.closest('label').getAnimations({subtree:true})
                            .map(animation=>animation.finished.catch(()=>{})));
                    }''')
                    connected = snapshot(page)
                    assert connected['permission'] == 1 and connected['subscribe'] == 1 and connected['register'] == 1
                    assert any(row['trusted'] and row['device'] for row in connected['clicks'])
                    assert any(row['trusted'] and row['preference'] == 'price' for row in connected['clicks'])
                    assert connected['horizontalOverflow'] is False
                    initial_price = next(s for s in before['switches'] if s['name'] == 'price')
                    connected_price = next(s for s in connected['switches'] if s['name'] == 'price')
                    assert connected_price['checked'] and connected_price['thumbOffset'] > initial_price['thumbOffset'] + 8
                    assert connected_price['background'] != initial_price['background']
                    page.screenshot(path=str(OUT / 'product-connected.png'), full_page=True)
                    toggle.click()
                    page.wait_for_function("document.querySelector('[data-notification-push]').dataset.pushState==='off'")
                    disconnected = snapshot(page)
                    assert disconnected['permission'] == 1 and disconnected['unsubscribe'] == 1
                    writes = [row['body'] for row in disconnected['calls'] if row['path'] == '/notification-push' and row['body']]
                    assert [row['action'] for row in writes] == ['subscribe', 'unsubscribe']
                    expect(page.locator('[data-notification-preference=price]')).to_be_checked()
                    receipt['screens'][mode] = {'before': before, 'connected': connected, 'disconnected': disconnected}
                else:
                    expect(toggle).to_be_disabled()
                    assert before['state'] == 'review' and before['storage'] == 0 and before['deviceReads'] == 0
                    assert not any(row['path'] == '/notification-push' for row in before['calls'])
                    receipt['screens'][mode] = before
                assert not unexpected, unexpected
                context.close()
            browser.close()
            assert not errors, errors
        receipt['passed'] = True
        (OUT / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'passed': True, 'receipt': str(OUT / 'receipt.json'), 'actualDevicePermissionRequested': False, 'actualProviderRequests': 0}))
    finally:
        host.terminate()
        host.wait(timeout=10)


if __name__ == '__main__':
    main()
