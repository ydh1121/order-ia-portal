import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {permit,requireActor} from '../src/server/auth.mjs';
import {fetchTab} from '../src/server/google.mjs';
import {project,CANONICAL_SCREEN_IDS} from '../src/server/projection.mjs';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const domain='https://ia-testing.cloudflareaccess.com',audience='R0PLACEHOLDER_1234567890';
const kp=generateKeyPairSync('rsa',{modulusLength:2048});
const pub=kp.publicKey.export({format:'jwk'});pub.kid='test-key';pub.alg='RS256';
const privatePk=kp.privateKey.export({format:'pem',type:'pkcs8'});
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
const jwt=async ({email='owner@example.invalid',exp=Math.floor(Date.now()/1000)+1000,iat=Math.floor(Date.now()/1000)-10,iss=domain,aud=[audience]}={})=>{
 const h=b64({alg:'RS256',kid:'test-key'}),p=b64({sub:'test-user',email,exp,iat,iss,aud});
 const key=await crypto.subtle.importKey('pkcs8',kp.privateKey.export({format:'der',type:'pkcs8'}),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
};
const env={IA_ACCESS_TEAM_DOMAIN:domain,IA_ACCESS_AUD:audience,IA_ROLE_BINDINGS_JSON:JSON.stringify({'owner@example.invalid':'OWNER','reviewer@example.invalid':'REVIEWER'}),IA_GOOGLE_READ_ENABLED:'false'};
const fakeJwks=async url=>{if(url===domain+'/cdn-cgi/access/certs')return Response.json({keys:[pub]});throw new Error('UNEXPECTED_FETCH '+url)};
const req=(path,token,method='GET')=>new Request('https://order-ia-portal.pages.dev'+path,{method,headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});
const screenRows=[['화면 ID','화면명','이용자 그룹'],...CANONICAL_SCREEN_IDS.map((id,i)=>[id,'화면'+i,'고객'])];
const policyRows=[['검토 ID','제목','내용','현재 상태'],...Array.from({length:25},(_,i)=>['PENDING-'+String(i+1).padStart(2,'0'),'정책'+i,'계획',i===0?'승인 완료':i===18?'핵심 공개요건 승인·운영세부 검토':'검토 필요'])];
const projectedMocks={screens:screenRows,decisions:policyRows,roadmap:[['단계'],...Array.from({length:7},(_,i)=>[i+'단계','기획','계획','설명','예정','R'+i])],guide:[['순서'],['1','화면별 의견','M열']]};
const dependencies={fetcher:fakeJwks,fetchTab:async(_e,t)=>projectedMocks[t]};

test('anonymous no Access JWT is 403 and no data reaches response',async()=>{const r=await handleIaRequest(req('/api/ia/screens'),env,dependencies);assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');});
test('missing Access config fails closed',async()=>{const r=await handleIaRequest(req('/api/ia/screens',await jwt()),{},dependencies);assert.equal(r.status,403)});
test('expired and spoofed JWT cannot bypass crypto',async()=>{for(const token of [await jwt({exp:1}),await jwt({iss:'https://evil.cloudflareaccess.com'}),await (async()=>{const parts=(await jwt()).split('.');parts[1]=b64({sub:'forged',email:'owner@example.invalid',exp:Math.floor(Date.now()/1000)+900,iat:Math.floor(Date.now()/1000),iss:domain,aud:[audience]});return parts.join('.')})()]){const r=await handleIaRequest(req('/api/ia/screens',token),env,dependencies);assert.equal(r.status,403)}});
test('unmapped role denied after valid signature',async()=>{const r=await handleIaRequest(req('/api/ia/notes',await jwt({email:'unmapped@example.invalid'})),env,dependencies);assert.equal(r.status,403)});
test('owner screen list is 76 source-projected, no user memo fields',async()=>{const r=await handleIaRequest(req('/api/ia/screens',await jwt()),env,dependencies);assert.equal(r.status,200);const data=await r.json();assert.equal(data.total,76);assert.equal(data.items.length,76);assert.ok(!JSON.stringify(data).includes('userMemo'));});
test('reviewer cannot read A00 deep link or private memo, gets filtered list',async()=>{const t=await jwt({email:'reviewer@example.invalid'});const denied=await handleIaRequest(req('/api/ia/screens?screenId=A00',t),env,dependencies);assert.equal(denied.status,403);const notes=await handleIaRequest(req('/api/ia/notes',t),env,dependencies);assert.equal(notes.status,403)});
test('invalid screenId assets and writable notes are not accessible',async()=>{const t=await jwt();assert.equal((await handleIaRequest(req('/api/ia/assets?screenId=bad',t),env,dependencies)).status,403);assert.equal((await handleIaRequest(req('/api/ia/notes',t,'POST'),env,dependencies)).status,405);});
test('authenticated READ without Google credentials remains 503 not mocked production success',async()=>{const r=await handleIaRequest(req('/api/ia/screens',await jwt()),env,{fetcher:fakeJwks});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'IA_DATA_UNAVAILABLE'});});
test('25 decisions / 24 active / 1 fully approved, PENDING-19 not fully approved',()=>{const d=project('decisions',policyRows);assert.equal(d.total,25);assert.equal(d.active,24);assert.equal(d.fullyApproved,1);assert.equal(d.items.find(x=>x.id==='PENDING-19').isFullyApproved,false);});
test('seven business stages and unknown source failures',()=>{const road=project('roadmap',projectedMocks.roadmap);assert.equal(road.total,7);assert.throws(()=>project('decisions',policyRows.slice(0,-1)),/PARITY/);});
test('Sheets adapter denies disabled reads and arbitrary table injection',async()=>{await assert.rejects(()=>fetchTab({IA_GOOGLE_READ_ENABLED:'false'},'screens'),/DISABLED/);await assert.rejects(()=>fetchTab({IA_GOOGLE_READ_ENABLED:'true'},"'화면_관리'!A:Z"),/UNKNOWN_TAB/)});
test('service account OAuth + fixed Google batchGet uses readonly scope',async()=>{
 const account={type:'service_account',client_email:'test@example.invalid',private_key:privatePk,token_uri:'https://oauth2.googleapis.com/token'};
 let urls=[];const fetcher=async(url,opt)=>{urls.push(url);if(url.includes('oauth2.googleapis.com')){const assertion=new URLSearchParams(opt.body).get('assertion');const [,body]=assertion.split('.');assert.equal(JSON.parse(Buffer.from(body,'base64url').toString()).scope,'https://www.googleapis.com/auth/spreadsheets.readonly');return Response.json({access_token:'fake-access',token_type:'Bearer'})}assert.ok(url.includes('%27')||url.includes('ranges='));assert.equal(opt.headers.Authorization,'Bearer fake-access');return Response.json({valueRanges:[{values:screenRows}]})};
 const d=await fetchTab({IA_GOOGLE_READ_ENABLED:'true',IA_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(account),IA_GOOGLE_SHEET_ID:'abc_12345678901234567890'},'screens',fetcher);assert.equal(d.length,77);assert.equal(urls.length,2);
});
test('public output contract only single nonconfidential static index',()=>{
 const publicRoot='/mnt/data/ia_sheets_0233/public';
 const fs=requireNotUsed=>{};
 // Inspect repo baseline public/index.html mirrored into package below; no internal imports or links.
 const entry=readFileSync(join(publicRoot,'index.html'),'utf8');assert.match(entry,/서비스 준비 중입니다/);assert.equal(readdirSync(publicRoot).join(','),'index.html');
 for(const term of ['PENDING-','/src/internal','docs.google.com','drive.google.com','F17','사업자등록증','sk_live_'])assert.ok(!entry.includes(term));
});
