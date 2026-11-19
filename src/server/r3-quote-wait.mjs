// R4 wait-flow port. The issued request owns completion. A single visible playback
// cursor drives both seek() on the original BLOUB montages and the banner stack.
export function createQuoteWait({paint, avatar, env = globalThis, now = () => env.performance.now(),
  frame = fn => env.requestAnimationFrame(fn), cancelFrame = id => env.cancelAnimationFrame(id)}) {
  const media = env.matchMedia?.('(prefers-reduced-motion: reduce)');
  const doc = env.document;
  const quiet=()=>Boolean(media?.matches || doc?.documentElement?.hasAttribute('data-review-reduced'));
  let active = null, sequence = 0;
  const copy = {entry:'최저가 견적을 찾고 있어요.', comparing:'상세한 조건을 비교하고 있어요.',
    delayed:'곧 결과가 나와요.\n화면을 유지해주세요.', finishing:'마무리 중입니다.',
    complete:'', offline:'인터넷 연결이 끊겼어요.', error:'예상치 못한 오류가 발생했어요.'};
  function publish(run, phase) {
    run.phase=phase;
    paint(phase,run.banners.slice(),{requestId:run.id,visualMs:run.elapsed,emitted:run.emitted,avatarTime:run.player?.getState?.().time??null,copy:copy[phase]||'',status:run.status});
  }
  function cancelDrawing(run) {
    if(run.raf!==null)cancelFrame(run.raf);
    run.raf=null;run.epoch++;run.player?.destroy();run.player=null;
  }
  function stop(phase='idle') {
    const run=active;
    if(run){active=null;cancelDrawing(run);run.controller.abort();run.banners=[];run.status=phase;publish(run,phase);}
    else paint(phase,[],{requestId:null,visualMs:0,emitted:0,copy:copy[phase]||'',status:phase});
  }
  function schedule(run) {
    if(active===run && run.ready && !run.paused && !doc?.hidden && !quiet() && run.raf===null)run.raf=frame(()=>tick(run));
  }
  function addBanner(run) {
    if(!run.items.length)return;
    const i=run.emitted++;
    run.banners=[...run.banners.slice(-2),{...run.items[i%run.items.length],index:i}];
    publish(run,run.phase);
  }
  async function changePhase(run,phase) {
    cancelDrawing(run);run.ready=false;run.phaseStart=run.elapsed;
    const epoch=run.epoch;publish(run,phase);
    let player;
    try {player=await avatar?.(phase,run.id);}catch { /* The original vector remains visible when a player cannot mount. */ }
    if(active!==run || run.epoch!==epoch){player?.destroy();return;}
    run.player=player;run.duration=player?.getState?.().duration || (phase==='entry'?6:4);
    run.ready=true;run.last=now();
    if(quiet()){player?.seek(phase==='entry'?3.5:0);if(!run.emitted)addBanner(run);}
    else schedule(run);
  }
  function tick(run) {
    run.raf=null;
    if(active!==run || run.paused || doc?.hidden)return;
    const time=now();run.elapsed+=Math.max(0,time-run.last);run.last=time;
    const phaseTime=(run.elapsed-run.phaseStart)/1000;
    run.player?.seek(run.phase==='entry'?Math.min(run.duration,phaseTime):phaseTime%run.duration);
    if(run.elapsed>=run.nextBanner){addBanner(run);run.nextBanner=Math.max(run.nextBanner+500,run.elapsed+498);}
    if(run.elapsed>=9000 && ['entry','comparing'].includes(run.phase)){void changePhase(run,'delayed');return;}
    if(run.phase==='entry' && phaseTime>=run.duration){void changePhase(run,'comparing');return;}
    schedule(run);
  }
  async function request(task,items=[],initial='entry') {
    stop();
    const run={id:++sequence,controller:new AbortController(),items,phase:initial,status:'pending',banners:[],emitted:0,epoch:0,
      elapsed:initial==='entry'?0:3500,nextBanner:3500,raf:null,player:null,ready:false,paused:false};
    active=run;void changePhase(run,initial);
    try {
      if(env.navigator?.onLine===false)throw Object.assign(new Error('OFFLINE'),{code:'OFFLINE'});
      const result=await task(run.controller.signal,run.id);
      if(active!==run)return null;
      active=null;cancelDrawing(run);run.status='success';run.banners=[];publish(run,'complete');return result;
    } catch(error) {
      if(active!==run)return null;
      active=null;cancelDrawing(run);run.banners=[];run.status='error';
      publish(run,env.navigator?.onLine===false||error?.code==='OFFLINE'?'offline':'error');throw error;
    }
  }
  function pause(){if(active){active.paused=true;if(active.raf!==null)cancelFrame(active.raf);active.raf=null;}}
  function resume(){if(active){active.paused=false;active.last=now();schedule(active);}}
  function visibility(){if(doc?.hidden)pause();else resume();}
  function reduced(){if(!active)return;pause();if(quiet()){active.player?.seek(active.phase==='entry'?3.5:0);if(!active.emitted)addBanner(active);}else resume();}
  function offline(){if(active)stop('offline');}
  const preference=env.MutationObserver && doc?.documentElement?new env.MutationObserver(reduced):null;
  preference?.observe(doc.documentElement,{attributes:true,attributeFilter:['data-review-reduced']});
  env.addEventListener?.('offline',offline);doc?.addEventListener('visibilitychange',visibility);media?.addEventListener?.('change',reduced);
  return {request,stop,pause,resume,get id(){return active?.id;},
    progress(id,phase){if(active?.id===id && ['comparing','delayed','finishing'].includes(phase))void changePhase(active,phase);},
    destroy(){stop();preference?.disconnect();env.removeEventListener?.('offline',offline);doc?.removeEventListener('visibilitychange',visibility);media?.removeEventListener?.('change',reduced);}};
}

// Both the signed desk and isolated review frame use the same DOM and player adapter.
export function mountWaitScene(host,montages,createWait,draw=()=>{}) {
  const doc=host.ownerDocument,env=doc.defaultView,stack=host.querySelector('[data-banner-stack]'),
    art=host.querySelector('[data-wait-avatar],.mf-wait-avatar'),message=host.querySelector('[data-wait-copy],.mf-wait-message');
  const fallback=art.querySelector('svg'),copy=doc.createElement('span'),pulse=doc.createElement('span');
  copy.className='wait-swap';pulse.className='wait-thinking';copy.append(pulse);message.replaceChildren(copy);
  let previous='',previousId=null,mountRevision=0,visibleSlot=null;
  return createWait({env,async avatar(phase){
    const revision=++mountRevision;
    if(!montages[phase])return;
    const slot=doc.createElement('div');slot.setAttribute('aria-hidden','true');slot.hidden=true;art.append(slot);
    let player;
    try{player=await env.BloubR4.mountBloub(slot,montages[phase],{autoplay:false,ariaLabel:'계란 애니메이션'});}
    catch(error){slot.remove();throw error;}
    if(revision===mountRevision){visibleSlot=slot;if(fallback)fallback.style.display='none';slot.hidden=false;}
    return {getState:player.getState,seek:player.seek,destroy(){player.destroy();slot.remove();if(visibleSlot===slot){visibleSlot=null;if(fallback)fallback.style.display='';}}};
  },paint(phase,banners,data){
    const changed=phase!==previous||data.requestId!==previousId;previous=phase;previousId=data.requestId;
    host.dataset.phase=phase;host.dataset.waitRequest=String(data.requestId??'');host.dataset.emitted=String(data.emitted);host.dataset.visualMs=String(Math.round(data.visualMs));host.dataset.avatarTime=String(data.avatarTime??'');
    art.classList.toggle('is-error',['error','offline'].includes(phase));art.dataset.asset=['error','offline'].includes(phase)?'r4-static-fallback':'r4-montage';
    if(changed){pulse.textContent=data.copy;message.classList.toggle('thinking',data.status==='pending'&&['entry','comparing','delayed'].includes(phase));
      if(data.copy && !doc.documentElement.hasAttribute('data-review-reduced') && !env.matchMedia('(prefers-reduced-motion: reduce)').matches)copy.animate?.([{opacity:0,transform:'translateY(.3em)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});}
    const keys=new Set(banners.map(b=>String(b.index)));
    for(const el of Array.from(stack.children))if(!keys.has(el.dataset.bannerIndex))el.remove();
    for(const [depth,banner] of [...banners].reverse().entries()){
      let el=stack.querySelector('[data-banner-index="'+banner.index+'"]');
      if(!el){el=doc.createElement('div');el.className='mf-banner';el.dataset.bannerIndex=String(banner.index);const label=doc.createElement('span');
        const values=banner.values.map(String);label.textContent=values.slice(0,4).join(', ')+(values.length>4?'…':'');el.append(label);stack.prepend(el);}
      el.style.setProperty('--layer',String(depth));}
    draw(phase,data);
  }});
}

export const waitSceneCss=`
#quotePending[data-wait-scene]{display:grid;justify-items:center;gap:.65rem;width:min(100%,26rem);margin:1rem auto}
#quotePending [data-banner-stack]{width:100%}
[data-wait-scene] [data-banner-stack]{display:grid;position:relative;isolation:isolate;overflow:hidden;align-items:start;justify-items:center;min-height:5rem;pointer-events:none}
[data-wait-scene] [data-banner-stack] .mf-banner{grid-area:1/1;position:relative;inset:auto;width:min(100%,19rem);height:2.6rem;padding:.5rem .9rem;border:0;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#eef2f7;color:#374359;box-shadow:none;z-index:calc(3 - var(--layer));transform:translateY(calc(var(--layer) * 13px)) scale(calc(1 - var(--layer) * .05));opacity:1;animation:order-banner-in .28s ease-out;transition:transform .25s ease-out}
[data-wait-scene] .mf-banner span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-wait-scene] .wait-swap,[data-wait-scene] .wait-thinking{display:block}
[data-wait-scene] :is(.mf-wait-message,[data-wait-copy]){display:grid;align-content:center;min-height:3em;white-space:pre-line;text-align:center;font-size:15px;line-height:1.5;animation:none}
[data-wait-scene] .mf-wait-message.thinking{animation:none}
[data-wait-scene] .thinking .wait-thinking{animation:order-wait-thinking 1.5s ease-in-out infinite alternate}
[data-wait-scene] :is([data-wait-avatar],.mf-wait-avatar){position:relative;z-index:2}
/* Original static R4 fallback (no error montage supplied), SHA-256 49487be6c15abd97c25b3fb45874d7a2be2c3cda7a3e4fb3063b981ebb8459e8. */
[data-wait-scene] .is-error::after{content:'';position:absolute;inset:0;background:center/contain no-repeat url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiB2aWV3Qm94PSItMTU4IC0xNTggMzE2IDMxNiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSLrgqntkogg7KGw6rG07J2EIOu5hOq1kO2VmOuKlCDqs4TrnoAg7JWE67CU7YOAIiBzdHlsZT0id2lkdGg6IDEwMCU7IGhlaWdodDogYXV0bzsgZGlzcGxheTogYmxvY2s7IG92ZXJmbG93OiB2aXNpYmxlOyI+PGRlZnM+PCEtLS0tPjxtYXNrIGlkPSJib3QtbWFzay1nZ2hsN3UiIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiIHg9Ii0xNTgiIHk9Ii0xNTgiIHdpZHRoPSIzMTYiIGhlaWdodD0iMzE2Ij48cGF0aCBkPSJNODMuODggMC4zM0M4NC4wNCAzLjA3IDg0LjA4IDUuODIgODQuMDIgOC41OUM4My45NiAxMS4zNSA4My44IDE0LjEzIDgzLjUyIDE2LjkxQzgzLjI0IDE5LjY4IDgyLjg3IDIyLjQ4IDgyLjM0IDI1LjI1QzgxLjgxIDI4LjAyIDgxLjEyIDMwLjc4IDgwLjMyIDMzLjUyQzc5LjUzIDM2LjI2IDc4LjYzIDM5LjAxIDc3LjU4IDQxLjY5Qzc2LjUyIDQ0LjM4IDc1LjMzIDQ3LjA1IDc0LjAxIDQ5LjY1QzcyLjY4IDUyLjI2IDcxLjIyIDU0LjgzIDY5LjYzIDU3LjMyQzY4LjA0IDU5LjgxIDY2LjMyIDYyLjI2IDY0LjQ2IDY0LjZDNjIuNTkgNjYuOTMgNjAuNTcgNjkuMTcgNTguNDYgNzEuMzNDNTYuMzUgNzMuNDkgNTQuMTQgNzUuNjEgNTEuNzkgNzcuNTZDNDkuNDQgNzkuNSA0Ni45NSA4MS4zMyA0NC4zOCA4M0M0MS44IDg0LjY3IDM5LjEgODYuMjEgMzYuMzMgODcuNTlDMzMuNTcgODguOTcgMzAuNyA5MC4yMiAyNy43OCA5MS4yOEMyNC44NSA5Mi4zMyAyMS44NCA5My4yMyAxOC44IDkzLjkzQzE1Ljc3IDk0LjYyIDEyLjY2IDk1LjEzIDkuNTYgOTUuNDZDNi40NSA5NS43OCAzLjMgOTUuOTUgMC4xOSA5NS44OEMtMi45MyA5NS44MSAtNi4wNiA5NS41MSAtOS4xNCA5NS4wNkMtMTIuMjIgOTQuNjEgLTE1LjI5IDkzLjk4IC0xOC4yOCA5My4xN0MtMjEuMjcgOTIuMzYgLTI0LjIxIDkxLjMzIC0yNy4wNyA5MC4xOEMtMjkuOTIgODkuMDMgLTMyLjczIDg3LjczIC0zNS40MSA4Ni4yN0MtMzguMDkgODQuODEgLTQwLjY3IDgzLjE0IC00My4xNSA4MS40Qy00NS42MyA3OS42NyAtNDguMDMgNzcuODMgLTUwLjI5IDc1Ljg3Qy01Mi41NSA3My45MSAtNTQuNjkgNzEuODIgLTU2LjcxIDY5LjY2Qy01OC43MyA2Ny41IC02MC42NCA2NS4yNCAtNjIuNDEgNjIuOTJDLTY0LjE4IDYwLjYgLTY1LjgxIDU4LjE4IC02Ny4zMyA1NS43NEMtNjguODUgNTMuMjkgLTcwLjI3IDUwLjc5IC03MS41MyA0OC4yNUMtNzIuNzkgNDUuNyAtNzMuODkgNDMuMDggLTc0Ljg5IDQwLjQ2Qy03NS44OSAzNy44NCAtNzYuNzYgMzUuMTggLTc3LjUyIDMyLjUyQy03OC4yOCAyOS44NiAtNzguOTUgMjcuMTggLTc5LjQ4IDI0LjVDLTgwIDIxLjgxIC04MC4zNyAxOS4xIC04MC42NiAxNi40MUMtODAuOTUgMTMuNzIgLTgxLjEyIDExLjAzIC04MS4yMSA4LjM1Qy04MS4zIDUuNjcgLTgxLjI5IDIuOTkgLTgxLjE4IDAuMzNDLTgxLjA3IC0yLjMzIC04MC44NiAtNC45OSAtODAuNTQgLTcuNjJDLTgwLjIyIC0xMC4yNiAtNzkuNzcgLTEyLjg3IC03OS4yOCAtMTUuNDhDLTc4Ljc4IC0xOC4wOCAtNzguMjQgLTIwLjY4IC03Ny41OSAtMjMuMjdDLTc2Ljk0IC0yNS44NSAtNzYuMTkgLTI4LjQxIC03NS4zNyAtMzAuOTdDLTc0LjU1IC0zMy41MyAtNzMuNjYgLTM2LjA4IC03Mi42OCAtMzguNjJDLTcxLjY5IC00MS4xNiAtNzAuNjEgLTQzLjY4IC02OS40NCAtNDYuMTlDLTY4LjI3IC00OC43MSAtNjcuMDEgLTUxLjIxIC02NS42NiAtNTMuNzFDLTY0LjMxIC01Ni4yMSAtNjIuODkgLTU4LjcyIC02MS4zNSAtNjEuMkMtNTkuOCAtNjMuNjkgLTU4LjE4IC02Ni4xOSAtNTYuNDEgLTY4LjY0Qy01NC42NSAtNzEuMDkgLTUyLjc2IC03My41MiAtNTAuNzUgLTc1LjkxQy00OC43NCAtNzguMyAtNDYuNjIgLTgwLjY4IC00NC4zNCAtODIuOThDLTQyLjA2IC04NS4yNyAtMzkuNjYgLTg3LjU2IC0zNy4wOSAtODkuNjdDLTM0LjUyIC05MS43NyAtMzEuNzggLTkzLjggLTI4LjkxIC05NS41OUMtMjYuMDMgLTk3LjM3IC0yMi45OSAtOTkuMDUgLTE5Ljg0IC0xMDAuMzdDLTE2LjcgLTEwMS42OSAtMTMuMzggLTEwMi44MSAtMTAuMDQgLTEwMy41Qy02LjcgLTEwNC4xOCAtMy4yMSAtMTA0LjU1IDAuMTkgLTEwNC40OEMzLjU5IC0xMDQuNDEgNy4wNSAtMTAzLjg3IDEwLjM3IC0xMDMuMUMxMy43IC0xMDIuMzMgMTYuOTkgLTEwMS4yMSAyMC4xMiAtOTkuODdDMjMuMjQgLTk4LjUzIDI2LjI3IC05Ni44NSAyOS4xMyAtOTUuMDhDMzEuOTkgLTkzLjMxIDM0LjcyIC05MS4zMiAzNy4zIC04OS4yNkMzOS44NyAtODcuMiA0Mi4yOCAtODQuOTYgNDQuNTggLTgyLjczQzQ2Ljg5IC04MC41MSA0OS4wNiAtNzguMjIgNTEuMTMgLTc1LjkxQzUzLjE5IC03My41OSA1NS4xMyAtNzEuMjMgNTYuOTYgLTY4Ljg1QzU4Ljc5IC02Ni40NyA2MC41MSAtNjQuMDUgNjIuMTMgLTYxLjYxQzYzLjc1IC01OS4xOCA2NS4yNiAtNTYuNzIgNjYuNyAtNTQuMjVDNjguMTQgLTUxLjc5IDY5LjUzIC00OS4zNCA3MC43OCAtNDYuODRDNzIuMDMgLTQ0LjM0IDczLjE0IC00MS43OCA3NC4yMiAtMzkuMjRDNzUuMjkgLTM2LjcgNzYuMjkgLTM0LjE1IDc3LjIxIC0zMS41OEM3OC4xMyAtMjkgNzkuMDEgLTI2LjQyIDc5Ljc1IC0yMy44MUM4MC40OSAtMjEuMTkgODEuMDkgLTE4LjU0IDgxLjY0IC0xNS44N0M4Mi4xOSAtMTMuMjEgODIuNjcgLTEwLjUzIDgzLjA1IC03LjgzQzgzLjQyIC01LjEzIDgzLjcxIC0yLjQxIDgzLjg4IDAuMzNaIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTAgLTIxLjYzQzYuMTYgLTIxLjYzIDExLjE2IC0xMS45NSAxMS4xNiAwQzExLjE2IDExLjk1IDYuMTYgMjEuNjMgMCAyMS42M0MtNi4xNiAyMS42MyAtMTEuMTYgMTEuOTUgLTExLjE2IDBDLTExLjE2IC0xMS45NSAtNi4xNiAtMjEuNjMgMCAtMjEuNjNaIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjg2LC0wLjMyLDAuNDUsMC44NCwyMS44NCwtNDEuMzcpIiBvcGFjaXR5PSIxIiBmaWxsPSIjMDAwIi8+PHBhdGggZD0iTTAgLTIxLjYzQzYuMTYgLTIxLjYzIDExLjE2IC0xMS45NSAxMS4xNiAwQzExLjE2IDExLjk1IDYuMTYgMjEuNjMgMCAyMS42M0MtNi4xNiAyMS42MyAtMTEuMTYgMTEuOTUgLTExLjE2IDBDLTExLjE2IC0xMS45NSAtNi4xNiAtMjEuNjMgMCAtMjEuNjNaIiB0cmFuc2Zvcm09Im1hdHJpeCgwLjYyLC0wLjA1LDAuNDUsMC44NCw1NS4zNywtNDYuNjYpIiBvcGFjaXR5PSIxIiBmaWxsPSIjMDAwIi8+PCEtLS0tPjwvbWFzaz48L2RlZnM+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48L2c+PCEtLS0tPjxnIG9wYWNpdHk9IjEiPjxwYXRoIGQ9Ik04My44OCAwLjMzQzg0LjA0IDMuMDcgODQuMDggNS44MiA4NC4wMiA4LjU5QzgzLjk2IDExLjM1IDgzLjggMTQuMTMgODMuNTIgMTYuOTFDODMuMjQgMTkuNjggODIuODcgMjIuNDggODIuMzQgMjUuMjVDODEuODEgMjguMDIgODEuMTIgMzAuNzggODAuMzIgMzMuNTJDNzkuNTMgMzYuMjYgNzguNjMgMzkuMDEgNzcuNTggNDEuNjlDNzYuNTIgNDQuMzggNzUuMzMgNDcuMDUgNzQuMDEgNDkuNjVDNzIuNjggNTIuMjYgNzEuMjIgNTQuODMgNjkuNjMgNTcuMzJDNjguMDQgNTkuODEgNjYuMzIgNjIuMjYgNjQuNDYgNjQuNkM2Mi41OSA2Ni45MyA2MC41NyA2OS4xNyA1OC40NiA3MS4zM0M1Ni4zNSA3My40OSA1NC4xNCA3NS42MSA1MS43OSA3Ny41NkM0OS40NCA3OS41IDQ2Ljk1IDgxLjMzIDQ0LjM4IDgzQzQxLjggODQuNjcgMzkuMSA4Ni4yMSAzNi4zMyA4Ny41OUMzMy41NyA4OC45NyAzMC43IDkwLjIyIDI3Ljc4IDkxLjI4QzI0Ljg1IDkyLjMzIDIxLjg0IDkzLjIzIDE4LjggOTMuOTNDMTUuNzcgOTQuNjIgMTIuNjYgOTUuMTMgOS41NiA5NS40NkM2LjQ1IDk1Ljc4IDMuMyA5NS45NSAwLjE5IDk1Ljg4Qy0yLjkzIDk1LjgxIC02LjA2IDk1LjUxIC05LjE0IDk1LjA2Qy0xMi4yMiA5NC42MSAtMTUuMjkgOTMuOTggLTE4LjI4IDkzLjE3Qy0yMS4yNyA5Mi4zNiAtMjQuMjEgOTEuMzMgLTI3LjA3IDkwLjE4Qy0yOS45MiA4OS4wMyAtMzIuNzMgODcuNzMgLTM1LjQxIDg2LjI3Qy0zOC4wOSA4NC44MSAtNDAuNjcgODMuMTQgLTQzLjE1IDgxLjRDLTQ1LjYzIDc5LjY3IC00OC4wMyA3Ny44MyAtNTAuMjkgNzUuODdDLTUyLjU1IDczLjkxIC01NC42OSA3MS44MiAtNTYuNzEgNjkuNjZDLTU4LjczIDY3LjUgLTYwLjY0IDY1LjI0IC02Mi40MSA2Mi45MkMtNjQuMTggNjAuNiAtNjUuODEgNTguMTggLTY3LjMzIDU1Ljc0Qy02OC44NSA1My4yOSAtNzAuMjcgNTAuNzkgLTcxLjUzIDQ4LjI1Qy03Mi43OSA0NS43IC03My44OSA0My4wOCAtNzQuODkgNDAuNDZDLTc1Ljg5IDM3Ljg0IC03Ni43NiAzNS4xOCAtNzcuNTIgMzIuNTJDLTc4LjI4IDI5Ljg2IC03OC45NSAyNy4xOCAtNzkuNDggMjQuNUMtODAgMjEuODEgLTgwLjM3IDE5LjEgLTgwLjY2IDE2LjQxQy04MC45NSAxMy43MiAtODEuMTIgMTEuMDMgLTgxLjIxIDguMzVDLTgxLjMgNS42NyAtODEuMjkgMi45OSAtODEuMTggMC4zM0MtODEuMDcgLTIuMzMgLTgwLjg2IC00Ljk5IC04MC41NCAtNy42MkMtODAuMjIgLTEwLjI2IC03OS43NyAtMTIuODcgLTc5LjI4IC0xNS40OEMtNzguNzggLTE4LjA4IC03OC4yNCAtMjAuNjggLTc3LjU5IC0yMy4yN0MtNzYuOTQgLTI1Ljg1IC03Ni4xOSAtMjguNDEgLTc1LjM3IC0zMC45N0MtNzQuNTUgLTMzLjUzIC03My42NiAtMzYuMDggLTcyLjY4IC0zOC42MkMtNzEuNjkgLTQxLjE2IC03MC42MSAtNDMuNjggLTY5LjQ0IC00Ni4xOUMtNjguMjcgLTQ4LjcxIC02Ny4wMSAtNTEuMjEgLTY1LjY2IC01My43MUMtNjQuMzEgLTU2LjIxIC02Mi44OSAtNTguNzIgLTYxLjM1IC02MS4yQy01OS44IC02My42OSAtNTguMTggLTY2LjE5IC01Ni40MSAtNjguNjRDLTU0LjY1IC03MS4wOSAtNTIuNzYgLTczLjUyIC01MC43NSAtNzUuOTFDLTQ4Ljc0IC03OC4zIC00Ni42MiAtODAuNjggLTQ0LjM0IC04Mi45OEMtNDIuMDYgLTg1LjI3IC0zOS42NiAtODcuNTYgLTM3LjA5IC04OS42N0MtMzQuNTIgLTkxLjc3IC0zMS43OCAtOTMuOCAtMjguOTEgLTk1LjU5Qy0yNi4wMyAtOTcuMzcgLTIyLjk5IC05OS4wNSAtMTkuODQgLTEwMC4zN0MtMTYuNyAtMTAxLjY5IC0xMy4zOCAtMTAyLjgxIC0xMC4wNCAtMTAzLjVDLTYuNyAtMTA0LjE4IC0zLjIxIC0xMDQuNTUgMC4xOSAtMTA0LjQ4QzMuNTkgLTEwNC40MSA3LjA1IC0xMDMuODcgMTAuMzcgLTEwMy4xQzEzLjcgLTEwMi4zMyAxNi45OSAtMTAxLjIxIDIwLjEyIC05OS44N0MyMy4yNCAtOTguNTMgMjYuMjcgLTk2Ljg1IDI5LjEzIC05NS4wOEMzMS45OSAtOTMuMzEgMzQuNzIgLTkxLjMyIDM3LjMgLTg5LjI2QzM5Ljg3IC04Ny4yIDQyLjI4IC04NC45NiA0NC41OCAtODIuNzNDNDYuODkgLTgwLjUxIDQ5LjA2IC03OC4yMiA1MS4xMyAtNzUuOTFDNTMuMTkgLTczLjU5IDU1LjEzIC03MS4yMyA1Ni45NiAtNjguODVDNTguNzkgLTY2LjQ3IDYwLjUxIC02NC4wNSA2Mi4xMyAtNjEuNjFDNjMuNzUgLTU5LjE4IDY1LjI2IC01Ni43MiA2Ni43IC01NC4yNUM2OC4xNCAtNTEuNzkgNjkuNTMgLTQ5LjM0IDcwLjc4IC00Ni44NEM3Mi4wMyAtNDQuMzQgNzMuMTQgLTQxLjc4IDc0LjIyIC0zOS4yNEM3NS4yOSAtMzYuNyA3Ni4yOSAtMzQuMTUgNzcuMjEgLTMxLjU4Qzc4LjEzIC0yOSA3OS4wMSAtMjYuNDIgNzkuNzUgLTIzLjgxQzgwLjQ5IC0yMS4xOSA4MS4wOSAtMTguNTQgODEuNjQgLTE1Ljg3QzgyLjE5IC0xMy4yMSA4Mi42NyAtMTAuNTMgODMuMDUgLTcuODNDODMuNDIgLTUuMTMgODMuNzEgLTIuNDEgODMuODggMC4zM1oiIGZpbGw9IiNmOWY5ZjkiLz48ZyBtYXNrPSJ1cmwoI2JvdC1tYXNrLWdnaGw3dSkiPjxyZWN0IHg9Ii0xNTgiIHk9Ii0xNTgiIHdpZHRoPSIzMTYiIGhlaWdodD0iMzE2IiBmaWxsPSIjZmZiYzcwIi8+PCEtLS0tPjwvZz48L2c+PGc+PC9nPjwhLS0tLT48ZyBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiPjwvZz48L3N2Zz4=')}
[data-wait-scene] .is-error>*{visibility:hidden}
@keyframes order-wait-thinking{from{opacity:.5}to{opacity:1}}
@keyframes order-banner-in{from{translate:0 18px;opacity:0}to{translate:0 0;opacity:1}}
[data-review-reduced] [data-wait-scene] :is(.mf-banner,.wait-thinking){animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){[data-wait-scene] :is(.mf-banner,.wait-thinking){animation:none!important;transition:none!important}}
`;

export const waitMontages={"delayed":{"format":"bloub-montage","version":1,"engineRevision":"order-egg-r4","name":"지연","settings":{"shape":"egg","color":"#ffbc70","expression":"attentif","direction":"original","rainbow":null,"eyes":{"shape":"round","width":1.2,"height":1.05,"spacing":1},"material":{"preset":"flat","strength":0.85,"roughness":0.55,"lightAngle":-135}},"background":"transparent","size":256,"fps":60,"loop":true,"blocks":[{"state":"thinking","duration":2.8,"direction":"reverse"},{"state":"alert","duration":2.4,"direction":"reverse"}]},"complete":{"format":"bloub-montage","version":1,"engineRevision":"order-egg-r4","name":"견적 완료","settings":{"shape":"egg","color":"#ffbc70","expression":"attentif","direction":"original","rainbow":null,"eyes":{"shape":"round","width":1.2,"height":1.05,"spacing":1},"material":{"preset":"flat","strength":0.85,"roughness":0.55,"lightAngle":-135}},"background":"transparent","size":256,"fps":60,"loop":false,"blocks":[{"state":"comet_fade","duration":2.4,"direction":"original"}]},"finishing":{"format":"bloub-montage","version":1,"engineRevision":"order-egg-r4","name":"마무리","settings":{"shape":"egg","color":"#ffbc70","expression":"attentif","direction":"original","rainbow":null,"eyes":{"shape":"round","width":1.2,"height":1.05,"spacing":1},"material":{"preset":"flat","strength":0.85,"roughness":0.55,"lightAngle":-135}},"background":"transparent","size":256,"fps":60,"loop":false,"blocks":[{"state":"thinking","duration":0.7,"direction":"reverse"}]}};
