import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const browser=readFileSync(new URL('./r3-admin-common-browser.py',import.meta.url),'utf8');
const captureSource=browser.slice(browser.indexOf('def capture_commands'),browser.indexOf('\ndef commands'))
  .match(/evaluate\('''([\s\S]*?)'''\)/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('successive admin observations on one retained adapter count one real pending request and preserve transport',async()=>{
  const dom=new JSDOM('<main id="order-single"></main>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
  let adapter;
  try{
    w.eval('('+installQaFixtureAdapter.toString()+')({screen:"receipt",state:"before"},('+installProductAdapter.toString()+'))');
    adapter=w.ORDER_APP_ADAPTER;await adapter.ready;
    const capture=w.eval('('+captureSource+')'),root=w.document.getElementById('order-single'),original=adapter.request;
    capture(root);const previousRecords=w.__adminCommands;
    capture(root);capture(root);
    adapter.fixture.configure({requests:{'product POST /billing':{scenario:'loading'}}});
    const body={action:'draft',requestKey:'retained-observer',data:{memo:'pending input'}},copy=JSON.parse(JSON.stringify(body));
    const pending=adapter.request('/billing',body);
    // Install a rejection handler before the controlled transport is released.
    const failed=pending.then(value=>({value}),error=>({error}));
    for(let i=0;i<100&&!adapter.fixture.inspect().pending;i++)await tick();
    const state=adapter.fixture.inspect(),calls=state.calls.filter(call=>call.method==='POST'&&call.path==='/billing');
    assert.equal(state.pending,1);assert.equal(state.data.billing.length,0);
    assert.equal(calls.length,1,'the real adapter sends one request');
    assert.equal(w.__adminCommands.length,1,'one command is observed once after repeated screen selection');
    assert.equal(previousRecords.length,0,'the ended observation does not retain new route activity');
    assert.deepEqual(JSON.parse(JSON.stringify(w.__adminCommands)),[{path:'/billing',body:copy}]);
    body.data.memo='later local edit';
    assert.equal(w.__adminCommands[0].body.data.memo,'pending input');
    adapter.fixture.releasePending({requests:{'product POST /billing':{scenario:'error',status:503}}});
    assert.equal((await failed).error?.status,503);
    assert.equal(adapter.fixture.inspect().data.billing.length,0);
    w.__adminCommandObserver.release();assert.equal(adapter.request,original);
    // Retain the original browser assertion instead of reducing its count gate.
    assert.ok(browser.includes("assert len(commands(frame))==1 and inspect_fixture(frame)['data']['billing']==[]"));
  }finally{adapter?.fixture.dispose();w.close();}
});
