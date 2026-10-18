import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {UX_CSS} from '../src/server/v03-ux.css.mjs';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';

const html=v03OwnerHtml('p0_owner_0296');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)?.[1]||'';
const sitemap=JSON.parse(html.match(/<script id="sitemap-json" type="application\/json">([\s\S]*?)<\/script>/)?.[1]||'null');
test('P0 owner-generated script compiles with all existing screen descriptions and links intact',()=>{
 assert.equal(spawnSync(process.execPath,['--check'],{input:script,encoding:'utf8'}).status,0);
 assert.equal(sitemap.items.length,76);
 assert.equal(sitemap.items.reduce((a,x)=>a+(x.features||[]).length,0),190);
 assert.equal(sitemap.items.reduce((a,x)=>a+(x.actions||[]).length,0),49);
});
test('P0 feedback-only selector overrides decision grid without dropping note/print rules',()=>{
 assert.match(UX_CSS,/#view-feedback \.ux-note-table details\.pending-entry\{\s*display:block;grid-template-columns:none/);
 assert.match(UX_CSS,/\.pending-entry\{display:grid;grid-template-columns:125px/);
 assert.match(UX_CSS,/#view-feedback \.ux-note-table details\.ux-hidden\{display:block!important\}/);
});
test('P0 current registration timing appears in flow and operation relation, without stale first F02 upload copy',()=>{
 assert.match(script,/가격 열람 전 검증한 서류 재사용·변경 시 재확인/);
 assert.match(script,/사업자정보·등록증·국세청·소속 검증 후 승인가격 공개/);
 assert.match(script,/F07 → A03 → F01 → F02 → A02 → F03/);
 assert.doesNotMatch(script,/이 시점 사업자등록증 제출|실제 납품 신청시에 증빙 접수·보완·승인/);
});
test('P0 core policy is not auto-approved by mere email signup and reference graph retained',()=>{
 assert.match(script,/이메일 가입만으로 가격이 공개되지 않습니다/);
 assert.match(script,/F17 비회원 견적과 F07 이메일 가입 자체에는 서류가 필요 없습니다/);
 assert.match(script,/PENDING-19/);
 assert.equal((script.match(/\['member','nooffer'/g)||[]).length,2);
});
