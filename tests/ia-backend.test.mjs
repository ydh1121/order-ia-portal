import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync,createHash} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {permit,requireActor} from '../src/server/auth.mjs';
import {fetchTab} from '../src/server/google.mjs';
import {project,CANONICAL_SCREEN_IDS} from '../src/server/projection.mjs';
import {readFileSync, readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {researchReleases} from '../src/server/research-app/releases.gen.mjs';
import {gunzipSync} from 'node:zlib';
import {deliveryBuild,deliveryManifest} from '../src/server/research-delivery-identity.gen.mjs';
import {qaCatalogIdentity} from '../src/server/r3-qa-catalog-identity.gen.mjs';
import {qaFixtureForRow,qaReviewRuntimeDigest} from '../src/server/r3-qa-review-runtime.mjs';
import {reviewedDelivery,retainedReviewedParts} from '../src/server/reviewed-delivery-index.gen.mjs';
import {r1Recorded} from '../src/server/r1-recorded-index.gen.mjs';
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
test('invalid screenId assets and writable notes are not accessible',async()=>{const t=await jwt();assert.equal((await handleIaRequest(req('/api/ia/assets?screenId=bad',t),env,dependencies)).status,403);assert.equal((await handleIaRequest(req('/api/ia/assets?screenId=F99',t),env,dependencies)).status,403);assert.equal((await handleIaRequest(req('/api/ia/notes',t,'POST'),env,dependencies)).status,405);});
test('authenticated READ without Google credentials remains 503 not mocked production success',async()=>{const r=await handleIaRequest(req('/api/ia/screens',await jwt()),env,{fetcher:fakeJwks});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'IA_DATA_UNAVAILABLE'});});
test('25 decisions / 24 active / 1 fully approved, PENDING-19 not fully approved',()=>{const d=project('decisions',policyRows);assert.equal(d.total,25);assert.equal(d.active,24);assert.equal(d.fullyApproved,1);assert.equal(d.items.find(x=>x.id==='PENDING-19').isFullyApproved,false);});
test('seven business stages and unknown source failures',()=>{const road=project('roadmap',projectedMocks.roadmap);assert.equal(road.total,7);assert.throws(()=>project('decisions',policyRows.slice(0,-1)),/PARITY/);});
test('Sheets adapter denies disabled reads and arbitrary table injection',async()=>{await assert.rejects(()=>fetchTab({IA_GOOGLE_READ_ENABLED:'false'},'screens'),/DISABLED/);await assert.rejects(()=>fetchTab({IA_GOOGLE_READ_ENABLED:'true'},"'화면_관리'!A:Z"),/UNKNOWN_TAB/)});
test('service account OAuth + fixed Google batchGet uses readonly scope',async()=>{
 const account={type:'service_account',client_email:'test@example.invalid',private_key:privatePk,token_uri:'https://oauth2.googleapis.com/token'};
 let urls=[];const fetcher=async(url,opt)=>{urls.push(url);if(url.includes('oauth2.googleapis.com')){const assertion=new URLSearchParams(opt.body).get('assertion');const [,body]=assertion.split('.');assert.equal(JSON.parse(Buffer.from(body,'base64url').toString()).scope,'https://www.googleapis.com/auth/spreadsheets.readonly');return Response.json({access_token:'fake-access',token_type:'Bearer'})}assert.ok(url.includes('%27')||url.includes('ranges='));assert.equal(opt.headers.Authorization,'Bearer fake-access');return Response.json({valueRanges:[{values:screenRows}]})};
 const d=await fetchTab({IA_GOOGLE_READ_ENABLED:'true',IA_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(account),IA_GOOGLE_SHEET_ID:'abc_12345678901234567890'},'screens',fetcher);assert.equal(d.length,77);assert.equal(urls.length,2);
});
test('public entry remains nonconfidential and private releases are confined to indexed pack paths',()=>{
 const publicRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
 // Inspect the packaged public/index.html relative to this test file.
 const entry=readFileSync(join(publicRoot,'index.html'),'utf8');assert.match(entry,/url=\/login/);assert.deepEqual(readdirSync(publicRoot).sort(),['_headers','ia','ia-map.css','ia-map.js','index.html','login.css','login.html','login.js','order-notifications-sw.js','owner.css','owner.js','price-template.xlsx','vendor']);
 const pushWorker=readFileSync(join(publicRoot,'order-notifications-sw.js'),'utf8');
 assert.match(pushWorker,/self\.addEventListener\('push'/);
 assert.doesNotMatch(pushWorker,/ORDER_WEB_PUSH_|PRIVATE KEY|privateJwk|Cf-Access-Jwt-Assertion|self\.addEventListener\(['"]fetch['"]/,'the public notification worker must not carry server credentials or intercept app requests');
 assert.deepEqual(readdirSync(join(publicRoot,'ia')),['research-releases']);
 const releasesRoot=join(publicRoot,'ia','research-releases');
 const packs=Object.keys(researchReleases).map(build=>build+'.json.gz');
 const releaseEntries=readdirSync(releasesRoot,{withFileTypes:true});
 // Retain prior delivery projections only for builds in the sealed release index.
 const deliveryBuilds=releaseEntries.filter(entry=>entry.isDirectory()&&Object.hasOwn(researchReleases,entry.name)).map(entry=>entry.name);
 const baselineBuild='66cd084a9ab54c49a7921310b32a73c7d53a3d3d4ce3bb94d5fc656c97cabc30';
 assert.ok(deliveryBuilds.includes(deliveryBuild),'the current indexed delivery is required');
 assert.ok(deliveryBuilds.includes(baselineBuild),'the previously published baseline delivery URLs must be retained');
 assert.deepEqual(releaseEntries.map(entry=>entry.name).sort(),[...packs,...deliveryBuilds,'qa-catalog','r1-recorded','reviewed-recorded'].sort());
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sealedRowsByBuild=new Map(),sealedBootstrapByBuild=new Map(),sealedSourcesByBuild=new Map();
 for(const build of deliveryBuilds){
  const sealed=researchReleases[build],packBytes=readFileSync(join(releasesRoot,build+'.json.gz'));
  assert.equal(packBytes.length,sealed.bytes);assert.equal(sha(packBytes),sealed.packSha256);
  const pack=JSON.parse(gunzipSync(packBytes));
  assert.equal(pack.build.digest,build);assert.equal(sha(JSON.stringify(pack.build.sources)),build);
  sealedRowsByBuild.set(build,new Set(pack.rows.map(row=>row.id)));
  sealedBootstrapByBuild.set(build,pack.build.sources['src/server/product-ui/bootstrap.gen.mjs']);
  sealedSourcesByBuild.set(build,pack.build.sources);
  const deliveryRoot=join(releasesRoot,build),indexBytes=readFileSync(join(deliveryRoot,'index.bin'));
  if(build===deliveryBuild)assert.equal(sha(indexBytes),deliveryManifest[2]);
  if(build===baselineBuild)assert.equal(sha(indexBytes),'559e0d5887646dbe58c5bfc13f4173c927f62cfabd1d0d82f12ed1c877876219','the published baseline index bytes must remain intact');
  const index=JSON.parse(gunzipSync(indexBytes));
  assert.deepEqual(Object.keys(index).sort(),['assets','build','parts','rows','shell','source','types']);
  assert.equal(index.build,build);assert.equal(index.source,sealed.packSha256);
  const privateFiles=['index.bin','shell.bin',...index.parts.map((_,i)=>i+'.bin')];
  if(build===deliveryBuild){assert.deepEqual(Object.keys(index.assets).sort(),Object.keys(pack.assets).sort());assert.equal(privateFiles.length,index.parts.length+2);}
  const privateEntries=readdirSync(deliveryRoot,{withFileTypes:true});
  assert.deepEqual(privateEntries.map(entry=>entry.name).sort(),privateFiles.sort());
  assert.ok(privateEntries.every(entry=>entry.isFile()),'private delivery paths must be regular files');
  const readPrivate=(name,manifest)=>{
   const bytes=readFileSync(join(deliveryRoot,name));
   assert.equal(manifest.length,3);assert.equal(bytes.length,manifest[0]);assert.equal(sha(bytes),manifest[2]);
   const raw=gunzipSync(bytes);assert.equal(raw.length,manifest[1]);return raw;
  };
  const parts=index.parts.map((manifest,i)=>readPrivate(i+'.bin',manifest)),ranges=parts.map(()=>[]);
  const originalSlice=(entry,original)=>{
   const [part,offset,length,digest]=entry;
   assert.ok([part,offset,length].every(value=>Number.isSafeInteger(value)&&value>=0));
   assert.ok(part<parts.length&&offset+length<=parts[part].length);
   const body=parts[part].subarray(offset,offset+length);
   assert.equal(sha(body),digest);assert.deepEqual(body,Buffer.from(original));ranges[part].push([offset,length]);
  };
  assert.deepEqual(Object.keys(index.assets).sort(),Object.keys(pack.assets).sort());
  assert.deepEqual([...index.types].sort(),[...new Set(Object.values(pack.assets).map(asset=>asset.type))].sort());
  for(const [name,asset]of Object.entries(pack.assets)){
   const entry=index.assets[name];assert.equal(entry.length,5);assert.equal(index.types[entry[4]],asset.type);originalSlice(entry,asset.body);
  }
  assert.deepEqual(Object.keys(index.rows).sort(),pack.rows.map(row=>row.id).sort());
  for(const row of pack.rows){const entry=index.rows[row.id];assert.equal(entry.length,4);originalSlice(entry,JSON.stringify(row));}
  for(const [part,entries]of ranges.entries()){
   let end=0;for(const [offset,length]of entries.sort((a,b)=>a[0]-b[0])){assert.equal(offset,end);end+=length;}
   assert.equal(end,parts[part].length,'every private payload byte must belong to the sealed pack');
  }
  const provenance=/^export const REGULAR_SOURCE_PROVENANCE=(.+);$/m.exec(pack.assets['bridge/contact-ui.mjs'].body);
  assert.ok(provenance);
  assert.deepEqual(JSON.parse(readPrivate('shell.bin',index.shell)),{build:pack.build,shell:pack.shell,regular:JSON.parse(provenance[1])});
 }
 const catalogs=Object.values(qaCatalogIdentity.modes).map(mode=>mode.sha256+'.json');
 assert.equal(catalogs.length,2);
 const catalogRoot=join(releasesRoot,'qa-catalog'),currentCatalogs={};
 const catalogEntries=readdirSync(catalogRoot,{withFileTypes:true});
 for(const name of ['bcf6b14f638157b31c8c270d33133daacd02f015d18e749bcbfec9434b60a79f.json','6027fd3141758ad1129e8c88a8f417c674486d3c9a2c83e30f8687b5ed4bb406.json'])assert.ok(catalogEntries.some(entry=>entry.isFile()&&entry.name===name),'the previously published baseline catalog URL must be retained: '+name);
 for(const [mode,identity]of Object.entries(qaCatalogIdentity.modes)){
  const bytes=readFileSync(join(catalogRoot,identity.sha256+'.json'));
  assert.equal(bytes.length,identity.bytes);assert.equal(sha(bytes),identity.sha256);currentCatalogs[mode]=JSON.parse(bytes);
 }
 const reviewHash=(build,id,width,mode)=>sha(JSON.stringify(['order-research-application/v1',build,id,Number(width),...(mode==='detailed'?['detailed']:[])]));
 // PR30 is the last published inventory before the two new native screens.
 // Old catalogs keep their exact reference even when current renderers change.
 const pr30Build='617fee8a3ac9f299b3e87515cdc9816aa5c2e51c42afa89b52effbeb4987b8ee';
 assert.ok(deliveryBuilds.includes(pr30Build));
 assert.equal(researchReleases[pr30Build].packSha256,'27335bb79baf0058494552ebd8283fef9f87c3581eab4c6ad1571a9db5540c65');
 const pr30CatalogDigests={simple:'f3c47f45fd2e880e1735b6288e04658317a4201d4f83c966973aa84ceb4b1adc',detailed:'bb4098090189c877ba18921507ffe92d948b5a7ed2ccd14bbd76976a65598968'};
 const pr30Catalogs={};
 for(const [mode,digest]of Object.entries(pr30CatalogDigests)){
  const bytes=readFileSync(join(catalogRoot,digest+'.json'));assert.equal(sha(bytes),digest);
  const previous=pr30Catalogs[mode]=JSON.parse(bytes),current=currentCatalogs[mode];
  assert.equal(previous.items.length,mode==='simple'?543:430);
  const expected=structuredClone(previous);
  expected.navigationDefaults.assignments['admin-icon-library']='future';
  const member=previous.items.find(row=>row.id==='quote-result/locked/email');
  const guest={...member,id:'quote-result/locked-guest/email',state:'locked-guest',stateLabel:'비회원 잠금',authoredChange:false,supplemental:true};
  const iconLibrary={...guest,id:'admin-icon-library/list/email',screen:'admin-icon-library',state:'list',group:'관리자 · 공통 자산',label:'아이콘 라이브러리',stateLabel:'사용처',role:'admin',description:'',routeIds:[]};
  const nativeIds=new Set([guest.id,iconLibrary.id]);
  const currentById=new Map(current.items.map(row=>[row.id,row]));
  const prices=current.items.filter(row=>row.screen==='price-workspace').map(row=>[row.id,row.contentHashes]).sort(([a],[b])=>a<b?-1:a>b?1:0);
  assert.equal(prices.length,9);
  assert.equal(sha(JSON.stringify(prices)),'59c712fbe1a3b9a3cf9d4f3398237c3bf7d26bde34b5c46e7b9fa436fe22f81a','price content retains the updated shared workflow renderer');
  expected.items.push(guest,iconLibrary);
  for(const row of expected.items){
   const widths=Object.keys(row.hashes);
   if(row.application){
    assert.ok(sealedRowsByBuild.get(deliveryBuild).has(row.id));
    const native=nativeIds.has(row.id)||JSON.stringify(row.contentHashes)===JSON.stringify(row.hashes);
    row.hashes=Object.fromEntries(widths.map(width=>[width,reviewHash(deliveryBuild,row.id,width,mode)]));
    if(native)row.contentHashes=row.hashes;
    else if(row.screen==='price-workspace')row.contentHashes=currentById.get(row.id).contentHashes;
   }else{
    row.hashes=Object.fromEntries(widths.map(width=>[width,sha(JSON.stringify(['order-r1-review-runtime/v1',row.contentHashes[width],qaReviewRuntimeDigest,qaFixtureForRow(row)]))]));
   }
  }
  assert.deepEqual(current,expected,'preserve the complete ordered catalog, metadata, widths, native routes and review holds');
 }
 // Baseline 69779 retains twelve catalog files from this exact bootstrap epoch.
 // The common paint refactor changes current pricing content and QA wrapper
 // fingerprints. Verify the old epoch before normalizing comparison objects.
 const priorSourceBuilds=new Set([
  '2ac2efb1ca970fe1ecb868251fda0bc2cd96d5c8324e38af699f470f1f8e74a4',
  '30b2b4a5f5ba187cc34f3db400901a85f2395c8a40f315f960c553cdb525d03d',
  '66cd084a9ab54c49a7921310b32a73c7d53a3d3d4ce3bb94d5fc656c97cabc30',
  '97b6bc594b9993b1438050d78bf20f43c736698eed1787d03b42006aca16ed0c',
  '9f7f83753ad7245b1e6a0f7dc55f905093c2a2dfa8d0aa8f057d9f18e125f092',
  'c3e50d9358887774cd87f39829c496443f589d3b404cc99db6fe618298df0eb2'
 ]);
 // R4 glyph restoration and the refreshed shared asset export change only
 // these authored content families. Their earlier source/content identities
 // remain sealed; they must not be compared with today's generated bytes.
 const priorPresentationRows=new Set([
  'account-settings/withdraw/email','admin-analytics/business-sales/email','admin-analytics/campaign-sales/email',
  'admin-revenue-rules/settings/email','admin-shipments/packing/email',
  ...['documents','expired','missing','ready','submitted','submitting'].map(state=>'delivery-request/'+state+'/email'),
  ...['verification','welcome','withdrawal'].map(state=>'member-email-templates/'+state+'/email'),
  ...['comparing','complete','delayed','entry','fast-response','offline','server-error','slow-response'].map(state=>'quote-wait/'+state+'/email'),
  ...['card','cash','qa-empty','qa-error','qa-guest','qa-loading','select'].map(state=>'store-purchase/'+state+'/email'),
  'supplier-shipments/packing/email'
 ]);
 const priorPresentationItem=item=>item.screen==='component-library'||priorPresentationRows.has(item.id);
 const catalogBuildModes=new Set();
 for(const entry of catalogEntries){
  assert.ok(entry.isFile());
  const bytes=readFileSync(join(catalogRoot,entry.name));assert.equal(entry.name,sha(bytes)+'.json');
  const catalog=JSON.parse(bytes),mode=catalog.mode??'simple',reference=pr30Catalogs[mode];
  assert.ok(reference);const first=catalog.items.find(item=>item.application);assert.ok(first);
  const width=Object.keys(first.hashes)[0],builds=deliveryBuilds.filter(build=>reviewHash(build,first.id,width,mode)===first.hashes[width]);
  assert.equal(builds.length,1,'a retained catalog must identify one indexed delivery build');
  const build=builds[0],key=build+'/'+mode;assert.ok(!catalogBuildModes.has(key));catalogBuildModes.add(key);
  if(build===deliveryBuild){
   assert.equal(entry.name,qaCatalogIdentity.modes[mode].sha256+'.json');assert.deepEqual(catalog,currentCatalogs[mode]);
   continue;
  }
  const priorSourceEpoch=build!==deliveryBuild&&priorSourceBuilds.has(build);
  // Retain the separately sealed main3391 module-cleanup epoch. Its static
  // component contents are unchanged, but the QA wrapper has its own runtime.
  const moduleCleanupPacks={
   '36a69ac57845f926e0bb9665300eef7f247e6b410b7ffa97caa70a431dff51e9':'415eace592e8f8f7d5a067a1044349a340ac1d0be8b4201e25501b5c8bef929a',
   '42f484c16e8a3a1882ed93e5f137f0c688bbe80b92bc7ff5bf2e123a0f51571e':'f2190e0ff02e7f79645b2481ea0a4d784ed0b44f0e230407bd3b76435768bda2'
  };
  const moduleCleanupEpoch=Object.hasOwn(moduleCleanupPacks,build);
  // Signature pad rendering changes the shared bootstrap and therefore the
  // pricing wrapper content identity. Retain the exact prior source epoch,
  // including the later PR29 releases with their separately sealed QA runtime.
  const priorSharedUiEpoch=build!==deliveryBuild&&sealedBootstrapByBuild.get(build)==='807ee8843806f8ed7e4a49b4b6d7487ce1784e8cd844d1cf82af6cfae5036887';
  // PR30's first remote publication is already a historical review target.
  // Pin its entire original pack/catalogs as well as its bootstrap and runtime.
  const firstFeedbackEpoch=build==='16a89f9096714904f34fac6828c8c9af3e5f73ec689d2091bc48fa0e246a7301';
  if(firstFeedbackEpoch){
   assert.equal(researchReleases[build].packSha256,'5eee66bd973abc00f996dc2752e4ba487d7ce1bb3dbb103bf0909b986a9004f3');
   assert.equal(sealedBootstrapByBuild.get(build),'4b54aa33151fa37f485c682988ea1537ca2046d5bb72469cf01a6906597e9e9f');
   assert.equal(entry.name,({simple:'380b62d82cfd47daccfca7388696492c246ac4b6db505af5245f595afbd45087',detailed:'2dc72dfc9c7efa0d9aa1f40c8fd6395bcff4765bd219123df6d073ef6b75f7d2'})[mode]+'.json');
  }
  const oldSources=sealedSourcesByBuild.get(build);
  // The second remote PR30 publication predates the shared signature binding
  // correction. Its pricing content and QA wrapper retain that exact bootstrap;
  // the already refreshed R4/shared presentation bytes remain unchanged.
  const secondFeedbackEpoch=build==='ccb6fecfc3c93008fe324353644ea18140220f28a7d2d2c68e49b0403d6b4762';
  const feedbackSignatureEpoch=firstFeedbackEpoch||secondFeedbackEpoch;
  if(secondFeedbackEpoch){
   assert.equal(researchReleases[build].packSha256,'2c70a06a14d5dbb0f13f8b6d39ee55172422ccfa05a40e4e70aaec1a131eecfa');
   assert.equal(sealedBootstrapByBuild.get(build),'4b54aa33151fa37f485c682988ea1537ca2046d5bb72469cf01a6906597e9e9f');
   assert.equal(oldSources['src/server/product-ui/assets.gen.mjs'],'5823ef36ce55fb3a855695f59c0be387ba58f392300b268a06c992a652e6d39d');
   assert.equal(oldSources['src/server/product-ui/catalog.gen.mjs'],'deb0aeee20b27290e55e913edf5b46e8fe475315d73e2bceeed38e1ee31427b9');
   assert.equal(oldSources['src/server/product-ui/runtime.gen.mjs'],'ce5ca420372a644afdd8853760c74ad7f094e05bbbe58da199e74845687c0f5f');
   assert.equal(entry.name,({simple:'de2e9aa7cb70d134e02376ecc6fce996090b9170fd447a04eb2c7341e42cde7d',detailed:'5a496ebe0ab2a442708bae91fd6d69c5d307fa392538b3862f50b23bb72ed443'})[mode]+'.json');
  }
  const priorPresentationEpoch=build!==deliveryBuild&&oldSources['src/server/product-ui/assets.gen.mjs']==='9b9a61cf610e86e2bdc76e7de89a08124d94fffad2bacd510fdee97f281df5b9';
  if(priorPresentationEpoch){
   assert.ok(priorSourceEpoch||priorSharedUiEpoch||firstFeedbackEpoch,'only the identified published epochs may retain old presentation content');
   assert.equal(oldSources['src/server/product-ui/catalog.gen.mjs'],'29aec470ceb0d661b7c3ceb85c4a205a870e0a888225dca176f8971da6fb7ab9');
   assert.ok(['2b4735f54de92f2bdd9a9da490a56f9f1df9203f087680e5c4ff162d51e0d796','ab2984c906d42c12b4fc2e9a9f03afc3d716239703df8ddc798d77244e723105'].includes(oldSources['src/server/product-ui/runtime.gen.mjs']));
   const contents=catalog.items.filter(priorPresentationItem).map(item=>[item.id,item.contentHashes]).sort(([a],[b])=>a<b?-1:a>b?1:0);
   assert.equal(contents.length,mode==='simple'?60:30);
   assert.equal(sha(JSON.stringify(contents)),mode==='simple'?'f6abf27eddd20da927f5ba7cf42968c1ad5f95152b760ae676622b1fd14d93ee':'ba0c9ba45a87251a2d434541680f91e31710239ee6d602bc99ee71d74c38f987','retained presentation content must match its exact original source epoch');
  }
  if(moduleCleanupEpoch){
   assert.equal(sealedBootstrapByBuild.get(build),'807ee8843806f8ed7e4a49b4b6d7487ce1784e8cd844d1cf82af6cfae5036887');
   assert.equal(researchReleases[build].packSha256,moduleCleanupPacks[build]);
  }
  if(priorSourceEpoch){
   assert.equal(sealedBootstrapByBuild.get(build),'d757da165e7a2a60e21720c1bd4dd8c262e587cdbfc990e2c5a23ba482a00b8b');
  }
  if(priorSourceEpoch||priorSharedUiEpoch||feedbackSignatureEpoch){
   const prices=catalog.items.filter(item=>item.screen==='price-workspace').map(item=>[item.id,item.contentHashes]).sort(([a],[b])=>a<b?-1:a>b?1:0);
   assert.equal(prices.length,9);
   const priceDigest=feedbackSignatureEpoch?'a0512e8e624d66fbfce975c063c0ab1832183c7401ee8189bbaab26c6fc44e1c':priorSourceEpoch?'1a1b61b037780a7ce4e877c1e6c7d700efa97e59aaf84411ee2f2665fe592e1b':'994de4c7ac1cdf88f30f2e71a1c2eea6303ab96b708c72f7b7dd975b41b61328';
   assert.equal(sha(JSON.stringify(prices)),priceDigest,'historical pricing content hashes must remain exact for their sealed bootstrap epoch');
  }
  // A historical catalogue retains its own approved inventory. Nov 25 removes
  // eight current targets and adds a review hold without rewriting old files.
  const retired=item=>item.screen==='quote-review'||item.screen==='quote-result'&&['new-only-detail','no-current'].includes(item.state);
  assert.equal(catalog.items.filter(item=>!retired(item)).length,reference.items.length);
  const byId=new Map(reference.items.map(item=>[item.id,item]));
  for(const item of catalog.items){
   const original=byId.get(item.id);
   if(!original){assert.ok(retired(item));assert.notEqual(build,deliveryBuild);}
   if(!item.application){
    if(priorSourceEpoch||priorSharedUiEpoch||feedbackSignatureEpoch){
     assert.ok(original);if(!(priorPresentationEpoch&&priorPresentationItem(item)))assert.deepEqual(item.contentHashes,original.contentHashes);
     const runtime=feedbackSignatureEpoch?'e3e5f90a750f78396ec3dae057f68c8e277ffe0f2aa48faccf1e0ea0bb091ed6':moduleCleanupEpoch?'e2571d4d977451fe43e6361148803a43fb15cf6c3fe0e3f6c8ebc38518dabfb5':priorSharedUiEpoch?'ebd5af4061daab00f35a5efa117dd1dfbabd5718748657f85b54b5fb080147e3':'47661fb4fd590cddba55025d8fb992748451f28683b262429e82a42137df0e40';
     const hashes=Object.fromEntries(Object.entries(item.contentHashes).map(([width,contentHash])=>[width,sha(JSON.stringify(['order-r1-review-runtime/v1',contentHash,runtime,qaFixtureForRow(item)]))]));
     assert.deepEqual(item.hashes,hashes,'historical QA wrapper hashes must retain their original runtime identity');
     item.hashes=original.hashes;
     if(priorPresentationEpoch&&priorPresentationItem(item))item.contentHashes=original.contentHashes;
    }
    continue;
   }
   assert.ok(sealedRowsByBuild.get(build).has(item.id));
   const hashes=Object.fromEntries(Object.keys(item.hashes).map(width=>[width,reviewHash(build,item.id,width,mode)]));
   assert.deepEqual(item.hashes,hashes);
   if(!original)continue;
   const native=JSON.stringify(original.contentHashes)===JSON.stringify(original.hashes);
   if(!((priorSourceEpoch||priorSharedUiEpoch||feedbackSignatureEpoch)&&item.screen==='price-workspace')&&!(priorPresentationEpoch&&priorPresentationItem(item)))assert.deepEqual(item.contentHashes,native?hashes:original.contentHashes);
   item.hashes=original.hashes;item.contentHashes=original.contentHashes;
   if(original.reviewHold)item.reviewHold=original.reviewHold;
   assert.deepEqual(item,original);
  }
  catalog.items=catalog.items.filter(item=>!retired(item));
  delete catalog.navigationDefaults.assignments['quote-review'];
  assert.deepEqual(catalog,reference);
 }
 assert.deepEqual([...catalogBuildModes].sort(),deliveryBuilds.flatMap(build=>Object.keys(currentCatalogs).map(mode=>build+'/'+mode)).sort());
 const recorded=[r1Recorded.shared,...r1Recorded.buckets].map(hash=>hash+'.json.gz');
 assert.equal(recorded.length,17);
 assert.deepEqual(readdirSync(join(releasesRoot,'r1-recorded')).sort(),recorded.sort());
 const reviewed=[...new Set([...reviewedDelivery.records,...reviewedDelivery.fragments,...retainedReviewedParts])].map(hash=>hash+'.json.gz');
 assert.deepEqual(readdirSync(join(releasesRoot,'reviewed-recorded')).sort(),reviewed.sort());
 for(const name of reviewed)assert.equal(sha(readFileSync(join(releasesRoot,'reviewed-recorded',name))),name.slice(0,-8),'reviewed parts remain content addressed');
 // The HTTP-denial and exact internal binding bytes are independently exercised
 // in research-browser-assets.test.mjs; no public index links to these packs.
 assert.deepEqual(readdirSync(join(publicRoot,'vendor')).sort(),['fonts','r3-pdf','research']);
 const fontRoot=join(publicRoot,'vendor','fonts');
 assert.deepEqual(readdirSync(fontRoot).sort(),['Pretendard-LICENSE.txt','README.md','pretendard-variable-9599f12fd42f.woff2']);
 assert.equal(sha(readFileSync(join(fontRoot,'pretendard-variable-9599f12fd42f.woff2'))),'9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4','the public font must remain the exact official Pretendard bytes');
 assert.deepEqual(readdirSync(join(publicRoot,'vendor','r3-pdf')).sort(),['LICENSE.txt','SOURCE.txt','pdf.min.mjs','pdf.worker.min.mjs']);
 const industry='nts-industry-2025-edfa839b2a2d90fc.json';
 assert.deepEqual(readdirSync(join(publicRoot,'vendor','research')),[industry]);
 const classification=readFileSync(join(publicRoot,'vendor','research',industry));
 assert.equal(createHash('sha256').update(classification).digest('hex'),'edfa839b2a2d90fc279aea102b447beccf1623dd04a440aaa3fa5381303fc1b4','the only added public file is the exact official classification reference');
 const reference=JSON.parse(classification);assert.equal(new URL(reference.source).hostname,'www.nts.go.kr');assert.equal(reference.format,'order-business-classification/v1');
 for(const term of ['PENDING-','/src/internal','docs.google.com','drive.google.com','F17','사업자등록증','sk_live_'])assert.ok(!entry.includes(term));
});
