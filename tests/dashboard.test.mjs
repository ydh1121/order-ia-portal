import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync,randomBytes} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {issueSession} from '../src/server/owner-session.mjs';
import {fetchDashboardTabs,TABS} from '../src/server/google.mjs';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const host='https://order-ia-portal.pages.dev';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let env,cookie,fixtures;
const request=(path,method='GET',cookieValue=cookie)=>new Request(host+path,{method,headers:cookieValue?{Cookie:cookieValue}:{}});
const names=['screens','decisions','roadmap','guide','notes'];
const screens=[['화면 ID','화면명']];
for(const [prefix,count] of [['F',18],['U',10],['P',9],['C',5],['A',34]])for(let i=0;i<count;i++)screens.push([`${prefix}${String(i).padStart(2,'0')}`,`${prefix} 화면 이름 ${i}`,'매장 고객','/path','R1','기획 진행','독립 수락 없음','기획 내용 상세','https://private.example/file',null,null,'QA 대기','USER PRIVATE NOTE']);
const decisions=[['검토 ID','쉬운 제목','무엇을 결정해야 하나요?','현재 상태']];for(let i=1;i<=28;i++)decisions.push(['PENDING-'+String(i).padStart(2,'0'),`검토 ${i}`,'무엇을 결정해야 하는가?',i===1?'승인 완료':i===19?'핵심 공개요건 승인·운영세부 검토':i===26?'엔진·UI 통합 완료, 웹 검수 및 정책 검토 중':'검토 필요','F17','PRIVATE CHOICE']);
const roadmap=[['단계','구분']];for(let i=0;i<7;i++)roadmap.push([`${i}단계`,'기획',`로드맵 ${i}`,'설명','진행','R'+i,'정책']);
const guide=[['순서','어디서','사용법'],['1','시트','메모는 시트에 기록']];
const notes=[['번호','화면번호','날짜','사용자 의견'],['FB-1','F17','2026-10-17','사용자 의견 유지','INTERNAL_FILE_LINK','검토 대기']];
before(async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const key=privateKey.export({type:'pkcs8',format:'pem'});
 env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:`pbkdf2-sha256$310000$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),IA_GOOGLE_READ_ENABLED:'true',IA_GOOGLE_SHEET_ID:'1-HKnaTZuH8k6asKtJg1IKHy3mJOIO6CXSw1zFfws5Sg',IA_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'ia-readonly@example-project.iam.gserviceaccount.com',private_key:key,token_uri:'https://oauth2.googleapis.com/token'})};
 cookie=(await issueSession(env)).cookie.split(';')[0];fixtures={screens,decisions,roadmap,guide,notes};
});
test('anonymous owner dashboard API deny before provider call',async()=>{let calls=0;const res=await handleIaRequest(request('/api/ia/dashboard','GET',null),env,{fetchDashboardTabs:()=>{calls++;throw Error('SHOULD_NOT_RUN')}});assert.equal(res.status,403);assert.equal(calls,0)});
test('invalid cookie dashboard denied before Sheets fetch',async()=>{let calls=0;const res=await handleIaRequest(request('/api/ia/dashboard','GET','__Host-ia_session=forged'),env,{fetchDashboardTabs:()=>{calls++}});assert.equal(res.status,403);assert.equal(calls,0)});
test('write attempts still blocked at dashboard and notes',async()=>{for(const path of ['/api/ia/dashboard','/api/ia/notes'])assert.equal((await handleIaRequest(request(path,'POST'),env)).status,405)});
test('Google disabled shows safe 503 rather than bundled demo records',async()=>{const res=await handleIaRequest(request('/api/ia/dashboard'),{...env,IA_GOOGLE_READ_ENABLED:'false'});assert.equal(res.status,503);const data=await res.json();assert.equal(data.error,'IA_DATA_UNAVAILABLE');assert.ok(!JSON.stringify(data).includes('F17'))});
test('one server batch fetch requests five fixed tab ranges, single OAuth token',async()=>{
 const calls=[];const fetcher=async (url,opts)=>{
  calls.push({url:String(url),method:opts.method});
  if(String(url).includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'synthetic-test-token',token_type:'Bearer'}),{status:200});
  assert.equal(opts.headers.Authorization,'Bearer synthetic-test-token');
  const params=new URL(String(url)).searchParams;assert.deepEqual(params.getAll('ranges'),names.map(n=>TABS[n]));
  return new Response(JSON.stringify({valueRanges:names.map(n=>({values:fixtures[n]}))}),{status:200});
 };
 const data=await fetchDashboardTabs(env,fetcher);assert.equal(calls.length,2);assert.deepEqual(Object.keys(data),names);assert.equal(data.screens.length,77);assert.equal(data.decisions.length,29);assert.equal(data.roadmap.length,8);
});
test('authenticated owner dashboard projection 76/28/7 with no raw M-column user memo in screen list',async()=>{
 const res=await handleIaRequest(request('/api/ia/dashboard'),env,{fetchDashboardTabs:()=>fixtures});assert.equal(res.status,200);const data=await res.json();assert.equal(data.screenCount,76);assert.equal(data.decisionCount,28);assert.equal(data.roadmapCount,7);assert.equal(data.decisions.fullyApproved,1);assert.equal(data.decisions.active,27);assert.equal(data.decisions.open,25);assert.equal(data.decisions.in_review,2);assert.equal(data.decisions.approved,1);assert.equal(data.screens.items.length,76);assert.equal(data.roadmap.items.length,7);assert.equal(data.notes.items[0].text,'사용자 의견 유지');assert.equal(data.screens.items[0].details,'기획 내용 상세');assert.ok(!JSON.stringify(data.screens).includes('USER PRIVATE NOTE'));assert.ok(!JSON.stringify(data.screens).includes('https://private.example/file'));assert.match(res.headers.get('Cache-Control'),/no-store/);
});
test('incomplete wrong decision status fails closed to 503 without any partial row leak',async()=>{
 const wrong=structuredClone(fixtures);wrong.decisions[19][3]='알 수 없는 상태';
 const res=await handleIaRequest(request('/api/ia/dashboard'),env,{fetchDashboardTabs:()=>wrong});assert.equal(res.status,503);const data=await res.json();assert.equal(data.error,'IA_DATA_UNAVAILABLE');assert.ok(!JSON.stringify(data).includes('검토 19'));
});
test('Google token rejection is distinct nonsecret owner-only diagnostics',async()=>{
 const response=await handleIaRequest(request('/api/ia/dashboard'),env,{fetchDashboardTabs:async()=>{throw Error('GOOGLE_TOKEN_DENIED')}});assert.equal(response.status,503);assert.equal((await response.json()).reason,'GOOGLE_TOKEN_DENIED');
});
test('private /ia path redirect and owner private shell never contains source data',async()=>{
 const anonymous=await iaPage({request:request('/ia/','GET',null),env});assert.equal(anonymous.status,302);
 const res=await iaPage({request:request('/ia/'),env});assert.equal(res.status,200);const body=await res.text();assert.match(body,/IA 관리 대시보드/);for(const x of ['PENDING-01','F17','사업자등록증','GOOGLE_SERVICE_ACCOUNT_JSON'])assert.ok(!body.includes(x));
});
test('public JS contains UI behavior but no confidential static IA rows, price or linked Drive keys',()=>{
 const pub=resolve(root,'public');const js=readFileSync(resolve(pub,'owner.js'),'utf8');const css=readFileSync(resolve(pub,'owner.css'),'utf8');assert.ok(js.includes('/api/ia/dashboard'));for(const x of ['PENDING-01','F17','250×6600','docs.google.com','drive.google.com','IA_GOOGLE_SERVICE_ACCOUNT_JSON','/src/internal'])assert.ok(!js.includes(x) && !css.includes(x));
});
test('existing individual endpoints remain available, but require OWNER session',async()=>{
 const r=await handleIaRequest(request('/api/ia/screens'),env,{fetchTab:async()=>fixtures.screens});assert.equal(r.status,200);assert.equal((await r.json()).total,76);
 const forbidden=await handleIaRequest(request('/api/ia/notes','GET',null),env);assert.equal(forbidden.status,403);
});
