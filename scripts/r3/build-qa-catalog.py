"""Compile editable, iframe-free fixture documents and protected catalog. No network."""
import argparse, base64, gzip, hashlib, html as h, io, json, re, subprocess, tempfile, zipfile
from copy import deepcopy
from pathlib import Path
from lxml import html, etree

ap=argparse.ArgumentParser()
ap.add_argument('--source',type=Path,required=True)
ap.add_argument('--baseline-zip',type=Path,required=True)
ap.add_argument('--out',type=Path,required=True)
ap.add_argument('--exports',type=Path)
args=ap.parse_args()
source=args.source.resolve()
original=zipfile.ZipFile(args.baseline_zip)
sha=lambda b:hashlib.sha256(b).hexdigest()
pack=lambda s:base64.b64encode(gzip.compress(s.encode(),mtime=0)).decode()
dump=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
motion=source/'sources/transitions'
css='\n'.join([(motion/'repo/skills/transitions-dev/_root.css').read_text()]+[p.read_text() for p in sorted(motion.glob('extracted/*/block-03.original.css'))]+[(source/'src'/name).read_text() for name in ['base.css','account.css','business.css','navigation.css','quotes-admin.css','member-flows.css','operations-flows.css']]+[(source/'assets/brand.css').read_text()])
css+='\nhtml,body{margin:0;min-width:0;scrollbar-width:none}html::-webkit-scrollbar{display:none}*,*::before,*::after{box-sizing:border-box}body{margin-inline:auto}'
safeTags=set('section div span svg g path button header nav footer main dl dt dd h1 h2 h3 h4 p br strong em b i input select textarea label form legend fieldset option table tbody thead tr th td ol ul li article aside small time output defs use mask rect animate style metadata figure figcaption details summary circle line polyline polygon canvas img a'.split())
# Data fields alone cannot carry amounts or raw personal information in a frame.
safeAttrs=set('id class type name for disabled hidden inert tabindex role title width height placeholder maxlength min max step required readonly checked selected rows inputmode autocomplete pattern scope x y d fill stroke stroke-width stroke-linecap stroke-linejoin transform opacity focusable viewbox mask maskunits attributename values keytimes dur repeatcount calcmode xmlns'.split())
safeData=set('action op-route mf-go mf-state state section target ops-module motion open module field-message qa-action term-section term consent-feedback field id stable-id option mf-action help qa-demo submit-action level otp-clock otp-feedback terms-feedback banner-stack company-close company-open intro-member intro-step mf-intro mf-choice mf-form mf-success'.split())
money=re.compile(r'(?:₩\s*)?[+-]?\d[\d,]*(?:\.\d+)?\s*(?:만\s*원|원|%)')
def prepare(markup,screen,state):
    root=html.fragment_fromstring(markup,create_parent='main');root.set('id','order-single');root.set('class','qa-screen ds');root.set('data-motion','on')
    for el in list(root.iterdescendants()):
        if not isinstance(el.tag,str) or el.tag not in safeTags:
            if el.getparent() is not None:el.getparent().remove(el)
            continue
        if el.tag=='style' and re.search(r'url\s*\(\s*(?!#)|@import|</style',el.text or '',re.I):
            el.getparent().remove(el);continue
        for k,v in list(el.attrib.items()):
            keep=k in safeAttrs or k.startswith('aria-') or k.startswith('data-') and k[5:] in safeData or (k=='href' and el.tag=='use' and re.fullmatch(r'#[\w:-]+',v)) or (k=='style' and not re.search(r'url\s*\(|@import|expression|--(?:price|amount|chart)|^--(?:v|pct)',v,re.I))
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

with tempfile.TemporaryDirectory() as td:
    out=Path(td)/'catalog.json'
    subprocess.run(['node',str(Path(__file__).with_name('compile-catalog.mjs')),str(source),str(out)],check=True)
    rendered=json.loads(out.read_text())
style_hash=sha(css.encode())
catalog=[];blobs={};exports=[]
locked_result=next(row['body'] for row in rendered if row['screen']=='quote-result' and row['state']=='locked')
for row in rendered:
    raw=row.pop('body')
    if row['screen']=='quote-result' and row['state'] not in ('locked','no-result','recompare'):
        raw=locked_result
    now=prepare(raw,row['screen'],row['state'])
    fname=row['screen']+'__'+row['state']+('' if row['variant']=='email' else '__'+row['variant'])+'.html'
    previous=html.fromstring(original.read('QA/screens/'+fname))
    oldroot=previous.get_element_by_id('order-single')
    old=prepare(''.join(html.tostring(c,encoding='unicode',method='html') for c in oldroot),row['screen'],row['state'])
    for version,body in [('previous',old),('current',now)]:
        key=sha(body.encode())
        if key not in blobs:blobs[key]=pack(body)
        row[version]=key
    row['authoredChange']=row['previous']!=row['current']
    catalog.append(row)
core=(source/'src/core.js').read_text()
account=(source/'src/account.js').read_text()
account=re.sub(r"(const EXAMPLE_PASSWORD\s*=\s*)'[^']*'",r"\1''",account)
member=(source/'src/member-flows.js').read_text()
# Only the isolated onboarding and waiting mounts are needed; omit offer renderers and pricing fixtures.
prefix=member[:member.index("register('onboarding'")]
intro=member[member.index("register('onboarding'"):member.index("register('",member.index("register('onboarding'")+10)]
wait=member[member.index('const waitingCopy'):member.index("register('delivery-request'")]
member=prefix+intro+wait+"\n})(window);"
runtimes={k:core+'\n'+v for k,v in {'account':account,'business':(source/'src/business.js').read_text(),'member':member}.items()}
src=Path(__file__).resolve().parents[2]/'src/server/r3-ui'
fn=lambda n:(src/(n+'.mjs')).read_text().split('export function ',1)[1].rstrip()
runtime_file=args.out.with_name('runtime.gen.mjs')
args.out.parent.mkdir(parents=True,exist_ok=True)
runtime_file.write_text('export const hostCode='+dump('function '+fn('host'))+';\nexport const frameCode='+dump('function '+fn('frame'))+';\nexport const runtimes='+dump(runtimes)+';\n')

# Canonical artifact identities include selected content, shared CSS and isolated runtime.
# The runtime is included only for the audited screen family that consumes it.
family={'login':'account','signup':'account','otp':'account','password':'account','terms':'account','business':'business','proof':'business','onboarding':'member','quote-wait':'member'}
style_old=html.fromstring(original.read('QA/screens/login__empty.html')).xpath('/html/head/style/text()')[0]
style_old=re.sub(r'body\{width:\d+px;max-width:none;margin-inline:auto\}\s*$','',style_old)
old_style_hash=sha(style_old.encode())
for r in catalog:
    r['hashes']={}
    r['previousHashes']={}
    for v in ['current','previous']:
        script_hash=sha((fn('frame')+(runtimes.get(family.get(r['screen'],''),'') if v=='current' else '')).encode())
        for width in (320,390,768,1440):
            payload=[r['id'],v,r[v],style_hash if v=='current' else old_style_hash,str(width),script_hash]
            r['hashes' if v=='current' else 'previousHashes'][str(width)]=sha('|'.join(payload).encode())
args.out.write_text('// Generated by scripts/r3/build-qa-catalog.py. Private QA templates.\nexport const release='+dump('MSG0585-R3')+';\nexport const cssHash='+dump(style_hash)+';\nexport const cssGzip='+dump(pack(css))+';\nexport const previousCssHash='+dump(old_style_hash)+';\nexport const previousCssGzip='+dump(pack(style_old))+';\nexport const catalog='+dump(catalog)+';\nexport const frames='+dump(blobs)+';\n')

if args.exports:
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['node',str(Path(__file__).with_name('export-catalog.mjs')),td],check=True)
        with zipfile.ZipFile(args.exports,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as archive:
            for p in sorted(Path(td).rglob('*')):
                if p.is_file():archive.write(p,p.relative_to(td))
print(dump({'catalog':len(catalog),'states':len({(r['screen'],r['state']) for r in catalog}),'exportWidths':[390,1440] if args.exports else [],'uniqueBodies':len(blobs),'sha256':sha(args.out.read_bytes())}))
