import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createProtectedQuotePreview} from '../src/server/research-app/quote-preview.mjs';

function decode(preview){
  assert.deepEqual(Object.keys(preview),['image']);
  const png=Buffer.from(preview.image.split(',')[1],'base64');
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const chunks=[];let offset=8;
  while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);chunks.push({type,body:png.subarray(offset+8,offset+8+length)});offset+=length+12;}
  assert.deepEqual(chunks.map(value=>value.type),['IHDR','IDAT','IEND'],'PNG contains pixels and no text metadata');
  assert.equal(chunks[0].body.readUInt32BE(0),114);assert.equal(chunks[0].body.readUInt32BE(4),108);
  const rows=inflateSync(chunks[1].body);assert.equal(rows.length,(114*3+1)*108);assert.ok(png.length<8192);
  return rows;
}

test('locked price pixels reveal no source amounts, digit count, price ordering or proportions',async()=>{
  const a=await createProtectedQuotePreview({current:'12540000',proposed:'11940000'});
  const rows=decode(a);
  for(const model of [
    {current:'1254',proposed:'1194'},
    {current:'12540000',proposed:'10040000'},
    {current:'1',proposed:'999999999999999999999999999999999999999999'},
    {current:'100',proposed:'100'},
    {current:'0',proposed:'0'},
    {current:'999.000000000001',proposed:'0.000000000001'}
  ])assert.equal((await createProtectedQuotePreview(model)).image,a.image,'locked output must be independent of every price-derived signal');
  assert.ok(!JSON.stringify(a).includes('12540000')&&!JSON.stringify(a).includes('11940000'));
  const blurred=[...rows].filter(value=>value>170&&value<254);assert.ok(blurred.length>100,'blur is baked into the transmitted pixels');
});

test('missing and malformed comparisons do not create a synthetic locked result',async()=>{
  for(const model of [null,{}, {current:'1'},{current:'1',proposed:'NaN'},{current:'-1',proposed:'1'}])assert.equal(await createProtectedQuotePreview(model),null);
  decode(await createProtectedQuotePreview({current:'999999999999999999999999999999999999999999',proposed:'888888888888888888888888888888888888888888'}));
});
