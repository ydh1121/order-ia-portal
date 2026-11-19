import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {publicationIdentity} from '../src/server/r3-qa-publication.mjs';
import {handleIaRequest} from '../src/server/router.mjs';

test('authenticated QA catalog reads only its immutable publication', async () => {
  const database = new DatabaseSync(':memory:');
  const env = {ORDER_QA_DB: {prepare(sql) {
    return {bind(...values) { return {first: async () => database.prepare(sql).get(...values)}; }};
  }}};
  const request = new Request('https://feat-ia-r3-private-0585.order-ia-portal.pages.dev/api/ia/r3-qa/artifact');
  const catalog = async () => (await serveR3Artifact(request, env)).json();
  try {
    assert.equal((await handleIaRequest(request, env)).status, 403);
    assert.equal((await catalog()).publication, null);
    database.exec(readFileSync(new URL('../migrations/0012_r3_qa_publication.sql', import.meta.url), 'utf8'));
    const {candidateId, catalogDigest, productCommit} = await publicationIdentity();
    const insert = database.prepare('INSERT INTO qa_publications(candidate_id,catalog_digest,product_commit,ia_commit,deployment_id) VALUES(?,?,?,?,?)');
    const iaCommit = 'a'.repeat(40), deploymentId = '12345678-1234-1234-1234-123456789000';
    insert.run('another-candidate',catalogDigest,productCommit,'b'.repeat(40),'99999999-1234-1234-1234-123456789000');
    assert.equal((await catalog()).publication, null);
    const row = [candidateId,catalogDigest,productCommit,iaCommit,deploymentId];
    assert.equal(insert.run(...row).changes, 1);
    assert.equal(insert.run(...row).changes, 0);
    assert.deepEqual((await catalog()).publication, {iaCommit,productCommit,deploymentId});
    for (const [hostname,expected] of [['order-ia-portal.pages.dev',null],['12345678.order-ia-portal.pages.dev',{iaCommit,productCommit,deploymentId}]]) {
      const url = new URL(request.url);url.hostname=hostname;
      const response = await serveR3Artifact(new Request(url),env);
      assert.deepEqual((await response.json()).publication, expected);
    }
    const mainCommit = 'd'.repeat(40), mainDeploymentId = '87654321-1234-1234-1234-123456789000';
    insert.run(candidateId+':main',catalogDigest,productCommit,mainCommit,mainDeploymentId);
    for (const [hostname,expected] of [
      ['order-ia-portal.pages.dev',{iaCommit:mainCommit,productCommit,deploymentId:mainDeploymentId}],
      ['87654321.order-ia-portal.pages.dev',{iaCommit:mainCommit,productCommit,deploymentId:mainDeploymentId}],
      ['feat-ia-r3-private-0585.order-ia-portal.pages.dev',{iaCommit,productCommit,deploymentId}],
      ['another-branch.order-ia-portal.pages.dev',null]
    ]) {
      const url = new URL(request.url);url.hostname=hostname;
      assert.deepEqual((await (await serveR3Artifact(new Request(url),env)).json()).publication,expected);
    }
    assert.throws(() => insert.run(candidateId,catalogDigest,productCommit,'c'.repeat(40),deploymentId), /already recorded/);
    assert.throws(() => database.exec("UPDATE qa_publications SET ia_commit='" + 'c'.repeat(40) + "'"), /immutable/);
    assert.throws(() => database.exec('DELETE FROM qa_publications'), /immutable/);
    assert.throws(() => database.prepare('INSERT OR REPLACE INTO qa_publications(candidate_id,catalog_digest,product_commit,ia_commit,deployment_id) VALUES(?,?,?,?,?)')
      .run('third-candidate',catalogDigest,productCommit,iaCommit,deploymentId), /already recorded/);
  } finally {database.close();}
});
