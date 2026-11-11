import {QaError,safeEntry} from './qa-registry.mjs';
const MAX_PACKAGE=32*1024*1024,MAX_ENTRY=8*1024*1024,MAX_EXPANDED=64*1024*1024,MAX_FILES=256;
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const array=x=>x instanceof Uint8Array?x:null;
export function inspectZip(bytes,entry){
 if(!array(bytes)||bytes.byteLength<22||bytes.byteLength>MAX_PACKAGE)throw new QaError('RESOURCE_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||v.getUint16(end+4,true)!==0||v.getUint16(end+6,true)!==0)throw new QaError('RESOURCE_INVALID');
 const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
 if(count<1||count>MAX_FILES||count!==v.getUint16(end+8,true)||offset+size!==end)throw new QaError('RESOURCE_INVALID');
 let p=offset,total=0,match=null;const names=new Set();
 for(let i=0;i<count;i++){
  if(p+46>end||v.getUint32(p,true)!==0x02014b50)throw new QaError('RESOURCE_INVALID');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),uncompressed=v.getUint32(p+24,true),n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),external=v.getUint32(p+38,true),local=v.getUint32(p+42,true);
  if(p+46+n+extra+comment>end||flags&1||![0,8].includes(method)||uncompressed===0xffffffff||compressed===0xffffffff||local===0xffffffff||((external>>>16)&0xf000)===0xa000)throw new QaError('RESOURCE_INVALID');
  let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+n));}catch{throw new QaError('RESOURCE_INVALID')}
  const path=name.endsWith('/')?name.slice(0,-1):name;
  if(!safeEntry(path)||names.has(name)||uncompressed>MAX_ENTRY||(total+=uncompressed)>MAX_EXPANDED)throw new QaError('RESOURCE_INVALID');
  names.add(name);
  if(local+30>offset||v.getUint32(local,true)!==0x04034b50)throw new QaError('RESOURCE_INVALID');
  const ln=v.getUint16(local+26,true),le=v.getUint16(local+28,true);
  if(local+30+ln+le+compressed>offset||v.getUint16(local+6,true)!==flags||v.getUint16(local+8,true)!==method)throw new QaError('RESOURCE_INVALID');
  const localName=new TextDecoder().decode(bytes.subarray(local+30,local+30+ln));if(localName!==name)throw new QaError('RESOURCE_INVALID');
  if(name===entry)match={name,size:uncompressed};
  p+=46+n+extra+comment;
 }
 if(p!==offset+size||!match)throw new QaError('MISSING_FILE',404);
 return {files:count,expanded_bytes:total,entry:match};
}
export async function verifyBundle(record,bundle){
 if(!bundle||!array(bundle.packageBytes)||!array(bundle.entryBytes))throw new QaError('MISSING_FILE',404);
 const packageBytes=bundle.packageBytes,entryBytes=bundle.entryBytes;
 if(packageBytes.byteLength>MAX_PACKAGE||entryBytes.byteLength>MAX_ENTRY)throw new QaError('RESOURCE_INVALID');
 if(packageBytes.byteLength!==(record.size_bytes??record.package_bytes)||await digest(packageBytes)!==record.package_sha256)throw new QaError('HASH_MISMATCH',409);
 if(entryBytes.byteLength!==(record.entrypoint_bytes??record.size_bytes)||await digest(entryBytes)!==(record.entrypoint_sha256??record.package_sha256))throw new QaError('HASH_MISMATCH',409);
 if(bundle.baseline!==record.baseline_commit)throw new QaError('BASELINE_MISMATCH',409);
 const zip=record.source_format==='single_html'?null:inspectZip(packageBytes,record.entrypoint);
 if(zip&&zip.entry.size!==entryBytes.byteLength)throw new QaError('RESOURCE_INVALID');
 return {package_sha256:record.package_sha256,entrypoint_sha256:record.entrypoint_sha256||record.package_sha256,package_bytes:packageBytes.byteLength,entrypoint_bytes:entryBytes.byteLength,zip,integrity:'VERIFIED',preview_allowed:false};
}
