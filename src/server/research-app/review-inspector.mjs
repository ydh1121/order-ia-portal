// Optional QA inspection of an already running product app. This module never
// mounts product UI, changes routes, submits forms or substitutes app transport.
import {installPinProjection} from '../r3-ui/pin-projection.mjs';

export function installResearchInspector(initialSession,options={}) {
  if(window===parent||location.origin==='null')return null;
  const root=options.root||document.getElementById('order-single');
  if(!root||root!==document.getElementById('order-single')||document.querySelectorAll('#order-single').length!==1)return null;
  if(root.__orderResearchInspector){root.__orderResearchInspector.updateSession(initialSession);return root.__orderResearchInspector;}
  if(document.getElementById('r3-veil')||document.getElementById('r3-pins'))return null;
  const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(value);
  const validMode=value=>value===undefined||value==='simple'||value==='detailed';
  const modeOf=value=>value?.mode==='detailed'?'detailed':'simple';
  const modeFields=value=>modeOf(value)==='detailed'?{mode:'detailed'}:{};
  const normalize=value=>{
    if(!value||typeof value!=='object'||!token(value.channel)||!token(value.screen)||!token(value.state)||!token(value.variant))return null;
    const artifact=value.artifact||value.hash,viewport=value.viewport??value.width??innerWidth,version=value.version||'current';
    if(!/^[a-f0-9]{64}$/.test(artifact||'')||!Number.isInteger(viewport)||viewport<1||viewport>10000||!['current','recorded'].includes(version)||!validMode(value.mode))return null;
    return {channel:value.channel,artifact,screen:value.screen,state:value.state,variant:value.variant,version,viewport,...modeFields(value)};
  };
  if(!normalize(initialSession))return null;
  const session={},parentOrigin=location.origin;
  const allowed=new Set(['mode','pins','pin-sources','pin-view','visible','restore']);
  const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
  const anchors=new Map();let elementIds=new WeakMap();
  let active=false,disposed=false,picking=false,shown=true,dirty=true,pins=[],selection=[],draftAnchor=null,keyPoint=null;
  let frame=0,readyFrame=0,readyTimer=0,revision=0,routeRevision=0,pendingRoute=null,previousMissing='',projection=null,panels=null,lastActivity=-Infinity;
  const style=document.createElement('style');style.dataset.researchInspector='';
  style.textContent=`
#r3-veil{position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:pan-x pan-y;background:transparent;outline:none}
#r3-veil[hidden],.approval-draft-pin[hidden]{display:none!important}
#r3-veil:focus-visible:after{content:'+';position:absolute;left:var(--x,50%);top:var(--y,50%);color:#214ca8}
#r3-pins{position:fixed;inset:0;z-index:2147483646;pointer-events:none}
#r3-pins .r3-pin,.approval-draft-pin{position:fixed;transform:translate(-50%,-50%);display:grid;place-items:center;box-sizing:border-box;width:25px;height:25px;border:2px solid white;border-radius:50%;background:#315de6;color:white;font:700 11px/1 system-ui;box-shadow:0 2px 8px #191f2830}
#r3-pins .r3-pin{pointer-events:auto;cursor:pointer;padding:0}
#r3-pins .r3-pin.is-previous{background:#7c3aed}
#r3-pins .r3-pin.is-mixed{background:linear-gradient(135deg,#7c3aed 0 50%,#315de6 50% 100%)}
#r3-pins .r3-pin.is-resolved{border-style:dashed}
#r3-pins .r3-pin.is-resolved:before{content:'✓';position:absolute;left:-5px;bottom:-5px;border-radius:50%;background:white;color:#087f5b;font:800 9px/12px system-ui;width:12px;height:12px}
#r3-pins .r3-pin.is-selected,#r3-pins .r3-pin:focus-visible{outline:3px solid #315de655;outline-offset:2px}
#r3-pins .r3-pin.is-previous.is-selected{outline-color:#7c3aed55}
#r3-pins .r3-pin[data-cluster]:not([data-cluster='']):after{content:attr(data-cluster);position:absolute;right:-9px;top:-7px;background:white;color:#315de6;border-radius:8px;font:700 9px/14px system-ui;min-width:14px}
.approval-draft-pin{z-index:2147483647;pointer-events:none;background:white;color:#315de6;border-color:#315de6;font-size:17px}
`;
  const veil=document.createElement('div'),markers=document.createElement('div'),draft=document.createElement('span');
  veil.id='r3-veil';veil.hidden=true;veil.tabIndex=0;veil.setAttribute('role','application');
  veil.setAttribute('aria-label','코멘트 위치 선택. 방향키로 이동하고 Enter로 선택, Escape로 취소합니다.');
  markers.id='r3-pins';markers.setAttribute('aria-label','위치 코멘트');
  draft.className='approval-draft-pin';draft.textContent='+';draft.hidden=true;draft.setAttribute('aria-label','저장 전 위치');
  document.head.append(style);document.body.append(markers,veil,draft);
  const send=(type,payload={})=>{if(!disposed)parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type,payload},parentOrigin);};
  const activityTypes=['pointerdown','keydown','input','wheel'];
  function activity(event){
    if(disposed||!active||event.isTrusted!==true||!root.contains(event.target))return;
    const now=Date.now();if(now-lastActivity<30000)return;lastActivity=now;send('userActivity');
  }
  for(const type of activityTypes)addEventListener(type,activity,{capture:true,passive:true});
  const validAnchor=a=>a&&token(a.id)&&a.instance===session.screen&&a.artifactHash===session.artifact&&validMode(a.mode)&&modeOf(a)===modeOf(session)&&[a.x,a.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1);
  // Capture before the released projection/panel listeners. Their parent and
  // identity checks support either iframe origin; this research app also binds
  // messages to the same origin and the exact inspection-only allow-list.
  function gate(event){
    const m=event.data;if(m?.scope!=='ORDER_R3_HOST')return;
    // The separate review bridge owns researchSelect and validates its payload.
    // A pending route must still accept that host acknowledgement; ordinary
    // inspection commands remain suspended until updateSession succeeds.
    const acknowledgement=m.type==='researchSelect';
    if(disposed||!active&&!acknowledgement||event.source!==parent||event.origin!==parentOrigin||m.channel!==session.channel||m.artifact!==session.artifact||!acknowledgement&&!allowed.has(m.type))event.stopImmediatePropagation();
  }
  addEventListener('message',gate,true);
  function hash(value){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(36);}
  function index(){
    anchors.clear();elementIds=new WeakMap();const paths=new WeakMap(),buckets=new Map();
    for(const el of root.querySelectorAll('*')){
      if(el.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(el.tagName))continue;
      const path=(paths.get(el.parentElement)||'screen')+'/'+[el.localName,...fields.map(name=>el.getAttribute(name)||'')].join('|');paths.set(el,path);
      const id='a-'+hash(path);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(el);
    }
    anchors.set('screen',root);elementIds.set(root,'screen');
    for(const [id,nodes] of buckets)if(nodes.length===1){anchors.set(id,nodes[0]);elementIds.set(nodes[0],id);}
    dirty=false;
  }
  function identity(el){while(el&&root.contains(el)){const id=elementIds.get(el);if(id&&anchors.get(id)===el)return id;el=el.parentElement;}return 'screen';}
  function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;paint();});}
  const watchedAnimations=new WeakSet(),observedGeometry=new Set();
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  function followGeometry(){
    const elements=new Set([root]);
    for(const anchor of [...pins.map(pin=>pin.anchor),draftAnchor])if(validAnchor(anchor)){const el=anchors.get(anchor.id);if(el)elements.add(el);}
    if(resizeObserver){
      for(const el of observedGeometry)if(!elements.has(el)){resizeObserver.unobserve(el);observedGeometry.delete(el);}
      for(const el of elements)if(!observedGeometry.has(el)){observedGeometry.add(el);resizeObserver.observe(el);}
    }
    if(!pins.length&&!draftAnchor)return;
    // Web Animations move transformed sheets without DOM mutations, scroll or
    // resize events. Follow finite motion and repaint once more when it settles.
    const animations=root.getAnimations?.({subtree:true})||[];
    for(const animation of animations){
      const timing=animation.effect?.getComputedTiming?.();
      if(timing?.iterations===Infinity)continue;
      if(!watchedAnimations.has(animation)){
        watchedAnimations.add(animation);
        animation.finished?.then(schedule,schedule);
      }
      if(animation.pending||animation.playState==='running')schedule();
    }
  }
  function position(a){
    if(!validAnchor(a))return null;
    const el=anchors.get(a.id);if(!el?.getClientRects().length)return null;
    const rect=el.getBoundingClientRect(),x=rect.left+a.x*rect.width,y=rect.top+a.y*rect.height;
    return x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight?{x,y}:null;
  }
  function paint(){
    if(dirty)index();markers.replaceChildren();draft.hidden=true;
    if(!active||!shown||picking)return;
    const groups=new Map(),missing=[];
    pins.forEach((pin,i)=>{
      if(!validAnchor(pin.anchor)||!anchors.has(pin.anchor.id)){missing.push(pin.id);return;}
      const point=position(pin.anchor);if(!point)return;
      const key=Math.round(point.x/18)+':'+Math.round(point.y/18);
      if(!groups.has(key))groups.set(key,{...point,pins:[]});
      groups.get(key).pins.push({...pin,ordinal:Number.isSafeInteger(pin.ordinal)&&pin.ordinal>0?pin.ordinal:i+1});
    });
    for(const group of groups.values()){
      const list=group.pins,ids=list.map(pin=>pin.id),previous=list.filter(pin=>pin.previous===true).length,current=list.length-previous,resolved=list.every(pin=>pin.resolved===true);
      const b=document.createElement('button');b.type='button';b.className='r3-pin';b.textContent=String(list[0].ordinal);b.style.left=group.x+'px';b.style.top=group.y+'px';
      b.dataset.cluster=list.length>1?'+'+(list.length-1):'';b.dataset.previousCount=String(previous);b.dataset.currentCount=String(current);
      b.classList.toggle('is-previous',previous===list.length);b.classList.toggle('is-mixed',previous>0&&current>0);b.classList.toggle('is-resolved',resolved);b.classList.toggle('is-selected',ids.some(id=>selection.includes(id)));
      b.setAttribute('aria-label',(previous===list.length?'이전 ':'')+'위치 코멘트 '+list.map(pin=>pin.ordinal).join(', ')+'번 열기'+(previous>0&&current>0?' · 이전 '+previous+'개, 현재 '+current+'개':'')+(resolved?' · 해결됨':''));
      b.onclick=event=>{event.preventDefault();event.stopPropagation();send('openPins',{ids});};markers.append(b);
    }
    const signature=JSON.stringify(missing);if(signature!==previousMissing){previousMissing=signature;send('missing',{ids:missing});}
    const point=position(draftAnchor);if(point){draft.hidden=false;draft.style.left=point.x+'px';draft.style.top=point.y+'px';}
    followGeometry();
  }
  function setPicking(on){
    picking=Boolean(active&&on);veil.hidden=!picking;
    if(picking){keyPoint={x:innerWidth/2,y:innerHeight/2};veil.style.removeProperty('--x');veil.style.removeProperty('--y');veil.focus({preventScroll:true});}
    else keyPoint=null;
    schedule();
  }
  function safeScroll(){
    const scrolling=document.scrollingElement||document.documentElement,list=[{id:'document',x:Math.max(0,scrolling.scrollLeft),y:Math.max(0,scrolling.scrollTop)}];
    for(const [id,el] of anchors)if(el!==root&&(el.scrollTop||el.scrollLeft))list.push({id,x:Math.max(0,el.scrollLeft),y:Math.max(0,el.scrollTop)});
    return list.slice(0,24);
  }
  function visibleLayers(){return [...root.querySelectorAll('[aria-expanded=true],[open],dialog[open],[aria-modal=true],[data-r3-popup]:not([hidden])')].filter(el=>el.checkVisibility?el.checkVisibility():el.getClientRects().length).map(identity).filter((id,i,all)=>all.indexOf(id)===i).slice(0,24);}
  function choose(x,y){
    if(!active||!picking||![x,y].every(Number.isFinite))return;
    if(dirty)index();veil.style.pointerEvents='none';markers.style.visibility='hidden';
    let under;try{under=document.elementFromPoint(x,y);}finally{veil.style.pointerEvents='';markers.style.visibility='';}
    const id=identity(under),el=anchors.get(id),rect=el.getBoundingClientRect(),unit=n=>Math.max(0,Math.min(1,n));
    const anchor={id,instance:session.screen,x:unit((x-rect.left)/Math.max(1,rect.width)),y:unit((y-rect.top)/Math.max(1,rect.height)),viewport:{width:innerWidth,height:innerHeight},scale:window.visualViewport?.scale||1,scroll:safeScroll(),layers:visibleLayers(),artifactHash:session.artifact,...modeFields(session)};
    send('point',anchor);
  }
  // Only the annotation veil consumes pointer input while the reviewer is
  // choosing a point. App inputs, submit events and navigation are untouched.
  const pointerTypes=['pointerdown','pointerup','click','dblclick','contextmenu','dragstart','drop'];
  function pointEvent(event){if(!active||!picking||!event.composedPath().includes(veil))return;event.preventDefault();event.stopImmediatePropagation();if(event.type==='click'&&event.button===0)choose(event.clientX,event.clientY);}
  for(const type of pointerTypes)addEventListener(type,pointEvent,true);
  function keyEvent(event){
    if(!active||!picking||event.target!==veil||event.isComposing)return;
    if(!['Escape','Enter',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','c','C'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(['Escape','c','C'].includes(event.key)){setPicking(false);send('cancelPick');return;}
    if(event.key==='Enter'||event.key===' '){choose(keyPoint.x,keyPoint.y);return;}
    const step=event.shiftKey?20:4,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    keyPoint.x=Math.max(1,Math.min(innerWidth-1,keyPoint.x+dx));keyPoint.y=Math.max(1,Math.min(innerHeight-1,keyPoint.y+dy));veil.style.setProperty('--x',keyPoint.x+'px');veil.style.setProperty('--y',keyPoint.y+'px');
  }
  addEventListener('keydown',keyEvent,true);
  function restore(anchor){
    index();if(!validAnchor(anchor)||!anchors.has(anchor.id))return;
    for(const id of Array.isArray(anchor.layers)?anchor.layers.slice(0,24):[]){const el=anchors.get(id);if(el?.matches('details'))el.open=true;else if(el?.matches('[data-r3-popup]'))el.hidden=false;}
    for(const scroll of Array.isArray(anchor.scroll)?anchor.scroll.slice(0,24):[]){
      if(!scroll||![scroll.x,scroll.y].every(n=>Number.isFinite(n)&&n>=0))continue;
      const el=scroll.id==='document'?document.scrollingElement||document.documentElement:anchors.get(scroll.id);el?.scrollTo?.(scroll.x,scroll.y);
    }
    anchors.get(anchor.id).focus?.({preventScroll:true});schedule();
  }
  function receive(event){
    const m=event.data;if(disposed||!active||event.source!==parent||event.origin!==parentOrigin||m?.scope!=='ORDER_R3_HOST'||m.channel!==session.channel||m.artifact!==session.artifact)return;
    if(m.type==='mode')setPicking(m.payload===true);
    else if(m.type==='pins'){pins=Array.isArray(m.payload)?m.payload.filter(p=>p&&typeof p.id==='string').slice(0,2000):[];dirty=true;schedule();}
    else if(m.type==='pin-view'){draftAnchor=m.payload?.draft||null;selection=Array.isArray(m.payload?.selected)?m.payload.selected.filter(id=>typeof id==='string').slice(0,2000):[];schedule();}
    else if(m.type==='visible'){shown=m.payload===true;schedule();}
    else if(m.type==='restore')restore(m.payload);
  }
  function releaseHelpers(){projection?.dispose();panels?.dispose();projection=null;panels=null;}
  function routeData(value){
    if(!value||!token(value.screen)||!token(value.state)||!token(value.variant)||!validMode(value.mode))return null;
    const route={screen:value.screen,state:value.state,variant:value.variant,mode:modeOf(value)};
    for(const key of ['kind','build'])if(token(value[key]))route[key]=value[key];
    if(typeof value.parent==='string'&&/^[a-zA-Z0-9_./-]{1,240}$/.test(value.parent))route.parent=value.parent;
    else if(value.parent&&typeof value.parent==='object'){const p={};for(const key of ['screen','state','variant','mode','kind'])if(token(value.parent[key]))p[key]=value.parent[key];if(Object.keys(p).length)route.parent=p;}
    return route;
  }
  function routeChanged(event){
    const route=routeData(event.detail);if(disposed||!route||!['application','review'].includes(event.detail.origin))return;
    active=false;revision++;pendingRoute=route;cancelAnimationFrame(readyFrame);clearTimeout(readyTimer);readyFrame=0;readyTimer=0;setPicking(false);pins=[];selection=[];draftAnchor=null;previousMissing='';markers.replaceChildren();draft.hidden=true;
    releaseHelpers();dirty=true;
    // A host-requested inspection route already has its own artifact lookup.
    // It still suspends the old identity until that explicit acknowledgement.
    if(event.detail.origin==='application'){routeRevision++;send('researchRoute',{route,routeRevision});}
  }
  function updateSession(next){
    if(disposed)return false;
    const value=normalize(next);if(!value||document.getElementById('order-single')!==root||!root.isConnected)return false;
    if(next.routeRevision!==undefined&&next.routeRevision!==routeRevision)return false;
    if(pendingRoute&&(['screen','state','variant'].some(key=>pendingRoute[key]!==value[key])||modeOf(pendingRoute)!==modeOf(value)))return false;
    active=false;revision++;cancelAnimationFrame(readyFrame);clearTimeout(readyTimer);releaseHelpers();removeEventListener('message',receive);
    delete session.mode;Object.assign(session,value);pendingRoute=null;pins=[];selection=[];draftAnchor=null;previousMissing='';dirty=true;setPicking(false);
    const states=Array.isArray(options.authStates)?options.authStates.slice():[];
    if(['login','signup','otp','password','terms'].includes(session.screen)&&!states.some(entry=>entry?.[0]===session.screen&&entry?.[1]===session.state))states.push([session.screen,session.state]);
    if(typeof options.installPanels==='function')panels=options.installPanels(session,states);
    projection=installPinProjection(session);addEventListener('message',receive);active=true;index();schedule();
    const expected=revision;
    const ready=()=>{cancelAnimationFrame(readyFrame);clearTimeout(readyTimer);readyFrame=0;readyTimer=0;if(!disposed&&active&&expected===revision)send('ready',{routeRevision,version:session.version,...modeFields(session)});};
    // Hidden evidence frames may not receive animation frames. The app has
    // already completed its module mount before this optional inspector starts.
    readyFrame=requestAnimationFrame(ready);readyTimer=setTimeout(ready,50);
    return true;
  }
  function changed(){dirty=true;schedule();}
  const observer=new MutationObserver(changed);observer.observe(root,{childList:true,subtree:true});
  const geometryEvents=['animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel','click','pointerdown','keydown','input','change'];
  for(const type of geometryEvents)root.addEventListener(type,schedule,true);
  document.fonts?.ready?.then(schedule,()=>{});document.fonts?.addEventListener('loadingdone',schedule);
  addEventListener('order:research-route',routeChanged);addEventListener('scroll',schedule,true);addEventListener('resize',schedule);
  root.addEventListener('r3-motion-identity-reset',changed);
  function dispose(){
    if(disposed)return;disposed=true;active=false;revision++;cancelAnimationFrame(frame);cancelAnimationFrame(readyFrame);clearTimeout(readyTimer);observer.disconnect();resizeObserver?.disconnect();observedGeometry.clear();releaseHelpers();
    removeEventListener('message',gate,true);removeEventListener('message',receive);removeEventListener('keydown',keyEvent,true);removeEventListener('order:research-route',routeChanged);removeEventListener('scroll',schedule,true);removeEventListener('resize',schedule);removeEventListener('pagehide',dispose);
    for(const type of pointerTypes)removeEventListener(type,pointEvent,true);root.removeEventListener('r3-motion-identity-reset',changed);
    for(const type of activityTypes)removeEventListener(type,activity,true);
    for(const type of geometryEvents)root.removeEventListener(type,schedule,true);
    document.fonts?.removeEventListener('loadingdone',schedule);
    veil.remove();markers.remove();draft.remove();style.remove();if(root.__orderResearchInspector===api)delete root.__orderResearchInspector;
  }
  const api={updateSession,dispose,inspect:()=>({active,picking,routeRevision,pendingRoute:pendingRoute?{...pendingRoute}:null,session:{...session}})};
  root.__orderResearchInspector=api;addEventListener('pagehide',dispose,{once:true});updateSession(initialSession);
  return api;
}
