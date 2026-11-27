"""Native Q1/Q2 feedback checks and measured Q1–Q4 hifi capture.

The existing QA route chooses each original fixture. Its acknowledged iframe
remains inside the real review host at measured scale 1. No model injection,
QA status write, Figma write, build
generation or production operation occurs. Run in CI Chrome; compilation of
this file is not a native-browser pass.
"""
from hashlib import sha256
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit
import json
import os
import re
import shutil
import struct
import subprocess
from playwright.sync_api import sync_playwright, expect
from r3_feedback_browser_support import prepare_review_ready, wait_review_session
from research_export_browser_support import research_snapshot_identity
from browser_predicate_support import wait_for_expression

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/research-quote-feedback'
CAPTURE = (ROOT / 'tests/helpers/research-quote-capture.js').read_text()
STYLE_KEYS = ['display', 'visibility', 'opacity', 'font-family', 'font-size', 'font-weight',
              'line-height', 'letter-spacing', 'color', 'background-color', 'border-radius',
              'transform', 'overflow-x', 'overflow-y']
MOBILE = [('q1', state, mode, 390) for mode in ('simple', 'detailed') for state in ('before', 'selected', 'edit', 'error')]
MOBILE += [('q2', state, mode, 390) for mode in ('simple', 'detailed') for state in ('empty', 'filled', 'error')]
MOBILE += [('q2', 'unknown', 'simple', 390), ('q2', 'mixed', 'detailed', 390)]
MOBILE += [(screen, state, 'detailed', 390) for screen, states in (
    ('q3', ('closed', 'open', 'incomplete', 'long-name')), ('q4', ('closed', 'open', 'mixed', 'missing'))) for state in states]
MOBILE += [(screen, state, 'simple', 390) for screen, states in (
    ('q3', ('closed', 'open')), ('q4', ('closed', 'open', 'missing'))) for state in states]
DESKTOP = [(screen, state, mode, 1280) for mode in ('simple', 'detailed') for screen, state in (('q1', 'before'), ('q2', 'filled'))]
DESKTOP += [('q3', 'closed', 'detailed', 1280), ('q4', 'open', 'detailed', 1280)]
RELATED = [('quote-wait', state, 'simple', 390) for state in ('entry', 'comparing', 'delayed', 'complete', 'offline', 'server-error')]
RELATED += [('quote-result', state, 'simple', 390) for state in ('expired', 'recompare', 'no-result', 'locked', 'locked-guest')]
RELATED += [(screen, state, 'simple', 390) for screen, state in (
    ('signature', 'empty'), ('proof', 'empty'), ('profile', 'notification'), ('notifications', 'list'),
    ('passes', 'loading'), ('drawer', 'closed'))]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.name.endswith('.chrome-layout.json') and isinstance(value, dict) and 'uaShadowLayout' in value:
        sidecar_path = path.with_name(path.name.replace('.chrome-layout.json', '.ua-shadow-layout.json'))
        write_json(sidecar_path, value['uaShadowLayout'])
        value = {key: item for key, item in value.items() if key != 'uaShadowLayout'}
        value['uaShadowLayoutArtifact'] = file_identity(sidecar_path)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def screenshot_identity(path):
    raw = path.read_bytes()
    dimensions = struct.unpack('>II', raw[16:24])
    return {'file': path.name, 'bytes': len(raw), 'sha256': sha256(raw).hexdigest(),
            'observedAfterScreenshotAt': datetime.now(timezone.utc).isoformat(),
            'pngDimensions': {'width': dimensions[0], 'height': dimensions[1]}}


def file_identity(path):
    data = path.read_bytes()
    return {'file': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha256(data).hexdigest()}


def build_identity():
    result = subprocess.run(['node', '--input-type=module', '-e',
        "import {researchBuild} from './src/server/research-app/assets.gen.mjs';import {productFontUrl,productFontSha256} from './src/server/product-fonts.mjs';console.log(JSON.stringify({build:researchBuild,font:{url:productFontUrl,sha256:productFontSha256}}));"],
        cwd=ROOT, text=True, capture_output=True, check=True)
    generated = json.loads(result.stdout)
    build, font = generated['build'], generated['font']
    assert re.fullmatch(r'[a-f0-9]{64}', build['digest'])
    stale = [path for path, digest in build['sources'].items() if not (ROOT / path).is_file() or sha256((ROOT / path).read_bytes()).hexdigest() != digest]
    assert not stale, 'Capture refuses a stale compiled build: ' + ', '.join(stale)
    for path in ('quote-form-style.mjs', 'quote-mode-presentation.mjs', 'quote-source-adapter.mjs', 'quote-workspace.mjs'):
        assert 'src/server/research-app/' + path in build['sources'], path
    if os.environ.get('R3_RESEARCH_BUILD'):
        assert os.environ['R3_RESEARCH_BUILD'] == build['digest']
    assert sha256((ROOT / 'public' / font['url'].lstrip('/')).read_bytes()).hexdigest() == font['sha256']
    return {'build': build, 'font': font, 'gitHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'runner': file_identity(Path(__file__)), 'reader': file_identity(ROOT / 'tests/helpers/research-quote-capture.js'),
            'fixtureOwner': {'file': 'src/server/research-app/quote-source-adapter.mjs', 'function': 'researchBridge.applyScenario',
                             'sha256': build['sources']['src/server/research-app/quote-source-adapter.mjs']},
            'relatedFixtureOwners': [{'file': file, 'sha256': build['sources'][file]} for file in
                ('src/server/research-app/environment.mjs', 'src/server/r3-ui/qa-fixture-adapter.mjs')],
            'allCompiledSourceHashesMatched': True}


class ProductSurface:
    """Operate the real same-origin QA frame without rewriting its shell."""
    def __init__(self, page, frame):
        self.native_page, self.frame = page, frame
        self.container = page.locator('#frame')
        self.context, self.mouse = page.context, page.mouse

    def locator(self, *args, **kwargs):
        return self.frame.locator(*args, **kwargs)

    def evaluate(self, *args, **kwargs):
        return self.frame.evaluate(*args, **kwargs)

    def wait_for_expression(self, expression, *, timeout=30000):
        # The CDP helper targets the real Page. Bind the read-only predicate's
        # three used globals to its actual same-origin product frame; do not
        # pass this wrapper to new_cdp_session or enable unsafe page eval.
        predicate = '''(() => {
            const frame=document.getElementById('frame'),doc=frame?.contentDocument;
            if(!doc)return false;
            return ((window,document,ORDER_RESEARCH_APP) => (''' + expression + '''))(
                frame.contentWindow,doc,frame.contentWindow.ORDER_RESEARCH_APP);
        })()'''
        return wait_for_expression(self.native_page, predicate, timeout=timeout)

    def close(self):
        # The next actual QA navigation disposes this app through its owner.
        pass

    def screenshot(self, path):
        self.container.screenshot(path=str(path), animations='allow')

    def parent_geometry(self):
        return self.container.evaluate('''frame=>({
            rect:frame.getBoundingClientRect().toJSON(),width:frame.contentWindow.innerWidth,height:frame.contentWindow.innerHeight,
            scaleX:frame.getBoundingClientRect().width/frame.contentWindow.innerWidth,
            scaleY:frame.getBoundingClientRect().height/frame.contentWindow.innerHeight,
            parentViewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
            clipping:[...function*(node){for(;node;node=node.parentElement)yield node;}(frame.parentElement)].map(node=>({
                className:node.className,rect:node.getBoundingClientRect().toJSON(),overflowX:getComputedStyle(node).overflowX,
                overflowY:getComputedStyle(node).overflowY,borderRadius:getComputedStyle(node).borderRadius,transform:getComputedStyle(node).transform}))})''')



def chrome_ua_shadow_layout(cdp, page, root_backend):
    """Read the same product root's native control shadow text using this CDP client.

    No DOM/style/focus/input mutation. A deprecated-method failure is reported
    as unavailable evidence; it does not alter any pre-existing native gate.
    """
    before = datetime.now(timezone.utc).isoformat()
    identity = page.evaluate('''() => {
        const root=document.getElementById('order-single'),app=window.ORDER_RESEARCH_APP?.snapshot();
        return {rootPresent:!!root,build:document.documentElement.dataset.productBuild,
          appBuild:app?.build,route:app?.route,url:location.href,
          viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,devicePixelRatio}};
    }''')
    result = {'format':'order-chrome-native-control-shadow/v1',
        'observedBeforeSnapshotAt':before,'sourceIdentity':identity,
        'rootBackendNodeId':root_backend,'includeUserAgentShadowTree':True,
        'coordinates':'Native document CSS pixels; Range viewport rects include observed document scroll conversion',
        'captureSnapshotRetained':True,'domMutations':0,'focusWrites':0,
        'reader':file_identity(Path(__file__)),'nativeGateUnchanged':True,
        'layout':[],'unresolvedCharacterBounds':[]}
    keys = STYLE_KEYS + ['font-variant-numeric','font-feature-settings','text-align',
        'padding-top','padding-right','padding-bottom','padding-left','direction']
    try:
        raw = cdp.send('DOMSnapshot.getSnapshot', {'computedStyleWhitelist':keys,
            'includeUserAgentShadowTree':True,'includePaintOrder':True,
            'includeEventListeners':False})
        nodes, layouts, styles = raw['domNodes'], raw['layoutTreeNodes'], raw['computedStyles']
        roots = [i for i,n in enumerate(nodes) if n.get('backendNodeId')==root_backend]
        assert len(roots)==1, 'UA sidecar must retain the exact captureSnapshot product root'
        attrs = lambda n:{a['name']:a['value'] for a in n.get('attributes',[])}
        selected, parents, owners, stack = set(), {}, {}, [(roots[0],None,None)]
        while stack:
            index,parent,owner=stack.pop()
            if index in selected:continue
            selected.add(index);parents[index]=parent
            node=nodes[index]
            if node['nodeName'] in ('INPUT','TEXTAREA','SELECT'):
                owner=index
            owners[index]=owner
            children=node.get('childNodeIndexes',[])+node.get('pseudoElementIndexes',[])
            if 'contentDocumentIndex' in node:children.append(node['contentDocumentIndex'])
            stack.extend((child,index,owner) for child in reversed(children))
        for index,layout in enumerate(layouts):
            at=layout['domNodeIndex'];owner=owners.get(at)
            if at not in selected or owner is None:continue
            node,control=nodes[at],nodes[owner]
            control_attrs=attrs(control)
            if control_attrs.get('type','').lower()=='password':continue
            style_index=layout.get('styleIndex')
            record={'nativeLayoutIndex':index,'nodeIndex':at,'parentNodeIndex':parents.get(at),
                'backendNodeId':node['backendNodeId'],'tag':node['nodeName'],
                'domId':attrs(node).get('id'),'shadowRootType':node.get('shadowRootType'),
                'controlNodeIndex':owner,'controlBackendNodeId':control['backendNodeId'],
                'controlId':control_attrs.get('id'),'controlTag':control['nodeName'],
                'controlType':control_attrs.get('type'),'bounds':layout['boundingBox'],
                'text':layout.get('layoutText',''),'textBoxes':layout.get('inlineTextNodes',[]),
                'style':{p['name']:p['value'] for p in styles[style_index]['properties']} if style_index is not None else {},
                'paintOrder':layout.get('paintOrder')}
            if node['nodeType']==3 and record['text']:
                try:
                    obj=cdp.send('DOM.resolveNode',{'backendNodeId':node['backendNodeId'],
                        'objectGroup':'order-native-ua-text'})['object']
                    observed=cdp.send('Runtime.callFunctionOn',{'objectId':obj['objectId'],
                        'functionDeclaration':'''function(){
                          const doc=this.ownerDocument,win=doc.defaultView,text=this.nodeValue||'',ranges=[];
                          let offset=0;
                          for(const character of text){
                            const range=doc.createRange();range.setStart(this,offset);range.setEnd(this,offset+character.length);
                            const rects=[...range.getClientRects()].map(r=>({x:r.x+win.scrollX,y:r.y+win.scrollY,width:r.width,height:r.height}));
                            ranges.push({text:character,startUtf16:offset,lengthUtf16:character.length,rects});offset+=character.length;
                          }
                          const p=this.parentElement,css=p?win.getComputedStyle(p):null;
                          return {text,ranges,scroll:{x:win.scrollX,y:win.scrollY},
                            typography:css?{fontFamily:css.fontFamily,fontSize:css.fontSize,fontWeight:css.fontWeight,
                              lineHeight:css.lineHeight,letterSpacing:css.letterSpacing,color:css.color,
                              fontVariantNumeric:css.fontVariantNumeric,fontFeatureSettings:css.fontFeatureSettings,
                              opacity:css.opacity,visibility:css.visibility}:null,
                            method:'native-Range-on-actual-UA-shadow-text',domMutations:0};
                        }''','returnByValue':True})
                    if observed.get('exceptionDetails'):
                        raise RuntimeError(observed['exceptionDetails'].get('text','UA Range read unavailable'))
                    record['characterBounds']=observed['result']['value']
                    assert record['characterBounds']['text']==record['text'], 'Native control text changed during UA read'
                except Exception as error:
                    result['unresolvedCharacterBounds'].append({'backendNodeId':node['backendNodeId'],
                        'controlId':control_attrs.get('id'),'error':str(error).splitlines()[0]})
            result['layout'].append(record)
        result['status']='OBSERVED'
        result['nativeControlCount']=len({r['controlBackendNodeId'] for r in result['layout']})
        result['observedCharacterTextNodes']=sum('characterBounds' in r for r in result['layout'])
    except Exception as error:
        result.update(status='UNAVAILABLE',error=str(error).splitlines()[0])
    finally:
        try:cdp.send('Runtime.releaseObjectGroup',{'objectGroup':'order-native-ua-text'})
        except Exception:pass
    result['observedAfterSnapshotAt']=datetime.now(timezone.utc).isoformat()
    return result


def chrome_layout(page):
    """Retain Chrome's own layout/text boxes, including native-control text.

    Only nodes below the product root are exported; script contents, attributes
    outside the product and sign-in form state are omitted.
    """
    observed_before = page.evaluate('new Date().toISOString()')
    cdp = page.context.new_cdp_session(page.native_page)
    cdp.send('DOM.enable')
    cdp.send('CSS.enable')
    cdp.send('DOM.getDocument', {'depth': 0})
    raw = cdp.send('DOMSnapshot.captureSnapshot', {'computedStyles': STYLE_KEYS,
        'includePaintOrder': True, 'includeDOMRects': True})
    strings = raw['strings']
    string = lambda index: strings[index] if index >= 0 else ''
    candidates = []
    for candidate in raw['documents']:
        values = candidate['nodes'].get('attributes', [])
        if any(any(string(pair[i]) == 'id' and string(pair[i + 1]) == 'order-single' for i in range(0, len(pair), 2)) for pair in values):
            candidates.append(candidate)
    assert len(candidates) == 1, 'Only the current product iframe can supply native layout'
    document = candidates[0]
    nodes, layout, boxes = document['nodes'], document['layout'], document['textBoxes']
    attrs = lambda index: {strings[pairs[n]]: strings[pairs[n + 1]] for pairs in [nodes['attributes'][index]] for n in range(0, len(pairs), 2)}
    roots = [i for i in range(len(nodes['nodeName'])) if attrs(i).get('id') == 'order-single']
    assert len(roots) == 1, 'Exactly one retained product root is required'
    root = roots[0]
    selected = set()
    for index, parent in enumerate(nodes['parentIndex']):
        if index == root or parent in selected:
            selected.add(index)
    records, lookup, font_parents = [], {}, set()
    for index, node in enumerate(layout['nodeIndex']):
        if node not in selected:
            continue
        text = string(layout['text'][index])
        attrs_here = attrs(node)
        record = {'nativeLayoutIndex': index, 'nodeIndex': node, 'parentNodeIndex': nodes['parentIndex'][node],
                  'backendNodeId': nodes['backendNodeId'][node], 'tag': strings[nodes['nodeName'][node]],
                  'domId': attrs_here.get('id'), 'class': attrs_here.get('class'), 'text': text,
                  'bounds': layout['bounds'][index], 'style': {name: string(value) for name, value in zip(STYLE_KEYS, layout['styles'][index])},
                  'paintOrder': layout.get('paintOrders', [None] * len(layout['nodeIndex']))[index], 'textBoxes': []}
        if 'clientRects' in layout:
            record['clientRect'] = layout['clientRects'][index]
        if 'scrollRects' in layout:
            record['scrollRect'] = layout['scrollRects'][index]
        lookup[index] = record
        records.append(record)
        if text.strip():
            parent = nodes['parentIndex'][node] if strings[nodes['nodeName'][node]] == '#text' else node
            if parent >= 0:
                font_parents.add(nodes['backendNodeId'][parent])
    for offset, index in enumerate(boxes['layoutIndex']):
        if index in lookup:
            start, length = boxes['start'][offset], boxes['length'][offset]
            lookup[index]['textBoxes'].append({'bounds': boxes['bounds'][offset], 'startUtf16': start, 'lengthUtf16': length,
                'text': lookup[index]['text'].encode('utf-16-le')[start * 2:(start + length) * 2].decode('utf-16-le')})
    used, unresolved = [], []
    for backend in sorted(font_parents):
        try:
            node_id = cdp.send('DOM.pushNodesByBackendIdsToFrontend', {'backendNodeIds': [backend]})['nodeIds'][0]
            fonts = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node_id})['fonts']
            used.append({'backendNodeId': backend, 'fonts': fonts})
        except Exception as error:
            unresolved.append({'backendNodeId': backend, 'error': str(error).split('\n')[0]})
    ua_shadow = chrome_ua_shadow_layout(cdp, page, nodes['backendNodeId'][root])
    cdp.detach()
    actual_fonts = sorted({(f['familyName'], f.get('postScriptName', ''), f['isCustomFont']) for row in used for f in row['fonts'] if f['glyphCount'] > 0})
    assert actual_fonts, 'Chrome must report fonts that actually painted glyphs'
    return {'format': 'order-chrome-quote-layout/v1', 'observedBeforeSnapshotAt': observed_before,
            'observedAfterSnapshotAt': page.evaluate('new Date().toISOString()'), 'coordinates': 'document CSS pixels; native DOMSnapshot bounds',
            'uaShadowLayout': ua_shadow,
            'layout': records, 'platformFonts': used, 'unresolvedPlatformFonts': unresolved,
            'actualFontFamilies': [{'family': family, 'postScriptName': ps, 'isCustomFont': custom} for family, ps, custom in actual_fonts]}


def system_font_identity(font):
    if font['isCustomFont']:
        return {**font, 'fileSource': 'loaded-font-response; see resource hashes and @font-face rules'}
    if not shutil.which('fc-match'):
        return {**font, 'fileSource': 'unavailable', 'fileHashObserved': False}
    pattern = ':postscriptname=' + font['postScriptName'] if font['postScriptName'] else font['family']
    matched = subprocess.check_output(['fc-match', '--format', '%{file}\n%{family}\n%{postscriptname}', pattern], text=True).splitlines()
    path = Path(matched[0])
    exact = bool(len(matched) > 1 and font['family'] in matched[1].split(',')) or bool(font['postScriptName'] and len(matched) > 2 and font['postScriptName'] in matched[2].split(','))
    return {**font, 'fileSource': 'fontconfig', 'matchedFile': str(path), 'fontconfigExactFamilyOrPostScript': exact,
            'fileHashObserved': path.is_file(), **({'fileBytes': path.stat().st_size, 'fileSha256': sha256(path.read_bytes()).hexdigest()} if path.is_file() else {})}


def settle(page):
    page.evaluate('''async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished));
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    }''')


def page_quote(page):
    return page.evaluate('ORDER_RESEARCH_APP.snapshot().quote')


def wait_error_controls(page, width, state):
    scene = page.locator('[data-wait-scene]')
    expect(scene).to_have_attribute('data-phase', 'offline' if state == 'offline' else 'error')
    seen = scene.evaluate("""el => {
        const avatar = getComputedStyle(el.querySelector('.mf-wait-avatar'));
        const footer = el.querySelector('.mf-actions');
        const buttons = [...footer.querySelectorAll('button')].map(button => {
            const box = button.getBoundingClientRect(), css = getComputedStyle(button);
            const center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return {label: button.textContent.trim(), x: box.x, y: box.y, width: box.width,
                height: box.height, radius: css.borderTopLeftRadius, bg: css.backgroundColor,
                fontSize: css.fontSize, fontWeight: css.fontWeight, hit: button.contains(center)};
        });
        return {viewport: innerWidth, outline: avatar.outlineStyle, opacity: avatar.opacity,
            width: footer.getBoundingClientRect().width, buttons};
    }""")
    assert seen['viewport'] == width and seen['outline'] == 'none' and abs(float(seen['opacity']) - .72) < .001, seen
    back, retry = seen['buttons']
    assert [back['label'], retry['label']] == ['돌아가기', '다시 비교하기'], seen
    assert [back['bg'], retry['bg']] == ['rgb(241, 243, 246)', 'rgb(49, 93, 230)'], seen
    assert abs(retry['x'] - back['x'] - back['width'] - 10) < .1 and abs(back['y'] - retry['y']) < .1, seen
    for button in (back, retry):
        assert button['hit'] and button['height'] >= 54 and abs(2 * button['width'] + 10 - seen['width']) < .1, seen
        assert button['radius'] == '12px' and button['fontWeight'] == '650', seen
        assert button['fontSize'] == ('16px' if width < 360 else '17px'), seen
    return seen


def qa_mode_navigation_checks(open_source, receipt):
    page, identity, _ = open_source('q1', 'before', 'simple', 390)
    try:
        host = page.native_page
        simple = host.locator('#catalog button[data-module="q1"][data-quote-mode="simple"]')
        detailed = host.locator('#catalog button[data-module="q1"][data-quote-mode="detailed"]')
        expect(simple).to_have_count(1)
        expect(detailed).to_have_count(1)
        assert '간편 견적' in simple.inner_text() and '상세 견적' in detailed.inner_text()
        observations = []
        for mode, control in [('detailed', detailed), ('simple', simple)]:
            with host.expect_response(lambda response: '/r3-qa/artifact?' in response.url and
                    'id=q1%2Fbefore%2Femail' in response.url and
                    ('mode=detailed' in response.url) == (mode == 'detailed')) as response:
                control.click()
            artifact = response.value.json()
            page.wait_for_expression('ORDER_RESEARCH_APP.snapshot().route.mode===' + json.dumps(mode) +
                '&&document.getElementById("order-single").__orderResearchInspector.inspect().session.artifact===' + json.dumps(artifact['hash']))
            expect(control).to_have_attribute('aria-current', 'page')
            for screen in ('q2', 'q3', 'q4'):
                expect(host.locator('#catalog button[data-module="' + screen + '"][data-quote-mode="' + mode + '"]')).to_have_count(1)
            observations.append({'mode': mode, 'artifactHash': artifact['hash'], 'url': host.url,
                'footerCount': host.locator('#open-total').inner_text()})
        assert observations[0]['artifactHash'] != observations[1]['artifactHash']
        assert observations[0]['footerCount'] == observations[1]['footerCount'], 'Changing calculator mode must not hide other review counts'
        receipt['checks'].append({'check': 'C624 separate QA menu buttons select distinct simple/detailed sources', 'initialSource': identity, 'observed': observations})
    finally:
        page.close()


def assert_q1_missing_group(page, group):
    seen = page.locator('#picks-' + group).evaluate("""group => {
      const style = getComputedStyle(group);
      return {outer: [style.borderTopWidth, style.outlineWidth, style.boxShadow],
        choices: [...group.querySelectorAll('[data-pick]')].map(button => {
          const paint = getComputedStyle(button);
          return [button.getAttribute('aria-invalid'), button.getAttribute('aria-describedby'),
            paint.borderTopWidth, paint.borderTopStyle, paint.borderTopColor];
        })};
    }""")
    assert seen['outer'] == ['0px', '0px', 'none'], seen
    assert seen['choices'] and all(choice == ['true', 'err-q1', '1px', 'solid', 'rgb(217, 45, 72)']
                                   for choice in seen['choices']), seen


def core_checks(open_source, receipt):
    for mode, helper in [('simple', '계란 규격을 선택해 주세요.'), ('detailed', '계란 제품을 한 개 이상 선택해 주세요.')]:
        page, identity, _ = open_source('q1', 'before', mode, 390)
        try:
            page.locator('#to-result').click()
            expect(page.locator('#err-q1')).to_have_text(helper)
            for group in ('housing', 'size', 'pack'):
                assert_q1_missing_group(page, group)
            page.locator('[data-pick=housing][data-value="1"]').click()
            assert page.locator('#picks-housing [aria-invalid=true]').count() == 0
            for group in ('size', 'pack'):
                assert_q1_missing_group(page, group)
            page.locator('[data-pick=size][data-value="대란"]').click()
            page.locator('[data-pick=pack][data-value="30"]').click()
            page.wait_for_expression('ORDER_RESEARCH_APP.snapshot().quote.lines.length===1')
            expect(page.locator('#err-q1')).to_be_hidden()
            line = page_quote(page)['lines'][0]
            assert all(line[key] == value for key, value in [('housing', '1'), ('size', '대란'), ('pack', '30'), ('qty', '')])
            receipt['checks'].append({'check': 'Q1 real completion, individual missing-field exposure and per-group repair', 'mode': mode, 'initialSource': identity, 'line': line})
        finally:
            page.close()

    page, identity, _ = open_source('q2', 'empty', 'detailed', 390)
    try:
        for selector, value in (('[data-line-qty]', '100'), ('[data-line-price]', '5000')):
            page.locator(selector).first.fill(value)
            page.locator(selector).first.press('Tab')
        page.wait_for_expression("(()=>{const l=ORDER_RESEARCH_APP.snapshot().quote.lines[0];return l.qty==='100'&&l.price==='5000';})()")
        page.locator('.accordion-trigger[data-open=q1]').first.click()
        row = page.locator('#added-lines [data-saved-row]').first
        expect(row.locator('.saved-quantity-tags > span').nth(0)).to_have_text('월 100판')
        expect(row.locator('.saved-quantity-tags > span').nth(1)).to_have_text('월 구매액 500,000원')
        assert row.locator('.saved-quantity-tags button').count() == 0
        before = page_quote(page)
        row.locator('[data-edit]').click()
        expect(page.locator('#sku-dialog')).to_be_visible()
        page.locator('#cancel-sku').click()
        expect(page.locator('#sku-dialog')).to_be_hidden()
        assert page_quote(page) == before
        box = row.bounding_box()
        assert box
        page.mouse.move(box['x'] + box['width'] * .75, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] * .2, box['y'] + box['height'] / 2, steps=8)
        page.mouse.up()
        expect(row).to_have_attribute('data-saved-open', 'true')
        row.locator('[data-remove]').click()
        expect(page.locator('#sku-delete-dialog')).to_be_visible()
        page.locator('#sku-delete-cancel').click()
        expect(page.locator('#sku-delete-dialog')).to_be_hidden()
        assert page_quote(page) == before
        receipt['checks'].append({'check': 'Q2 native numeric input -> regular Q1 tags; row edit and swipe-delete cancellation', 'initialSource': identity,
                                  'quantity': before['lines'][0]['qty'], 'price': before['lines'][0]['price'], 'cancelPreservedExactQuote': True})
    finally:
        page.close()


def confirmation_presentation(page, reference=False):
    return page.evaluate("""reference=>{
        const surface=document.querySelector(reference?'#quote-mode-dialog':'dialog.oq-dialog[open]'),
          panel=reference?surface.querySelector('.q1-confirm'):surface,
          title=panel.querySelector(reference?'h2':'.oq-dialog-title'),
          group=reference?panel.querySelector('.ui-transaction-group'):panel,
          css=getComputedStyle(surface),inside=getComputedStyle(panel),heading=getComputedStyle(title);
        const buttons=[...panel.querySelectorAll(reference?'.ui-transaction-action':'.oq-choice')].map(node=>{
          const c=getComputedStyle(node);return {height:node.getBoundingClientRect().height,
            radius:c.borderRadius,background:c.backgroundColor,color:c.color,fontSize:c.fontSize,
            fontWeight:c.fontWeight,lineHeight:c.lineHeight};
        });
        return {width:surface.getBoundingClientRect().width,radius:reference?inside.borderRadius:css.borderRadius,
          background:inside.backgroundColor,padding:[inside.paddingTop,inside.paddingRight,inside.paddingBottom,inside.paddingLeft],
          title:{fontSize:heading.fontSize,fontWeight:heading.fontWeight,lineHeight:heading.lineHeight},
          gap:getComputedStyle(group).columnGap,buttons};
    }""", reference)


def mode_motion_checks(open_source, receipt):
    for mode, other in [('simple', 'detailed'), ('detailed', 'simple')]:
        page, identity, provenance = open_source('q1', 'selected', mode, 390)
        try:
            page.native_page.emulate_media(reduced_motion='no-preference')
            settle(page)
            before = page_quote(page)
            page.evaluate('''() => {
                const dialog=document.getElementById('quote-mode-dialog'),panel=dialog.querySelector('.q1-confirm');
                const trace=window.__quoteModeNative={samples:[],done:false};let start=null;
                const sample=()=>{
                    if(dialog.open&&start===null)start=performance.now();
                    if(start!==null){const css=getComputedStyle(panel),m=new DOMMatrixReadOnly(css.transform);
                        trace.samples.push({elapsed:performance.now()-start,x:m.a,y:m.d,transform:css.transform,
                            backdrop:getComputedStyle(dialog,'::backdrop').backdropFilter,dialogOpen:dialog.open});
                        if(performance.now()-start>650){trace.done=true;return;}}
                    requestAnimationFrame(sample);
                };requestAnimationFrame(sample);
            }''')
            page.locator('#research-order-trigger').click()
            page.locator('#research-order-mode-' + other).click()
            expect(page.locator('#quote-mode-dialog')).to_be_visible()
            expect(page.locator('#quote-mode-dialog [data-mode-option]')).not_to_be_checked()
            page.wait_for_expression('window.__quoteModeNative?.done===true')
            trace = page.evaluate('window.__quoteModeNative')
            assert any(sample['x'] > 1.001 and sample['y'] < .999 for sample in trace['samples']), trace
            assert any(sample['y'] > 1.001 and sample['x'] < .999 for sample in trace['samples']), trace
            assert trace['samples'][-1]['backdrop'] == 'blur(4px)', trace['samples'][-1]
            label = 'q1-mode-' + mode + '-to-' + other + '-390'
            captured = page.evaluate(CAPTURE, {'expected': identity, 'label': label})
            captured.update(provenance=provenance, interaction=['retained header selector', other + ' mode row'],
                            motionPreference='no-preference; capture after actual entry motion')
            write_json(OUT / (label + '.dom-paint.json'), captured)
            write_json(OUT / (label + '.chrome-layout.json'), chrome_layout(page))
            page.screenshot(OUT / (label + '.viewport.png'))
            screenshot = screenshot_identity(OUT / (label + '.viewport.png'))
            page.evaluate('''() => {
                const dialog=document.getElementById('quote-mode-dialog'),panel=dialog.querySelector('.q1-confirm');
                const trace=window.__quoteModeCloseNative={samples:[],done:false};let start=null;
                const sample=()=>{
                    if(dialog.classList.contains('is-closing')&&start===null)start=performance.now();
                    if(start!==null){const m=new DOMMatrixReadOnly(getComputedStyle(panel).transform);
                        trace.samples.push({elapsed:performance.now()-start,x:m.a,y:m.d,dialogOpen:dialog.open});
                        if(!dialog.open){trace.done=true;return;}}
                    requestAnimationFrame(sample);
                };requestAnimationFrame(sample);
            }''')
            page.locator('#quote-mode-dialog [data-mode-cancel]').click()
            expect(page.locator('#quote-mode-dialog')).to_be_hidden()
            page.wait_for_expression('window.__quoteModeCloseNative?.done===true')
            close_trace = page.evaluate('window.__quoteModeCloseNative')
            assert any(sample['dialogOpen'] and sample['y'] < .65 for sample in close_trace['samples']), close_trace
            expect(page.locator('#research-order-trigger')).to_be_focused()
            assert page_quote(page) == before
            page.native_page.emulate_media(reduced_motion='reduce')
            page.locator('#research-order-trigger').click()
            page.locator('#research-order-mode-' + other).click()
            expect(page.locator('#quote-mode-dialog')).to_be_visible()
            reduced = page.locator('#quote-mode-dialog>.q1-confirm').evaluate('''panel=>({
                transform:getComputedStyle(panel).transform,activeAnimations:panel.getAnimations().filter(a=>a.playState==='running').length})''')
            assert reduced['activeAnimations'] == 0 and reduced['transform'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), reduced
            appearance = confirmation_presentation(page, reference=True)
            if 'commonConfirmation' in receipt:
                assert appearance == receipt['commonConfirmation'], 'Simple and detailed modes must consume one common confirmation style'
            else:
                receipt['commonConfirmation'] = appearance
            page.locator('#quote-mode-dialog [data-mode-cancel]').click()
            expect(page.locator('#quote-mode-dialog')).to_be_hidden()
            expect(page.locator('#research-order-trigger')).to_be_focused()
            receipt['checks'].append({'check': 'C631 retained Popup 6 anisotropic entry, softfocus, opt-in defaults, cancel focus and reduced motion',
                'initialSource': identity, 'mode': mode, 'trace': trace, 'closeTrace': close_trace, 'reducedMotion': reduced, 'cancelPreservedExactQuote': True,
                'reference': 'https://drive.google.com/file/d/1Rv5rgxmTdxA72snoo6lNZHBqqs6MjPSY/view',
                'geometry': label + '.dom-paint.json', 'nativeLayout': label + '.chrome-layout.json', 'screenshot': screenshot})
        finally:
            page.native_page.emulate_media(reduced_motion='reduce')
            page.close()



def main():
    OUT.mkdir(parents=True, exist_ok=True)
    receipt = {'format': 'order-research-quote-feedback/v1', 'status': 'RUNNING', 'nativeExecution': False,
               'checks': [], 'captures': [], 'reviewHoldUnchanged': True, 'userAcceptance': False, 'figmaWrite': False,
               'limits': ['Captures cover their listed fixtures and viewports.', 'User review of Q1/Q2 remains on HOLD.',
                          'No deployment, production integration or Figma acceptance is implied.']}
    cfg, host, browser, driver, log = {}, None, None, None, None
    phase, errors, responses, documents, resources, forbidden_writes, http_errors = 'prepare', [], [], [], {}, [], []

    def safe(value):
        text = str(value)
        for key in ('email', 'pass'):
            if cfg.get(key):
                text = text.replace(cfg[key], '[throwaway-owner]')
        return text

    def request_sent(request):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return
        parts = urlsplit(request.url)
        if parts.netloc != urlsplit(cfg['url']).netloc or (parts.path.startswith('/api/') and not parts.path.startswith('/api/ia/auth/')):
            forbidden_writes.append({'phase': phase, 'method': request.method, 'url': safe(request.url)})

    def observe(page):
        page.on('pageerror', lambda error: errors.append({'phase': phase, 'error': safe(error)}))
        page.on('console', lambda message: errors.append({'phase': phase, 'consoleError': safe(message.text),
            'location': {key: safe(value) if isinstance(value, str) else value for key, value in message.location.items()}})
            if message.type == 'error' else None)
        page.on('request', request_sent)
        page.on('response', lambda response: http_errors.append({'phase': phase, 'url': safe(response.url),
            'status': response.status, 'type': response.request.resource_type}) if response.status >= 400 else None)
        page.on('response', lambda response: responses.append(response) if response.request.resource_type in ('font', 'stylesheet', 'script') else None)
        page.on('response', lambda response: documents.append(response) if response.request.resource_type == 'document' else None)

    def resource_hashes():
        while responses:
            response = responses.pop(0)
            url = safe(response.url)
            if resources.get(url, {}).get('sha256'):
                continue
            try:
                raw = response.body()
                entry = {'url': url, 'status': response.status, 'type': response.request.resource_type,
                         'bytes': len(raw), 'sha256': sha256(raw).hexdigest(), 'buildHeader': response.headers.get('x-order-research-build')}
                if entry['type'] == 'font' and response.ok:
                    suffix = Path(urlsplit(url).path).suffix
                    suffix = suffix if suffix in ('.woff2', '.woff', '.ttf', '.otf') else '.font'
                    target = OUT / 'fonts' / (entry['sha256'] + suffix)
                    target.parent.mkdir(exist_ok=True)
                    target.write_bytes(raw)
                    entry['artifactFile'] = str(target.relative_to(OUT))
                resources[url] = entry
            except Exception as error:
                resources[url] = {'url': url, 'type': response.request.resource_type, 'bodyHashObserved': False, 'error': safe(error)}

    try:
        identity = build_identity()
        receipt['source'] = identity
        binary = os.environ.get('R3_BROWSER_BINARY') or shutil.which('google-chrome') or shutil.which('chromium')
        assert binary and Path(binary).is_file(), 'A real Chrome/Chromium binary is required; no simulated native pass is allowed'
        log = (OUT / 'host.stderr.log').open('w')
        host = subprocess.Popen(['node', 'tests/r3-browser-host.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=log, text=True)
        cfg = json.loads(host.stdout.readline())
        assert re.fullmatch(r'http://127\.0\.0\.1:\d+', cfg['url'])
        driver = sync_playwright().start()
        browser = driver.chromium.launch(executable_path=binary, args=['--no-sandbox'])
        receipt.update(nativeExecution=True, browserVersion=browser.version, browserBinary=str(binary), executionEnvironment='CI' if os.environ.get('CI') else 'explicit-native-run')
        context = browser.new_context(viewport={'width': 2000, 'height': 1300}, device_scale_factor=1, reduced_motion='reduce')
        parent = context.new_page()
        observe(parent)
        prepare_review_ready(parent)
        phase = 'throwaway-owner-login'
        parent.goto(cfg['url'] + '/ia?view=research-r3&screen=onboarding&state=guest-2')
        parent.locator('input[name=email]').fill(cfg['email'])
        parent.locator('input[name=password]').fill(cfg['pass'])
        parent.locator('#submit').click()
        parent.wait_for_url('**/ia?view=research-r3**')

        def open_source(screen, state, mode, width):
            nonlocal phase
            phase = '/'.join((screen, state, mode, str(width)))
            query = urlencode({'view': 'qa-lab', 'screen': f'{screen}/{state}/email', 'width': width, 'mode': mode})
            parent.goto(cfg['url'] + '/ia?' + query)
            wait_review_session(parent, screen, state)
            parent.locator('#points').click()
            parent.locator('[data-drawer-tab=settings]').click()
            parent.locator('#scale-fit').set_checked(False)
            parent.locator('#close-drawer').click()
            assert parent.locator('#focus-unit .preview-canvas').evaluate(
                'el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a') == 1
            frame = parent.frame_locator('#frame')
            source = research_snapshot_identity(frame)
            assert source['build'] == identity['build']['digest'] and source['version'] == 'current'
            assert source['route'] == {'screen': screen, 'state': state, 'variant': 'email', 'mode': mode}
            source_url = urljoin(cfg['url'], parent.locator('#frame').get_attribute('src'))
            assert urlsplit(source_url).netloc == urlsplit(cfg['url']).netloc
            parent_observation = parent.locator('#frame').evaluate('''frame=>({
                src:frame.src,rect:frame.getBoundingClientRect().toJSON(),width:frame.contentWindow.innerWidth,
                height:frame.contentWindow.innerHeight,rootCount:frame.contentDocument.querySelectorAll('#order-single').length,
                session:frame.contentDocument.getElementById('order-single').__orderResearchInspector.inspect()})''')
            assert parent_observation['rootCount'] == 1 and parent_observation['width'] == width
            page = ProductSurface(parent, parent.locator('#frame').element_handle().content_frame())
            page.container.scroll_into_view_if_needed()
            geometry = page.parent_geometry()
            assert abs(geometry['scaleX'] - 1) < .0001 and abs(geometry['scaleY'] - 1) < .0001, geometry
            assert geometry['parentViewport']['devicePixelRatio'] == 1
            matching = [response for response in documents if response.url == source_url]
            assert matching, 'Capture must hash the actually loaded iframe document response'
            response = matching[-1]
            assert response.ok
            source_html = response.body()
            source_predicate = '''expected=>{
                const root=document.getElementById('order-single'),app=window.ORDER_RESEARCH_APP;
                const inspected=root?.__orderResearchInspector?.inspect(),state=app?.snapshot();
                return inspected?.active&&!inspected.pendingRoute&&state?.build===expected.build&&
                    inspected.session.artifact===expected.artifactHash&&state.route.screen===expected.route.screen&&
                    state.route.state===expected.route.state&&state.route.mode===expected.route.mode;
            }'''
            page.wait_for_expression('(' + source_predicate + ')(' + json.dumps(source) + ')', timeout=30000)
            settle(page)
            page.evaluate('scrollTo(0,0)')
            resource_hashes()
            documents.clear()
            return page, source, {
                'qaPath': '/ia?' + query, 'sourceUrl': source_url, 'sourceHtmlSha256': sha256(source_html).hexdigest(),
                'sourceHtmlBytes': len(source_html), 'parent': parent_observation, 'parentGeometry': geometry,
                'sameQaIframeRetained': True, 'sourceMutatedForCapture': False}

        qa_mode_navigation_checks(open_source, receipt)
        core_checks(open_source, receipt)
        mode_motion_checks(open_source, receipt)
        for screen, state, mode, width in MOBILE + DESKTOP + RELATED:
            page, source, provenance = open_source(screen, state, mode, width)
            try:
                label = f'{screen}-{state}-{mode}-{width}'
                captured = page.evaluate(CAPTURE, {'expected': source, 'label': label})
                native = chrome_layout(page)
                # Preserve native observations even if validation rejects this
                # capture; failed receipts never authorize Figma synchronization.
                write_json(OUT / (label + '.chrome-layout.json'), native)
                write_json(OUT / (label + '.dom-paint.json'), captured)
                page.screenshot(OUT / (label + '.viewport.png'))
                if screen in ('q1', 'q2', 'q3', 'q4'):
                    if screen == 'q1' and state == 'error':
                        for group in ('housing', 'size', 'pack'):
                            assert_q1_missing_group(page, group)
                    assert captured['anchors']['duplicateModeSwitchVisible'] is False, 'C622 duplicate switch must be absent from paint'
                    form = captured['anchors']['form']
                    assert form['background'] == 'rgba(0, 0, 0, 0)', 'C623 calculator shares the plain white page'
                    assert form['paddingLeft'] == form['paddingRight'] == form['border'] == '0px' and form['boxShadow'] == 'none', 'No second calculator surface'
                    if width == 390:
                        assert abs(form['rect']['x'] - 24) < .1 and abs(form['rect']['width'] - 342) < .1, ('Same 24px page inset as other product screens', form)
                    for closed in captured['anchors']['closedAccordions']:
                        assert abs(closed['rect']['height'] - 52) < .1, ('Original closed accordion height is 52px', closed)
                        assert abs(closed['header']['height'] - 52) < .1 and closed['body']['height'] == 0, 'Closed content contributes no phantom padding'
                    assert page.locator('header.header').count() == 0
                if screen == 'quote-wait' and state in ('offline', 'server-error'):
                    checks = receipt.setdefault('waitErrorControls', {})
                    checks[label] = wait_error_controls(page, width, state)
                if screen == 'profile' and state == 'notification':
                    assert captured['source']['route']['panel'] == 'notifications', 'Direct notification entry must retain its actual panel'
                    expect(page.locator('[data-obm-page="notifications"] .obm-heading')).to_have_text('알림')
                    expect(page.locator('[data-notification-preferences]')).to_be_visible()
                if screen == 'quote-result' and state == 'expired':
                    expired = page.locator('[data-order-result][data-state=expired]').first
                    shapes = expired.locator('.oq-plot').evaluate("""node=>['::before','::after'].map(pseudo=>{
                        const css=getComputedStyle(node,pseudo);
                        return {width:parseFloat(css.width),height:parseFloat(css.height),
                          backgroundImage:css.backgroundImage,borderRadius:css.borderRadius};
                    })""")
                    assert all(shape['width'] == 53 and shape['height'] > 80 and shape['backgroundImage'] == 'none' for shape in shapes), shapes
                    assert shapes[0]['height'] == shapes[1]['height'], 'Expired empty outlines must not invent a price comparison'
                    assert expired.locator('.oq-series:not([hidden])').count() == 0
                    expect(expired.locator('.oq-expired-details')).to_be_visible()
                    captured['expiredGraph'] = {'kind':'empty price-free outlines', 'shapes':shapes}
                if screen == 'quote-result' and state == 'recompare':
                    expect(page.locator('dialog[open]')).to_have_accessible_name('동일한 조건으로 다시 비교하겠어요?')
                    appearance = confirmation_presentation(page)
                    assert appearance == receipt['commonConfirmation'], {'common':receipt['commonConfirmation'], 'recompare':appearance}
                    captured['commonConfirmation'] = appearance
                assert page.locator('#order-app-header').count() == 1
                assert captured['viewport']['devicePixelRatio'] == 1
                assert captured['viewport']['documentWidth'] <= width + 1, 'Form must not overflow the native viewport'
                fonts = native['actualFontFamilies']
                captured['fonts']['platform'] = fonts
                captured['fonts']['files'] = [system_font_identity(font) for font in fonts]
                captured['fonts']['pretendardActuallyUsed'] = any('pretendard' in font['family'].lower() and font['isCustomFont'] for font in fonts)
                assert captured['fonts']['pretendardActuallyUsed'], 'Native glyphs did not use the retained Pretendard font'
                if screen in ('q1', 'q2', 'q3', 'q4'):
                    visible_text = [item for item in captured['texts'] if item.get('text', '').strip()]
                    legacy_families = sorted({item.get('css', {}).get('fontFamily', '') for item in visible_text
                        if item.get('css', {}).get('fontFamily') and 'pretendard' not in item['css']['fontFamily'].lower()})
                    assert not legacy_families, {'legacyTextFamilies': legacy_families}
                font_resources = [entry for entry in resources.values() if entry.get('type') == 'font' and entry.get('sha256')]
                captured['fonts']['loadedResources'] = font_resources
                assert any(entry['sha256'] == identity['font']['sha256'] and urlsplit(entry['url']).path == identity['font']['url'] for entry in font_resources), 'Actual official Pretendard response bytes must match the retained hash'
                captured['provenance'] = provenance
                captured['nativeLayoutFile'] = label + '.chrome-layout.json'
                captured['motionPreference'] = 'reduce; actual observed state without screenshot animation overrides'
                scrolls = [0]
                if page.locator('dialog[open]').count() == 0:
                    height, content_height = captured['viewport']['height'], captured['viewport']['documentHeight']
                    scrolls += list(range(height, content_height, height))
                for index, offset in enumerate(scrolls):
                    page.evaluate('y=>scrollTo(0,y)', offset)
                    settle(page)
                    tile = captured if index == 0 else page.evaluate(CAPTURE, {'expected': source, 'label': label + '-scroll-' + str(index)})
                    parent_geometry = page.parent_geometry()
                    assert abs(parent_geometry['scaleX'] - 1) < .0001 and abs(parent_geometry['scaleY'] - 1) < .0001
                    path = OUT / (label + ('.viewport' if index == 0 else '.scroll-' + str(index)) + '.png')
                    page.screenshot(path)
                    screenshot = screenshot_identity(path)
                    assert screenshot['pngDimensions'] == source['viewport'], screenshot['pngDimensions']
                    captured.setdefault('screenshots', []).append({**screenshot,
                        'kind': 'viewport' if index == 0 else 'scroll-tile', 'nativeScreenshot': True, 'viewportUnchanged': True,
                        'scroll': {'x': tile['viewport']['scrollX'], 'y': tile['viewport']['scrollY']}, 'parentGeometry': parent_geometry})
                    if index:
                        tile_name = label + '.scroll-' + str(index) + '.dom-paint.json'
                        write_json(OUT / tile_name, tile)
                        captured['screenshots'][-1]['domPaint'] = tile_name
                write_json(OUT / (label + '.chrome-layout.json'), native)
                write_json(OUT / (label + '.dom-paint.json'), captured)
                receipt['captures'].append({'label': label, 'route': source['route'], 'viewport': source['viewport'],
                    'artifactHash': source['artifactHash'], 'build': source['build'], 'domPaint': label + '.dom-paint.json',
                    'nativeLayout': label + '.chrome-layout.json', 'screenshots': captured['screenshots'],
                    'elementCount': len(captured['elements']), 'rangeTextCount': len(captured['texts']), 'platformFonts': fonts})
                if screen == 'drawer' and state == 'closed':
                    opener = page.locator('[data-action=consult-ticket-detail]').first
                    expect(opener).to_be_visible(timeout=30000)
                    selection = page.locator('[name=consult-pass]').evaluate_all('nodes=>nodes.map(node=>({id:node.dataset.id,checked:node.checked}))')
                    opener.click()
                    expect(page.locator('.consult-pass-dialog')).to_be_visible()
                    settle(page)
                    detail_label = 'drawer-closed-pass-detail-simple-390'
                    detail = page.evaluate(CAPTURE, {'expected': source, 'label': detail_label})
                    detail.update(provenance=provenance, interaction=['actual consult-ticket-detail click'], sourceState='drawer/closed/email')
                    write_json(OUT / (detail_label + '.dom-paint.json'), detail)
                    write_json(OUT / (detail_label + '.chrome-layout.json'), chrome_layout(page))
                    page.screenshot(OUT / (detail_label + '.viewport.png'))
                    detail_screenshot = screenshot_identity(OUT / (detail_label + '.viewport.png'))
                    page.locator('.consult-pass-close').click()
                    expect(page.locator('.consult-pass-dialog')).to_be_hidden()
                    expect(opener).to_be_focused()
                    assert page.locator('[name=consult-pass]').evaluate_all('nodes=>nodes.map(node=>({id:node.dataset.id,checked:node.checked}))') == selection
                    receipt.setdefault('derivedCaptures', []).append({'label': detail_label, 'from': label,
                        'interaction': 'trusted detail-button click, close and return focus; selection unchanged',
                        'domPaint': detail_label + '.dom-paint.json', 'nativeLayout': detail_label + '.chrome-layout.json',
                        'screenshot': detail_screenshot})
                if screen == 'quote-result' and state == 'expired':
                    page.evaluate('scrollTo(0,0)')
                    opener = page.locator('.oq-expired-details')
                    opener.click()
                    dialog = page.locator('dialog[open]')
                    expect(dialog).to_have_accessible_name('이전 견적서 상세보기')
                    expect(dialog.locator('.oq-dialog-copy')).to_contain_text('2026.11.14 ~ 2026.11.21')
                    expect(dialog.locator('.oq-dialog-copy')).to_contain_text('만료된 견적은 가격을 표시하지 않아요.')
                    assert dialog.locator('button').all_text_contents() == ['닫기', '동일한 조건']
                    settle(page)
                    detail_label = 'quote-result-expired-details-simple-390'
                    detail = page.evaluate(CAPTURE, {'expected': source, 'label': detail_label})
                    detail.update(provenance=provenance, interaction=['actual previous-quote detail click'], sourceState='quote-result/expired/email')
                    write_json(OUT / (detail_label + '.dom-paint.json'), detail)
                    write_json(OUT / (detail_label + '.chrome-layout.json'), chrome_layout(page))
                    page.screenshot(OUT / (detail_label + '.viewport.png'))
                    detail_screenshot = screenshot_identity(OUT / (detail_label + '.viewport.png'))
                    dialog.get_by_role('button', name='닫기', exact=True).click()
                    expect(dialog).to_have_count(0)
                    expect(opener).to_be_focused()
                    receipt.setdefault('derivedCaptures', []).append({'label':detail_label, 'from':label,
                        'interaction':'trusted previous-quote detail click, disclosed dates only, close and return focus',
                        'domPaint':detail_label + '.dom-paint.json', 'nativeLayout':detail_label + '.chrome-layout.json',
                        'screenshot':detail_screenshot})
                write_json(OUT / 'receipt.json', receipt)
            finally:
                page.close()
        narrow, _, _ = open_source('quote-wait', 'offline', 'simple', 320)
        try:
            receipt['waitErrorControls']['quote-wait-offline-simple-320'] = wait_error_controls(narrow, 320, 'offline')
        finally:
            narrow.close()
        resource_hashes()
        assert not forbidden_writes, forbidden_writes
        assert not errors, errors
        receipt['status'] = 'PASS'
        receipt['checks'].append({'check': 'Measured Q1/Q2, affected Q3/Q4 and requested related source states', 'count': len(receipt['captures']),
                                  'actualSourceIdentityChecked': True, 'oneRetainedHeader': True, 'fontsVerifiedByChrome': True})
    except Exception as error:
        receipt.update(status='FAIL', failure={'phase': phase, 'message': safe(error), 'type': type(error).__name__})
        raise RuntimeError(receipt['failure']['message']) from None
    finally:
        receipt.update(errors=errors, forbiddenWrites=forbidden_writes, httpErrors=http_errors)
        resource_hashes()
        write_json(OUT / 'resources.json', list(resources.values()))
        write_json(OUT / 'receipt.json', receipt)
        if browser:
            browser.close()
        if driver:
            driver.stop()
        if host:
            host.terminate()
            try:
                host.wait(timeout=5)
            except subprocess.TimeoutExpired:
                host.kill()
        if log:
            log.close()
        print(json.dumps({'status': receipt['status'], 'captures': len(receipt['captures']), 'artifact': str(OUT.relative_to(ROOT)), 'nativeExecution': receipt['nativeExecution']}))


if __name__ == '__main__':
    main()
