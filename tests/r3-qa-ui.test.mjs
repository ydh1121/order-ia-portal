import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {serveR3Artifact,isR3ReviewTarget,renderR3Qa} from '../src/server/r3-qa-page.mjs';
import {frameCode,hostCode,runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';
const url='https://private.invalid/api/ia/r3-qa/artifact';
const read=async(q='')=>await(await serveR3Artifact(new Request(url+q))).json();
const row=(id,width=390,version='current')=>read('?'+new URLSearchParams({id,width:String(width),version}));
test('the QA menu covers the complete pinned state inventory without copying review decisions',async()=>{
  const list=await read(),original=list.items.filter(row=>!row.supplemental);
  // The 6 retired review states and 2 retired result states keep their pinned
  // archive identities, but have no current QA catalogue entries.
  assert.equal(original.length,490);assert.equal(new Set(original.map(r=>r.screen+'/'+r.state)).size,488);
  assert.equal(new Set(original.map(r=>r.screen)).size,96);
  assert.equal(original.some(row=>row.screen==='quote-review'||row.screen==='quote-result'&&['new-only-detail','no-current'].includes(row.state)),false);
  assert.ok(original.filter(row=>['q1','q2'].includes(row.screen)).every(row=>row.reviewHold==='hi-fi-simple-and-detailed'));
  const {getQaSupplemental}=await import('../src/server/r3-qa-assets.mjs');
  const pinnedSupplemental=(await getQaSupplemental()).rows.filter(row=>row.supplemental).map(row=>row.id);
  assert.deepEqual(list.items.filter(row=>row.supplemental).map(row=>row.id).sort(),
    [...pinnedSupplemental,'notifications/list/email'].sort());
  for(const entry of list.items){assert.equal('approved' in entry,false);assert.equal(typeof entry.hashes['390'],'string');}
});
test('stable target is bound to width, variant, release and generated artifact',async()=>{
  const id='login/empty/email'; const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:(await row(id)).hash};
  assert.equal(await isR3ReviewTarget(target,'MSG0585-R3'),true);
  assert.equal(await isR3ReviewTarget({...target,viewport:1440},'MSG0585-R3'),false);
  assert.equal(await isR3ReviewTarget(target,'legacy'),false);
  assert.notEqual(target.artifactHash,(await row(id,390,'previous')).hash);
});
test('current review exports identify one selected application route and use only its versioned same-origin assets',async()=>{
  const result=await row('login/empty/email',1440);
  assert.equal(createHash('sha256').update(result.editable).digest('hex'),result.exportHash);
  const metadata=JSON.parse(result.editable.match(/<script type="application\/json" id="frame-meta">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(metadata.route,{screen:'login',state:'empty',variant:'email'});assert.equal(metadata.viewport,1440);assert.equal(metadata.hash,result.hash);
  assert.equal(metadata.source.build,result.application.build);
  const config=JSON.parse(result.editable.match(/<script type="application\/json" id="order-app-config">([\s\S]*?)<\/script>/)[1]);
  assert.equal(config.build,result.application.build);assert.equal(config.inspect,false);
  const assets=[...result.editable.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(assets.length>=2);for(const asset of assets)assert.ok(asset.startsWith('/ia/research-assets/'+result.application.build+'/'),asset);
  assert.match(result.editable,/<script type="module"[^>]*>import \{mountResearchApplication\}/);
  assert.doesNotMatch(result.editable,/<iframe\b|example-only-pass|<form[^>]+ action=/i);
  assert.equal((await serveR3Artifact(new Request(url+'?id=https://example.org&width=390&version=current'))).status,404);
});
test('current result scenes redact locked values and identify visual comparison prices as the protected design fixture',async()=>{
  const hidden=await researchScene('quote-result','locked','email'),detail=await researchScene('quote-result','new-detail','email');
  assert.doesNotMatch(hidden.html,/12,540,000|11,940,000|600,000/);
  assert.match(hidden.html,/data-state="unverified"/);
  assert.match(detail.html,/data-quote-fixture="figma-20261118"/);
  assert.match(detail.html,/11,940,000/);
  for(const doc of [hidden,detail]){
    assert.match(doc.mount,/installReviewQuote/);
    assert.doesNotMatch(doc.html,/data-price=|compareData=|minorUnits|issuerDiagnostics/);
    assert.doesNotMatch(doc.mount,/r3-price\/quote|r3-role|X-IA-CSRF|localStorage|sessionStorage|\bfetch\s*\(/);
  }
  assert.match(hostCode,/r3-price\/quote/);assert.doesNotMatch(frameCode,/r3-price|r3-role|X-IA-CSRF/);
});
test('review source parses and separates the same-origin current application from opaque historical frames',()=>{
  for(const f of [frameCode,hostCode])new Script('('+f+')');
  for(const s of Object.values(runtimes)){new Script(s);assert.doesNotMatch(s,/example-only-pass|12540000|11940000|r3-qa\/records|__Host-ia_session/i);}
  const page=renderR3Qa('012345');assert.match(page,/sandbox="allow-scripts"/);assert.doesNotMatch(page,/13,140,000|<iframe[^>]*src="https?:/);
  assert.match(hostCode,/INVALID_RESEARCH_APPLICATION_URL/);assert.match(hostCode,/allow-scripts allow-same-origin allow-forms/);
  assert.match(hostCode.replaceAll("\\'","'"),/connect-src 'none'/,'the pinned document path retains the opaque replay policy');
});

test('current and comparison catalog documents omit fixture prices split across child tags',async()=>{
  const catalog=await read();
  for(const screen of ['admin-overview','admin-price-approval','admin-offers','partner-storefront','consumer-product']){
    const selected=catalog.items.filter(item=>item.screen===screen);
    assert.ok(selected.length,screen);
    for(const item of selected)for(const version of ['current','previous']){
      const result=await row(item.id,390,version);
      const rendered=result.application?(await researchScene(item.screen,item.state,item.variant)).html:result.editable;
      assert.ok(rendered.includes('order-single'),'price redaction must inspect the selected scene, not an empty bootstrap');
      assert.doesNotMatch(rendered,/(?:1,284,000|5,970|7,900)\s*(?:<[^>]+>\s*)*원/);
      assert.equal(createHash('sha256').update(result.editable).digest('hex'),result.exportHash);
    }
  }
});

test('published family runtimes and frame identities agree with the reviewed source', async () => {
  const {readFile} = await import('node:fs/promises');
  const {catalog,cssHash} = await import('../src/server/r3-ui/catalog.gen.mjs');
  const hash = value => createHash('sha256').update(value).digest('hex');
  for (const family of ['business','navigation','account']) {
    const source = await readFile(new URL('../scripts/r3/authored/'+family+'.js',import.meta.url),'utf8');
    const runtime = family === 'account' ? runtimes.accountFeedback : runtimes[family];
    assert.ok(runtime.endsWith(source),family+' runtime must include current authored source');
  }
  for (const item of catalog.filter(item=>item.runtimeFamily)) {
    const runtime = runtimes[item.runtimeFamily];
    assert.equal(typeof runtime,'string');
    const scriptHash = hash(frameCode.replace(/^function /,'') + runtime);
    for (const [width,stored] of Object.entries(item.hashes)) {
      assert.equal(hash([item.id,'current',item.current,cssHash,width,scriptHash].join('|')),stored,item.id);
    }
  }
});

test('account feedback keeps explicit R1 login replay and masked loading fixtures alongside the current application', async () => {
  const pinned = await row('login/empty/email',390,'prior-r3');
  assert.equal(pinned.hash,'3ce1e61428ca87c7202fe73272ad0234f0d492cd15bdb81cafaca3b409354f36');
  assert.equal(pinned.mount,runtimes.account);
  const live=await row('login/empty/email',390);
  assert.notEqual(live.hash,pinned.hash);assert.ok(live.application);
  const authored=await preservedReviewArtifact('login/empty/email');assert.notEqual(authored.hash,live.hash);
  assert.match(authored.html,/integrated-providers/);
  for (const screen of ['login','signup']) {
    const loading = await preservedReviewArtifact(screen+'/loading/email');
    const body = loading.editable.split('<body>')[1].split('<script')[0];
    assert.match(body,/placeholder="my@order.ooo"/);
    assert.match(body,/placeholder="•+"/);
    assert.doesNotMatch(body,/data-action="password-visibility"|value="[^"]+"/);
    assert.equal(loading.mount,screen==='login'?runtimes.integratedLogin:runtimes.accountFeedback);
  }
  const signup = await preservedReviewArtifact('signup/terms/email');
  assert.match(signup.html,/data-opt-choice/);
  assert.match(signup.html,/받지 않고 계속/);
  const otp = await preservedReviewArtifact('otp/expired/email');
  const disabled = (otp.html.match(/<input[^>]+class="otp-digit"[^>]*disabled[^>]*>/g)||[]).length;
  assert.equal(disabled,6);
  const complete = await preservedReviewArtifact('otp/verified/email');
  assert.doesNotMatch(complete.html,/data-action="login"/);
});
