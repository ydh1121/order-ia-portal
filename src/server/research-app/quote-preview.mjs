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
function values(model){
  const parse=value=>typeof value==='string'&&/^\d{1,100}(?:\.\d{1,12})?$/.test(value)?value.split('.'):null;
  const current=parse(model?.current),proposed=parse(model?.proposed);if(!current||!proposed)return null;
  const scale=Math.max(current[1]?.length||0,proposed[1]?.length||0);
  const minor=parts=>BigInt(parts[0]+(parts[1]||'').padEnd(scale,'0'));
  const label=parts=>parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(parts[1]?.replace(/0+$/,'')?'.'+parts[1].replace(/0+$/,''):'')+'원';
  return {current:minor(current),proposed:minor(proposed),labels:[label(current),label(proposed)]};
}

// Tiny server masks from the existing Pretendard font (9599f12fd42f), at 6px.
// Workers needs no font service or client canvas. These render the real labels
// and amounts into a private buffer; only the already-blurred PNG is returned.
const glyphs={
  '0':[4,'e,a,a,e'],'1':[3,'6,2,2,2'],'2':[4,'e,2,4,e'],'3':[4,'e,6,2,e'],
  '4':[4,'6,6,e,2'],'5':[4,'e,e,2,e'],'6':[4,'7,6,4,7'],'7':[3,'7,1,2,2'],
  '8':[4,'7,7,4,7'],'9':[4,'6,4,7,7'],',':[2,'0,2'],'.':[2,'2'],
  '원':[5,'f,17,1f,f,8,f'],
  '현재 납품가':[27,'24645e3,7fe445f,5d67fe7,37e25eb,2063d33,3c03de1'],
  '검색된 가격':[27,'357d06d,1d713e7,27ed0ff,3dff16f,2428261,3c0f021'],
  '최저가':[16,'5046,f27e,f3ce,5756,f466,42']
};
function painted(model){
  const money=values(model);if(!money)return null;
  const pixels=new Uint8Array(width*height*3).fill(255);
  const set=(x,y,color)=>{if(x<0||y<0||x>=width||y>=height)return;const at=(y*width+x)*3;pixels.set(color,at);};
  const rect=(x,y,w,h,color,radius=0)=>{
    for(let py=Math.floor(y);py<Math.ceil(y+h);py++)for(let px=Math.floor(x);px<Math.ceil(x+w);px++){
      const dx=Math.max(x+radius-px,0,px-(x+w-radius)),dy=Math.max(y+radius-py,0,py-(y+h-radius));
      if(!radius||dx*dx+dy*dy<=radius*radius)set(px,py,color);
    }
  };
  const text=(value,x,y,color,maxWidth=44)=>{
    const masks=glyphs[value]?[glyphs[value]]:[...value].map(character=>glyphs[character]);
    const natural=masks.reduce((sum,mask)=>sum+mask[0],0),scale=Math.min(1,maxWidth/natural);let advance=0;
    for(const [wide,rows]of masks){
      rows.split(',').forEach((row,dy)=>{const bits=parseInt(row,16);for(let dx=0;dx<wide;dx++)if(bits&2**(wide-dx-1))set(Math.floor(x+(advance+dx)*scale),y+dy,color);});
      advance+=wide;
    }
  };
  const delta=money.current>money.proposed?money.current-money.proposed:money.proposed-money.current;
  // Match the existing disclosed renderer's zoomed axis, including zero and
  // equal prices. Decimal normalization stays exact until pixel quantization.
  const spread=money.current?Number(delta*100000n/money.current)/100000:1;
  const short=Math.max(.12,Math.min(1,1-spread*5.38)),currentHigh=money.current>=money.proposed;
  for(const [index,high]of [[0,currentHigh],[1,!currentHigh||money.current===money.proposed]]){
    const value=index?money.proposed:money.current;
    const tall=value===0n?0:high?79:Math.round(79*short),left=index?63:34,top=107-tall;
    rect(left,top,18,tall,index?[105,126,169]:[218,218,218],3);
    const labelLeft=index?63:8;
    text(index?(money.current>money.proposed?'최저가':'검색된 가격'):'현재 납품가',labelLeft,top-17,[122,135,154]);
    text(money.labels[index],labelLeft,top-10,[100,112,130]);
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

/** Only already-obscured pixels cross this presentation boundary. Raw amounts
 * and an unblurred image are never returned. Actual graph shapes necessarily
 * convey relative prices; this cannot promise that visual inference is zero. */
export async function createProtectedQuotePreview(model){
  const pixels=painted(model);if(!pixels)return null;
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
  return preview?html+'<template data-research-result-preview><img src="'+preview.image+'" width="342" height="324" alt="계산된 현재 납품가와 검색된 가격의 흐린 미리보기. 정확한 금액은 인증 후 확인할 수 있어요."></template>':html;
}
