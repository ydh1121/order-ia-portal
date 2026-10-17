import {test} from 'node:test';
import assert from 'node:assert/strict';
import {project} from '../src/server/projection.mjs';
import {buildIaReference} from '../src/server/ia-reference.mjs';
const sr=[['화면 ID','화면명']];
for(const [p,n] of [['F',18],['U',10],['P',9],['C',5],['A',34]])for(let i=0;i<n;i++)sr.push([p+String(i).padStart(2,'0'),p+' mock '+i,'TEST','/','R1','기획 중','','test']);
const dr=[['검토 ID','제목']];
for(let i=1;i<=25;i++)dr.push(['PENDING-'+String(i).padStart(2,'0'),'TEST '+i,'TEST',i===1?'승인 완료':i===19?'핵심 공개요건 승인·운영세부 검토':'검토 필요','F17, F01, F99']);
const screen=project('screens',sr),dec=project('decisions',dr);
test('five archived role groups cover live 76 ScreenIDs exactly once',()=>{
 const g=buildIaReference(screen,dec),ids=g.families.flatMap(f=>f.groups.flatMap(x=>x.ids));
 assert.equal(g.families.length,5);assert.equal(ids.length,76);assert.equal(new Set(ids).size,76);
 assert.equal(g.source.archivedGitBlob,'07d66e793b98b3c2c51fa86037933aacb6563f7f');assert.equal(g.source.approval,'NONE');
});
test('journey and operating dependency edges come from v0.3 and valid ScreenIDs',()=>{
 const g=buildIaReference(screen,dec),keys=new Set([...g.journey.steps,...g.journey.branches].map(x=>x.key)),ids=new Set(screen.items.map(x=>x.screenId));
 assert.equal(g.journey.steps.length,9);assert.equal(g.journey.branches.length,7);assert.equal(g.journey.edges.length,15);assert.equal(g.journey.scenarios.length,10);assert.equal(g.operations.length,8);
 for(const [a,b] of g.journey.edges)assert.ok(keys.has(a)&&keys.has(b));
 for(const op of g.operations)for(const id of op.ids)assert.ok(ids.has(id));
 assert.equal(g.technical.length,7);
});
test('Current Sheet review status controls approval and only canonical policy ScreenIDs link',()=>{
 const g=buildIaReference(screen,dec);assert.equal(dec.fullyApproved,1);assert.equal(dec.active,24);
 assert.deepEqual(g.policyLinks['PENDING-19'],['F17','F01']);assert.equal(g.journey.steps.find(x=>x.key==='apply').desc.includes('현재 정책 대장'),true);
});
test('incomplete canonical screen list prevents historical relationship publication',()=>{
 const corrupt=structuredClone(screen);corrupt.items.pop();assert.throws(()=>buildIaReference(corrupt,dec),/REFERENCE_SCREEN_PARITY_FAILED/);
});
