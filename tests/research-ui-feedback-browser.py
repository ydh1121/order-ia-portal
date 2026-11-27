"""Native renderer checks for the latest input, motion and retained UI feedback.

Uses the existing loopback host and fixture transport. No QA status writes or
external business operations. Geometry receipts bound these assertions; they
are not a user's acceptance of every visual detail.
"""
import json
import importlib.util
import os
import re
import select as select_io
import shutil
import subprocess
from pathlib import Path
from hashlib import sha256
from types import SimpleNamespace
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
from browser_predicate_support import wait_for_expression
from research_login_order_browser import wordmark_geometry

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/research-ui-feedback'
_capture_spec = importlib.util.spec_from_file_location('research_quote_capture_tools', ROOT / 'tests/research-quote-feedback-browser.py')
CAPTURE_TOOLS = importlib.util.module_from_spec(_capture_spec)
_capture_spec.loader.exec_module(CAPTURE_TOOLS)


def measured_state_capture(page, label, interaction, source, font_responses, receipt):
    """Read the already exercised standalone state; do not create a QA session."""
    page.evaluate('window.scrollTo(0,0)')
    CAPTURE_TOOLS.settle(page)
    expected = page.evaluate('''() => {const snapshot=ORDER_RESEARCH_APP.snapshot();return {
      build:snapshot.build,route:snapshot.route,viewport:{width:innerWidth,height:innerHeight}};}''')
    assert expected['build'] == source['build']['digest']
    captured = page.evaluate(CAPTURE_TOOLS.CAPTURE, {'expected': expected, 'label': label,
                                                   'captureMode': 'existing-standalone-research-route'})
    assert captured['viewport']['scrollX'] == 0 and captured['viewport']['scrollY'] == 0, captured['viewport']
    native = CAPTURE_TOOLS.chrome_layout(SimpleNamespace(context=page.context, native_page=page, evaluate=page.evaluate))
    resources = []
    for response in font_responses:
        if not response.ok:
            continue
        raw = response.body()
        digest = sha256(raw).hexdigest()
        suffix = Path(urlsplit(response.url).path).suffix
        suffix = suffix if suffix in ('.woff2', '.woff', '.ttf', '.otf') else '.font'
        path = OUT / 'fonts' / (digest + suffix)
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(raw)
        resources.append({'url': response.url, 'status': response.status, 'type': 'font',
                          'bytes': len(raw), 'sha256': digest, 'artifactFile': str(path.relative_to(OUT))})
    fonts = native['actualFontFamilies']
    assert any(font['isCustomFont'] and 'pretendard' in font['family'].lower() for font in fonts), fonts
    assert any(row['sha256'] == source['font']['sha256'] and urlsplit(row['url']).path == source['font']['url'] for row in resources), resources
    captured['fonts'].update(platform=fonts, files=[CAPTURE_TOOLS.system_font_identity(font) for font in fonts],
                             pretendardActuallyUsed=True, loadedResources=resources)
    captured['provenance'] = {'sameStandalonePageRetained': True, 'sameQaIframeRetained': False,
                              'sourceMutatedForCapture': False, 'sourceUrl': page.url,
                              'gitHead': source['gitHead'], 'compiledSourceHashesMatched': True,
                              'route': expected['route'], 'viewport': expected['viewport'],
                              'interaction': interaction, 'qaArtifactSessionObserved': False}
    captured['nativeLayoutFile'] = label + '.chrome-layout.json'
    captured['motionPreference'] = 'existing probe preference; finite animations settled without state mutation'
    path = OUT / (label + '.viewport.png')
    page.screenshot(path=str(path), full_page=False, animations='allow')
    screenshot = CAPTURE_TOOLS.screenshot_identity(path)
    assert screenshot['pngDimensions'] == expected['viewport'], screenshot
    captured['screenshots'] = [{**screenshot, 'kind': 'viewport', 'nativeScreenshot': True, 'viewportUnchanged': True,
                               'scroll': {'x': captured['viewport']['scrollX'], 'y': captured['viewport']['scrollY']}}]
    if label.startswith(('proof-', 'signature-')) and captured['viewport']['documentHeight'] > expected['viewport']['height'] + 1:
        page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
        CAPTURE_TOOLS.settle(page)
        bottom_scroll = page.evaluate('({x:scrollX,y:scrollY})')
        bottom_path = OUT / (label + '.bottom.png')
        page.screenshot(path=str(bottom_path), full_page=False, animations='allow')
        captured['belowFoldScreenshot'] = {**CAPTURE_TOOLS.screenshot_identity(bottom_path), 'nativeScreenshot': True,
                                          'viewportUnchanged': True, 'scroll': bottom_scroll}
        page.evaluate('window.scrollTo(0,0)')
        CAPTURE_TOOLS.settle(page)
    CAPTURE_TOOLS.write_json(OUT / (label + '.dom-paint.json'), captured)
    CAPTURE_TOOLS.write_json(OUT / (label + '.chrome-layout.json'), native)
    entry = {'label': label, 'route': expected['route'], 'viewport': expected['viewport'], 'build': expected['build'],
             'artifactHash': None, 'captureMode': captured['captureMode'], 'interaction': interaction,
             'domPaint': label + '.dom-paint.json', 'nativeLayout': label + '.chrome-layout.json',
             'screenshots': captured['screenshots'], 'elementCount': len(captured['elements']),
             'rangeTextCount': len(captured['texts']), 'platformFonts': fonts, 'userAcceptance': False}
    if 'belowFoldScreenshot' in captured:
        entry['belowFoldScreenshot'] = captured['belowFoldScreenshot']
    receipt['supplementalCaptures'].append(entry)
    return entry


def select(page, screen, state):
    target = {'screen': screen, 'state': state}
    accepted = page.evaluate('async next => await ORDER_RESEARCH_APP.inspectRoute(next)', target)
    assert accepted is not False, {'routeRejected': target}
    wait_for_expression(page, '(() => {const expected=' + json.dumps(target) + ''';
      const app=window.ORDER_RESEARCH_APP,state=app?.snapshot(),html=document.documentElement;
      return state?.route.screen===expected.screen&&state.route.state===expected.state&&
        html.dataset.productScreen===expected.screen&&html.dataset.productState===expected.state;
    })()''')


def platform_fonts(cdp, selector):
    root = cdp.send('DOM.getDocument')['root']['nodeId']
    node = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': selector})['nodeId']
    assert node, {'fontNodeMissing': selector}
    return cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']


def assert_pretendard(fonts):
    used = [font for font in fonts if font['glyphCount'] > 0]
    assert used, {'actualPlatformFonts': fonts}
    assert all(font['isCustomFont'] and 'Pretendard' in font['familyName'] for font in used), {'fallbackFontRendered': used}


def header_geometry_probe(page, membership, source):
    """Compare native element frames with the protected originals, not glyph ink."""
    header = page.locator('#order-app-header')
    brand = header.locator('.order-product-brand')
    member = membership == 'member'
    expect(brand).to_have_attribute('data-authenticated', 'true' if member else 'false')
    if member:
        expect(header.locator('.research-order-trigger')).to_be_visible()
    else:
        expect(header.locator('.research-order-trigger')).to_be_hidden()
        expect(header.locator('.research-order-arrow')).to_be_hidden()
    header.scroll_into_view_if_needed()
    CAPTURE_TOOLS.settle(page)
    observed = header.evaluate('''header => {
      const h=header.getBoundingClientRect(),brand=header.querySelector('.order-product-brand');
      const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x-h.x,y:r.y-h.y,width:r.width,height:r.height};};
      const account=brand.querySelector('[data-order-account-trigger]'),svg=account.querySelector('svg.brand-mark');
      return {header:{x:h.x,y:h.y,width:h.width,height:h.height},brand:rect(brand),word:rect(brand.querySelector('.brand-word')),
        period:rect(brand.querySelector('.brand-dot')),arrow:rect(brand.querySelector('.research-order-arrow')),
        orderTrigger:rect(brand.querySelector('.research-order-trigger')),accountTrigger:rect(account),
        signup:rect(header.querySelector('[data-app-auth]')),svgFrame:rect(svg),
        svgPaths:[...svg.querySelectorAll('g>path')].map(rect),markMotionState:svg.dataset.motionState||null,
        viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,scrollX,scrollY},source:ORDER_RESEARCH_APP.snapshot()};
    }''')
    # Preserve the element observations even if a later typography assertion
    # rejects this run. Range bounds remain distinct from these Figma frames.
    label = 'header-' + membership + '-390'
    observed['source'] = {'build': observed['source']['build'], 'route': observed['source']['route'], 'gitHead': source['gitHead']}
    observed['reference'] = {'figmaFile': 'OGc2SUKEvckzYhhowzX7tD', 'headerMain': '1376:7614' if member else '1336:7644',
        'coordinateSpace': 'header-relative CSS pixels', 'headerSize': {'width': 390, 'height': 78},
        'word': {'x': 26, 'y': 23.015625, 'width': 71, 'height': 25},
        'accessory': {'x': 101, 'y': 29, 'width': 14, 'height': 14} if member else {'x': 97, 'y': 23, 'width': 9, 'height': 24},
        'brand': {'x': 26, 'y': 0, 'width': 338 if member else 277.59381103515625, 'height': 78},
        'accountTrigger': {'x': 312.140625 if member else 106, 'y': 13, 'width': 51.85940170288086, 'height': 44},
        **({'orderTrigger': {'x': 26, 'y': 13, 'width': 89, 'height': 44},
            'svgFrame': {'x': 308.40625, 'y': 20.46875, 'width': 59.32809829711914, 'height': 29.031299591064453}} if member else
           {'signup': {'x': 315.59375, 'y': 17, 'width': 48.40629959106445, 'height': 44},
            'svgFrame': {'x': 102.265625, 'y': 20.46875, 'width': 59.32809829711914, 'height': 29.031299591064453}})}
    observed['limits'] = {'frameTolerancePx': 1 / 64, 'glyphInkMatchVerified': False, 'userAcceptance': False,
                          'glyphEvidence': 'DOM Range text boxes and actual Chrome font use; PNG retains rendered ink'}
    path = OUT / (label + '.geometry.json')
    CAPTURE_TOOLS.write_json(path, observed)
    observed['wordmark'] = wordmark_geometry(header.locator('.brand-word'))
    cdp = page.context.new_cdp_session(page)
    try:
        cdp.send('DOM.enable')
        cdp.send('CSS.enable')
        observed['actualWordFonts'] = platform_fonts(cdp, '#order-app-header .brand-word')
    finally:
        cdp.detach()
    header.screenshot(path=str(OUT / (label + '.png')), animations='allow')
    observed['screenshot'] = CAPTURE_TOOLS.screenshot_identity(OUT / (label + '.png'))
    CAPTURE_TOOLS.write_json(path, observed)
    assert observed['source']['build'] == source['build']['digest'], observed
    assert observed['viewport']['width'] == 390 and observed['viewport']['devicePixelRatio'] == 1, observed
    assert {key: observed['header'][key] for key in ('width', 'height')} == observed['reference']['headerSize'], observed
    assert observed['screenshot']['pngDimensions'] == observed['reference']['headerSize'], observed
    for key, expected in observed['reference']['word'].items():
        assert abs(observed['word'][key] - expected) <= 1 / 64, observed
    accessory = observed['arrow' if member else 'period']
    for key, expected in observed['reference']['accessory'].items():
        assert abs(accessory[key] - expected) <= 1 / 64, observed
    for element in ('brand', 'accountTrigger', 'orderTrigger', 'svgFrame') if member else ('brand', 'accountTrigger', 'signup', 'svgFrame'):
        for key, expected in observed['reference'][element].items():
            assert abs(observed[element][key] - expected) <= 1 / 64, observed
    assert len(observed['svgPaths']) == 3, observed
    typography = observed['wordmark']
    assert typography['fontSize'] == typography['lineHeight'] == '25px' and typography['fontWeight'] == '900', observed
    # Blink serializes a computed zero letter spacing as "normal". Preserve
    # the original zero tracking requirement without imposing one CSSOM spelling.
    spacing = 0 if typography['letterSpacing'] == 'normal' else float(typography['letterSpacing'].removesuffix('px'))
    assert spacing == 0, observed
    assert typography['textAlign'] == 'left', observed
    assert_pretendard(observed['actualWordFonts'])
    observed['elementFramesMatched'] = True
    CAPTURE_TOOLS.write_json(path, observed)
    return observed


def commit_ime_text(cdp):
    cdp.send('Input.imeSetComposition', {'text': 'ㅎ', 'selectionStart': 1, 'selectionEnd': 1})
    cdp.send('Input.imeSetComposition', {'text': '한', 'selectionStart': 1, 'selectionEnd': 1})
    cdp.send('Input.insertText', {'text': '한'})


def native_ime_control(context):
    # Measure this Chrome/CDP version on an ordinary native input with no
    # application listeners. CDP's insertText completion can dispatch an
    # untrusted compositionend even when its composition/input events are
    # trusted; this control records that protocol provenance, without claiming
    # that CDP is an operating-system Korean keyboard.
    control = context.new_page()
    cdp = context.new_cdp_session(control)
    try:
        control.set_content('<!doctype html><meta charset="utf-8"><input id="native-ime" type="text">')
        field = control.locator('#native-ime')
        field.fill('QTARToffee')
        field.press('End')
        field.evaluate('''input => {
          window.__nativeImeControl={events:[],original:input};
          for(const type of ['beforeinput','input','compositionstart','compositionend'])input.addEventListener(type,event=>{
            __nativeImeControl.events.push({type,trusted:event.isTrusted,inputType:event.inputType,isComposing:event.isComposing});
          });
        }''')
        commit_ime_text(cdp)
        expect(field).to_have_value('QTARToffee한')
        wait_for_expression(control, '__nativeImeControl.events.some(event=>event.type==="compositionend")')
        result = field.evaluate('''input=>({events:__nativeImeControl.events,value:input.value,
          sameInput:input===__nativeImeControl.original,applicationLoaded:Boolean(window.ORDER_RESEARCH_APP)})''')
        assert result['sameInput'] and not result['applicationLoaded'], result
        assert any(event['type'] == 'compositionstart' and event['trusted'] for event in result['events']), result
        assert any(event['type'] == 'input' and event['isComposing'] and event['trusted'] for event in result['events']), result
        return result
    finally:
        cdp.detach()
        control.close()


def input_probe(page):
    ime_control = native_ime_control(page.context)
    page.bring_to_front()
    select(page, 'signup', 'empty')
    field = page.locator('.product-auth-sheet [name=password]')
    expect(field).to_be_visible()
    page.evaluate('document.fonts.ready')
    page.locator('.product-auth-sheet [data-action=password-visibility]').first.click()
    field.click()
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable')
    cdp.send('CSS.enable')
    field.evaluate(r'''input => {
      const trace=window.__inputGeometry={frames:[],events:[],done:false,errors:[]};
      const controller=new AbortController(),measure=document.createElement('span');
      measure.setAttribute('aria-hidden','true');measure.inert=true;
      Object.assign(measure.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre',width:'max-content'});
      document.body.append(measure);
      for(const type of ['beforeinput','input','compositionstart','compositionend'])input.addEventListener(type,event=>{
        trace.events.push({type,trusted:event.isTrusted,inputType:event.inputType,isComposing:event.isComposing});
      },{signal:controller.signal});
      const range=document.createRange(),rect=el=>el.getBoundingClientRect(),number=value=>parseFloat(value)||0;
      function sample(){
        if(trace.done){measure.remove();controller.abort();return;}
        try{
          const mirror=document.querySelector('.r3-input-mirror'),cs=getComputedStyle(input),box=rect(input);
          if(mirror){
            const line=mirror.querySelector('.r3-input-glyphs'),glyphs=[...line.children].filter(n=>n.tagName==='SPAN'&&!n.hasAttribute('data-input-exit'));
            const chars=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(input.value)].map(v=>v.segment);
            const visible=chars.map(ch=>input.type==='password'?'•':ch);
            const borderTop=number(cs.borderTopWidth),borderBottom=number(cs.borderBottomWidth),top=number(cs.paddingTop),bottom=number(cs.paddingBottom),lineHeight=number(cs.lineHeight);
            const y=box.top+borderTop+top+Math.max(0,(box.height-borderTop-borderBottom-top-bottom-lineHeight)/2)-input.scrollTop;
            Object.assign(measure.style,{left:box.left+number(cs.borderLeftWidth)+number(cs.paddingLeft)-input.scrollLeft+'px',top:y+'px',font:cs.font,
              lineHeight:cs.lineHeight,letterSpacing:cs.letterSpacing,wordSpacing:cs.wordSpacing,fontKerning:cs.fontKerning,fontFeatureSettings:cs.fontFeatureSettings,fontVariationSettings:cs.fontVariationSettings,fontVariantLigatures:cs.fontVariantLigatures});
            const text=visible.join('');if(measure.textContent!==text)measure.textContent=text;
            let offset=0;const stable=[];
            for(let i=0;i<Math.min(glyphs.length,visible.length);i++){
              const glyph=glyphs[i],start=offset;offset+=visible[i].length;
              if(glyph.getAnimations().some(animation=>animation.playState==='running'))continue;
              range.setStart(measure.firstChild,start);range.setEnd(measure.firstChild,offset);const expected=range.getBoundingClientRect();
              const actualRange=document.createRange();actualRange.selectNodeContents(glyph);const actual=actualRange.getBoundingClientRect();
              stable.push({index:i,dx:actual.left-expected.left,dy:actual.top-expected.top});
            }
            trace.frames.push({font:cs.fontFamily,mask:input.type==='password',sameInput:input.isConnected,
              glyphText:glyphs.map(n=>n.textContent).join(''),nativeText:text,
              widthDelta:glyphs.reduce((sum,n)=>sum+rect(n).width,0)-rect(measure).width,
              stable,selection:[input.selectionStart,input.selectionEnd]});
          }
        }catch(error){trace.errors.push(String(error));}
        requestAnimationFrame(sample);
      }
      trace.stop=()=>{trace.done=true;measure.remove();controller.abort();delete trace.stop;};requestAnimationFrame(sample);
    }''')
    page.keyboard.type('AVATARToffee', delay=70)
    expect(field).to_have_value('AVATARToffee')
    # Inspect the font that Chrome actually used for a live glyph. A CSS family
    # declaration alone would still pass when a font file silently failed.
    mirror_fonts = platform_fonts(cdp, '.r3-input-glyphs>span:not([data-input-exit])')
    assert_pretendard(mirror_fonts)
    input_fonts = platform_fonts(cdp, '.product-auth-sheet [name=password]')
    if any(font['glyphCount'] > 0 for font in input_fonts):
        assert_pretendard(input_fonts)
    wait_for_expression(page, '!document.querySelector(".r3-input-mirror")')
    field.press('Home')
    for _ in range(3):
        field.press('Shift+ArrowRight')
    assert field.evaluate('el=>[el.selectionStart,el.selectionEnd]') == [0, 3]
    assert page.locator('.r3-input-mirror').count() == 0
    page.keyboard.type('Q')
    expect(field).to_have_value('QTARToffee')
    field.press('End')
    page.evaluate('__inputGeometry.imeStart=__inputGeometry.events.length')
    cdp.send('Input.imeSetComposition', {'text': 'ㅎ', 'selectionStart': 1, 'selectionEnd': 1})
    assert page.locator('.r3-input-mirror').count() == 0
    cdp.send('Input.imeSetComposition', {'text': '한', 'selectionStart': 1, 'selectionEnd': 1})
    cdp.send('Input.insertText', {'text': '한'})
    expect(field).to_have_value('QTARToffee한')
    wait_for_expression(page, '__inputGeometry.events.slice(__inputGeometry.imeStart).some(event=>event.type==="compositionend")')
    page.evaluate('__inputGeometry.imeEnd=__inputGeometry.events.length')
    wait_for_expression(page, '!document.querySelector(".r3-input-mirror")')
    page.locator('.product-auth-sheet [data-action=password-visibility]').first.click()
    field.click()
    field.press('End')
    page.keyboard.type('9', delay=50)
    masked = page.locator('.r3-input-mirror .r3-input-glyphs').text_content()
    assert masked and set(masked) == {'•'}, masked
    expect(field).to_have_value('QTARToffee한9')
    page.emulate_media(reduced_motion='reduce')
    wait_for_expression(page, '!document.querySelector(".r3-input-mirror")')
    page.keyboard.type('R')
    expect(field).to_have_value('QTARToffee한9R')
    assert page.locator('.r3-input-mirror').count() == 0
    page.screenshot(path=str(OUT / 'input-native-rest-390.png'), full_page=True)
    trace = page.evaluate('() => {__inputGeometry.stop();return __inputGeometry;}')
    trace['platformFonts'] = {'liveMirrorGlyph': mirror_fonts, 'nativeControl': input_fonts,
                              'nativeControlExposedGlyphs': any(font['glyphCount'] > 0 for font in input_fonts)}
    trace['nativeImeControl'] = ime_control
    trace['imeInputMethod'] = 'Chrome DevTools Protocol: imeSetComposition and insertText; no physical keyboard claim'
    (OUT / 'input-native-trace.json').write_text(json.dumps(trace, ensure_ascii=False, indent=2) + '\n')
    cdp.detach()
    assert trace['errors'] == [], trace['errors']
    assert len(trace['frames']) >= 5, trace
    assert all('Pretendard' in row['font'] and row['sameInput'] for row in trace['frames']), trace
    stable = [item for row in trace['frames'] for item in row['stable']]
    assert len(stable) >= 5, trace
    assert max(abs(item['dx']) for item in stable) <= .75, {'reason': 'stable glyph horizontal jump', 'trace': trace}
    assert max(abs(item['dy']) for item in stable) <= .75, {'reason': 'mirror/native baseline mismatch', 'trace': trace}
    assert all(row['glyphText'] == row['nativeText'] for row in trace['frames']), trace
    ime_events = trace['events'][trace['imeStart']:trace['imeEnd']]
    assert ime_events == ime_control['events'], {'reason': 'application IME event provenance differs from the native control',
                                                'application': ime_events, 'nativeControl': ime_control}
    assert any(event['type'] == 'compositionstart' and event['trusted'] for event in ime_events), ime_events
    assert any(event['type'] == 'input' and event['isComposing'] and event['trusted'] for event in ime_events), ime_events
    assert any(event['type'] == 'compositionend' for event in ime_events), ime_events
    non_ime_events = trace['events'][:trace['imeStart']] + trace['events'][trace['imeEnd']:]
    assert all(event['trusted'] for event in non_ime_events), non_ime_events
    trace['limits'] = {'stableGlyphDeltaPx': .75, 'fullVisualAcceptance': False}
    page.emulate_media(reduced_motion='no-preference')
    return trace


def morph_probe(page):
    select(page, 'onboarding', 'member-3')
    expect(page.locator('.ob-tasks .ob-mode')).to_have_count(2)
    page.evaluate('document.fonts.ready')
    page.evaluate('''() => {
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const label=node=>[...node.querySelectorAll('span')].find(n=>n.textContent.trim()===node.textContent.trim()&&!n.querySelector('span,svg'))||node;
      const before=[...document.querySelectorAll('.ob-tasks .ob-mode')].map(node=>({rect:rect(node),font:getComputedStyle(label(node)).fontSize,label:rect(label(node))}));
      const trace=window.__modeGeometry={before,frames:[],done:false,trusted:false};
      document.querySelector('[data-mf-intro="4"]').addEventListener('click',event=>{trace.trusted=event.isTrusted;},{once:true,capture:true});
      let seen=false,after=0;const started=performance.now();
      function sample(now){
        const layer=document.querySelector('.research-mode-transition'),surfaces=[...document.querySelectorAll('[data-mode-part=surface]')],labels=[...document.querySelectorAll('[data-mode-part=label]')];
        if(layer)seen=true;
        const cards=[...document.querySelectorAll('.ob-mode.card')];
        if(layer||seen)trace.frames.push({at:now-started,layer:Boolean(layer),surfaces:surfaces.map(rect),labels:labels.map(node=>({rect:rect(node),font:getComputedStyle(node).fontSize})),cards:cards.map(node=>({rect:rect(node),label:rect(label(node)),font:getComputedStyle(label(node)).fontSize,visibility:getComputedStyle(node).visibility}))});
        if(seen&&!layer)after++;
        if(after>=3||now-started>6000){trace.done=true;return;}requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }''')
    page.locator('[data-mf-intro="4"]').click()
    wait_for_expression(page, '__modeGeometry.done===true')
    trace = page.evaluate('__modeGeometry')
    moving = [row for row in trace['frames'] if row['layer']]
    settled = [row for row in trace['frames'] if not row['layer']]
    assert trace['trusted'] and len(moving) >= 8 and len(settled) >= 2, trace
    assert all(len(row['surfaces']) == len(row['labels']) == 2 for row in moving), trace
    assert all(all(card['visibility'] == 'hidden' for card in row['cards']) for row in moving), trace
    for index in range(2):
        start, first, last, target = trace['before'][index], moving[0], moving[-1], settled[0]['cards'][index]
        assert max(abs(first['surfaces'][index][key] - start['rect'][key]) for key in ('x', 'y', 'width', 'height')) <= 8, trace
        assert abs(float(first['labels'][index]['font'].removesuffix('px'))-float(start['font'].removesuffix('px'))) <= .5, trace
        assert max(abs(last['surfaces'][index][key] - target['rect'][key]) for key in ('x', 'y', 'width', 'height')) <= 2, trace
        last_label, target_label = last['labels'][index]['rect'], target['label']
        assert abs(last_label['x']+last_label['width']/2-target_label['x']-target_label['width']/2) <= 1, trace
        assert abs(last_label['y']+last_label['height']/2-target_label['y']-target_label['height']/2) <= 1, trace
    assert page.locator('.research-mode-transition').count() == 0
    page.screenshot(path=str(OUT / 'intro-mode-handoff-390.png'), full_page=True)
    trace['limits'] = {'firstPaintPx': 8, 'lastSurfacePx': 2, 'lastLabelCenterPx': 1, 'fullVisualAcceptance': False}
    return trace


def consultation_pass_probe(page):
    page.evaluate('''() => {
      const adapter=ORDER_RESEARCH_APP.adapter,send=adapter.roleRequest;
      window.__consultOriginalRead=send;
      adapter.roleRequest=async(...args)=>{const value=await send(...args);if(args[0]!=='/workspace')return value;
        return {...value,quotes:(value.quotes||[]).map(quote=>({...quote,lines:[
          {productName:'특란',quantity:20,unit:'tray',serviceDate:'2026-12-17'},
          {productName:'대란',quantity:5,unit:'box',serviceDate:'2026-12-18'}]}))};};
    }''')
    select(page, 'drawer', 'closed')
    choice = page.locator('[name=consult-pass]').first
    detail_button = page.locator('[data-action=consult-ticket-detail]').first
    expect(detail_button).to_be_visible()
    choice.check()
    page.locator('[data-action=open-drawer]').click()
    panel = page.locator('.functional-drawer')
    expect(panel).to_be_visible()
    memo = page.locator('.consult-memo textarea')
    memo.fill('패스 상세를 열어도 유지할 상담 메모')
    page.locator('[name=topic]').first.check()
    page.evaluate('''() => {window.__consultRetained={memo:document.querySelector('.consult-memo textarea'),choice:document.querySelector('[name=consult-pass]'),header:document.querySelector('#order-app-header'),writes:ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==='POST').length};}''')
    memo.press('Escape')
    expect(panel).to_be_hidden()
    page.evaluate('''() => {
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const opener=document.querySelector('[data-action=consult-ticket-detail]'),card=opener.closest('.consult-ticket'),dialog=document.querySelector('.consult-pass-dialog');
      const trace=window.__consultPassGeometry={source:null,click:null,initialOpening:null,frames:[],done:false,trusted:false};
      let seen=false,closed=0,raf=0;
      function observe(kind,rafTimestamp=null){
        const ticket=dialog.querySelector('.ticket-detail'),now=performance.now();
        if(dialog.open)seen=true;
        if(!seen)return null;
        const row={at:now-trace.click.observedAt,observedAt:now,kind,rafTimestamp,phase:dialog.open?dialog.dataset.motion:'closed',
          ticket:ticket?rect(ticket):null,source:rect(card),sourceVisibility:getComputedStyle(card).visibility,
          animations:ticket?ticket.getAnimations().map(animation=>({currentTime:animation.currentTime,startTime:animation.startTime,
            pending:animation.pending,playState:animation.playState,duration:animation.effect?.getTiming().duration})):[]};
        trace.frames.push(row);return row;
      }
      function finish(){trace.done=true;observer.disconnect();cancelAnimationFrame(raf);window.removeEventListener('click',onClick,true);}
      function sample(timestamp){
        if(trace.done)return;observe('animation-frame',timestamp);
        if(seen&&!dialog.open)closed++;
        if(closed>=3||performance.now()-trace.click.observedAt>12000){finish();return;}
        raf=requestAnimationFrame(sample);
      }
      // Read the actual post-open layout before the next rAF. A pre-armed rAF
      // can first see an already-progressed animation. These are measured DOM
      // bounds and native animation times, never injected geometry or time 0.
      const observer=new MutationObserver(()=>{
        if(trace.click&&!trace.initialOpening&&dialog.open&&dialog.dataset.motion==='opening')
          trace.initialOpening=observe('dialog-mutation');
      });
      observer.observe(dialog,{attributes:true,attributeFilter:['open','data-motion']});
      function onClick(event){
        const path=event.composedPath(),target=event.target;
        if(trace.click||!path.includes(opener)||!(target instanceof Element)||!(target===opener||opener.contains(target)))return;
        trace.click={observedAt:performance.now(),eventTimeStamp:event.timeStamp,isTrusted:event.isTrusted,
          targetTag:target.localName,targetWithinOpener:true,composedPathContainsOpener:true};
        trace.source=rect(card);trace.trusted=event.isTrusted;
        window.removeEventListener('click',onClick,true);
        raf=requestAnimationFrame(sample);
      }
      // The product deliberately stops propagation in its root capture
      // handler. Observe above that root without changing the real event.
      window.addEventListener('click',onClick,{capture:true,passive:true});
    }''')
    detail_button.click()
    dialog = page.get_by_role('dialog', name='오더 패스 상세', exact=True)
    expect(dialog).to_be_visible()
    wait_for_expression(page, 'document.querySelector(".consult-pass-dialog").dataset.motion==="open"')
    assert dialog.evaluate('node=>node.matches(":modal")')
    expect(dialog.locator('.ticket-item')).to_have_count(2)
    expect(dialog).to_contain_text('5상자')
    expect(dialog.locator('.consult-pass-close')).to_be_focused()
    # A full-page screenshot expands the viewport to the long retained parent.
    # The real dialog correctly finishes on resize, so observe its actual
    # viewport without triggering that separate product interaction.
    before_capture = dialog.evaluate('''node => {
      const check=window.__consultCapture={node,resizes:[],before:{width:innerWidth,height:innerHeight}};
      check.onResize=()=>check.resizes.push({width:innerWidth,height:innerHeight});
      addEventListener('resize',check.onResize);
      return check.before;
    }''')
    page.screenshot(path=str(OUT / 'consultation-pass-expanded-390.png'), full_page=False)
    capture_continuity = page.evaluate('''() => {
      const check=__consultCapture;removeEventListener('resize',check.onResize);
      const result={sameDialog:document.querySelector('.consult-pass-dialog')===check.node,
        open:check.node.open,modal:check.node.matches(':modal'),resizes:check.resizes,
        after:{width:innerWidth,height:innerHeight}};delete window.__consultCapture;return result;
    }''')
    assert capture_continuity['sameDialog'] and capture_continuity['open'] and capture_continuity['modal'], capture_continuity
    assert capture_continuity['after'] == before_capture and capture_continuity['resizes'] == [], capture_continuity
    dialog.locator('.consult-pass-close').click()
    expect(dialog).to_be_hidden()
    expect(detail_button).to_be_focused()
    wait_for_expression(page, '__consultPassGeometry.done')
    trace = page.evaluate('__consultPassGeometry')
    trace['captureContinuity'] = capture_continuity
    CAPTURE_TOOLS.write_json(OUT / 'consultation-pass-native-trace.json', trace)
    opening = [row for row in trace['frames'] if row['phase'] == 'opening']
    closing = [row for row in trace['frames'] if row['phase'] == 'closing']
    settled = [row for row in trace['frames'] if row['phase'] == 'open']
    opening_raf = [row for row in opening if row['kind'] == 'animation-frame']
    assert trace['trusted'] and trace['click']['composedPathContainsOpener'] and trace['click']['targetWithinOpener'], trace
    assert len(opening_raf) >= 6 and len(closing) >= 6 and settled, trace
    initial = trace['initialOpening']
    assert initial and initial['kind'] == 'dialog-mutation' and initial['phase'] == 'opening', trace
    assert all(row['sourceVisibility'] == 'hidden' for row in opening + closing + settled), trace
    assert settled[0]['ticket']['width'] >= trace['source']['width'] + 24, trace
    assert max(abs(initial['ticket'][key] - trace['source'][key]) for key in ('x', 'y', 'width', 'height')) <= 12, trace
    assert max(abs(closing[-1]['ticket'][key] - closing[-1]['source'][key]) for key in ('x', 'y', 'width', 'height')) <= 2, trace
    assert page.evaluate('''() => document.querySelector('[name=consult-pass]')===__consultRetained.choice&&__consultRetained.choice.checked&&document.querySelector('.consult-memo textarea')===__consultRetained.memo&&document.querySelector('#order-app-header')===__consultRetained.header''')
    page.locator('[data-action=open-drawer]').click()
    expect(memo).to_have_value('패스 상세를 열어도 유지할 상담 메모')
    expect(page.locator('[name=topic]').first).to_be_checked()
    memo.press('Escape')
    expect(panel).to_be_hidden()
    page.emulate_media(reduced_motion='reduce')
    detail_button.click()
    expect(dialog).to_be_visible()
    assert dialog.get_attribute('data-motion') == 'open'
    assert dialog.locator('.ticket-detail').evaluate('node=>node.getAnimations().length') == 0
    page.keyboard.press('Escape')
    expect(dialog).to_be_hidden()
    expect(detail_button).to_be_focused()
    trace['retainedDraftAndSelection'] = True
    trace['reducedMotionImmediate'] = True
    trace['postCountUnchanged'] = page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length===__consultRetained.writes')
    assert trace['postCountUnchanged']
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate('ORDER_RESEARCH_APP.adapter.roleRequest=__consultOriginalRead;delete window.__consultOriginalRead')
    trace['limits'] = {'initialObservedLayoutPx': 12, 'closeHandoffPx': 2, 'minExpansionPx': 24,
                       'initialEvidence': 'Native post-open DOM layout with observed animation time; no first-pixel paint claim',
                       'fullVisualAcceptance': False}
    return trace


def pass_loading_probe(page):
    select(page, 'passes', 'loading')
    cards = page.locator('.pass-loading .order-pass')
    expect(cards).to_have_count(3)
    wait_for_expression(page, 'document.querySelectorAll(".pass-loading .order-pass[data-r3-skeleton=pending]").length===3')
    rows = cards.evaluate_all('''cards=>cards.map(card=>{const r=card.getBoundingClientRect(),brand=card.querySelector('.loading-ticket-brand'),marks=[...brand.querySelectorAll('.pass-dots i')],style=getComputedStyle(card);return {width:r.width,height:r.height,opacity:style.opacity,mask:style.maskImage,brandOpacity:getComputedStyle(brand).opacity,bars:card.querySelector('.r3-geometry-skeleton').dataset.textRects,marks:marks.map(mark=>{const r=mark.getBoundingClientRect();return {color:getComputedStyle(mark).backgroundColor,width:r.width,height:r.height};})};})''')
    assert all(row['width'] > 100 and row['height'] > 100 and row['opacity'] == row['brandOpacity'] == '1' and int(row['bars']) > 0 for row in rows), rows
    assert all('radial-gradient' in row['mask'] and len(row['marks']) == 3 for row in rows), rows
    assert all(mark['color'] == 'rgb(211, 217, 225)' and mark['width'] == mark['height'] == 14 for row in rows for mark in row['marks']), rows
    page.screenshot(path=str(OUT / 'passes-loading-brand-390.png'), full_page=True)
    select(page, 'passes', 'grid')
    return {'cards': rows, 'geometryOwner': 'each actual pass card', 'fullVisualAcceptance': False}


def pass_tear_probe(page, capture):
    select(page, 'passes', 'grid')
    page.locator('[data-pass-id=qa-order-shipped]').click()
    cut = page.locator('.expanded-pass>.ticket-detail [data-action=tear-ticket]')
    confirm = page.locator('.expanded-pass>.tear-confirm')
    expect(cut).to_be_visible()
    cut.scroll_into_view_if_needed()
    box = cut.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 22, y, steps=3)
    partial = page.locator('.pass-tear-preview').evaluate('''node=>({phase:node.dataset.phase,progress:Number(node.dataset.progress),clip:getComputedStyle(node.querySelector('[data-pass-tear-part=lower]')).clipPath,transform:getComputedStyle(node.querySelector('[data-pass-tear-part=lower]')).transform,sourceOpacity:getComputedStyle(node.parentNode.querySelector(':scope>.ticket-detail')).opacity})''')
    assert partial['phase'] == 'preview' and 0 < partial['progress'] < 1 and partial['sourceOpacity'] == '0', partial
    assert 'polygon(' in partial['clip'] and partial['transform'] != 'none', partial
    assert page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().data.purchases.find(row=>row.id==="qa-order-shipped").status') == 'DISPATCHED'
    page.mouse.up()
    expect(confirm).to_be_hidden()
    assert page.locator('.pass-tear-preview').count() == 0
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 65, y, steps=7)
    page.mouse.up()
    expect(confirm).to_be_visible()
    assert page.locator('.pass-tear-preview').get_attribute('data-phase') == 'preview'
    confirm.locator('[data-action=cancel-tear]').click()
    expect(confirm).to_be_hidden()
    assert page.locator('.pass-tear-preview').count() == 0
    cut.click()
    page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.configure({requests:{"product POST /purchases":{scenario:"error",status:503}}})')
    confirm.locator('[data-action=confirm-tear]').click()
    expect(confirm.locator('[data-receipt-message]')).not_to_have_text('')
    assert page.locator('.pass-tear-preview,.ticket-received').count() == 0
    confirm.locator('[data-action=cancel-tear]').click()
    page.emulate_media(reduced_motion='reduce')
    cut.click()
    expect(confirm).to_be_visible()
    assert page.locator('.pass-tear-preview').count() == 0
    confirm.locator('[data-action=cancel-tear]').click()
    page.emulate_media(reduced_motion='no-preference')
    cut.click()
    page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.configure({requests:{"product POST /purchases":{scenario:"loading"}}})')
    confirm.locator('[data-action=confirm-tear]').click()
    wait_for_expression(page, 'ORDER_RESEARCH_APP.adapter.fixture.inspect().pending===1')
    assert page.locator('.pass-tear-preview').get_attribute('data-phase') == 'preview'
    assert page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().data.purchases.find(row=>row.id==="qa-order-shipped").status') == 'DISPATCHED'
    page.evaluate('''() => {
      const trace=window.__tearNativeGeometry={frames:[],done:false},start=performance.now();
      function sample(now){const preview=document.querySelector('.pass-tear-preview'),lower=preview?.querySelector('[data-pass-tear-part=lower]'),r=lower?.getBoundingClientRect();
        trace.frames.push({at:now-start,phase:preview?.dataset.phase||'none',opacity:lower?getComputedStyle(lower).opacity:null,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,status:ORDER_RESEARCH_APP.adapter.fixture.inspect().data.purchases.find(row=>row.id==='qa-order-shipped').status,receivedVisible:Boolean(document.querySelector('.ticket-received'))});
        if(document.querySelector('.ticket-received')||now-start>6000){trace.done=true;return;}requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    }''')
    page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.releasePending({requests:{}})')
    wait_for_expression(page, '__tearNativeGeometry.done')
    trace = page.evaluate('__tearNativeGeometry')
    acknowledged = [row for row in trace['frames'] if row['phase'] == 'acknowledged']
    assert len(acknowledged) >= 6 and all(row['status'] == 'RECEIVED' and not row['receivedVisible'] for row in acknowledged), trace
    assert float(acknowledged[-1]['opacity']) < float(acknowledged[0]['opacity']), trace
    assert acknowledged[-1]['rect']['y'] > acknowledged[0]['rect']['y'] + 40, trace
    expect(page.locator('.ticket-received')).to_have_count(1)
    assert page.locator('.pass-stage').evaluate('node=>node.lastElementChild.dataset.passId') == 'qa-order-shipped'
    assert page.locator('.pass-tear-preview').count() == 0
    page.screenshot(path=str(OUT / 'pass-receipt-after-tear-390.png'), full_page=True)
    capture('pass-receipt-after-tear-390', 'Existing trusted tear confirmation and isolated fixture receipt ACK; receipt assertions passed')
    trace.update({'partialGesture': partial, 'shortDragCancelled': True, 'confirmCancelRestored': True, 'failedReceiptRestored': True,
                  'reducedMotionPreviewAbsent': True, 'commercialAcceptance': False, 'fullVisualAcceptance': False})
    return trace


def evidence_presentation_probe(page, capture):
    result = {'reportedBadBuild': '9f7f83753ad7245b1e6a0f7dc55f905093c2a2dfa8d0aa8f057d9f18e125f092', 'current': []}
    scenarios = {'proof': ['empty', 'selected', 'oversize', 'format', 'checking', 'blocked', 'error', 'ready'],
                 'signature': ['empty', 'drawn', 'missing', 'processing', 'done']}
    for screen, states in scenarios.items():
        for state in states:
            before = page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length')
            select(page, screen, state)
            panel = page.locator('.research-evidence-page[data-review-ready=true]')
            expect(panel).to_be_visible()
            page.evaluate('document.fonts.ready')
            if state == 'done':
                expect(panel.locator('.research-workflow-receipt')).to_be_visible()
                expect(panel.locator(':scope > h2')).to_be_hidden()
                center = panel.locator('.research-workflow-receipt').evaluate("node=>{const r=node.getBoundingClientRect(),children=[...node.children].filter(x=>x.checkVisibility()),top=children[0].getBoundingClientRect().top,bottom=children.at(-1).getBoundingClientRect().bottom;return {areaCenter:r.top+r.height/2,contentCenter:(top+bottom)/2};}")
                assert abs(center['areaCenter'] - center['contentCenter']) <= 2, center
                result['current'].append({'screen': screen, 'state': state, 'center': center})
            else:
                expect(panel.locator('.research-evidence-settings')).to_be_visible()
                if screen == 'proof':
                    expect(panel.locator('.research-file-drop')).to_be_visible()
                    expect(panel.locator('input[type=file]')).to_be_enabled() if state != 'checking' else None
                    expect(panel.locator('.proof-purpose')).to_be_visible()
                    expect(panel.locator('.wf-signature')).to_be_hidden()
                    expect(panel.locator('[data-evidence-submit]')).to_be_hidden()
                    expect(panel.locator('.research-proof-next')).to_be_visible()
                    expect(panel.locator('[name=document-memo]')).to_be_visible()
                else:
                    expect(panel.locator('input[type=file]')).to_be_hidden()
                    expect(panel.locator('.proof-purpose')).to_be_hidden()
                    expect(panel.locator('.research-evidence-pages canvas')).to_have_count(1)
                    expect(panel.locator('.wf-signature canvas')).to_be_visible()
                    expect(panel.locator('[name=document-memo]')).to_be_hidden()
                    pad = panel.locator('.wf-signature').evaluate("""node=>{const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},canvas=node.querySelector('canvas'),label=node.querySelector('.signature-label h3'),clear=node.querySelector('.signature-label button'),placeholder=node.querySelector('.wf-sign-placeholder');return {canvas:rect(canvas),bitmap:{width:canvas.width,height:canvas.height},background:[...canvas.getContext('2d').getImageData(2,2,1,1).data],label:rect(label),clear:rect(clear),labelMargin:getComputedStyle(label.parentElement).margin,placeholder:rect(placeholder),alternativeExpanded:node.querySelector('details').open,errorOutline:getComputedStyle(node).outlineStyle};}""")
                    assert pad['bitmap'] == {'width': 342, 'height': 190} and pad['canvas']['height'] == 190, pad
                    assert pad['background'] == [242, 244, 246, 255] and not pad['alternativeExpanded'], pad
                    assert pad['labelMargin'] == '0px', pad
                    assert abs(pad['label']['y'] + pad['label']['height']/2 - pad['clear']['y'] - pad['clear']['height']/2) <= 1, pad
                    assert abs(pad['placeholder']['y'] + pad['placeholder']['height']/2 - pad['canvas']['y'] - 95) <= 1, pad
                    if state == 'missing':
                        expect(panel.locator('[data-workflow-error] svg')).to_be_visible()
                        assert pad['errorOutline'] == 'none', pad
                measurement = panel.evaluate("""panel => {
                  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
                  const box=rect(panel),targets=[panel.querySelector('.research-evidence-settings'),...panel.querySelectorAll('canvas')].filter(node=>node.checkVisibility());
                  const heading=getComputedStyle(panel.querySelector(':scope > h2')),cta=[...panel.querySelectorAll('.research-proof-next,[data-evidence-submit]')].find(node=>node.checkVisibility()),paint=getComputedStyle(cta),memo=panel.querySelector('[name=document-memo]'),shell=memo.closest('.input-shell');
                  return {screen:panel.dataset.reviewScenario,box,padding:getComputedStyle(panel).padding,layout:getComputedStyle(panel.querySelector('.research-evidence-settings')).display,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,headerCount:document.querySelectorAll('#order-app-header').length,targets:targets.map(rect),heading:{fontSize:heading.fontSize,lineHeight:heading.lineHeight},cta:{rect:rect(cta),background:paint.backgroundColor,color:paint.color},memo:memo.checkVisibility()?{rect:rect(memo),shell:shell?rect(shell):null,background:shell?getComputedStyle(shell).backgroundColor:null,labelMargin:getComputedStyle(memo.closest('.wf-field')).margin}:null,casePickerVisible:Boolean(panel.querySelector('select')?.checkVisibility()),prepareVisible:[...panel.querySelectorAll('button')].some(button=>button.textContent==='자료와 서명 준비'&&button.checkVisibility())};
                }""")
                assert measurement['padding'] == '24px' and measurement['layout'] == 'flex' and measurement['headerCount'] == 1, measurement
                assert measurement['documentWidth'] <= measurement['viewport'] + 1, measurement
                assert not measurement['casePickerVisible'] and not measurement['prepareVisible'], measurement
                assert all(target['width'] > 0 and target['height'] > 0 and target['x'] >= measurement['box']['x'] - 1 and target['x'] + target['width'] <= measurement['box']['x'] + measurement['box']['width'] + 1 for target in measurement['targets']), measurement
                assert measurement['heading']['fontSize'] == '28px' and abs(float(measurement['heading']['lineHeight'][:-2]) - 37.8) <= .1, measurement
                assert measurement['cta']['background'] == 'rgb(49, 93, 230)' and measurement['cta']['color'] == 'rgb(255, 255, 255)', measurement
                assert measurement['cta']['rect']['height'] == 52 and abs(measurement['cta']['rect']['width'] - measurement['box']['width'] + 48) <= .1, measurement
                if screen == 'proof':
                    memo = measurement['memo']
                    assert memo and memo['shell'] and memo['background'] == 'rgb(242, 244, 246)' and memo['labelMargin'] == '0px', measurement
                    assert memo['shell']['height'] == 120 and abs(memo['shell']['width'] - measurement['box']['width'] + 48) <= .1, measurement
                result['current'].append(measurement)
            assert page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length') == before
            capture(screen + '-' + state + '-simple-390', 'C542/C543 original proof/signature presentation restored; actual editor, fixture state and no submission')
    # Traverse both stages with trusted clicks and keep the same local editor,
    # selected pixels and memo. Preview/edit does not submit any of those pixels.
    select(page, 'proof', 'selected')
    expect(page.locator('.research-evidence-page[data-review-ready=true]')).to_be_visible()
    before_steps = page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length')
    page.locator('[name=document-memo]').fill('보관된 요청 🥚')
    page.evaluate("window.__evidenceStepNodes={canvas:document.querySelector('.research-evidence-pages canvas'),signature:document.querySelector('.wf-signature canvas'),memo:document.querySelector('[name=document-memo]')}")
    page.get_by_role('button', name='다음', exact=True).click()
    expect(page.locator('.research-evidence-page')).to_have_attribute('data-evidence-step', 'signature')
    expect(page.locator('.research-signature-pad')).to_be_visible()
    page.get_by_role('button', name='제출하기', exact=True).click()
    expect(page.locator('.wf-signature [data-workflow-error]')).to_be_visible()
    assert page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length') == before_steps
    page.locator('.research-evidence-pages canvas').click()
    expect(page.get_by_role('dialog', name='첨부 자료 크게 보기')).to_be_visible()
    page.get_by_role('button', name='확대', exact=True).click()
    page.get_by_role('button', name='가림 편집', exact=True).click()
    page.get_by_role('button', name='가림 저장', exact=True).click()
    page.get_by_role('button', name='닫기', exact=True).click()
    expect(page.get_by_role('dialog', name='첨부 자료 크게 보기')).to_be_hidden()
    page.get_by_role('button', name='자료 수정', exact=True).click()
    expect(page.locator('.research-evidence-page')).to_have_attribute('data-evidence-step', 'proof')
    assert page.evaluate("document.querySelector('.research-evidence-pages canvas')===__evidenceStepNodes.canvas&&document.querySelector('.wf-signature canvas')===__evidenceStepNodes.signature&&document.querySelector('[name=document-memo]')===__evidenceStepNodes.memo&&__evidenceStepNodes.memo.value==='보관된 요청 🥚'")
    assert page.evaluate('ORDER_RESEARCH_APP.adapter.fixture.inspect().calls.filter(call=>call.method==="POST").length') == before_steps
    result['sameEditorAcrossSteps'] = True
    result['limits'] = 'Original presentation requirements and all explicit fixture states checked. No user acceptance or external submission claimed.'
    return result


def panel_origin_probe(page, capture):
    result = {'requirement': 'C527 panel upper-right corner equals painted logo upper-right corner', 'states': [], 'phoneFields': []}
    for width in (320, 390, 1280):
        page.set_viewport_size({'width': width, 'height': 844})
        select(page, 'onboarding', 'member-1')
        trigger = page.locator('[data-order-account-trigger]')
        expect(trigger).to_be_visible()
        trigger.click()
        panel = page.locator('[data-order-account-panel]')
        expect(panel).to_be_visible()
        CAPTURE_TOOLS.settle(page)
        geometry = panel.evaluate("""node=>{const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},paths=[...document.querySelectorAll('[data-order-account-trigger] svg g>path')].map(rect),logo={top:Math.min(...paths.map(r=>r.y)),right:Math.max(...paths.map(r=>r.right))};return {panel:rect(node),trigger:rect(document.querySelector('[data-order-account-trigger]')),logo};}""")
        assert abs(geometry['panel']['right']-geometry['logo']['right']) <= .1, geometry
        assert abs(geometry['panel']['y']-geometry['logo']['top']) <= .1, geometry
        assert abs(geometry['panel']['y']-geometry['trigger']['y']) > 8, geometry
        result['states'].append({'width': width, **geometry})
        page.keyboard.press('Escape')
        expect(panel).to_be_hidden()
        select(page, 'profile', 'default')
        phone = page.locator('.research-account-panel .ui-phone-shell')
        expect(phone.locator('.ui-phone-part')).to_have_count(3)
        expect(phone).to_be_visible()
        measured = phone.evaluate("""shell=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},parts=[...shell.querySelectorAll('.ui-phone-part')],outer=shell.closest('.input-shell');return {display:getComputedStyle(shell).display,shell:rect(shell),outer:rect(outer),parts:parts.map(node=>({rect:rect(node),value:node.value,hit:document.elementFromPoint(node.getBoundingClientRect().x+node.getBoundingClientRect().width/2,node.getBoundingClientRect().y+node.getBoundingClientRect().height/2)===node})),separators:[...shell.querySelectorAll('.ui-phone-separator')].map(rect),regularValue:window.OrderPhone.get(parts[0])};}""")
        assert measured['display'] == 'flex' and measured['outer']['height'] == 64, measured
        assert len(measured['separators']) == 2 and all(part['hit'] for part in measured['parts']), measured
        assert ''.join(part['value'] for part in measured['parts']) == re.sub(r'\D', '', measured['regularValue']), measured
        assert all(part['value'] for part in measured['parts']), measured
        assert max(part['rect']['y'] for part in measured['parts']) - min(part['rect']['y'] for part in measured['parts']) <= .1, measured
        for rect in [part['rect'] for part in measured['parts']] + measured['separators']:
            assert rect['width'] > 0 and rect['height'] > 0 and rect['x'] >= measured['outer']['x'] and rect['right'] <= measured['outer']['right'] and rect['y'] >= measured['outer']['y'] and rect['bottom'] <= measured['outer']['bottom'], measured
        result['phoneFields'].append({'width': width, **measured})
        page.keyboard.press('Escape')
        expect(panel).to_be_hidden()
    page.set_viewport_size({'width': 390, 'height': 844})
    for screen, state in [('profile', 'menu'), ('profile', 'default'), ('profile', 'notification'), ('notifications', 'list')]:
        select(page, screen, state)
        CAPTURE_TOOLS.settle(page)
        if screen == 'profile':
            panel = page.locator('[data-order-account-panel]')
            expect(panel).to_be_visible()
            geometry = panel.evaluate("""node=>{const r=node.getBoundingClientRect(),paths=[...document.querySelectorAll('[data-order-account-trigger] svg g>path')].map(n=>n.getBoundingClientRect());return {top:r.top,right:r.right,logoTop:Math.min(...paths.map(r=>r.top)),logoRight:Math.max(...paths.map(r=>r.right))};}""")
            assert abs(geometry['top']-geometry['logoTop']) <= .1 and abs(geometry['right']-geometry['logoRight']) <= .1, geometry
        capture(screen + '-' + state + '-simple-390', 'C527 actual painted-logo corner and authenticated parent context')
    return result


def existing_presentation_probe(page, capture):
    select(page, 'business', 'empty')
    date = page.locator('.opening-date>button')
    expect(date).to_be_visible()
    business = date.evaluate('''button => {const text=button.querySelector('output'),a=getComputedStyle(button),b=getComputedStyle(text);return {labelColor:a.color,dateColor:b.color,labelFont:a.font,dateFont:b.font,requiredStars:document.querySelectorAll('.required-star').length};}''')
    assert business['labelColor'] == business['dateColor'] and business['labelFont'] == business['dateFont'], business
    assert business['requiredStars'] == 0, business
    page.screenshot(path=str(OUT / 'business-placeholder-date-390.png'), full_page=True)
    capture('business-placeholder-date-390', 'Existing business/empty inspect route; date label/output font and color assertions passed')
    select(page, 'onboarding', 'company')
    shade = page.locator('.ob-shade')
    expect(shade).to_be_visible()
    company = shade.evaluate('''node => {const h=document.querySelector('#order-app-header'),r=h.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {topLayer:node.matches(':popover-open'),headerInert:h.inert,headerCovered:hit!==h&&!h.contains(hit),blur:getComputedStyle(node).backdropFilter};}''')
    assert company['topLayer'] and company['headerInert'] and company['headerCovered'], company
    assert 'blur(' in company['blur'], company
    page.locator('[data-company-close]').click()
    expect(shade).to_be_hidden()
    assert page.locator('#order-app-header').evaluate('el=>el.inert') is False
    select(page, 'signup', 'empty')
    page.locator('.product-auth-sheet [data-action=open-terms]').click()
    terms = page.locator('.product-auth-sheet .terms-page')
    expect(terms.locator('[name=terms-check]')).to_be_visible()
    expect(terms.locator('[data-action=back]')).to_be_visible()
    assert terms.locator('.page-title,.pm-policy-meta,[data-policy-meta],.page-head b').count() == 0
    consent = terms.evaluate('node=>({back:node.querySelectorAll("[data-action=back]").length,checkbox:node.querySelectorAll("[name=terms-check]").length})')
    page.keyboard.press('Escape')
    # A fresh authored read route has no retained signup terms session.
    page.goto(page.url.split('?')[0] + '?view=research-r3&screen=terms&state=required')
    terms = page.locator('.product-auth-sheet .terms-page')
    expect(terms).to_be_visible()
    assert terms.locator('.page-title,.pm-policy-meta,[data-policy-meta],.page-head,.check-row,.bottom-actions').count() == 0
    filters = terms.locator('.segmented>button').evaluate_all('nodes=>nodes.map(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}))')
    assert len(filters) == 3 and all(x['background'] == 'rgb(32, 39, 43)' and x['color'] == 'rgb(255, 255, 255)' for x in filters), filters
    page.screenshot(path=str(OUT / 'terms-read-context-390.png'), full_page=True)
    return {'business': business, 'company': company, 'signupTerms': consent, 'readTermsFilters': filters}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    log = (OUT / 'host.stderr.log').open('w')
    host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=log, text=True)
    receipt = {'status': 'RUNNING', 'nativeExecution': False, 'commercialAcceptance': False, 'userAcceptance': False,
               'reviewHoldUnchanged': True, 'figmaWrite': False, 'checks': [], 'supplementalCaptures': []}
    cfg = {}
    try:
        receipt['source'] = CAPTURE_TOOLS.build_identity()
        receipt['source']['runner'] = CAPTURE_TOOLS.file_identity(Path(__file__))
        ready, _, _ = select_io.select([host.stdout], [], [], 30)
        assert ready, 'Loopback host did not publish its ready URL within 30 seconds'
        cfg = json.loads(host.stdout.readline())
        assert re.fullmatch(r'http://127\.0\.0\.1:\d+', cfg['url']), 'Only the isolated loopback host is allowed'
        with sync_playwright() as driver:
            browser = driver.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'), args=['--no-sandbox'])
            receipt.update(nativeExecution=True, browserVersion=browser.version,
                           executionEnvironment='CI' if os.environ.get('CI') else 'explicit-native-run')
            context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='no-preference')
            page = context.new_page()
            page_errors, forbidden_writes, font_responses = [], [], []
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.on('request', lambda request: forbidden_writes.append({'method': request.method, 'url': request.url}) if request.method not in ('GET', 'HEAD', 'OPTIONS') and '/api/ia/auth/' not in request.url and '/login' not in request.url else None)
            page.on('response', lambda response: font_responses.append(response) if response.request.resource_type == 'font' else None)
            capture = lambda label, interaction: measured_state_capture(page, label, interaction, receipt['source'], font_responses, receipt)
            page.goto(cfg['url'] + '/ia?view=research-r3&screen=onboarding&state=guest-2')
            page.locator('input[name=email]').fill(cfg['email'])
            page.locator('input[name=password]').fill(cfg['pass'])
            page.locator('#submit').click()
            # The app exposes its controller before its first async scene has
            # mounted; wait for the emitted initial route as well.
            wait_for_expression(page, 'Boolean(window.ORDER_RESEARCH_APP)&&document.documentElement.dataset.productScreen==="onboarding"&&document.documentElement.dataset.productState==="guest-2"')
            expect(page.locator('#order-app-page .ob')).to_be_visible()
            assert page.locator('iframe').count() == 0
            receipt['headerGeometry'] = {'guest': header_geometry_probe(page, 'guest', receipt['source'])}
            receipt['input'] = input_probe(page)
            receipt['checks'].append('C638 native Pretendard glyph geometry, rapid typing, middle selection, trusted IME, password masking and reduced motion')
            receipt['morph'] = morph_probe(page)
            receipt['checks'].append('C533 native first/last frame surface and label handoff')
            receipt['headerGeometry']['member'] = header_geometry_probe(page, 'member', receipt['source'])
            receipt['checks'].append('Protected original Guest/Member 390px header element frames; separate native glyph, font and PNG evidence without ink-match acceptance')
            receipt['consultationPass'] = consultation_pass_probe(page)
            receipt['checks'].append('a778707d canonical compound pass expansion/shrink, top layer, focus, retained draft and reduced motion')
            receipt['passLoading'] = pass_loading_probe(page)
            receipt['checks'].append('e3b7703c pass silhouettes, measured skeleton geometry and three gray brand dots')
            receipt['passTear'] = pass_tear_probe(page, capture)
            receipt['checks'].append('a5dc1435 native partial tear, 48px confirmation, failure/cancel restore and ACK-gated visual separation in memory fixture')
            receipt['evidencePresentation'] = evidence_presentation_probe(page, capture)
            receipt['panelOrigin'] = panel_origin_probe(page, capture)
            receipt['checks'].append('C542/C543 original signature layout and two retained evidence steps; C527 painted-logo panel corner at320/390/1280; no submission while viewing')
            receipt['presentation'] = existing_presentation_probe(page, capture)
            receipt['checks'].append('C713 date placeholder paint; C534 header-covering top-layer blur; C683/C684/C686/C687/C688/C691 terms contexts')
            receipt['pageErrors'], receipt['forbiddenWrites'] = page_errors, forbidden_writes
            assert page_errors == [] and forbidden_writes == [], {'pageErrors': page_errors, 'forbiddenWrites': forbidden_writes}
            receipt['status'] = 'PASS'
            browser.close()
    except Exception as error:
        receipt['status'] = 'FAIL'
        text = str(error)
        for key in ('email', 'pass'):
            if cfg.get(key):
                text = text.replace(cfg[key], '[throwaway-owner]')
        receipt['failure'] = text
        raise RuntimeError(text) from None
    finally:
        (OUT / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        host.terminate()
        host.wait(timeout=10)
        log.close()
    print('PASS research UI feedback: ' + str(len(receipt['checks'])) + ' native scopes')


if __name__ == '__main__':
    main()
