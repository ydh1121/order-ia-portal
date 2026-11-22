import {installResearchInspector} from './review-inspector.mjs';
import {installResearchReviewPanels} from './inspector-panels.mjs';

/** The optional review shell chooses a scenario or acknowledges an app-owned
 * route. This layer never implements a product action or stores a quote. */
export async function attachResearchReview(app,config){
  const controller=new AbortController();let session={...config.inspection},sequence=0,selecting=false;
  const validMode=value=>value===undefined||value==='simple'||value==='detailed';
  const modeOf=value=>value?.mode==='detailed'?'detailed':'simple';
  const root=document.getElementById('order-single');
  const inspector=installResearchInspector(session,{root,installPanels:installResearchReviewPanels});
  if(!inspector)throw Error('INSPECTION_UNAVAILABLE');
  const motionModes=new Set(['replay','normal','delay','error','offline','complete']);
  const sameRoute=(route,target)=>route&&['screen','state','variant'].every(key=>route[key]===target[key])&&modeOf(route)===modeOf(target);
  function activePageOwner(){
    const inspection=inspector.inspect();
    if(selecting||!inspection.active||inspection.pendingRoute||session.version!=='current'||inspection.session.version!=='current'||
      inspection.session.channel!==session.channel||inspection.session.artifact!==session.artifact||!sameRoute(inspection.session,session))return null;
    const snapshot=app.snapshot(),route=snapshot?.route,pageRoute=snapshot?.pageRoute;
    if(!['page','pricing'].includes(route?.kind)||pageRoute?.kind!==route.kind||!sameRoute(route,session)||!sameRoute(pageRoute,session))return null;
    const owner=document.getElementById(route.kind==='pricing'?'order-app-pricing':'order-app-page');
    if(!owner?.isConnected||owner.closest('#order-single')!==root||owner.dataset.researchSceneConnection!=='connected')return null;
    for(let node=owner;node;node=node.parentElement){
      if(node.hidden||node.inert===true||node.getAttribute('aria-hidden')==='true')return null;
      const style=getComputedStyle(node);if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return null;
    }
    return owner;
  }
  function motionScenario(mode){
    if(!motionModes.has(mode))return;
    const owner=activePageOwner();if(!owner)return;
    const requestId=session.screen==='quote-wait'?owner.dataset.waitRequest:null;
    if(session.screen==='quote-wait'&&(!requestId||requestId.length>240))return;
    // The authored controller owns completion/retry and resulting navigation.
    // Forward QA input to its actual mount owner, never to a hidden parent page.
    owner.dispatchEvent(new CustomEvent('r3-motion-scenario',{detail:{mode}}));
    if(activePageOwner()!==owner)return;
    if(session.screen==='quote-wait'&&owner.dataset.waitRequest===requestId){
      const status={normal:'pending',delay:'delayed',error:'error',offline:'offline',complete:'success',replay:'retry'}[mode];
      owner.dispatchEvent(new CustomEvent('order:quote-response',{detail:{requestId,status,canView:true}}));
    }
    if(session.screen==='quote-result'&&mode==='replay')owner.dispatchEvent(new CustomEvent('r3-result-state',{detail:{state:session.state,replay:true}}));
  }
  window.addEventListener('message',async event=>{
    const message=event.data;
    if(event.source!==parent||event.origin!==location.origin||message?.scope!=='ORDER_R3_HOST'||message.channel!==session.channel||message.artifact!==session.artifact)return;
    if(message.type==='motionScenario'){motionScenario(message.payload?.mode);return;}
    if(message.type!=='researchSelect')return;
    const next=message.payload;
    if(!next||!/^[a-f0-9-]{36}$/.test(next.channel||'')||!/^[a-f0-9]{64}$/.test(next.artifact||next.hash||'')||next.version!=='current'||!Number.isInteger(next.viewport)||next.viewport<1||next.viewport>10000||!['screen','state','variant'].every(key=>typeof next[key]==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(next[key])&&next.route?.[key]===next[key])||!validMode(next.mode)||!validMode(next.route?.mode)||modeOf(next)!==modeOf(next.route))return;
    if(next.acknowledgeOnly&&(!Number.isSafeInteger(next.routeRevision)||next.routeRevision!==inspector.inspect().routeRevision))return;
    const generation=++sequence;selecting=true;
    try{
      if(!next.acknowledgeOnly&&await app.inspectRoute({...next.route,fixture:next.fixture})===false)throw Error('INSPECTION_NAVIGATION_CANCELLED');
      if(generation!==sequence)return;
      if(inspector.updateSession(next)===false){
        if(next.acknowledgeOnly&&next.routeRevision!==inspector.inspect().routeRevision)return;
        throw Error('INSPECTION_TARGET_CHANGED');
      }
      session={...session,...next,artifact:next.artifact||next.hash};
      if(modeOf(next)==='simple')delete session.mode;
    }catch(error){const cancelled=error?.message==='INSPECTION_NAVIGATION_CANCELLED';if(generation===sequence)parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'researchError',payload:{code:cancelled?'INSPECTION_NAVIGATION_CANCELLED':'SCENE_UNAVAILABLE',channel:next.channel}},location.origin);if(!cancelled)console.error(error);}
    finally{if(generation===sequence)selecting=false;}
  },{signal:controller.signal});
  window.addEventListener('pagehide',()=>{controller.abort();inspector.dispose();},{once:true,signal:controller.signal});
  return {dispose(){controller.abort();inspector.dispose();}};
}
