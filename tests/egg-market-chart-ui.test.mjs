import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {openEggMarketChart} from '../src/server/product-ui/egg-market-chart.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

const response = {
  today:'2026-11-27',firstDate:'2025-12-01',shell:'3',grade:'xl',unit:'원/30구',
  shells:[{id:'2',name:'난각 2번'},{id:'3',name:'난각 3번'}],
  grades:[{id:'xl',name:'특란'},{id:'l',name:'대란'}],
  points:[
    {date:'2026-11-22',price:6700},{date:'2026-11-23',price:6700},{date:'2026-11-24',price:null},
    {date:'2026-11-25',price:6000},{date:'2026-11-26',price:6700},{date:'2026-11-27',price:6000}
  ],
  low:{price:6000,periods:[{start:'2026-11-25',end:'2026-11-25'},{start:'2026-11-27',end:null}]},
  high:{price:6700,periods:[{start:'2026-11-22',end:'2026-11-23'},{start:'2026-11-26',end:'2026-11-26'}]}
};

function setup(t,readChart){
  const dom=new JSDOM('<main><button>계란 시세</button></main>',{pretendToBeVisual:true});
  const win=dom.window,doc=win.document,root=doc.querySelector('main'),trigger=root.querySelector('button');
  const dialogProto=win.HTMLDialogElement.prototype;
  dialogProto.showModal=function(){this.open=true;}; dialogProto.close=function(){this.open=false;};
  const owner=new win.AbortController(), alerts=[];
  const open=()=>openEggMarketChart({root,trigger,readChart,onNotifications:()=>alerts.push(true),signal:owner.signal});
  open();t.after(()=>{owner.abort();win.close();});
  const $=selector=>root.querySelector(selector);
  const select=(field,value)=>{const input=$('select[data-filter="'+field+'"]');input.value=value;input.dispatchEvent(new win.Event('change'));};
  return {root,owner,alerts,open,$,select,win};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('the chart reads one saved series, preserves discontinuities and exposes every tied interval',async t=>{
  const requests=[],f=setup(t,async query=>{requests.push(query);return response;});await settle();
  assert.deepEqual(requests,[{}]);assert.equal(f.$('[data-price]').textContent,'6,000');
  assert.equal(f.root.querySelectorAll('svg path[stroke="#315DDE"]').length,2,'no line bridges a missing effective rate');
  assert.equal(f.root.querySelectorAll('.mk-ranges details').length,2);
  assert.match(f.$('[data-extremes]').textContent,/11\.27부터현재/);
  const plot=f.$('[data-plot]');
  plot.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  plot.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));
  assert.match(plot.getAttribute('aria-valuetext'),/2026\.11\.22 – 2026\.11\.23/);
  f.select('year','2025');await settle();
  assert.deepEqual(requests.at(-1),{shell:'3',grade:'xl',from:'2025-01-01',to:'2025-12-31'});
  f.select('year','2026');await settle();f.select('month','11');await settle();f.select('day','5');await settle();
  assert.deepEqual(requests.at(-1),{shell:'3',grade:'xl',from:'2026-11-05',to:'2026-11-05'});
  f.$('[data-inbox]').click();assert.equal(f.$('dialog'),null);assert.deepEqual(f.alerts,[true]);
});

test('previous filter requests and closed dialogs cannot paint late chart reads; empty history stays empty',async t=>{
  const pending=[];
  const f=setup(t,(query,{signal})=>new Promise(resolve=>pending.push({query,signal,resolve})));
  pending[0].resolve(response);await settle();f.select('grade','l');f.select('shell','2');
  assert.equal(pending[1].signal.aborted,true);
  pending[2].resolve({...response,shell:'2',grade:'l',points:[],low:null,high:null});await settle();
  pending[1].resolve(response);await settle();assert.equal(f.$('[data-result]').hidden,true);
  assert.match(f.$('[data-status]').textContent,/등록된 단가가 없어요/);
  f.select('shell','3');f.owner.abort();assert.equal(pending[3].signal.aborted,true);
  pending[3].resolve(response);await settle();assert.equal(f.$('dialog'),null);
});
