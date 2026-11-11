/** Bounded ZIP verification inside the existing Pages process. Never writes extracted files. */
import {QaError,safeEntry} from './qa-registry.mjs';
const LIMITS=Object.freeze({package:32*1024*1024,entry:8*1024*1024,expanded:64*1024*1024,files:256});
const invalid=()=>{throw new QaError('RESOURCE_INVALID',409)};
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const crcUpdate=(crc,bytes)=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc>>>0};
export function zipDirectory(bytes,entrypoint){
 if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>LIMITS.package||!safeEntry(entrypoint))invalid();
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);
 let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break}
 if(end<0||u16(end+4)!==0||u16(end+6)!==0)invalid();
 const count=u16(end+10),size=u32(end+12),offset=u32(end+16);
 if(count<1||count>LIMITS.files||u16(end+8)!==count||offset+size!==end)invalid();
 const rows=[],names=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>end||u32(p)!==0x02014b50)invalid();
  const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),expanded=u32(p+24),n=u16(p+28),extra=u16(p+30),comment=u16(p+32),disk=u16(p+34),mode=(u32(p+38)>>>16)&0xf000,local=u32(p+42);
  if(p+46+n+extra+comment>end||flags&~0x0808||![0,8].includes(method)||disk||[compressed,expanded,local].includes(0xffffffff)||![0,0x4000,0x8000].includes(mode))invalid();
  let name;try{name=decoder.decode(bytes.subarray(p+46,p+46+n))}catch{invalid()}
  const directory=name.endsWith('/'),path=directory?name.slice(0,-1):name;
  if(!safeEntry(path)||names.has(path)||expanded>LIMITS.entry||(total+=expanded)>LIMITS.expanded||(directory&&expanded!==0))invalid();
  names.add(path);
  // Reject ZIP64 and Unicode path overrides rather than interpreting multiple path names.
  const checkExtra=(start,len)=>{for(let x=start;x<start+len;){if(x+4>start+len)invalid();const id=u16(x),l=u16(x+2);if(x+4+l>start+len||[1,0x7075,0x6375].includes(id))invalid();x+=4+l}};
  checkExtra(p+46+n,extra);
  if(local+30>offset||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)invalid();
  const ln=u16(local+26),le=u16(local+28),start=local+30+ln+le;
  if(start+compressed>offset)invalid();
  let localName;try{localName=decoder.decode(bytes.subarray(local+30,local+30+ln))}catch{invalid()}
  if(name!==localName)invalid();checkExtra(local+30+ln,le);
  let finish=start+compressed;
  if(flags&8){
   if(finish+12>offset)invalid();if(u32(finish)===0x08074b50)finish+=4;
   if(finish+12>offset||u32(finish)!==crc||u32(finish+4)!==compressed||u32(finish+8)!==expanded)invalid();finish+=12;
  }else if(u32(local+14)!==crc||u32(local+18)!==compressed||u32(local+22)!==expanded)invalid();
  if(method===0&&compressed!==expanded)invalid();
  rows.push({name,directory,method,crc,compressed,expanded,local,start,finish});p+=46+n+extra+comment;
 }
 if(p!==end||!rows.some(x=>x.name===entrypoint&&!x.directory))throw new QaError('MISSING_FILE',404);
 const spans=[...rows].sort((a,b)=>a.local-b.local);let finish=0;
 for(const row of spans){if(row.local!==finish)invalid();finish=row.finish}if(finish!==offset)invalid();
 return {rows,total};
}
export async function verifyZipContents(bytes,entrypoint,entryBytes){
 if(!(entryBytes instanceof Uint8Array)||entryBytes.length>LIMITS.entry)invalid();
 const {rows,total}=zipDirectory(bytes,entrypoint);let actualTotal=0;
 for(const row of rows){
  const compressed=bytes.subarray(row.start,row.start+row.compressed);let stream=new Blob([compressed]).stream();
  if(row.method===8){try{stream=stream.pipeThrough(new DecompressionStream('deflate-raw'))}catch{throw new QaError('ZIP_RUNTIME_UNSUPPORTED',503)}}
  const reader=stream.getReader();let length=0,crc=0xffffffff,different=0;
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;
    length+=value.length;actualTotal+=value.length;
    if(length>row.expanded||length>LIMITS.entry||actualTotal>LIMITS.expanded)invalid();
    crc=crcUpdate(crc,value);
    if(row.name===entrypoint){const start=length-value.length;for(let i=0;i<value.length;i++)different|=value[i]^(entryBytes[start+i]??256)}
   }
  }catch(error){await reader.cancel().catch(()=>{});throw error instanceof QaError?error:new QaError('RESOURCE_INVALID',409)}finally{reader.releaseLock()}
  if(length!==row.expanded||((crc^0xffffffff)>>>0)!==row.crc)invalid();
  if(row.name===entrypoint&&(length!==entryBytes.length||different))throw new QaError('HASH_MISMATCH',409);
 }
 if(actualTotal!==total)invalid();
 return Object.freeze({files:rows.length,expanded_bytes:actualTotal,crc:'VERIFIED_ALL',entry_bytes_equal:true});
}
