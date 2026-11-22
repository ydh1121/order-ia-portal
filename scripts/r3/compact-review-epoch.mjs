// Lossless delta against an immutable full epoch. The original capture remains
// the authority; this changes only storage, never a response or feedback hash.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const [basePath,fullPath,output,packing]=process.argv.slice(2);if(!basePath||!fullPath||!output||process.argv.length>6||packing&&packing!=='--fragment-slices')throw Error('Usage: compact-review-epoch.mjs base-full.mjs captured-full.mjs output.mjs [--fragment-slices]');
const [base,full]=await Promise.all([basePath,fullPath].map(p=>import(pathToFileURL(resolve(p)))));
const read=value=>JSON.parse(gunzipSync(Buffer.from(value,'base64'))),sha=value=>createHash('sha256').update(value).digest('hex'),zip=value=>gzipSync(value,{level:9,mtime:0}).toString('base64');
const previous=read(base.epochIndexGzip),next=read(full.epochIndexGzip),parts=read(base.epochFragmentsGzip),nextParts=read(full.epochFragmentsGzip);
if(previous.format!=='order-reviewed-epoch/v1'||next.format!==previous.format)throw Error('Both inputs must be full verified captures');
const known=new Map(parts.map((part,i)=>[part,i])),added=[],mapped=nextParts.map(part=>{if(known.has(part))return known.get(part);const i=parts.length+added.length;known.set(part,i);added.push(part);return i;});
const remap=recipe=>recipe.map(part=>typeof part==='number'?mapped[part]:part);
function expand(nodes,n){const [kind,value]=nodes[n];return kind==='null'?null:kind==='array'?value.map(i=>expand(nodes,i)):kind==='object'?Object.fromEntries(value.map(([k,i])=>[k,expand(nodes,i)])):value;}
function diff(a,b,hash){
 if(JSON.stringify(a)===JSON.stringify(b))return null;
 if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){const changes=[];for(let i=0;i<b.length;i++){const change=diff(a[i],b[i],hash);if(change)changes.push([i,change]);}return ['a',changes];}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const changes=[];for(const k of Object.keys(a))if(!Object.hasOwn(b,k))changes.push([k,['d']]);for(const k of Object.keys(b)){const change=diff(a[k],b[k],hash);if(change)changes.push([k,change]);}return ['o',changes];}
 const value=JSON.stringify(b)===undefined?null:b;return ['v',replaceHash(value,hash)];
}
function replaceHash(value,hash){return value===hash?{__orderCurrentHash:1}:Array.isArray(value)?value.map(v=>replaceHash(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceHash(v,hash)])):value;}
function hydrate(value,hash){return value&&typeof value==='object'&&Object.keys(value).length===1&&value.__orderCurrentHash===1?hash:Array.isArray(value)?value.map(v=>hydrate(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,hash)])):value;}
function patch(base,change,hash){if(!change)return base;if(change[0]==='v')return hydrate(change[1],hash);const result=Array.isArray(base)?[...base]:{...base};for(const [k,p] of change[1]){if(p[0]==='d')delete result[k];else result[k]=patch(result[k],p,hash);}return result;}
const candidates=new Map();for(const [key,n] of Object.entries(previous.records)){const prefix=key.slice(0,key.lastIndexOf('|'));if(!candidates.has(prefix))candidates.set(prefix,[]);candidates.get(prefix).push(n);}
const records={},patches=[],patchIds=new Map(),cache=new Map();const oldRecord=n=>{if(!cache.has(n))cache.set(n,expand(previous.nodes,n));return cache.get(n);};
for(const [key,n] of Object.entries(next.records)){
 if(Object.hasOwn(previous.records,key))continue;
 const record=expand(next.nodes,n);for(const name of Object.keys(record.fields))record.fields[name]=remap(record.fields[name]);
 const hash=key.slice(key.lastIndexOf('|')+1),possible=candidates.get(key.slice(0,key.lastIndexOf('|')))||[];let chosen=null;
 for(const baseNode of possible){const delta=diff(oldRecord(baseNode),record,hash),encoded=JSON.stringify(delta);if(!chosen||encoded.length<chosen.encoded.length)chosen={baseNode,delta,encoded};}
 if(!chosen)chosen={baseNode:null,delta:['v',replaceHash(record,hash)],encoded:JSON.stringify(['v',replaceHash(record,hash)])};
 if(JSON.stringify(patch(chosen.baseNode===null?null:oldRecord(chosen.baseNode),chosen.delta,hash))!==JSON.stringify(record))throw Error('Patch mismatch '+key);
 let patchId=patchIds.get(chosen.encoded);if(patchId===undefined){patchId=patches.length;patchIds.set(chosen.encoded,patchId);patches.push(chosen.delta);}records[key]=[chosen.baseNode,patchId];
}
const bodies={};for(const [digest,recipe] of Object.entries(next.bodies))if(!Object.hasOwn(previous.bodies,digest))bodies[digest]=remap(recipe);
const index={format:'order-reviewed-epoch-delta/v1',records,patches,bodies,replayRecipe:remap(next.replayRecipe)},indexJson=JSON.stringify(index),fragmentJson=JSON.stringify(added);
function fragmentSlices(baseParts,fragments){
 // Frozen captures use 32 KiB chunks. Small edits shift those boundaries, so
 // reuse exact substrings instead of serializing almost-identical chunks again.
 // Fixed scan order and tie handling keep the representation deterministic.
 const seedSize=32,stride=32,minCopy=64,anchors=new Map();
 for(let index=0;index<baseParts.length;index++){
  const value=baseParts[index];
  for(let start=0;start+seedSize<=value.length;start+=stride){
   const key=value.slice(start,start+seedSize);let bucket=anchors.get(key);
   if(!bucket){bucket=[];anchors.set(key,bucket);}
   if(bucket.length<256)bucket.push([index,start]);
  }
 }
 const recipes=fragments.map((value,index)=>{
  const recipe=[];let pos=0,literalStart=0;
  while(pos+minCopy<=value.length){
   const bucket=anchors.get(value.slice(pos,pos+seedSize));let best=null;
   if(bucket)for(const [part,start] of bucket){
    const old=baseParts[part],limit=Math.min(old.length-start,value.length-pos);
    if(limit<minCopy||best&&limit<=best.length)continue;
    let length=seedSize;while(length<limit&&old.charCodeAt(start+length)===value.charCodeAt(pos+length))length++;
    if(length>=minCopy&&(!best||length>best.length))best={part,start,length};
    if(length===value.length-pos)break;
   }
   if(best){
    if(pos>literalStart)recipe.push(value.slice(literalStart,pos));
    recipe.push([best.part,best.start,best.start+best.length]);pos+=best.length;literalStart=pos;
   }else pos++;
  }
  if(literalStart<value.length)recipe.push(value.slice(literalStart));
  const restored=recipe.map(part=>typeof part==='string'?part:baseParts[part[0]].slice(part[1],part[2])).join('');
  if(restored!==value||!Buffer.from(restored).equals(Buffer.from(value)))throw Error('Fragment slice mismatch '+index);
  return recipe;
 });
 return {format:'order-reviewed-fragment-slices/v1',recipes};
}
const fragmentPack=packing?fragmentSlices(parts,added):null,packedFragmentJson=fragmentPack?JSON.stringify(fragmentPack):fragmentJson;
const epochMetadata={...full.epochMetadata,delta:{format:index.format,baseEpoch:base.epochMetadata.epoch,indexSha256:sha(indexJson),fragmentsSha256:sha(fragmentJson),recordCount:Object.keys(records).length,addedFragments:added.length,
 ...(fragmentPack?{fragmentPack:{format:fragmentPack.format,sha256:sha(packedFragmentJson)}}:{})}};
const source='// Immutable lossless delta; full capture hashes remain authoritative.\n'+Object.entries({epochMetadata,epochIndexGzip:zip(indexJson),epochFragmentsGzip:zip(packedFragmentJson)}).map(([key,value])=>'export const '+key+'='+JSON.stringify(value)+';').join('\n')+'\n';
try{await writeFile(output,source,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await readFile(output,'utf8')!==source)throw error;}
console.log(JSON.stringify({output,bytes:Buffer.byteLength(source),records:Object.keys(records).length,patches:patches.length,addedFragments:added.length,addedBodies:Object.keys(bodies).length,indexGzipBytes:Buffer.from(zip(indexJson),'base64').length,fragmentGzipBytes:Buffer.from(zip(packedFragmentJson),'base64').length,
 ...(fragmentPack?{fragmentPacking:fragmentPack.format,originalFragmentGzipBytes:Buffer.from(zip(fragmentJson),'base64').length,allAddedFragmentsExact:true}:{})}));
