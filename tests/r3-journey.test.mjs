import test from 'node:test';
import assert from 'node:assert/strict';
import {serveR3Artifact,renderR3Qa} from '../src/server/r3-qa-page.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';
const get=async(id,version='current')=>(await serveR3Artifact(new Request('https://review.test/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version})))).json();
test('current research result scenes retain the shared display fixture and exclude commercial requests and issuer data',async()=>{
  for(const state of ['saving','new-detail','current-detail','equal','current-lower','expired','recompare','no-result']){
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
    if(['no-result','expired'].includes(state))assert.doesNotMatch(html,/12,540,000|11,940,000|13,140,000/);
  }
});
test('both locked result routes render their own data-free silhouette and Figma actions',async()=>{
  for(const [state,audience,cta] of [['locked','unverified','사업장 인증하기'],['locked-guest','guest','사업장 회원가입']]){
    const doc=await get('quote-result/'+state+'/email');
    assert.ok(doc.application);assert.equal(new URL(doc.application.url,'https://review.test').searchParams.get('state'),state);
    const {html,mount,family}=await researchScene('quote-result',state,'email');
    assert.equal(family,'researchQuoteLock');assert.ok(html.includes('data-state="'+audience+'"'));
    assert.ok(html.includes(cta));assert.match(html,/상담 예약/);assert.match(html,/class="oq-lock-graph" aria-hidden="true"/);
    assert.doesNotMatch(html+mount,/data-quote-fixture|reviewQuoteFixture|quoteService|r3-price\/quote|minorUnits|issuerDiagnostics|12,?540,?000|11,?940,?000|13,?140,?000|7,?200,?000|4\.78%/);
  }
});
test('current Q2 and Q4 select one application build while the retired review stays explicitly replayable',async()=>{
  const q2=await get('q2/empty/email'),q4=await get('q4/closed/email');
  assert.equal(q2.application.build,q4.application.build);
  for(const [doc,screen]of [[q2,'q2'],[q4,'q4']]){
    const url=new URL(doc.application.url,'https://review.test');assert.equal(url.pathname,'/ia');assert.equal(url.searchParams.get('view'),'research-r3');assert.equal(url.searchParams.get('screen'),screen);
    assert.equal(doc.source.ownership,'application');assert.equal(Object.hasOwn(doc,'mount'),false);
  }
  const oldQ2=await preservedReviewArtifact('q2/empty/email'),oldReview=await preservedReviewArtifact('quote-review/normal/email');
  for(const id of ['quote-review/normal/email','quote-result/no-current/email','quote-result/new-only-detail/email'])assert.equal((await get(id)).error,'RETIRED_REVIEW_TARGET');
  assert.match(oldQ2.editable,/data-purchase-form/);assert.match(oldReview.editable,/data-summary-qty/);
  assert.match(oldQ2.mount,/r3-review-journey/);assert.equal((await get('q2/empty/email','previous')).mount,null);
  const html=renderR3Qa('journey');assert.match(html,/journeyDraft/);assert.match(html,/menuPublication/);
});
