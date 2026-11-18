"""Chromium interaction tests of the actual authenticated Pages UI with ephemeral SQLite/actor."""
from pathlib import Path
from r3_feedback_browser_support import frame_click, prepare_frame_pointer
from playwright.sync_api import sync_playwright,expect
import json, subprocess, os, shutil, tempfile, hashlib
root=Path(__file__).resolve().parents[1]
def check_draft_recovery(context,page):
 # Exercise the real editor, interrupt just the response after one committed POST,
 # and replay from a reloaded document. The SQLite fixture receives actual requests.
 body='복구 검수용 의견'
 draft=page.locator('#body-text')
 page.locator('#points').click()
 page.locator('#general').click()
 draft.fill(body)
 context.set_offline(True)
 page.locator('#save').click()
 expect(page.locator('#live')).to_contain_text('저장하지 못했습니다')
 expect(draft).to_have_value(body)
 context.set_offline(False)
 def recover():
  page.reload()
  page.get_by_role('button',name='저장하지 않은 의견 이어쓰기 · '+body).click()
  expect(draft).to_have_value(body)
 recover()
 pattern='**/api/ia/r3-qa/records'
 seen=[]
 def drop_committed_response(route):
  response=route.fetch()
  seen.append((route.request.post_data_json['idempotencyKey'],response.status))
  route.abort()
 page.route(pattern,drop_committed_response)
 page.locator('#save').click()
 expect(page.locator('#live')).to_contain_text('저장하지 못했습니다')
 page.unroute(pattern,drop_committed_response)
 recover()
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records')) as result:
  page.locator('#save').click()
 response=result.value
 assert len(seen)==1 and seen[0][1]==200 and response.request.post_data_json['idempotencyKey']==seen[0][0]
 assert response.json()['replayed'] and response.json()['revision']==1
 card=page.locator('#notes article').filter(has=page.get_by_text(body,exact=True))
 second=context.new_page()
 second.goto(page.url)
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 second.locator('#notes article').filter(has=second.get_by_text(body,exact=True)).get_by_role('button',name='수정',exact=True).click()
 second.locator('#body-text').fill('두 번째 탭 초안')
 card.get_by_role('button',name='수정',exact=True).click()
 draft.fill('먼저 확정한 의견')
 page.locator('#save').click()
 expect(page.locator('#live')).to_contain_text('저장됨 · r2')
 second.locator('#save').click()
 expect(second.locator('#conflict')).to_contain_text('먼저 확정한 의견')
 expect(second.locator('#body-text')).to_have_value('두 번째 탭 초안')
 second.get_by_role('button',name='다른 탭의 내용을 확인하고 계속 수정').click()
 second.locator('#save').click()
 expect(second.locator('#live')).to_contain_text('저장됨 · r3')
 second.reload()
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 entry=second.locator('#notes article').filter(has=second.get_by_text('두 번째 탭 초안',exact=True))
 entry.get_by_role('button',name='이력').click()
 expect(entry).to_contain_text('r2 · save · 먼저 확정한 의견')
 expect(entry).to_contain_text('r3 · save · 두 번째 탭 초안')
 second.close()
 print('PASS offline edit + reload, post-commit lost response + replay r1, two-tab UI conflict + explicit rebase r3 preserving both versions')
def check_screen_memo(context,page):
 page.reload()
 page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 page.locator('#points').click()
 memo=page.locator('#review-note')
 first='이 화면에 관한 별도 메모'
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='screen') as saved:
  memo.fill(first)
 assert saved.value.ok and saved.value.json()['revision']==1
 expect(page.locator('#review-note-state')).to_contain_text('저장됨 · r1')
 second=context.new_page()
 second.goto(page.url)
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 expect(second.locator('#review-note')).to_have_value(first)
 expect(second.locator('#notes article').filter(has=second.get_by_text(first,exact=True))).to_have_count(0)
 second.locator('#review-note').fill('갱신한 화면 메모')
 second.locator('#save-review-note').click()
 expect(second.locator('#review-note-state')).to_contain_text('저장됨 · r2')
 second.close()
 page.reload()
 page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 page.locator('#points').click()
 expect(memo).to_have_value('갱신한 화면 메모')
 print('PASS screen memo autosave, explicit update, second-tab read and refresh; distinct from comment and verdict')

def run():
 host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
 try:
  fixture=json.loads(host.stdout.readline())
  with sync_playwright() as pw:
   binary=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium')
   browser=pw.chromium.launch(executable_path=binary)
   for width in (390,1440):
    ctx=browser.new_context(viewport={'width':width,'height':870})
    page=ctx.new_page();prepare_frame_pointer(page);page.set_default_timeout(12000);errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(fixture['url']+'/ia?view=qa-lab')
    page.locator('input[name=email]').fill(fixture['email']);page.locator('input[name=password]').fill(fixture['pass']);page.locator('button[type=submit]').click()
    page.wait_for_url('**/ia?view=qa-lab**')
    frame=page.frame_locator('#frame')
    frame.locator('#r3-veil').wait_for(state='attached')
    page.goto(fixture['url']+'/ia?view=qa-lab&screen=login/empty/email&width='+str(width))
    frame.locator('#r3-veil').wait_for(state='attached')
    page.locator('#new').click()
    frame.locator('#r3-veil').wait_for(state='visible')
    # Same viewport point can hold independent comments; typing alone never submits.
    for i in range(2):
     if i:page.locator('#close-drawer').click();page.locator('#new').click()
     veil=frame.locator('#r3-veil');frame_click(page,veil,position={'x':100,'y':120})
     page.locator('#body-text').fill('위치 '+str(i));page.locator('#save').click()
     page.locator('#live').filter(has_text='저장됨').wait_for()
     page.locator('#blocks:not([hidden])').wait_for()
    page.locator('#close-drawer').click();pin=frame.locator('.r3-pin');pin.first.wait_for()
    expect(pin).to_have_count(1)
    expect(pin.first).to_have_text('1')
    expect(pin.first).to_have_attribute('data-cluster','+1')
    expect(pin.first).to_have_attribute('aria-label','위치 코멘트 1, 2번 열기')
    box=pin.first.bounding_box();frame_click(page,pin.first);assert '위치 0' in page.locator('#notes').inner_text() and '위치 1' in page.locator('#notes').inner_text()
    parent=page.locator('#notes article').filter(has=page.get_by_text('위치 0',exact=True))
    parent.get_by_role('button',name='답글 작성').click()
    page.locator('#body-text').fill('저장한 답글');page.get_by_role('button',name='답글 저장').click()
    parent.get_by_text('저장한 답글',exact=True).wait_for()
    second=ctx.new_page();second.goto(page.url);second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');second.locator('#points').click()
    other=second.locator('#notes article').filter(has=second.get_by_text('위치 0',exact=True));other.get_by_text('저장한 답글',exact=True).wait_for()
    second.close()
    page.locator('#close-drawer').click();page.reload()
    pin.first.wait_for();again=pin.first.bounding_box()
    error=((again['x']-box['x'])**2+(again['y']-box['y'])**2)**.5
    assert error<=3,(box,again,error)
    page.locator('#points').click()
    page.locator('[data-drawer-tab=settings]').click()
    with page.expect_download() as downloaded:
     page.locator('#export-editable').click()
    file=Path(downloaded.value.path());raw=file.read_bytes()
    assert b'<iframe' not in raw and b'id="frame-meta"' in raw
    assert not errors,errors
    print(json.dumps({'width':width,'restorePixelError':error,'overlapCount':2,'exportSHA256':hashlib.sha256(raw).hexdigest(),'pageErrors':errors}))
    page.locator('#close-drawer').click()
    if width==390:
     check_draft_recovery(ctx,page)
     check_screen_memo(ctx,page)
    ctx.close()
   browser.close()
 finally:host.terminate();host.wait(timeout=5)
if __name__=='__main__':run()
