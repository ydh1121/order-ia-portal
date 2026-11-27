"""Native account-panel origin, travel and inspection in the retained R1 frame."""
from pathlib import Path
import re
from playwright.sync_api import expect
from browser_predicate_support import wait_for_expression
from r3_feedback_browser_support import frame_click, prepare_frame_pointer


def motion(page, trigger, opening, reduced):
    page.emulate_media(reduced_motion='reduce' if reduced else 'no-preference')
    trigger.evaluate("""(t,opening)=>{
      const p=document.querySelector('.obm-panel'),s=p.querySelector('.obm-surface'),m=p.querySelector('.obm-menu');
      const compact=n=>{const r=n.getBoundingClientRect();return {right:r.right,y:r.y,w:r.width,h:r.height};};
      const ink=()=>{const paths=[...t.querySelectorAll('svg g > path')].map(n=>n.getBoundingClientRect());
        const left=Math.min(...paths.map(r=>r.left)),right=Math.max(...paths.map(r=>r.right));
        const y=Math.min(...paths.map(r=>r.top)),bottom=Math.max(...paths.map(r=>r.bottom));
        return {count:paths.length,right,y,w:right-left,h:bottom-y};};
      const samples=[];
      const snapshot=phase=>{
        const css=getComputedStyle(t),ss=getComputedStyle(s),ms=getComputedStyle(m);
        samples.push({phase,now:performance.now(),hidden:p.hidden,travel:!!p.querySelector('[data-points-moving=true]'),
          tr:compact(t),ink:ink(),surf:compact(s),triggerBackground:css.backgroundColor,triggerShadow:css.boxShadow,
          surfaceBackground:ss.backgroundColor,surfaceShadow:ss.boxShadow,menuShadow:ms.boxShadow,menuOpacity:+ms.opacity,
          logoOpacity:+getComputedStyle(t.querySelector('svg')).opacity,flights:p.querySelectorAll('.obm-flight').length,
          staticPoints:[...p.querySelectorAll('[data-obm-point] .obm-point')].filter(n=>getComputedStyle(n).visibility!=='hidden').length});
      };
      window.__accountMotion={samples,done:false};
      const action=opening?t:p;
      action.addEventListener(opening?'click':'keydown',e=>{
        if(!opening&&e.key!=='Escape')return;
        window.__accountMotion.trusted=e.isTrusted;
        window.__accountMotion.dismissal=opening?'trigger-click':'Escape';
        const start=performance.now(),observer=new MutationObserver(()=>snapshot('state'));
        observer.observe(t,{attributes:true,attributeFilter:['aria-expanded']});
        const step=now=>{snapshot('raf');if(now-start<650)requestAnimationFrame(step);
          else{observer.disconnect();window.__accountMotion.done=true;}};
        requestAnimationFrame(step);
      },{once:true,capture:true});
    }""", opening)
    if opening:
        frame_click(page, trigger)
    else:
        # C527 puts the visible menu over the logo corner. Escape is the
        # retained panel's real dismissal path while its trigger is covered.
        page.frame_locator('#frame').locator('.obm-panel [data-obm-item]:visible').first.press('Escape')
    wait_for_expression(page,"document.querySelector('#frame')?.contentWindow.__accountMotion?.done",timeout=15000)
    result = trigger.evaluate('()=>window.__accountMotion')
    assert result['trusted']
    samples = result['samples']
    actual = [f for f in samples if f['phase'] == 'raf']
    assert actual and actual[-1]['hidden'] != opening
    if reduced:
        assert all(f['flights'] == 0 for f in actual), 'reduced motion must not animate the logo points'
        return result
    moving = [f for f in actual if f['travel'] and not f['hidden']]
    assert moving and any(f['flights'] == 3 for f in moving)
    assert all(f['staticPoints'] == 0 for f in moving), 'duplicate resting point icons during flight'
    assert all(f['triggerBackground']=='rgba(0, 0, 0, 0)' and f['triggerShadow']=='none' and
               f['surfaceBackground']=='rgba(0, 0, 0, 0)' and f['surfaceShadow']=='none' and
               f['menuShadow']=='none' and f['logoOpacity']==0 for f in moving)
    edge_samples = ([f for f in samples if not f['hidden'] and f['travel']] if opening else moving)
    # The user specified the three-circle ink as the origin. Its 44px-high
    # accessible hit area stays transparent and is not the morphing surface.
    assert all(f['ink']['count'] == 3 and 0 < f['ink']['h'] <= f['tr']['h'] for f in edge_samples)
    edge = min(edge_samples, key=lambda f:abs(f['surf']['w']-f['ink']['w']))
    assert max(abs(edge['surf'][k]-edge['ink'][k]) for k in ['right','y','w','h']) < 2, (opening,edge)
    assert any(f['surf']['w'] > edge['surf']['w']+20 for f in moving)
    if opening:
        assert edge['menuOpacity'] < .1 and actual[-1]['surfaceShadow']!='none'
    return result


def check_account_origin(context, origin, out):
    reports = []
    for width in (390,1440):
        page=context.new_page()
        try:
            prepare_frame_pointer(page)
            page.goto(f'{origin}/ia?view=qa-lab&screen=onboarding/member-1/email&width={width}')
            frame=page.frame_locator('#frame')
            frame.locator('#r3-veil').wait_for(state='attached',timeout=30000)
            expect(page.locator('#frame')).to_have_js_property('inert',False)
            trigger=frame.locator('[data-order-account-trigger]')
            expect(trigger).to_be_visible()
            opening=motion(page,trigger,True,False)
            panel=frame.locator('.obm-panel')
            row=panel.locator('[data-obm-item="profile"]')
            expect(row).to_be_visible()
            page.evaluate("""()=>{window.__accountAnchor=[];window.addEventListener('message',e=>{
              if(e.origin===location.origin && e.source===document.getElementById('frame').contentWindow &&
                 e.data?.scope==='ORDER_R3_FRAME' && e.data.type==='point')window.__accountAnchor.push(e.data.payload);
            });}""")
            page.locator('#points').click()
            page.locator('#general').click()
            note='패널 안 위치 확인용 미저장 초안'
            page.locator('#body-text').fill(note)
            page.locator('#reposition').click()
            veil=frame.locator('#r3-veil')
            expect(veil).to_be_visible()
            assert panel.evaluate("p=>p.matches(':popover-open')")
            point=row.evaluate("""r=>{const a=r.getBoundingClientRect(),v=document.querySelector('#r3-veil').getBoundingClientRect();
              return {x:a.x+a.width/2-v.x,y:a.y+a.height/2-v.y};}""")
            frame_click(page,veil,position=point)
            expect(page.locator('#point-state')).to_have_text('위치 지정됨')
            anchor=page.evaluate('()=>window.__accountAnchor.at(-1)')
            assert anchor['instance']=='profile' and re.fullmatch(r'a-[a-z0-9]+',anchor['id']) and anchor['layers']
            assert anchor['viewport']['width']==width
            same_hash=frame.locator('#order-single').evaluate("el=>el.__orderResearchInspector.inspect().session.artifact")
            assert anchor['artifactHash']==same_hash
            expect(row).to_be_visible()
            page.screenshot(path=str(Path(out)/f'opened-account-pin-{width}.png'))
            page.locator('#reposition').click()
            expect(veil).to_be_visible()
            veil.press('Escape')
            expect(veil).to_be_hidden()
            expect(page.locator('#body-text')).to_have_value(note)
            assert page.evaluate('()=>window.__accountAnchor.length')==1
            page.locator('#close-drawer').click()
            expect(row).to_be_visible()
            closing=motion(page,trigger,False,False)
            reduced_open=motion(page,trigger,True,True)
            reduced_close=motion(page,trigger,False,True)
            reports.append({'id':'5246a663-3717-4f92-9df5-c4ab740f3fde','width':width,
                            'anchor':anchor,'cancelledDraftRetained':True,'opening':opening,
                            'closing':closing,'reducedOpen':reduced_open,'reducedClose':reduced_close})
        finally:
            page.close()
    return reports
