import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';
import {UX_RUNTIME} from '../src/server/v03-ux.js.mjs';
import {UX_CSS} from '../src/server/v03-ux.css.mjs';
const html=v03OwnerHtml('qa_20261018');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
test('MSG0285 actual OWNER script parses, retaining original 76/190/49 source contracts',()=>{
 const parse=spawnSync(process.execPath,['--check'],{input:script,encoding:'utf8'});
 assert.equal(parse.status,0,parse.stderr);
 const src=html.match(/<script id="sitemap-json" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(src);const data=JSON.parse(src[1]);
 assert.equal(data.items.length,76);
 assert.equal(data.items.reduce((n,x)=>n+x.features.length,0),190);
 assert.equal(data.items.reduce((n,x)=>n+x.actions.length,0),49);
});
test('MSG0285 units, current policy and decisions only from authenticated Google read',()=>{
 assert.match(UX_RUNTIME,/uxScreenRecords=window\.__iaLive\.screens\.items/);
 assert.match(UX_RUNTIME,/정책 검토 항목/);
 assert.match(UX_RUNTIME,/window\.__iaLive\.decisions\.items/);
 assert.match(UX_RUNTIME,/이메일 가입만으로 실제 공급가격이 자동 공개/);
 assert.doesNotMatch(UX_RUNTIME,/fetch\([^)]*method:\s*['"]POST['"]/);
});
test('MSG0285 all ten mobile exceptions and 15 logical links retain real source nodes',()=>{
 assert.match(UX_RUNTIME,/uxLogicalEdges/);
 assert.match(UX_RUNTIME,/\['docops','review','ops'\]/);
 assert.match(UX_RUNTIME,/uxScenarioList/);
 assert.match(UX_RUNTIME,/scenarioButtons\.forEach/);
 assert.match(UX_CSS,/\.ux-journey-links/);
});
test('MSG0285 modal structural wire avoids repeating all functional features',()=>{
 assert.match(UX_RUNTIME,/MutationObserver/);
 assert.match(UX_RUNTIME,/ux-wire-zone/);
 assert.match(UX_RUNTIME,/ux-asset-row/);
 assert.match(UX_RUNTIME,/2026-10-14 자료 확인/);
 assert.match(UX_CSS,/\.ux-wire-zone/);
});
test('MSG0285 print permits original sitemap family to break across pages',()=>{
 assert.match(UX_CSS,/#view-sitemap>\.tree-wrap\.card\{break-inside:auto!important/);
 assert.match(UX_CSS,/@media print/);
 assert.match(UX_CSS,/\.sidebar,#ia-live-banner/);
});
