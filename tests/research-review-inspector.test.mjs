import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installResearchInspector} from '../src/server/research-app/review-inspector.mjs';
import {getResearchInspectorPanelsModule,getResearchPinProjectionModule} from '../src/server/research-app/inspector-panels-source.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const hash='c'.repeat(64),oldHash='a'.repeat(64),origin='https://order-ia-portal.pages.dev';
const initial={channel:'11111111-1111-4111-8111-111111111111',artifact:hash,screen:'onboarding',state:'guest-1',variant:'email',viewport:390};
const frame=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
async function until(check,w){for(let i=0;i<12&&!check();i++)await frame(w);assert.ok(check(),'inspection work settled');}
function harness(t,{panels=false,animationFrames=true,initialSession=initial,setup=()=>{},markup='<main id="order-single"><header><button class="obm-brand">오더</button></header><form id="business"><label>전화<input name="phone" value="01012345678"></label><button id="continue" type="button">다음</button></form></main>'}={}){
  const dom=new JSDOM(markup,{url:origin+'/ia/research?inspect=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,root=w.document.getElementById('order-single'),sent=[],parent={postMessage(message,targetOrigin){sent.push({message,targetOrigin});}};
  Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w,'innerWidth',{value:390,configurable:true});Object.defineProperty(w,'innerHeight',{value:844,configurable:true});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  if(!animationFrames){w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};}
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:20,y:40,left:20,top:40,right:120,bottom:90,width:100,height:50};};
  w.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
  w.HTMLElement.prototype.scrollTo=function(x,y){this.scrollLeft=x;this.scrollTop=y;};
  let hit=root.querySelector('#continue')||root.querySelector('button')||root;
  w.document.elementFromPoint=()=>hit;
  setup(w,root);
  w.eval(getResearchPinProjectionModule().replace('export const installPinProjection =','var installPinProjection ='));
  w.eval(getResearchInspectorPanelsModule().replace('export const installResearchReviewPanels =','window.installResearchReviewPanels ='));
  const install=w.eval('('+browserFunction(installResearchInspector)+')');
  const api=install(initialSession,{root,...panels?{installPanels:w.installResearchReviewPanels}:{}});
  assert.ok(api);
  t.after(()=>{api.dispose();w.close();});
  const session=()=>api.inspect().session;
  const send=(type,payload,overrides={})=>{
    const s=session(),event=new w.MessageEvent('message',{origin:overrides.origin??origin,source:overrides.source??parent,data:{scope:'ORDER_R3_HOST',channel:s.channel,artifact:s.artifact,type,payload,...overrides.data}});
    w.dispatchEvent(event);return event;
  };
  const messages=type=>sent.filter(item=>item.message.type===type).map(item=>item.message);
  const point=()=>{send('mode',true);w.document.getElementById('r3-veil').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,clientX:57,clientY:70}));send('mode',false);return messages('point').at(-1)?.payload;};
  return {w,root,api,send,messages,sent,point,hit:node=>{hit=node;}};
}

// JSDOM has no native top layer. Model only its input boundary here: a modal
// permits hits/focus on its descendants, in opening order rather than DOM order.
// Native browser gates separately verify actual layout and trusted pointer hits.
function nativeModalSurface(w){
  const stack=[],popovers=new WeakSet(),returns=new WeakMap(),calls={open:0,close:0},focuses=[];
  const matches=w.Element.prototype.matches,focus=w.HTMLElement.prototype.focus,rects=w.HTMLElement.prototype.getClientRects;
  const top=()=>stack.filter(dialog=>dialog.open&&dialog.isConnected).at(-1)||null;
  let hit=null,documentFocused=true;
  w.Element.prototype.matches=function(selector){
    if(selector===':modal'||selector==='dialog:modal')return this.open&&this.isConnected&&stack.includes(this);
    if(selector===':popover-open')return popovers.has(this)&&this.isConnected;
    return matches.call(this,selector);
  };
  w.HTMLElement.prototype.getClientRects=function(){const dialog=this.closest('dialog');return dialog&&!dialog.open?[]:rects.call(this);};
  w.HTMLElement.prototype.focus=function(options){const modal=top();if(modal&&!modal.contains(this))return;focuses.push({node:this,options});return focus.call(this,options);};
  w.document.hasFocus=()=>documentFocused;
  w.HTMLElement.prototype.showPopover=function(){popovers.add(this);};
  w.HTMLElement.prototype.hidePopover=function(){popovers.delete(this);};
  const transition=(dialog,type,oldState,newState)=>{
    const event=new w.Event(type);Object.defineProperties(event,{oldState:{value:oldState},newState:{value:newState}});dialog.dispatchEvent(event);
  };
  w.HTMLDialogElement.prototype.showModal=function(){
    assert.equal(this.open,false);returns.set(this,w.document.activeElement);transition(this,'beforetoggle','closed','open');
    this.open=true;stack.push(this);calls.open++;
    this.querySelector('[autofocus],input,button,[tabindex]')?.focus();transition(this,'toggle','closed','open');
  };
  w.HTMLDialogElement.prototype.close=function(){
    if(!this.open)return;transition(this,'beforetoggle','open','closed');this.open=false;const index=stack.indexOf(this);if(index>=0)stack.splice(index,1);calls.close++;
    const previous=returns.get(this);if(previous?.isConnected)previous.focus();
    w.queueMicrotask(()=>{this.dispatchEvent(new w.Event('close'));transition(this,'toggle','open','closed');});
  };
  w.document.elementFromPoint=()=>{
    const modal=top(),allowed=node=>node?.isConnected&&(!modal||modal.contains(node));
    const veil=w.document.getElementById('r3-veil'),markers=w.document.getElementById('r3-pins');
    if(allowed(veil)&&!veil.hidden&&veil.style.pointerEvents!=='none')return veil;
    const pin=markers?.style.visibility!=='hidden'&&markers?.querySelector('.r3-pin');
    if(allowed(pin))return pin;
    return allowed(hit)?hit:modal?.querySelector('h2,input,button')||modal||w.document.body;
  };
  return {calls,focuses,top,hit:node=>{hit=node;},documentFocused:value=>{documentFocused=value;},
    click(){const target=w.document.elementFromPoint(57,70);for(const type of ['pointerdown','pointerup','click']){const accepted=target.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,detail:1,clientX:57,clientY:70}));if(type==='pointerdown'&&accepted&&target.matches('button,input,[tabindex]'))target.focus({preventScroll:true});}return target;},
    escape(){const event=new w.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape'});if(w.document.activeElement.dispatchEvent(event))top()?.close();return event;}
  };
}

const nativeModalMarkup='<main id="order-single"><button id="outside-action" type="button">다른 화면</button><input id="quote-quantity" value="37"><dialog id="child-dialog"><h2 id="child-title" tabindex="-1">하위 확인</h2><button id="child-action" type="button">계속</button></dialog><dialog id="input-review-dialog"><h2 id="input-review-title" tabindex="-1">입력 검토</h2><label class="field"><input id="review-field" value="보존할 입력"></label><button id="review-action" type="button">확인</button></dialog><dialog id="modeless-dialog"><button type="button">일반 창</button></dialog></main>';
const annotationNodes=w=>[w.document.getElementById('r3-veil'),w.document.getElementById('r3-pins'),w.document.querySelector('.approval-draft-pin')];
const productMarkup=root=>{const copy=root.cloneNode(true);copy.querySelectorAll('[data-research-annotation]').forEach(node=>node.remove());return copy.outerHTML;};

test('inspection observes the running app without mounting, blocking forms or intercepting navigation',async t=>{
  const h=harness(t),{w,root,api,messages}=h;let submitted=0,navigated=0;
  const form=root.querySelector('form'),input=root.querySelector('input'),button=root.querySelector('#continue'),before=root.innerHTML;
  w.ORDER_DESIGN_MODULES=[{mount(){throw Error('inspection must never mount authored UI');}}];
  w.ORDER_RESEARCH_APP={navigate(){navigated++;},snapshot:()=>({screen:'onboarding',state:'guest-1'})};
  form.addEventListener('submit',()=>submitted++);button.addEventListener('click',()=>w.ORDER_RESEARCH_APP.navigate('q1'));
  assert.equal(form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),true);button.click();
  input.value='0311234567';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>messages('ready').length===1,w);
  assert.equal(submitted,1);assert.equal(navigated,1);assert.equal(input.value,'0311234567');assert.equal(root.querySelector('input'),input);
  assert.equal(root.innerHTML,before);assert.equal(messages('navigate').length,0);assert.equal(messages('ready')[0].artifact,hash);
  assert.ok(h.sent.every(item=>item.targetOrigin===origin));assert.equal(api.inspect().active,true);
});

test('an already mounted hidden app reports ready once even if the browser pauses animation frames',async t=>{
  const h=harness(t,{animationFrames:false});
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(h.messages('ready').length,1);assert.equal(h.messages('ready')[0].artifact,hash);
  h.api.updateSession({...initial,channel:'hidden-next-session',artifact:'d'.repeat(64)});
  h.api.dispose();await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(h.messages('ready').length,1,'dispose cancels the pending timer as well as RAF');
});

test('only the picking veil consumes pointer input and recorded coordinates preserve product input and anchor identity',async t=>{
  const h=harness(t),{w,root,send,messages}=h;const input=root.querySelector('input'),button=root.querySelector('#continue');
  input.value='작성 중인 전화번호';let clicks=0;button.addEventListener('click',()=>clicks++);button.click();assert.equal(clicks,1);
  const a=h.point();assert.ok(a);assert.match(a.id,/^a-/);assert.equal(a.instance,'onboarding');assert.equal(a.artifactHash,hash);assert.equal(a.x,.37);assert.equal(a.y,.6);
  assert.equal(clicks,1);assert.equal(input.value,'작성 중인 전화번호');assert.deepEqual(JSON.parse(JSON.stringify(a.viewport)),{width:390,height:844});
  send('mode',true);const form=root.querySelector('form');assert.equal(form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),true,'inspection never installs a form submission blocker');
  w.document.getElementById('r3-veil').dispatchEvent(new w.KeyboardEvent('keydown',{bubbles:true,key:'Escape'}));
  assert.equal(messages('cancelPick').length,1);assert.equal(w.document.getElementById('r3-veil').hidden,true);
  assert.equal(h.point().id,a.id);assert.equal(input.value,'작성 중인 전화번호');
});

test('native modal annotation ownership permits picking and existing pin clicks without closing the product dialog or changing its model',async t=>{
  let surface;
  const h=harness(t,{panels:true,markup:nativeModalMarkup,setup(w){surface=nativeModalSurface(w);}}),{w,root,send,messages}=h;
  const nodes=annotationNodes(w),dialog=root.querySelector('#input-review-dialog'),heading=root.querySelector('#input-review-title');
  const quantity=root.querySelector('#quote-quantity'),model={quantity:quantity.value};let productClicks=0;
  quantity.addEventListener('input',()=>{model.quantity=quantity.value;});root.querySelector('#review-action').addEventListener('click',()=>productClicks++);
  dialog.showModal();await until(()=>nodes.every(node=>node.parentElement===dialog),w);
  assert.ok(nodes.every(node=>node.hasAttribute('data-research-annotation')));assert.equal(w.document.querySelectorAll('[data-research-annotation]').length,3);
  surface.hit(heading);send('mode',true);
  assert.equal(w.document.activeElement,nodes[0]);assert.equal(surface.click(),nodes[0]);
  const anchor=messages('point').at(-1)?.payload;assert.ok(anchor);assert.equal(anchor.artifactHash,hash);assert.equal(anchor.instance,initial.screen);
  assert.equal(anchor.x,.37);assert.equal(anchor.y,.6);assert.equal(anchor.layers.length,1,'only the real product dialog is recorded as a visible layer');
  send('mode',false);
  const pin={id:'saved-modal-pin',ordinal:4,anchor},original=JSON.stringify(pin);
  send('pins',[pin]);send('pin-view',{draft:anchor,selected:[pin.id]});
  await until(()=>dialog.querySelector('.r3-pin')&&!nodes[2].hidden,w);
  const marker=dialog.querySelector('.r3-pin');assert.equal(surface.click(),marker);
  assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[pin.id]);assert.equal(marker.textContent,'4');
  assert.equal(JSON.stringify(pin),original);assert.deepEqual(model,{quantity:'37'});assert.equal(quantity.value,'37');assert.equal(productClicks,0);
  assert.equal(dialog.open,true);assert.equal(dialog.matches(':modal'),true);assert.equal(surface.calls.close,0);
  h.api.dispose();assert.equal(dialog.open,true);assert.equal(surface.calls.close,0);assert.equal(root.querySelector('#quote-quantity'),quantity);
  assert.equal(w.document.querySelectorAll('[data-research-annotation]').length,0);assert.deepEqual(model,{quantity:'37'});
});

test('annotation nodes follow native modal opening order, nested closure and removal, then return to the body with original anchor identities',async t=>{
  let surface;
  const h=harness(t,{panels:true,markup:nativeModalMarkup,setup(w){surface=nativeModalSurface(w);}}),{w,root,send,messages}=h;
  const nodes=annotationNodes(w),parentDialog=root.querySelector('#input-review-dialog'),child=root.querySelector('#child-dialog'),modeless=root.querySelector('#modeless-dialog');
  const capture=element=>{surface.hit(element);send('mode',true);surface.click();send('mode',false);return messages('point').at(-1).payload;};
  modeless.open=true;await frame(w);assert.ok(nodes.every(node=>node.parentElement===w.document.body),'a modeless open dialog is not a native input boundary');modeless.open=false;
  const outside=root.querySelector('#outside-action'),outsideAnchor=capture(outside);
  parentDialog.showModal();await until(()=>nodes.every(node=>node.parentElement===parentDialog),w);
  const parentAnchor=capture(root.querySelector('#input-review-title'));
  child.showModal();await until(()=>nodes.every(node=>node.parentElement===child),w);
  assert.ok(child.compareDocumentPosition(parentDialog)&w.Node.DOCUMENT_POSITION_FOLLOWING,'the top modal deliberately precedes its parent in DOM order');
  const childAnchor=capture(root.querySelector('#child-title'));assert.notEqual(childAnchor.id,parentAnchor.id);
  child.close();await until(()=>nodes.every(node=>node.parentElement===parentDialog),w);
  const restoredParent=capture(root.querySelector('#input-review-title'));assert.equal(restoredParent.id,parentAnchor.id);assert.equal(restoredParent.artifactHash,parentAnchor.artifactHash);
  child.showModal();await until(()=>nodes.every(node=>node.parentElement===child),w);
  surface.hit(root.querySelector('#child-title'));send('mode',true);assert.equal(w.document.activeElement,nodes[0]);child.remove();
  await until(()=>nodes.every(node=>node.parentElement===parentDialog)&&w.document.activeElement===nodes[0],w);
  const cancelled=messages('cancelPick').length;assert.equal(surface.escape().defaultPrevented,true);
  assert.equal(messages('cancelPick').length,cancelled+1);assert.equal(parentDialog.open,true,'Escape still cancels QA picking after its previous modal owner was removed');
  parentDialog.close();await until(()=>nodes.every(node=>node.parentElement===w.document.body),w);
  const restoredOutside=capture(outside);assert.equal(restoredOutside.id,outsideAnchor.id);assert.equal(restoredOutside.artifactHash,outsideAnchor.artifactHash);
  assert.deepEqual(annotationNodes(w),nodes);assert.equal(w.document.querySelectorAll('[data-research-annotation]').length,3);
  assert.equal(surface.calls.open,3);assert.equal(surface.calls.close,2,'inspection never closes a product dialog');assert.equal(root.querySelector('#quote-quantity').value,'37');
});

test('modal picking preserves projected anchors through QA-only mutations and restores focus without closing the editor or stealing parent focus',async t=>{
  let surface;
  const h=harness(t,{panels:true,markup:nativeModalMarkup,setup(w,root){
    surface=nativeModalSurface(w);const input=root.querySelector('#review-field'),label=input.closest('label');
    input.addEventListener('focus',()=>label.classList.add('is-focused'));input.addEventListener('blur',()=>label.classList.remove('is-focused'));
    root.querySelector('#input-review-dialog').showModal();input.focus();
  }}),{w,root,send,messages}=h,dialog=root.querySelector('#input-review-dialog'),input=root.querySelector('#review-field');
  const nodes=annotationNodes(w);await until(()=>nodes.every(node=>node.parentElement===dialog),w);
  assert.equal(w.document.activeElement,input);input.value='아직 저장하지 않은 입력';const value=input.value;
  const capture=()=>{surface.hit(input);send('mode',true);surface.click();send('mode',false);return messages('point').at(-1).payload;};
  const anchor=capture(),source=productMarkup(root),prior={id:'previous-modal-field',ordinal:2,previous:true,sourceArtifactHash:oldHash,anchor:{...anchor,artifactHash:hash}};
  const original=JSON.stringify(prior);send('pin-sources',[{artifactHash:oldHash,sourceHash:oldHash,html:source}]);
  const projected=send('pins',[prior]).data.payload[0].anchor;assert.equal(projected.id,anchor.id);
  await until(()=>dialog.querySelector('.r3-pin.is-previous'),w);surface.click();
  assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[prior.id]);
  input.focus();const again=capture();assert.equal(again.id,anchor.id);assert.equal(again.artifactHash,anchor.artifactHash);
  send('pins',[prior]);await until(()=>dialog.querySelector('.r3-pin.is-previous'),w);
  assert.deepEqual(Array.from(messages('missing').at(-1).payload.ids),[]);assert.equal(JSON.stringify(prior),original);
  // A stored root anchor compares product structure without the moved QA nodes.
  const rootPin={id:'previous-root',previous:true,sourceArtifactHash:oldHash,anchor:{...anchor,id:'screen'}};
  assert.equal(send('pins',[rootPin]).data.payload[0].anchor.id,'screen');
  input.focus();send('mode',true);assert.equal(w.document.activeElement,nodes[0]);
  const escape=surface.escape();assert.equal(escape.defaultPrevented,true);assert.equal(messages('cancelPick').length,1);
  assert.equal(w.document.activeElement,input);assert.equal(dialog.open,true);assert.equal(surface.calls.close,0);assert.equal(input.value,value);
  send('mode',true);surface.documentFocused(false);const focusCount=surface.focuses.length;send('mode',false);
  assert.equal(surface.focuses.length,focusCount,'finishing a host-side comment must not steal focus back into this document');
  surface.documentFocused(true);input.focus();const child=root.querySelector('#child-dialog');
  child.showModal();await until(()=>nodes.every(node=>node.parentElement===child),w);send('mode',true);
  assert.equal(w.document.activeElement,nodes[0]);surface.documentFocused(false);const removalFocusCount=surface.focuses.length;
  child.remove();await until(()=>nodes.every(node=>node.parentElement===dialog),w);
  assert.equal(surface.focuses.length,removalFocusCount,'recovering a removed modal owner must not steal focus from the parent document');
  send('mode',false);h.api.dispose();
  assert.equal(surface.focuses.length,removalFocusCount,'ending and disposing the picker must preserve focus outside this document');
  assert.equal(input.value,value);assert.equal(dialog.open,true);assert.equal(surface.calls.close,0);
  assert.equal(w.document.querySelectorAll('[data-research-annotation],.r3-panel-state').length,0);
  const count=messages('point').length;send('mode',true);surface.hit(input);surface.click();await frame(w);assert.equal(messages('point').length,count);
});

test('same-origin pins use the released projection, preserve original anchors and show stable historical numbering',async t=>{
  const h=harness(t),{w,root,send,messages}=h,anchor=h.point();
  const original={...anchor,artifactHash:oldHash},frozen=JSON.stringify(original);
  send('pin-sources',[{artifactHash:oldHash,sourceHash:oldHash,html:root.outerHTML}]);
  const pin={id:'historical-thread',ordinal:7,previous:true,resolved:true,sourceArtifactHash:oldHash,anchor:{...original,artifactHash:hash}};
  const packet=JSON.stringify(pin);send('pins',[pin]);await until(()=>w.document.querySelector('.r3-pin'),w);
  const marker=w.document.querySelector('.r3-pin');assert.equal(marker.textContent,'7');assert.equal(marker.classList.contains('is-previous'),true);assert.equal(marker.classList.contains('is-resolved'),true);
  marker.click();assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[pin.id]);
  send('pin-view',{draft:anchor,selected:[pin.id]});await frame(w);assert.equal(w.document.querySelector('.approval-draft-pin').hidden,false);
  assert.equal(w.document.querySelector('.r3-pin').classList.contains('is-selected'),true);
  send('restore',{...anchor,scroll:[{id:'document',x:11,y:29}]});assert.equal(w.document.documentElement.scrollTop,29);assert.equal(w.document.activeElement,root.querySelector('#continue'));
  assert.equal(JSON.stringify(original),frozen);assert.equal(JSON.stringify(pin),packet);
});

test('a mixed previous/current cluster announces both provenance counts and opens both original threads',async t=>{
  const h=harness(t),{w,root,send,messages}=h,anchor=h.point(),original={...anchor,artifactHash:oldHash},frozen=JSON.stringify(original);
  send('pin-sources',[{artifactHash:oldHash,sourceHash:oldHash,html:root.outerHTML}]);
  const pins=[{id:'previous-thread',ordinal:1,previous:true,sourceArtifactHash:oldHash,anchor:{...original,artifactHash:hash}},{id:'current-thread',ordinal:3,previous:false,sourceArtifactHash:hash,anchor}];
  const packet=JSON.stringify(pins);send('pins',pins);await until(()=>w.document.querySelector('.r3-pin.is-mixed'),w);
  const marker=w.document.querySelector('.r3-pin.is-mixed');assert.equal(w.document.querySelectorAll('.r3-pin').length,1);
  assert.equal(marker.dataset.previousCount,'1');assert.equal(marker.dataset.currentCount,'1');assert.equal(marker.dataset.cluster,'+1');
  assert.equal(marker.getAttribute('aria-label'),'위치 코멘트 1, 3번 열기 · 이전 1개, 현재 1개');
  marker.click();assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),['previous-thread','current-thread']);
  assert.equal(JSON.stringify(original),frozen);assert.equal(JSON.stringify(pins),packet);
});

test('auth focus classes do not desynchronize released projection, current pins or the active draft',async t=>{
  const session={...initial,screen:'login',state:'empty'},markup='<main id="order-single"><label class="field is-floating t-input-wrap"><input name="email" type="email"></label></main>';
  const old=harness(t,{initialSession:{...session,artifact:oldHash},markup});old.hit(old.root.querySelector('input'));
  const original=old.point(),originalBytes=JSON.stringify(original),source=old.root.outerHTML;
  const h=harness(t,{initialSession:session,markup,setup(w,root){
    const input=root.querySelector('input'),label=input.closest('label');
    input.addEventListener('focus',()=>label.classList.add('is-focused'));
    input.addEventListener('blur',()=>label.classList.remove('is-focused'));input.focus();
  }}),{w,root,send,messages}=h,input=root.querySelector('input');h.hit(input);
  const prior={id:'previous-email',ordinal:1,previous:true,sourceArtifactHash:oldHash,anchor:{...original,artifactHash:hash}};
  const sources=[{artifactHash:oldHash,sourceHash:oldHash,html:source}];
  send('pin-sources',sources);const focusedId=send('pins',[prior]).data.payload[0].anchor.id;
  await until(()=>w.document.querySelector('.r3-pin.is-previous'),w);
  assert.equal(w.document.activeElement,input);assert.equal(input.closest('label').classList.contains('is-focused'),true);
  // Picking focuses the real annotation veil. The authored blur changes only
  // a fingerprint class, just as leaving the auth input for the R1 drawer does.
  const anchor=h.point();assert.equal(input.closest('label').classList.contains('is-focused'),false);assert.equal(anchor.id,focusedId);
  const current={id:'current-email',ordinal:2,previous:false,sourceArtifactHash:hash,anchor},pins=[prior,current],packet=JSON.stringify(pins),draft=JSON.stringify(anchor);
  send('pin-sources',sources);const blurredId=send('pins',pins).data.payload[0].anchor.id;
  send('pin-view',{draft:anchor,selected:[prior.id,current.id]});
  await until(()=>w.document.querySelector('.r3-pin.is-mixed')&&!w.document.querySelector('.approval-draft-pin').hidden,w);
  assert.equal(blurredId,focusedId);assert.equal(w.document.querySelectorAll('.r3-pin').length,1);
  assert.deepEqual(Array.from(messages('missing').at(-1).payload.ids),[]);
  w.document.querySelector('.r3-pin').click();assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[prior.id,current.id]);
  send('restore',anchor);await frame(w);assert.equal(w.document.activeElement,input,'restore retains the same indexed identity through the authored blur/focus classes');
  assert.equal(w.document.querySelectorAll('.r3-pin.is-mixed').length,1);
  assert.equal(JSON.stringify(original),originalBytes);assert.equal(JSON.stringify(pins),packet);assert.equal(JSON.stringify(anchor),draft);
});

test('saved input pins survive reload with either native focus state without rewriting anchors or guessing duplicate controls',async t=>{
  const session={...initial,screen:'login',state:'empty'},markup='<main id="order-single"><label class="field is-floating t-input-wrap"><span class="input-shell t-input"><input id="login-email" name="email" type="email"></span></label></main>';
  const setup=focused=>(w,root)=>{
    const input=root.querySelector('input'),label=input.closest('label');
    input.addEventListener('focus',()=>label.classList.add('is-focused'));
    input.addEventListener('blur',()=>label.classList.remove('is-focused'));
    if(focused)input.focus();
  };
  for(const capturedFocused of [true,false]){
    const original=harness(t,{initialSession:{...session,artifact:oldHash},markup,setup:setup(capturedFocused)});
    original.hit(original.root.querySelector('input'));const source=original.root.outerHTML,oldAnchor=original.point();
    const capture=harness(t,{initialSession:session,markup,setup:setup(capturedFocused)});
    capture.hit(capture.root.querySelector('input'));const anchor=capture.point(),before=JSON.stringify(anchor);
    const h=harness(t,{initialSession:session,markup,setup:setup(!capturedFocused)}),{w,root,send,messages}=h;
    const input=root.querySelector('input'),bodyBefore=root.innerHTML;
    const prior={id:'previous-reload-email',ordinal:1,previous:true,sourceArtifactHash:oldHash,anchor:{...oldAnchor,artifactHash:hash}};
    const current={id:'current-reload-email',ordinal:2,previous:false,sourceArtifactHash:hash,anchor},pins=[prior,current],packet=JSON.stringify(pins);
    send('pin-sources',[{artifactHash:oldHash,sourceHash:oldHash,html:source}]);send('pins',pins);
    send('pin-view',{draft:anchor,selected:[prior.id,current.id]});
    await until(()=>w.document.querySelector('.r3-pin.is-mixed')&&!w.document.querySelector('.approval-draft-pin').hidden,w);
    assert.equal(w.document.querySelectorAll('.r3-pin').length,1);assert.deepEqual(Array.from(messages('missing').at(-1).payload.ids),[]);
    assert.equal(root.innerHTML,bodyBefore,'display aliases do not edit product focus classes or markup');
    w.document.querySelector('.r3-pin').click();assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[prior.id,current.id]);
    send('restore',anchor);await frame(w);assert.equal(w.document.activeElement,input);
    const later=w.document.createElement('span');later.textContent='다른 영역 갱신';root.append(later);await frame(w);
    send('pins',pins);await until(()=>w.document.querySelector('.r3-pin.is-mixed'),w);
    assert.equal(JSON.stringify(anchor),before);assert.equal(JSON.stringify(pins),packet);

    const ambiguous=harness(t,{initialSession:session,markup:markup.replace('</main>',markup.slice(markup.indexOf('<label'),markup.indexOf('</main>'))+'</main>')});
    ambiguous.send('pins',[current]);await frame(ambiguous.w);
    assert.equal(ambiguous.w.document.querySelector('.r3-pin'),null,'identical controls cannot acquire a guessed alias');
    assert.deepEqual(Array.from(ambiguous.messages('missing').at(-1).payload.ids),[current.id]);
  }
});

test('child-list changes and explicit identity resets still refresh the inspector index',async t=>{
  const h=harness(t),{w,root,send}=h,button=w.document.createElement('button');button.id='late-field';button.textContent='지연 입력';root.append(button);
  await frame(w);h.hit(button);const first=h.point();assert.notEqual(first.id,'screen');
  send('pins',[{id:'late-current',anchor:first}]);await until(()=>w.document.querySelector('.r3-pin'),w);
  button.classList.add('new-identity');root.dispatchEvent(new w.CustomEvent('r3-motion-identity-reset'));await frame(w);
  const reset=h.point();assert.notEqual(reset.id,first.id);assert.notEqual(reset.id,'screen');
  send('pins',[{id:'late-current',anchor:reset}]);await until(()=>w.document.querySelector('.r3-pin'),w);
  const replacement=w.document.createElement('button');replacement.id='replacement-field';replacement.textContent='교체 입력';button.replaceWith(replacement);
  await frame(w);h.hit(replacement);const replaced=h.point();assert.notEqual(replaced.id,reset.id);assert.notEqual(replaced.id,'screen');
  send('pins',[{id:'replacement-current',anchor:replaced}]);await until(()=>w.document.querySelector('.r3-pin'),w);
});

test('foreign windows, origins, channels and artifacts cannot control inspection or reach the reused projection',async t=>{
  const h=harness(t),{w,send}=h;
  for(const overrides of [{source:{}},{origin:'null'},{origin:'https://untrusted.invalid'},{data:{channel:'wrong'}},{data:{artifact:oldHash}}]){
    send('mode',true,overrides);assert.equal(w.document.getElementById('r3-veil').hidden,true);
    send('pins',[{id:'forged',anchor:{id:'screen',instance:'onboarding',artifactHash:hash,x:.5,y:.5}}],overrides);
  }
  send('componentState',{state:'other',channel:'other',hash:oldHash});await frame(w);
  assert.equal(w.document.querySelector('.r3-pin'),null);assert.equal(h.api.inspect().session.state,'guest-1');
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,false);
});

test('app routes suspend inspection until a current matching host acknowledgement and never accept a stale ready',async t=>{
  const h=harness(t),{w,api,send,messages}=h;await until(()=>messages('ready').length===1,w);
  const route={origin:'application',screen:'q1',state:'empty',variant:'email',mode:'simple',kind:'page',parent:'onboarding',build:'candidate-1'};
  const event=new w.CustomEvent('order:research-route',{detail:route,cancelable:true});assert.equal(w.dispatchEvent(event),true);
  assert.equal(api.inspect().active,false);assert.equal(messages('researchRoute').length,1);assert.equal(messages('researchRoute')[0].payload.routeRevision,1);
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,true);
  const next={channel:'22222222-2222-4222-8222-222222222222',hash:'d'.repeat(64),screen:'q1',state:'empty',variant:'email',width:390,routeRevision:1};
  assert.equal(api.updateSession({...next,routeRevision:0}),false);assert.equal(api.updateSession({...next,screen:'q2'}),false);
  assert.equal(api.updateSession(next),true);await until(()=>messages('ready').length===2,w);assert.equal(messages('ready').at(-1).artifact,next.hash);
  send('mode',true,{data:{channel:initial.channel,artifact:hash}});assert.equal(w.document.getElementById('r3-veil').hidden,true);
  const point=h.point();assert.equal(point.instance,'q1');assert.equal(point.artifactHash,next.hash);
});

test('the independent review bridge receives authenticated researchSelect even while inspection awaits its route acknowledgement',async t=>{
  const h=harness(t),{w,api,send}=h,received=[];
  w.addEventListener('message',event=>{if(event.data?.type==='researchSelect')received.push(event.data.payload);});
  send('researchSelect',{next:{...initial,hash:'d'.repeat(64)}});assert.equal(received.length,1);
  assert.equal(api.inspect().session.artifact,hash,'inspection does not process the bridge-owned command itself');
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'application',screen:'q1',state:'empty',variant:'email'}}));
  assert.equal(api.inspect().active,false);
  send('researchSelect',{next:{screen:'q1'},acknowledgeOnly:true,routeRevision:1});assert.equal(received.length,2);
  for(const overrides of [{source:{}},{origin:'https://untrusted.invalid'},{data:{channel:'old-channel'}},{data:{artifact:oldHash}}])send('researchSelect',{next:{screen:'q1'}},overrides);
  assert.equal(received.length,2,'pending inspection does not weaken the bridge envelope checks');
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,true);
});

test('review-origin selection waits for explicit updateSession without forwarding a second navigation request',async t=>{
  const h=harness(t),{w,api,messages}=h;await until(()=>messages('ready').length===1,w);
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'review',screen:'login',state:'empty',variant:'compact',kind:'sheet'}}));
  assert.equal(messages('researchRoute').length,0);assert.equal(api.inspect().active,false);assert.equal(api.inspect().routeRevision,0);
  assert.equal(api.updateSession({...initial,channel:'review-selection-0001',hash:undefined,artifact:'e'.repeat(64),screen:'login',state:'empty',variant:'compact'}),true);
  await until(()=>messages('ready').length===2,w);assert.equal(messages('ready').at(-1).artifact,'e'.repeat(64));
});

test('same-origin panel restoration reuses its real controller and teardown leaves no inspection listeners or markers',async t=>{
  const h=harness(t,{panels:true}),{w,root,api,send,messages}=h;
  const panel=w.document.createElement('section');panel.dataset.orderAccountPanel='';panel.innerHTML='<button id="profile-edit">프로필 수정</button>';root.append(panel);let phase='open',page='profile',opens=0;
  const menu={panel,inspect:()=>({phase,page}),open(next){opens++;phase='open';page=next||'root';panel.hidden=false;return true;},close(){phase='closed';panel.hidden=true;}};
  root.querySelector('.obm-brand').__orderAccountMenu=menu;
  await frame(w);h.hit(panel.querySelector('button'));const anchor=h.point();assert.ok(anchor.layers.length);
  menu.close();await frame(w);send('restore',anchor);await until(()=>opens===1&&w.document.activeElement===panel.querySelector('button'),w);
  assert.equal(phase,'open');assert.equal(page,'profile');assert.equal(root.querySelectorAll('#profile-edit').length,1);
  const original=JSON.stringify(anchor);api.dispose();assert.equal(w.document.getElementById('r3-veil'),null);assert.equal(root.querySelectorAll('.r3-panel-state').length,0);
  const count=messages('point').length;send('mode',true);root.querySelector('button').click();await frame(w);assert.equal(messages('point').length,count);
  assert.equal(JSON.stringify(anchor),original);assert.equal(root.querySelector('#profile-edit').isConnected,true);
});

test('the research panel source adaptation does not change the released helper file',()=>{
  const path=new URL('../src/server/r3-ui/review-panels.mjs',import.meta.url),before=readFileSync(path);
  const output=getResearchInspectorPanelsModule();assert.match(output,/export const installResearchReviewPanels/);assert.match(output,/return \{dispose\(\)\{dispose\(\)/);
  assert.deepEqual(readFileSync(path),before);
});

test('detailed mode binds the route, ready and anchor; returning to simple removes the optional field',async t=>{
  const h=harness(t),{w,api,send,messages}=h;await until(()=>messages('ready').length===1,w);
  assert.equal(Object.hasOwn(api.inspect().session,'mode'),false);
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'application',screen:'q1',state:'empty',variant:'email',mode:'detailed'}}));
  const detailed={...initial,screen:'q1',state:'empty',channel:'22222222-2222-4222-8222-222222222222',artifact:'d'.repeat(64),routeRevision:1};
  assert.equal(api.updateSession(detailed),false,'a simple acknowledgement cannot label a detailed route');
  assert.equal(api.updateSession({...detailed,mode:'detailed'}),true);
  await until(()=>messages('ready').length===2,w);
  assert.equal(messages('ready').at(-1).payload.mode,'detailed');assert.equal(api.inspect().session.mode,'detailed');
  const anchor=h.point();assert.equal(anchor.mode,'detailed');
  const wrong={...anchor};delete wrong.mode;
  send('pins',[{id:'wrong-mode',anchor:wrong}]);await frame(w);assert.equal(w.document.querySelector('.r3-pin'),null);
  send('pins',[{id:'detailed-point',anchor}]);await until(()=>w.document.querySelector('.r3-pin'),w);
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'application',screen:'q1',state:'empty',variant:'email',mode:'simple'}}));
  assert.equal(api.updateSession({...detailed,mode:'detailed',routeRevision:2}),false);
  assert.equal(api.updateSession({...detailed,artifact:'e'.repeat(64),channel:'33333333-3333-4333-8333-333333333333',routeRevision:2}),true);
  await until(()=>messages('ready').length===3,w);
  assert.equal(Object.hasOwn(api.inspect().session,'mode'),false);assert.equal(Object.hasOwn(messages('ready').at(-1).payload,'mode'),false);
  assert.equal(Object.hasOwn(h.point(),'mode'),false);assert.equal(api.updateSession({...initial,mode:null}),false);
});

test('pins track Web Animation geometry through completion, element resize and font settlement without a DOM mutation',async t=>{
  let top=40,finishMotion,finishFonts,resize,disconnected=false;
  const observed=new Set(),motion={playState:'running',pending:false,effect:{getComputedTiming:()=>({iterations:1})},finished:new Promise(resolve=>{finishMotion=resolve;})};
  const h=harness(t,{setup(w,root){
    root.getAnimations=()=>motion.playState==='running'?[motion]:[];
    root.querySelector('#continue').getBoundingClientRect=()=>({x:20,y:top,left:20,top,right:120,bottom:top+50,width:100,height:50});
    w.ResizeObserver=class {constructor(callback){resize=callback;}observe(el){observed.add(el);}unobserve(el){observed.delete(el);}disconnect(){disconnected=true;observed.clear();}};
    const fonts=new w.EventTarget();fonts.ready=new Promise(resolve=>{finishFonts=resolve;});Object.defineProperty(w.document,'fonts',{value:fonts});
  }}),{w,root,send}=h,anchor=h.point(),html=root.innerHTML;
  send('pins',[{id:'moving-pin',anchor}]);send('pin-view',{draft:anchor,selected:[]});
  await until(()=>w.document.querySelector('.r3-pin'),w);
  const marker=w.document.querySelector('.r3-pin');marker.focus();
  const y=()=>Number.parseFloat(w.document.querySelector('.r3-pin').style.top);
  assert.equal(y(),70);assert.ok(observed.has(root.querySelector('#continue')));
  top=47.125;await until(()=>y()===77.125,w);assert.equal(Number.parseFloat(w.document.querySelector('.approval-draft-pin').style.top),77.125);
  assert.equal(marker.isConnected,true);assert.equal(w.document.querySelector('.r3-pin'),marker);assert.equal(w.document.activeElement,marker);
  send('restore',anchor);await frame(w);assert.equal(w.document.querySelector('.r3-pin'),marker);assert.equal(marker.isConnected,true);
  top=40;motion.playState='finished';finishMotion();await until(()=>y()===70,w);
  assert.equal(root.innerHTML,html,'the app never mutated its DOM or emitted scroll/resize during the animation');
  top=52;resize([{target:root.querySelector('#continue')}]);await until(()=>y()===82,w);
  top=30;finishFonts();await until(()=>y()===60,w);
  top=35;w.document.fonts.dispatchEvent(new w.Event('loadingdone'));await until(()=>y()===65,w);
  assert.equal(w.document.querySelector('.r3-pin'),marker);assert.equal(marker.isConnected,true);
  h.api.dispose();assert.equal(disconnected,true);assert.equal(observed.size,0);assert.equal(w.document.querySelector('.r3-pin'),null);
});
