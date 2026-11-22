import test from 'node:test';
import assert from 'node:assert/strict';
import {serveR3Artifact,renderR3Qa} from '../src/server/r3-qa-page.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';
const get=async(id,version='current')=>(await serveR3Artifact(new Request('https://review.test/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version})))).json();
test('current research result scenes retain the shared display fixture and exclude commercial requests and issuer data',async()=>{
  for(const state of ['saving','new-detail','current-detail','new-only-detail','equal','current-lower','no-current','expired','recompare','no-result','locked']){
    const doc=await get('quote-result/'+state+'/email');
    assert.ok(doc.application);assert.equal(new URL(doc.application.url,'https://review.test').searchParams.get('state'),state);
    const {html}=await researchScene('quote-result',state,'email');
    assert.ok(html.includes('data-view="'+state+'"'));
    assert.match(html,/data-quote-fixture="figma-20261118"/);
    assert.match(html,/<article[^>]+data-order-result/);
    assert.doesNotMatch(html,/<iframe|r3-price\/quote|minorUnits|issuerDiagnostics/);
    if(['saving','new-detail','current-detail','current-lower','equal'].includes(state))
      assert.match(html,/12,540,000/);
    if(['saving','new-detail','current-detail'].includes(state))assert.match(html,/11,940,000/);
    if(state==='current-lower')assert.match(html,/13,140,000/);
    if(state==='new-detail'){
      assert.match(html,/7,200,000/);assert.match(html,/4\.78%/);
      assert.match(html,/6일 21시간 13분 59초/);
      assert.match(html,/동일한 1회 납품 기준 \/ 2,000판<\/p>/);
    }
    if(['locked','no-result','expired'].includes(state))assert.doesNotMatch(html,/12,540,000|11,940,000|13,140,000/);
  }
});
test('current Q2 and review select one application build while their R1 source controls remain explicitly replayable',async()=>{
  const q2=await get('q2/empty/email'),review=await get('quote-review/normal/email');
  assert.equal(q2.application.build,review.application.build);
  for(const [doc,screen]of [[q2,'q2'],[review,'quote-review']]){
    const url=new URL(doc.application.url,'https://review.test');assert.equal(url.pathname,'/ia');assert.equal(url.searchParams.get('view'),'research-r3');assert.equal(url.searchParams.get('screen'),screen);
    assert.equal(doc.source.ownership,'application');assert.equal(Object.hasOwn(doc,'mount'),false);
  }
  const oldQ2=await preservedReviewArtifact('q2/empty/email'),oldReview=await preservedReviewArtifact('quote-review/normal/email');
  assert.match(oldQ2.editable,/data-purchase-form/);assert.match(oldReview.editable,/data-summary-qty/);
  assert.match(oldQ2.mount,/r3-review-journey/);assert.equal((await get('q2/empty/email','previous')).mount,null);
  const html=renderR3Qa('journey');assert.match(html,/journeyDraft/);assert.match(html,/menuPublication/);
});
