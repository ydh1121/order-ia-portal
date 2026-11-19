// Vanilla WAAPI adaptation of AnimateIcons' Lucide search-icon and file-search-icon.
export function introSearchIcon(simple) {
  const lens = simple
    ? '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.34-4.34"/>'
    : '<circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.3 16.3 15 18"/>';
  const field = '<g data-icon-lens>'+lens+'</g>';
  const shapes = simple ? field : '<g data-icon-page><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>'+field+'</g>';
  return '<svg aria-hidden="true" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" data-intro-icon="'+(simple?'search':'file-search')+'">'+shapes+'</svg>';
}

export function mountIntroIcons(root, reduced) {
  const buttons=[...root.querySelectorAll('.ob-mode.card')];
  const signal=new AbortController();
  const runners=buttons.map(button=>{
    const svg=button.querySelector('[data-intro-icon]'),lens=svg?.querySelector('[data-icon-lens]'),page=svg?.querySelector('[data-icon-page]');
    let timer,active=[],suspended=false;
    function stop(){clearTimeout(timer);for(const a of active)a.cancel();active=[];}
    function schedule(){if(!suspended&&!reduced?.()&&!document.hidden)timer=setTimeout(play,2000+Math.random()*1000);}
    function play(){
      stop();
      if(!lens?.animate||reduced?.()||document.hidden||suspended)return;
      const points=page?[[0,0,0],[-1.4,.3,0],[-.4,-1.3,0],[.7,-.4,0],[0,0,0]]:
        [[0,0,0],[2,-1,6],[-2,2,-6],[1,-1,4],[0,0,0]];
      lens.style.transformOrigin='center';lens.style.transformBox='fill-box';
      active=[lens.animate(points.map(([x,y,r])=>({transform:'translate('+x+'px,'+y+'px) rotate('+r+'deg)'})),{duration:page?800:1000,easing:'ease-in-out'})];
      if(page){page.style.transformOrigin='12px 12px';page.style.transformBox='view-box';active.push(page.animate([1,1.08,.98,1].map((s,i)=>({transform:'scale('+s+')',offset:[0,.4,.75,1][i]})),{duration:600,easing:'ease-in-out'}));}
      Promise.all(active.map(a=>a.finished)).then(schedule,()=>{});
    }
    button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')play();},{signal:signal.signal});
    button.addEventListener('pointerdown',play,{signal:signal.signal});
    const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const changed=()=>{stop();schedule();};
    motion?.addEventListener('change',changed,{signal:signal.signal});
    document.addEventListener('visibilitychange',changed,{signal:signal.signal});
    play();
    return {pause(){suspended=true;stop();},resume(){suspended=false;schedule();}};
  });
  return {pause(){runners.forEach(r=>r.pause());},resume(){runners.forEach(r=>r.resume());},destroy(){signal.abort();runners.forEach(r=>r.pause());}};
}
