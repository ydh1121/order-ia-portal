// Review instrumentation for a real URL/real API document. It never mounts a
// product fixture, replaces a transport, or drives application outcomes.
export function installLiveInspection(context){
 if(window===parent||!context.runId)return;
 const send=(type,payload)=>parent.postMessage({scope:'ORDER_PRODUCT_INSPECTION',runId:context.runId,persona:context.persona,documentId:context.documentId,type,payload},location.origin);
 let picking=false,selected=null;
 const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);};
 const identity=el=>{const parts=[];for(let n=el;n&&n!==document.body;n=n.parentElement){parts.unshift(n.localName+':'+(n.id||n.getAttribute('name')||n.getAttribute('data-action')||[...n.parentElement.children].indexOf(n)));if(n.id)break;}return 'live-'+hash(parts.join('/'));};
 const capture=event=>{
  if(!picking)return;event.preventDefault();event.stopImmediatePropagation();
  if(event.type!=='click')return;const el=event.target.closest('button,input,select,textarea,a,label,h1,h2,h3,p,article,section,main')||event.target,r=el.getBoundingClientRect(),unit=n=>Math.max(0,Math.min(1,n));
  selected={id:identity(el),instance:'product',x:unit((event.clientX-r.left)/Math.max(1,r.width)),y:unit((event.clientY-r.top)/Math.max(1,r.height)),viewport:{width:innerWidth,height:innerHeight},scale:1,scroll:[{id:'document',x:scrollX,y:scrollY}],layers:[],artifactHash:context.buildDigest};
  el.dataset.liveReviewAnchor=selected.id;send('point',{anchor:selected,path:location.pathname+location.search,label:(el.innerText||el.getAttribute('aria-label')||el.localName).slice(0,120)});
 };
 for(const type of ['pointerdown','pointerup','click'])addEventListener(type,capture,true);
 addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.scope!=='ORDER_PRODUCT_INSPECTION'||event.data.runId!==context.runId)return;
  if(event.data.type==='pick'){picking=Boolean(event.data.payload);document.documentElement.style.cursor=picking?'crosshair':'';}
  if(event.data.type==='restore'){
   const point=event.data.payload;for(const s of point?.scroll||[])if(s.id==='document')window.scrollTo(s.x,s.y);
   const el=[...document.querySelectorAll('body *')].find(n=>identity(n)===point?.id);el?.scrollIntoView({block:'center'});el?.focus?.();
  }
 });
 addEventListener('keydown',event=>{if(picking&&event.key==='Escape'){picking=false;document.documentElement.style.cursor='';send('cancel',{});}},true);
 send('ready',{path:location.pathname+location.search,buildDigest:context.buildDigest});
}
