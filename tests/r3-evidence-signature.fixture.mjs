// Synthetic pixels only. This builds the same ORPX document + final signature
// page as the product editor, without borrowing any user's document/signature.
export async function signedEvidencePacket({documentPixels=[255,90,255,80],signatureInk=true}={}){
 const document=Uint8Array.from([79,82,80,88,1,1,0,2,0,2,...documentPixels]);
 const signature=new Uint8Array(4+360*100).fill(255),view=new DataView(signature.buffer);
 view.setUint16(0,360);view.setUint16(2,100);
 if(signatureInk)for(let i=0;i<70;i++){signature[4+(20+i%40)*360+10+i]=30;signature[4+(21+i%40)*360+10+i]=30;}
 const bytes=new Uint8Array(document.length+signature.length);bytes.set(document);bytes[5]=2;bytes.set(signature,document.length);
 const sha=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',value)).toString('hex');
 const header={kind:'evidence',consentVersion:'masked-evidence-v1',documentDigest:await sha(document),signatureDigest:await sha(signature)};
 return {document,signature,bytes,header,packetDigest:await sha(bytes)};
}
