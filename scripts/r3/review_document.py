"""Normalize one editable frame before it enters the private catalog."""
import re
from lxml import html

safeTags=set('section div span svg g path button header nav footer main dl dt dd h1 h2 h3 h4 p br strong em b i input select textarea label form legend fieldset option table tbody thead tr th td ol ul li article aside small time output defs use mask rect animate style metadata figure figcaption details summary circle line polyline polygon canvas img a'.split())
# Data fields alone cannot carry amounts or raw personal information in a frame.
safeAttrs=set('id class type name for disabled hidden inert tabindex role title width height placeholder maxlength min max step required readonly checked selected rows inputmode autocomplete pattern scope x y d fill stroke stroke-width stroke-linecap stroke-linejoin transform opacity focusable viewbox mask maskunits attributename values keytimes dur repeatcount calcmode xmlns'.split())
safeData=set('action op-route mf-go mf-state state section target ops-module motion open module field-message qa-action term-section term consent-feedback field id stable-id option mf-action help qa-demo submit-action level otp-clock otp-feedback terms-feedback banner-stack company-close company-open intro-member intro-step mf-intro mf-choice mf-form mf-success'.split())
money=re.compile(r'(?:₩\s*)?[+-]?\d[\d,]*(?:\.\d+)?\s*(?:만\s*원|원|%)')
def prepare(markup,screen,state, *, current=True, extra_data=()):
    root=html.fragment_fromstring(markup,create_parent='main');root.set('id','order-single');root.set('class','qa-screen ds');root.set('data-motion','on')
    for el in list(root.iterdescendants()):
        if not isinstance(el.tag,str) or (el.tag not in safeTags and not (current and el.tag=='progress')):
            if el.getparent() is not None:el.getparent().remove(el)
            continue
        if el.tag=='style' and re.search(r'url\s*\(\s*(?!#)|@import|</style',el.text or '',re.I):
            el.getparent().remove(el);continue
        for k,v in list(el.attrib.items()):
            keep=k in safeAttrs or k.startswith('aria-') or k.startswith('data-') and k[5:] in (safeData | set(extra_data)) or (k=='href' and el.tag=='use' and re.fullmatch(r'#[\w:-]+',v)) or (k=='style' and not re.search(r'url\s*\(|@import|expression|--(?:price|amount|chart)|^--(?:v|pct)',v,re.I))
            if current and el.tag=='progress' and k=='value' and re.fullmatch(r'[0-9]{1,4}',v): keep=True
            if not keep or money.search(v):el.attrib.pop(k,None)
        # Static editable documents contain empty form controls only. Runtime values never enter an export.
        if el.tag=='textarea':el.text=''
        if el.tag=='input':el.attrib.pop('value',None)
        if el.tag=='form':el.set('autocomplete','off')
        if el.tag=='select':el.set('data-r3-native-select','')
        if el.text and el.tag!='style':el.text=money.sub('—',el.text)
        if el.tail:el.tail=money.sub('—',el.tail)
    # Historical candidate graphs/price cards can encode numbers structurally. In review documents
    # use an explicit locked projection for customer results; real quotes use the business-gated API.
    if screen=='quote-result':
        if state=='locked':
            for el in list(root.xpath('//*[contains(@class,"chart") or contains(@class,"price") or contains(@class,"graph") or contains(@class,"amount") or contains(@class,"cost")]')):
                if el.getparent() is not None:el.getparent().remove(el)
    content=html.tostring(root,encoding='unicode',method='html').replace('viewbox=','viewBox=').replace('maskunits=','maskUnits=').replace('keytimes=','keyTimes=').replace('attributename=','attributeName=').replace('repeatcount=','repeatCount=').replace('calcmode=','calcMode=')
    return content

