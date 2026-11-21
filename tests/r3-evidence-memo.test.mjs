import test from 'node:test';
import assert from 'node:assert/strict';
import {validCaseContext} from '../src/server/r3-role-workspace.mjs';

test('evidence notes accept 500 non-space graphemes and reject the next one without discarding whitespace',()=>{
 const memo=('가 나\n').repeat(250);
 assert.equal(validCaseContext({memo},'reprice','attach'),true);
 assert.equal(validCaseContext({memo:memo+'다'},'reprice','attach'),false);
 assert.equal(validCaseContext({memo:'e\u0301'.repeat(500)},'reprice','attach'),true);
 assert.equal(validCaseContext({memo:'e\u0301'.repeat(501)},'reprice','attach'),false);
 assert.equal(validCaseContext({memo:'😀'.repeat(500)},'reprice','attach'),true);
 assert.equal(validCaseContext({memo:'가'+' '.repeat(4000)},'reprice','attach'),false);
});

test('memo counting does not loosen the context field, empty-text or control-character boundary',()=>{
 assert.equal(validCaseContext({memo:'\n  '},'reprice','attach'),false);
 assert.equal(validCaseContext({memo:'가\u0000나'},'reprice','attach'),false);
 assert.equal(validCaseContext({memo:'메모',signatureBound:true},'reprice','attach'),false);
 assert.equal(validCaseContext({subject:'가'.repeat(101)},'consult','create'),false);
});
