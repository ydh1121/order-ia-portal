import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {supplementalHistoryCommit,supplementalHistoryRows,supplementalHistoryBodies,supplementalHistoryScripts,supplementalHistoryCssGzip,supplementalHistoryCssHash,supplementalHistoryExtraCss} from '../src/server/r3-ui/supplemental-history.gen.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const inflate=value=>gunzipSync(Buffer.from(value,'base64')).toString();
test('the 48 official supplemental documents retain their original body, script, stylesheet and every viewport identity',()=>{
  assert.equal(supplementalHistoryCommit,'9c502a19bbc63813d87c2f9741ef55ea39f18f7c');
  assert.equal(Object.keys(supplementalHistoryRows).length,48);
  assert.equal(digest(inflate(supplementalHistoryCssGzip)),supplementalHistoryCssHash);
  for(const [id,record] of Object.entries(supplementalHistoryRows)){
    const body=inflate(supplementalHistoryBodies[record.body]),script=inflate(supplementalHistoryScripts[record.script]);
    assert.equal(digest(body),record.body,id+' body');assert.equal(digest(script),record.script,id+' runtime');
    assert.equal(record.row.id,id);assert.deepEqual(record.hashes,record.row.hashes);
    for(const [width,hash] of Object.entries(record.hashes))assert.equal(digest([id,width,body,supplementalHistoryCssHash,supplementalHistoryExtraCss,script].join('|')),hash,id+' '+width);
  }
});
