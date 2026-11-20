// Wrangler --outfile writes the uncompressed multipart upload: metadata plus
// every Worker module. Check its actual bytes, not a gzip/ZIP or only index.js.
import {open,stat} from 'node:fs/promises';

const path=process.argv[2];
if(!path||process.argv.length!==3)throw Error('Usage: node scripts/check-pages-bundle-size.mjs <wrangler-output.bundle>');
const file=await stat(path);
if(!file.isFile()||file.size===0)throw Error('Expected a non-empty Pages Functions upload bundle');

const handle=await open(path,'r');
try{
 const {buffer,bytesRead}=await handle.read(Buffer.alloc(1024),0,1024,0);
 const header=buffer.subarray(0,bytesRead).toString('utf8');
 if(!/^--[^\r\n]+\r\n/.test(header)||!header.includes('Content-Disposition: form-data; name="metadata"')||!header.includes('"main_module":')){
  throw Error('Expected the uncompressed multipart bundle from wrangler pages functions build --outfile');
 }
}finally{await handle.close();}

const limitBytes=25*1024*1024;
console.log(JSON.stringify({artifact:path,bytes:file.size,limitBytes,remainingBytes:limitBytes-file.size,status:file.size<=limitBytes?'PASS':'FAIL'}));
if(file.size>limitBytes){
 console.error(`Pages Functions upload bundle is ${file.size} bytes; the 25 MiB limit is ${limitBytes} bytes.`);
 process.exitCode=1;
}
