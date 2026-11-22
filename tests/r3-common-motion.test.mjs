import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {createCommonMotion} from '../src/server/r3-common-motion.mjs';
import {createCustomerControls} from '../src/server/r3-customer-controls.mjs';
import {mountAsyncMotion} from '../src/server/r3-async-motion.mjs';
const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(html='<main></main>',reduce=false){
 const dom=new JSDOM(html,{pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:new VirtualConsole()}),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:reduce,addEventListener(){},removeEventListener(){}});
 const captures=[];
 w.HTMLElement.prototype.animate=function(frames,options){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const a={target:this,frames,options,finished,cancelled:false,cancel(){this.cancelled=true;reject(new Error('cancelled'));},finish(){resolve();}};captures.push(a);return a;};
 w.HTMLElement.prototype.getBoundingClientRect=function(){const left=Number(this.dataset.left)||0,top=Number(this.dataset.top)||0,width=Number(this.dataset.width)||160,height=Number(this.dataset.height)||44;return {left,top,width,height,right:left+width,bottom:top+height};};
 w.Range.prototype.getClientRects=function(){const el=this.startContainer.nodeType===3?this.startContainer.parentElement:this.startContainer;return [el.getBoundingClientRect()];};
 const common=createCommonMotion(w);return {w,d,common,captures,close(){common.destroy();w.close();}};
}

test('skeleton bars follow the actual text rectangles and remeasure replaced response content',async()=>{
 const f=fixture('<main id="region" data-left="20" data-top="30"><h2 data-left="36" data-top="50" data-width="114" data-height="22">실제 제목</h2><p data-left="36" data-top="88" data-width="231" data-height="18">현재 콘텐츠의 두 번째 줄</p></main>');
 try{
  const region=f.d.querySelector('main'),skeleton=f.common.skeleton(region),bars=[...skeleton.layer.children];
  assert.deepEqual(bars.map(b=>[b.style.left,b.style.top,b.style.width,b.style.height]),[['16px','20px','114px','22px'],['16px','58px','231px','18px']]);
  assert.equal(region.inert,true);region.innerHTML='<p data-left="42" data-top="70" data-width="89" data-height="20">응답된 새 내용</p>';await tick();
  assert.equal(skeleton.layer.parentNode,region);assert.equal(skeleton.layer.children.length,1);assert.equal(skeleton.layer.firstChild.style.width,'89px');
  skeleton.finish('success');assert.equal(region.dataset.r3Skeleton,'reveal');assert.equal(region.inert,undefined);
  skeleton.destroy();assert.equal(region.hasAttribute('data-r3-skeleton'),false);assert.equal(region.textContent,'응답된 새 내용');
 }finally{f.close();}
});

test('request rejection removes the skeleton and leaves the original data and retry state intact',async()=>{
 const f=fixture('<main><button>저장</button><section><p>보존할 입력과 내역</p></section></main>');
 try{
  const button=f.d.querySelector('button'),region=f.d.querySelector('section'),motion=mountAsyncMotion(f.d);let reject;
  const request=motion.run(button,()=>new Promise((_,fail)=>reject=fail),{region});await tick();assert.equal(region.dataset.r3Skeleton,'pending');
  reject(new Error('OFFLINE'));await assert.rejects(request,/OFFLINE/);assert.equal(region.dataset.asyncRegion,'error');assert.equal(region.querySelector('.r3-geometry-skeleton'),null);assert.equal(region.textContent,'보존할 입력과 내역');
  motion.destroy();assert.equal(button.textContent,'저장');
 }finally{f.close();}
});

test('a reversed resize starts at the painted height and cancels the superseded completion',async()=>{
 const f=fixture('<section data-height="100"></section>');
 try{const el=f.d.querySelector('section');let ended=0;f.common.resize(el,{height:300},{complete:()=>ended++});const first=f.captures.at(-1);el.dataset.height='173';f.common.resize(el,{height:100},{complete:()=>ended++});const second=f.captures.at(-1);assert.equal(second.frames[0].height,'173px');assert.equal(second.frames[1].height,'100px');first.finish();await tick();assert.equal(ended,0);second.finish();await tick();assert.equal(ended,1);assert.equal(el.style.transition,'');}finally{f.close();}
});

test('per-grapheme input motion preserves native selection and IME while masking password text',async()=>{
 const f=fixture('<input value="가"><input type="password">');
 try{
  const [input,password]=f.d.querySelectorAll('input');input.focus();input.setSelectionRange(1,1);
  input.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true}));input.value='가나';input.setSelectionRange(2,2);input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,isComposing:true}));await tick();assert.equal(f.captures.length,0);
  input.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true,data:'나'}));input.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true,inputType:'insertCompositionText'}));input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:'insertCompositionText'}));await tick();
  assert.equal(input.value,'가나');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,2);assert.ok(f.captures.some(a=>a.target.textContent==='나'&&a.frames[0].opacity===0));assert.equal(f.captures.some(a=>a.target===input),false);
  input.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true,inputType:'deleteContentBackward'}));input.value='가';input.setSelectionRange(1,1);input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));await tick();assert.ok(f.captures.some(a=>a.target.textContent==='나'&&a.frames.at(-1).opacity===0));assert.equal(input.selectionStart,1);
  password.focus();password.value='secret한글';password.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));await tick();assert.equal(password.value,'secret한글');assert.equal(f.d.querySelector('.r3-input-mirror').textContent,'••••••••');assert.equal(f.d.body.textContent.includes('secret'),false);
 }finally{f.close();}
});

test('continuous typing and middle edits retain live glyphs and do not restart their entrances',async()=>{
 const f=fixture('<form><input name="query" style="-webkit-text-fill-color:navy;caret-color:teal"></form>');
 try{
  Object.defineProperty(f.w.HTMLElement.prototype,'offsetLeft',{configurable:true,get(){return this.parentElement?.classList.contains('r3-input-glyphs')?Math.max(0,[...this.parentElement.children].filter(el=>el.tagName==='SPAN'&&!el.hasAttribute('data-input-exit')).indexOf(this))*10:0;}});
  Object.defineProperty(f.w.HTMLElement.prototype,'offsetWidth',{configurable:true,get(){return this.parentElement?.classList.contains('r3-input-glyphs')?10:160;}});
  let now=0,sequence=0;const frames=new Map();f.w.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};f.w.cancelAnimationFrame=id=>frames.delete(id);
  const step=()=>{now+=16;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));};
  const input=f.d.querySelector('input');input.focus();
  const edit=async(value,position,type='insertText')=>{input.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true,inputType:type}));input.value=value;input.setSelectionRange(position,position);input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:type}));await tick();};
  await edit('a',1);const layer=f.d.querySelector('.r3-input-mirror'),a=layer.querySelector('.r3-input-glyphs>span'),first=f.captures.find(item=>item.target===a);
  await edit('ab',2);const b=[...layer.querySelectorAll('.r3-input-glyphs>span')][1],second=f.captures.find(item=>item.target===b);
  assert.equal(f.d.querySelector('.r3-input-mirror'),layer);assert.equal(layer.querySelector('.r3-input-glyphs>span'),a);assert.equal(first.cancelled,false);assert.equal(f.captures.filter(item=>item.target===a).length,1);
  input.setSelectionRange(1,1);await edit('aZb',2);
  assert.equal([...layer.querySelectorAll('.r3-input-glyphs>span')].at(-1),b);assert.equal(second.cancelled,false);
  assert.ok(f.captures.some(item=>item.target===b&&item.frames[0].translate==='-10px 0px'),'the retained suffix moves from its previous position');
  const inserted=[...layer.querySelectorAll('.r3-input-glyphs>span')][1];await edit('ab',1,'deleteContentBackward');
  assert.equal(inserted.isConnected,true);assert.equal(inserted.hasAttribute('data-input-exit'),true);assert.ok(f.captures.some(item=>item.target===inserted&&item.frames.at(-1).opacity===0));assert.equal(second.cancelled,false);
  assert.equal(input.value,'ab');assert.equal(new f.w.FormData(f.d.querySelector('form')).get('query'),'ab');assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,1);assert.equal(f.d.activeElement,input);
  step();assert.ok(parseFloat(layer.querySelector('.r3-input-caret').style.width)>2,'the caret stretches while travelling');
  for(const item of f.captures)item.finish();await tick();for(let i=0;i<200&&frames.size;i++)step();
  assert.equal(frames.size,0);assert.equal(f.d.querySelector('.r3-input-mirror'),null);assert.equal(input.style.webkitTextFillColor,'navy');assert.equal(input.style.caretColor,'teal');assert.equal(input.value,'ab');assert.equal(input.selectionStart,1);
 }finally{f.close();}
});

test('paste is grapheme based and native selection, password hiding and removal release the mirror',async()=>{
 const f=fixture('<form><label class="field"><input name="password" type="text"><button type="button" data-action="password-visibility">숨기기</button></label><input type="email"></form>');
 try{
  const [input,email]=f.d.querySelectorAll('input');input.focus();input.value='가👨‍👩‍👧‍👦e\u0301';input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));await tick();
  const glyphs=[...f.d.querySelectorAll('.r3-input-glyphs>span')];assert.deepEqual(glyphs.map(el=>el.textContent),['가','👨‍👩‍👧‍👦','e\u0301']);assert.deepEqual(f.captures.filter(item=>glyphs.includes(item.target)).map(item=>item.options.delay),[0,18,36]);
  input.setSelectionRange(1,input.value.length,'backward');input.dispatchEvent(new f.w.Event('select',{bubbles:true}));
  assert.equal(f.d.querySelector('.r3-input-mirror'),null);assert.equal(input.selectionDirection,'backward');assert.equal(input.selectionStart,1);assert.equal(input.value,'가👨‍👩‍👧‍👦e\u0301');
  input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true}));input.value+='x';input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));await tick();
  assert.ok(f.d.querySelector('.r3-input-mirror'));f.d.querySelector('button').addEventListener('click',()=>{input.type='password';});f.d.querySelector('button').click();
  assert.equal(f.d.querySelector('.r3-input-mirror'),null,'capture cleanup precedes the password visibility change');assert.equal(input.type,'password');assert.equal(input.value,'가👨‍👩‍👧‍👦e\u0301x');
  email.focus();email.value='a@example.com';email.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));await tick();
  assert.equal(email.type,'email');assert.equal(email.selectionStart,null);assert.ok(f.d.querySelector('.r3-input-mirror'));assert.equal(f.d.querySelector('.r3-input-caret'),null,'unsupported selection offsets keep the native email caret');
  f.d.querySelector('form').remove();await tick();assert.equal(f.d.querySelector('.r3-input-mirror'),null);assert.equal(email.style.webkitTextFillColor,'');
 }finally{f.close();}
});

test('field messages interrupt glyph paint and reduced motion keeps native text without an overlay',async()=>{
 const f=fixture('<label class="field"><input value="saved"></label>');
 try{
  const input=f.d.querySelector('input');input.focus();input.dispatchEvent(new f.w.InputEvent('beforeinput',{bubbles:true}));input.value='saved!';input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));await tick();assert.ok(f.d.querySelector('.r3-input-mirror'));
  input.closest('.field').classList.add('shows-message');await tick();assert.equal(f.d.querySelector('.r3-input-mirror'),null);assert.equal(input.value,'saved!');assert.equal(f.d.activeElement,input);assert.equal(input.style.webkitTextFillColor,'');
 }finally{f.close();}
 const quiet=fixture('<input>',true);
 try{const input=quiet.d.querySelector('input');input.focus();input.value='한글';input.setSelectionRange(1,1);input.dispatchEvent(new quiet.w.InputEvent('input',{bubbles:true}));await tick();assert.equal(quiet.captures.length,0);assert.equal(quiet.d.querySelector('.r3-input-mirror'),null);assert.equal(input.value,'한글');assert.equal(input.selectionStart,1);}finally{quiet.close();}
});

test('dropdown exit remains mounted until completion and a rapid reopen defeats its old cleanup',async()=>{
 const f=fixture('<input><div hidden style="--dropdown-close-dur:12ms"><button>선택</button></div>');
 try{const trigger=f.d.querySelector('input'),menu=f.d.querySelector('div'),drop=f.common.dropdown(menu,{trigger});drop.set(true);drop.set(false);assert.equal(menu.hidden,false);assert.equal(menu.inert,true);assert.equal(menu.classList.contains('is-closing'),true);drop.set(true);await new Promise(r=>setTimeout(r,20));assert.equal(menu.hidden,false);assert.equal(menu.inert,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');drop.set(false);await new Promise(r=>setTimeout(r,20));assert.equal(menu.hidden,true);}finally{f.close();}
});

test('native-select fallback opens with keyboard focus on live options and keeps the native form value',async()=>{
 const f=fixture('<form><label>항목<select name="item"><option value="a">Apple</option><option value="b" disabled>Banana</option><option value="c">Cherry</option></select></label></form>',true);
 try{const select=f.d.querySelector('select'),trigger=f.d.querySelector('[role=combobox]');let changes=0;select.addEventListener('change',()=>changes++);trigger.focus();trigger.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(f.d.activeElement.textContent,'Cherry');assert.equal(f.d.activeElement.isConnected,true);f.d.activeElement.click();assert.equal(select.value,'c');assert.equal(new f.w.FormData(f.d.querySelector('form')).get('item'),'c');assert.equal(changes,1);assert.equal(f.d.activeElement,trigger);trigger.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'a',bubbles:true}));assert.equal(f.d.activeElement.textContent,'Apple');assert.equal(f.d.activeElement.isConnected,true);f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.activeElement,trigger);assert.equal(select.value,'c');}finally{f.close();}
});

test('tag removal collapses its occupied width before removal and retains neighboring DOM identity',async()=>{
 const f=fixture('<div id="tags"><button data-width="87">특란</button><button>샘플매장</button></div>');
 try{const list=f.d.querySelector('#tags'),removed=list.firstChild,neighbor=list.lastChild;const result=f.common.tagRemove(removed);assert.equal(removed.isConnected,true);assert.equal(removed.inert,true);const a=f.captures.at(-1);assert.equal(a.frames[0].width,'87px');assert.equal(a.frames.at(-1).width,'0px');a.finish();await result;assert.equal(removed.isConnected,false);assert.equal(list.firstChild,neighbor);}finally{f.close();}
});

test('persisted switch awaits its save, rejects duplicate clicks, rolls back failure and then retries',async()=>{
 const f=fixture('<button>알림 수신</button>');
 try{const button=f.d.querySelector('button');let calls=0,fail,pass,saved=false,errors=0;const toggle=f.common.persistedSwitch(button,{save:value=>{calls++;return new Promise((resolve,reject)=>{fail=reject;pass=()=>{saved=value;resolve({ok:true});};});},onError:()=>errors++});
  const first=toggle.commit(true);button.click();assert.equal(calls,1);assert.equal(button.getAttribute('aria-checked'),'true');assert.equal(saved,false);fail(new Error('OFFLINE'));assert.equal(await first,false);assert.equal(toggle.value,false);assert.equal(button.getAttribute('aria-checked'),'false');assert.equal(errors,1);assert.equal(button.hasAttribute('aria-busy'),false);
  const retry=toggle.commit(true);pass();assert.equal(await retry,true);assert.equal(saved,true);assert.equal(toggle.value,true);assert.equal(calls,2);
 }finally{f.close();}
});

test('wheel uses bounded resistance, drum transforms, momentum settle and disabled option limits',()=>{
 const f=fixture('<div role="listbox">'+Array.from({length:6},(_,i)=>'<button role="option" data-value="'+i+'">'+i+'</button>').join('')+'</div>');
 try{
  let time=0,id=0;const frames=new Map();f.w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};f.w.cancelAnimationFrame=i=>frames.delete(i);
  const flush=()=>{for(let count=0;frames.size&&count<400;count++){time+=16;const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn(time));}assert.equal(frames.size,0);};
  const column=f.d.querySelector('div');let value;const wheel=f.common.wheel(column,{value:0,onChange:v=>value=v});
  function pointer(type,y,t){const e=new f.w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientY:y});Object.defineProperty(e,'timeStamp',{value:t});column.dispatchEvent(e);}
  pointer('pointerdown',100,0);pointer('pointermove',220,20);assert.ok(wheel.position()<0&&wheel.position()>-1.2);pointer('pointerup',220,30);flush();assert.equal(wheel.value(),'0');
  pointer('pointerdown',220,100);pointer('pointermove',180,120);pointer('pointermove',100,150);pointer('pointerup',100,160);flush();assert.equal(wheel.value(),'5');assert.equal(value,'5');assert.equal(column.querySelectorAll('[aria-selected=true]').length,1);assert.match(column.firstChild.style.transform,/rotateX\(/);
  column.lastChild.disabled=true;wheel.refresh();wheel.settle(90);flush();assert.equal(wheel.value(),'4');assert.equal(column.querySelectorAll('[aria-selected=true]').length,1);assert.equal(column.lastChild.getAttribute('aria-selected'),'false');column.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));flush();assert.equal(wheel.value(),'0');wheel.destroy();column.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));flush();assert.equal(wheel.value(),'0');
 }finally{f.close();}
});

test('bottom panel preserves its native form and restores background, scroll and trigger focus',async()=>{
 const f=fixture('<button id="trigger">상담</button><main id="background">견적</main><section aria-label="상담 예약" hidden><input value="기존 상담 내용"><button>저장</button></section>');
 try{const trigger=f.d.querySelector('#trigger'),panel=f.d.querySelector('section'),input=panel.querySelector('input');trigger.focus();const controller=new f.w.AbortController(),drawer=f.common.bottomPanel(panel,{trigger,signal:controller.signal});drawer.set(true);assert.equal(panel.hidden,false);assert.equal(f.d.activeElement,input);assert.equal(f.d.querySelector('#background').inert,true);f.captures.at(-1).finish();await tick();
  drawer.set(false);const leaving=f.captures.at(-1);drawer.set(true);leaving.finish();await tick();assert.equal(panel.hidden,false);assert.equal(panel.querySelector('input'),input);assert.equal(input.value,'기존 상담 내용');f.captures.at(-1).finish();await tick();
  panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));f.captures.at(-1).finish();await tick();assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);assert.equal(f.d.documentElement.style.overflow,'');assert.equal(f.d.querySelector('#background').inert,undefined);controller.abort();assert.equal(panel.classList.contains('r3-bottom-panel'),false);
 }finally{f.close();}
});

test('a backdrop holds zero until its longer sheet exit and reverses from the painted opacity',async()=>{
 const f=fixture('<div id="dim" style="opacity:1;transition:opacity 90ms"></div>');
 try{
  const dim=f.d.querySelector('#dim'),shade=f.common.backdrop(dim),nativeStyle=f.w.getComputedStyle.bind(f.w);let painted=null;
  f.w.getComputedStyle=el=>{const value=nativeStyle(el);if(el===dim&&painted!==null)return new Proxy(value,{get(target,key){return key==='opacity'?String(painted):Reflect.get(target,key);}});return value;};
  shade.set(false,{duration:280});const closing=f.captures.at(-1);
  assert.equal(dim.style.opacity,'0','the nonanimated backing style must already retain the fade destination');
  closing.finish();await tick();
  assert.equal(dim.hidden,false,'the sheet owns when the scrim leaves the document');
  assert.equal(f.w.getComputedStyle(dim).opacity,'0','there is no opaque tail during the remaining sheet exit');
  shade.set(true,{duration:400});painted=.43;shade.set(false,{duration:280});
  const reversed=f.captures.at(-1);assert.equal(reversed.frames[0].opacity,.43);assert.equal(reversed.frames.at(-1).opacity,0);
  assert.equal(f.common.backdrop(dim),shade,'reusing a dim cannot create a second opacity owner');
  painted=null;reversed.finish();await tick();shade.hide();assert.equal(dim.hidden,true);
  shade.destroy();assert.equal(dim.style.opacity,'1');assert.equal(dim.style.transition,'opacity 90ms');
 }finally{f.close();}
});

test('reservation wheel enhances the existing select and preserves its original form payload',async()=>{
 const f=fixture('<form><label>일<select name="reserve-day" class="pw-wheel" size="5"><option value="28">28일</option><option value="29" selected>29일</option><option value="30">30일</option></select></label></form>',true);
 try{const select=f.d.querySelector('select'),column=f.d.querySelector('.r3-native-wheel');assert.ok(column);assert.equal(new f.w.FormData(f.d.querySelector('form')).get('reserve-day'),'29');column.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(select.value,'30');assert.equal(new f.w.FormData(f.d.querySelector('form')).get('reserve-day'),'30');select.innerHTML='<option value="28" selected>28일</option>';await tick();assert.equal(column.querySelectorAll('[role=option]').length,1);assert.equal(column.getAttribute('aria-activedescendant'),column.firstChild.id);assert.equal(new f.w.FormData(f.d.querySelector('form')).get('reserve-day'),'28');}finally{f.close();}
});

test('deck FLIP retains the same cards and interrupts from their current painted rectangles',async()=>{
 const f=fixture('<div id="stage"><article data-left="10" data-top="30" data-width="140" data-height="180"></article><article data-left="170" data-top="30" data-width="140" data-height="180"></article></div>');
 try{f.w.eval('window.controls=('+createCustomerControls.toString()+')()');const stage=f.d.querySelector('#stage'),cards=[...stage.children],ctl=new f.w.AbortController(),layout=f.w.controls.deckLayout(stage,{signal:ctl.signal});layout.update(()=>cards.forEach((card,i)=>{card.dataset.left=String(10+i*3);card.dataset.top=String(30+i*8);card.dataset.width='300';}));assert.deepEqual([...stage.children],cards);assert.equal(f.captures.length,2);assert.equal(f.captures[0].frames[0].scale,'0.4666666666666667 1');cards[0].dataset.left='40';layout.update(()=>{cards[0].dataset.left='10';cards[0].dataset.width='140';});assert.equal(f.captures.at(-2).frames[0].translate,'30px 0px');ctl.abort();assert.equal(stage.hasAttribute('data-r3-flip-active'),false);assert.equal(cards[0].style.transition,'');}finally{f.close();}
});

test('deck staggering follows the newly sorted dates, caps the total wait and skips motion when reduced',()=>{
 const html='<div id="stage">'+Array.from({length:12},(_,i)=>'<article data-date="2026-11-'+String(i+1).padStart(2,'0')+'" data-left="'+i*10+'" data-width="140" data-height="180"></article>').join('')+'</div>';
 for(const reduce of [false,true]){
  const f=fixture(html,reduce);
  try{
   f.w.eval('window.controls=('+createCustomerControls.toString()+')()');
   const stage=f.d.querySelector('#stage'),cards=[...stage.children],sorted=[...cards].sort((a,b)=>b.dataset.date.localeCompare(a.dataset.date)),layout=f.w.controls.deckLayout(stage);
   layout.update(()=>{stage.append(...sorted);sorted.forEach((card,i)=>{card.dataset.left=String(i*3);card.dataset.width='300';});});
   assert.deepEqual([...stage.children],sorted,'motion must not undo the product date order');
   if(reduce){assert.equal(f.captures.length,0);assert.equal(stage.hasAttribute('data-r3-flip-active'),false);}
   else{
    assert.deepEqual(f.captures.map(a=>a.target),sorted);
    const delays=f.captures.map(a=>a.options.delay);assert.equal(delays[0],0);assert.ok(delays.at(-1)<=180);
    assert.ok(delays.every((delay,i)=>i===0||delay>delays[i-1]),'every date must start after its predecessor, including a long list');
    assert.ok(f.captures.every(a=>a.options.fill==='both'),'each delayed card holds its captured painted frame');
   }
   layout.cancel();assert.ok(cards.every(card=>card.style.transition===''&&card.style.scale===''&&card.style.translate===''));
  }finally{f.close();}
 }
});
