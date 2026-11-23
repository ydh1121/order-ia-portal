// The approved shell asks for 'previous' to project legacy pins before an
// operator opens a record. This version always uses the prior authored bodies.
import {catalog,frames,previousCssGzip,previousCssHash,release} from './r3-ui/catalog.gen.mjs';
import {approvedHash} from './r3-ui/approved-width.mjs';
import {replayFrame} from './r3-ui/motion-history.gen.mjs';
import {authoredFrameDocuments} from './r3-authored-frame.mjs';

async function inflate(encoded){
  const compressed=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
let previousStyles;
export async function previousAuthoredArtifact(id,width,pinned){
  const r=catalog.find(row=>row.id===id);
  if(!r)return null;
  const artifactHash=await approvedHash(r,width,'previous');
  if(pinned&&pinned!==artifactHash)return null;
  const bodyDigest=r.previous;
  const [body,css]=await Promise.all([inflate(frames[bodyDigest]),previousStyles??inflate(previousCssGzip)]);
  // Workers may share a completed string across requests, but not pending I/O.
  previousStyles=css;
  const {page,editable}=authoredFrameDocuments({r,width,release,artifactHash,version:'previous',bodyDigest,styleDigest:previousCssHash,body,css});
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(editable)));
  const exportHash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return {release,version:'previous',hash:artifactHash,html:page,editable,viewport:width,exportHash,mount:null,replayFrame,file:release+'_'+id.replaceAll('/','_')+'_'+width+'.html'};
}
