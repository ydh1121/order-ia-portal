import test from 'node:test';
import assert from 'node:assert/strict';
import {frames} from '../src/server/r3-ui/catalog.gen.mjs';
import * as logoHistory from '../src/server/r3-ui/logo-correction-history.gen.mjs';
import * as brandHistory from '../src/server/r3-ui/brand-history.gen.mjs';

// The immutable archive modules retain every original byte for provenance.
// Production serves these bodies from the existing canonical frame inventory,
// allowing the bundler to omit the otherwise unused duplicate body exports.
for(const [name,history] of [['logo correction',logoHistory],['shared brand',brandHistory]]){
 test(name+' history retains all 498 review identities and exact bodies in the canonical frame inventory',()=>{
  assert.equal(Object.keys(history.archivedRows).length,498,'the full preserved review inventory remains present');
  for(const [id,row] of Object.entries(history.archivedRows)){
   assert.ok(Object.hasOwn(history.archivedBodies,row.body),id+' has its immutable historical body');
   assert.ok(Object.hasOwn(frames,row.body),id+' can be served without a duplicate fallback');
  }
  for(const [digest,body] of Object.entries(history.archivedBodies)){
   assert.equal(frames[digest],body,digest+' retains the exact original compressed bytes');
  }
 });
}
