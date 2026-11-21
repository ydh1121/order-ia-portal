// Immutable reviewed-release payloads. Current product code is never consulted
// while reconstructing these HTML, mount, fixture or source bytes.
import * as r1Epoch from './r3-ui/r1-e8e12588-history.gen.mjs';
import * as rework09Epoch from './r3-ui/r3-af5ece3e-history.gen.mjs';
import * as release10Epoch from './r3-ui/r3-e5f97029-history.gen.mjs';

const enc=new TextEncoder();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
async function unpack(packed,expected){
  const bytes=Uint8Array.from(atob(packed),c=>c.charCodeAt(0));
  const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(await sha(text)!==expected)throw Error('Reviewed epoch integrity mismatch');
  return JSON.parse(text);
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
    async rawRecord(id){return expand((await index()).nodes,id);},
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
 let savedIndex,savedParts;
 const index=()=>savedIndex??=unpack(epochIndexGzip,epochMetadata.delta.indexSha256);
 const parts=()=>savedParts??=Promise.all([base.parts(),unpack(epochFragmentsGzip,epochMetadata.delta.fragmentsSha256)]).then(([old,added])=>[...old,...added]);
 function hydrate(value,hash){return value&&typeof value==='object'&&Object.keys(value).length===1&&value.__orderCurrentHash===1?hash:Array.isArray(value)?value.map(v=>hydrate(v,hash)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,hash)])):value;}
 function patch(previous,change,hash){if(!change)return previous;if(change[0]==='v')return hydrate(change[1],hash);const result=Array.isArray(previous)?[...previous]:{...previous};for(const [key,value] of change[1]){if(value[0]==='d')delete result[key];else result[key]=patch(result[key],value,hash);}return result;}
 const valid=(id,width,hash)=>typeof id==='string'&&epochMetadata.widths.includes(width)&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
 return {
  metadata:epochMetadata,parts,
  async body(digest){const archive=await index();if(!Object.hasOwn(archive.bodies,digest))return null;const body=join(archive.bodies[digest],await parts());if(await sha(body)!==digest)throw Error('Reviewed delta body integrity mismatch');return body;},
  async target(target,release){if(release!==epochMetadata.release||!target)return false;const id=[target.screen,target.state,target.variant].join('/');return valid(id,target.viewport,target.artifactHash)&&Object.hasOwn((await index()).records,key(id,target.viewport,target.artifactHash));},
  async artifact(id,width,hash){
   if(!valid(id,width,hash))return null;const archive=await index(),saved=archive.records[key(id,width,hash)];if(!saved)return null;
   const record=patch(saved[0]===null?null:await base.rawRecord(saved[0]),archive.patches[saved[1]],hash),fragments=await parts(),values={...record.metadata};
   for(const [name,recipe] of Object.entries(record.fields))values[name]=join(recipe,fragments);values.exportHash=await sha(values.editable);
   const artifact=Object.fromEntries(record.propertyOrder.map(name=>[name,values[name]]));
   return {artifact,replayFrame:artifact.replayFrame||join(archive.replayRecipe,fragments),archivedSource:{epoch:epochMetadata.epoch,commit:epochMetadata.commit,tree:epochMetadata.tree}};
  }
 };
}
// Earlier immutable identities retain precedence. A later snapshot never rebinds
// an existing hash to newly generated code, fixtures or feedback status.
const previousEpoch=reader(rework09Epoch);
const epochs=[reader(r1Epoch),previousEpoch,deltaReader(release10Epoch,previousEpoch)];
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
