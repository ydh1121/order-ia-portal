import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBuyerResult} from '../src/server/r3-quote-result.mjs';

const now=Date.UTC(2026,10,19);
const amount=n=>({minorUnits:String(n),decimal:String(n),scale:0});
function issued(quote={}){
  return {status:'ISSUED',id:'fixture',issuedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+60000).toISOString(),
    response:{status:'OK',completion:'COMPLETE',quotes:[{total:amount(255),currency:'KRW',...quote}]}};
}
test('only an issued, unexpired, exact customer total permits a price',()=>{
  const result=issued();
  assert.equal(projectBuyerResult(result,now).proposed,'255');
  for(const bad of [{...result,status:'PENDING'},{...result,expiresAt:'invalid-date'},
    {...result,response:{...result.response,completion:'PARTIAL'}},issued({total:{...amount(255),decimal:'25500'}}),
    issued({total:amount(-1)}),issued({currency:'USD'}),null]){
    assert.deepEqual(projectBuyerResult(bad,now),{state:'unavailable'});
  }
  const expired=projectBuyerResult(result,Date.parse(result.expiresAt));
  assert.deepEqual(expired,{state:'expired',end:Date.parse(result.expiresAt)});
});
test('savings, equal and lower require a matching, eligible historic-price comparison',()=>{
  for(const [old,state] of [[500,'saving'],[255,'equal'],[120,'current-lower']]){
    const c={current:amount(old),difference:amount(old-255)};
    const view=projectBuyerResult(issued({comparisonEligibility:'ELIGIBLE',comparison:c}),now);
    assert.equal(view.state,state);assert.equal(view.current,String(old));assert.equal(view.difference,String(Math.abs(old-255)));
    assert.deepEqual([view.currentRatio,view.proposedRatio].sort((a,b)=>b-a)[0],100);
    assert.equal(projectBuyerResult(issued({comparison:c}),now).state,'offer');
    assert.equal(projectBuyerResult(issued({comparisonEligibility:'ELIGIBLE',comparison:{...c,difference:amount(888)}}),now).state,'offer');
  }
  assert.equal(projectBuyerResult(issued({total:amount(0),comparisonEligibility:'ELIGIBLE',comparison:{current:amount(0),difference:amount(0)}}),now).proposedRatio,0);
  assert.equal(projectBuyerResult(issued({total:amount('12345678901234567890123')}),now).proposed,'12345678901234567890123');
});
