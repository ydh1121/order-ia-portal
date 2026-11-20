import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mounted(screen,state='empty',extra={}){
  const row=catalog.find(row=>row.screen===screen&&row.state===state&&row.variant==='email');
  const dom=new JSDOM(gunzipSync(Buffer.from(frames[row.current],'base64')).toString(),{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.eval(runtimes.accountFeedback);const root=w.document.querySelector('#order-single'),navigation=[],unavailable=[];
  const api={screen,mode:'product',interactive:true,reduced:()=>true,select:(...args)=>navigation.push(args),onUnavailable:action=>unavailable.push(action),...extra};
  const dispose=w.ORDER_DESIGN_MODULES.find(module=>module.id===screen).mount(root,state,api);
  const fill=(name,value)=>{root.querySelector('[name="'+name+'"]').value=value;};
  return {w,root,navigation,unavailable,fill,click:action=>root.querySelector('[data-action="'+action+'"]').click(),close(){dispose?.();w.close();}};
}
test('product login and signup preserve valid input and never claim success without a service',()=>{
  for(const screen of ['login','signup']){
    const f=mounted(screen);f.fill('email','fixture@example.test');f.fill('password','Fixture-Password-42!');
    if(screen==='signup'){f.fill('password-confirm','Fixture-Password-42!');for(const input of f.root.querySelectorAll('input[type=checkbox]'))input.checked=true;}
    f.click('submit-'+screen);assert.deepEqual(f.navigation,[]);assert.deepEqual(f.unavailable,['submit-'+screen]);
    assert.equal(f.root.querySelector('[name=password]').value,'Fixture-Password-42!');assert.equal(f.root.querySelector('[name=password]').disabled,false);f.close();
  }
});
test('product OTP verification and resend cannot manufacture a verified account or sent message',()=>{
  const f=mounted('otp');for(const [index,input] of [...f.root.querySelectorAll('.otp-digit')].entries())input.value=String(index+1);
  f.click('verify-otp');f.click('resend');assert.deepEqual(f.navigation,[]);assert.deepEqual(f.unavailable,['verify-otp','resend']);
  assert.equal(f.root.querySelector('[data-action=resend]').disabled,false);f.close();
});
test('product password request/change stay unconfirmed without a backing provider',()=>{
  const request=mounted('password','request');request.fill('email','fixture@example.test');request.click('send-reset');assert.deepEqual(request.navigation,[]);assert.deepEqual(request.unavailable,['send-reset']);request.close();
  const change=mounted('password','strong');change.fill('new-password','Fixture-Password-42!');change.fill('password-confirm','Fixture-Password-42!');change.click('submit-password');assert.deepEqual(change.navigation,[]);assert.deepEqual(change.unavailable,['submit-password']);change.close();
});
test('only a confirmed injected request can advance product authentication, and destroyed pages ignore late success',async()=>{
  let finish,context;const f=mounted('login','empty',{performAction(action,input){assert.equal(action,'submit-login');context=input;return new Promise(resolve=>{finish=resolve;});}});
  f.fill('email','fixture@example.test');f.fill('password','Fixture-Password-42!');f.click('submit-login');await tick();
  assert.equal(context.root.querySelector('[name=password]').value,'Fixture-Password-42!');assert.deepEqual(f.navigation,[]);
  finish({confirmed:false});await tick();assert.deepEqual(f.navigation,[]);assert.equal(context.button.disabled,false);
  f.click('submit-login');await tick();finish({confirmed:true});await tick();assert.deepEqual(f.navigation,[['login','success']]);f.close();
  let late;const g=mounted('login','empty',{performAction(){return new Promise(resolve=>{late=resolve;});}});g.fill('email','fixture@example.test');g.fill('password','Fixture-Password-42!');g.click('submit-login');await tick();g.close();late({confirmed:true});await tick();assert.deepEqual(g.navigation,[]);
});
