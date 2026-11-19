// Runs only in the opaque, network-disabled review frame. No customer fields cross the boundary.
export function bootReviewFrame(session, installMotion, installReviewRequests, motionStyles) {
  const send=(type,payload={})=>parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type,payload},'*');
  if(window===parent)return;
  const root=document.querySelector('#order-single');
  const authored=window.ORDER_DESIGN_MODULES?.find(m=>m.id===session.screen);
  if(authored){
    const style=document.createElement('style');style.textContent=motionStyles;document.head.append(style);
    const requests=installReviewRequests(root,installMotion(root,{source:'controlled-qa'}));
    const go=(screen,state)=>send('navigate',{screen,state});
    const api={interactive:true,screen:session.screen,variant:session.variant,reduced:()=>document.documentElement.hasAttribute('data-review-reduced')||matchMedia('(prefers-reduced-motion: reduce)').matches,select:go,
      toast:message=>{let hint=root.querySelector('[data-local-toast]');if(!hint){hint=document.createElement('p');hint.dataset.localToast='';hint.setAttribute('role','status');root.append(hint);}hint.textContent=message;},
      demoSuccess:requests.run,downloadReviewDocument:()=>send('downloadReviewDocument'),saveReviewLayout:layout=>send('reviewWidgetLayout',{layout})};
    const cleanup=[window.QAUI?.sharedMount?.(root,api),authored.mount?.(root,session.state,api),requests.destroy];
    addEventListener('pagehide',()=>cleanup.forEach(f=>{if(typeof f==='function')f();}),{once:true});
  }
  function fingerprint(el) {
    const names=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
    return [el.localName,...names.map(n=>el.getAttribute(n)||'')].join('|');
  }
  function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(36);}
  const anchors=new Map(),elementIds=new WeakMap();
  function index() {
    anchors.clear(); const buckets=new Map();const paths=new WeakMap();
    root.querySelectorAll('*').forEach(el=>{
      // Ignore drawing internals. An SVG/canvas or the containing component can itself be annotated.
      if(el.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(el.tagName))return;
      const path=(paths.get(el.parentElement)||'screen')+'/'+fingerprint(el);paths.set(el,path);
      const key='a-'+hash(path);let arr=buckets.get(key);if(!arr)buckets.set(key,arr=[]);arr.push(el);
    });
    anchors.set('screen',root);elementIds.set(root,'screen');
    for(const [k,els] of buckets)if(els.length===1){anchors.set(k,els[0]);elementIds.set(els[0],k);}
  }
  function identity(el){while(el&&el!==document.documentElement){const id=elementIds.get(el);if(id&&anchors.get(id)===el)return id;el=el.parentElement;}return 'screen';}
  let picking=false, shown=true, pins=[], keyPoint=null;
  const veil=document.createElement('div'), markers=document.createElement('div');
  veil.id='r3-veil';veil.hidden=true;veil.tabIndex=0;veil.setAttribute('aria-label','의견 위치 선택. 방향키로 움직이고 Enter로 선택합니다.');
  markers.id='r3-pins';
  document.body.append(markers,veil);
  let frame=0;
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});}
  function safeScroll(){
    const scrolling=document.scrollingElement;
    const list=[{id:'document',x:scrolling.scrollLeft,y:scrolling.scrollTop}];
    for(const [id,el] of anchors)if(el!==root&&(el.scrollTop||el.scrollLeft))list.push({id,x:el.scrollLeft,y:el.scrollTop});
    return list.slice(0,24);
  }
  function visibleLayers(){
    return [...root.querySelectorAll('[aria-expanded=true],[open],dialog[open],[aria-modal=true],[data-r3-popup]:not([hidden])')].filter(el=>el.checkVisibility?el.checkVisibility():el.getClientRects().length).map(identity).filter((x,i,a)=>a.indexOf(x)===i).slice(0,24);
  }
  function choose(x,y){
    veil.style.pointerEvents='none';markers.style.visibility='hidden';
    const under=document.elementFromPoint(x,y);
    veil.style.pointerEvents='';markers.style.visibility='';
    const id=identity(under), el=anchors.get(id);const r=el.getBoundingClientRect();
    const unit=n=>Math.min(1,Math.max(0,n));
    send('point',{id,instance:session.screen,x:unit((x-r.x)/Math.max(1,r.width)),y:unit((y-r.y)/Math.max(1,r.height)),viewport:{width:innerWidth,height:innerHeight},scale:visualViewport?.scale||1,scroll:safeScroll(),layers:visibleLayers(),artifactHash:session.artifact});
  }
  function setPicking(on){
    picking=on;veil.hidden=!on;if(on){keyPoint={x:innerWidth/2,y:innerHeight/2};veil.focus({preventScroll:true});}else keyPoint=null;
  }
  root.addEventListener('r3-motion-identity-reset',()=>{pins=[];previousFocus=null;setPicking(false);index();schedule();});
  // Cover disabled inputs, embedded svg, empty space and fixed overlays before their handlers run.
  for(const type of ['pointerdown','pointerup','click','dblclick','contextmenu','dragstart','submit','drop']){
    window.addEventListener(type,event=>{
      if(!picking)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(type==='click'&&event.button===0)choose(event.clientX,event.clientY);
    },true);
  }
  addEventListener('keydown',event=>{
    if(!picking)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Escape'){setPicking(false);send('cancelPick');}
    if(event.key==='Enter'||event.key===' ')choose(keyPoint.x,keyPoint.y);
    const step=event.shiftKey?20:4;
    const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
    const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    if(dx||dy){keyPoint.x=Math.max(1,Math.min(innerWidth-1,keyPoint.x+dx));keyPoint.y=Math.max(1,Math.min(innerHeight-1,keyPoint.y+dy));veil.style.setProperty('--x',keyPoint.x+'px');veil.style.setProperty('--y',keyPoint.y+'px');}
  },true);
  let previousFocus=null;
  function paint(){
    markers.replaceChildren();if(!shown||picking)return;
    const groups=new Map();const missing=[];
    for(const pin of pins){
      const a=pin.anchor,el=anchors.get(a.id);
      if(!el||a.artifactHash!==session.artifact||a.instance!==session.screen){missing.push(pin.id);continue;}
      if(!el.getClientRects().length)continue;
      const rect=el.getBoundingClientRect(),x=rect.left+a.x*rect.width,y=rect.top+a.y*rect.height;
      if(x<0||x>innerWidth||y<0||y>innerHeight)continue;
      const groupKey=Math.round(x/18)+':'+Math.round(y/18);
      if(!groups.has(groupKey))groups.set(groupKey,{x,y,ids:[]});
      groups.get(groupKey).ids.push(pin.id);
    }
    for(const {x,y,ids} of groups.values()){
      const b=document.createElement('button');b.type='button';b.className='r3-pin';b.textContent=ids.length>1?'● '+ids.length:'●';b.style.left=x+'px';b.style.top=y+'px';b.setAttribute('aria-label',ids.length+'개 위치 의견 열기');b.onclick=()=>send('openPins',{ids});markers.append(b);
    }
    const signature=JSON.stringify(missing);if(signature!==previousFocus){previousFocus=signature;send('missing',{ids:missing});}
  }
  function restore(anchor){
    if(anchor.artifactHash!==session.artifact||!anchors.has(anchor.id)){send('missing',{ids:[]});return;}
    for(const key of anchor.layers||[]){const el=anchors.get(key);if(el?.matches('details'))el.open=true;else if(el?.matches('[data-r3-popup]'))el.hidden=false;}
    for(const s of anchor.scroll||[]){const el=s.id==='document'?document.scrollingElement:anchors.get(s.id);if(el)el.scrollTo(s.x,s.y);}
    anchors.get(anchor.id).focus?.({preventScroll:true});schedule();
  }
  addEventListener('message',event=>{
    const m=event.data;if(event.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.channel!==session.channel||m.artifact!==session.artifact)return;
    if(m.type==='mode'){setPicking(m.payload===true);schedule();}
    else if(m.type==='pins'){pins=Array.isArray(m.payload)?m.payload:[];schedule();}
    else if(m.type==='visible'){shown=m.payload===true;schedule();}
    else if(m.type==='restore'&&m.payload)restore(m.payload);
    else if(m.type==='restoreWidgetLayout'&&session.version==='current'&&session.screen==='admin-overview'&&session.state==='normal')root.dispatchEvent(new CustomEvent('r3-widget-layout',{detail:m.payload}));
  });
  // Native select popups live outside the DOM. Mirror the real options as a local accessible layer
  // so an open list can receive a pin. Keep the original select for keyboard and form semantics.
  for(const select of root.querySelectorAll('select')){
    const menu=document.createElement('div');menu.className='r3-options';menu.setAttribute('role','listbox');menu.dataset.r3Popup='';menu.hidden=true;
    for(const option of select.options){const b=document.createElement('button');b.type='button';b.textContent=option.textContent;b.setAttribute('role','option');b.onclick=()=>{select.selectedIndex=option.index;select.dispatchEvent(new Event('change',{bubbles:true}));menu.hidden=true;select.setAttribute('aria-expanded','false');select.focus();};menu.append(b);}
    select.insertAdjacentElement('afterend',menu);
    const toggle=()=>{menu.hidden=!menu.hidden;select.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){const r=select.getBoundingClientRect();menu.style.setProperty('--left',r.left+'px');menu.style.setProperty('--top',r.bottom+'px');menu.style.setProperty('--width',r.width+'px');}};
    select.addEventListener('pointerdown',e=>{if(select.disabled)return;e.preventDefault();toggle();});
    select.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;select.setAttribute('aria-expanded','false');}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();if(!menu.hidden)menu.querySelector('button')?.focus();}});
    menu.onkeydown=e=>{if(e.key==='Escape'){menu.hidden=true;select.setAttribute('aria-expanded','false');select.focus();}if(e.key==='ArrowDown')e.target.nextElementSibling?.focus();if(e.key==='ArrowUp')e.target.previousElementSibling?.focus();};
  }
  // Only fixture-local interactions and explicit catalog targets. Never navigate or send forms.
  document.addEventListener('submit',e=>e.preventDefault(),true);
  root.addEventListener('click',e=>{
    if(authored)return;const b=e.target.closest('button');if(!b)return;
    const dest=b.dataset.opRoute||b.dataset.mfGo;const toState=b.dataset.mfState;
    if(dest||toState){send('navigate',{screen:dest||session.screen,state:toState||''});return;}
    const id=b.getAttribute('aria-controls');const target=id&&document.getElementById(id);
    if(target){const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));target.hidden=!open;}
  });
  index();new MutationObserver(()=>{index();schedule();}).observe(root,{childList:true,subtree:true});
  document.addEventListener('scroll',schedule,true);addEventListener('resize',schedule);send('ready');
}
