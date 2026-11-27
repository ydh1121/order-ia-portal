import {captureIntroductionMode,morphIntroductionModes,onboardingCardResizeSource} from '../src/server/product-ui/onboarding-card-resize.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mountResearchArrowMotion} from '../src/server/research-app/interaction-polish.mjs';
import {researchOnboardingSource,researchOnboardingMarkup} from '../src/server/research-app/onboarding-polish.mjs';
import {runtimes} from '../src/server/product-ui/runtime.gen.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('directional motion reaches dynamic product controls while preserving listeners and review controls',async()=>{
  const dom=new JSDOM('<main id="order-single"><button data-app-back aria-label="이전 화면">‹</button><button id="next">다음<svg><path d="M9 5l7 7-7 7"/></svg></button><div data-research-annotation><button class="obm-back">‹</button></div></main><button id="outside">외부<svg><path d="M9 5l7 7-7 7"/></svg></button>');
  const {document}=dom.window,controller=new dom.window.AbortController(),next=document.getElementById('next');let clicks=0;next.onclick=()=>clicks++;
  const dispose=mountResearchArrowMotion(document,{signal:controller.signal});
  try{
    assert.equal(document.querySelector('[data-app-back] .order-arrow-direction').dataset.direction,'left');
    assert.equal(next.querySelectorAll('.t-learn-arm').length,2);next.click();assert.equal(clicks,1);
    assert.equal(document.querySelector('[data-research-annotation] .order-arrow-direction'),null);
    assert.equal(document.querySelector('#outside .order-arrow-direction'),null);
    const menu=document.createElement('div');menu.innerHTML='<button class="obm-row">관리<span class="obm-chevron">›</span></button>';
    document.getElementById('order-single').append(menu);await settle();
    assert.equal(menu.querySelectorAll('.t-learn-arm').length,2);
    menu.append(document.createElement('span'));await settle();assert.equal(menu.querySelectorAll('.t-learn-arm').length,2,'subsequent mutations cannot nest duplicate glyphs');
    controller.abort();const stopped=document.createElement('button');stopped.className='obm-back';stopped.textContent='‹';menu.append(stopped);await settle();assert.equal(stopped.textContent,'‹');
  }finally{dispose();dom.window.close();}
});

test('live intro controls resize and keep their clickable contents through scroll, resize, and cancellation',async()=>{
  for(const ending of ['complete','abort','resize']){
    const dom=new JSDOM('<section><div><button style="border:2px solid blue;border-radius:12px"><span>간편 견적</span></button></div></section>');
    const {window:w}=dom,button=w.document.querySelector('button'),label=button.firstElementChild,animations=[];
    const box=(x,y,width,height)=>({x,y,width,height});
    button.getBoundingClientRect=()=>box(20,640,170,54);label.getBoundingClientRect=()=>box(55,655,100,24);
    const from=captureIntroductionMode(button);
    button.getBoundingClientRect=()=>box(20,300,160,160);label.getBoundingClientRect=()=>box(50,390,100,24);
    button.style.borderRadius='16px';button.prepend(w.document.createElementNS('http://www.w3.org/2000/svg','svg'));
    w.Element.prototype.animate=function(frames,options){
      let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const animation={element:this,frames,options,finished,resolve,cancel:()=>reject(Error('cancelled'))};
      animations.push(animation);return animation;
    };
    const controller=new w.AbortController();let finished=0,clicks=0;button.onclick=()=>clicks++;
    const transition=morphIntroductionModes({shell:w.document.querySelector('section'),from:[from],cards:[button],capture:captureIntroductionMode,signal:controller.signal,onFinish:()=>finished++});
    assert.deepEqual(animations.map(a=>a.element),[button,label,button.firstElementChild]);
    assert.deepEqual(animations[0].frames.map(({width,height,transform,borderRadius})=>[width,height,transform,borderRadius]),
      [['170px','54px','translate(0px,340px)','12px'],['160px','160px','translate(0px,0px)','16px']]);
    assert.deepEqual(animations[1].frames.map(f=>f.transform),['translate(0px,-22px)','translate(0px,0px)']);
    assert.deepEqual(animations[2].frames.map(f=>Number(f.opacity)),[0,1]);
    assert.equal(new Set(animations.map(a=>a.options)).size,1);
    assert.equal(button.style.visibility,'');button.click();assert.equal(clicks,1);
    w.document.dispatchEvent(new w.Event('scroll'));assert.ok(button.hasAttribute('data-mode-resizing'));
    if(ending==='resize'){w.dispatchEvent(new w.Event('resize'));assert.equal(animations.length,6);}
    if(ending==='abort')controller.abort();else for(const a of animations)a.resolve();
    await settle();transition.cancel();assert.equal(finished,ending==='abort'?0:1);
    assert.equal(button.hasAttribute('data-mode-resizing'),false);assert.equal(button.style.position,'');assert.equal(label.parentElement,button);
    dom.window.close();
  }
});

test('research onboarding adapts current behavior without mutating the frozen renderer',()=>{
  const original=runtimes.onboarding,adapted=researchOnboardingSource(original);
  assert.ok(original.includes("'<h2>사업자 정보</h2><dl>'"));
  assert.equal(researchOnboardingMarkup('<section class="ob-drawer"><h2>사업자 정보</h2><dl></dl></section>'),'<section class="ob-drawer"><dl></dl></section>');
  assert.ok(adapted.includes('restoreCompanyHeader'));assert.ok(adapted.includes('unsubscribeNotice?.()'));
  assert.ok(adapted.includes('resizeModes({shell,from:fromTray'));
  assert.ok(onboardingCardResizeSource(original).includes('r3-return-to-mode'));
  assert.ok(!adapted.includes('Promise.all(fades.map(a=>a.finished)).then(arrive'));
  assert.equal(runtimes.onboarding,original);
});
