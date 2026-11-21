import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getProductDocuments,getProductApplicationDocument} from '../src/server/product-ui/documents.mjs';
import {getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {installProductUiRegistry} from '../src/server/product-ui/bootstrap.mjs';
import * as productRuntime from '../src/server/product-ui/runtime.gen.mjs';
import * as productAssets from '../src/server/product-ui/assets.gen.mjs';

test('product import graph cannot reach a review host, frame, fixture, showcase or review session',()=>{
 const script=fileURLToPath(new URL('../scripts/check-product-ui-boundaries.mjs',import.meta.url));
 const report=JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules',script],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}}));
 assert.deepEqual(report.violations,[]);
 assert.ok(report.files.includes('src/server/product-ui/catalog.gen.mjs'));
 assert.ok(report.files.includes('src/server/product-ui/runtime.gen.mjs'));
 assert.ok(report.files.includes('src/server/product-ui/documents.mjs'));
 assert.deepEqual(Object.keys(productRuntime),['runtimes']);
 for(const key of ['hostCode','frameCode','assetPack','qaMvpRuntimeCode','libraryCss'])assert.equal(Object.hasOwn(productAssets,key),false,key);
});

test('review documents consume the exact product bodies, CSS and behavior before adding controlled states',async()=>{
 const product=await getProductDocuments(),review=await getQaSupplemental();
 assert.ok(product.documents.size>10);
 for(const [id,document] of product.documents){
  const inspected=review.documents.get(id);assert.ok(inspected,id);
  for(const key of ['body','css','mount'])assert.equal(inspected[key],document[key],id+' '+key);
  assert.deepEqual(inspected.hashes,document.hashes,id+' fingerprints');
  assert.equal(Object.hasOwn(document,'qaOnly'),false,id);
  assert.equal(Object.hasOwn(document.row,'fixture'),false,id);
 }
 assert.equal(await getProductApplicationDocument('component-library','components'),null);
 assert.equal(await getProductApplicationDocument('store-purchase','qa-error'),null);
 const fixture=review.documents.get('store-purchase/qa-error/email');
 assert.equal(fixture.qaOnly,true);
 assert.equal(fixture.body,product.documents.get('store-purchase/select/email').body);
 assert.equal(fixture.mount,product.documents.get('store-purchase/select/email').mount);
});

test('one shared bootstrap gives each mounted root its own asynchronous lifetime and preserves document listeners',()=>{
 const calls={common:0,admin:0,workflow:0,motion:0,commonDispose:0,motionDispose:0,canonical:0,canonicalDispose:0,canonicalRefresh:0,workflowDispose:0};
 const events=new Map(),adapter={consultation:{request(){}}},seen=[],workflowRoots=new WeakMap();
 const win={AbortController,ORDER_APP_ADAPTER:adapter,addEventListener(type,handler){events.set(type,handler);}};
 const factories={
  common(){calls.common++;return {destroy(){calls.commonDispose++;}};},
  admin(){calls.admin++;},
  workflow(win){calls.workflow++;win.ORDER_WORKFLOW_MOTION={mount(root){if(workflowRoots.has(root))return workflowRoots.get(root);const value={destroy(){calls.workflowDispose++;}};workflowRoots.set(root,value);return value;}};},
  async(root,options){calls.motion++;seen.push(options.source);return {destroy(){calls.motionDispose++;}};},
  evidence(){return 'editor';}
 };
 const registry=installProductUiRegistry(win,factories);
 assert.equal(installProductUiRegistry(win,factories),registry);
 assert.equal(calls.common,1);assert.equal(calls.admin,1);assert.equal(calls.workflow,1);
 assert.equal(win.ORDER_EVIDENCE_EDITOR,factories.evidence);
 const root={},other={},received=[];
 const module={id:'business',mount(root,state,api){calls.canonical++;received.push(api);assert.equal(api.adapter,adapter);assert.equal(api.consultation,adapter.consultation);assert.ok(api.motion);assert.ok(win.ORDER_COMMON_MOTION);const dispose=()=>{calls.canonicalDispose++;};dispose.refresh=()=>{calls.canonicalRefresh++;return true;};return dispose;}};
 const first=registry.mount(module,root,'empty',{mode:'product'});
 assert.equal(registry.mount(module,root,'empty',{mode:'product'}),first);
 const parent=new AbortController();registry.mount(module,other,'empty',{mode:'qa',signal:parent.signal});
 assert.deepEqual(seen,['server','qa-fixture']);assert.equal(calls.canonical,2);
 assert.notEqual(received[0].signal,received[1].signal);
 assert.equal(first.refresh(),true);assert.equal(calls.canonicalRefresh,1);assert.equal(calls.motion,2,'refresh reuses the existing motion owner');assert.equal(calls.canonical,2);
 first();first();assert.equal(calls.canonicalDispose,1);assert.equal(calls.motionDispose,1);assert.equal(calls.commonDispose,0);
 assert.equal(first.refresh(),false);assert.equal(calls.canonicalRefresh,1,'disposed modules cannot refresh');
 parent.abort();assert.equal(calls.canonicalDispose,2);assert.equal(calls.motionDispose,2);assert.equal(registry.inspect(other),null);
 events.get('pagehide')();assert.equal(calls.commonDispose,1);assert.equal(calls.motionDispose,2);
});

test('a transport wrapper re-enters the same canonical lifetime without duplicating motion owners',()=>{
 let mounted=0,motions=0,closed=0;
 const win={AbortController,addEventListener(){},ORDER_APP_ADAPTER:{}};
 const registry=installProductUiRegistry(win,{async(){motions++;return {destroy(){closed++;}};}});
 const canonical={id:'terms',mount(root,state,api){mounted++;assert.ok(api.motion);return()=>{};}};
 const wrapped={id:'terms',mount(root,state,api){return registry.mount(canonical,root,state,api);}};
 const dispose=registry.mount(wrapped,{},'required',{mode:'qa'});
 assert.equal(mounted,1);assert.equal(motions,1);dispose();assert.equal(closed,1);
});
