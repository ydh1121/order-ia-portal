// The designated Pagination Dots source assigns separate springs to the two pill edges.
// Only selection animates. The original demonstration's cycling timer and moving slide strip are omitted.
export function mountIntroPagination(nav,reduced){
  if(!nav)return;
  const dots=[...nav.querySelectorAll('button[data-mf-intro]')];
  const active=document.createElement('span');
  active.className='ob-active-pill';active.setAttribute('aria-hidden','true');nav.append(active);
  let frame=null,last=null,selected=Number(nav.querySelector('[aria-current]')?.dataset.mfIntro)||1;
  let a={x:0,v:0,t:0},b={x:0,v:0,t:0},forward=true;
  const draw=()=>{active.style.transform='translateX('+a.x.toFixed(2)+'px)';active.style.width=Math.max(5,b.x-a.x).toFixed(2)+'px';};
  function tick(now){
    const dt=last===null?1/60:Math.min((now-last)/1000,.032);
    last=now;
    // Two substeps make the original spring response stable at lower refresh rates.
    for(let i=0;i<2;i++){
      for(const [edge,lead] of [[a,!forward],[b,forward]]){
        const acc=-(lead?520:140)*(edge.x-edge.t)-(lead?34:18)*edge.v;
        edge.v+=acc*dt/2;edge.x+=edge.v*dt/2;
      }
    }
    draw();
    if([a,b].some(edge=>Math.abs(edge.v)>.05||Math.abs(edge.x-edge.t)>.02)){frame=requestAnimationFrame(tick);return;}
    frame=null;last=null;a.x=a.t;b.x=b.t;draw();
  }
  function select(n,snap=false){
    const dot=dots[n-1];
    if(!dot)return;
    if(n!==selected)forward=n>selected;
    selected=n;
    dots.forEach(button=>{if(button===dot)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    if(!dot.offsetWidth)return;
    const mid=dot.offsetLeft+dot.offsetWidth/2;
    a.t=mid-12.5;b.t=mid+12.5;
    if(snap||reduced?.()||!nav.classList.contains('has-active-pill')){
      if(frame!==null)cancelAnimationFrame(frame);frame=null;last=null;
      a.x=a.t;b.x=b.t;a.v=0;b.v=0;draw();
    }else if(frame===null){last=null;frame=requestAnimationFrame(tick);}
    nav.classList.add('has-active-pill');
  }
  select(selected,true);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>select(selected,true)):null;
  observer?.observe(nav);
  return {select,destroy(){if(frame!==null)cancelAnimationFrame(frame);observer?.disconnect();active.remove();nav.classList.remove('has-active-pill');}};
}
