import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountMagneticAction} from '../src/server/order-engine/browser/magnetic-action.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

test('hover holds the button material still, press compresses one border, and the native action fires once',()=>{
  const dom=new JSDOM('<button style="border:1px solid rgb(20, 40, 60);background:rgb(245, 245, 245)"><span>상세 견적</span></button>',{pretendToBeVisual:true});
  const w=dom.window,button=w.document.querySelector('button'),child=button.firstChild;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  button.getBoundingClientRect=()=>({left:20,top:20,width:160,height:160});
  let clicks=0;button.addEventListener('click',()=>clicks++);
  const control=mountMagneticAction(button),material=button.querySelector('[data-magnetic-material]'),label=button.querySelector('[data-magnetic-label]');
  const pointer=(type,x,y)=>{const event=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true});Object.defineProperty(event,'pointerType',{value:'mouse'});button.dispatchEvent(event);};
  pointer('pointermove',170,50);
  assert.equal(material.style.transform,'');assert.notEqual(label.style.transform,'');
  assert.equal(button.style.borderColor,'transparent');assert.equal(material.style.borderTopColor,'rgb(20, 40, 60)');
  pointer('pointerdown',170,50);assert.equal(material.style.transform,'scale(.98)');
  pointer('pointerup',170,50);button.click();assert.equal(clicks,1);assert.equal(material.style.transform,'');
  pointer('pointermove',45,50);pointer('pointercancel',45,50);assert.equal(label.style.transform,'');
  control.destroy();assert.equal(button.firstChild,child);assert.equal(button.style.borderColor,'rgb(20, 40, 60)');
  assert.equal(button.querySelector('[data-magnetic-material]'),null);dom.window.close();
});

test('reduced motion leaves the content and material stationary without disabling the control',()=>{
  const dom=new JSDOM('<button>간편 견적</button>');const w=dom.window,button=w.document.querySelector('button');
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  const control=mountMagneticAction(button);
  button.dispatchEvent(new w.MouseEvent('pointermove',{clientX:100,clientY:80}));
  button.dispatchEvent(new w.MouseEvent('pointerdown',{button:0}));
  assert.equal(button.dataset.magneticAction,'rest');assert.equal(button.disabled,false);
  assert.equal(button.querySelector('[data-magnetic-material]').style.transform,'');control.destroy();dom.window.close();
});
