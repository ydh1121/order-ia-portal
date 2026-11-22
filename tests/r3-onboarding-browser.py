"""Check guest/member onboarding, restored auth origin, editable art and footer in the QA frame."""
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import expect, sync_playwright

from r3_auth_motion_browser import check_auth_motion
from r3_feedback_browser_support import ReviewScreens, frame_click, frame_pointer_position, wait_review_session
from r3_brand_browser_support import ArchivedBrandScreens, check_current_brand_menu

ROOT = Path(__file__).resolve().parents[1]


def current_wordmark_typography(frame):
    """Read today's rendered QA wordmark; immutable archived frames keep their own styles."""
    word = frame.locator("#order-app-header .order-product-brand > .brand-word")
    expect(word).to_be_visible()
    typography = word.evaluate("e=>{const s=getComputedStyle(e);return {fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing};}")
    assert typography["fontFamily"].split(",")[0].strip().strip("\"'") == "Arial Black", typography
    assert typography["fontSize"] == "25px" and typography["fontWeight"] == "900" and typography["lineHeight"] == "25px", typography
    assert typography["letterSpacing"] in ("0px", "normal"), typography
    return typography


def frame_identity(locator):
    """Read the inspector's stable element identity from its actual DOM path."""
    return locator.evaluate("""el=>{
        const root=document.getElementById('order-single'),parts=[];
        const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
        if(!root.contains(el))throw Error('Review target is outside the screen root');
        for(let node=el;node!==root;node=node.parentElement)
            parts.unshift([node.localName,...fields.map(name=>node.getAttribute(name)||'')].join('|'));
        if(!parts.length)return 'screen';
        let hash=2166136261;
        for(const char of 'screen/'+parts.join('/'))hash=Math.imul(hash^char.charCodeAt(0),16777619);
        return 'a-'+(hash>>>0).toString(36);
    }""")


def pick_panel_point(page, frame, target, marker, *, native_popover=False):
    """Use the real QA toolbar and physical pointer, stopping before any save."""
    frame_pointer_position(page, target)
    expected_id = frame_identity(target)
    expected_layer = frame_identity(frame.locator(marker))
    session = wait_review_session(page)
    page.evaluate("""()=>{
        window.__onboardingReviewPoint=null;
        if(window.__onboardingPointProbe)return;
        window.__onboardingPointProbe=true;
        addEventListener('message',event=>{
            const frame=document.getElementById('frame'),m=event.data;
            if(event.source===frame?.contentWindow&&event.origin===(frame.hasAttribute('src')?location.origin:'null')&&
               m?.scope==='ORDER_R3_FRAME'&&m.type==='point'&&
               m.artifact===frame.dataset.testReadyHash)
                window.__onboardingReviewPoint=m;
        });
    }""")
    page.locator('#new').click()
    veil = frame.locator('#r3-veil')
    expect(veil).to_be_visible()
    expect(target).to_be_visible()
    if native_popover:
        expect(frame.locator('#r3-veil:popover-open')).to_have_count(1)
        expect(frame.locator('.obm-panel:popover-open')).to_have_count(1)
    # Opening the outer toolbar can move its viewport. Read the target again
    # after it has opened; frame_click maps this child point to the live canvas.
    point = target.evaluate("el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}")
    frame_click(page, veil, position=point)
    page.wait_for_function('window.__onboardingReviewPoint!==null')
    envelope = page.evaluate('window.__onboardingReviewPoint')
    anchor = envelope['payload']
    assert anchor['id'] == expected_id and anchor['id'] != 'screen', anchor
    assert anchor['instance'] == session['screen'], anchor
    assert expected_layer in anchor['layers'], anchor
    expect(page.locator('#point-state')).to_have_text('위치 지정됨')
    expect(page.locator('#body-text')).to_have_value('')
    page.locator('#close-drawer').click()
    expect(veil).to_be_hidden()
    return envelope


def restore_panel_point(page, envelope):
    # The original source must be selected first. Refresh only the transport
    # channel after the app's route acknowledgement; keep the source/anchor exact.
    session=wait_review_session(page)
    assert session['artifact']==envelope['artifact'] and session['screen']==envelope['payload']['instance']
    page.evaluate("""arg=>document.getElementById('frame').contentWindow.postMessage({
        scope:'ORDER_R3_HOST',channel:arg.channel,artifact:arg.envelope.artifact,type:'restore',payload:arg.envelope.payload
    },location.origin)""", {"channel":session['channel'],"envelope":envelope})


def check_auth_overlay(page, frame):
    url, digest = page.url, page.locator('#frame').get_attribute('data-test-ready-hash')
    frame.locator('#order-single').evaluate("""root=>{
        window.__introOverlayBaseline={root,document:window.__qaPointerDocument,
            main:root.querySelector('.ob-main'),stage:root.querySelector('.ob-stage'),
            brand:root.querySelector('#order-app-header .order-product-brand svg')};
    }""")

    def unchanged():
        if overlay.count():
            wait_review_session(page,overlay.get_attribute('data-auth-screen'),overlay.get_attribute('data-auth-state'))
            assert parse_qs(urlsplit(page.url).query)['view']==['qa-lab']
        else:
            wait_review_session(page,'onboarding','guest-2')
            assert page.url == url
            expect(page.locator('#frame')).to_have_attribute('data-test-ready-hash', digest)
            expect(page.locator('#state-buttons [data-state="guest-2"]')).to_have_class('active')
        expect(frame.locator('.ob.guest')).to_have_attribute('data-intro-step', '2')
        assert frame.locator('#order-single').evaluate("""root=>{
            const before=window.__introOverlayBaseline;
            return before.document===window.__qaPointerDocument&&root===before.root&&
                root.querySelector('.ob-main')===before.main&&root.querySelector('.ob-stage')===before.stage&&
                root.querySelector('#order-app-header .order-product-brand svg')===before.brand;
        }"""), 'Opening or closing auth must retain the introduction document, slide and brand'

    overlay = frame.locator('[data-product-auth-sheet]')
    frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
    expect(overlay).to_be_visible()
    expect(overlay).to_have_attribute('data-auth-screen', 'login')
    expect(overlay).to_have_attribute('data-auth-state', 'empty')
    expect(overlay).to_have_attribute('data-auth-variant', 'compact')
    expect(frame.locator('.ob.guest')).to_have_js_property('inert', True)
    expect(overlay.locator('.auth-background')).to_have_count(0)
    unchanged()
    for name in ('카카오 로그인', '네이버 로그인', 'Google 로그인'):
        expect(overlay.get_by_role('button', name=name).locator('img')).to_be_visible()
    expect(overlay.locator('[data-action="close-sheet"]')).to_have_count(0)
    email = overlay.locator('[name=email]')
    envelope = pick_panel_point(page, frame, email, '#r3-panel-state-auth-login-empty')
    expect(email).to_have_value('')
    email.press('Escape')
    expect(overlay).to_have_count(0)
    unchanged()
    frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
    restore_panel_point(page, envelope)
    expect(email).to_be_focused()
    assert frame_identity(email) == envelope['payload']['id']
    unchanged()
    email.press('Escape')
    expect(overlay).to_have_count(0)

    frame_click(page, frame.get_by_role('button', name='회원가입', exact=True))
    expect(overlay).to_have_attribute('data-auth-screen', 'signup')
    frame_click(page, overlay.locator('.sheet-dim'), position={'x':12,'y':8})
    expect(overlay).to_have_count(0)
    unchanged()

    frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
    sheet, grip = overlay.locator('.auth-sheet'), overlay.locator('.sheet-handle')
    x, y = frame_pointer_position(page, grip)
    travel = sheet.evaluate('el=>Math.max(120,el.getBoundingClientRect().height)*.5+12')
    scale = page.locator('#frame').evaluate('el=>el.getBoundingClientRect().height/el.offsetHeight')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + travel * scale, steps=12)
    page.mouse.up()
    expect(overlay).to_have_count(0)
    unchanged()
    expect(frame.locator('.ob.guest')).to_have_js_property('inert', False)
    print('PASS canonical auth overlay: original slide/DOM retained, acknowledged auth route and exact source return, real provider assets, inner QA pin and restore, Escape/scrim/drag close')


def check_auth_overlay_motion(page, origin, width):
    """Observe each rendered entrance frame without pausing or replacing its motion."""
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen('onboarding', 'guest-1')
    root = frame.locator('#order-single')
    digest = page.locator('#frame').get_attribute('data-test-ready-hash')
    url = page.url
    out = ROOT / 'artifacts' / 'r3-auth-motion'
    out.mkdir(parents=True, exist_ok=True)
    for screen, label in (('login', '로그인'), ('signup', '회원가입')):
        opener = frame.get_by_role('button', name=label, exact=True)
        opener.evaluate("""el=>{
            const root=document.getElementById('order-single');
            const before={document,root,main:root.querySelector('.ob-main'),
                stage:root.querySelector('.ob-stage'),brand:root.querySelector('#order-app-header .order-product-brand svg')};
            window.__authOverlayMotion={done:false,trusted:false,samples:[],seenAnimations:0};
            el.addEventListener('click',event=>{
                const receipt=window.__authOverlayMotion,start=performance.now(),animations=new Set();
                receipt.trusted=event.isTrusted;
                let originalSheet=null;
                function sample(phase){
                    const sheet=root.querySelector('.product-auth-sheet .auth-sheet');
                    if(sheet&&!originalSheet)originalSheet=sheet;
                    const style=sheet&&getComputedStyle(sheet),rect=sheet?.getBoundingClientRect();
                    const active=sheet?[...sheet.getAnimations()].map(animation=>{
                        animations.add(animation);
                        return {kind:animation.constructor.name,property:animation.transitionProperty||null,
                            state:animation.playState,pending:animation.pending,
                            transform:animation.effect.getKeyframes().some(key=>'transform' in key)};
                    }):[];
                    receipt.samples.push({phase,elapsed:performance.now()-start,present:Boolean(sheet),
                        count:root.querySelectorAll('.product-auth-sheet .auth-sheet').length,
                        sameSheet:sheet===originalSheet,
                        sameIntro:before.document===document&&before.root===document.getElementById('order-single')&&
                            before.main===root.querySelector('.ob-main')&&before.stage===root.querySelector('.ob-stage')&&
                            before.brand===root.querySelector('#order-app-header .order-product-brand svg'),
                        rect:rect?{top:rect.top,bottom:rect.bottom,left:rect.left,width:rect.width,height:rect.height}:null,
                        opacity:style?Number(style.opacity):null,display:style?.display,visibility:style?.visibility,
                        transition:style?.transitionProperty,transform:style?.transform,
                        focused:Boolean(sheet?.contains(document.activeElement)),viewport:innerHeight,active});
                    receipt.seenAnimations=animations.size;
                    if(performance.now()-start>=720){receipt.done=true;return;}
                    requestAnimationFrame(()=>sample('frame'));
                }
                // Capture schedules the next rendered frame; the click's bubble
                // handlers can finish canonical mount and focus without a probe
                // microtask interleaving between individual event listeners.
                requestAnimationFrame(()=>sample('frame'));
            },{capture:true,once:true});
        }""")
        frame_click(page, opener)
        receipt = root.evaluate("""()=>new Promise((resolve,reject)=>{
            const start=performance.now();
            function wait(){
                if(window.__authOverlayMotion?.done)return resolve(window.__authOverlayMotion);
                if(performance.now()-start>3000)return reject(Error('auth entrance frame trace did not finish'));
                requestAnimationFrame(wait);
            }
            wait();
        })""")
        receipt.update({'width':width,'screen':screen,'artifactHash':digest,
                        'source':'private QA browser fixture; trusted physical opener; unmodified normal motion'})
        trace = out / f'auth-overlay-{screen}-{width}.json'
        trace.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        samples = receipt['samples']
        assert receipt['trusted'] and len(samples) >= 6, str(trace)
        assert all(sample['present'] and sample['count'] == 1 and sample['sameSheet'] and sample['sameIntro']
                   for sample in samples), str(trace)
        assert all(sample['opacity'] == 1 and sample['display'] != 'none' and sample['visibility'] == 'visible'
                   and sample['transition'] == 'none' for sample in samples), str(trace)
        assert receipt['seenAnimations'] == 1, str(trace)
        assert any(any(animation['transform'] and animation['state'] == 'running' for animation in sample['active'])
                   for sample in samples), str(trace)
        assert all(not any(animation['kind'] == 'CSSTransition' for animation in sample['active']) and
                   sum(animation['transform'] and animation['state'] == 'running' for animation in sample['active']) <= 1
                   for sample in samples), str(trace)
        rects = [sample['rect'] for sample in samples]
        assert max(rect['top'] for rect in rects) - rects[-1]['top'] > 30, str(trace)
        assert any(rects[-1]['top'] + 2 < rect['top'] < rects[0]['top'] - 2 for rect in rects), str(trace)
        assert all(current['top'] <= previous['top'] + .75 for previous,current in zip(rects,rects[1:])), str(trace)
        for dimension in ('left','width','height'):
            assert max(rect[dimension] for rect in rects) - min(rect[dimension] for rect in rects) <= 1, (dimension,str(trace))
        assert abs(rects[-1]['bottom'] - samples[-1]['viewport']) <= 1, str(trace)
        assert all(abs(rect['top'] - rects[-1]['top']) <= 1 for rect in rects[-3:]), str(trace)
        assert samples[-1]['focused'], str(trace)
        overlay = frame.locator('[data-product-auth-sheet]')
        expect(overlay).to_have_attribute('data-auth-screen', screen)
        root.evaluate('''root=>{
            const holder=root.querySelector('[data-product-auth-sheet]'),dim=holder.querySelector('.sheet-dim');
            const record=window.__authBackdropExit={done:false,closeAt:null,trusted:false,samples:[]},start=performance.now();
            const controller=new AbortController();let missingAt=null;
            for(const type of ['keydown','pointerup'])holder.addEventListener(type,event=>{
                if(event.type==='keydown'&&event.key!=='Escape')return;
                if(record.closeAt===null){record.closeAt=performance.now()-start;record.trusted=event.isTrusted;}
            },{capture:true,signal:controller.signal});
            function sample(){
                const current=root.querySelector('[data-product-auth-sheet]'),shade=current?.querySelector('.sheet-dim'),sheet=current?.querySelector('.auth-sheet');
                const style=shade&&getComputedStyle(shade),box=shade?.getBoundingClientRect(),now=performance.now()-start;
                record.samples.push({t:now,holder:current===holder,present:Boolean(shade),sameDim:shade===dim,
                    count:root.querySelectorAll('[data-product-auth-sheet] .sheet-dim').length,
                    sheetPresent:Boolean(sheet),opacity:style?Number(style.opacity):null,hidden:shade?.hidden??true,
                    display:style?.display||null,rect:box?{left:box.left,top:box.top,width:box.width,height:box.height}:null,
                    viewport:{width:innerWidth,height:innerHeight},
                    opacityOwners:shade?[...shade.getAnimations()].filter(a=>a.playState==='running'&&a.effect.getKeyframes().some(k=>'opacity'in k)).length:0});
                if(!current&&missingAt===null)missingAt=now;
                if(missingAt!==null&&now-missingAt>100||now>3000){controller.abort();record.done=true;return;}
                requestAnimationFrame(sample);
            }requestAnimationFrame(sample);
        }''')
        if screen == 'login':
            overlay.locator('[name=email]').press('Escape')
        else:
            sheet, grip = overlay.locator('.auth-sheet'), overlay.locator('.sheet-handle')
            x, y = frame_pointer_position(page, grip)
            travel = sheet.evaluate('el=>Math.max(120,el.getBoundingClientRect().height)*.5+12')
            scale = page.locator('#frame').evaluate('el=>el.getBoundingClientRect().height/el.offsetHeight')
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + travel * scale, steps=12)
            page.mouse.up()
        backdrop = root.evaluate('''async()=>{while(!window.__authBackdropExit.done)await new Promise(requestAnimationFrame);return window.__authBackdropExit;}''')
        backdrop.update({'width':width,'screen':screen,'artifactHash':digest,'source':'canonical deployed artifact with trusted Escape/drag; RAF observes live dim and sheet'})
        dim_trace = out / f'auth-backdrop-exit-{screen}-{width}.json'
        dim_trace.write_text(json.dumps(backdrop,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        assert backdrop['trusted'] and backdrop['closeAt'] is not None, str(dim_trace)
        closing = [s for s in backdrop['samples'] if s['t'] >= backdrop['closeAt']]
        painted = [s for s in closing if s['present'] and not s['hidden'] and s['display'] != 'none']
        assert len(painted) >= 3 and any(not s['present'] for s in closing), str(dim_trace)
        assert all(s['count'] <= 1 and (not s['present'] or s['sameDim'] and s['holder']) and s['opacityOwners'] <= 1 for s in closing), str(dim_trace)
        assert any(s['sheetPresent'] and s['opacity'] <= .02 for s in painted), str(dim_trace)
        assert all(current['opacity'] <= previous['opacity'] + .02 for previous,current in zip(painted,painted[1:])), str(dim_trace)
        for sample in painted:
            box, viewport = sample['rect'], sample['viewport']
            assert abs(box['left']) <= 1 and abs(box['top']) <= 1 and abs(box['width']-viewport['width']) <= 1 and abs(box['height']-viewport['height']) <= 1, str(dim_trace)
        expect(overlay).to_have_count(0)
        expect(opener).to_be_focused()
        expect(frame.locator('.ob.guest')).to_have_js_property('inert', False)
        expect(frame.locator('.ob.guest')).to_have_attribute('data-intro-step', '1')
        expect(page.locator('#frame')).to_have_attribute('data-test-ready-hash', digest)
        assert page.url == url
    print('PASS auth entrance and backdrop RAF: one stable canonical sheet and dim, monotonic opacity through the complete exit, preserved focus and normal-motion Escape/drag close')


def check_auth_overlay_internal_transition(page, origin, width):
    """Use trusted activation and RAF to check both settled and interrupted login→signup."""
    out = ROOT / 'artifacts' / 'r3-auth-motion'
    out.mkdir(parents=True, exist_ok=True)
    git_head, git_tree = subprocess.check_output(
        ['git', 'rev-parse', 'HEAD', 'HEAD^{tree}'], cwd=ROOT, text=True).splitlines()
    source_hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in (
        'src/server/product-auth-sheet.mjs', 'scripts/r3/authored/account.js',
        'src/server/r3-common-motion.mjs', 'src/server/product-ui/runtime.gen.mjs',
        'src/server/product-ui/catalog.gen.mjs')}
    for interrupted in (False, True):
        case = 'interrupted' if interrupted else 'settled'
        report = {'case': case, 'width': width, 'gitHead': git_head, 'gitTree': git_tree,
                  'sourceHashes': source_hashes, 'result': 'UNVERIFIED', 'errors': [],
                  'scope': 'canonical product auth in loopback QA fixture; no business writes'}
        errors = report['errors']
        on_error = lambda error: errors.append(str(error))
        page.on('pageerror', on_error)
        root, probe_started = None, False
        try:
            screens = ReviewScreens(page, origin, width)
            frame = screens.screen('onboarding', 'guest-1')
            root = frame.locator('#order-single')
            report['artifactHash'] = page.locator('#frame').get_attribute('data-test-ready-hash')
            page_url = page.url
            root.evaluate('''root=>{
                const receipt={samples:[],entryTrusted:null,transition:null},started=performance.now();
                const before={document,root,main:root.querySelector('.ob-main'),stage:root.querySelector('.ob-stage')};
                let holder=null,dim=null,scene=null,raf=0,stopped=false,nextAnimation=1;
                const animations=new WeakMap();
                const read=phase=>{
                    const current=root.querySelector('[data-product-auth-sheet]'),shade=current?.querySelector('.sheet-dim');
                    if(!shade)return null;
                    if(!dim){holder=current;dim=shade;scene=current.querySelector('.auth-scene');}
                    return {phase,t:performance.now()-started,screen:current.dataset.authScreen,
                        sameHolder:current===holder,sameDim:shade===dim,sameScene:current.querySelector('.auth-scene')===scene,
                        count:root.querySelectorAll('[data-product-auth-sheet] .sheet-dim').length,
                        sceneCount:current.querySelectorAll(':scope>.auth-scene').length,
                        opacity:Number(getComputedStyle(shade).opacity),hidden:shade.hidden,
                        animations:shade.getAnimations().map(animation=>{
                            if(!animations.has(animation))animations.set(animation,nextAnimation++);
                            return {id:animations.get(animation),startTime:animation.startTime,
                                currentTime:animation.currentTime,playState:animation.playState};
                        }),sameIntroduction:document===before.document&&root===before.root&&
                            root.querySelector('.ob-main')===before.main&&root.querySelector('.ob-stage')===before.stage};
                };
                const sample=phase=>{const row=read(phase);if(row)receipt.samples.push(row);return row;};
                const click=event=>{
                    const target=event.target.closest('button');
                    if(!root.querySelector('[data-product-auth-sheet]')&&target?.textContent.trim()==='로그인'){
                        receipt.entryTrusted=event.isTrusted;queueMicrotask(()=>sample('entry'));
                    }
                    if(target?.dataset.action!=='signup'||receipt.transition)return;
                    receipt.transition={action:target.dataset.action,trusted:event.isTrusted,before:sample('transition-before')};
                    queueMicrotask(()=>{receipt.transition.microtask=sample('transition-microtask');});
                };
                root.addEventListener('click',click,true);
                const tick=()=>{
                    if(stopped)return;
                    const row=sample('raf'),transition=receipt.transition;
                    // A capture listener's microtask can precede the product click handler.
                    // Bind the completed scene observation to this activation's first signup RAF.
                    if(transition&&!transition.after&&transition.before?.screen==='login'&&
                        row?.screen==='signup'&&row.t>=transition.before.t)transition.after=row;
                    raf=requestAnimationFrame(tick);
                };
                raf=requestAnimationFrame(tick);
                window.__authInternalProbe={receipt,read,finish(){stopped=true;cancelAnimationFrame(raf);
                    root.removeEventListener('click',click,true);sample('final');return receipt;}};
            }''')
            probe_started = True
            frame_click(page, frame.get_by_role('button', name='로그인', exact=True))
            root.evaluate('''async(root,interrupted)=>{
                const start=performance.now();
                while(performance.now()-start<2000){
                    const state=window.__authInternalProbe.read('ready');
                    if(state&&(interrupted?state.opacity>.05&&state.opacity<.90&&state.animations.some(a=>a.playState==='running'):
                        state.opacity>=.999&&!state.animations.some(a=>a.playState==='running')))return;
                    await new Promise(requestAnimationFrame);
                }
                throw Error(interrupted?'Missed live backdrop entrance window':'Backdrop entrance did not settle');
            }''', interrupted)
            # Keyboard activation is trusted and does not wait for a moving sheet to become stable.
            frame.locator('[data-product-auth-sheet] [data-action="signup"]').press('Enter')
            root.evaluate('''async()=>{
                const start=performance.now();
                while(performance.now()-start<2000){
                    const probe=window.__authInternalProbe,row=probe.read('wait'),transition=probe.receipt.transition;
                    if(transition?.after&&row?.screen==='signup'&&row.opacity>=.999&&
                        row.t-transition.after.t>=180&&!row.animations.some(a=>a.playState==='running'))return;
                    await new Promise(requestAnimationFrame);
                }
                throw Error('Internal signup transition did not settle');
            }''')
            report.update(root.evaluate('()=>window.__authInternalProbe.finish()'))
            probe_started = False
            samples, transition = report['samples'], report['transition']
            assert report['entryTrusted'] is True and transition and transition['trusted'] is True, report
            assert transition['action'] == 'signup' and transition.get('microtask'), transition
            assert len([row for row in samples if row['phase'] == 'raf']) >= 8, report
            assert all(row['sameHolder'] and row['sameDim'] and row['count'] == 1 and
                       row['sceneCount'] == 1 and row['sameIntroduction'] and not row['hidden'] for row in samples), report
            before, after = transition['before'], transition['after']
            assert after['phase'] == 'raf' and after['t'] >= before['t'], transition
            assert before['screen'] == 'login' and after['screen'] == 'signup', transition
            assert before['sameScene'] and not after['sameScene'], transition
            assert all(b['opacity'] >= a['opacity'] - .02 for a, b in zip(samples, samples[1:])), report
            assert samples[-1]['opacity'] >= .999 and samples[-1]['screen'] == 'signup', report
            animation_ids = {animation['id'] for row in samples for animation in row['animations']}
            assert len(animation_ids) == 1, ('Backdrop animation was replaced or restarted', report)
            if interrupted:
                assert .01 < before['opacity'] < .99, ('Transition did not interrupt entrance', transition)
                running = {animation['id']: animation for animation in before['animations'] if animation['playState'] == 'running'}
                continued = {animation['id']: animation for animation in after['animations']}
                assert running and running.keys() <= continued.keys(), transition
                for identity, animation in running.items():
                    current = continued[identity]
                    assert current['startTime'] == animation['startTime'], transition
                    assert animation['currentTime'] is not None and current['currentTime'] >= animation['currentTime'], transition
            else:
                assert abs(after['opacity'] - before['opacity']) <= .02, transition
            session=wait_review_session(page,'signup','empty')
            assert parse_qs(urlsplit(page.url).query)['view']==['qa-lab']
            assert session['artifact']!=report['artifactHash'], 'The auth route needs its own inspection identity'
            report['signupArtifactHash']=session['artifact']
            assert not errors, errors
            report['result'] = 'PASS'
        except Exception as error:
            report['result'] = 'FAIL'
            report['failure'] = str(error)
            raise
        finally:
            if probe_started:
                try:
                    report.update(root.evaluate('()=>window.__authInternalProbe.finish()'))
                except Exception as error:
                    report['probeReadError'] = str(error)
            page.remove_listener('pageerror', on_error)
            (out / f'auth-overlay-internal-{case}-{width}.json').write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('PASS auth login→signup RAF: trusted settled/interrupted transitions retain one backdrop and its animation timeline')


def drag_intro(page, frame, *, forward, expected_step):
    title = frame.locator('.ob-copy h1')
    size = title.evaluate('el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})')
    left = {'x':size['width']*.15,'y':size['height']/2}
    right = {'x':size['width']*.85,'y':size['height']/2}
    start = frame_pointer_position(page, title, right if forward else left)
    end = frame_pointer_position(page, title, left if forward else right)
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=12)
    page.mouse.up()
    expect(frame.locator('.ob.guest')).to_have_attribute('data-intro-step', str(expected_step))
    assert frame.locator('#order-single').evaluate("""root=>
        window.__introOverlayBaseline.document===window.__qaPointerDocument&&
        window.__introOverlayBaseline.brand===root.querySelector('#order-app-header .order-product-brand svg')""")


def check_notification_pin(page, screens):
    frame = screens.screen('onboarding', 'member-1')
    typography = current_wordmark_typography(frame)
    bell, panel = frame.locator('[data-action=quick]'), frame.locator('.obm-panel')
    expect(bell).to_be_enabled()
    expect(frame.locator('.ob-quick>button')).to_have_count(1)
    expect(frame.locator('[data-product-gooey]')).to_have_count(1)
    expect(frame.locator('.pm-gooey-trigger')).to_have_count(1)
    expect(frame.locator('.pm-gooey-label')).to_have_count(0)
    actions=frame.locator('.pm-gooey-action')
    expect(actions).to_have_count(2)
    assert actions.evaluate_all('(els)=>els.map(el=>el.getAttribute("aria-label"))')==['오더 패스','시세 알림']
    assert actions.evaluate_all('(els)=>els.every(el=>!el.innerText.trim()&&el.querySelector("svg"))')
    expect(actions.nth(1).locator('.ob-market-notice-icon path[data-currency="KRW"][d="M8 9l2 7 2-5 2 5 2-7M7.5 11.5h9M8 14h8"]')).to_have_count(1)
    bell.evaluate('el=>window.__gooeyOriginalBell=el')
    unread=bell.locator('.quick-unread').text_content()
    frame_click(page, bell)
    expect(bell).to_have_attribute('aria-expanded','true')
    expect(panel).to_be_hidden()
    expect(actions.nth(0)).to_have_css('transform','matrix(1, 0, 0, 1, -82, -20)')
    expect(actions.nth(1)).to_have_css('transform','matrix(1, 0, 0, 1, -22, -82)')
    geometry=bell.evaluate('''el=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
      return {width:innerWidth,bell:rect(el),actions:[...el.parentElement.querySelectorAll('.pm-gooey-action')].map(n=>({...rect(n),label:n.getAttribute('aria-label'),text:n.innerText}))};
    }''')
    for action,expected in zip(geometry['actions'],[(-82,-20),(-22,-82)]):
        assert action['width']==44 and action['height']==44,geometry
        assert abs(action['cx']-geometry['bell']['cx']-expected[0])<.1,geometry
        assert abs(action['cy']-geometry['bell']['cy']-expected[1])<.1,geometry
        assert 0<=action['x'] and action['x']+action['width']<=geometry['width'],geometry
    out=ROOT/'artifacts/motion21/gooey-product'
    out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/f'gooey-open-{geometry["width"]}.png'))
    (out/f'gooey-geometry-{geometry["width"]}.json').write_text(json.dumps(geometry,ensure_ascii=False,indent=2)+'\n')
    frame_click(page,actions.nth(0))
    expect(panel).to_be_visible()
    pass_panel=panel.locator('[data-obm-page="manage.research.passes.grid"]')
    expect(pass_panel.locator('.obm-heading')).to_have_text('오더 패스')
    expect(pass_panel.locator('.research-scene-panel')).to_have_attribute('data-research-scene-connection','connected')
    expect(pass_panel.locator('.pass-stage [data-pass-id]').first).to_be_visible()
    expect(pass_panel.locator('[data-open-quote-draft]')).to_have_count(0)
    wait_review_session(page,'passes','grid')
    frame_click(page,pass_panel.locator('[data-view="deck"]'))
    expect(pass_panel.locator('[data-view="deck"]')).to_have_attribute('aria-pressed','true')
    frame_click(page,pass_panel.locator('[data-action="deck-next"]'))
    expect(pass_panel.locator('.deck-position')).to_have_text('2 / 4')
    expect(bell).to_have_attribute('aria-expanded','false')
    expect(panel.locator('[data-product-gooey]')).to_have_count(0)
    expect(frame.locator('[data-product-gooey]')).to_have_count(1)
    panel.locator('.obm-heading').press('Escape')
    expect(panel).to_be_hidden()
    wait_review_session(page,'onboarding','member-1')
    expect(bell).to_be_visible()
    assert bell.evaluate('el=>el===window.__gooeyOriginalBell')
    assert bell.locator('.quick-unread').text_content()==unread
    frame_click(page,bell)
    frame_click(page,actions.nth(1))
    expect(panel).to_be_visible()
    read = panel.get_by_role('button', name='읽음', exact=True)
    expect(read).to_be_visible()
    snapshot = frame.locator('#order-single').evaluate('()=>window.ORDER_APP_ADAPTER.fixture.inspect()')
    envelope = pick_panel_point(page, frame, read, '#r3-panel-state-account-notifications', native_popover=True)
    after = frame.locator('#order-single').evaluate('()=>window.ORDER_APP_ADAPTER.fixture.inspect()')
    assert after['data']['notifications'] == snapshot['data']['notifications'], 'Selecting the read-button location must not activate it'
    assert not any(call['method'] == 'POST' for call in after['calls']), after['calls']
    panel.locator('.obm-heading').press('Escape')
    expect(panel).to_be_hidden()
    wait_review_session(page,'onboarding','member-1')
    frame_click(page,bell)
    frame_click(page,actions.nth(1))
    restore_panel_point(page, envelope)
    expect(read).to_be_focused()
    assert frame_identity(read) == envelope['payload']['id']
    panel.locator('.obm-heading').press('Escape')
    expect(panel).to_be_hidden()
    print('PASS existing bell: only two radial icons, real Order Pass and notification panels, pin restore and zero mutation')
    return typography


def check_archived_entry(page, origin):
    old_hash = "bf83c284c019ab7306cb6ca2c75f7344e50e3dae825b414f26d776b02c5de68c"
    # The private release has an existing 320px email review anchor on this exact document.
    query = {"view":"qa-lab","screen":"login/empty/email","width":320,
             "version":"recorded","artifactHash":old_hash}
    page.goto(origin + "/ia?" + urlencode(query))
    frame = page.frame_locator("#frame")
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(page.locator("#version")).to_have_value("prior-r3")
    expect(page.locator("#version-mark")).to_have_text("이전 R3 검토판")
    for selector in ("#new","#general","#link-figma"):
        expect(page.locator(selector)).to_be_disabled()
    assert len(frame.locator('[data-action^="social-"] img').all()) == 0
    assert parse_qs(urlsplit(page.url).query)["artifactHash"] == [old_hash]
    page.reload()
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(page.locator("#version")).to_have_value("prior-r3")
    query.pop("version"); query.pop("artifactHash")
    page.goto(origin + "/ia?" + urlencode(query))
    frame.locator("#r3-veil").wait_for(state="attached")
    expect(frame.locator('[data-action^="social-"] img')).to_have_count(3)
    expect(page.locator("#version")).to_have_value("current")
    print("PASS retained 320px prior email review, exact hash and reload; today's same email frame contains three native provider assets")


def check_direct_company_state(page, screens, width):
    # Choosing the company state directly must carry the same guest identity as
    # its authored header, rather than moving an authenticated mark into signup.
    frame = screens.screen('onboarding', 'company')
    expect(frame.locator('.ob.guest.footer-open')).to_be_visible()
    modal = frame.get_by_role('dialog', name='사업자 정보')
    expect(modal).to_be_visible()
    expect(frame.locator('.ob-stage')).to_have_js_property('inert', True)
    expect(frame.locator('#order-app-header .obm-brand')).to_have_attribute('data-authenticated', 'false')
    geometry = frame.locator('#order-app-header').evaluate("""async header=>{
        await document.fonts.ready;
        const rect=selector=>{const r=header.querySelector(selector).getBoundingClientRect();
            return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {authenticated:window.ORDER_APP_ADAPTER.fixture.inspect().controls.authenticated,
            word:rect('.brand-word'),mark:rect('.obm-trigger svg'),signup:rect('[data-app-auth]')};
    }""")
    assert geometry['authenticated'] is False, geometry
    assert all(geometry[key]['width'] > 0 and geometry[key]['height'] > 0 for key in ('word', 'mark', 'signup')), geometry
    assert max(geometry['word']['right'], geometry['mark']['right']) < geometry['signup']['left'], geometry
    out = ROOT / 'artifacts' / 'qa-mvp'
    out.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(out / f'company-direct-{width}.png'))
    modal.locator('[data-company-close]').press('Escape')
    expect(modal).to_be_hidden()
    expect(frame.locator('.ob-stage')).to_have_js_property('inert', False)
    expect(frame.locator('#order-app-header .obm-brand')).to_have_attribute('data-authenticated', 'false')
    return geometry


def check(page, origin, width):
    review_writes = []
    def record_write(request):
        if '/r3-qa/records' in request.url and request.method not in ('GET','HEAD'):
            review_writes.append({'method':request.method,'url':request.url})
    page.on('request', record_write)
    screens = ReviewScreens(page, origin, width)
    frame = screens.screen("onboarding", "guest-2")
    guest_typography = current_wordmark_typography(frame)
    illustration = frame.locator(".ob-art")
    expect(illustration).to_have_js_property("naturalWidth", 287)
    expect(frame.get_by_role("button",name="회원가입")).to_be_visible()
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","2")

    check_auth_overlay(page, frame)
    drag_intro(page, frame, forward=False, expected_step=1)
    drag_intro(page, frame, forward=True, expected_step=2)
    frame_click(page, frame.get_by_role("button",name="소개 3페이지"))
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","3")
    expect(frame.locator(".ob-art")).to_have_count(0)
    frame.locator(".ob-main").press("ArrowRight")
    expect(frame.locator(".ob.guest")).to_have_attribute("data-intro-step","4")
    expect(frame.locator(".ob-pages [aria-current]")).to_have_attribute("data-mf-intro","4")
    box = frame.locator(".ob-mode-grid button").first.bounding_box()
    assert box and abs(box["width"]-box["height"]) < 1.1, box
    company_geometry = check_direct_company_state(page, screens, width)

    # Keep the old quick-menu and sample notification behavior tied to its
    # immutable source. The current account menu is checked on a real document.
    archived = ArchivedBrandScreens(page, origin, width)
    frame = archived.screen("onboarding", "member-1")
    frame_click(page, frame.get_by_role("button",name="알림과 빠른 메뉴"))
    expect(frame.get_by_role("button",name="오더패스")).to_be_visible()
    frame.get_by_role("button",name="알림과 빠른 메뉴").press("Escape")
    expect(frame.get_by_role("button",name="오더패스")).to_be_hidden()
    profile = archived.screen("profile", "notification")
    archived.notices()
    for label in ("소식", "혜택"):
        toggle = profile.get_by_role("switch",name=label)
        old = toggle.get_attribute("aria-checked")
        frame_click(page, toggle)
        expect(toggle).to_have_attribute("aria-checked","false" if old=="true" else "true")
    expect(profile.locator(".terms-reading")).to_have_count(0)

    check_current_brand_menu(page, origin, "onboarding", "member-1")
    screens = ReviewScreens(page, origin, width)
    member_typography = check_notification_pin(page, screens)

    frame = screens.screen("onboarding", "member-4")
    expect(frame.locator(".ob-pages")).to_have_count(0)
    expect(frame.locator(".ob-tasks button")).to_have_count(0)
    expect(frame.locator(".ob-mode-grid button")).to_have_count(2)

    frame_click(page, frame.get_by_role("button",name="사업자 정보",exact=True))
    modal = frame.get_by_role("dialog",name="사업자 정보")
    expect(modal).to_be_visible()
    expect(frame.locator(".ob-stage")).to_have_js_property("inert",True)
    expect(modal.get_by_text("Cloudflare")).to_be_visible()
    frame_click(page, modal.get_by_role("button",name="배송·취소·환불"))
    expect(modal.get_by_role("button",name="문의하기")).to_be_visible()
    modal.get_by_role("button",name="문의하기").press("Escape")
    expect(modal).to_be_hidden()
    expect(frame.get_by_role("button",name="사업자 정보",exact=True)).to_be_focused()
    # The real onboarding CTA enters the same staging app. The regular original
    # remains a separate explicit comparison link, never the working journey.
    frame.locator('#order-single').evaluate("root=>window.__quoteEntry={root,header:document.getElementById('order-app-header'),app:window.ORDER_RESEARCH_APP,document}")
    windows=len(page.context.pages)
    navigations=[]
    on_navigation=lambda request: navigations.append(request.url) if request.is_navigation_request() and request.resource_type=='document' else None
    page.on('request',on_navigation)
    try:
        frame_click(page,frame.get_by_role('button',name='상세 견적',exact=True))
        wait_review_session(page,'q1')
        frame.locator('#order-app-quote').wait_for(state='visible')
        assert frame.locator('#order-single').evaluate("""root=>{
            const before=window.__quoteEntry,route=window.ORDER_RESEARCH_APP.snapshot().route;
            return before.root===root&&before.header===document.getElementById('order-app-header')&&
                before.app===window.ORDER_RESEARCH_APP&&before.document===document&&route.mode==='detailed';
        }"""), 'The detailed CTA must retain one app, header and document'
        assert len(page.context.pages)==windows and not navigations,navigations
    finally:
        page.remove_listener('request',on_navigation)
    target_url = urlsplit(page.url)
    assert target_url.netloc == urlsplit(origin).netloc and target_url.path == "/ia"
    assert parse_qs(target_url.query)['view'] == ['qa-lab']
    page.remove_listener('request', record_write)
    assert not review_writes, review_writes
    print(json.dumps({"width":width,"originalArtWidth":287,"authReturn":"guest-2","memberProduct":"same staging app / detailed quote",
                      "oldQuickMenu":"exact brand-history replay","currentBrand":"authenticated three-root menu",
                      "authOverlay":"same introduction, Escape/scrim/drag close","horizontalDrag":"2→1→2",
                      "wordTypography":{"guest":guest_typography,"member":member_typography},
                      "directCompanyHeader":company_geometry,
                      "panelPins":"auth email + real notification read button; restore without comment save","reviewWrites":0}))


def main():
    host=subprocess.Popen(["node","tests/r3-browser-host.mjs"],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        fixture=json.loads(host.stdout.readline())
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get("R3_BROWSER_BINARY") or shutil.which("chromium"))
            focused_auth = os.environ.get('R3_AUTH_TRANSITION_ONLY') == '1'
            for width in ((390,) if focused_auth else (320,375,390,1440)):
                context=browser.new_context(viewport={"width":width,"height":844},reduced_motion="reduce")
                page=context.new_page()
                page.goto(fixture["url"]+"/ia?view=qa-lab&screen=login%2Fempty%2Femail")
                page.locator("input[name=email]").fill(fixture["email"])
                page.locator("input[name=password]").fill(fixture["pass"])
                page.locator("button[type=submit]").click()
                page.wait_for_url("**/ia?view=qa-lab**")
                if width == 390:
                    page.emulate_media(reduced_motion="no-preference")
                    if not focused_auth:
                        check_auth_overlay_motion(page,fixture["url"],width)
                    check_auth_overlay_internal_transition(page,fixture["url"],width)
                    context.close()
                    continue
                if width == 320:
                    check_archived_entry(page,fixture["url"])
                check(page,fixture["url"],width)
                if width == 375:
                    page.emulate_media(reduced_motion="no-preference")
                    check_auth_overlay_motion(page,fixture["url"],width)
                    check_auth_motion(page,fixture["url"],width)
                context.close()
            browser.close()
    finally:
        host.terminate()
        host.wait(timeout=5)


if __name__ == "__main__":
    main()
