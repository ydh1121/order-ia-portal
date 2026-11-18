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
 assert.equal(sha256(html),'b8e03bd97363e04b7bd054f98b411d97d8c07069d5916a18d7b6adf97fd388a6');
 assert.equal(sha256(actualCode),'b2aa01b2656bd1e81ce19deacd3369751485afd7413b73e02ab59924474e0662');
 assert.equal((html.match(/<script nonce="qa_20261017">/g)||[]).length,1);
});

test('private QA remains reachable in the same tab when a popup is blocked',()=>{
 const fallback='<details class="ia-tool-fallback"><summary>새 창이 열리지 않을 때</summary><a href="?view=qa-lab">이 탭에서 QA랩 열기</a></details>';
 assert.ok(html.includes(fallback));
 const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
 assert.match(nav, /href="\/ia\?view=qa-lab" target="_blank" rel="noopener noreferrer"/);
 assert.match(nav, /href="\/ia\?view=pricing-r3"/);
 assert.doesNotMatch(nav, /업무 흐름 검토|href="[^"]*view=roles-r3/);
 assert.equal(sha256(html.replace(fallback,'')),'e0150cee58665f8883e497604d87d6024706288b5f82dcd60a9b9b3d09307f3d');
});
