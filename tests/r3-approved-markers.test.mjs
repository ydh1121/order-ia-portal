import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {mountApprovedMarkers} from '../src/server/r3-ui/approved-markers.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const clone=value=>JSON.parse(JSON.stringify(value));
async function until(check){
 const end=performance.now()+2000;
 while(!check()&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(check(),'the released frame and marker decoration must settle');
}
function fixture(t){
 const dom=new JSDOM('<main id="order-single"><button id="first">첫 요소</button><button id="second">둘째 요소</button></main>',
  {url:'https://order-ia-portal.pages.dev/test-frame',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,messages=[],parent={postMessage:message=>messages.push(clone(message))};
 t.after(()=>w.close());
 Object.defineProperty(w,'parent',{value:parent});
 Object.defineProperty(w,'visualViewport',{value:{scale:1}});
 Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const rects={first:{x:40,y:40,left:40,top:40,width:100,height:40},second:{x:240,y:40,left:240,top:40,width:100,height:40}};
 for(const [id,rect] of Object.entries(rects)){
  const el=w.document.getElementById(id);
  el.getBoundingClientRect=()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height});
  el.getClientRects=()=>[el.getBoundingClientRect()];
 }
 const session={channel:'11111111-1111-4111-8111-111111111111',artifact:'a'.repeat(64),screen:'pin-fixture',state:'normal',variant:'email',version:'current'};
 w.__session=w.JSON.parse(JSON.stringify(session));
 w.eval('('+frameCode+')(__session)');
 const frozenDraft=w.document.createElement('span');
 frozenDraft.className='approval-draft-pin';frozenDraft.dataset.frozenDraft='';
 w.document.body.append(frozenDraft);
 w.eval('('+browserFunction(mountApprovedMarkers)+')(__session)');
 const send=(type,payload)=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:session.channel,artifact:session.artifact,type,payload}}));
 const anchor=id=>{
  const el=w.document.getElementById(id),r=el.getBoundingClientRect();
  w.document.elementFromPoint=()=>el;
  send('mode',true);
  w.dispatchEvent(new w.MouseEvent('click',{button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2,cancelable:true}));
  send('mode',false);
  return clone(messages.filter(message=>message.type==='point').at(-1).payload);
 };
 return {w,messages,send,anchor,session};
}

test('prior and current marker presentation preserves exact frame clicks and source records',async t=>{
 const f=fixture(t),first=f.anchor('first'),second=f.anchor('second'),original={...first,artifactHash:'b'.repeat(64)};
 assert.equal(f.w.document.querySelectorAll('.approval-draft-pin').length,1);
 assert.equal(f.w.document.querySelector('[data-frozen-draft]'),null);
 const originalBytes=JSON.stringify(original);
 const pins=[
  {id:'prior',ordinal:1,anchor:{...original,artifactHash:f.session.artifact},previous:true,sourceArtifactHash:original.artifactHash,origin:'current'},
  {id:'current',ordinal:2,anchor:second,previous:false,sourceArtifactHash:f.session.artifact,origin:'current'}
 ];
 f.send('pins',pins);
 await until(()=>f.w.document.querySelector('.r3-pin.is-previous')?.dataset.previousCount==='1'&&f.w.document.querySelectorAll('.r3-pin').length===2);
 const prior=f.w.document.querySelector('.r3-pin.is-previous'),current=f.w.document.querySelector('.r3-pin:not(.is-previous)');
 assert.equal(prior.dataset.currentCount,'0');
 assert.equal(prior.getAttribute('aria-label'),'이전 위치 코멘트 1번 열기');
 assert.equal(current.dataset.previousCount,'0');
 assert.equal(current.dataset.currentCount,'1');
 assert.equal(current.getAttribute('aria-label'),'위치 코멘트 2번 열기');
 prior.click();current.click();
 assert.deepEqual(f.messages.filter(message=>message.type==='openPins').map(message=>message.payload.ids),[['prior'],['current']]);
 assert.equal(JSON.stringify(original),originalBytes);
 assert.equal(pins[0].sourceArtifactHash,'b'.repeat(64));
 // Old provenance is not permission to bypass the released anchor/hash check.
 f.send('pins',[{...pins[0],anchor:original}]);
 await until(()=>f.w.document.querySelectorAll('.r3-pin').length===0);
 assert.ok(f.messages.some(message=>message.type==='missing'&&message.payload.ids.includes('prior')));
});

test('mixed and resolved clusters retain source counts, numbered selection and original cluster clicks',async t=>{
 const f=fixture(t),anchor=f.anchor('first');
 const pins=[
  {id:'legacy:one',ordinal:3,anchor,previous:true,sourceArtifactHash:null,origin:'legacy',resolved:true},
  {id:'current-two',ordinal:7,anchor,previous:false,sourceArtifactHash:f.session.artifact,origin:'current',resolved:true}
 ];
 f.send('pins',pins);f.send('pin-view',{selected:['legacy:one']});
 await until(()=>f.w.document.querySelector('.r3-pin.is-mixed.is-resolved.is-selected'));
 const pin=f.w.document.querySelector('.r3-pin');
 assert.equal(pin.classList.contains('is-previous'),false);
 assert.equal(pin.dataset.previousCount,'1');assert.equal(pin.dataset.currentCount,'1');
 assert.equal(pin.dataset.cluster,'+1');assert.equal(pin.textContent,'3');
 assert.equal(pin.getAttribute('aria-label'),'위치 코멘트 3, 7번 열기 · 이전 1개, 현재 1개 · 해결됨');
 pin.click();
 assert.deepEqual(f.messages.filter(message=>message.type==='openPins').at(-1).payload.ids,['legacy:one','current-two']);
 f.send('pins',[pins[0]]);
 await until(()=>f.w.document.querySelector('.r3-pin.is-previous.is-resolved:not(.is-mixed)'));
 assert.equal(f.w.document.querySelector('.r3-pin').getAttribute('aria-label'),'이전 위치 코멘트 3번 열기 · 해결됨');
});
