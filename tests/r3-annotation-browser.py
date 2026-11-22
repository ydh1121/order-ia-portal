"""Chromium interaction tests of the actual authenticated Pages UI with ephemeral SQLite/actor."""
from pathlib import Path
from math import dist
from r3_feedback_browser_support import frame_click, prepare_frame_pointer
from playwright.sync_api import sync_playwright,expect
import json, subprocess, os, shutil, tempfile, hashlib
root=Path(__file__).resolve().parents[1]

def review_events(page,kind,record_id):
 # Read through the authenticated browser, like the host's history control.
 # The loopback fixture forwards the application's Secure session cookie.
 result=page.evaluate("""async ({kind,id})=>{
  const query=new URLSearchParams({release:'MSG0585-R3',kind,id});
  const response=await fetch('/api/ia/r3-qa/events?'+query,{credentials:'same-origin',cache:'no-store',redirect:'error'});
  let data=null;try{data=await response.json();}catch{}
  const error=typeof data?.error==='string'&&/^[A-Z0-9_]{1,80}$/.test(data.error)?data.error:'INVALID_EVENT_RESPONSE';
  return {status:response.status,error,items:data?.items};
 }""",{'kind':kind,'id':record_id})
 assert 200<=result['status']<300,{'status':result['status'],'error':result['error']}
 assert isinstance(result.get('items'),list),{'status':result['status'],'error':'INVALID_EVENT_RESPONSE'}
 return result['items']

def check_rework_instruction(page,original):
 # Save through the actual reply endpoint, reload a server draft, and inspect
 # the append-only source events so a status or anchor mutation cannot hide.
 parent_id=original['id']
 card=page.locator('#notes article[data-feedback-id="'+parent_id+'"]')
 before=review_events(page,'comment',parent_id)
 first='이 위치의 간격을 다시 맞춰 주세요.'
 final='이 위치의 간격과 정렬을 함께 확인해 주세요.'
 expect(card).to_have_attribute('data-feedback-status','unresolved')
 card.get_by_role('button',name='재작업 지시',exact=True).click()
 page.get_by_label('재작업 지시사항',exact=True).fill(first)
 expect(page.locator('#reposition')).to_be_hidden()
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='draft') as drafted:
  page.locator('#draft').click()
 assert drafted.value.ok
 draft_data=drafted.value.request.post_data_json['data']
 assert draft_data['purpose']=='rework' and draft_data['sourceArtifactHash']==original['data']['target']['artifactHash']
 assert draft_data['parent']=={'origin':'current','id':parent_id} and 'anchor' not in draft_data
 page.reload();page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');page.locator('#points').click()
 page.get_by_role('button',name='임시 재작업 지시 이어쓰기',exact=True).click()
 expect(page.get_by_label('재작업 지시사항',exact=True)).to_have_value(first)
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='reply') as saved:
  page.get_by_role('button',name='재작업 지시 저장',exact=True).click()
 assert saved.value.ok and saved.value.json()['revision']==1
 assert saved.value.request.post_data_json['data']==draft_data
 instruction_id=saved.value.json()['id']
 instruction=card.locator('[data-reply-id="'+instruction_id+'"]')
 expect(instruction).to_contain_text(first)
 expect(card).to_have_attribute('data-feedback-status','unresolved')
 instruction.get_by_role('button',name='재작업 지시 수정',exact=True).click()
 page.get_by_label('재작업 지시사항',exact=True).fill(final)
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='reply') as updated:
  page.get_by_role('button',name='재작업 지시 저장',exact=True).click()
 assert updated.value.ok and updated.value.json()['revision']==2
 assert updated.value.request.post_data_json['data']['sourceArtifactHash']==draft_data['sourceArtifactHash']
 expect(instruction).to_contain_text(final)
 instruction.locator('summary').click()
 expect(instruction.locator('details')).to_contain_text(first)
 expect(instruction.locator('details')).to_contain_text(final)
 page.reload();page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');page.locator('#points').click()
 expect(instruction).to_contain_text(final)
 expect(card.get_by_text(original['data']['body'],exact=True)).to_be_visible()
 expect(card).to_have_attribute('data-feedback-status','unresolved')
 expect(card.get_by_role('button',name='의견 미해결',exact=True)).to_have_attribute('aria-pressed','true')
 assert review_events(page,'comment',parent_id)==before
 events=review_events(page,'reply',instruction_id)
 assert [event['data']['body'] for event in events]==[first,final]
 assert all(event['data']['purpose']=='rework' and event['data']['sourceArtifactHash']==draft_data['sourceArtifactHash'] for event in events)
 print('PASS rework draft reload, reply edit history and final reload; original body/anchor/status unchanged')

def check_previous_rework(page,base,width):
 current_url=page.url
 page.goto(base+'/ia?view=qa-lab&archive=1&screen=login/empty/email&width='+str(width)+'&version=previous')
 page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 expect(page.locator('#version')).to_have_value('previous')
 page.locator('#points').click();page.locator('#general').click()
 original_body='이전 판에서 남긴 재작업 원문 '+str(width)
 page.locator('#body-text').fill(original_body)
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='comment') as created:
  page.locator('#save').click()
 assert created.value.ok
 original=created.value.json();original_id=original['id'];original_hash=original['data']['target']['artifactHash']
 before=review_events(page,'comment',original_id)
 page.goto(current_url);page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');page.locator('#points').click()
 card=page.locator('#notes article[data-feedback-id="'+original_id+'"]')
 expect(card).to_contain_text('이전 판 의견')
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='feedback') as reviewed:
  card.get_by_role('button',name='의견 재검토',exact=True).click()
 assert reviewed.value.ok
 expect(card).to_have_attribute('data-feedback-status','recheck')
 status_id=reviewed.value.json()['id'];status_before=review_events(page,'feedback',status_id)
 card.get_by_role('button',name='재작업 지시',exact=True).click()
 instruction='이전 원문을 유지하고 현재 화면에서 다시 확인해 주세요.'
 page.get_by_label('재작업 지시사항',exact=True).fill(instruction)
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='reply') as saved:
  page.get_by_role('button',name='재작업 지시 저장',exact=True).click()
 assert saved.value.ok
 data=saved.value.request.post_data_json['data']
 assert data['purpose']=='rework' and data['parent']=={'origin':'current','id':original_id}
 assert data['sourceArtifactHash']==original_hash and data['target']['artifactHash']!=original_hash and 'anchor' not in data
 expect(card.get_by_text(instruction,exact=True)).to_be_visible()
 page.reload();page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');page.locator('#points').click()
 expect(card.get_by_text(instruction,exact=True)).to_be_visible()
 expect(card.get_by_text(original_body,exact=True)).to_be_visible()
 expect(card).to_have_attribute('data-feedback-status','recheck')
 assert review_events(page,'comment',original_id)==before
 assert review_events(page,'feedback',status_id)==status_before
 print('PASS historical comment accepts current-version rework; source hash, original and recheck status preserved after reload')
 page.locator('#close-drawer').click()

def check_draft_recovery(context,page):
 # Exercise the real editor, interrupt just the response after one committed POST,
 # and replay from a reloaded document. The SQLite fixture receives actual requests.
 body='복구 검수용 의견'
 save_error='서버가 저장을 완료하지 못했습니다. 입력은 이 탭에 보관했습니다.'
 draft=page.locator('#body-text')
 page.locator('#points').click()
 page.locator('#general').click()
 draft.fill(body)
 context.set_offline(True)
 page.locator('#save').click()
 expect(page.locator('#live')).to_have_text(save_error)
 expect(page.locator('#save-error')).to_be_visible()
 expect(page.locator('#save-error')).to_have_text(save_error)
 expect(draft).to_have_value(body)
 context.set_offline(False)
 def recover():
  page.reload()
  page.get_by_role('button',name='저장하지 않은 의견 이어쓰기 · '+body).click()
  expect(draft).to_have_value(body)
  expect(page.locator('#save-error')).to_be_visible()
  expect(page.locator('#save-error')).to_have_text(save_error)
 recover()
 pattern='**/api/ia/r3-qa/records'
 seen=[]
 def drop_committed_response(route):
  response=route.fetch()
  seen.append((route.request.post_data_json['idempotencyKey'],response.status))
  route.abort()
 page.route(pattern,drop_committed_response)
 page.locator('#save').click()
 expect(page.locator('#live')).to_have_text(save_error)
 expect(page.locator('#save-error')).to_be_visible()
 expect(page.locator('#save-error')).to_have_text(save_error)
 page.unroute(pattern,drop_committed_response)
 recover()
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records')) as result:
  page.locator('#save').click()
 response=result.value
 assert len(seen)==1 and seen[0][1]==200 and response.request.post_data_json['idempotencyKey']==seen[0][0]
 assert response.json()['replayed'] and response.json()['revision']==1
 card=page.locator('#notes article').filter(has=page.get_by_text(body,exact=True))
 second=context.new_page()
 second.goto(page.url)
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 second.locator('#notes article').filter(has=second.get_by_text(body,exact=True)).get_by_role('button',name='수정',exact=True).click()
 second.locator('#body-text').fill('두 번째 탭 초안')
 card.get_by_role('button',name='수정',exact=True).click()
 draft.fill('먼저 확정한 의견')
 page.locator('#save').click()
 expect(page.locator('#live')).to_contain_text('저장됨 · r2')
 second.locator('#save').click()
 expect(second.locator('#conflict')).to_contain_text('먼저 확정한 의견')
 expect(second.locator('#body-text')).to_have_value('두 번째 탭 초안')
 second.get_by_role('button',name='다른 탭의 내용을 확인하고 계속 수정').click()
 second.locator('#save').click()
 expect(second.locator('#live')).to_contain_text('저장됨 · r3')
 second.reload()
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 entry=second.locator('#notes article').filter(has=second.get_by_text('두 번째 탭 초안',exact=True))
 entry.get_by_role('button',name='이력').click()
 expect(entry).to_contain_text('r2 · save · 먼저 확정한 의견')
 expect(entry).to_contain_text('r3 · save · 두 번째 탭 초안')
 second.close()
 print('PASS offline edit + reload, post-commit lost response + replay r1, two-tab UI conflict + explicit rebase r3 preserving both versions')
def check_screen_memo(context,page):
 page.reload()
 page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 page.locator('#points').click()
 memo=page.locator('#review-note')
 first='이 화면에 관한 별도 메모'
 with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json['kind']=='screen') as saved:
  memo.fill(first)
 assert saved.value.ok and saved.value.json()['revision']==1
 expect(page.locator('#review-note-state')).to_contain_text('저장됨 · r1')
 second=context.new_page()
 second.goto(page.url)
 second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 second.locator('#points').click()
 expect(second.locator('#review-note')).to_have_value(first)
 expect(second.locator('#notes article').filter(has=second.get_by_text(first,exact=True))).to_have_count(0)
 second.locator('#review-note').fill('갱신한 화면 메모')
 second.locator('#save-review-note').click()
 expect(second.locator('#review-note-state')).to_contain_text('저장됨 · r2')
 second.close()
 page.reload()
 page.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached')
 page.locator('#points').click()
 expect(memo).to_have_value('갱신한 화면 메모')
 print('PASS screen memo autosave, explicit update, second-tab read and refresh; distinct from comment and verdict')

def pin_geometry(page, frame, anchor):
 # Resolve the persisted identity from the current DOM, independently of the marker's CSS left/top.
 pin = frame.locator(".r3-pin").first
 child = pin.evaluate("""(pin,a)=>{
   const root=document.getElementById('order-single'),paths=new WeakMap(),byId=new Map([['screen',root]]);
   const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
   for(const el of root.querySelectorAll('*')){
     if(el.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(el.tagName))continue;
     const path=(paths.get(el.parentElement)||'screen')+'/'+[el.localName,...fields.map(k=>el.getAttribute(k)||'')].join('|');
     paths.set(el,path);let n=2166136261;
     for (const c of path)n=Math.imul(n^c.charCodeAt(0),16777619);
     const id='a-'+(n>>>0).toString(36);byId.set(id,byId.has(id)?null:el);
   }
   const el=byId.get(a.id);
   if(!el)throw Error('Missing or ambiguous restored anchor '+a.id);
   const r=el.getBoundingClientRect(),m=pin.getBoundingClientRect();
   const scroll={};
   for(const s of a.scroll){
     if(s.id.startsWith('host-'))continue;
     const node=s.id==='document'?document.scrollingElement:byId.get(s.id);
     if(!node)throw Error('Missing restored scroll container '+s.id);
     scroll[s.id]=[node.scrollLeft,node.scrollTop];
   }
   return {tag:el.localName,anchorId:a.id,relative:[r.x+a.x*r.width,r.y+a.y*r.height],
           center:[m.left+m.width/2,m.top+m.height/2],rect:[r.x,r.y,r.width,r.height],scroll};
 }""",anchor)
 host = page.locator("#frame").evaluate("""(frame,p)=>{
   const r=frame.getBoundingClientRect(),surface=document.getElementById('surface'),doc=document.scrollingElement;
   return {frame:[r.x,r.y,r.width,r.height],absolute:[
     r.left+(frame.clientLeft+p[0])*r.width/frame.offsetWidth,
     r.top+(frame.clientTop+p[1])*r.height/frame.offsetHeight],
     scroll:{'host-surface':[surface.scrollLeft,surface.scrollTop],'host-document':[doc.scrollLeft,doc.scrollTop]}};
 }""",child["center"])
 return {**child,**host,"scroll":{**child["scroll"],**host["scroll"]}}


def restored_pin(page, frame, card, anchor):
 root = frame.locator("#order-single")
 root.evaluate("""(el,id)=>{
   el.removeAttribute('data-test-restored');
   function seen(e){
     if(e.source!==parent||e.data?.scope!=='ORDER_R3_HOST'||e.data.type!=='restore'||e.data.payload?.id!==id)return;
     window.removeEventListener('message',seen);
     requestAnimationFrame(()=>requestAnimationFrame(()=>{el.dataset.testRestored=id;}));
   }
   window.addEventListener('message',seen);
 }""",anchor["id"])
 card.get_by_role("button",name="위치 보기",exact=True).click()
 expect(root).to_have_attribute("data-test-restored",anchor["id"])
 geometry=pin_geometry(page,frame,anchor)
 for entry in anchor["scroll"]:
  observed=geometry["scroll"][entry["id"]]
  assert dist(observed,[entry["x"],entry["y"]])<=1, (entry,observed,geometry)
 assert dist(geometry["relative"],geometry["center"])<=3, geometry
 return geometry

def check_zoomed_pin(page, context, origin, width):
    """Save a real pin on a wide canvas. Preserve its DOM attachment across view changes."""
    state = {320:"empty", 390:"filled", 1440:"email-error"}[width]
    page.set_viewport_size({"width":width, "height":870})
    page.goto(f"{origin}/ia?view=qa-lab&archive=1&screen=login/{state}/email&width=1920")
    frame = page.frame_locator("#frame")
    veil = frame.locator("#r3-veil")
    veil.wait_for(state="attached")

    def fit(enabled):
        page.locator("#points").click()
        page.locator("[data-drawer-tab=settings]").click()
        page.locator("#scale-fit").set_checked(enabled)
        page.locator("#close-drawer").click()
        return page.locator("#focus-unit .preview-canvas").evaluate(
            "el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a"
        )

    assert fit(False) == 1
    expect(page.locator('#new')).to_have_attribute('aria-pressed','false')
    page.locator("#new").click()
    expect(page.locator('#new')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#drawer')).to_have_js_property('hidden',True)
    expect(veil).to_be_visible()
    frame_click(page, veil, position={"x":1750, "y":150})
    text = f"배율과 가로 이동 {width}"
    page.locator("#body-text").fill(text)
    with page.expect_response(lambda r: r.request.method=="POST" and
            r.url.endswith("/r3-qa/records") and r.request.post_data_json.get("kind")=="comment") as receipt:
        page.locator("#save").click()
    assert receipt.value.ok
    expect(page.locator('#new')).to_have_attribute('aria-pressed','true')
    expect(veil).to_be_visible()
    page.locator('#points').click()
    anchor = receipt.value.request.post_data_json["data"]["anchor"]
    saved_x = next(s["x"] for s in anchor["scroll"] if s["id"]=="host-surface")
    assert saved_x > 0, anchor["scroll"]
    card = page.locator("#notes article").filter(has=page.get_by_text(text,exact=True))
    original = restored_pin(page, frame, card, anchor)

    # Pinch zoom is Chrome's visual viewport scale. The QA tool's canvas fit control
    # is a distinct transformation; verify both without editing the rendered DOM.
    cdp = context.new_cdp_session(page)
    try:
        cdp.send("Emulation.setPageScaleFactor", {"pageScaleFactor":2})
        scale = page.evaluate("() => visualViewport.scale")
        assert abs(scale-2) <= 0.01, scale
        enlarged = pin_geometry(page, frame, anchor)
        assert dist(enlarged["relative"], enlarged["center"]) * scale <= 3, enlarged
        cdp.send("Emulation.setPageScaleFactor", {"pageScaleFactor":1})
    finally:
        cdp.detach()
    fitted_scale = fit(True)
    assert 0 < fitted_scale < 1, fitted_scale
    fitted = pin_geometry(page, frame, anchor)
    assert dist(fitted["relative"], fitted["center"]) <= 3
    page.locator("[data-mode=dual]").first.click()
    dual = pin_geometry(page, frame, anchor)
    assert dist(dual["relative"], dual["center"]) <= 3
    page.locator("[data-mode=focus]").first.click()
    assert fit(False) == 1
    # Move the real stage away from the recorded position, then restore through the UI.
    stage = page.locator("#surface")
    stage.evaluate("el => el.scrollTo(0,0)")
    assert stage.evaluate("el => el.scrollLeft") == 0
    page.locator("#points").click()
    restored = restored_pin(page, frame, card, anchor)
    error = dist(restored["absolute"], original["absolute"])
    assert error <= 3, (error, restored, original)
    print(json.dumps({"width":width, "artifactWidth":1920, "zoom":scale,
                      "fitScale":fitted_scale, "savedScrollX":saved_x,
                      "absoluteErrorAfterModeAndZoom":error}), flush=True)


def run():
 host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
 try:
  fixture=json.loads(host.stdout.readline())
  with sync_playwright() as pw:
   binary=os.environ.get('R3_BROWSER_BINARY') or shutil.which('chromium')
   browser=pw.chromium.launch(executable_path=binary)
   for width in (390,1440):
    ctx=browser.new_context(viewport={'width':width,'height':870},has_touch=width<600)
    page=ctx.new_page();prepare_frame_pointer(page);page.set_default_timeout(12000);errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(fixture['url']+'/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail')
    page.locator('input[name=email]').fill(fixture['email']);page.locator('input[name=password]').fill(fixture['pass']);page.locator('button[type=submit]').click()
    page.wait_for_url('**/ia?view=qa-lab**')
    frame=page.frame_locator('#frame')
    frame.locator('#r3-veil').wait_for(state='attached')
    page.goto(fixture['url']+'/ia?view=qa-lab&archive=1&screen=login/empty/email&width='+str(width))
    frame.locator('#r3-veil').wait_for(state='attached')
    page.locator('#new').click()
    frame.locator('#r3-veil').wait_for(state='visible')
    # Same viewport point can hold independent comments; typing alone never submits.
    anchors=[];source_comments=[]
    for i in range(2):
     veil=frame.locator('#r3-veil');frame_click(page,veil,position={'x':100,'y':120})
     page.locator('#body-text').fill('위치 '+str(i))
     with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/r3-qa/records') and r.request.post_data_json.get('kind')=='comment') as saved:
      page.locator('#save').click()
     assert saved.value.ok
     anchors.append(saved.value.request.post_data_json['data']['anchor'])
     source_comments.append(saved.value.json())
     page.locator('#live').filter(has_text='저장됨').wait_for()
     expect(page.locator('#new')).to_have_attribute('aria-pressed','true')
     expect(veil).to_be_visible()
    page.locator('#pick-cancel').click()
    expect(page.locator('#new')).to_have_attribute('aria-pressed','false')
    page.locator('#close-drawer').click();pin=frame.locator('.r3-pin');pin.first.wait_for()
    expect(pin).to_have_count(1)
    expect(pin.first).to_have_text('1')
    expect(pin.first).to_have_attribute('data-cluster','+1')
    expect(pin.first).to_have_attribute('aria-label','위치 코멘트 1, 2번 열기')
    frame_click(page,pin.first);assert '위치 0' in page.locator('#notes').inner_text() and '위치 1' in page.locator('#notes').inner_text()
    parent=page.locator('#notes article').filter(has=page.get_by_text('위치 0',exact=True))
    parent.get_by_role('button',name='답글 작성').click()
    page.locator('#body-text').fill('저장한 답글');page.get_by_role('button',name='답글 저장').click()
    parent.get_by_text('저장한 답글',exact=True).wait_for()
    if width==390:check_rework_instruction(page,source_comments[0])
    second=ctx.new_page();second.goto(page.url);second.frame_locator('#frame').locator('#r3-veil').wait_for(state='attached');second.locator('#points').click()
    other=second.locator('#notes article').filter(has=second.get_by_text('위치 0',exact=True));other.get_by_text('저장한 답글',exact=True).wait_for()
    second.close()
    before=restored_pin(page,frame,parent,anchors[0])
    page.reload()
    pin.first.wait_for()
    on_reload=pin_geometry(page,frame,anchors[0])
    assert dist(on_reload['relative'],on_reload['center'])<=3, on_reload
    page.locator('#points').click()
    after=restored_pin(page,frame,parent,anchors[0])
    error=max(dist(after['absolute'],before['absolute']),dist(after['center'],before['center']),dist(after['relative'],before['relative']))
    assert error<=3, {'before':before,'on_reload':on_reload,'after':after,'error':error}
    print(json.dumps({'width':width,'storedAnchor':{k:anchors[0][k] for k in ('id','x','y','scroll')},
                      'beforeRestore':before,'afterReload':on_reload,'afterRestore':after}),flush=True)
    page.locator('#points').click()
    page.locator('[data-drawer-tab=settings]').click()
    with page.expect_download() as downloaded:
     page.locator('#export-editable').click()
    file=Path(downloaded.value.path());raw=file.read_bytes()
    assert b'<iframe' not in raw and b'id="frame-meta"' in raw
    assert not errors,errors
    print(json.dumps({'width':width,'restorePixelError':error,'overlapCount':2,'exportSHA256':hashlib.sha256(raw).hexdigest(),'pageErrors':errors}))
    page.locator('#close-drawer').click()
    if width==390:
     check_draft_recovery(ctx,page)
     check_screen_memo(ctx,page)
     check_previous_rework(page,fixture['url'],width)
    # Each breakpoint owns a fresh Chrome visual viewport. Keep the same signed
    # context and SQLite records, while exercising zoom/fit/dual/focus together
    # within each case rather than carrying CDP emulation into the next case.
    for zoom_width in ((320,width) if width==390 else (width,)):
     zoom_page=ctx.new_page();prepare_frame_pointer(zoom_page);zoom_page.set_default_timeout(12000)
     zoom_page.on('pageerror',lambda e:errors.append(str(e)))
     try:check_zoomed_pin(zoom_page,ctx,fixture['url'],zoom_width)
     finally:zoom_page.close()
    assert not errors,errors
    ctx.close()
   browser.close()
 finally:host.terminate();host.wait(timeout=5)
if __name__=='__main__':run()
