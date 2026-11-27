import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {createQuoteWait,mountWaitScene} from '../src/server/r3-quote-wait.mjs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

function setup() {
  const frames=[],scheduled=new Map(),players=[];
  let time=0,serial=0;
  const env=new EventTarget();env.document=new EventTarget();env.navigator={onLine:true};
  const loaded=Promise.withResolvers();
  const wait=createQuoteWait({env,now:()=>time,frame:fn=>{scheduled.set(++serial,fn);return serial;},cancelFrame:id=>scheduled.delete(id),
    paint:(phase,labels,data)=>frames.push({phase,labels:labels.map(x=>x.values[0]),...data}),
    async avatar(phase){await loaded.promise;const player={phase,time:0,destroyed:false,seek(t){this.time=t;},getState:()=>({duration:phase==='entry'?6:4}),destroy(){this.destroyed=true;}};players.push(player);return player;}});
  async function step(ms){time+=ms;const batch=[...scheduled.values()];scheduled.clear();for(const fn of batch)fn();await Promise.resolve();await Promise.resolve();}
  async function ready(){loaded.resolve();await step(0);await step(0);}
  return {frames,scheduled,wait,step,ready,env,players};
}
const groups=['A','B','C','D'].map(value=>({values:[value]}));
test('a quick real response bypasses the remaining montage and abandons pending mounts',async()=>{
  const {wait,frames,scheduled,ready,players}=setup();const quote={id:'qa-quote'};
  assert.equal(await wait.request(async()=>quote,groups),quote);await ready();
  assert.deepEqual(frames.map(f=>f.phase),['idle','entry','complete']);assert.equal(scheduled.size,0);
  assert.equal(players[0].destroyed,true);assert.equal(frames[1].requestId,frames[2].requestId);
});
test('one cursor drives the first R4 banner, then repeats beyond 3 while retaining at most 3',async()=>{
  const {wait,frames,scheduled,step,ready,players}=setup();const pending=Promise.withResolvers();
  const result=wait.request(()=>pending.promise,groups);await step(1200);assert.equal(frames.at(-1).emitted,0);
  await ready();await step(3499);assert.equal(players[0].time,3.499);assert.equal(frames.at(-1).emitted,0);
  await step(1);assert.equal(players[0].time,3.5);assert.equal(frames.at(-1).emitted,1);
  for(let i=0;i<5;i++)await step(500);
  assert.deepEqual(frames.filter(f=>f.emitted>0&&f.phase==='entry').map(f=>f.labels),[['A'],['A','B'],['A','B','C'],['B','C','D'],['C','D','A'],['D','A','B']]);
  assert.equal(frames.at(-1).phase,'comparing');await step(3000);assert.equal(frames.at(-1).phase,'delayed');
  pending.reject(new Error('failed'));await assert.rejects(result,/failed/);assert.equal(frames.at(-1).phase,'error');assert.deepEqual(frames.at(-1).labels,[]);assert.equal(scheduled.size,0);
});
test('offline aborts the old request and only the retried request can publish its result',async()=>{
  const {wait,frames,env,ready,step}=setup();const old=Promise.withResolvers(),next=Promise.withResolvers();let signal;
  const first=wait.request(s=>{signal=s;return old.promise;},groups);const oldId=wait.id;await ready();await step(3600);
  env.dispatchEvent(new Event('offline'));assert.equal(frames.at(-1).phase,'offline');assert.equal(signal.aborted,true);
  const second=wait.request(()=>next.promise,groups);const nextId=wait.id;assert.notEqual(oldId,nextId);wait.progress(oldId,'delayed');
  old.resolve({id:'old'});assert.equal(await first,null);assert.equal(frames.at(-1).phase,'entry');
  next.resolve({id:'new'});assert.equal((await second).id,'new');assert.equal(frames.at(-1).requestId,nextId);
});
test('tab pause suspends the original avatar and banner cursor without catching up',async()=>{
  const {wait,frames,ready,step,env}=setup();const pending=Promise.withResolvers();const done=wait.request(()=>pending.promise,groups);
  await ready();await step(3400);env.document.hidden=true;env.document.dispatchEvent(new Event('visibilitychange'));await step(15000);
  env.document.hidden=false;env.document.dispatchEvent(new Event('visibilitychange'));await step(99);assert.equal(frames.at(-1).emitted,0);
  await step(1);assert.equal(frames.at(-1).emitted,1);pending.resolve({id:'done'});await done;wait.destroy();
});
test('the private pricing view emits valid standalone script for the supplied animation player', () => {
  const html = renderR3PricePage('testnonce');
  const scripts = [...html.matchAll(/<script nonce="testnonce">([\s\S]+?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.ok(html.includes('id="quotePending"'));
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});

test('serialized wait adapter renders the original R4 condition glyphs and retains text-only labels while recycling cards',()=>{
  const dom=new JSDOM('<section data-wait-scene><div data-banner-stack></div><div class="mf-wait-avatar"><svg></svg></div><p class="mf-wait-message"></p></section>');
  try{
    const {document}=dom.window;dom.window.matchMedia=()=>({matches:true});
    let paint;
    // Exercise the same closure-free function serialization used by both
    // generated consumers, not a second test-only icon renderer.
    const mount=new Function('return ('+mountWaitScene.toString()+')')();
    mount(document.querySelector('section'),{},options=>{paint=options.paint;return {};});
    const original={
      egg:'M12 2C8.3 2 4 10.4 4 15a8 8 0 0016 0C20 10.4 15.7 2 12 2Z',
      quantity:'M3 4h18v5H3zM3 11h8v9H3zM13 11h8v9h-8z',
      region:'M12 2a8 8 0 00-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 00-8-8Zm0 4a4 4 0 110 8 4 4 0 010-8Z',
      delivery:'M2 5h12v10h2l2-4h4v7h-2a3 3 0 01-6 0H9a3 3 0 01-6 0H2Zm15 3h3l2 3h-6Z'
    };
    const items=Object.keys(original).map((kind,index)=>({kind,index,values:[index===0?'<img src=x onerror=alert(1)>':kind]}));
    for(let index=0;index<items.length;index++){
      paint('comparing',items.slice(Math.max(0,index-2),index+1),{requestId:1,emitted:index+1,visualMs:3500+500*index,avatarTime:0,copy:'비교 중',status:'pending'});
      const cards=[...document.querySelectorAll('.mf-banner')];assert.equal(cards.length,Math.min(index+1,3));
      assert.equal(cards[0].dataset.bannerIndex,String(index));
      for(const card of cards){
        const item=items[Number(card.dataset.bannerIndex)],icon=card.querySelector('.mf-banner-icon');
        assert.equal(icon.getAttribute('aria-hidden'),'true');assert.equal(icon.querySelector('svg').getAttribute('viewBox'),'0 0 24 24');
        assert.equal(icon.querySelector('path').getAttribute('d'),original[item.kind]);
        assert.equal(card.querySelector('.mf-banner-text').textContent,item.values[0]);
        assert.equal(card.querySelectorAll('.mf-banner-text *').length,0);
      }
    }
    paint('complete',[],{requestId:1,emitted:4,visualMs:5000,avatarTime:null,copy:'',status:'success'});
    assert.equal(document.querySelectorAll('.mf-banner').length,0);
  }finally{dom.window.close();}
});
