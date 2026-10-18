import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';
const html=v03OwnerHtml('qa_20261017');
const sha256=s=>createHash('sha256').update(s).digest('hex');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const reference=JSON.parse(scripts.find(m=>m[0].includes('id="sitemap-json"'))[1]);
const actualCode=scripts.at(-1)[1];
test('rendered inline JS passes Node syntax verification (not a mock)',()=>{
 const cmd=spawnSync(process.execPath,['--check'],{input:actualCode,encoding:'utf8'});
 assert.equal(cmd.status,0,cmd.stderr);
});
test('same 8 original interactive views, SVG canvas and two-column modal are present',()=>{
 for(const name of ['overview','sitemap','journey','operation','roadmap','policy','pending','feedback'])assert.ok(html.includes('id="view-'+name+'"'),name);
 for(const id of ['modal-root','modal-wire','modal-features','modal-route','flow-lines','scenario-output','status-filter','pending-filter','print-btn'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/PLANNING \/ HIERARCHICAL IA · v0\.3/);
});
test('server-only original 76 IDs, 190 features and 49 labeled buttons match exactly',()=>{
 assert.equal(reference.items.length,76);
 assert.equal(reference.items.reduce((n,x)=>n+(x.features||[]).length,0),190);
 assert.equal(reference.items.reduce((n,x)=>n+(x.actions||[]).length,0),49);
 assert.equal(reference.families.length,5);
});
test('current Google source exclusively controls decisions and provider status; no old 22 defaults',()=>{
 assert.match(actualCode,/fetch\('\/api\/ia\/dashboard'/);
 assert.match(actualCode,/live\.decisionCount!==25/);
 assert.match(actualCode,/live\.decisions\.fullyApproved!==1/);
 assert.match(actualCode,/PENDING-19/);
 assert.match(actualCode,/alias=aliases\[query\.get\('view'\)\]/);
 assert.doesNotMatch(html,/전체 22개 · 미결정 21개/);
});
test('QA fixture and full template have verifiable sha256 and nonce bound script',()=>{
 assert.equal(sha256(html),'8f7c18a8e5576158ab054d1048115f0fa630fa05e249da708254497ec9767e8a');
 assert.equal(sha256(actualCode),'cca60de1ec65cfdcc2d9b78960b68b2ffb86979654fa7d1e7f3998eb7b99ce46');
 assert.equal((html.match(/<script nonce="qa_20261017">/g)||[]).length,1);
});
