import {test} from 'node:test';
import assert from 'node:assert/strict';
import {project,DECISION_STATUS_CLASS,CANONICAL_SCREEN_IDS} from '../src/server/projection.mjs';
import {TABS} from '../src/server/google.mjs';

const header=['검토 ID','쉬운 제목','무엇을 결정해야 하나요?','현재 상태'];
const statusFor=i=>i===1?'승인 완료':i===19?'핵심 공개요건 승인·운영세부 검토':i===26?'엔진·UI 통합 완료, 웹 검수 및 정책 검토 중':i===10?'보류 검토':i===11?'향후 검토':'검토 필요';
const row=i=>['PENDING-'+String(i).padStart(2,'0'),'합성 검토 '+i,'합성 질문 '+i,statusFor(i),'F17'];
const fixture=()=>[[...header],...Array.from({length:28},(_,i)=>row(i+1))];
const summary=rows=>project('decisions',rows);
const reject=rows=>assert.throws(()=>summary(rows),/DECISION_PARITY_FAILED/);

test('no row-26 cutoff: open-ended authenticated Google decision range',()=>{
 assert.equal(TABS.decisions,"'향후_검토'!A1:N");
 assert.equal(CANONICAL_SCREEN_IDS.length,76);
});
test('current 28 synthetic canonical IDs are each projected once with approved/review/open counts',()=>{
 const d=summary(fixture());
 assert.equal(d.total,28);assert.equal(d.active,27);
 assert.equal(d.open,25);assert.equal(d.in_review,2);assert.equal(d.approved,1);assert.equal(d.fullyApproved,1);
 assert.equal(d.items.length,new Set(d.items.map(x=>x.id)).size);
 for(const id of ['PENDING-26','PENDING-27','PENDING-28'])assert.ok(d.items.some(x=>x.id===id));
 assert.equal(d.items.filter(x=>x.reviewState==='APPROVED').length,1);
});
test('partial core policy and engine UI review never turn into fully approved',()=>{
 const d=summary(fixture());
 for(const id of ['PENDING-19','PENDING-26']){
  const item=d.items.find(x=>x.id===id);
  assert.equal(item.reviewState,'IN_REVIEW');assert.equal(item.isFullyApproved,false);
 }
 assert.equal(d.items.find(x=>x.id==='PENDING-01').isFullyApproved,true);
});
test('new PENDING-29 and 30 are added without changing a source count constant',()=>{
 const rows=fixture();rows.push(row(29));rows.push(row(30));
 const d=summary(rows);
 assert.deepEqual([d.total,d.active,d.open,d.in_review,d.approved],[30,29,27,2,1]);
});
test('removing one canonical OPEN item adjusts the total dynamically',()=>{
 const rows=fixture().filter(x=>x[0]!=='PENDING-14');
 const d=summary(rows);
 assert.deepEqual([d.total,d.active,d.open,d.in_review,d.approved],[27,26,24,2,1]);
});
test('removing PENDING-19 does not require an obsolete hardcoded ID list',()=>{
 const d=summary(fixture().filter(x=>x[0]!=='PENDING-19'));
 assert.deepEqual([d.total,d.active,d.open,d.in_review,d.approved],[27,26,25,1,1]);
});
test('only exact approved status is approved, not a status that happens to contain approval text',()=>{
 assert.equal(DECISION_STATUS_CLASS['핵심 공개요건 승인·운영세부 검토'],'IN_REVIEW');
 assert.equal(DECISION_STATUS_CLASS['승인 완료'],'APPROVED');
 const rows=fixture();rows[19][3]='승인 검토 중';
 reject(rows);
});
test('duplicate IDs and malformed ID formats fail closed',()=>{
 for(const value of ['PENDING-00','PENDING-1','PENDING-001','PENDING-X','OTHER-29']){
  const rows=fixture();rows[2][0]=value;reject(rows);
 }
 const dup=fixture();dup.push([...dup[26]]);reject(dup);
});
test('missing name/question/status in a populated row fail closed',()=>{
 for(const index of [1,2,3]){
  const rows=fixture();rows[28][index]='';reject(rows);
 }
});
test('unexpected novel statuses require an explicit mapping decision',()=>{
 const rows=fixture();rows[28][3]='진행 예정';reject(rows);
});
test('blank trailing rows are harmless, but blank internal gaps are not hidden',()=>{
 const rows=fixture();rows.push([]);rows.push(['','','','','']);
 assert.equal(summary(rows).total,28);
 const gap=fixture();gap.splice(12,0,[]);reject(gap);
});
test('partial row containing only a memo is malformed rather than quietly filtered',()=>{
 const rows=fixture();rows.push(['','','','','','비공개 테스트 메모']);reject(rows);
 const partial=fixture();partial[27]=['PENDING-27','','','','F17'];reject(partial);
});
test('invalid header, header-only list and non-array rows fail explicitly',()=>{
 const wrong=fixture();wrong[0][1]='제목';reject(wrong);
 assert.throws(()=>summary([[...header]]),/EMPTY_SHEET/);const bad=fixture();bad[7]=null;reject(bad);
});
test('a second exact approval from the source affects the aggregation, without auto-promoting partial statuses',()=>{
 const rows=fixture();rows[2][3]='승인 완료';const d=summary(rows);
 assert.deepEqual([d.total,d.active,d.open,d.in_review,d.approved],[28,26,24,2,2]);
 assert.equal(d.items.find(x=>x.id==='PENDING-19').isFullyApproved,false);
});
