import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createProtectedQuotePreview,researchQuoteResultMarkup} from '../src/server/research-app/quote-preview.mjs';

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

const band=(rows,left,top,right,bottom)=>{
  const values=[];
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)for(let channel=0;channel<3;channel++)values.push(rows[y*(114*3+1)+1+x*3+channel]);
  return values;
};
const ink=(rows,left)=>band(rows,left,28,left+8,107).reduce((total,value)=>total+255-value,0);

test('locked graph uses the real server comparison while returning only baked-blur pixels',async()=>{
  const a=await createProtectedQuotePreview({current:'12540000',proposed:'11940000'});
  const rows=decode(a);
  const steeper=decode(await createProtectedQuotePreview({current:'12540000',proposed:'10040000'}));
  const reversed=decode(await createProtectedQuotePreview({current:'11940000',proposed:'12540000'}));
  const equal=decode(await createProtectedQuotePreview({current:'12540000',proposed:'12540000'}));
  const zero=decode(await createProtectedQuotePreview({current:'12540000',proposed:'0'}));
  assert.ok(ink(rows,68)>ink(steeper,68)*2,'a larger saving visibly lowers the proposed bar');
  assert.ok(ink(reversed,68)>ink(rows,68),'a higher proposed price is the tall bar');
  assert.ok(ink(reversed,39)<ink(rows,39),'the lower current price is no longer the tall bar');
  assert.ok(ink(equal,68)>ink(rows,68),'equal positive prices use the full height for both bars');
  assert.ok(ink(zero,68)<ink(steeper,68)/2,'a genuinely zero price has no synthetic minimum-height bar');
  assert.ok(!JSON.stringify(a).includes('12540000')&&!JSON.stringify(a).includes('11940000'));
  const blurred=[...rows].filter(value=>value>170&&value<254);assert.ok(blurred.length>100,'blur is baked into the transmitted pixels');
});

test('real amount labels are rasterized while scale-equivalent comparisons keep the same bar geometry',async()=>{
  const large=await createProtectedQuotePreview({current:'12540000',proposed:'11940000'});
  const small=await createProtectedQuotePreview({current:'1254',proposed:'1194'});
  assert.notEqual(small.image,large.image,'different actual amount text cannot reuse a fixed silhouette');
  const a=decode(large),b=decode(small);
  assert.deepEqual(band(a,38,35,49,100),band(b,38,35,49,100),'the same ratio preserves current bar pixels below the text');
  assert.deepEqual(band(a,67,57,78,100),band(b,67,57,78,100),'the same ratio preserves proposed bar pixels below the text');
  assert.equal((await createProtectedQuotePreview({current:'1254.000',proposed:'1194.000000'})).image,small.image,'decimal scale does not change the amount or geometry');
  const html=await researchQuoteResultMarkup('<main></main>');
  assert.match(html,/계산된 현재 납품가와 검색된 가격의 흐린 미리보기/);
  assert.doesNotMatch(html,/12540000|11940000|12,540,000|11,940,000|예시 미리보기/);
});

test('missing and malformed comparisons do not create a synthetic locked result',async()=>{
  for(const model of [null,{}, {current:'1'},{current:'1',proposed:'NaN'},{current:'-1',proposed:'1'},{current:'1e9',proposed:'1'},{current:'9'.repeat(101),proposed:'1'},{current:'1.1234567890123',proposed:'1'}])assert.equal(await createProtectedQuotePreview(model),null);
  decode(await createProtectedQuotePreview({current:'999999999999999999999999999999999999999999',proposed:'888888888888888888888888888888888888888888'}));
  decode(await createProtectedQuotePreview({current:'0',proposed:'0'}));
  decode(await createProtectedQuotePreview({current:'999.000000000001',proposed:'0.000000000001'}));
});
