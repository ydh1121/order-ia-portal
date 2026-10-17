"""Local browser mock only; uses no Google credentials and never tests production write access."""
import asyncio, json, re, subprocess, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
s = (ROOT / 'functions/ia/[[path]].js').read_text()
m = re.search(r'const html=`(<!doctype html>[\s\S]*?)`;',s)
assert m
(ROOT / 'public/qa-dashboard.html').write_text(m.group(1))
screens=[]
for prefix,num in [('F',18),('U',10),('P',9),('C',5),('A',34)]:
    for i in range(num): screens.append(dict(screenId=f'{prefix}{i:02d}',name=('테스트 화면 '+str(i)),audience='매장 고객' if prefix=='F' else '운영자',phase='R1',status='기획 진행',details='내부 테스트 기획 메타데이터',qaVerified='독립 수락 없음',plannedRoute='/qa'))
decisions=[dict(id=f'PENDING-{i:02d}',name=f'모의 검토 {i}',question='모의 정책 결정',status='승인 완료' if i==1 else ('핵심 공개요건 승인·운영세부 검토' if i==19 else '검토 필요'),relatedScreens='F17',implementation='PLAN_ONLY',isFullyApproved=i==1) for i in range(1,26)]
roadmap=[dict(stage=f'{i}단계',type='기획',goal=f'모의 로드맵 {i}',description='모의 설명',status='검토 중',scope='R1',dependency='기획') for i in range(7)]
data={'source':'GOOGLE_SHEETS_AUTHENTICATED_READ','readOnly':True,'screenCount':76,'decisionCount':25,'roadmapCount':7,'screens':{'total':76,'items':screens},'decisions':{'total':25,'active':24,'fullyApproved':1,'items':decisions},'roadmap':{'total':7,'items':roadmap},'notes':{'items':[{'id':'FB-01','screenOrDecisionId':'F17','date':'2026-10-17','text':'모의 의견 테스트','handlingStatus':'검토 중'}]},'guide':{'items':[{'order':'1','area':'화면별 의견','instructions':'시트에 메모'}]}}
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for width in (390,1440):
            page=await browser.new_page(viewport={'width':width,'height':860})
            await page.set_content(m.group(1).replace('<script src="/owner.js" defer></script>',''))
            await page.add_style_tag(content=(ROOT/'public/owner.css').read_text())
            override = """(data)=>{window.fetch=async function(path){const url=String(path);if(url.includes('/api/ia/auth/me'))return new Response(JSON.stringify({role:'OWNER',email:'synthetic@example.invalid',csrf:'testonly'}),{status:200,headers:{'Content-Type':'application/json'}});if(url.includes('/api/ia/dashboard'))return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});throw new Error('UNEXPECTED_TEST_FETCH');}}"""
            await page.evaluate(override,data)
            await page.add_script_tag(content=(ROOT/'public/owner.js').read_text())
            await page.get_by_text('검색 결과 76 / 76개').wait_for(timeout=10000)
            assert await page.locator('.registry-card').count()==76
            await page.get_by_role('searchbox').fill('F17')
            assert await page.locator('.registry-card').count()==1
            await page.get_by_role('button',name='F17 테스트 화면 17 상세').click()
            assert await page.get_by_text('SCREEN · F17').count()==1
            await page.get_by_role('button',name='닫기').click()
            await page.get_by_role('button',name='향후 검토').click()
            assert await page.locator('details.record').count()==25
            await page.get_by_role('button',name='사업 로드맵').click()
            assert await page.locator('li.roadmap-card').count()==7
            await page.get_by_role('button',name='의견 기록').click()
            assert await page.locator('details.record').count()==1
            await page.get_by_role('button',name='사용 안내').click()
            assert await page.get_by_text('시트에 메모').count()==1
            assert await page.locator('body').evaluate('(node)=>node.scrollWidth <= innerWidth+4'),f'overflow at {width}'
            print(f'BROWSER MOCK PASS viewport={width} screens=76 search detail decisions=25 roadmap=7 notes guide layout')
            await page.close()
        await browser.close()
asyncio.run(main())
