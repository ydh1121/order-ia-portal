import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleR3Review} from '../src/server/r3-review-store.mjs';
import {mountReviewDownloads} from '../src/server/r3-qa-downloads.mjs';

const source='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
test('immutable import download assembles ordered original bytes and keeps response private',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
  const env={ORDER_QA_DB:{prepare(sql){const statement=db.prepare(sql);return{bind(...args){return{
    first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)})
  };}};}}};
  const path='/legacy-source';
  const read=()=>handleR3Review({request:new Request('https://qa.invalid'+path),path,env,actor:{id:'qa'}});
  try{
    assert.equal((await read()).status,503);
    const raw=new TextEncoder().encode('{"기록":"원본"}\r\n');
    db.prepare('INSERT INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version) VALUES(?,?,2,0,1)').run(source,raw.length);
    const insert=db.prepare('INSERT INTO qa_legacy_chunks(source_sha,ordinal,raw_bytes) VALUES(?,?,?)');
    insert.run(source,1,raw.slice(3));insert.run(source,0,raw.slice(0,3));
    assert.equal((await read()).status,503);
    db.prepare('UPDATE qa_legacy_sources SET complete=1 WHERE sha256=?').run(source);
    const response=await read();
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),raw);
  }finally{db.close();}
});

test('offline snapshot failure keeps outstanding drafts explicitly separate from server backup',async t=>{
  const handlers=new Map();
  let result,message;
  t.mock.method(globalThis,'fetch',async()=>{throw Error('offline');});
  const savedDocument=globalThis.document;
  globalThis.document={addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener:(key)=>handlers.delete(key)};
  try{
    const detach=mountReviewDownloads({release:'MSG0585-R3',notify:m=>message=m,getLocalDrafts:()=>[['key','내 초안']],onOfflineDraftBackup:d=>result=d});
    await handlers.get('click')({target:{closest:()=>({dataset:{labAction:'export-review'}})},preventDefault(){},stopImmediatePropagation(){}});
    assert.deepEqual(result,[['key','내 초안']]);assert.match(message,/초안만/);
    detach();assert.equal(handlers.size,0);
  }finally{if(savedDocument)globalThis.document=savedDocument;else delete globalThis.document;}
});
