"""Measure R4 animation and banner geometry in the isolated QA frame."""
from urllib.parse import urlencode
from pathlib import Path
import json
from playwright.sync_api import expect


def check_wait_layout(context, origin):
    page = context.new_page()
    try:
        for width in (320, 390, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            query = urlencode({"view": "qa-lab", "archive": "1", "screen": "quote-wait/comparing/email", "width": width})
            page.goto(origin + "/ia?" + query)
            frame = page.frame_locator("#frame")
            art = frame.locator(".mf-wait-avatar")
            expect(art.locator('div[aria-hidden="true"]:not([hidden])')).to_be_visible()
            rect = art.evaluate("""element => {
               const avatar = element.getBoundingClientRect();
               const stack = element.parentElement.querySelector('.mf-banner-stack').getBoundingClientRect();
               return {gap: avatar.top - stack.bottom, width: avatar.width,
                 screenWidth: innerWidth, clipped: document.documentElement.scrollWidth > innerWidth};
            }""")
            assert rect["gap"] >= 15 and 105 <= rect["width"] <= 161, rect
            assert not rect["clipped"], rect
            print("BLOUB R4", width, rect)
        page.set_viewport_size({'width':390,'height':844})
        page.emulate_media(reduced_motion='no-preference')
        query=urlencode({'view':'qa-lab','archive':'1','screen':'quote-wait/entry/email','width':390})
        page.goto(origin+'/ia?'+query)
        frame=page.frame_locator('#frame')
        root=frame.locator('#order-single');scene=root.locator('[data-wait-scene]')
        expect(scene).to_have_attribute('data-phase','entry')
        trace=scene.evaluate("""async el=>{
          const rows=[];let last=-1;
          return await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{observer.disconnect();reject(Error('waiting banners timed out '+JSON.stringify(rows)));},12000);
            function sample(){const count=Number(el.dataset.emitted);if(count===last)return;last=count;
              rows.push({emitted:count,cards:el.querySelectorAll('[data-banner-index]').length,visual:Number(el.dataset.visualMs),avatar:Number(el.dataset.avatarTime)});
              if(count>=5){clearTimeout(timer);observer.disconnect();resolve(rows);}}
            const observer=new MutationObserver(sample);observer.observe(el,{attributes:true,attributeFilter:['data-emitted']});sample();
          });}""")
        first=next(row for row in trace if row['emitted']==1)
        assert 3500<=first['visual']<3850 and abs(first['avatar']*1000-first['visual'])<=2,trace
        assert all(row['cards']==min(row['emitted'],3) for row in trace),trace
        assert all(475<=b['visual']-a['visual']<800 for a,b in zip(trace[1:],trace[2:])),trace
        initial=root.get_attribute('data-wait-request')
        def response(status,request_id):
            return root.evaluate("""(el,d)=>{const host=el.querySelector('[data-wait-scene]'),before=host.dataset.phase;
              el.dispatchEvent(new CustomEvent('order:quote-response',{detail:d}));return [before,host.dataset.phase];}""",{'status':status,'requestId':request_id,'canView':True})
        before,after=response('error','stale');assert before==after and after in ['entry','comparing','delayed'],(before,after)
        response('offline',initial);expect(scene).to_have_attribute('data-phase','offline');expect(scene.locator('[data-banner-index]')).to_have_count(0)
        assert scene.locator('.mf-wait-avatar').get_attribute('data-asset')=='r4-static-fallback'
        scene.locator('[data-wait-retry]').evaluate('b=>b.click()');expect(scene).to_have_attribute('data-phase','entry')
        retry=root.get_attribute('data-wait-request');assert retry!=initial
        response('success',initial);expect(scene).to_have_attribute('data-phase','entry')
        response('delayed',retry);expect(scene).to_have_attribute('data-phase','delayed')
        response('error',retry);expect(scene).to_have_attribute('data-phase','error')
        scene.locator('[data-wait-retry]').evaluate('b=>b.click()');response('success',root.get_attribute('data-wait-request'))
        expect(page.frame_locator('#frame').locator('[data-order-result]')).to_have_attribute('data-state','saving',timeout=30000)
        out=Path(__file__).resolve().parents[1]/'artifacts/quote-result';out.mkdir(parents=True,exist_ok=True)
        (out/'wait-r4-temporal.json').write_text(json.dumps({'samples':trace,'offline':True,'oldResponseIgnored':True,'retry':True,'source':'isolated QA controlled requests'},ensure_ascii=False,indent=2)+'\n')
    finally:
        page.close()
