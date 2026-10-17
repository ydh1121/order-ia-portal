import {test} from 'node:test';
import assert from 'node:assert/strict';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';

test('original v0.3 layout is server-only and retains 8 real interactive views',()=>{
  const html=v03OwnerHtml('fixture_nonce');
  const views=[...html.matchAll(/<section id="view-(overview|sitemap|journey|operation|roadmap|policy|pending|feedback)"/g)].map(x=>x[1]);
  assert.equal(new Set(views).size,8);
  for(const id of ['modal-features','modal-wire','modal-route','flow-lines','scenario-list','scenario-output','status-filter','pending-filter','print-btn'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/nonce="fixture_nonce"/);
  assert.match(html,/api\/ia\/dashboard/);
  assert.doesNotMatch(html,/전체 22개 · 미결정 21개/);
});
test('all 190 source functions and 49 action destinations remain in owner-protected payload',()=>{
  const html=v03OwnerHtml('fixture_nonce');
  const m=html.match(/<script id="sitemap-json" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  const data=JSON.parse(m[1]);
  assert.equal(data.items.length,76);
  assert.equal(data.items.reduce((n,x)=>n+(x.features||[]).length,0),190);
  assert.equal(data.items.reduce((n,x)=>n+(x.actions||[]).length,0),49);
  assert.equal(data.families.length,5);
});
test('live Google read supersedes old decisions and provides native Sheet row link',()=>{
  const html=v03OwnerHtml('fixture_nonce');
  assert.match(html,/live\.decisions\.items\.map/);
  assert.match(html,/isapproved=!!q\.isFullyApproved/);
  assert.match(html,/window\.__iaSheetRowById/);
  assert.match(html,/liveData\.notes\.items/);
  assert.match(html,/LOWFI.*미승인/);
  assert.doesNotMatch(html,/정책 승인<\/b>회원 예상가격/);
});
