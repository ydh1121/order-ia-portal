import {reviewQuoteFixture} from '../../../scripts/r3/authored/quote-result-fixture.mjs';

// This server module receives a model after its caller has checked ownership.
// It never grants access to a quote or serializes the source amounts. QA uses
// its existing isolated fixture; an operational transport must retain its ACL.
const width=114,height=108;
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const checksum=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
const be32=value=>Uint8Array.of(value>>>24,value>>>16,value>>>8,value);
function concat(...chunks){const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}
function chunk(type,bytes){const content=concat(new TextEncoder().encode(type),bytes);return concat(be32(bytes.length),content,be32(checksum(content)));}
function comparisonExists(model){
  const valid=value=>typeof value==='string'&&/^\d{1,100}(?:\.\d{1,12})?$/.test(value);
  return valid(model?.current)&&valid(model?.proposed);
}
function painted(){
  const pixels=new Uint8Array(width*height*3).fill(255);
  const set=(x,y,color)=>{if(x<0||y<0||x>=width||y>=height)return;const at=(y*width+x)*3;pixels.set(color,at);};
  const rect=(x,y,w,h,color,radius=0)=>{
    for(let py=Math.floor(y);py<Math.ceil(y+h);py++)for(let px=Math.floor(x);px<Math.ceil(x+w);px++){
      const dx=Math.max(x+radius-px,0,px-(x+w-radius)),dy=Math.max(y+radius-py,0,py-(y+h-radius));
      if(!radius||dx*dx+dy*dy<=radius*radius)set(px,py,color);
    }
  };
  // Locked pixels are deliberately independent of price, relative change,
  // ordering and zero values. Blurring a real graph still leaks its geometry.
  // The disclosed renderer continues to receive the authorized real model.
  for(const [index,tall]of [[0,79],[1,60]]){
    const left=index?63:34,top=107-tall;
    rect(left,top,18,tall,index?[105,126,169]:[218,218,218],3);
    // Fixed, non-numeric text silhouettes are intentionally independent of the
    // actual amount, digit count and currency precision. Blurring real digits
    // would leave a recoverable source image; these masks contain no digits.
    const labelLeft=index?63:8;
    for(let glyph=0;glyph<6;glyph++)rect(labelLeft+glyph*6,top-17,4,4,[122,135,154]);
    for(let glyph=0;glyph<9;glyph++)rect(labelLeft+glyph*4,top-10,2,5,[100,112,130],1);
  }
  // Blur the pixels before transmission, rather than hiding source data with
  // CSS. A fixed three-pass box blur needs no font/canvas runtime in Workers.
  let output=pixels;
  for(let pass=0;pass<3;pass++)for(const axis of [0,1]){
    const next=new Uint8Array(output.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let channel=0;channel<3;channel++){
      let sum=0;for(let step=-2;step<=2;step++){
        const px=Math.max(0,Math.min(width-1,x+(axis===0?step:0))),py=Math.max(0,Math.min(height-1,y+(axis===1?step:0)));
        sum+=output[(py*width+px)*3+channel];
      }
      next[(y*width+x)*3+channel]=Math.round(sum/5);
    }
    output=next;
  }
  return output;
}

/** A valid, caller-authorized comparison may show a generic locked preview.
 * Its PNG is identical for every price pair; neither digits nor real graph
 * proportions cross this boundary. Actual proportions require disclosure. */
export async function createProtectedQuotePreview(model){
  if(!comparisonExists(model))return null;
  const pixels=painted();
  const rows=new Uint8Array((width*3+1)*height);
  for(let y=0;y<height;y++)rows.set(pixels.subarray(y*width*3,(y+1)*width*3),y*(width*3+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const png=concat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',concat(be32(width),be32(height),Uint8Array.of(8,2,0,0,0))),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
  let binary='';for(const byte of png)binary+=String.fromCharCode(byte);
  return {image:'data:image/png;base64,'+btoa(binary)};
}

let fixturePreview;
export async function researchQuoteResultMarkup(html){
  // The retained renderer can move from a disclosed review state to locked
  // without replacing its DOM. Ship the same safe preview with those scenes.
  fixturePreview??=createProtectedQuotePreview(reviewQuoteFixture('saving').model);
  const preview=await fixturePreview;
  return preview?html+'<template data-research-result-preview><img src="'+preview.image+'" width="342" height="324" alt="비공개 견적 결과의 예시 미리보기. 실제 금액과 비율은 인증 후 확인할 수 있어요."></template>':html;
}
