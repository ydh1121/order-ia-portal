import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {serveR3Artifact,isR3ReviewTarget,renderR3Qa} from '../src/server/r3-qa-page.mjs';
import {frameCode,hostCode,runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
const url='https://private.invalid/api/ia/r3-qa/artifact';
const read=async(q='')=>await(await serveR3Artifact(new Request(url+q))).json();
const row=(id,width=390,version='current')=>read('?'+new URLSearchParams({id,width:String(width),version}));
test('the QA menu covers the complete pinned state inventory without copying review decisions',async()=>{
  const list=await read();assert.equal(list.items.length,498);assert.equal(new Set(list.items.map(r=>r.screen+'/'+r.state)).size,496);
  assert.equal(new Set(list.items.map(r=>r.screen)).size,97);
  for(const entry of list.items){assert.equal('approved' in entry,false);assert.equal(typeof entry.hashes['390'],'string');}
});
test('stable target is bound to width, variant, release and generated artifact',async()=>{
  const id='login/empty/email'; const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:(await row(id)).hash};
  assert.equal(await isR3ReviewTarget(target,'MSG0585-R3'),true);
  assert.equal(await isR3ReviewTarget({...target,viewport:1440},'MSG0585-R3'),false);
  assert.equal(await isR3ReviewTarget(target,'legacy'),false);
  assert.notEqual(target.artifactHash,(await row(id,390,'previous')).hash);
});
test('reviewed files include one selected screen, a SHA and no remote source or UI execution',async()=>{
  const result=await row('login/empty/email',1440);
  assert.equal(createHash('sha256').update(result.editable).digest('hex'),result.exportHash);
  assert.match(result.editable,/id="frame-meta"/);assert.doesNotMatch(result.editable,/<iframe\b|<script(?! type="application\/json")|example-only-pass|<form[^>]+ action=/i);
  assert.match(result.editable,/"viewport":1440/);assert.match(result.editable,new RegExp(result.hash));
  assert.equal((await serveR3Artifact(new Request(url+'?id=https://example.org&width=390&version=current'))).status,404);
});
test('new result artifacts project the locked presentation; customer data is requested only in the trusted parent',async()=>{
  const hidden=await row('quote-result/locked/email');const detail=await row('quote-result/new-detail/email');
  for(const doc of [hidden,detail]){assert.doesNotMatch(doc.editable,/12,540,000|11,940,000|600,000|data-price=|compareData=/);assert.equal(doc.mount,null);}
  assert.match(hostCode,/r3-price\/quote/);assert.doesNotMatch(frameCode,/r3-price|r3-role|X-IA-CSRF/);
});
test('selected source code parses under CSP; opaque content cannot call storage or reuse another target',()=>{
  for(const f of [frameCode,hostCode])new Script('('+f+')');
  for(const s of Object.values(runtimes)){new Script(s);assert.doesNotMatch(s,/example-only-pass|12540000|11940000|r3-qa\/records|__Host-ia_session/i);}
  const page=renderR3Qa('012345');assert.match(page,/sandbox="allow-scripts"/);assert.doesNotMatch(page,/allow-same-origin|13,140,000|<iframe[^>]*src="\/ia/);
});

test('current and comparison catalog documents omit fixture prices split across child tags',async()=>{
  const catalog=await read();
  for(const screen of ['admin-overview','admin-price-approval','admin-offers','partner-storefront','consumer-product']){
    const selected=catalog.items.filter(item=>item.screen===screen);
    assert.ok(selected.length,screen);
    for(const item of selected)for(const version of ['current','previous']){
      const result=await row(item.id,390,version);
      assert.doesNotMatch(result.editable,/(?:1,284,000|5,970|7,900)\s*(?:<[^>]+>\s*)*원/);
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

test('account feedback preserves the active login target and exports only masked loading fixtures', async () => {
  const pinned = await row('login/empty/email',390,'prior-r3');
  assert.equal(pinned.hash,'3ce1e61428ca87c7202fe73272ad0234f0d492cd15bdb81cafaca3b409354f36');
  assert.equal(pinned.mount,runtimes.account);
  const live=await row('login/empty/email',390);
  assert.notEqual(live.hash,pinned.hash);
  assert.match(live.html,/integrated-providers/);
  for (const screen of ['login','signup']) {
    const loading = await row(screen+'/loading/email');
    const body = loading.editable.split('<body>')[1].split('<script')[0];
    assert.match(body,/placeholder="my@order.ooo"/);
    assert.match(body,/placeholder="•+"/);
    assert.doesNotMatch(body,/data-action="password-visibility"|value="[^"]+"/);
    assert.equal(loading.mount,screen==='login'?runtimes.integratedLogin:runtimes.accountFeedback);
  }
  const signup = await row('signup/terms/email');
  assert.match(signup.html,/data-opt-choice/);
  assert.match(signup.html,/받지 않고 계속/);
  const otp = await row('otp/expired/email');
  const disabled = (otp.html.match(/<input[^>]+class="otp-digit"[^>]*disabled[^>]*>/g)||[]).length;
  assert.equal(disabled,6);
  const complete = await row('otp/verified/email');
  assert.doesNotMatch(complete.html,/data-action="login"/);
});
