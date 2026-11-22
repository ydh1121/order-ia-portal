import {installResearchInspector} from './review-inspector.mjs';
import {installResearchReviewPanels} from './inspector-panels.mjs';

/** The optional review shell chooses a scenario or acknowledges an app-owned
 * route. This layer never implements a product action or stores a quote. */
export async function attachResearchReview(app,config){
  const controller=new AbortController();let session={...config.inspection},sequence=0;
  const inspector=installResearchInspector(session,{root:document.getElementById('order-single'),installPanels:installResearchReviewPanels});
  if(!inspector)throw Error('INSPECTION_UNAVAILABLE');
  window.addEventListener('message',async event=>{
    const message=event.data;
    if(event.source!==parent||event.origin!==location.origin||message?.scope!=='ORDER_R3_HOST'||message.channel!==session.channel||message.artifact!==session.artifact||message.type!=='researchSelect')return;
    const next=message.payload;
    if(!next||!/^[a-f0-9-]{36}$/.test(next.channel||'')||!/^[a-f0-9]{64}$/.test(next.artifact||next.hash||'')||next.version!=='current'||!Number.isInteger(next.viewport)||next.viewport<1||next.viewport>10000||!['screen','state','variant'].every(key=>typeof next[key]==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(next[key])&&next.route?.[key]===next[key]))return;
    if(next.acknowledgeOnly&&(!Number.isSafeInteger(next.routeRevision)||next.routeRevision!==inspector.inspect().routeRevision))return;
    const generation=++sequence;
    try{
      if(!next.acknowledgeOnly&&await app.inspectRoute({...next.route,fixture:next.fixture})===false)throw Error('INSPECTION_NAVIGATION_CANCELLED');
      if(generation!==sequence)return;
      if(inspector.updateSession(next)===false){
        if(next.acknowledgeOnly&&next.routeRevision!==inspector.inspect().routeRevision)return;
        throw Error('INSPECTION_TARGET_CHANGED');
      }
      session={...session,...next,artifact:next.artifact||next.hash};
    }catch(error){if(generation===sequence)parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'researchError',payload:{code:'SCENE_UNAVAILABLE',channel:next.channel}},location.origin);console.error(error);}
  },{signal:controller.signal});
  window.addEventListener('pagehide',()=>{controller.abort();inspector.dispose();},{once:true,signal:controller.signal});
  return {dispose(){controller.abort();inspector.dispose();}};
}
