import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {mountIntegratedLogin} from '../scripts/r3/authored/integrated-login.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
const assets = JSON.parse(await readFile(new URL('../scripts/r3/authored/login-provider-buttons.json',import.meta.url),'utf8'));
const get = async (variant, width,version='current') => (await serveR3Artifact(new Request('https://private.invalid/artifact?'+new URLSearchParams({id:'login/empty/'+variant,width:String(width),version})))).json();
test('integrated entry contains unchanged native provider button files and keeps explicitly selected account review artifacts',async()=>{
  const integrated=await get('compact',390);
  assert.equal(integrated.mount,runtimes.integratedLogin);
  const body=integrated.editable.split('<body>')[1].split('<script')[0];
  for(const [key,ref] of Object.entries(assets)){
    assert.match(body,new RegExp('data-action="social-'+key+'" aria-label="'+ref.label+'"'));
    assert.ok(body.includes('data:image/png;base64,'+ref.png));
    assert.equal(createHash('sha256').update(Buffer.from(ref.png,'base64')).digest('hex'),ref.pngSha256);
  }
  const signup=await (await serveR3Artifact(new Request('https://private.invalid/artifact?id=signup/empty/email&width=390&version=current'))).json();
  for(const ref of Object.values(assets))assert.ok(signup.editable.includes('data:image/png;base64,'+ref.png));
  assert.match(signup.editable,/aria-label="간편 가입"/);
  assert.equal((await get('email',390,'prior-r3')).hash,'3ce1e61428ca87c7202fe73272ad0234f0d492cd15bdb81cafaca3b409354f36');
  assert.equal((await get('social',390,'prior-r3')).hash,'acc406d815bd95f8fbdf66905e290b6dae3d2952b2b9ed5cde70bd2fd1e956a3');
  const email=await get('email',390);
  for(const ref of Object.values(assets))assert.ok(email.editable.includes('data:image/png;base64,'+ref.png));
  assert.notEqual(email.hash,(await get('email',390,'prior-r3')).hash);
  assert.doesNotMatch(body,/https?:\/\/[^"]+\.(?:png|svg)|<form[^>]*\saction=/i);
});
test('previously reviewed links resolve only their recorded release and viewport, including the original 320px pin',async()=>{
  const id='login/empty/email';
  const artifact=(width,version,hash)=>serveR3Artifact(new Request('https://private.invalid/artifact?'+new URLSearchParams({id,width:String(width),version,...(hash?{artifactHash:hash}:{})})));
  const oldPin='bf83c284c019ab7306cb6ca2c75f7344e50e3dae825b414f26d776b02c5de68c';
  const recovered=await (await artifact(320,'recorded',oldPin)).json();
  assert.equal(recovered.version,'prior-r3');
  assert.equal(recovered.hash,oldPin);
  assert.doesNotMatch(recovered.editable,/data-r3-provider-native/);
  assert.equal((await artifact(390,'recorded',oldPin)).status,404);
  assert.equal((await artifact(320,'recorded','0'.repeat(64))).status,404);
  assert.equal((await artifact(320,'recorded')).status,404);
  for(const width of [320,390,1440]){
    const r2=await (await artifact(width,'previous')).json();
    const selected=await (await artifact(width,'recorded',r2.hash)).json();
    assert.equal(selected.version,'previous');
    assert.equal(selected.html,r2.html);
    assert.equal(selected.mount,r2.mount);
  }
});
test('only a validated login completion exits right, honors reduced motion and cancels on unmount',async()=>{
  const history=[];let wrapped,finish,animationOptions,disposed=false;
  const login={id:'login',mount(_root,_state,api){wrapped=api;return ()=>{disposed=true;};}};
  runInNewContext('('+mountIntegratedLogin.toString()+')()', {window:{ORDER_DESIGN_MODULES:[login]}});
  const content={animate(frames,options){animationOptions={frames,options};return {finished:new Promise(ok=>{finish=ok;}),cancel(){}};}};
  const root={querySelector(){return content;}};
  const outer={select:(...a)=>history.push(a),reduced:()=>false};
  let dispose=login.mount(root,'empty',outer);
  wrapped.select('signup','empty');
  assert.deepEqual(history,[['signup','empty']]);
  wrapped.select('login','success');
  assert.match(animationOptions.frames[1].transform,/translateX\(22%\)/);
  assert.equal(history.length,1);
  finish();await Promise.resolve();
  assert.equal(history.length,2);
  dispose();assert.ok(disposed);
  dispose=login.mount(root,'empty',outer);wrapped.select('login','success');dispose();finish();await Promise.resolve();
  assert.equal(history.length,2);
  login.mount(root,'empty',{...outer,reduced:()=>true});wrapped.select('login','success');
  assert.equal(history.length,3);
});
