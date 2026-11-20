import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';

test('a guest introduction keeps its denied session while permitted account reads and member sessions use the real lab handler',async t=>{
  const lab=await createProductUiLab();t.after(()=>lab.close());
  const guest=lab.adapter('guest');
  await assert.rejects(guest.request('/session'),error=>error.status===401&&error.message==='AUTHENTICATION_REQUIRED');
  const account=await guest.request('/account');
  assert.equal(account.capabilities.dashboard,false);
  assert.equal(account.revision,0);
  assert.equal(Object.hasOwn(account,'csrf'),false);
  await assert.rejects(guest.request('/purchases'),error=>error.status===401&&error.message==='AUTHENTICATION_REQUIRED');
  await assert.rejects(guest.request('/account',{action:'update',expectedRevision:0,requestKey:crypto.randomUUID(),profile:{name:'guest'}}),error=>error.status===401&&error.message==='AUTHENTICATION_REQUIRED');
  const session=await lab.adapter('buyer').request('/session');
  assert.equal(session.runId,lab.run.id);
  assert.equal(session.persona,'buyer');
  assert.equal(session.csrf,'csrf');
});
