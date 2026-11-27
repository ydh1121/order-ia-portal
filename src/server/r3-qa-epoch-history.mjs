// Immutable reviewed-release payloads. Current product code is never consulted
// while reconstructing these HTML, mount, fixture or source bytes.
import * as r1Epoch from './r3-ui/r1-e8e12588-history.gen.mjs';
import * as rework09Epoch from './r3-ui/r3-af5ece3e-history.gen.mjs';
import * as release10Epoch from './r3-ui/r3-e5f97029-history.gen.mjs';
import * as release11Epoch from './r3-ui/r3-a36b41e2-history.gen.mjs';
import * as component30Epoch from './r3-ui/r3-library-pr30-history.gen.mjs';
import * as component31Epoch from './r3-ui/r3-library-pr31-history.gen.mjs';
import * as release13Epoch from './r3-ui/r3-7da1ad50-history.gen.mjs';

const enc=new TextEncoder();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
async function unpack(packed,expected){
  const bytes=Uint8Array.from(atob(packed),c=>c.charCodeAt(0));
  const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(await sha(text)!==expected)throw Error('Reviewed epoch integrity mismatch');
  return JSON.parse(text);
}
async function unpackKeyIndex(packed,metadata){
  const format='order-reviewed-index-digests/v1';
  if(metadata.indexPack?.format!==format)throw Error('Unsupported reviewed key index pack');
  const pack=await unpack(packed,metadata.indexPack.sha256);
  if(pack?.format!==format||!Number.isInteger(pack.digestCount)||pack.digestCount<0||typeof pack.digests!=='string'||!Array.isArray(pack.tokens)||pack.tokens.length%2!==1)throw Error('Invalid reviewed key index pack');
  const bytes=Uint8Array.from(atob(pack.digests),c=>c.charCodeAt(0));
  if(bytes.length!==pack.digestCount*32)throw Error('Invalid reviewed index digest table');
  const digests=Array.from({length:pack.digestCount},(_,i)=>Array.from(bytes.subarray(i*32,(i+1)*32),byte=>byte.toString(16).padStart(2,'0')).join(''));
  const text=pack.tokens.map((token,i)=>{
    if(i%2===0){if(typeof token!=='string')throw Error('Invalid reviewed index literal');return token;}
    if(!Number.isInteger(token)||token<0||token>=digests.length)throw Error('Invalid reviewed index digest reference');
    return digests[token];
  }).join('');
  if(await sha(text)!==metadata.indexSha256)throw Error('Reviewed key index integrity mismatch');
  return JSON.parse(text);
}
export async function readReviewedFragmentAdditions(packed,metadata,baseParts){
  if(!metadata.fragmentPack)return unpack(packed,metadata.fragmentsSha256);
  const format='order-reviewed-fragment-slices/v1';
  if(metadata.fragmentPack.format!==format)throw Error('Unsupported reviewed fragment pack');
  const pack=await unpack(packed,metadata.fragmentPack.sha256);
  if(pack?.format!==format||!Array.isArray(pack.recipes)||pack.recipes.length!==metadata.addedFragments)throw Error('Invalid reviewed fragment pack');
  const added=pack.recipes.map(recipe=>{
    if(!Array.isArray(recipe))throw Error('Invalid reviewed fragment recipe');
    return recipe.map(part=>{
      if(typeof part==='string')return part;
      if(!Array.isArray(part)||part.length!==3||!part.every(Number.isInteger))throw Error('Invalid reviewed fragment slice');
      const [index,start,end]=part,source=baseParts[index];
      if(index<0||index>=baseParts.length||typeof source!=='string'||start<0||end<start||end>source.length)throw Error('Invalid reviewed fragment slice');
      return source.slice(start,end);
    }).join('');
  });
  if(await sha(JSON.stringify(added))!==metadata.fragmentsSha256)throw Error('Reviewed fragment integrity mismatch');
  return added;
}
const key=(id,width,hash)=>[id,width,hash].join('|');
function expand(nodes,id){
  const [kind,value]=nodes[id];
  if(kind==='null')return null;
  if(kind==='array')return value.map(child=>expand(nodes,child));
  if(kind==='object')return Object.fromEntries(value.map(([name,child])=>[name,expand(nodes,child)]));
  return value;
}
function join(recipe,parts){
  return recipe.map(part=>typeof part==='number'?parts[part]:JSON.stringify(part.json).replaceAll('<','\\u003c')).join('');
}
function reader({epochMetadata,epochIndexGzip,epochFragmentsGzip}){
  let savedIndex,savedFragments;
  const index=()=>savedIndex??=unpack(epochIndexGzip,epochMetadata.indexSha256);
  const fragments=()=>savedFragments??=unpack(epochFragmentsGzip,epochMetadata.fragmentsSha256);
  const valid=(id,width,hash)=>typeof id==='string'&&epochMetadata.widths.includes(width)&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
  return {
    metadata:epochMetadata,
    parts:fragments,
    async keys(){return Object.keys((await index()).records);},
    async rawRecord(id){return expand((await index()).nodes,id);},
    async rawRecordKey(recordKey){const archive=await index();return Object.hasOwn(archive.records,recordKey)?expand(archive.nodes,archive.records[recordKey]):null;},
    async body(digest){
      const archive=await index();
      if(!Object.hasOwn(archive.bodies,digest))return null;
      const body=join(archive.bodies[digest],await fragments());
      if(await sha(body)!==digest)throw Error('Reviewed epoch body integrity mismatch');
      return body;
    },
    async target(target,release){
      if(release!==epochMetadata.release||!target)return false;
      const id=[target.screen,target.state,target.variant].join('/');
      return valid(id,target.viewport,target.artifactHash)&&Object.hasOwn((await index()).records,key(id,target.viewport,target.artifactHash));
    },
    async artifact(id,width,hash){
      if(!valid(id,width,hash))return null;
      const archive=await index(),recordKey=key(id,width,hash);
      if(!Object.hasOwn(archive.records,recordKey))return null;
      const record=expand(archive.nodes,archive.records[recordKey]),parts=await fragments(),values={...record.metadata};
      for(const [name,recipe] of Object.entries(record.fields))values[name]=join(recipe,parts);
      values.exportHash=await sha(values.editable);
      // Preserve original insertion order so complete response digests remain reproducible.
      const artifact=Object.fromEntries(record.propertyOrder.map(name=>[name,values[name]]));
      return {artifact,replayFrame:artifact.replayFrame||join(archive.replayRecipe,parts),
        archivedSource:{epoch:epochMetadata.epoch,commit:epochMetadata.commit,tree:epochMetadata.tree}};
    }
  };
}
function deltaReader({epochMetadata,epochIndexGzip,epochFragmentsGzip},base){
 if(epochMetadata.delta.baseEpoch!==base.metadata.epoch)throw Error('Reviewed delta base mismatch');
 const keyReferences=epochMetadata.delta.format==='order-reviewed-epoch-key-delta/v1';
 if(!keyReferences&&epochMetadata.delta.format!=='order-reviewed-epoch-delta/v1')throw Error('Unsupported reviewed delta');
 if(keyReferences&&(epochMetadata.delta.recordReference!=='previous-key-table/v1'||epochMetadata.delta.baseIndexSha256!==(base.metadata.delta?.indexSha256||base.metadata.indexSha256)))throw Error('Reviewed key delta base mismatch');
 let savedIndex,savedParts,savedKeys;
 const index=()=>savedIndex??=(keyReferences?unpackKeyIndex(epochIndexGzip,epochMetadata.delta):unpack(epochIndexGzip,epochMetadata.delta.indexSha256)).then(async archive=>{
  if(keyReferences){
   if(archive.format!==epochMetadata.delta.format||archive.recordReference!==epochMetadata.delta.recordReference||!Array.isArray(archive.records)||!Array.isArray(archive.patches)||archive.records.length!==epochMetadata.delta.recordCount)throw Error('Invalid reviewed key delta');
   const previousKeys=await base.keys();
   if(await sha(JSON.stringify(previousKeys))!==epochMetadata.delta.baseRecordKeysSha256)throw Error('Reviewed record key table mismatch');
   const resolveKey=reference=>{if(!Number.isInteger(reference)||reference<0||reference>=previousKeys.length)throw Error('Invalid reviewed key table reference');return previousKeys[reference];};
   const records=Object.create(null);
   for(const entry of archive.records){
    if(!Array.isArray(entry)||entry.length!==3)throw Error('Invalid reviewed key record');
    const recordKey=typeof entry[0]==='string'?entry[0]:resolveKey(entry[0]),reference=entry[1]===null?null:resolveKey(entry[1]);
    if(!/^[^|]+\|\d+\|[a-f0-9]{64}$/.test(recordKey)||Object.hasOwn(records,recordKey))throw Error('Invalid reviewed record key');
    if(reference!==null&&reference.slice(0,reference.lastIndexOf('|'))!==recordKey.slice(0,recordKey.lastIndexOf('|')))throw Error('Invalid reviewed record key reference');
    records[recordKey]=[reference,entry[2]];
   }
   archive={...archive,records};
  }
  return archive;
 });
 const parts=()=>savedParts??=base.parts().then(async old=>{
  if(keyReferences&&await sha(JSON.stringify(old))!==epochMetadata.delta.basePartsSha256)throw Error('Reviewed key delta fragment base mismatch');
  return [...old,...await readReviewedFragmentAdditions(epochFragmentsGzip,epochMetadata.delta,old)];
 });
 const keys=()=>savedKeys??=Promise.all([base.keys(),index()]).then(([previous,archive])=>[...new Set([...previous,...Object.keys(archive.records)])]);
 function hydrate(value,hash){return value&&typeof value==='object'&&Object.keys(value).length===1&&value.__orderCurrentHash===1?hash:Array.isArray(value)?value.map(v=>hydrate(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,hash)])):value;}
 function patch(previous,change,hash){if(!change)return previous;if(change[0]==='v')return hydrate(change[1],hash);const result=Array.isArray(previous)?[...previous]:{...previous};for(const [key,value] of change[1]){if(value[0]==='d')delete result[key];else result[key]=patch(result[key],value,hash);}return result;}
 async function rawRecordKey(recordKey){
  const archive=await index();
  if(!Object.hasOwn(archive.records,recordKey))return base.rawRecordKey(recordKey);
  const saved=archive.records[recordKey],hash=recordKey.slice(recordKey.lastIndexOf('|')+1);let previous;
  if(keyReferences){
   if(!Array.isArray(saved)||saved.length!==2||!Number.isInteger(saved[1])||saved[1]<0||saved[1]>=archive.patches.length)throw Error('Invalid reviewed key record');
   const reference=saved[0];
   if(reference===null)previous=null;
   else{
    if(typeof reference!=='string'||!/^[^|]+\|\d+\|[a-f0-9]{64}$/.test(reference)||reference.slice(0,reference.lastIndexOf('|'))!==recordKey.slice(0,recordKey.lastIndexOf('|')))throw Error('Invalid reviewed record key reference');
    // Resolve only in the previous epoch, including its own immutable base.
    // A same-key override cannot recurse into this successor or change lookup precedence.
    previous=await base.rawRecordKey(reference);
    if(previous===null||previous===undefined)throw Error('Missing reviewed record key reference');
   }
  }else previous=saved[0]===null?null:await base.rawRecord(saved[0]);
  return patch(previous,archive.patches[saved[1]],hash);
 }
 const valid=(id,width,hash)=>typeof id==='string'&&epochMetadata.widths.includes(width)&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
 return {
  metadata:epochMetadata,parts,keys,rawRecordKey,
  async body(digest){const archive=await index();if(!Object.hasOwn(archive.bodies,digest))return null;const body=join(archive.bodies[digest],await parts());if(await sha(body)!==digest)throw Error('Reviewed delta body integrity mismatch');return body;},
  async target(target,release){if(release!==epochMetadata.release||!target)return false;const id=[target.screen,target.state,target.variant].join('/');return valid(id,target.viewport,target.artifactHash)&&Object.hasOwn((await index()).records,key(id,target.viewport,target.artifactHash));},
  async artifact(id,width,hash){
   if(!valid(id,width,hash))return null;const archive=await index(),saved=archive.records[key(id,width,hash)];if(!saved)return null;
   const record=await rawRecordKey(key(id,width,hash)),fragments=await parts(),values={...record.metadata};
   for(const [name,recipe] of Object.entries(record.fields))values[name]=join(recipe,fragments);values.exportHash=await sha(values.editable);
   const artifact=Object.fromEntries(record.propertyOrder.map(name=>[name,values[name]]));
   return {artifact,replayFrame:artifact.replayFrame||join(archive.replayRecipe,fragments),archivedSource:{epoch:epochMetadata.epoch,commit:epochMetadata.commit,tree:epochMetadata.tree}};
  }
 };
}
// The same decoder is used by archive verification without serving or mutating
// current product state. Raw key lookup includes the declared base chain only.
export function createReviewedEpochReader(epoch,base){return epoch.epochMetadata.delta?deltaReader(epoch,base):reader(epoch);}
// Earlier immutable identities retain precedence. A later snapshot never rebinds
// an existing hash to newly generated code, fixtures or feedback status.
const previousEpoch=reader(rework09Epoch);
const release11Archive=deltaReader(release11Epoch,previousEpoch);
const component30Archive=deltaReader(component30Epoch,previousEpoch);
const epochs=[reader(r1Epoch),previousEpoch,deltaReader(release10Epoch,previousEpoch),release11Archive,deltaReader(release13Epoch,release11Archive),component30Archive,deltaReader(component31Epoch,component30Archive)];
export const reviewedEpochMetadata=r1Epoch.epochMetadata;
export const reviewedEpochsMetadata=Object.freeze(epochs.map(epoch=>epoch.metadata));
export async function readReviewedEpochBody(digest){
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))return null;
  for(const epoch of epochs){const body=await epoch.body(digest);if(body!==null)return body;}
  return null;
}
export async function isReviewedEpochTarget(target,release=reviewedEpochMetadata.release){
  for(const epoch of epochs)if(await epoch.target(target,release))return true;
  return false;
}
export async function readReviewedEpochArtifact(id,width,hash){
  for(const epoch of epochs){const artifact=await epoch.artifact(id,width,hash);if(artifact)return artifact;}
  return null;
}
