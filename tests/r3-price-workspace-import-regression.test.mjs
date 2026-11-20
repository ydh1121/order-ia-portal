import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceWorkspaceModel} from '../src/server/r3-price-workspace-model.mjs';
import {importPriceWorkbook} from '../src/server/r3-price-workspace-import.mjs';
import {defaultPriceRows} from '../src/server/r3-price-workspace-defaults.mjs';

const model=createPriceWorkspaceModel();
const seed=()=>{const d=model.initial('2026-11-20',defaultPriceRows);model.syncCatalogProducts(d);return d;};
const find=(d,audience,grade='king')=>d.products.find(p=>p.audience===audience&&p.shell==='1'&&p.grade===grade&&p.package==='pack-30');
const workbook=(rows,extraHeaders=[])=>({sheets:[{name:'판매 상품',rows:[['상품명','난각번호','규격','포장구수','판매대상','판매가격',...extraHeaders],...rows]}]});

test('sales import updates the matching audience and specification when catalog names are shared',()=>{
  const d=seed(),business=find(d,'store'),consumer=find(d,'consumer'),other=find(d,'store','xl');
  model.applyConsumerMarkup(d,[consumer.id],'percent','10');
  const before=model.clone(d);
  const imported=importPriceWorkbook(model,d,workbook([
    [consumer.name,1,'왕란',30,'소비자',8000],
    [business.name,1,'왕란',30,'매장',7000],
  ]),'products').document;
  const actualBusiness=imported.products.find(p=>p.id===business.id),actualConsumer=imported.products.find(p=>p.id===consumer.id);
  assert.equal(imported.products.length,d.products.length);
  assert.equal(actualBusiness.audience,'store');assert.equal(actualConsumer.audience,'consumer');
  assert.equal(model.productPrice(imported,actualBusiness),7000);
  assert.equal(model.productPrice(imported,actualConsumer),8000);
  assert.equal(actualConsumer.storeProduct,business.id);
  assert.deepEqual(imported.products.find(p=>p.id===other.id),other);
  assert.deepEqual(imported.costs,d.costs);assert.deepEqual(d,before);
});

test('sales import clears a previous consumer markup and preserves explicit zero or missing prices',()=>{
  for(const [value,expected] of [['8000',8000],['0',0],['',null]]){
    const d=seed(),consumer=find(d,'consumer'),business=find(d,'store');consumer.name='소비자 별도 상품';
    model.applyConsumerMarkup(d,[consumer.id],'percent','10');
    const imported=importPriceWorkbook(model,d,workbook([[consumer.name,1,'왕란',30,'소비자',value]]),'products').document;
    const actual=imported.products.find(p=>p.id===consumer.id);
    assert.equal(actual.price,value);assert.equal(actual.markup,undefined);assert.equal(actual.auto,false);
    assert.equal(model.productPrice(imported,actual),expected);assert.equal(actual.enabled,consumer.enabled);
    assert.deepEqual(imported.products.find(p=>p.id===business.id),business);
  }
});

test('same-name products in different specifications stay separate and automatic pricing needs an explicit import value',()=>{
  const d=seed(),king=find(d,'store'),xl=find(d,'store','xl');king.name=xl.name='같은 상품';
  const direct=importPriceWorkbook(model,d,workbook([['같은 상품',1,'특란',30,'매장',9000]]),'products').document;
  assert.deepEqual(direct.products.find(p=>p.id===king.id),king);
  assert.equal(model.productPrice(direct,direct.products.find(p=>p.id===xl.id)),9000);
  const automatic=importPriceWorkbook(model,direct,workbook([['같은 상품',1,'특란',30,'매장',9000,'예']],['자동계산']),'products').document;
  assert.equal(automatic.products.find(p=>p.id===xl.id).auto,true);
  assert.equal(model.productPrice(automatic,automatic.products.find(p=>p.id===xl.id)),5900);
});

test('ambiguous or repeated sales import rows are rejected without changing the original workspace',()=>{
  const d=seed(),business=find(d,'store'),row=[business.name,1,'왕란',30,'매장',8000],before=model.clone(d);
  assert.throws(()=>importPriceWorkbook(model,d,workbook([row,row]),'products'),/행이 중복/);
  assert.deepEqual(d,before);
  d.products.push({...business,id:'duplicate-business'});const ambiguous=model.clone(d);
  assert.throws(()=>importPriceWorkbook(model,d,workbook([row]),'products'),/상품이 여러 개/);
  assert.deepEqual(d,ambiguous);
});
