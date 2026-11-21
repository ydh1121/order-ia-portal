import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderR3RolePage} from '../src/server/r3-role-page.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {signedWorkspace,issueExampleQuote,origin} from './r3-business-identities.fixture.mjs';
const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const wait=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Role UI did not reach the expected state');};
function page(fixture,actor,query=''){
 const dom=new JSDOM(renderR3RolePage('a'.repeat(24)),{url:origin+'/ia?view=roles-r3'+query,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.crypto.randomUUID=()=>crypto.randomUUID();Object.defineProperty(w.crypto,'subtle',{value:crypto.subtle});
 let failure=null;
 w.fetch=async(path,options={})=>{if(failure?.(path,options))return Response.json({error:'SERVICE_UNAVAILABLE'},{status:503});const headers=new Headers(options.headers);headers.set('Cf-Access-Jwt-Assertion',fixture.assertion(actor));if(options.method==='POST')headers.set('Origin',origin);return handleIaRequest(new Request(new URL(path,origin),{...options,signal:undefined,headers}),fixture.env,{fetcher:fixture.certs});};
 for(const script of d.scripts)w.eval(script.textContent);w.dispatchEvent(new w.Event('pageshow'));
 return {w,d,fail:fn=>failure=fn,close(){w.dispatchEvent(new w.Event('pagehide'));w.ORDER_COMMON_MOTION?.destroy();w.close();}};
}

test('actual signed role page installs common controls and consultation panel submits its retained form to the scoped handler',async t=>{
 const fixture=signedWorkspace(),quote=await issueExampleQuote(fixture),p=page(fixture,'buyer','&menu=consult&quote='+quote);t.after(()=>{p.close();fixture.db.close();});
 await wait(()=>p.d.querySelector('#create [name=memo]'));
 const form=p.d.querySelector('#create'),memo=form.querySelector('[name=memo]');assert.equal(p.w.ORDER_COMMON_MOTION?.version,'motion21');assert.equal(form.getAttribute('role'),'dialog');assert.equal(form.hidden,false);
 memo.value='같은 견적에 대한 상담 입력';form.querySelector('[name=desiredDate]').value=new Date(Date.now()+86400000).toISOString().slice(0,10);form.dispatchEvent(new p.w.Event('input',{bubbles:true}));
 form.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>form.hidden);assert.equal(form.querySelector('[name=memo]'),memo);assert.equal(memo.value,'같은 견적에 대한 상담 입력');
 [...p.d.querySelectorAll('button')].find(button=>button.textContent==='상담 예약 열기').click();assert.equal(form.hidden,false);form.dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>p.d.querySelector('#detail h2')?.textContent==='상담 · 작성 중');
 const data=await fixture.request('buyer','/api/ia/r3-role?context=1&id='+new URL(p.w.location.href).searchParams.get('case'));assert.equal(data.status,200);const saved=await data.json();assert.equal(saved.case.kind,'consult');assert.equal(saved.case.org_id,'store');assert.equal(saved.case.site_id,'site');assert.equal(saved.notes.at(-1).memo,'같은 견적에 대한 상담 입력');assert.deepEqual(saved.notes.at(-1).targets,[quote]);
});

test('actual publication switch writes the authenticated API, restores on 503 and reads the saved state after refresh',async t=>{
 const fixture=signedWorkspace(),p=page(fixture,'operator');t.after(()=>{p.close();fixture.db.close();});
 await wait(()=>p.d.querySelector('#publication [role=switch]'));
 let toggle=p.d.querySelector('#publication [role=switch]');assert.equal(toggle.getAttribute('aria-checked'),'false');
 p.fail(path=>path.endsWith('/publication'));toggle.click();await wait(()=>!toggle.hasAttribute('aria-busy'));assert.equal(toggle.getAttribute('aria-checked'),'false');assert.equal(fixture.db.prepare('SELECT count(*) n FROM r3_menu_publication').get().n,0);
 p.fail(null);toggle.click();await wait(()=>!toggle.hasAttribute('aria-busy')&&toggle.getAttribute('aria-checked')==='true');assert.equal(fixture.db.prepare('SELECT enabled FROM r3_menu_publication').get().enabled,1);
 p.d.querySelector('#refresh').click();await wait(()=>p.d.querySelector('#publication [role=switch]')!==toggle&&p.d.querySelector('#publication [role=switch]')?.getAttribute('aria-checked')==='true');toggle=p.d.querySelector('#publication [role=switch]');toggle.click();await wait(()=>!toggle.hasAttribute('aria-busy'));assert.equal(fixture.db.prepare('SELECT enabled FROM r3_menu_publication ORDER BY revision DESC').get().enabled,0);
});
