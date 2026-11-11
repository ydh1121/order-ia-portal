import {createR3ObserverSession} from './qa-observer.mjs';
import {prepareIsolatedFrame} from './qa-viewer.mjs';
/** One shared observer connection for legacy and HTTP transports; no additional bridge. */
export function observeR3Frame({window,container,frame,identity,onState=()=>{},expiresAt=null}){
 let session=null,loaded=false,closed=false,loadTimer=null,expiryTimer=null;
 const send=message=>{if(frame.contentWindow)frame.contentWindow.postMessage(message,'*')};
 const receive=event=>session?.message(event);
 const cleanup=()=>{if(closed)return;closed=true;window.clearTimeout(loadTimer);window.clearTimeout(expiryTimer);window.removeEventListener('message',receive);frame.removeEventListener('load',load);frame.remove()};
 const load=()=>{
  if(closed)return;
  if(loaded){session?.dispose();cleanup();onState({state:'DOCUMENT_RELOADED',native:'NOT_RUN'});return}
  loaded=true;window.clearTimeout(loadTimer);
  session=createR3ObserverSession(identity,onState,{onClose:command=>{send(command);cleanup()}});send(session.attach(frame.contentWindow));
 };
 window.addEventListener('message',receive);frame.addEventListener('load',load);
 loadTimer=window.setTimeout(()=>{if(!loaded&&!closed){cleanup();onState({state:'TIMEOUT',code:'WRAPPER_LOAD_TIMEOUT'})}},8000);
 if(expiresAt!==null)expiryTimer=window.setTimeout(()=>{session?.dispose();cleanup();onState({state:'PERMIT_EXPIRED',native:'NOT_RUN'})},Math.max(0,expiresAt*1000-Date.now()));
 container.append(frame);
 return Object.freeze({frame,probe(){if(!session||closed)throw Error('VIEWER_NOT_READY');send(session.probe())},cancelStyle(){if(!session||closed)throw Error('VIEWER_NOT_READY');send(session.cancel())},dispose(){if(session)session.dispose();cleanup()}});
}
export async function mountR3Viewer({window,document,container,html,identity,activation,onState=()=>{}}){
 if(window.location.origin!=='https://order-ia-portal.pages.dev')throw Error('PARENT_ORIGIN_NOT_SUPPORTED');
 if(identity.artifact_id!=='ORDER-DESIGN-QA-0569-R3'||identity.version!=='R3')throw Error('UNSUPPORTED_VIEWER_REVISION');
 const frame=await prepareIsolatedFrame(document,html,identity,activation);
 return observeR3Frame({window,container,frame,identity,onState});
}
export function mountR3HttpResearch({window,document,container,identity,permit,onState=()=>{}}){
 const origin='https://order-ia-portal.pages.dev',r5=identity?.artifact_id==='ORDER-COPY-CANDIDATES-0569-R5'&&identity?.version==='R5',keys=['artifact_id','version','package_sha256','entrypoint_sha256','baseline_commit',...(r5?['entry_role','entrypoint']:[])];
 if(window.location.origin!==origin||(!r5&&(!['ORDER-DESIGN-QA-0569-R3','ORDER-COPY-MOTION-0569-R3'].includes(identity?.artifact_id)||identity?.version!=='R3'))||(r5&&(identity.entry_role!=='customer'||identity.entrypoint!=='components/ORDER_MSG0569_CUSTOMER_FLOW_R5_WORKING_UNVERIFIED.html')))throw Error('UNSUPPORTED_VIEWER_REVISION');
 const url='/api/ia/qa/document?'+new URLSearchParams({artifact_id:identity.artifact_id,version:identity.version,...(r5?{entry_role:'customer'}:{})});
 if(!permit||permit.schema!=='order.ia.research-permit/1'||permit.purpose!=='FIRST_NATIVE_REVIEW'||permit.preview_allowed!==false||permit.native!=='NOT_RUN'||permit.document_url!==url||!keys.every(k=>permit[k]===identity[k])||!Number.isSafeInteger(permit.expires_at)||permit.expires_at*1000<=Date.now()||permit.expires_at*1000>Date.now()+300000||typeof permit.generation!=='string'||!/^[0-9a-f-]{36}$/.test(permit.generation))throw Error('RESEARCH_PERMIT_DENIED');
 const frame=document.createElement('iframe');frame.title=identity.artifact_id.startsWith('ORDER-DESIGN')?'제한 검수 · 디자인 QA':r5?'제한 검수 · R5 고객 흐름':'제한 검수 · 카피·모션';
 frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
 frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; storage-access 'none'");
 // Deliberately NOT credentialless/srcdoc: initial same-origin navigation needs the
 // HttpOnly OWNER + research cookies. The HTTP CSP makes the resulting document opaque.
 // No cookie/token/source bytes enter the script or postMessage envelope.
 frame.src=url;
 if(identity.artifact_id==='ORDER-DESIGN-QA-0569-R3')return observeR3Frame({window,container,frame,identity,onState,expiresAt:permit.expires_at});
 // COPY has no outward ready API. A document load is explicitly not native/boot acceptance.
 let closed=false,loaded=false,loadTimer=null,expiryTimer=null;
 const dispose=()=>{if(closed)return;closed=true;window.clearTimeout(loadTimer);window.clearTimeout(expiryTimer);frame.removeEventListener('load',load);frame.remove()};
 const load=()=>{if(closed)return;if(loaded){dispose();onState({state:'DOCUMENT_RELOADED',native:'NOT_RUN'});return}loaded=true;window.clearTimeout(loadTimer);onState({state:'DISPLAY_LOADED_UNVERIFIED',native:'NOT_RUN',external_ready:false,engine_connected:false})};
 frame.addEventListener('load',load);
 loadTimer=window.setTimeout(()=>{if(!loaded){dispose();onState({state:'TIMEOUT',native:'NOT_RUN'})}},8000);
 expiryTimer=window.setTimeout(()=>{dispose();onState({state:'PERMIT_EXPIRED',native:'NOT_RUN'})},Math.max(0,permit.expires_at*1000-Date.now()));
 container.append(frame);return Object.freeze({frame,dispose});
}
