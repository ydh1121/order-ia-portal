import test from 'node:test';
import assert from 'node:assert/strict';
import {serveR3Artifact,renderR3Qa} from '../src/server/r3-qa-page.mjs';
const get=async(id,version='current')=>(await serveR3Artifact(new Request('https://review.test/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version})))).json();
test('editable QA results carry the shared pre-rendered fixture and no commercial requests or issuer data',async()=>{
  for(const state of ['saving','new-detail','current-detail','new-only-detail','equal','current-lower','no-current','expired','recompare','no-result','locked']){
    const doc=await get('quote-result/'+state+'/email');
    assert.ok(doc.editable.includes('data-view="'+state+'"'));
    assert.match(doc.editable,/data-quote-fixture="figma-20261118"/);
    assert.match(doc.editable,/<article[^>]+data-order-result/);
    assert.doesNotMatch(doc.editable,/<iframe|r3-price\/quote|minorUnits|issuerDiagnostics/);
    if(['saving','new-detail','current-detail','current-lower','equal'].includes(state))
      assert.match(doc.editable,/12,540,000/);
    if(['saving','new-detail','current-detail'].includes(state))assert.match(doc.editable,/11,940,000/);
    if(state==='current-lower')assert.match(doc.editable,/13,140,000/);
    if(state==='new-detail'){
      assert.match(doc.editable,/7,200,000/);assert.match(doc.editable,/4\.78%/);
      assert.match(doc.editable,/6일 21시간 13분 59초/);
      assert.match(doc.editable,/동일한 1회 납품 기준 \/ 2,000판<\/p>/);
    }
    if(['locked','no-result','expired'].includes(state))assert.doesNotMatch(doc.editable,/12,540,000|11,940,000|13,140,000/);
  }
});
test('purchase and review use current QA runtime, host checks exclusivity and maps to fixed product entries',async()=>{
  const q2=await get('q2/empty/email'),review=await get('quote-review/normal/email');
  assert.match(q2.editable,/data-purchase-form/);assert.match(review.editable,/data-summary-qty/);
  assert.match(q2.mount,/r3-review-journey/);assert.equal((await get('q2/empty/email','previous')).mount,null);
  const html=renderR3Qa('journey');assert.match(html,/journeyDraft/);assert.match(html,/menuPublication/);
});
