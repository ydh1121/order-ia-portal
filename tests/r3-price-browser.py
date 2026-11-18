"""Private pricing desk interaction in Linux Chromium, actual handlers, isolated SQLite."""
from datetime import datetime,timedelta,timezone
import json,os,shutil,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
try:
 cfg=json.loads(host.stdout.readline())
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'))
  p=b.new_page(viewport={'width':390,'height':844})
  p.set_default_timeout(6000)
  errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(cfg['url']+'/ia?view=pricing-r3')
  p.locator('input[name=email]').fill(cfg['email']);p.locator('input[name=password]').fill(cfg['pass']);p.locator('button[type=submit]').click()
  p.wait_for_url('**/ia?view=pricing-r3')
  p.get_by_role('link',name='합성 역할 체험').click()
  p.get_by_role('button',name='내 연습 공간 열기').click();expect(p.locator('#scope option')).to_have_count(1)
  p.get_by_role('button',name='합성 예시 불러오기').click()
  p.get_by_role('button',name='초안 저장').click();expect(p.locator('#current')).to_contain_text('DRAFT')
  p.get_by_role('button',name='저장된 조건으로 계산').click();expect(p.locator('#result')).to_contain_text('합계 255원')
  p.get_by_role('button',name='검토 요청').click();expect(p.locator('#current')).to_contain_text('SUBMITTED')
  p.get_by_role('button',name='승인',exact=True).click();expect(p.locator('#notice')).to_contain_text('권한')
  p.locator('#persona').select_option('operator');expect(p.locator('#versions option')).to_have_count(2)
  p.locator('#versions').select_option(index=1);p.locator('#open').click();expect(p.locator('#current')).to_contain_text('SUBMITTED')
  p.get_by_role('button',name='승인',exact=True).click();expect(p.locator('#current')).to_contain_text('APPROVED')
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
