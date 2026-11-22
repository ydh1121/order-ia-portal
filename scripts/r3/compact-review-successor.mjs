// Preserve a full capture against an immutable v1 delta and its full base.
// Key references always address the previous epoch; they never address another
// record in this output. Existing archives and capture inputs are read only.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const [basePath,previousPath,fullPath,output,verificationOutput]=process.argv.slice(2);
if(!basePath||!previousPath||!fullPath||!output||process.argv.length>7)throw Error('Usage: compact-review-successor.mjs base-full.mjs previous-delta.mjs captured-full.mjs output.mjs [structure-fixture.json.gz]');
const inputs=[basePath,previousPath,fullPath].map(p=>resolve(p));
if(inputs.includes(resolve(output))||verificationOutput&&(inputs.includes(resolve(verificationOutput))||resolve(verificationOutput)===resolve(output)))throw Error('Inputs are immutable');
const [base,previous,full]=await Promise.all(inputs.map(p=>import(pathToFileURL(p))));
const sha=value=>createHash('sha256').update(value).digest('hex');
const zip=value=>gzipSync(value,{level:9,mtime:0});
function unpack(value,expected){const text=gunzipSync(Buffer.from(value,'base64')).toString('utf8');if(sha(text)!==expected)throw Error('Capture integrity mismatch');return JSON.parse(text);}
const baseIndex=unpack(base.epochIndexGzip,base.epochMetadata.indexSha256),baseParts=unpack(base.epochFragmentsGzip,base.epochMetadata.fragmentsSha256);
const delta=previous.epochMetadata.delta;
if(baseIndex.format!=='order-reviewed-epoch/v1'||delta?.format!=='order-reviewed-epoch-delta/v1'||delta.baseEpoch!==base.epochMetadata.epoch)throw Error('Expected a full base and its immutable v1 delta');
const previousIndex=unpack(previous.epochIndexGzip,delta.indexSha256),next=unpack(full.epochIndexGzip,full.epochMetadata.indexSha256),nextParts=unpack(full.epochFragmentsGzip,full.epochMetadata.fragmentsSha256);
if(previousIndex.format!==delta.format||next.format!=='order-reviewed-epoch/v1')throw Error('Unsupported capture format');
function readAdded(){
 if(!delta.fragmentPack)return unpack(previous.epochFragmentsGzip,delta.fragmentsSha256);
 const format='order-reviewed-fragment-slices/v1';
 if(delta.fragmentPack.format!==format)throw Error('Unsupported previous fragment pack');
 const pack=unpack(previous.epochFragmentsGzip,delta.fragmentPack.sha256);
 if(pack.format!==format||!Array.isArray(pack.recipes)||pack.recipes.length!==delta.addedFragments)throw Error('Invalid previous fragment pack');
 const added=pack.recipes.map(recipe=>{
  if(!Array.isArray(recipe))throw Error('Invalid previous fragment recipe');
  return recipe.map(part=>{
   if(typeof part==='string')return part;
   if(!Array.isArray(part)||part.length!==3||!part.every(Number.isInteger))throw Error('Invalid previous fragment slice');
   const [index,start,end]=part,source=baseParts[index];
   if(index<0||index>=baseParts.length||typeof source!=='string'||start<0||end<start||end>source.length)throw Error('Invalid previous fragment slice');
   return source.slice(start,end);
  }).join('');
 });
 if(sha(JSON.stringify(added))!==delta.fragmentsSha256)throw Error('Previous fragment integrity mismatch');
 return added;
}
const previousParts=[...baseParts,...readAdded()],known=new Map(previousParts.map((part,i)=>[part,i])),added=[];
const mapped=nextParts.map(part=>{if(known.has(part))return known.get(part);const i=previousParts.length+added.length;known.set(part,i);added.push(part);return i;});
const parts=[...previousParts,...added],remap=recipe=>recipe.map(part=>typeof part==='number'?mapped[part]:part);
function expand(nodes,n){const [kind,value]=nodes[n];return kind==='null'?null:kind==='array'?value.map(i=>expand(nodes,i)):kind==='object'?Object.fromEntries(value.map(([k,i])=>[k,expand(nodes,i)])):value;}
function replaceHash(value,hash){return value===hash?{__orderCurrentHash:1}:Array.isArray(value)?value.map(v=>replaceHash(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceHash(v,hash)])):value;}
function hydrate(value,hash){return value&&typeof value==='object'&&Object.keys(value).length===1&&value.__orderCurrentHash===1?hash:Array.isArray(value)?value.map(v=>hydrate(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,hash)])):value;}
function patch(base,change,hash){if(!change)return base;if(change[0]==='v')return hydrate(change[1],hash);const result=Array.isArray(base)?[...base]:{...base};for(const [k,p]of change[1]){if(p[0]==='d')delete result[k];else result[k]=patch(result[k],p,hash);}return result;}
const hashOf=key=>key.slice(key.lastIndexOf('|')+1),prefixOf=key=>key.slice(0,key.lastIndexOf('|'));
const previousCache=new Map();
function previousRecord(key){
 if(previousCache.has(key))return previousCache.get(key);
 const saved=previousIndex.records[key];
 const record=saved?patch(saved[0]===null?null:expand(baseIndex.nodes,saved[0]),previousIndex.patches[saved[1]],hashOf(key)):Object.hasOwn(baseIndex.records,key)?expand(baseIndex.nodes,baseIndex.records[key]):null;
 previousCache.set(key,record);return record;
}
function diff(a,b,hash){
 if(JSON.stringify(a)===JSON.stringify(b))return null;
 if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){const changes=[];for(let i=0;i<b.length;i++){const change=diff(a[i],b[i],hash);if(change)changes.push([i,change]);}return ['a',changes];}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  // Deletion and append preserve insertion order; a reorder needs replacement.
  const keys=Object.keys(a).filter(k=>Object.hasOwn(b,k)).concat(Object.keys(b).filter(k=>!Object.hasOwn(a,k)));
  if(JSON.stringify(keys)===JSON.stringify(Object.keys(b))){const changes=[];for(const k of Object.keys(a))if(!Object.hasOwn(b,k))changes.push([k,['d']]);for(const k of Object.keys(b)){const change=diff(a[k],b[k],hash);if(change)changes.push([k,change]);}return ['o',changes];}
 }
 return ['v',replaceHash(JSON.stringify(b)===undefined?null:b,hash)];
}
const previousKeys=[...new Set([...Object.keys(baseIndex.records),...Object.keys(previousIndex.records)])],previousKeyIds=new Map(previousKeys.map((key,i)=>[key,i])),candidates=new Map();
for(const key of previousKeys){const prefix=prefixOf(key);if(!candidates.has(prefix))candidates.set(prefix,[]);candidates.get(prefix).push(key);}
const records={},patches=[],patchIds=new Map(),structureRecords={},partFingerprints=parts.map(part=>sha(JSON.stringify(part)));
const normalize=record=>({...record,fields:Object.fromEntries(Object.entries(record.fields).map(([name,recipe])=>[name,recipe.map(part=>typeof part==='number'?{fragmentSha256:partFingerprints[part]}:part)]))});
let inherited=0,overlappingChanged=0;
for(const [key,n]of Object.entries(next.records)){
 const record=expand(next.nodes,n);for(const name of Object.keys(record.fields))record.fields[name]=remap(record.fields[name]);
 structureRecords[key]=sha(JSON.stringify(normalize(record)));
 const exact=previousRecord(key);
 if(exact&&JSON.stringify(exact)===JSON.stringify(record)){inherited++;continue;}
 if(exact)overlappingChanged++;
 const hash=hashOf(key);let chosen=null;
 for(const baseKey of candidates.get(prefixOf(key))||[]){const change=diff(previousRecord(baseKey),record,hash),encoded=JSON.stringify(change);if(!chosen||encoded.length<chosen.encoded.length)chosen={baseKey,change,encoded};}
 if(!chosen){const change=['v',replaceHash(record,hash)];chosen={baseKey:null,change,encoded:JSON.stringify(change)};}
 if(JSON.stringify(patch(chosen.baseKey===null?null:previousRecord(chosen.baseKey),chosen.change,hash))!==JSON.stringify(record))throw Error('Patch mismatch '+key);
 let patchId=patchIds.get(chosen.encoded);if(patchId===undefined){patchId=patches.length;patchIds.set(chosen.encoded,patchId);patches.push(chosen.change);}records[key]=[chosen.baseKey,patchId];
}
const previousBodies={...baseIndex.bodies,...previousIndex.bodies},bodies={};
for(const [digest,recipe]of Object.entries(next.bodies)){
 const mappedRecipe=remap(recipe);
 if(!Object.hasOwn(previousBodies,digest)||JSON.stringify(previousBodies[digest])!==JSON.stringify(mappedRecipe))bodies[digest]=mappedRecipe;
}
function fragmentSlices(baseParts,fragments){
 const seedSize=32,stride=32,minCopy=64,anchors=new Map();
 for(let index=0;index<baseParts.length;index++){const value=baseParts[index];for(let start=0;start+seedSize<=value.length;start+=stride){const key=value.slice(start,start+seedSize);let bucket=anchors.get(key);if(!bucket){bucket=[];anchors.set(key,bucket);}if(bucket.length<256)bucket.push([index,start]);}}
 const recipes=fragments.map((value,index)=>{
  const recipe=[];let pos=0,literalStart=0;
  while(pos+minCopy<=value.length){
   const bucket=anchors.get(value.slice(pos,pos+seedSize));let best=null;
   if(bucket)for(const [part,start]of bucket){const old=baseParts[part],limit=Math.min(old.length-start,value.length-pos);if(limit<minCopy||best&&limit<=best.length)continue;let length=seedSize;while(length<limit&&old.charCodeAt(start+length)===value.charCodeAt(pos+length))length++;if(length>=minCopy&&(!best||length>best.length))best={part,start,length};if(length===value.length-pos)break;}
   if(best){if(pos>literalStart)recipe.push(value.slice(literalStart,pos));recipe.push([best.part,best.start,best.start+best.length]);pos+=best.length;literalStart=pos;}else pos++;
  }
  if(literalStart<value.length)recipe.push(value.slice(literalStart));
  const restored=recipe.map(part=>typeof part==='string'?part:baseParts[part[0]].slice(part[1],part[2])).join('');
  if(restored!==value||!Buffer.from(restored).equals(Buffer.from(value)))throw Error('Fragment slice mismatch '+index);
  return recipe;
 });
 return {format:'order-reviewed-fragment-slices/v1',recipes};
}
// An ordinal addresses the previous epoch's SHA-bound key table, never its node
// graph. Both repeated own keys and patch bases resolve back to original keys.
const recordReference='previous-key-table/v1';
const recordTable=Object.entries(records).map(([key,[reference,patchId]])=>[previousKeyIds.has(key)?previousKeyIds.get(key):key,reference===null?null:previousKeyIds.get(reference),patchId]);
const index={format:'order-reviewed-epoch-key-delta/v1',recordReference,records:recordTable,patches,bodies,replayRecipe:remap(next.replayRecipe)};
const indexJson=JSON.stringify(index),fragmentJson=JSON.stringify(added),fragmentPack=fragmentSlices(previousParts,added),packedFragmentJson=JSON.stringify(fragmentPack);
// Preserve the exact index JSON while storing each repeated 256-bit digest once.
// Literal tokens retain every delimiter, property order and escape sequence.
const digests=[],digestIds=new Map(),tokens=indexJson.split(/([a-f0-9]{64})/g).map((value,i)=>{
 if(i%2===0)return value;let id=digestIds.get(value);if(id===undefined){id=digests.length;digests.push(value);digestIds.set(value,id);}return id;
});
const indexPack={format:'order-reviewed-index-digests/v1',digestCount:digests.length,digests:Buffer.from(digests.join(''),'hex').toString('base64'),tokens},packedIndexJson=JSON.stringify(indexPack);
if(tokens.map(token=>typeof token==='string'?token:digests[token]).join('')!==indexJson)throw Error('Original index JSON changed');
const restoredAdded=fragmentPack.recipes.map(recipe=>recipe.map(part=>typeof part==='string'?part:previousParts[part[0]].slice(part[1],part[2])).join(''));
if(JSON.stringify(restoredAdded)!==fragmentJson)throw Error('Original additions changed');
const restoredParts=[...previousParts,...restoredAdded],restoredSource=mapped.map(i=>restoredParts[i]);
if(JSON.stringify(restoredSource)!==JSON.stringify(nextParts)||sha(JSON.stringify(restoredSource))!==full.epochMetadata.fragmentsSha256)throw Error('Original fragment array changed');
for(const [key,n]of Object.entries(next.records)){
 const saved=records[key],restored=saved?patch(saved[0]===null?null:previousRecord(saved[0]),patches[saved[1]],hashOf(key)):previousRecord(key),original=expand(next.nodes,n);
 for(const name of Object.keys(original.fields))original.fields[name]=remap(original.fields[name]);
 if(JSON.stringify(restored)!==JSON.stringify(original))throw Error('Full record reconstruction mismatch '+key);
}
const epochMetadata={...full.epochMetadata,delta:{format:index.format,recordReference,baseEpoch:previous.epochMetadata.epoch,baseIndexSha256:delta.indexSha256,baseRecordKeysSha256:sha(JSON.stringify(previousKeys)),basePartsSha256:sha(JSON.stringify(previousParts)),indexSha256:sha(indexJson),indexPack:{format:indexPack.format,sha256:sha(packedIndexJson)},fragmentsSha256:sha(fragmentJson),recordCount:Object.keys(records).length,addedFragments:added.length,fragmentPack:{format:fragmentPack.format,sha256:sha(packedFragmentJson)}}};
const source='// Immutable key delta; full capture hashes and earlier epoch precedence remain authoritative.\n'+Object.entries({epochMetadata,epochIndexGzip:zip(packedIndexJson).toString('base64'),epochFragmentsGzip:zip(packedFragmentJson).toString('base64')}).map(([key,value])=>'export const '+key+'='+JSON.stringify(value)+';').join('\n')+'\n';
async function writeOnce(path,value){try{await writeFile(path,value,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||!Buffer.from(await readFile(path)).equals(Buffer.from(value)))throw error;}}
await writeOnce(output,source);
if(verificationOutput){
 const recipeDigest=recipe=>sha(JSON.stringify(recipe.map(part=>typeof part==='number'?{fragmentSha256:partFingerprints[part]}:part)));
 const fixture={format:'order-reviewed-record-structure/v1',commit:full.epochMetadata.commit,tree:full.epochMetadata.tree,indexSha256:full.epochMetadata.indexSha256,fragmentsSha256:full.epochMetadata.fragmentsSha256,records:structureRecords,replayRecipeSha256:recipeDigest(index.replayRecipe),bodies:Object.fromEntries(Object.entries(next.bodies).map(([digest,recipe])=>[digest,recipeDigest(remap(recipe))]))};
 await writeOnce(verificationOutput,zip(JSON.stringify(fixture)));
}
console.log(JSON.stringify({output,verificationOutput,bytes:Buffer.byteLength(source),format:index.format,recordReference,sourceRecords:Object.keys(next.records).length,storedRecords:Object.keys(records).length,inherited,overlappingChanged,patches:patches.length,baseParts:previousParts.length,addedFragments:added.length,addedBodies:Object.keys(bodies).length,indexGzipBytes:zip(packedIndexJson).length,unpackedIndexGzipBytes:zip(indexJson).length,fragmentGzipBytes:zip(packedFragmentJson).length,allRecordsAndRecipesExact:true,allSourceFragmentsExact:true,sourceIndexSha256:full.epochMetadata.indexSha256,sourceFragmentsSha256:full.epochMetadata.fragmentsSha256,outputSha256:sha(source)}));
