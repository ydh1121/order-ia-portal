from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,json,hashlib,io,shutil,os,tempfile
p=Path(os.environ.get('R3_ROLE_EVIDENCE_DIR', tempfile.mkdtemp()));p.mkdir(parents=True,exist_ok=True);proc=subprocess.Popen(['node','tests/r3-role-browser-host.mjs'],stdout=subprocess.PIPE,text=True);url=proc.stdout.readline().strip();assert url.startswith('http://127.0.0.1:')
# Small valid PDF with a searchable synthetic marker and a filled rectangle.
stream=b'0 0 0 rg 5 5 32 32 re f\n% LOCAL-ONLY-ORIGINAL-MARKER\n'
obj=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 120] /Resources << >> /Contents 4 0 R >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'endstream']
file=b'%PDF-1.4\n';offsets=[0]
for n,objbytes in enumerate(obj,1):
 offsets.append(len(file));file+=str(n).encode()+b' 0 obj\n'+objbytes+b'\nendobj\n'
xref=len(file);file+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets[1:])+b'trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'
with sync_playwright() as w:
 browser=w.chromium.launch(executable_path=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();err=[];post=[];page.on('pageerror',lambda e:err.append(str(e)));page.on('request',lambda req:post.append((req.url,len(req.post_data_buffer or b''),hashlib.sha256(req.post_data_buffer or b'').hexdigest(),(req.post_data_buffer or b'')[:8].hex(),(b'%PDF' in (req.post_data_buffer or b'')))) if req.method=='POST' else None)
 try:
  page.goto(url+'/ia');page.get_by_text('역할별 시나리오 체험').click();page.locator('#r3-practice button').filter(has_text='조회 장애').click();assert '수동 심사 서류 필요' in page.locator('#r3-practice h3').inner_text();before_requests=len(post);assert before_requests==0
  page.get_by_text('역할별 시나리오 체험').click();page.locator('#create button').click();page.locator('#detail select[name=action]').select_option('manual');page.get_by_role('button',name='선택한 처리 확인').click();page.locator('#detail input[type=file]').set_input_files({'name':'private-original.pdf','mimeType':'application/pdf','buffer':file});page.locator('#detail canvas').wait_for();assert len(post)==2
  page.locator('summary',has_text='숫자로 가림 영역 선택').click();values=page.locator('#detail input[type=number]');
  for i,v in enumerate([0,0,100,100]):values.nth(i).fill(str(v))
  page.get_by_role('button',name='영역 가리기').click();page.locator('#detail input[type=checkbox]').check();page.locator('#detail button',has_text='가림 처리본 제출').click();page.get_by_text('사업장 확인 · 검토 대기',exact=True).first.wait_for();rec=page.locator('#detail dd').first.inner_text();page.reload();page.locator('#list button').first.click();page.get_by_role('button',name='연결된 증빙 열기').click();page.locator('#detail canvas').wait_for()
  assert page.locator('#detail canvas').evaluate('(c)=>{const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;return p.every((n,i)=>n===(i%4===3?255:0))}')
  screen=[]
  for width,height in [(390,844),(1440,900)]:
   page.set_viewport_size({'width':width,'height':height});page.screenshot(path=str(p/f'ROLE_EVIDENCE_{width}.png'),full_page=True);screen.append([width,page.locator('html').evaluate('(e)=>e.scrollWidth'),page.locator('#detail canvas').bounding_box()['width']]);assert screen[-1][1]<=width
  assert len(post)==4 and post[2][3].startswith('4f525058') and not post[2][4];assert not err,err
  (p/'BROWSER_ROLE_EVIDENCE.json').write_text(json.dumps({'engine':'Linux Chromium, loopback private synthetic role + ephemeral isolated object map','fixture':'fixture PDF with text + full-page redaction','exercise':'role practice then actual product UI → SQLite request transactions + isolated object upload/readback after reload','practiceRequests':before_requests,'postDataSummary':[[x[0].split('/api/ia/')[-1].split('?')[0],*x[1:]]for x in post],'originalByteHash':hashlib.sha256(file).hexdigest(),'readbackOpaqueBlack':True,'viewports':screen,'pageErrors':err,'currentCaseId':rec,'provider':'local only. No user OS, real user documents, real R2, or external verification.'},indent=2,ensure_ascii=False)+'\n');print('PASS',screen)
 finally:browser.close();proc.terminate()
