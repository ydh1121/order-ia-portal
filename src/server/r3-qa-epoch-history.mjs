// Immutable reviewed-release payloads. Current product code is never consulted
// while reconstructing these HTML, mount, fixture or source bytes.
import {epochMetadata,epochIndexGzip,epochFragmentsGzip} from './r3-ui/r1-e8e12588-history.gen.mjs';

const enc=new TextEncoder();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
async function unpack(packed,expected){
  const bytes=Uint8Array.from(atob(packed),c=>c.charCodeAt(0));
  const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(await sha(text)!==expected)throw Error('Reviewed epoch integrity mismatch');
  return JSON.parse(text);
}
let savedIndex,savedFragments;
const index=()=>savedIndex??=unpack(epochIndexGzip,epochMetadata.indexSha256);
const fragments=()=>savedFragments??=unpack(epochFragmentsGzip,epochMetadata.fragmentsSha256);
const key=(id,width,hash)=>[id,width,hash].join('|');
const valid=(id,width,hash)=>typeof id==='string'&&epochMetadata.widths.includes(width)&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);
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
export async function readReviewedEpochBody(digest){
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))return null;
  const archive=await index();
  if(!Object.hasOwn(archive.bodies,digest))return null;
  const body=join(archive.bodies[digest],await fragments());
  if(await sha(body)!==digest)throw Error('Reviewed epoch body integrity mismatch');
  return body;
}
export async function isReviewedEpochTarget(target,release=epochMetadata.release){
  if(release!==epochMetadata.release||!target)return false;
  const id=[target.screen,target.state,target.variant].join('/');
  if(!valid(id,target.viewport,target.artifactHash))return false;
  return Object.hasOwn((await index()).records,key(id,target.viewport,target.artifactHash));
}
export async function readReviewedEpochArtifact(id,width,hash){
  if(!valid(id,width,hash))return null;
  const archive=await index(),recordKey=key(id,width,hash);
  if(!Object.hasOwn(archive.records,recordKey))return null;
  const record=expand(archive.nodes,archive.records[recordKey]),parts=await fragments(),values={...record.metadata};
  for(const [name,recipe] of Object.entries(record.fields))values[name]=join(recipe,parts);
  values.exportHash=await sha(values.editable);
  // Preserve insertion order too: the independent capture manifest attests the
  // entire canonical JSON response, not only a self-generated render hash.
  const artifact=Object.fromEntries(record.propertyOrder.map(name=>[name,values[name]]));
  return {artifact,replayFrame:artifact.replayFrame||join(archive.replayRecipe,parts),
    archivedSource:{epoch:epochMetadata.epoch,commit:epochMetadata.commit,tree:epochMetadata.tree}};
}
export {epochMetadata as reviewedEpochMetadata};
