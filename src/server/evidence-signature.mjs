// A submission attestation binds the signed pixels to the authenticated actor,
// request case and exact masked document. It is not a certificate of identity or
// a completed contract; contract workflows can reuse the same digest convention.
export const evidenceConsentVersion='masked-evidence-v1';
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function evidenceSignatureBinding(bytes,pages,header,{actorId,caseId}){
 if(!header||header.length>1024||pages.length<2)return null;
 let supplied;try{supplied=JSON.parse(header);}catch{return null;}
 if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))return null;
 if(supplied.consentVersion!==evidenceConsentVersion||supplied.kind!=='evidence'||Object.keys(supplied).some(k=>!['kind','consentVersion','documentDigest','signatureDigest'].includes(k)))return null;
 const last=pages.at(-1);if(last.width!==360||last.height!==100)return null;
 const signature=bytes.subarray(last.offset-4),pixels=bytes.subarray(last.offset);
 let ink=0;for(const value of pixels)if(value<180)ink++;
 if(ink<12||ink>pixels.length*.75)return null;
 const document=bytes.slice(0,last.offset-4);document[5]=pages.length-1;
 const documentDigest=await hex(document),signatureDigest=await hex(signature);
 if(supplied.documentDigest!==documentDigest||supplied.signatureDigest!==signatureDigest)return null;
 return {kind:'evidence',consentVersion:evidenceConsentVersion,actorId,caseId,documentDigest,signatureDigest,packetDigest:await hex(bytes),documentPages:pages.length-1};
}
