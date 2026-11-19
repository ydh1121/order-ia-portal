// Install before the released review bridge takes focus for position annotations.
export function installReviewShortcut(session) {
  if (window === parent) return;
  window.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'c') return;
    const veil = document.getElementById('r3-veil');
    if (!veil || veil.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'cancelPick',payload:{}}, '*');
  }, true);
}

// Presentation inside the opaque preview. The released review runtime continues to own selection,
// anchor clicks and all product input. No file, credential, comment text or network access here.
export function mountApprovedMarkers(session) {
  if (window===parent) return;
  const root=document.querySelector('#order-single'), markers=document.querySelector('#r3-pins');
  if (!root||!markers) return;
  const draft=document.createElement('span');
  draft.className='approval-draft-pin';
  draft.textContent='+';
  draft.setAttribute('aria-label','저장 전 위치');
  draft.hidden=true;
  document.body.append(draft);
  let pins=[], selection=[], draftAnchor=null, shown=true, picking=false, frame=0, dirty=true;
  const order=new Map(), anchors=new Map();
  // Mirror the released resolver for presentation only. Unmatched or ambiguous elements never receive a marker.
  const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
  function index(){
    anchors.clear();
    anchors.set('screen',root);
    const counts=new Map(),paths=new WeakMap();
    for(const el of root.querySelectorAll('*')){
      if(el.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(el.tagName))continue;
      const key=(paths.get(el.parentElement)||'screen')+'/'+[el.localName,...fields.map(k=>el.getAttribute(k)||'')].join('|');
      paths.set(el,key);
      let hash=2166136261;
      for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619);
      const id='a-'+(hash>>>0).toString(36);
      counts.set(id,(counts.get(id)||0)+1);
      if(counts.get(id)===1)anchors.set(id,el);
      else anchors.delete(id);
    }
    dirty=false;
  }
  function position(anchor) {
    if(!anchor||anchor.artifactHash!==session.artifact||anchor.instance!==session.screen)return null;
    const el=anchors.get(anchor.id);
    if(!el?.getClientRects().length)return null;
    const rect=el.getBoundingClientRect(),x=rect.left+anchor.x*rect.width,y=rect.top+anchor.y*rect.height;
    return x>=0 && y>=0 && x<=innerWidth && y<=innerHeight ? {x,y} : null;
  }
  const groupKey=(x,y)=>Math.round(x/18)+':'+Math.round(y/18);
  function paint(){
    if(dirty)index();
    const groups=new Map();
    for(const pin of pins){
      const p=position(pin.anchor);
      if(!p)continue;
      const key=groupKey(p.x,p.y);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(pin);
    }
    for(const el of markers.querySelectorAll('.r3-pin')){
      const group=groups.get(groupKey(parseFloat(el.style.left),parseFloat(el.style.top)));
      if(!group?.length)continue;
      const nums=group.map(p=>Number.isSafeInteger(p.ordinal)&&p.ordinal>0?p.ordinal:order.get(p.id));
      el.textContent=String(nums[0]);
      el.dataset.cluster=group.length>1?'+'+(group.length-1):'';
      el.setAttribute('aria-label','위치 코멘트 '+nums.join(', ')+'번 열기');
      el.classList.toggle('is-selected',group.some(p=>selection.includes(p.id)));
      el.classList.toggle('is-resolved',group.every(p=>p.resolved));
    }
    const p=shown&&!picking?position(draftAnchor):null;
    draft.hidden=!p;
    if(p){draft.style.left=p.x+'px';draft.style.top=p.y+'px';}
  }
  function schedule(){
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});
  }
  root.addEventListener('r3-motion-identity-reset',()=>{
    pins=[];selection=[];draftAnchor=null;picking=false;dirty=true;order.clear();draft.hidden=true;schedule();
  });
  new MutationObserver(schedule).observe(markers,{childList:true});
  new MutationObserver(()=>{dirty=true;schedule();}).observe(root,{childList:true,subtree:true});
  addEventListener('scroll',schedule,true);
  addEventListener('resize',schedule);
  addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.channel!==session.channel||m.artifact!==session.artifact)return;
    if(m.type==='pins'&&Array.isArray(m.payload)){
      pins=m.payload;
      for(const item of pins)if(!order.has(item.id))order.set(item.id,order.size+1);
    }else if(m.type==='pin-view'){
      draftAnchor=m.payload?.draft||null;
      selection=Array.isArray(m.payload?.selected)?m.payload.selected:[];
    }else if(m.type==='visible')shown=m.payload===true;
    else if(m.type==='mode')picking=m.payload===true;
    else return;
    schedule();
  });
}
