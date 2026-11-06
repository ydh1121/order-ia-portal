/** Inactive legacy protocol only. R3 uses qa-observer.mjs; no registered version is activated here. */
export function createViewerSession(identity,emit=()=>{},options={}){
 const required=['artifact_id','version','package_sha256','entrypoint_sha256','baseline_commit'];
 if(required.some(k=>typeof identity?.[k]!=='string'||!identity[k]))throw Error('VIEWER_IDENTITY_REQUIRED');
 const timeoutMs=Math.min(15000,Math.max(250,options.timeoutMs??8000));
 const set=options.setTimeout||globalThis.setTimeout,clear=options.clearTimeout||globalThis.clearTimeout;
 const nonce=options.nonce||crypto.randomUUID();let state='IDLE',source=null,timer=null,seq=0,pending=null,disposed=false;
 const report=(next,reason)=>{state=next;emit({state,reason:reason||null,identity:{...identity}})};
 const stop=()=>{if(timer!==null){clear(timer);timer=null}};
 const wait=()=>{stop();timer=set(()=>{pending=null;disposed=true;source=null;report('TIMEOUT','실제 응답을 받지 못했습니다.')},timeoutMs)};
 const envelope=(type,request_id)=>({schema:'order.ia.viewer/1',type,nonce,...identity,...(request_id?{request_id}:{})});
 const matches=(event)=>{
  const d=event?.data;
  return !disposed&&event.source===source&&source!==null&&event.origin==='null'&&d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).length<=12&&d.schema==='order.ia.viewer/1'&&d.nonce===nonce&&required.every(k=>d[k]===identity[k]);
 };
 return {
  get state(){return state},get nonce(){return nonce},
  attach(windowProxy){if(disposed||source||!windowProxy)throw Error('VIEWER_ALREADY_ATTACHED');source=windowProxy;report('BOOTING');wait();return envelope('host-init')},
  onLoad(){/* A frame load is never proof that child boot or ready succeeded. */},
  message(event){
   if(!matches(event))return false;
   const d=event.data;
   if(d.type==='error'||d.type==='missing-resource'){
    if(!['BOOTING','CHILD_BOOTED','READY','APPLYING'].includes(state))return false;
    stop();pending=null;report(d.type==='error'?'BOOT_FAILED':'MISSING_RESOURCE','패키지가 초기 오류 또는 자원 누락을 보고했습니다.');return true;
   }
   if(d.type==='boot'&&state==='BOOTING'){report('CHILD_BOOTED');wait();return true;}
   if(d.type==='ready'&&state==='CHILD_BOOTED'){stop();report('READY');return true;}
   if(d.type==='applied'&&state==='APPLYING'&&d.request_id===pending){stop();pending=null;report('APPLIED');return true;}
   return false;
  },
  request(preset){
   if(!['READY','APPLIED'].includes(state)||!['original','ibm','linear','vercel','style-reset'].includes(preset))throw Error('VIEWER_NOT_READY');
   pending=++seq;report('APPLYING');wait();return {...envelope('preset-request',pending),preset};
  },
  dispose(){stop();disposed=true;source=null;pending=null;report('DISPOSED')}
 };
}
export const CHILD_CSP="default-src 'none'; script-src 'unsafe-inline' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; frame-src about:; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
export async function prepareIsolatedFrame(document,html,identity,activation){
 // The server has NO active records in MSG0560. It must return a hash-bound activation
 // only after separate real source/boot/isolation acceptance; query params cannot supply it.
 if(!activation||activation.preview_allowed!==true||activation.package_sha256!==identity.package_sha256||activation.entrypoint_sha256!==identity.entrypoint_sha256||activation.baseline_commit!==identity.baseline_commit||activation.real_boot_verified!==true||activation.security_verified!==true)throw Error('PREVIEW_NOT_AUTHORIZED');
 if(typeof html!=='string'||new TextEncoder().encode(html).byteLength>8*1024*1024)throw Error('RESOURCE_INVALID');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==identity.entrypoint_sha256)throw Error('HASH_MISMATCH');
 const frame=document.createElement('iframe');
 if(!('credentialless' in frame)||!('csp' in frame))throw Error('UNSUPPORTED_PREVIEW');
 frame.title='격리된 연구 미리보기';frame.setAttribute('sandbox','allow-scripts');
 frame.setAttribute('referrerpolicy','no-referrer');frame.credentialless=true;
 frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
 frame.setAttribute('csp',CHILD_CSP);frame.srcdoc=html;
 return frame; // No DOM/CSS injection into the immutable package; caller preserves this same frame.
}
