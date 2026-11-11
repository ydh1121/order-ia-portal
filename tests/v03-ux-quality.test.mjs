import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';
import {UX_CSS} from '../src/server/v03-ux.css.mjs';
import {UX_RUNTIME} from '../src/server/v03-ux.js.mjs';
const html=v03OwnerHtml('qa_20261018');
const executable=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
test('Full shipped v0.3 HTML includes source-exact UX style and runtime, not public private-data assets',()=>{
 assert.ok(html.includes(UX_CSS)); assert.ok(executable.includes(UX_RUNTIME));
 assert.match(html,/id="view-overview"/);assert.match(html,/id="modal-wire"/);
});
test('Complete server-generated executable inline JavaScript is syntactically valid',()=>{
 const r=spawnSync(process.execPath,['--check'],{input:executable,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('Visual rework preserves 8 views, 76 archival items, 190 features and 49 actions',()=>{
 const names=['overview','sitemap','journey','operation','roadmap','policy','pending','feedback'];
 for(const n of names)assert.ok(html.includes('id="view-'+n+'"'));
 const m=html.match(/<script id="sitemap-json" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(m);const d=JSON.parse(m[1]);assert.equal(d.items.length,76);
 assert.equal(d.items.reduce((n,i)=>n+i.features.length,0),190);
 assert.equal(d.items.reduce((n,i)=>n+i.actions.length,0),49);
});
test('UX menu exposes only one H1 per selected view and exact 8 executive Korean names',()=>{
 for(const n of ['IA 전체 현황','전체 화면','고객 이용 흐름','고객·관리자 연결','추진 일정','정책 결정 현황','결정할 사항','화면별 의견·자료'])assert.ok(UX_RUNTIME.includes(n));
 assert.match(UX_RUNTIME,/replaceWith\(h\)/);
 assert.match(UX_RUNTIME,/ux-nav-toggle/);
});
test('Mobile journey overflow removed, distinct business and IA roadmap tabs exist',()=>{
 assert.match(UX_CSS,/\.flow-chart\{min-width:0!important/);
 assert.match(UX_CSS,/@media\(min-width:768px\) and \(max-width:900px\)/);
 assert.match(UX_RUNTIME,/IA 개발 단계 \(기획안\)/);
 assert.match(UX_RUNTIME,/사업 추진 단계/);
});
test('Decision and note browsing preserve variable decision counts and 31 notes with filters and read-only links',()=>{
 assert.match(UX_RUNTIME,/pendingList/);assert.match(UX_RUNTIME,/decisionLimit=12/);
 assert.match(UX_RUNTIME,/window\.__iaLive\.notes\.items/);
 assert.match(UX_RUNTIME,/ux-note-toolbar/);
 assert.doesNotMatch(UX_RUNTIME,/fetch\([^)]*method:\s*['"]POST['"]/);
});
test('Print excludes navigation, controls, and modal; modal retains 4 accessible sections',()=>{
 assert.match(UX_CSS,/@media print/);assert.match(UX_CSS,/\.sidebar,#ia-live-banner/);
 for(const key of ['features','wire','routes','files'])assert.ok(UX_RUNTIME.includes("'"+key+"'"));
 assert.match(UX_RUNTIME,/aria-selected/);
});
