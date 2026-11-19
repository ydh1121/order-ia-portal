import assert from 'node:assert/strict';
import test from 'node:test';
import {createQuoteWait} from '../src/server/r3-quote-wait.mjs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';

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
