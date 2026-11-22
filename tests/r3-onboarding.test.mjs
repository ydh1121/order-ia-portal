import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';

const artwork = JSON.parse(await readFile(new URL('../scripts/r3/authored/onboarding-art.json',import.meta.url),'utf8'));
const archivedArt = 'e04ba4e9';
async function target(state,width=375) {
  return preservedReviewArtifact('onboarding/'+state+'/email',{width});
}
const bodyOf = row => row.html.split('<body>')[1].split('<!--R3-FRAME-->')[0];
test('eight preserved R1 intro states retain their own actions, artwork, cards and pagination', async ()=>{
  const source = await readFile(new URL('../scripts/r3/authored/onboarding.js',import.meta.url),'utf8');
  assert.ok(runtimes.onboarding.endsWith(source));
  assert.equal(createHash('sha256').update(Buffer.from(artwork.data,'base64')).digest('hex'),artwork.sha256);
  assert.equal(artwork.sha256.slice(0,8),archivedArt);
  const identities = new Set();
  for(const member of [false,true]) for(const step of [1,2,3,4]){
    const result=await target((member?'member':'guest')+'-'+step);
    const body=bodyOf(result);
    assert.equal(result.mount,runtimes.onboarding);
    identities.add(result.hash);
    assert.equal(body.includes('data:image/webp;base64,'+artwork.data),step<=2);
    assert.equal(body.includes('data-mf-go="signup/empty"'),!member);
    assert.equal(body.includes('class="ob-login"'),!member);
    assert.equal(body.includes('data-action="quick"'),member);
    assert.equal(body.includes('aria-label="소개 페이지"'),!(member&&step===4));
    assert.equal(body.includes('class="ob-mode-grid"'),step===4);
    assert.equal(body.includes('class="ob-mode simple inline"'),member&&step<4);
    assert.doesNotMatch(body,/<iframe|<img[^>]+src="https?:/i);
  }
  assert.equal(identities.size,8);
});
test('the preserved R1 company overlay has a labelled drawer, inert backdrop, destinations and registrant fields',async()=>{
  const body=bodyOf(await target('company'));
  assert.match(body,/<div class="ob-stage" inert/);
  assert.match(body,/role="dialog" aria-modal="true" aria-label="사업자 정보"/);
  for(const label of ['배송·취소·환불','이용약관','개인정보 처리방침','고객지원','상호','대표자','사업자등록번호','통신판매업 신고','사업장 소재지','고객센터','이메일','호스팅 제공자','Cloudflare'])assert.ok(body.includes(label),label);
  assert.doesNotMatch(body,/my@order\.ooo/);
  assert.equal((body.match(/<dd>등록 필요<\/dd>/g)||[]).length,7);
});
