import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {mountIntegratedLogin} from '../scripts/r3/authored/integrated-login.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
const assets = JSON.parse(await readFile(new URL('../scripts/r3/authored/login-provider-buttons.json',import.meta.url),'utf8'));
const get = async (variant, width) => (await serveR3Artifact(new Request('https://private.invalid/artifact?'+new URLSearchParams({id:'login/empty/'+variant,width:String(width),version:'current'})))).json();
test('integrated entry contains unchanged native provider button files and keeps explicitly selected account review artifacts',async()=>{
  const integrated=await get('compact',390);
  assert.equal(integrated.mount,runtimes.integratedLogin);
  const body=integrated.editable.split('<body>')[1].split('<script')[0];
  for(const [key,ref] of Object.entries(assets)){
    assert.match(body,new RegExp('data-action="social-'+key+'" aria-label="'+ref.label+'"'));
    assert.ok(body.includes('data:image/png;base64,'+ref.png));
    assert.equal(createHash('sha256').update(Buffer.from(ref.png,'base64')).digest('hex'),ref.pngSha256);
  }
  assert.equal((await get('email',390)).hash,'3ce1e61428ca87c7202fe73272ad0234f0d492cd15bdb81cafaca3b409354f36');
  assert.equal((await get('social',390)).hash,'acc406d815bd95f8fbdf66905e290b6dae3d2952b2b9ed5cde70bd2fd1e956a3');
  assert.doesNotMatch(body,/https?:\/\/[^"]+\.(?:png|svg)|<form[^>]*\saction=/i);
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
