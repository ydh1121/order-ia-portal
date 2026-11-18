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
        page.goto(cfg['url']+'/ia/')
        anchor=page.locator('a[href="/ia?view=qa-lab"]')
        with page.expect_popup() as popup:anchor.click()
        qa_tab=popup.value
        qa_tab.wait_for_url('**/ia?view=qa-lab**',wait_until='domcontentloaded')
        qa_tab.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
        assert qa_tab.evaluate('window.opener===null')
        assert qa_tab.locator('#ia-live-banner').count()==0
        anon=browser.new_context()
        assert anon.request.get(cfg['url']+'/api/ia/r3-qa/records?release=MSG0585-R3').status==403
        check_private_product(context,cfg['url'])
        check_wait_layout(context,cfg['url'])
        browser.close()
    print('PASS real Chrome at 390px, loopback fixture. Login return link, independent new tab, no opener, CAS conflict, duplicate, reload, fresh tab, signed-out API denial.')
finally:
    host.terminate();host.wait(timeout=5)
