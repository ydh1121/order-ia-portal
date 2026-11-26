import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/notification-dispatcher/worker.mjs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';

test('cron awaits the real bounded outbox processor without a browser request or public drain endpoint',async t=>{
  const w=signedWorkspace();t.after(()=>w.db.close());
  const before=w.db.prepare('SELECT count(*) n FROM order_notification').get().n;
  const result=await worker.scheduled({scheduledTime:Date.now()},w.env);
  assert.equal(result.available,true);assert.deepEqual(result.prices,{processed:0,cancelled:0});
  assert.equal(result.push.configured,false);
  assert.equal(w.db.prepare('SELECT count(*) n FROM order_notification').get().n,before);
  const response=await worker.fetch(new Request('https://example.invalid/drain',{method:'POST'}),w.env);
  assert.equal(response.status,404);
  await assert.rejects(worker.scheduled({scheduledTime:Date.now()},{}),/NOTIFICATION_DATABASE_REQUIRED/);
});
