import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {sharedTemplates} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {mountSheetGesture} from '../scripts/r3/authored/sheet-motion.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const source=await readFile(new URL('../scripts/r3/authored/business.js',import.meta.url),'utf8');
const core=runtimes.business.slice(0,runtimes.business.indexOf('})(window);')+'})(window);'.length);

function fixture(t,state='empty',retained=''){
  const dom=new JSDOM('<!doctype html><main class="ds" id="root"></main>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://qa.invalid/'});
  const w=dom.window,root=w.document.getElementById('root'),timers=new Map(),calls=[];
  if(!('inert' in w.HTMLElement.prototype))Object.defineProperty(w.HTMLElement.prototype,'inert',{get(){return this.hasAttribute('inert');},set(value){this.toggleAttribute('inert',Boolean(value));},configurable:true});
  const NativeDate=w.Date,now=NativeDate.parse('2026-11-19T15:30:00Z');
  w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  let timerId=0;w.setTimeout=callback=>{timers.set(++timerId,callback);return timerId;};w.clearTimeout=id=>timers.delete(id);
  w.ORDER_QA_ASSETS=sharedTemplates;
  w.eval(core+'\nwindow.ORDER_QA_SHEET=('+mountSheetGesture.toString()+');\n'+source);
  const module=w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');
  root.innerHTML=module.render(state,{brand:sharedTemplates.brand});
  if(retained)root.querySelector('.opening-date output').textContent=retained;
  const api={mode:'product',reduced:()=>true,select:(...args)=>calls.push(args),toast:()=>{}};
  let dispose=module.mount(root,state,api);
  const close=()=>{dispose?.();dispose=null;};t.after(()=>{close();w.close();});
  const remount=()=>{close();root.innerHTML=module.render(state,{brand:sharedTemplates.brand});dispose=module.mount(root,state,api);return root.querySelector('.opening-wheels');};
  const panel=root.querySelector('.opening-wheels'),control=root.querySelector('.opening-date>button'),value=root.querySelector('.opening-date output');
  function choose(part,value){const option=panel.querySelector('.opening-'+part+' [data-opening-value="'+value+'"]');assert.ok(option,part+' '+value+' is available');option.click();}
  function key(target,key,extra={}){const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;}
  function pointer(target,type,y){const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);}
  return {w,root,panel,control,value,timers,calls,close,remount,choose,key,pointer,column:part=>panel.querySelector('.opening-'+part),apply:()=>panel.querySelector('[data-action="opening-date-apply"]').click(),cancel:()=>panel.querySelector('.opening-date-actions [data-action="opening-date-cancel"]').click()};
}

test('the opening date defaults to today in Korea and opens the existing three-column sheet without changing other fields',t=>{
  const f=fixture(t),name=f.root.querySelector('[name=business-name]');name.value='보존할 사업장';
  assert.equal(f.value.textContent,'2026/11/20');
  assert.equal(f.panel.querySelectorAll('select').length,0);
  f.control.click();
  assert.equal(f.panel.hidden,false);
  assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2026/11/20]');
  assert.equal(f.panel.querySelectorAll('[role=listbox]').length,3);
  assert.equal(f.w.document.activeElement,f.column('year'));
  assert.equal(f.root.querySelector('.business-page').inert,true);
  assert.equal(f.w.document.documentElement.style.overflow,'hidden');
  f.cancel();
  assert.equal(name.value,'보존할 사업장');
  assert.equal(f.w.document.activeElement,f.control);
  assert.equal(f.w.document.documentElement.style.overflow,'');
  assert.deepEqual(f.calls,[]);
});

test('the date layer and its option identities survive reopening and remounting, with a suffix only for a real document collision',t=>{
  const f=fixture(t);f.control.click();
  const id=f.panel.id,option=f.column('year').querySelector('[aria-selected=true]').id;
  f.cancel();f.control.click();
  assert.equal(f.panel.id,id);assert.equal(f.column('year').querySelector('[aria-selected=true]').id,option);
  f.cancel();f.w.QAUI.uid('unrelated-control');
  const restored=f.remount();
  assert.equal(restored.id,id);assert.equal(restored.querySelector('.opening-year [aria-selected=true]').id,option);
  f.close();f.root.replaceChildren();
  const occupied=f.w.document.createElement('div');occupied.id=id;f.w.document.body.append(occupied);
  const second=f.remount();
  assert.notEqual(second.id,id);assert.equal(f.w.document.getElementById(id),occupied);
  assert.equal(f.w.document.getElementById(second.id),second);
  assert.equal(f.root.querySelector('.opening-date>button').getAttribute('aria-controls'),second.id);
  assert.equal(f.remount().id,second.id);
});

test('only Done commits a leap-day draft, while cancel and reopening retain the last committed date',t=>{
  const f=fixture(t);let changes=0;f.value.addEventListener('change',()=>changes++);
  f.control.click();f.choose('year',2024);f.choose('month',2);f.choose('day',29);
  assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2024/02/29]');
  assert.equal(f.value.textContent,'2026/11/20');
  f.cancel();assert.equal(changes,0);
  f.control.click();assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2026/11/20]');
  f.choose('year',2024);f.choose('month',2);f.choose('day',29);f.apply();
  assert.equal(changes,1);assert.equal(f.value.textContent,'2024/02/29');
  f.control.click();assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2024/02/29]');
  f.choose('year',2023);
  assert.equal(f.column('day').querySelector('[aria-selected=true]').textContent,'28일');
  assert.equal(f.column('day').querySelector('[data-opening-value="29"]'),null);
  f.choose('year',1900);
  assert.equal(f.column('day').querySelector('[data-opening-value="29"]'),null);
  f.choose('month',4);f.choose('day',30);f.apply();
  assert.equal(f.value.textContent,'1900/04/30');assert.equal(changes,2);
});

test('year, month and day limits follow the selected year and keyboard selection cannot exceed today',t=>{
  const f=fixture(t,'filled','2024/12/31');
  assert.equal(f.value.textContent,'2024/12/31');
  f.control.click();
  f.key(f.column('year'),'End');
  assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2026/11/20]');
  assert.equal(f.column('year').querySelector('[data-opening-value="2027"]'),null);
  assert.equal(f.column('month').querySelector('[data-opening-value="12"]'),null);
  assert.equal(f.column('day').querySelector('[data-opening-value="21"]'),null);
  f.key(f.column('day'),'ArrowDown');assert.equal(f.column('day').querySelector('[aria-selected=true]').textContent,'20일');
  f.key(f.column('day'),'PageUp');assert.equal(f.column('day').querySelector('[aria-selected=true]').textContent,'15일');
  f.key(f.column('day'),'Home');f.key(f.column('day'),'ArrowUp');
  assert.equal(f.column('day').querySelector('[aria-selected=true]').textContent,'1일');
  f.apply();assert.equal(f.value.textContent,'2026/11/01');
});

test('scroll-end snaps one option and Done commits the final visible value without waiting for a delayed scroll callback',t=>{
  const f=fixture(t);f.control.click();
  const year=f.column('year');year.scrollTop=(2024-1900)*44;year.dispatchEvent(new f.w.Event('scroll'));year.dispatchEvent(new f.w.Event('scrollend'));
  const month=f.column('month');month.scrollTop=44;month.dispatchEvent(new f.w.Event('scrollend'));
  const day=f.column('day');day.scrollTop=28.2*44;day.dispatchEvent(new f.w.Event('scroll'));
  const late=[...f.timers.values()];assert.ok(late.length>0);
  f.apply();assert.equal(f.value.textContent,'2024/02/29');
  assert.equal(f.timers.size,0);
  for(const run of late)run();
  assert.equal(f.value.textContent,'2024/02/29');
  assert.equal(f.panel.hidden,true);
});

test('settling one wheel preserves another wheel that moved before its scroll callback finished',t=>{
  const f=fixture(t,'filled','2024/01/31');f.control.click();
  f.column('month').scrollTop=44;f.column('month').dispatchEvent(new f.w.Event('scroll'));
  f.column('day').scrollTop=14*44;f.column('day').dispatchEvent(new f.w.Event('scroll'));
  f.column('month').dispatchEvent(new f.w.Event('scrollend'));
  assert.equal(f.panel.querySelector('h2').textContent,'개업일 [2024/02/15]');
  assert.equal(f.value.textContent,'2024/01/31');
  f.apply();assert.equal(f.value.textContent,'2024/02/15');
});

test('Escape, backdrop dismissal and the shared sheet drag discard drafts and restore focus',t=>{
  const f=fixture(t,'filled','2020/06/15');
  const cancel=[()=>f.key(f.column('year'),'Escape'),()=>f.panel.querySelector('.opening-date-dim').click(),()=>{
    const sheet=f.panel.querySelector('.opening-date-sheet'),handle=sheet.querySelector('.drawer-handle');
    sheet.getBoundingClientRect=()=>({height:360});
    f.pointer(handle,'pointerdown',100);f.pointer(handle,'pointermove',300);f.pointer(handle,'pointerup',300);
  }];
  for(const dismiss of cancel){
    f.control.click();f.choose('year',2024);dismiss();
    assert.equal(f.panel.hidden,true);assert.equal(f.value.textContent,'2020/06/15');
    assert.equal(f.w.document.activeElement,f.control);
    assert.equal(f.root.querySelector('.business-page').inert,false);
  }
});

test('checking and verified states retain their locked form behavior',t=>{
  for(const state of ['checking','verified']){
    const f=fixture(t,state);assert.equal(f.control.disabled,true);
    f.control.click();assert.equal(f.panel.hidden,true);
    assert.ok([...f.root.querySelectorAll('.business-fields input')].every(input=>input.disabled));
    assert.equal(f.value.textContent,'2026/11/20');
  }
});

test('disposing an open date picker restores the page and ignores pending scroll work without committing',t=>{
  const f=fixture(t,'filled','2020/06/15');f.control.click();
  const year=f.column('year');year.scrollTop=(2024-1900)*44;year.dispatchEvent(new f.w.Event('scroll'));
  const late=[...f.timers.values()];f.close();
  assert.equal(f.panel.hidden,true);assert.equal(f.timers.size,0);
  assert.equal(f.root.querySelector('.business-page').inert,false);
  assert.equal(f.w.document.documentElement.style.overflow,'');
  for(const run of late)run();
  f.apply();f.control.click();
  assert.equal(f.value.textContent,'2020/06/15');assert.equal(f.panel.hidden,true);
});
