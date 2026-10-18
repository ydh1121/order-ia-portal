import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UX_CSS} from '../src/server/v03-ux.css.mjs';

test('P10 journey A4 pagination is scoped to print and retains the selected exception result',()=>{
 const section=UX_CSS.split('MSG-20261018-0290: P10 A4 print pagination only.')[1];
 assert.ok(section,'P10 print rule must remain present');
 assert.match(section,/@media print\s*\{/);
 assert.match(section,/#view-journey #scenario-output\s*\{/);
 assert.match(section,/break-inside:auto!important/);
 assert.match(section,/#view-journey \.scenario-list\s*\{/);
 assert.match(section,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(section,/scenario-output\s*\{[^}]*display:none/);
});
test('P10 print includes on-screen paginated 25 decision entries and 31 notes',()=>{
 const section=UX_CSS.split('MSG-20261018-0290: P10 A4 print pagination only.')[1];
 assert.match(section,/#view-pending #pending-list article\.pending-entry\[hidden\]\{display:block!important\}/);
 assert.match(section,/#view-feedback \.ux-note-table details\.ux-hidden\{display:block!important\}/);
 assert.doesNotMatch(section,/#view-pending #pending-list\s*\{[^}]*overflow:hidden/);
});
test('P10 print-only source change does not modify default screen styles or other routes',()=>{
 const section=UX_CSS.split('MSG-20261018-0290: P10 A4 print pagination only.')[1];
 assert.equal((section.match(/@media print\s*\{/g)||[]).length,1);
 for(const selector of ['#view-journey','#view-pending','#view-feedback'])assert.ok(section.includes(selector));
 for(const blocked of ['@media screen','@media (max-width','[data-view','display:none!important'])assert.ok(!section.includes(blocked),'Unexpected change: '+blocked);
});
