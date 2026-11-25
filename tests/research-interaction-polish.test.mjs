import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mountResearchArrowMotion} from '../src/server/research-app/interaction-polish.mjs';
import {morphIntroductionModes,researchOnboardingSource,researchOnboardingMarkup} from '../src/server/research-app/onboarding-polish.mjs';
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

test('intro card morph uses one clock, unscaled labels and restores real controls on completion or interruption',async()=>{
  for(const cancel of [false,true]){
    const dom=new JSDOM('<section><button style="border-radius:16px;background:blue;color:white;font:700 17px Arial"><span>상세 견적</span></button></section>'),{document}=dom.window;
    const shell=document.querySelector('section'),button=document.querySelector('button'),label=button.querySelector('span'),animations=[];
    shell.style.transform='translateX(20px)';
    const originalVisibility=cancel?'visible':'';button.style.visibility=originalVisibility;
    const start={x:180,y:620,width:180,height:54,radius:'12px',label:'상세 견적'};
    button.getBoundingClientRect=()=>({x:200,y:300,width:160,height:160});label.getBoundingClientRect=()=>({x:240,y:390,width:80,height:24});
    dom.window.Element.prototype.animate=function(frames,options){let resolve,reject;const finished=new Promise((done,fail)=>{resolve=done;reject=fail;}),animation={finished,cancelCount:0,cancel(){this.cancelCount++;reject(new Error('cancelled'));},resolve,frames,options,element:this};animations.push(animation);return animation;};
    let completed=0,clicks=0;button.addEventListener('click',()=>clicks++);const controller=new dom.window.AbortController();
    const transition=morphIntroductionModes({shell,from:[start],cards:[button],signal:controller.signal,onFinish:()=>completed++});
    assert.equal(button.style.visibility,'hidden');assert.equal(animations.length,2);
    assert.equal(new Set(animations.map(value=>JSON.stringify(value.options))).size,1);
    const layer=document.querySelector('.research-mode-transition'),surface=animations[0].element,background=animations[0].frames,text=animations[1].frames;
    assert.equal(layer.parentElement,document.body,'viewport coordinates must escape the transformed introduction scene');
    assert.equal(layer.style.position,'fixed');assert.equal(layer.style.pointerEvents,'none');
    assert.equal(surface.style.width,'160px');assert.equal(surface.style.height,'160px');
    assert.equal(surface.style.transformOrigin,'0 0');
    assert.ok(background.every(frame=>!['width','height','left','top'].some(key=>key in frame)),'the moving surface keeps fixed layout dimensions');
    const visualBounds=frame=>{
      const match=/^translate\((-?[\d.]+)(?:px)?,(-?[\d.]+)(?:px)?\) scale\(([\d.]+),([\d.]+)\)$/.exec(frame.transform);
      assert.ok(match,'surface motion must describe translation and independent scale');
      const [,x,y,scaleX,scaleY]=match.map(Number);
      return {x:parseFloat(surface.style.left)+x,y:parseFloat(surface.style.top)+y,width:parseFloat(surface.style.width)*scaleX,height:parseFloat(surface.style.height)*scaleY};
    };
    assert.deepEqual(visualBounds(background[0]),{x:start.x,y:start.y,width:start.width,height:start.height});
    assert.deepEqual(visualBounds(background.at(-1)),button.getBoundingClientRect());
    assert.ok(text.every(frame=>!frame.transform.includes('scale')),'text must not stretch with a changing surface aspect ratio');
    assert.equal(animations[1].element.parentElement,layer,'the label must not inherit the scaled surface transform');
    assert.equal(animations[1].element.textContent,label.textContent);
    assert.equal(text[0].transform,'translate(270px,647px)');assert.equal(text.at(-1).transform,'translate(280px,402px)');
    if(cancel)controller.abort();else for(const animation of animations)animation.resolve();
    await settle();assert.equal(button.style.visibility,originalVisibility);assert.equal(document.querySelector('.research-mode-transition'),null);assert.equal(completed,cancel?0:1);
    assert.equal(button.querySelector('span'),label);button.click();assert.equal(clicks,1,'the original interactive control survives the transition');
    transition.cancel();await settle();assert.equal(completed,cancel?0:1);assert.ok(animations.every(animation=>animation.cancelCount===1),'cleanup is idempotent');dom.window.close();
  }
});

test('research onboarding adapts current behavior without mutating the frozen renderer',()=>{
  const original=runtimes.onboarding,adapted=researchOnboardingSource(original);
  assert.ok(original.includes("'<h2>사업자 정보</h2><dl>'"));
  assert.equal(researchOnboardingMarkup('<section class="ob-drawer"><h2>사업자 정보</h2><dl></dl></section>'),'<section class="ob-drawer"><dl></dl></section>');
  assert.ok(adapted.includes('restoreCompanyHeader'));assert.ok(adapted.includes('unsubscribeNotice?.()'));
  assert.ok(adapted.includes('researchMorphModes({shell,from:fromTray'));
  assert.ok(!adapted.includes('Promise.all(fades.map(a=>a.finished)).then(arrive'));
  assert.equal(runtimes.onboarding,original);
});
