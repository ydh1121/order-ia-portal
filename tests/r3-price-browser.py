"""Private pricing desk interaction in Linux Chromium, actual handlers, isolated SQLite."""
from datetime import datetime,timedelta,timezone
import json,os,shutil,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
out=root/'artifacts'/'price-matrix'
out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','tests/export-r3-price-editor.mjs'],cwd=root,check=True)
def check_matrix(page):
 out=root/'artifacts'/'price-matrix';out.mkdir(parents=True,exist_ok=True)
 page.set_viewport_size({'width':1440,'height':900})
 grid=page.locator('#matrix')
 at=lambda row,col:grid.locator(f'input[data-r="{row}"][data-c="{col}"]')
 # Deliver a browser ClipboardEvent with an actual dataTransfer, same path as desktop paste.
 at(0,2).focus()
 at(0,2).evaluate("""el=>{const dt=new DataTransfer();dt.setData('text/plain','11\\t12\\t13\\n21\\t22\\t23');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""")
 for i,r in enumerate(([11,12,13],[21,22,23])):
  for j,n in enumerate(r):expect(at(i,j+2)).to_have_value(str(n))
 at(0,2).press('ArrowRight');expect(at(0,3)).to_be_focused()
 at(0,3).press('Enter');expect(at(1,3)).to_be_focused()
 at(1,3).press('Shift+Tab');expect(at(1,2)).to_be_focused()
 at(1,2).press('Tab');expect(at(1,3)).to_be_focused()
 at(0,2).fill('-3');expect(at(0,2)).to_have_attribute('aria-invalid','true')
 grid.scroll_into_view_if_needed();page.screenshot(path=out/'invalid-price.png')
 before=at(0,2).bounding_box()['height']
 at(0,2).fill('11');expect(at(0,2)).to_have_attribute('aria-invalid','false')
 assert abs(at(0,2).bounding_box()['height']-before)<=1
 grid.get_by_text('선택 범위 일괄 수정',exact=True).click()
 grid.locator('[data-mx=start]').click();at(0,2).click()
 grid.locator('[data-mx=end]').click();at(1,3).click()
 grid.locator('[data-mx=delta]').fill('5');grid.locator('[data-mx=preview]').click()
 expect(grid.locator('[data-mx=proposal] li')).to_have_count(4);expect(at(0,2)).to_have_value('11')
 grid.locator('[data-mx=apply]').click();expect(at(0,2)).to_have_value('16');expect(at(1,3)).to_have_value('27')
 grid.locator('[data-mx=method]').select_option('fee');grid.locator('[data-mx=delta]').fill('7')
 grid.locator('[data-mx=preview]').click();expect(grid.locator('[data-mx=proposal] li')).to_have_count(2)
 grid.locator('[data-mx=apply]').click();expect(at(1,3)).to_have_value('+7')
 at(1,0).fill('10');expect(at(1,0)).to_have_attribute('aria-invalid','true');at(1,0).fill('11')
 grid.locator('[data-mx=add]').click();expect(grid.locator('tbody tr')).to_have_count(3)
 grid.locator('[data-mx=remove]').click();expect(grid.locator('tbody tr')).to_have_count(2)
 grid.get_by_text('선택 범위 일괄 수정',exact=True).click()
 measured=[]
 for width,zoom in [(1440,1),(390,1),(320,1),(320,2)]:
  page.set_viewport_size({'width':width,'height':900});page.locator('html').evaluate('(el,z)=>el.style.zoom=z',zoom)
  grid.scroll_into_view_if_needed()
  box=grid.locator('[data-mx=scroll]').evaluate('el=>({client:el.clientWidth,scroll:el.scrollWidth,page:document.documentElement.scrollWidth})')
  assert box['page']<=width+1,(width,zoom,box)
  if width<=390:
   detail=grid.locator('[data-mx=row-detail]');detail.locator('summary').click();grid.locator('[data-mx=row-select]').select_option('1')
   detail.locator('[data-detail-col="4"]').fill('29');expect(at(1,4)).to_have_value('29')
   detail.locator('summary').click()
   expect(at(0,4)).to_be_hidden()
   grid.locator('[data-mx=grade]').select_option(index=1);expect(at(0,4)).to_be_visible()
   grid.locator('[data-mx=view]').click();expect(at(0,2)).to_be_visible()
   grid.locator('[data-mx=view]').click();grid.locator('[data-mx=grade]').select_option(index=0)
  page.screenshot(path=out/f'price-sheet-{width}-{zoom}.png')
  measured.append({'width':width,'zoom':zoom,**box})
 (out/'geometry.json').write_text(json.dumps({'viewports':measured,'pasteCells':6,'rangePreviewCells':4,'packageFees':2},ensure_ascii=False))
 page.locator('html').evaluate("el=>el.style.zoom=''");page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='합성 예시 불러오기').click()

def check_concurrent_draft(ctx,page):
 at=lambda p:p.locator('#matrix input[data-r="0"][data-c="2"]')
 page.reload();expect(page.locator('#current')).to_contain_text('r1');expect(at(page)).to_have_value('25')
 other=ctx.new_page();other.goto(page.url);expect(other.locator('#current')).to_contain_text('r1')
 at(other).fill('27')
 at(page).fill('26');page.get_by_role('button',name='초안 저장').click();expect(page.locator('#current')).to_contain_text('r2')
 other.get_by_role('button',name='초안 저장').click();expect(other.locator('#conflict')).to_be_visible();expect(at(other)).to_have_value('27')
 other.get_by_text('서버 버전 보기',exact=True).click();expect(other.locator('#remoteVersion tbody tr').first).to_contain_text('26')
 other.locator('#conflict').scroll_into_view_if_needed();other.screenshot(path=root/'artifacts'/'price-matrix'/'conflict-compare.png')
 other.locator('#keepInput').click();expect(at(other)).to_have_value('27')
 ctx.set_offline(True)
 try:
  other.get_by_role('button',name='초안 저장').click();expect(other.locator('#notice')).to_contain_text('입력을 유지했습니다');expect(at(other)).to_have_value('27')
 finally:ctx.set_offline(False)
 other.get_by_role('button',name='초안 저장').click();expect(other.locator('#current')).to_contain_text('r3')
 other.reload();expect(at(other)).to_have_value('27');at(other).fill('25');other.get_by_role('button',name='초안 저장').click();expect(other.locator('#current')).to_contain_text('r4')
 other.close();page.reload();expect(page.locator('#current')).to_contain_text('r4');expect(at(page)).to_have_value('25')
 page.locator('#scenario [data-field=serviceDate]').fill((datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat())
 page.locator('#scenario [data-field=quantity]').fill('10');page.locator('#scenario [data-field=region]').select_option('11')
 out=root/'artifacts'/'price-matrix'/'save-refresh-conflict.json'
 out.write_text(json.dumps({'initialRevision':1,'concurrentRevision':2,'localValueAfterConflict':'27','localValueWhileOffline':'27','retriedRevision':3,'restoredRevision':4,'valueAfterRefresh':'25'}))

host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
try:
 cfg=json.loads(host.stdout.readline())
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'))
  ctx=b.new_context(viewport={'width':390,'height':844});p=ctx.new_page()
  p.set_default_timeout(6000)
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(cfg['url']+'/ia?view=pricing-r3')
  p.locator('input[name=email]').fill(cfg['email']);p.locator('input[name=password]').fill(cfg['pass']);p.locator('button[type=submit]').click()
  p.wait_for_url('**/ia?view=pricing-r3')
  p.get_by_role('link',name='합성 역할 체험').click()
  p.get_by_role('button',name='내 연습 공간 열기').click();expect(p.locator('#scope option')).to_have_count(1)
  p.locator('#matrix').scroll_into_view_if_needed();p.screenshot(path=out/'empty-price.png')
  p.get_by_role('button',name='합성 예시 불러오기').click()
  check_matrix(p)
  p.get_by_role('button',name='초안 저장').click();expect(p.locator('#current')).to_contain_text('초안')
  check_concurrent_draft(ctx,p)
  p.get_by_role('button',name='저장된 조건으로 계산').click();expect(p.locator('#result')).to_contain_text('합계 255원')
  p.get_by_role('button',name='검토 요청').click();expect(p.locator('#current')).to_contain_text('검토 중')
  p.locator('#current').scroll_into_view_if_needed();p.screenshot(path=out/'pending-review.png')
  expect(p.get_by_role('button',name='승인',exact=True)).to_have_count(0)
  p.locator('#persona').select_option('operator');expect(p.locator('#versions option')).to_have_count(2)
  p.locator('#versions').select_option(index=1);p.locator('#open').click();expect(p.locator('#current')).to_contain_text('검토 중')
  p.get_by_role('button',name='승인',exact=True).click();expect(p.locator('#current')).to_contain_text('승인')
  p.locator('#persona').select_option('buyer');expect(p.locator('#buyerSite option')).to_have_count(2);p.locator('#buyerSite').select_option(index=1);expect(p.locator('#offerSelect option')).to_have_count(1)
  p.locator('#quoteQty').fill('10');p.locator('#quoteDay').fill((datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat());p.get_by_role('button',name='견적 발급').click();expect(p.locator('#buyerResult')).to_contain_text('255원')
  card=p.locator('#buyerResult');expect(card).to_have_attribute('data-state','offer')
  expect(card.get_by_role('button',name='제안 납품가 255원 상세 보기')).to_be_visible()
  expect(card.get_by_text('현재 납품가',exact=True)).to_have_count(0)
  card.get_by_role('button',name='제안 납품가 255원 상세 보기').click()
  expect(card.get_by_text('견적 기준일',exact=True)).to_be_visible()
  expect(card.get_by_text('견적 만료일',exact=True)).to_be_visible()
  card.get_by_role('button',name='견적 요약으로 돌아가기').click()
  expect(card.get_by_text('견적 기준일',exact=True)).to_have_count(0)
  # A detail click rechecks the snapshot grant. A refused read must remove the visible amount.
  card.get_by_role('button',name='제안 납품가 255원 상세 보기').wait_for()
  protected_read='**/api/ia/r3-price/practice/buyer/quote?id=*'
  def deny_read(route):route.fulfill(status=403,content_type='application/json',body='{"error":"ACCESS_REQUIRED"}')
  p.route(protected_read,deny_read)
  card.get_by_role('button',name='제안 납품가 255원 상세 보기').click()
  expect(card).to_have_attribute('data-state','unverified')
  expect(card).not_to_contain_text('255')
  p.unroute(protected_read,deny_read)
  p.reload();p.locator('#persona').select_option('buyer');expect(p.locator('#buyerSite option')).to_have_count(2);p.locator('#buyerSite').select_option(index=1);expect(p.locator('#quoteHistory option')).to_have_count(1);p.get_by_role('button',name='다시 보기').click();expect(p.locator('#buyerResult')).to_contain_text('255원')
  for w in (320,390,1440):
   p.set_viewport_size({'width':w,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  b.close()
 print('PASS Chromium: scoped supplier draft, simulation 255, pure supplier approval denied, distinct practice reviewer approved, buyer issued and reloaded 255. No horizontal overflow at 320/390/1440.')
finally:
 host.terminate();host.wait(timeout=5)
