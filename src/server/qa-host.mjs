import {createR3ObserverSession} from './qa-observer.mjs';
import {prepareIsolatedFrame} from './qa-viewer.mjs';
export async function mountR3Viewer({window,document,container,html,identity,activation,onState=()=>{}}){
 if(window.location.origin!=='https://order-ia-portal.pages.dev')throw Error('PARENT_ORIGIN_NOT_SUPPORTED');
 if(identity.artifact_id!=='ORDER-DESIGN-QA-0569-R3'||identity.version!=='R3')throw Error('UNSUPPORTED_VIEWER_REVISION');
 const frame=await prepareIsolatedFrame(document,html,identity,activation);
 let session=null,loaded=false,closed=false;
 const send=message=>{if(frame.contentWindow)frame.contentWindow.postMessage(message,'*')}; // Opaque receiver; session checks exact frame+null origin+nonce+identity.
 const receive=event=>session?.message(event);
 const cleanup=()=>{window.removeEventListener('message',receive);frame.removeEventListener('load',load);frame.remove();closed=true};
 const load=()=>{if(loaded||closed)return;loaded=true;session=createR3ObserverSession(identity,onState,{onClose:command=>{send(command);cleanup()}});send(session.attach(frame.contentWindow))};
 window.addEventListener('message',receive);frame.addEventListener('load',load);
 // Arm an independent document-load deadline: a frame that never loads must also fail closed.
 const timer=window.setTimeout(()=>{if(!loaded&&!closed){cleanup();onState({state:'TIMEOUT',code:'WRAPPER_LOAD_TIMEOUT'})}},8000);
 frame.addEventListener('load',()=>window.clearTimeout(timer),{once:true});
 container.append(frame);
 return Object.freeze({frame,probe(){if(!session||closed)throw Error('VIEWER_NOT_READY');send(session.probe())},cancelStyle(){if(!session||closed)throw Error('VIEWER_NOT_READY');send(session.cancel())},dispose(){window.clearTimeout(timer);if(session)session.dispose();else cleanup()}});
}
