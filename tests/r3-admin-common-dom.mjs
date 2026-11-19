// Exercise the selected materialized runtime for every admin/common state before
// the browser suite drives the trusted host and checks the native interactions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
let mounted=0;
for(const row of catalog.filter(r=>r.role==='admin'||['common','receipt'].includes(r.screen))){
  const path='https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?width=390&version=current&id='+encodeURIComponent(row.id);
  const artifact=await (await serveR3Artifact(new Request(path))).json();
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
    mounted++;
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
}
assert.equal(mounted,180);console.log('PASS',mounted,'materialized admin/common/receipt runtimes including controlled duplicate/success/failure.');
