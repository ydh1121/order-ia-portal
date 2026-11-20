// Exercise the isolated authored controls and the connected shipment separately.
// A product adapter replacing an authored state must retain the recorded bytes;
// the product state must not be accepted as a simulated admin-common success.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {supplementalHistoryRows,supplementalHistoryBodies,supplementalHistoryScripts} from '../src/server/r3-ui/supplemental-history.gen.mjs';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
let mounted=0,connected=0;
async function connectedShipment(row,current){
  const history=supplementalHistoryRows[row.id];assert.ok(history,'the previous shipment review is archived');
  const path='https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({width:'390',version:'recorded',id:row.id,artifactHash:history.hashes[390]});
  const response=await serveR3Artifact(new Request(path));assert.equal(response.status,200);
  const recorded=await response.json(),body=gunzipSync(Buffer.from(supplementalHistoryBodies[history.body],'base64')).toString(),mount=gunzipSync(Buffer.from(supplementalHistoryScripts[history.script],'base64')).toString();
  assert.equal(createHash('sha256').update(body).digest('hex'),history.body);
  assert.equal(createHash('sha256').update(mount).digest('hex'),history.script);
  assert.equal(recorded.hash,history.hashes[390]);assert.equal(recorded.mount,mount);assert.ok(recorded.html.includes(body));
  assert.notEqual(current.hash,recorded.hash,'the new product runtime has its own review identity');
  const lab=await createProductUiLab(),adapter=lab.adapter('operator');let dom,dispose,disposeShared;
  try{
    dom=new JSDOM(current.html,{url:'https://lab.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
    w.ORDER_APP_ADAPTER=adapter;w.ORDER_APP_CONTEXT={mode:'lab'};w.eval(current.mount);
    const root=w.document.getElementById('order-single'),api={mode:'product',screen:row.screen,reduced:()=>true,select(){assert.fail('a shipment cannot be completed by simulated navigation');},toast(){}};
    disposeShared=w.QAUI.sharedMount(root,api);dispose=w.ORDER_DESIGN_MODULES.find(module=>module.id===row.screen).mount(root,row.state,api);
    for(let index=0;index<12;index++)await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(root.dataset.appConnection,'connected');assert.equal(root.dataset.motionRuntime,undefined);
    assert.ok(adapter.calls.some(call=>call.path==='/purchases'&&!call.body),'the real product handler supplies shipment orders');
    assert.deepEqual((await adapter.request('/purchases')).items,[]);
    const orders=root.querySelector('[data-shipment-order]'),save=root.querySelector('[data-shipment-apply]');
    assert.equal(orders.options.length,0,'an empty run cannot show an authored sample shipment');assert.equal(save.disabled,true);
    save.click();assert.equal(adapter.calls.some(call=>call.body),false,'no order means no shipment mutation');
  }finally{dispose?.();disposeShared?.();dom?.window.close();lab.close();}
}
for(const row of catalog.filter(r=>r.role==='admin'||['common','receipt'].includes(r.screen))){
  const path='https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?width=390&version=current&id='+encodeURIComponent(row.id);
  const artifact=await (await serveR3Artifact(new Request(path))).json();
  if(row.id==='admin-shipments/packing/email'){
    await connectedShipment(row,artifact);mounted++;connected++;continue;
  }
  const dom=new JSDOM(artifact.html,{url:'about:srcdoc',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,events=[];
  Object.defineProperty(w,'parent',{value:{postMessage:message=>events.push(message)}});
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  try{
    w.eval(artifact.mount);
    w.eval('('+frameCode+')')({screen:row.screen,state:row.state,variant:row.variant,artifact:artifact.hash,channel:'test',version:'current'});
    const doc=w.document.getElementById('order-single');
    assert.equal(doc.dataset.motionRuntime,'admin-common',row.id);
    assert.ok(events.some(msg=>msg.type==='ready'),row.id);
    if(row.id==='common/default/email'){
      const change=mode=>doc.dispatchEvent(new w.CustomEvent('r3-motion-scenario',{detail:{mode}}));
      const save=doc.querySelector('[data-action=save-demo]');
      const phases=[];doc.addEventListener('r3:async-state',e=>phases.push(e.detail));
      change('delay');save.click();save.click();await new Promise(r=>setTimeout(r,4));
      assert.equal(save.dataset.asyncPhase,'pending');change('complete');await new Promise(r=>setTimeout(r,4));
      assert.equal(save.dataset.asyncPhase,'success');
      change('error');save.click();await new Promise(r=>setTimeout(r,400));
      assert.equal(save.dataset.asyncPhase,'error');
      assert.deepEqual(phases.map(r=>r.phase),['pending','success','pending','error']);
    }
    if(row.runtimeFamily==='adminLoading'){
      await new Promise(r=>setTimeout(r,2));
      assert.ok(doc.querySelector('[data-async-region=pending]'),row.id);
      const mode=row.screen==='admin-analytics'?'offline':'complete';
      doc.dispatchEvent(new w.CustomEvent('r3-motion-scenario',{detail:{mode}}));
      await new Promise(r=>setTimeout(r,2));
      const next=row.screen==='common'?'revealed':mode==='offline'?'partial':'normal';
      assert.ok(events.some(event=>event.type==='navigate'&&event.payload.screen===row.screen&&event.payload.state===next),row.id+' → '+next);
    }
    mounted++;
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
}
assert.equal(mounted,180);assert.equal(connected,1);
console.log('PASS',mounted-connected,'isolated admin/common/receipt runtimes including controlled duplicate/success/failure; 1 connected shipment reads the canonical product service and preserves its exact historical artifact.');
