"""Measure R4 animation and banner geometry in the isolated QA frame."""
from urllib.parse import urlencode
from pathlib import Path
import json
from playwright.sync_api import expect


def read_wait_geometry(frame, width):
    visual = frame.locator(".mf-wait-visual")
    expect(visual).to_be_visible(timeout=30000)
    expect(visual.locator('.mf-wait-avatar div[aria-hidden="true"]:not([hidden])')).to_be_visible()
    expect(visual.locator('.mf-banner')).to_have_count(3)
    # Freeze only after all three real banners have arrived. The application
    # controller observes this existing review preference, so depth transitions
    # cannot race the geometry sample. The temporal test below uses a new page.
    visual.evaluate("el => el.ownerDocument.documentElement.setAttribute('data-review-reduced', '')")
    rect = visual.evaluate("""el => {
        const stage = el.getBoundingClientRect(), scene = el.closest('.mf-wait');
        const art = el.querySelector('.mf-wait-avatar'), avatar = art.getBoundingClientRect();
        const stack = el.querySelector('[data-banner-stack]'), clip = stack.getBoundingClientRect();
        const artCss = getComputedStyle(art), stackCss = getComputedStyle(stack);
        return {width: innerWidth, sceneWidth: scene.getBoundingClientRect().width,
            stage: {width: stage.width, height: stage.height},
            avatar: {width: avatar.width, height: avatar.height, top: avatar.top - stage.top,
                center: (avatar.left + avatar.right) / 2 - stage.left,
                position: artCss.position, z: Number(artCss.zIndex)},
            clip: {width: clip.width, height: clip.height, top: clip.top - stage.top,
                position: stackCss.position, overflow: stackCss.overflow, z: Number(stackCss.zIndex)},
            titleHeight: scene.querySelector('h1').getBoundingClientRect().height,
            captionHeight: scene.querySelector('.mf-wait-message').getBoundingClientRect().height,
            cards: [...stack.children].map(card => {
                const css = getComputedStyle(card), box = card.getBoundingClientRect();
                const matrix = new DOMMatrixReadOnly(css.transform), icon = card.querySelector('.mf-banner-icon');
                return {depth: Number(card.style.getPropertyValue('--layer')), width: card.offsetWidth,
                    height: card.offsetHeight, top: box.top - stage.top, left: box.left - stage.left,
                    right: box.right - stage.left, radius: parseFloat(css.borderTopLeftRadius),
                    opacity: Number(css.opacity), labelOpacity: Number(getComputedStyle(card.querySelector('.mf-banner-text')).opacity),
                    icon: icon ? {width: icon.offsetWidth, height: icon.offsetHeight,
                        viewBox: icon.querySelector('svg')?.getAttribute('viewBox'),
                        path: icon.querySelector('path')?.getAttribute('d'), hidden: icon.getAttribute('aria-hidden')} : null,
                    background: css.backgroundColor, filter: css.filter, scale: matrix.a, translateY: matrix.f};
            }).sort((a, b) => a.depth - b.depth),
            clipped: document.documentElement.scrollWidth > innerWidth};
    }""")
    assert rect["width"] == width and not rect["clipped"], rect
    expected_avatar = 240 if width < 360 else 256
    expected_stage = min(width, 420) - (40 if width < 360 else 48)
    assert abs(rect["sceneWidth"] - min(width, 420)) <= 1, rect
    assert abs(rect["stage"]["width"] - expected_stage) <= 1, rect
    assert rect["stage"]["height"] == 364, rect
    avatar, clip = rect["avatar"], rect["clip"]
    assert abs(avatar["width"] - expected_avatar) <= 1 and abs(avatar["height"] - expected_avatar) <= 1, rect
    assert abs(avatar["top"] - 108) <= 1 and abs(avatar["center"] - expected_stage / 2) <= 1, rect
    assert avatar["position"] == "absolute" and avatar["z"] == 3, rect
    assert abs(clip["top"]) <= 1 and clip["height"] == 130 and abs(clip["width"] - expected_stage) <= 1, rect
    assert clip["position"] == "absolute" and clip["overflow"] == "hidden" and clip["z"] == 1, rect
    assert rect["titleHeight"] == (116 if width < 360 else 128 if width >= 768 else 118), rect
    assert rect["captionHeight"] == 104, rect
    # R4 intentionally overlaps the transparent avatar box and banner clip.
    # The original vector's painted top is ~43px below its box, leaving ~31px
    # between the front pill and the visible egg. A box-gap test is incorrect.
    expected_card = min(320, expected_stage - (24 if width < 360 else 44))
    assert [card["depth"] for card in rect["cards"]] == [0, 1, 2], rect
    for card in rect["cards"]:
        depth = card["depth"]
        assert abs(card["width"] - expected_card) <= 1 and card["height"] == 52 and card["radius"] == 28, card
        assert abs(card["scale"] - (1 - depth * .06)) < .001 and abs(card["translateY"] + depth * 12) < .1, card
        assert abs(card["top"] - (68 - depth * 12 + 26 * depth * .06)) <= 1, card
        assert card["opacity"] == [1, .66, .3][depth] and card["labelOpacity"] == 1, card
        assert card["background"] == "rgb(255, 255, 255)" and card["filter"] == f"blur({depth}px)", card
        assert card["left"] >= 0 and card["right"] <= expected_stage + 1, card
        assert card["icon"] and card["icon"]["width"] == 20 and card["icon"]["height"] == 20, card
        assert card["icon"]["viewBox"] == "0 0 24 24" and card["icon"]["path"] and card["icon"]["hidden"] == "true", card
    return visual, rect


def check_wait_layout(context, origin):
    page = context.new_page()
    out = Path(__file__).resolve().parents[1] / "artifacts/quote-result"
    out.mkdir(parents=True, exist_ok=True)
    try:
        for width in (320, 390, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            query = urlencode({"view": "qa-lab", "archive": "1", "screen": "quote-wait/comparing/email", "width": width})
            page.goto(origin + "/ia?" + query)
            frame = page.frame_locator("#frame")
            # archive=1 selects the QA inspection surface, not a pinned old
            # research build. The restored final R4 composition applies here.
            _, rect = read_wait_geometry(frame, width)
            print("BLOUB R4", width, rect)
        # The current review shell loads the canonical research app. Capture
        # its layout separately from the inspection entry above.
        current = []
        for width in (320, 390, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            query = urlencode({"view": "qa-lab", "screen": "quote-wait/comparing/email", "width": width})
            page.goto(origin + "/ia?" + query)
            frame = page.frame_locator("#frame")
            visual, rect = read_wait_geometry(frame, width)
            current.append(rect)
            visual.screenshot(path=str(out / f"current-wait-visual-{width}.png"))
        (out / "current-wait-geometry.json").write_text(json.dumps(current, indent=2) + "\n")
        page.set_viewport_size({'width':390,'height':844})
        page.emulate_media(reduced_motion='no-preference')
        query=urlencode({'view':'qa-lab','archive':'1','screen':'quote-wait/entry/email','width':390})
        page.goto(origin+'/ia?'+query)
        frame=page.frame_locator('#frame')
        # The application owns #order-single; the unchanged wait controller is
        # mounted on its retained page. Read and resolve that controller's
        # request identity, rather than sending a response to its app ancestor.
        root=frame.locator('#order-app-page');scene=root.locator('[data-wait-scene]')
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
