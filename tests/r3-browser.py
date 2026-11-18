"""Exercise the actual private IA route and review API in two tabs on a loopback fixture."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from playwright.sync_api import sync_playwright
from r3_product_browser import check_private_product
from r3_wait_layout import check_wait_layout

root=Path(__file__).resolve().parent.parent

def check_qa_menu(page,url,width,dashboard_ready=False):
    page.set_viewport_size({'width':width,'height':844})
    page.goto(url+'/ia/')
    if dashboard_ready:
        page.locator('.ux-account').wait_for(state='visible')
    else:
        page.locator('#ia-live-banner').filter(has_text='Google 원장 또는').wait_for(state='visible')
    menu=page.locator('.ux-nav-toggle')
    assert menu.count()==1
    anchor=page.locator('.sidebar a[href="/ia?view=qa-lab"]')
    if width<768:
        assert menu.is_visible() and not anchor.is_visible()
        menu.click()
        assert menu.get_attribute('aria-expanded')=='true'
    else:
        assert not menu.is_visible()
    assert anchor.is_visible()
    with page.expect_popup() as popup:anchor.click()
    qa_tab=popup.value
    qa_tab.wait_for_url('**/ia?view=qa-lab**',wait_until='domcontentloaded')
    qa_tab.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
    assert qa_tab.evaluate('window.opener===null')
    assert qa_tab.locator('#ia-live-banner').count()==0
    qa_tab.close()
    print(f'PASS IA menu → standalone QA at {width}px; dashboard={"synthetic ready" if dashboard_ready else "unavailable"}')

host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
try:
    cfg=json.loads(host.stdout.readline())
    with sync_playwright() as pw:
        chrome=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome')
        browser=pw.chromium.launch(executable_path=chrome)
        context=browser.new_context(viewport={'width':390,'height':844})
        page=context.new_page()
        page.goto(cfg['url']+'/ia?view=qa-lab')
        assert '/login?returnView=qa-lab' in page.url
        page.locator('input[name=email]').fill(cfg['email'])
        page.locator('input[name=password]').fill(cfg['pass'])
        page.locator('button[type=submit]').click()
        page.wait_for_url('**/ia?view=qa-lab**')
        assert page.locator('body').inner_text().strip()
        assert page.locator('#ia-live-banner').count()==0
        artifact=page.evaluate("async()=>await(await fetch('/api/ia/r3-qa/artifact?id=login%2Fempty%2Femail&version=current&width=390')).json()")
        review={'release':'MSG0585-R3','kind':'comment','id':'typed','expectedRevision':0,'idempotencyKey':'once',
                'data':{'body':'검토','target':{'screen':'login','state':'empty','viewport':390,'variant':'email','artifactHash':artifact['hash']}}}
        write="""async b=>{const me=await(await fetch('/api/ia/auth/me')).json();
            const r=await fetch('/api/ia/r3-qa/records',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':me.csrf},body:JSON.stringify(b)});
            return {status:r.status,data:await r.json()};}"""
        saved=page.evaluate(write,review)
        assert saved['status']==200 and saved['data']['revision']==1 and not saved['data']['replayed']
        page.reload()
        second=context.new_page();second.goto(cfg['url']+'/ia?view=qa-lab')
        got=second.evaluate("async()=>await(await fetch('/api/ia/r3-qa/records?release=MSG0585-R3')).json()")
        assert [(r['id'],r['data']['body']) for r in got['items']]==[('typed','검토')]
        assert second.evaluate(write,review)['data']['replayed']
        stale=dict(review,idempotencyKey='other',data=dict(review['data'],body='다른 초안'))
        assert second.evaluate(write,stale)['status']==409
        # No Google credentials in this fixture: QA must remain reachable when that read fails.
        check_qa_menu(page,cfg['url'],390)
        reference=json.loads(page.locator('#sitemap-json').text_content())
        # Synthetic read-only data verifies successful hydration reuses the same menu button.
        dashboard={'source':'GOOGLE_SHEETS_AUTHENTICATED_READ','readOnly':True,
            'screenCount':76,'decisionCount':25,'roadmapCount':7,
            'screens':{'items':[{'screenId':item['id'],'name':item['name'],'status':'기획 진행'} for item in reference['items']]},
            'decisions':{'active':24,'fullyApproved':1,'items':[
                {'id':f'PENDING-{i:02d}','name':f'모의 검토 {i}','status':'승인 완료' if i==1 else '검토 필요','isFullyApproved':i==1}
                for i in range(1,26)]},
            'roadmap':{'items':[{'stage':str(i),'goal':'모의 단계','status':'검토 중','description':'모의 설명'} for i in range(7)]},
            'notes':{'items':[]}}
        page.route('**/api/ia/dashboard',lambda route:route.fulfill(json=dashboard))
        for width in (390,1440):check_qa_menu(page,cfg['url'],width,dashboard_ready=True)
        page.set_viewport_size({'width':390,'height':844})
        anon=browser.new_context()
        assert anon.request.get(cfg['url']+'/api/ia/r3-qa/records?release=MSG0585-R3').status==403
        check_private_product(context,cfg['url'])
        check_wait_layout(context,cfg['url'])
        browser.close()
    print('PASS real Chrome at 390px and 1440px, loopback fixture. Responsive IA menu, login return link, independent new tab, no opener, CAS conflict, duplicate, reload, fresh tab, signed-out API denial.')
finally:
    host.terminate();host.wait(timeout=5)
