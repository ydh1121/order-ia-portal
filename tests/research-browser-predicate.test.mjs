import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('strict-CSP browser predicate transport preserves verdicts, timeout and failures',()=>{
  const result=spawnSync('python3',['-B',fileURLToPath(new URL('./browser_predicate_support_unit.py',import.meta.url))],{encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message||result.stdout+result.stderr);
});
