/** HTTP document response is OWNER/session + exact first-review permit gated, never a preview promotion. */
import {requireResearchPermit} from './qa-research-permit.mjs';
import {prepareR3Document} from './qa-r3-runtime.mjs';
import {QaError} from './qa-registry.mjs';
import {documentSelection} from './qa-document-profile.mjs';
export async function r3DocumentResponse(request,env,record,readPrivateArtifact,now){
 const permit=await requireResearchPermit(request,env,record,now);
 if(typeof readPrivateArtifact!=='function')throw new QaError('PRIVATE_SOURCE_UNAVAILABLE',503);
 const bundle=await readPrivateArtifact(documentSelection(record));
 const document=await prepareR3Document(record,bundle);
 // Revalidate the session/permit after provider work; expiry during a download must not deliver bytes.
 await requireResearchPermit(request,env,record,now===undefined?undefined:now);
 return new Response(document.bytes,{status:200,headers:{...document.headers,'X-Robots-Tag':'noindex, nofollow, noarchive','X-QA-Research-Generation':permit.generation,'X-QA-Native-State':'NOT_RUN'}});
}
