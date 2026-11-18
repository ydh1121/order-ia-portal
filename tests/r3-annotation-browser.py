"""Chromium interaction tests of the actual authenticated Pages UI with ephemeral SQLite/actor."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, subprocess, os, shutil, tempfile, hashlib
root=Path(__file__).resolve().parents[1]
def run():
 host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
 try:
  fixture=json.loads(host.stdout.readline())
  with sync_playwright() as pw:
   binary=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium')
   browser=pw.chromium.launch(executable_path=binary)
   for width in (390,1440):
    ctx=browser.new_context(viewport={'width':width,'height':870})
    page=ctx.new_page();page.set_default_timeout(12000);errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(fixture['url']+'/ia?view=qa-lab')
    page.locator('input[name=email]').fill(fixture['email']);page.locator('input[name=password]').fill(fixture['pass']);page.locator('button[type=submit]').click()
    page.wait_for_url('**/ia?view=qa-lab**')
    frame=page.frame_locator('#frame')
    frame.locator('#r3-veil').wait_for(state='attached')
    page.locator('#width').select_option(str(width));frame.locator('#r3-veil').wait_for(state='attached');page.locator('#open').click();page.locator('#search').fill('로그인');tile=page.locator('#tiles article').filter(has_text='로그인').first;tile.get_by_role('button',name='이 화면에 의견').click()
    frame.locator('#r3-veil').wait_for(state='visible')
    # Same viewport point can hold independent comments; typing alone never submits.
    for i in range(2):
     if i:page.locator('#close-drawer').click();page.locator('#new').click()
     veil=frame.locator('#r3-veil');veil.click(position={'x':100,'y':120})
     page.locator('#body-text').fill('위치 '+str(i));page.locator('#save').click()
     page.locator('#live').filter(has_text='저장됨').wait_for()
     page.locator('#blocks:not([hidden])').wait_for()
    page.locator('#close-drawer').click();pin=frame.locator('.r3-pin');pin.first.wait_for()
    assert pin.count()==1 and '2' in pin.first.inner_text()
    box=pin.first.bounding_box();pin.first.click();assert '위치 0' in page.locator('#notes').inner_text() and '위치 1' in page.locator('#notes').inner_text()
    page.locator('#close-drawer').click();page.reload()
    pin.first.wait_for();again=pin.first.bounding_box()
    error=((again['x']-box['x'])**2+(again['y']-box['y'])**2)**.5
    assert error<=3,(box,again,error)
    page.locator('summary').click()
    with page.expect_download() as downloaded:
     page.locator('#export').click()
    file=Path(downloaded.value.path());raw=file.read_bytes()
    assert b'<iframe' not in raw and b'id="frame-meta"' in raw
    assert not errors,errors
    print(json.dumps({'width':width,'restorePixelError':error,'overlapCount':2,'exportSHA256':hashlib.sha256(raw).hexdigest(),'pageErrors':errors}))
    ctx.close()
   browser.close()
 finally:host.terminate();host.wait(timeout=5)
if __name__=='__main__':run()
