"""Validate an actual downloaded research snapshot against its live target and audit."""
from hashlib import sha256
from html.parser import HTMLParser
import json
import re


class _SnapshotDocument(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metadata = []
        self.roots = []
        self.forbidden = []
        self.policies = []
        self._metadata_depth = 0

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {'iframe', 'frame', 'script', 'form', 'object', 'embed', 'base'}:
            self.forbidden.append(tag)
        if tag == 'input' and attrs.get('type', '').lower() == 'hidden':
            self.forbidden.append('hidden-input')
        if attrs.get('id') in {'r3-veil', 'r3-pins'} or 'r3-pin' in attrs.get('class', '').split():
            self.forbidden.append('qa-overlay')
        if any(name.startswith('on') or name in {'srcdoc', 'action', 'formaction'} for name in attrs):
            self.forbidden.append('active-attribute')
        if attrs.get('id') == 'order-single':
            self.roots.append(attrs)
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.policies.append(attrs.get('content', ''))
        if attrs.get('id') == 'order-export-metadata':
            assert tag == 'template', 'Snapshot metadata must be inert template content'
            self.metadata.append('')
            self._metadata_depth = 1
        elif self._metadata_depth and tag == 'template':
            self._metadata_depth += 1

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == 'template' and self._metadata_depth:
            self._metadata_depth -= 1

    def handle_data(self, data):
        if self._metadata_depth:
            self.metadata[-1] += data


def research_snapshot_identity(frame):
    value = frame.locator('#order-single').evaluate("""root=>{
      const app=window.ORDER_RESEARCH_APP?.snapshot(),inspection=root.__orderResearchInspector?.inspect();
      return {build:document.documentElement.dataset.productBuild,appBuild:app?.build,
        route:app?.route,session:inspection?.session,active:inspection?.active,
        pending:!!inspection?.pendingRoute,viewport:{width:innerWidth,height:innerHeight}};
    }""")
    assert value['active'] and not value['pending'], 'Research export requires an acknowledged live inspection'
    assert value['build'] == value['appBuild'] and re.fullmatch(r'[a-f0-9]{64}', value['build'])
    route, session = value['route'], value['session']
    expected_route = {key: route[key] for key in ('screen', 'state', 'variant', 'mode')}
    assert all(session[key] == route[key] for key in ('screen', 'state', 'variant'))
    assert session.get('mode', 'simple') == route['mode']
    assert session['viewport'] == value['viewport']['width']
    return {'build': value['build'], 'artifactHash': session['artifact'], 'version': session['version'],
            'route': expected_route, 'viewport': value['viewport']}


def validate_research_snapshot(raw, expected, audit_data):
    assert b'<iframe' not in raw.lower(), 'Downloaded HTML must not contain an iframe'
    document = _SnapshotDocument()
    document.feed(raw.decode('utf-8'))
    document.close()
    assert not document.forbidden, {'forbiddenSnapshotContent': document.forbidden}
    assert len(document.roots) == 1 and 'inert' in document.roots[0] and 'data-export-snapshot' in document.roots[0]
    assert len(document.metadata) == 1, 'Exactly one research snapshot metadata block is required'
    metadata = json.loads(document.metadata[0])
    assert metadata['format'] == 'order-research-static-snapshot/v1'
    assert all(metadata[key] == expected[key] for key in ('build', 'artifactHash', 'version', 'route', 'viewport')), {'metadata': metadata, 'expected': expected}
    assert re.fullmatch(r'[a-f0-9]{64}', metadata['build']) and re.fullmatch(r'[a-f0-9]{64}', metadata['artifactHash'])
    assert isinstance(metadata.get('stylesheets'), int) and metadata['stylesheets'] > 0
    assert len(document.policies) == 1
    policy = {parts[0]: parts[1:] for entry in document.policies[0].split(';') if (parts := entry.split())}
    for directive in ('default-src', 'script-src', 'connect-src', 'form-action', 'base-uri', 'object-src'):
        assert policy.get(directive) == ["'none'"], {'directive': directive, 'policy': policy}
    target = {key: expected['route'][key] for key in ('screen', 'state', 'variant')}
    target.update(viewport=expected['viewport']['width'], artifactHash=expected['artifactHash'])
    if expected['route']['mode'] == 'detailed':
        target['mode'] = 'detailed'
    digest = sha256(raw).hexdigest()
    assert audit_data == {'target': target, 'status': 'exported', 'evidenceRef': 'sha256:' + digest}, audit_data
    return {'format': metadata['format'], 'build': metadata['build'], 'artifactHash': metadata['artifactHash'],
            'route': metadata['route'], 'viewport': metadata['viewport'], 'sha256': digest,
            'noFramesFormsScripts': True, 'auditHashExact': True}


def check_research_snapshot_download(frame, raw, response, expected):
    assert response.ok
    request = response.request.post_data_json
    assert request['kind'] == 'figma' and request['data']['status'] == 'exported'
    saved = response.json()
    assert saved['data'] == request['data']
    assert research_snapshot_identity(frame) == expected, 'The displayed export target changed during download'
    return validate_research_snapshot(raw, expected, saved['data'])
