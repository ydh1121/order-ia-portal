import test from 'node:test';
import assert from 'node:assert/strict';
import {signedWorkspace,issueExampleQuote} from './r3-business-identities.fixture.mjs';
import {onRequest as features} from '../functions/api/order/features.js';
const api='/api/ia/r3-role';
test('independent signed subjects link issued quotes, scoped consultation notes, notifications/history, delivery and admin publication with concurrent protection',async()=>{
  const f=signedWorkspace(),quote=await issueExampleQuote(f);
  const invoke=(who,data)=>f.request(who,api,{requestKey:crypto.randomUUID(),...data});
  const create={action:'create',caseId:'consultation',kind:'consult',orgId:'store',siteId:'site',expectedRevision:0,
    context:{subject:'견적 문의',memo:'상담 희망',targets:[quote],desiredDate:'2027-01-05'}};
  assert.equal((await invoke('buyer',create)).status,200);
  assert.equal((await invoke('buyer2',{...create,orgId:'other',caseId:'other-case'})).status,409);
  const w=async who=>(await (await f.request(who,api+'/workspace')).json());
  const own=await w('buyer');assert.equal(own.quotes[0].total,'300');assert.equal(own.quotes[0].productName,'시험 특란');assert.deepEqual((await w('buyer2')).quotes,[]);
  assert.equal((await invoke('buyer',{caseId:'consultation',action:'submit',expectedRevision:1})).status,200);
  const getCase=async(who,id)=>f.request(who,api+'?context=1&id='+id);
  const detail=await(await getCase('operator','consultation')).json();assert.deepEqual(detail.notes[0].targets,[quote]);assert.equal(detail.targetQuotes[0].total,'300');assert.equal(detail.notes[0].memo,'상담 희망');
  const answer={caseId:'consultation',action:'respond',expectedRevision:2,context:{memo:'희망일 상담 가능'}};
  assert.equal((await invoke('operator',answer)).status,200);
  assert.equal((await invoke('operator',answer)).status,409);
  assert.equal((await w('buyer')).activity[0].action,'respond');assert.deepEqual((await w('buyer2')).activity,[]);
  assert.equal((await getCase('supplier','consultation')).status,404);assert.equal((await getCase('buyer2','consultation')).status,404);
  assert.equal((await invoke('buyer',{action:'create',caseId:'order',kind:'delivery',orgId:'store',siteId:'site',quoteId:quote,expectedRevision:0})).status,200);
  assert.equal((await w('buyer')).quotes[0].deliveryCase,'order');
  let rev=1;
  for(const [who,action] of [['buyer','submit'],['operator','accept'],['buyer','payment-request'],['operator','payment-review'],['supplier','schedule'],['supplier','dispatch'],['buyer','receive'],['operator','document-review'],['supplier','settlement-review'],['operator','supplement'],['supplier','settlement-review'],['operator','settle']]){
    if(action==='document-review'){
      assert.equal((await invoke('operator',{action,caseId:'order',expectedRevision:rev})).status,409);
      const bytes=Uint8Array.from([79,82,80,88,1,1,0,2,0,2,100,100,0,0]);
      assert.equal((await f.upload('buyer2','order',bytes)).status,403);
      const proof=await f.upload('supplier','order',bytes);assert.equal(proof.status,200,await proof.clone().text());
      const {evidenceId}=await proof.json();assert.equal((await invoke('supplier',{caseId:'order',expectedRevision:rev++,action:'attach',evidenceId})).status,200);
      assert.equal((await f.request('operator',api+'/evidence?caseId=order&id='+evidenceId)).status,200);
    }
    const r=await invoke(who,{action,caseId:'order',expectedRevision:rev,...(action==='supplement'?{reason:'MISSING_EVIDENCE',context:{memo:'문서 보완'}}:{})});
    assert.equal(r.status,200,action+' '+await r.clone().text());rev++;
  }
  let d=await(await getCase('supplier','order')).json();assert.equal(d.issued.deliveryQty,3);assert.equal(d.issued.total,'300');assert.equal(d.events.at(-1).next_state,'SETTLEMENT_REVIEWED');
  assert.equal((await w('buyer')).quotes[0].deliveryState,'SETTLEMENT_REVIEWED');
  const feature=async()=>(await (await features({request:new Request('https://order-ia-portal.pages.dev/api/order/features'),env:f.env})).json());
  assert.deepEqual(await feature(),{orderMenu:false});
  const action={requestKey:'publish',enabled:true,expectedRevision:0};
  assert.equal((await f.request('supplier',api+'/publication',action)).status,403);
  assert.equal((await f.request('operator',api+'/publication',action)).status,200);
  assert.equal((await f.request('operator',api+'/publication',action)).status,200);
  assert.deepEqual(await feature(),{orderMenu:true});
  assert.equal((await f.request('operator',api+'/publication',{...action,requestKey:'stale',enabled:false})).status,409);
  assert.equal((await f.request('operator',api+'/publication',{requestKey:'unpublish',enabled:false,expectedRevision:1})).status,200);
  assert.deepEqual(await feature(),{orderMenu:false});
  // Revocation removes both the live projection and the workbench's cross-screen quote details.
  f.db.exec("UPDATE r3_business_site SET verification='REVOKED' WHERE org_id='store'");
  assert.deepEqual((await w('buyer')).quotes,[]);d=await(await getCase('operator','order')).json();assert.equal(d.issued,undefined);
  assert.equal((await f.request('buyer','/api/ia/r3-qa/records')).status,403);
  assert.equal((await f.request('buyer','/api/ia/dashboard')).status,403);
  assert.equal((await f.request('buyer',api+'/session',null,{jwt:f.token('buyer',-1)})).status,403);
  f.db.exec("UPDATE r3_membership SET active=0 WHERE actor_id='buyer'");assert.equal((await f.request('buyer',api+'/session')).status,200);
  assert.equal((await f.request('buyer',api+'/workspace')).status,403);
  assert.equal((await f.request('buyer',api+'/businesses')).status,200);
});
