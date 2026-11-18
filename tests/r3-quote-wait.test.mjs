import assert from 'node:assert/strict';
import test from 'node:test';
import {createQuoteWait} from '../src/server/r3-quote-wait.mjs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';

function setup() {
  const frames = [];
  const timers = new Map();
  const wait = createQuoteWait({
    paint: (phase, labels) => frames.push({phase, labels}),
    schedule: (fn, time) => { timers.set(time, fn); return time; },
    unschedule: time => timers.delete(time)
  });
  return {frames, timers, wait};
}
test('a quick issuance finishes immediately and cancels all scheduled banners', async () => {
  const {wait, frames, timers} = setup();
  const quote = {id: 'qa-quote'};
  assert.equal(await wait.request(async () => quote, ['A', 'B']), quote);
  assert.equal(timers.size, 0);
  assert.deepEqual(frames.map(f => f.phase), ['idle', 'entry', 'complete']);
});
test('after the entry motion, banners arrive at half-second intervals with only three visible', async () => {
  const {wait, frames, timers} = setup();
  const pending = Promise.withResolvers();
  const result = wait.request(() => pending.promise, ['A', 'B', 'C', 'D']);
  assert.deepEqual([...timers.keys()], [3500, 4000, 4500, 5000]);
  for (const fn of timers.values()) fn();
  assert.deepEqual(frames.slice(-4).map(f => f.labels), [['A'], ['A','B'], ['A','B','C'], ['B','C','D']]);
  pending.reject(new Error('offline'));
  await assert.rejects(result, /offline/);
  assert.equal(frames.at(-1).phase, 'error');
  assert.equal(timers.size, 0);
});
test('discarded input or a network loss prevents a late quote from appearing', async () => {
  const {wait, frames, timers} = setup();
  const pending = Promise.withResolvers();
  let activeSignal;
  const result = wait.request(signal => { activeSignal = signal; return pending.promise; }, ['A']);
  wait.stop('error');
  assert.equal(activeSignal.aborted, true);
  pending.resolve({id:'old'});
  assert.equal(await result, null);
  assert.equal(frames.at(-1).phase, 'error');
  assert.equal(timers.size, 0);
});
test('the private pricing view emits valid standalone script for the supplied animation player', () => {
  const html = renderR3PricePage('testnonce');
  const scripts = [...html.matchAll(/<script nonce="testnonce">([\s\S]+?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.ok(html.includes('id="quotePending"'));
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});
