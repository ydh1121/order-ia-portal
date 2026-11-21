import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getProductApplicationDocument} from '../src/server/product-ui/documents.mjs';
import {registerProductModules} from '../src/server/product-ui/modules.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('a retained purchase refresh ignores an older read and invalidates the accepted quote before the next read completes',async t=>{
 const document=await getProductApplicationDocument('store-purchase','select');
 const dom=new JSDOM(document.body,{url:'https://order-ia-portal.pages.dev/ia',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>w.close());w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const reads=[],writes=[];
 const adapter={selectedPurchaseId:'saved-order',request(path,body){
  if(!body){assert.equal(path,'/purchases');return new Promise(resolve=>reads.push(resolve));}
  writes.push({path,body});assert.equal(path,'/purchase-quote','a discarded accepted quote cannot create another order');
  return Promise.resolve({quoteId:'quote-'+writes.length,unitPrice:5970,total:Number(body.quantity)*5970,serviceDate:'2026-11-22'});
 }};
 const result=id=>({items:[{id,product:'저장된 상품',quantity:31,total:185070,paid:0,status:'AWAITING_CASH',revision:1}],offers:[{id:'offer',label:'승인 상품',unitPrice:6200,minQuantity:10,shipmentOrigin:'확인된 출고처'}],capabilities:{create:true}});
 w.eval('('+registerProductModules.toString()+')()');
 const root=w.document.querySelector('#order-single'),module=w.ORDER_DESIGN_MODULES.find(module=>module.id==='store-purchase');
 const dispose=module.mount(root,'select',{adapter,mode:'product',reduced:()=>true,select(){assert.fail('a fresh quote confirmation does not navigate');}});
 t.after(dispose);
 assert.equal(reads.length,1,'the order list and purchase form share their first server read');
 assert.equal(dispose.refresh(),true);assert.equal(reads.length,2,'refresh invalidates the cached read once');
 reads[1](result('saved-order'));await tick();
 const select=root.querySelector('[data-order-select]'),confirm=root.querySelector('[data-purchase-confirm]'),quantity=root.querySelector('[name=quantity]');
 assert.equal(select.value,'saved-order');
 reads[0](result('stale-order'));await tick();assert.equal(select.value,'saved-order','an earlier response cannot overwrite the refreshed order');
 quantity.value='31';quantity.dispatchEvent(new w.Event('input',{bubbles:true}));confirm.click();await tick();
 assert.match(confirm.textContent,/주문 확정/);assert.equal(writes.length,1);
 assert.equal(dispose.refresh(),true);
 assert.match(confirm.textContent,/금액 확인/);assert.equal(confirm.disabled,true);assert.equal(quantity.value,'31');
 confirm.click();assert.equal(writes.length,1,'refresh locks the next action while current prices are unknown');
 reads[2](result('saved-order'));await tick();confirm.click();await tick();
 assert.equal(writes.length,2);assert.match(confirm.textContent,/주문 확정/);assert.equal(root.querySelector('[data-purchase-confirm]'),confirm);
 dispose();assert.equal(dispose.refresh(),false);assert.equal(reads.length,3);
});
