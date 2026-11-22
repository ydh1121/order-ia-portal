"""Drive protected original admin/common review frames, with isolated, controlled outcomes."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from r3_feedback_browser_support import ReviewScreens, frame_click
from r3_workflow_browser_support import inspect_fixture, configure, release


def capture_commands(frame):
    """Observe the canonical adapter without replacing its transport or result."""
    frame.locator('#order-single').evaluate('''el=>{
      const w=el.ownerDocument.defaultView,a=w.ORDER_APP_ADAPTER;
      // Receipt and billing now retain one application and adapter. End the
      // previous observation before starting another, so one real command is
      // still counted once when the next route is selected.
      w.__adminCommandObserver?.release();
      const original=a.request,request=original.bind(a),records=[];
      const observed=(path,body,signal)=>{if(body)records.push({path,body:JSON.parse(JSON.stringify(body))});return request(path,body,signal);};
      w.__adminCommands=records;
      w.__adminCommandObserver={release(){if(a.request===observed)a.request=original;}};
      a.request=observed;
    }''')


def commands(frame):
    return frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__adminCommands')


def receipt_workflow(page, frame, width):
    panel=frame.locator('.wf-panel')
    expect(panel.get_by_role('heading',name='영수증 발급',exact=True)).to_be_visible()
    purchases=panel.get_by_label('결제 내역',exact=True)
    expect(purchases.locator('option')).to_have_count(3)
    purchases.select_option('qa-order-paid')
    expect(panel.get_by_label('발급 주체',exact=True)).to_have_value('order-to-business')
    panel.get_by_label('받는 곳',exact=True).select_option('site')
    capture_commands(frame)
    issue=panel.locator('[data-label="영수증 발급"]')
    configure(frame,{'requests':{'product POST /receipts':{'scenario':'loading'}}})
    frame_click(page,issue)
    expect(issue).to_have_attribute('data-async-phase','pending')
    expect(purchases).to_be_disabled()
    expect(panel.locator('.wf-paper')).to_have_count(0)
    page.keyboard.press('Enter')
    held=inspect_fixture(frame)
    assert held['pending']==1 and held['data']['receipts']==[],held
    assert len(commands(frame))==1,'a duplicate keyboard activation must not issue another request'
    release(frame,{'requests':{'product POST /receipts':{'scenario':'error','status':503}}})
    expect(issue).to_have_attribute('data-async-phase','error')
    expect(panel.locator('.wf-status')).to_have_attribute('data-error','true')
    expect(purchases).to_be_enabled()
    expect(purchases).to_have_value('qa-order-paid')
    assert inspect_fixture(frame)['data']['receipts']==[]
    configure(frame,{'requests':{'product POST /receipts':{'scenario':'loading'}}})
    frame_click(page,issue)
    expect(issue).to_have_attribute('data-async-phase','pending')
    release(frame)
    paper=panel.locator('.wf-paper')
    expect(paper).to_be_visible()
    expect(issue).to_have_attribute('data-async-phase','success')
    saved=inspect_fixture(frame)
    assert len(saved['data']['receipts'])==1,saved
    item=saved['data']['receipts'][0]
    assert item['purchaseId']=='qa-order-paid' and item['recipient']['kind']=='site'
    assert item['paid']==240000 and item['status']=='ISSUED'
    assert commands(frame)[0]==commands(frame)[1],'retry keeps the immutable payload and idempotency key'
    expect(paper).to_contain_text(item['number'])
    expect(paper).to_contain_text('240,000원')
    expect(paper.locator('code')).to_have_text(item['documentDigest'])
    expect(panel.get_by_label('발급한 영수증',exact=True)).to_have_value(item['id'])
    frame_click(page,panel.locator('[data-label="다시 열기"]'))
    expect(panel.locator('[data-label="다시 열기"]')).to_have_attribute('data-async-phase','success')
    expect(paper).to_contain_text(item['number'])
    assert inspect_fixture(frame)['data']['receipts']==[item],'reopening keeps the issued snapshot'
    frame.locator('#order-single').evaluate('el=>{const w=el.ownerDocument.defaultView;w.__printCalls=0;w.print=()=>{w.__printCalls++;};}')
    frame_click(page,panel.get_by_role('button',name='인쇄',exact=True))
    assert frame.locator('#order-single').evaluate('el=>el.ownerDocument.defaultView.__printCalls')==1
    assert any(call['method']=='GET' and call['path']=='/receipts/'+item['id'] for call in inspect_fixture(frame)['calls'])
    assert saved['source']['kind']=='dummy' and saved['source']['commercial'] is False and saved['source']['persistent'] is False
    panel.screenshot(path=out/f'receipt-{width}.png',animations='disabled')
    return {'source':saved['source'],'issued':item,'retryPayloadPreserved':True,'pendingDuplicateBlocked':True,'reopenedSameDocument':True,'printRequested':True,'commercialDocumentIssued':False}


def billing_workflow(page, frame, width):
    panel=frame.locator('.wf-panel')
    expect(panel.get_by_role('heading',name='별도 청구',exact=True)).to_be_visible()
    account=panel.get_by_label('청구 계정',exact=True)
    expect(account.locator('option')).to_have_count(1)
    subject=panel.get_by_label('청구 내용',exact=True)
    amount=panel.get_by_label('금액 직접 입력',exact=True)
    draft=panel.locator('[data-label="임시 저장"]')
    issue=panel.locator('[data-label="청구서 발급"]')
    capture_commands(frame)
    frame_click(page,issue)
    expect(panel.locator('.wf-status')).to_contain_text('청구 계정, 내용, 금액과 납부 기한')
    assert commands(frame)==[],'missing required values do not create a draft or issued document'
    subject.fill('QA 별도 배송비')
    amount.fill('1234')
    frame_click(page,panel.locator('.wf-number-pad').get_by_role('button',name='0',exact=True))
    expect(amount).to_have_value('12340')
    expect(panel.locator('.wf-amount')).to_have_attribute('aria-label','12,340원')
    panel.get_by_label('메모 · 선택',exact=True).fill('검토용 저장 내용')
    panel.get_by_label('납부 기한',exact=True).fill('2026-12-01')
    configure(frame,{'requests':{'product POST /billing':{'scenario':'loading'}}})
    frame_click(page,draft)
    expect(draft).to_have_attribute('data-async-phase','pending')
    expect(subject).to_be_disabled()
    expect(amount).to_be_disabled()
    expect(issue).to_be_disabled()
    page.keyboard.press('Enter')
    assert len(commands(frame))==1 and inspect_fixture(frame)['data']['billing']==[]
    release(frame,{'requests':{'product POST /billing':{'scenario':'error','status':503}}})
    expect(draft).to_have_attribute('data-async-phase','error')
    expect(amount).to_be_enabled()
    expect(amount).to_have_value('12340')
    expect(subject).to_have_value('QA 별도 배송비')
    assert inspect_fixture(frame)['data']['billing']==[]
    configure(frame,{'requests':{'product POST /billing':{'scenario':'loading'}}})
    frame_click(page,draft)
    expect(draft).to_have_attribute('data-async-phase','pending')
    release(frame)
    expect(panel.locator('.wf-status')).to_have_text('임시 저장했어요.')
    saved=inspect_fixture(frame)['data']['billing']
    assert len(saved)==1 and saved[0]['status']=='DRAFT' and saved[0]['revision']==1,saved
    assert saved[0]['amount']==12340 and saved[0]['accountId']=='qa-store:qa-site'
    assert commands(frame)[0]==commands(frame)[1],'a failed draft retries its exact saved inputs and request key'
    draft_id=saved[0]['id']
    expect(panel.get_by_label('저장한 청구서',exact=True)).to_have_value(draft_id)
    frame_click(page,panel.get_by_role('button',name='새 청구',exact=True))
    expect(subject).to_have_value('')
    expect(amount).to_have_value('')
    frame_click(page,panel.get_by_role('button',name='불러오기',exact=True))
    expect(subject).to_have_value('QA 별도 배송비')
    expect(amount).to_have_value('12340')
    expect(panel.get_by_label('메모 · 선택',exact=True)).to_have_value('검토용 저장 내용')
    configure(frame,{'requests':{'product POST /billing':{'scenario':'loading'}}})
    frame_click(page,issue)
    expect(issue).to_have_attribute('data-async-phase','pending')
    expect(draft).to_be_disabled()
    assert inspect_fixture(frame)['data']['billing'][0]['status']=='DRAFT'
    release(frame)
    expect(panel.locator('.wf-status')).to_contain_text('발송과 결제는 아직 진행하지 않았어요.')
    expect(amount).to_be_disabled()
    issued=inspect_fixture(frame)['data']['billing']
    assert len(issued)==1 and issued[0]['id']==draft_id and issued[0]['revision']==2
    assert issued[0]['status']=='ISSUED' and issued[0]['paid']==0 and issued[0]['deliveryStatus']=='NOT_SENT'
    frame_click(page,panel.get_by_role('button',name='새 청구',exact=True))
    expect(subject).to_be_enabled()
    frame_click(page,panel.get_by_role('button',name='불러오기',exact=True))
    expect(panel.locator('.wf-status')).to_contain_text('내용을 변경할 수 없어요.')
    expect(amount).to_have_value('12340')
    expect(amount).to_be_disabled()
    panel.screenshot(path=out/f'billing-{width}.png',animations='disabled')
    return {'source':inspect_fixture(frame)['source'],'issued':issued[0],'draftRetryPreserved':True,'pendingSerialized':True,'savedDocumentReopened':True,'issuedInputsLocked':True,'sent':False,'paid':False}

root=Path(__file__).resolve().parents[1]
out=root/'artifacts/motion-runtime'
out.mkdir(parents=True,exist_ok=True)
host=subprocess.Popen(['node','tests/r3-browser-host.mjs'],cwd=root,stdout=subprocess.PIPE,text=True)
evidence=[]
try:
    c=json.loads(host.stdout.readline())
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.getenv('R3_BROWSER_BINARY') or shutil.which('chromium'))
        for width,reduced in [(390,'reduce'),(1440,'no-preference')]:
            ctx=browser.new_context(viewport={'width':width,'height':900},reduced_motion=reduced)
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(c['url']+'/ia?view=qa-lab&screen=login%2Fempty%2Femail')
            page.locator('input[name=email]').fill(c['email'])
            page.locator('input[name=password]').fill(c['pass'])
            page.locator('button[type=submit]').click()
            page.wait_for_url('**/ia?view=qa-lab**')
            screens=ReviewScreens(page,c['url'],width)
            # The helper also supports retained archive tests. This test exercises
            # the current product-backed QA route and keeps its trusted-pointer setup.
            page.goto(f"{c['url']}/ia?view=qa-lab&width={width}")
            expect(page.locator('#frame')).to_have_attribute('data-test-ready-hash',re.compile(r'^[0-9a-f]{64}$'),timeout=30000)
            frame=screens.screen('common','default')
            doc=frame.locator('#order-single')
            expect(doc).to_have_attribute('data-motion-runtime','admin-common')
            doc.evaluate("""el=>{window.__steps=[];el.addEventListener('r3:async-state',e=>window.__steps.push({...e.detail,t:performance.now()}));}""")
            def scenario(mode,navigates=False):
                page.locator('#points').click()
                detail=page.locator('#motion-review')
                if not detail.evaluate('el=>el.open'):
                    detail.locator(':scope > summary').click()
                detail.locator(f'button[data-motion-mode="{mode}"]').click()
                if not navigates:
                    expect(page.locator('#motion-note')).to_contain_text('검수 입력')
                    page.locator('#close-drawer').click()
            save=frame.locator('[data-action=save-demo]')
            scenario('delay')
            frame_click(page,save)
            expect(save).to_have_attribute('data-async-phase','pending')
            save.press('Enter')
            assert doc.evaluate("el=>window.__steps.filter(e=>e.phase==='pending').length")==1
            scenario('complete')
            expect(save).to_have_attribute('data-async-phase','success')
            scenario('error')
            load=frame.locator('[data-action=load-demo]')
            frame_click(page,load)
            expect(load).to_have_attribute('data-async-phase','error')
            expect(doc.locator('.t-skel')).to_have_class(re.compile('is-revealed'))
            scenario('normal')
            frame_click(page,frame.locator('[data-action=error-demo]'))
            expect(doc.locator('[name=demo-name]')).to_have_attribute('aria-invalid','true')
            expect(doc.locator('.inline-field-state')).to_be_hidden()
            toggle=doc.locator('[role=switch]')
            frame_click(page,toggle)
            expect(toggle).to_have_attribute('aria-checked','true')
            frame_click(page,frame.locator('[data-action=resize-demo]'))
            expect(doc.locator('.demo-resize')).to_have_class(re.compile('is-compact'))
            frame_click(page,frame.locator('[data-action=toggle-options]'))
            expect(doc.locator('.common-options')).to_have_class(re.compile('is-open'))
            option=doc.locator('[data-option]').first
            name=option.text_content()
            frame_click(page,option)
            expect(doc.locator('[data-action=toggle-options]')).to_have_text(name)
            steps=doc.evaluate('el=>window.__steps')
            assert [s['phase'] for s in steps]==['pending','success','pending','error'],steps
            assert all(s['source']=='controlled-qa' for s in steps)
            assert steps[0]['requestId']==steps[1]['requestId'] and steps[2]['requestId']==steps[3]['requestId']
            doc.screenshot(path=out/f'common-{width}.png',animations='disabled')
            record={'width':width,'motionPreference':reduced,'commonPhases':steps}
            if width==1440:
                f=screens.screen('admin-overview','normal')
                panel=f.locator('#order-single')
                # The product now reads its adapter's dashboard data. Keep exact
                # checks against that response, not the former 21/83 demo totals.
                dashboard=inspect_fixture(f)['data']['dashboard']
                periods={period['id']:period for period in dashboard['periods']}
                first_period,second_period=periods['7'],periods['30']
                points=first_period['points']
                assert len(points)>=2,dashboard
                unit=dashboard['unit']
                quantity=lambda value:f'{value:,}'+unit
                point_text=lambda point:point['label']+' · '+quantity(point['value'])+(' · '+point['note'] if point.get('note') else '')
                range_points=points[-2:]
                range_total=sum(point['value'] for point in range_points)
                range_text=range_points[0]['label']+' – '+range_points[-1]['label']+' · 합계 '+quantity(range_total)
                collapse=panel.locator('[data-qa-action=collapse-sidebar]')
                frame_click(page,collapse)
                expect(collapse).to_have_attribute('aria-expanded','false')
                frame_click(page,collapse)
                sub=panel.locator('[data-qa-action=toggle-submenu]')
                frame_click(page,sub)
                expect(sub).to_have_attribute('aria-expanded','true')
                frame_click(page,sub)
                nav=panel.locator('.qa-admin-nav-item').nth(1)
                nav.focus()
                expect(panel.locator('.qa-admin-nav .pm-nav-indicator')).to_have_css('opacity','1')
                expect(panel.locator('.pm-data-scope')).to_have_text(dashboard['scopeLabel'])
                expect(panel.locator('[data-pm-stat]')).to_have_attribute('data-period',first_period['id'])
                expect(panel.locator('[data-pm-stat] .pm-stat-value')).to_have_text(quantity(first_period['total']))
                frame_click(page,panel.locator('[data-pm-stat] [data-period="30"]'))
                expect(panel.locator('[data-pm-stat]')).to_have_attribute('data-period',second_period['id'])
                expect(panel.locator('[data-pm-stat] .pm-stat-value')).to_have_text(quantity(second_period['total']))
                wheel=panel.locator('.pm-ring-wheel')
                wheel.press('ArrowRight')
                expect(wheel).to_have_attribute('aria-valuetext','농장 4건')
                expect(panel.locator('.pm-ring-readout strong')).to_have_text('4건')
                expect(panel.locator('.pm-ring-wheel g path')).to_have_count(3)
                plot=panel.locator('[data-pm-metric] .pm-plot')
                expect(panel.locator('[data-pm-metric]')).to_have_attribute('data-period',first_period['id'])
                frame_click(page,plot,position={'x':2,'y':50})
                expect(panel.locator('[data-pm-metric] .pm-graph-tip')).to_have_text(point_text(points[0]))
                plot.press('End')
                expect(panel.locator('[data-pm-metric] .pm-graph-tip')).to_have_text(point_text(points[-1]))
                plot.press('Shift+ArrowLeft')
                expect(panel.locator('[data-pm-metric] .pm-graph-tip')).to_have_text(range_text)
                record['dashboardReadback']={'scopeLabel':dashboard['scopeLabel'],'periodTotals':{period['id']:period['total'] for period in (first_period,second_period)},'metricPeriod':first_period['id'],'firstPoint':points[0],'lastPoint':points[-1],'rangePoints':range_points,'rangeTotal':range_total}
                grid=panel.locator('.qa-widget-grid')
                first=grid.locator(':scope > [data-widget-id]').first.locator('h2').text_content()
                frame_click(page,panel.get_by_role('button',name='위젯 배치'))
                frame_click(page,panel.get_by_role('button',name='뒤로',exact=True))
                assert grid.locator(':scope > [data-widget-id]').nth(1).locator('h2').text_content()==first
                frame_click(page,panel.locator('[data-layout=size]'))
                expect(grid.locator('.qa-widget-expanded')).to_have_count(1)
                frame_click(page,panel.get_by_role('button',name='배치 적용'))
                expect(panel.get_by_role('button',name='위젯 배치')).to_be_visible()
                page.reload()
                expect(grid.locator(':scope > [data-widget-id]').nth(1).locator('h2')).to_have_text(first)
                expect(grid.locator('.qa-widget-expanded')).to_have_count(1)
                panel.screenshot(path=out/'admin-overview-1440.png',animations='disabled')
                loading=screens.screen('admin-overview','loading')
                expect(loading.locator('[data-async-region=pending]')).to_be_visible()
                scenario('complete',navigates=True)
                expect(page).to_have_url(re.compile('admin-overview(?:%2F|/)normal'))
                expect(loading.locator('.qa-widget-grid')).to_be_visible()
                loading=screens.screen('admin-overview','loading')
                expect(loading.locator('[data-async-region=pending]')).to_be_visible()
                scenario('offline',navigates=True)
                expect(page).to_have_url(re.compile('admin-overview(?:%2F|/)error'))
                expect(loading.locator('[data-qa-action=retry-overview]')).to_be_visible()
                f=screens.screen('admin-buyers','list')
                q=f.locator('[name=operationsSearch]')
                q.fill('두 번째')
                expect(f.locator('.ops-table tbody tr:visible')).to_have_count(1)
                f=screens.screen('admin-analytics','normal')
                item=f.locator('.ops-funnel button').nth(2)
                item.focus()
                expect(f.locator('.ops-chart-output')).to_have_text(re.compile(item.locator('span').text_content()))
                record['admin']=['sidebar','submenu','shared spring nav indicator','actual fixture stat period','ring arcs and keyboard','actual fixture metric pointer and range','widget layout reapplied on same-tab reload','filtered list','metric index']
                record['selectedLoading']=['held until controlled response','complete → normal','offline → retry state']
            record['receipt']=receipt_workflow(page,screens.screen('receipt','before'),width)
            if width==1440:
                # The former receipt-local demo download is superseded by the
                # actual print action; the host's script-free review export remains.
                page.locator('#points').click()
                page.locator('[data-drawer-tab=settings]').click()
                with page.expect_download() as download:
                    page.locator('#export-editable').click()
                content=Path(download.value.path()).read_text()
                assert 'frame-meta' in content and '영수증' in content and '<iframe' not in content
                assert not re.search(r'<script(?! type="application/json")',content)
                record['receiptDownload']={'type':'projected review HTML','name':download.value.suggested_filename,'commercialDocumentIssued':False}
                page.locator('#close-drawer').click()
            record['billing']=billing_workflow(page,screens.screen('admin-billing','draft'),width)
            assert not errors,errors
            record['pageErrors']=errors
            evidence.append(record)
            ctx.close()
        browser.close()
    (out/'admin-common.json').write_text(json.dumps({'class':'protected Chromium QA, isolated examples','observations':evidence},ensure_ascii=False,indent=2))
    print('PASS common pending/success/error, duplicate gates, keyboard, resize, sheet and admin operational review controls.')
finally:
    host.terminate();host.wait(timeout=5)
