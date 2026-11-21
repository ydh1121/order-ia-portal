"""Compile editable, iframe-free fixture documents and protected catalog. No network."""
import argparse, base64, gzip, hashlib, html as h, io, json, re, subprocess, sys, tempfile, zipfile
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
from review_document import prepare

with tempfile.TemporaryDirectory() as td:
    out=Path(td)/'catalog.json'
    # The reviewed navigation overlay contains four modules. Retain the fifth
    # common-component module from the original signed-off archive.
    baseline_navigation = Path(td) / 'baseline-navigation.js'
    baseline_navigation.write_bytes(original.read('QA_PROJECT/src/navigation.js'))
    subprocess.run(['node', str(Path(__file__).with_name('compile-catalog.mjs')),
                    str(source), str(out), '', '', str(baseline_navigation)], check=True)
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
    old=prepare(''.join(html.tostring(c,encoding='unicode',method='html') for c in oldroot),row['screen'],row['state'],current=False)
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
product_ui=src.with_name('product-ui')
canonical_target=args.out.resolve() in (src/'catalog.gen.mjs',product_ui/'catalog.gen.mjs')
if canonical_target:args.out=product_ui/'catalog.gen.mjs'
fn=lambda n:(src/(n+'.mjs')).read_text().split('export function ',1)[1].rstrip()
runtime_file=args.out.with_name('runtime.gen.mjs')
args.out.parent.mkdir(parents=True,exist_ok=True)
engine='export const hostCode='+dump('function '+fn('host'))+';\nexport const frameCode='+dump('function '+fn('frame'))+';\n'
if canonical_target:
    (src/'review-engine.gen.mjs').write_text(engine)
    runtime_file.write_text('export const runtimes='+dump(runtimes)+';\n')
    (src/'catalog.gen.mjs').write_text("// Compatibility export; canonical product owner.\nexport * from '../product-ui/catalog.gen.mjs';\n")
    (src/'runtime.gen.mjs').write_text("// Compatibility export; review engine is isolated.\nexport {runtimes} from '../product-ui/runtime.gen.mjs';\nexport {hostCode,frameCode} from './review-engine.gen.mjs';\n")
else:
    runtime_file.write_text(engine+'export const runtimes='+dump(runtimes)+';\n')

# Canonical artifact identities include selected content, shared CSS and isolated runtime.
# The runtime is included only for the audited screen family that consumes it.
family={'login':'account','signup':'account','otp':'account','password':'account','terms':'account','business':'business','proof':'business','signature':'business','onboarding':'member','quote-wait':'member'}
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
args.out.write_text('// Generated by scripts/r3/build-qa-catalog.py. Canonical product screen definitions.\nexport const release='+dump('MSG0585-R3')+';\nexport const cssHash='+dump(style_hash)+';\nexport const cssGzip='+dump(pack(css))+';\nexport const previousCssHash='+dump(old_style_hash)+';\nexport const previousCssGzip='+dump(pack(style_old))+';\nexport const catalog='+dump(catalog)+';\nexport const frames='+dump(blobs)+';\n')

# Recover tracked family overlays through the same entry point used for a scoped refresh.
for family_name in ("business", "navigation", "onboarding", "account", "questions"):
    subprocess.run([sys.executable, str(Path(__file__).with_name("refresh-review-family.py")),
                    "--source", str(source), "--family", family_name,
                    "--catalog", str(args.out.resolve())], check=True)
if canonical_target:
    subprocess.run(["node", str(Path(__file__).with_name("refresh-wait-artifacts.mjs"))], check=True)
    subprocess.run(["node", str(Path(__file__).with_name("refresh-integrated-login.mjs"))], check=True)

if args.exports:
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['node',str(Path(__file__).with_name('export-catalog.mjs')),td],check=True)
        with zipfile.ZipFile(args.exports,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as archive:
            for p in sorted(Path(td).rglob('*')):
                if p.is_file():archive.write(p,p.relative_to(td))
print(dump({'catalog':len(catalog),'states':len({(r['screen'],r['state']) for r in catalog}),'exportWidths':[390,1440] if args.exports else [],'uniqueBodies':len(blobs),'sha256':sha(args.out.read_bytes())}))
