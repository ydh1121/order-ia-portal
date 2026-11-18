import test from 'node:test';
import assert from 'node:assert/strict';
import {serveR3Artifact,renderR3Qa} from '../src/server/r3-qa-page.mjs';
const get=async(id,version='current')=>(await serveR3Artifact(new Request('https://review.test/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version})))).json();
test('results distinguish design states and never embed issued amounts in an editable document',async()=>{
  for(const state of ['saving','new-detail','new-only-detail','equal','current-lower','no-current','expired','recompare','no-result','locked']){
    const doc=await get('quote-result/'+state+'/email');
    assert.equal(doc.mount,null);assert.ok(doc.editable.includes('data-view="'+state+'"'));
    assert.doesNotMatch(doc.editable,/<iframe|[\d,]+원|r3-price\/quote|minorUnits/);
    if(['no-current','new-only-detail'].includes(state))assert.doesNotMatch(doc.editable,/<span>현재 납품가<\/span>/);
    if(state==='expired')assert.doesNotMatch(doc.editable,/<i aria-hidden="true">/);
    if(state==='recompare')assert.match(doc.editable,/동일한 조건[\s\S]*새로운 견적/);
  }
});
test('purchase and review use current QA runtime, host checks exclusivity and maps to fixed product entries',async()=>{
  const q2=await get('q2/empty/email'),review=await get('quote-review/normal/email');
  assert.match(q2.editable,/data-purchase-form/);assert.match(review.editable,/data-summary-qty/);
  assert.match(q2.mount,/r3-review-journey/);assert.equal((await get('q2/empty/email','previous')).mount,null);
  const html=renderR3Qa('journey');assert.match(html,/journeyDraft/);assert.match(html,/menuPublication/);
});
