// Remove only redundant gzip copies of bodies already preserved byte-for-byte
// by an immutable reviewed epoch. Current and previous catalog bodies stay local;
// historical routes already fall back to readReviewedEpochBody by the same hash.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readReviewedEpochBody} from '../../src/server/r3-qa-epoch-history.mjs';

const args=process.argv.slice(2);
if(args.length>1||args.some(arg=>!['--check','--dry-run'].includes(arg)))throw Error('Usage: node scripts/r3/compact-current-frames.mjs [--check|--dry-run]');
const path=new URL('../../src/server/product-ui/catalog.gen.mjs',import.meta.url);
const before=await readFile(path,'utf8');
const {catalog,frames}=await import(path.href);
const sha=value=>createHash('sha256').update(value).digest('hex');
const required=new Set(catalog.flatMap(row=>[row.current,row.previous].filter(Boolean)));
for(const digest of required)if(!Object.hasOwn(frames,digest))throw Error('Required catalog frame is missing: '+digest);

const retained={},removed=[];
for(const [digest,packed]of Object.entries(frames)){
  if(required.has(digest)){retained[digest]=packed;continue;}
  const original=gunzipSync(Buffer.from(packed,'base64'));
  if(sha(original)!==digest)throw Error('Catalog frame integrity mismatch: '+digest);
  const archived=await readReviewedEpochBody(digest);
  if(archived===null){retained[digest]=packed;continue;}
  const restored=Buffer.from(archived,'utf8');
  if(sha(restored)!==digest||!original.equals(restored))throw Error('Immutable frame copy differs: '+digest);
  removed.push({digest,utf8Bytes:original.length,gzipBytes:Buffer.from(packed,'base64').length});
}
for(const digest of required)if(retained[digest]!==frames[digest])throw Error('Current or previous frame changed: '+digest);

const lines=before.split('\n');
const index=lines.findIndex(line=>line.startsWith('export const frames='));
if(index<0||lines.filter(line=>line.startsWith('export const frames=')).length!==1)throw Error('Expected one canonical frame export');
if(lines[index]!=='export const frames='+JSON.stringify(frames)+';')throw Error('Canonical frame serialization differs');
lines[index]='export const frames='+JSON.stringify(retained)+';';
const after=lines.join('\n');
const report={format:'order-current-frame-deduplication/v1',beforeSha256:sha(before),afterSha256:sha(after),beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),savedBytes:Buffer.byteLength(before)-Buffer.byteLength(after),framesBefore:Object.keys(frames).length,framesAfter:Object.keys(retained).length,requiredBodies:required.size,currentAndPreviousExact:true,archiveBodiesExact:true,removed,mode:args[0]||'write'};
if(await readFile(path,'utf8')!==before)throw Error('Catalog changed during archive comparison; regenerate and retry');
if(args[0]==='--check'&&removed.length)throw Error('Run scripts/r3/compact-current-frames.mjs after product regeneration; '+removed.length+' immutable body copies remain');
if(!args.length&&before!==after)await writeFile(path,after);
console.log(JSON.stringify(report));
