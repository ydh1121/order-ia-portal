/** Adapted from designbookmark.com/motion OTP Code and Loading > Success.
 * Retains their spring constants, four integration steps, digit offset,
 * merge/green sequencing and spinner/check path. The gallery autoplay and
 * automatic success are removed: only the auth provider may confirm success.
 * Native six-digit inputs retain their focus, paste, IME and accessible names. */
export const researchAuthMotionCss=String.raw`
.ds .product-auth-sheet .auth-sheet .otp-wrap[data-auth-otp-motion]{position:relative;isolation:isolate;transition:none}
.ds .product-auth-sheet .auth-sheet .otp-wrap[data-auth-otp-motion] .otp-digit{color:transparent!important;caret-color:transparent;animation:none}
.ds .product-auth-sheet .auth-sheet .auth-otp-glyph{position:absolute;font-size:27px;line-height:1;font-style:normal;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink,#191f28);pointer-events:none;will-change:transform,opacity}
.ds .product-auth-sheet .auth-sheet .otp-wrap.is-error .auth-otp-glyph{color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .otp-wrap:has(.otp-digit:disabled) .auth-otp-glyph{color:#8b95a1}
.ds .product-auth-sheet .auth-sheet .auth-otp-success{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;font-size:18px;font-weight:700;color:white;opacity:0;pointer-events:none}
.ds .product-auth-sheet .auth-sheet .auth-otp-success svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.ds .product-auth-sheet .auth-sheet .auth-resend-motion{position:relative;display:block;width:168px;height:56px;min-height:56px;padding:0;border:0;border-radius:28px;background:var(--ink,#191f28);color:white;cursor:pointer;overflow:hidden;font-size:14px;font-weight:700;transition:none}
.ds .product-auth-sheet .auth-sheet .auth-resend-motion .auth-motion-text,.ds .product-auth-sheet .auth-sheet .auth-resend-motion .auth-motion-done{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;will-change:transform,opacity}
.ds .product-auth-sheet .auth-sheet .auth-resend-motion .auth-motion-done{color:white}
.ds .product-auth-sheet .auth-sheet .auth-motion-done svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.ds .product-auth-sheet .auth-sheet .auth-motion-spinner{position:absolute;left:50%;top:50%;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:conic-gradient(from 0deg,rgba(0,0,0,0) 0 10%,white 85%,rgba(0,0,0,0) 85%);-webkit-mask:radial-gradient(circle closest-side,transparent 68%,#000 72%);mask:radial-gradient(circle closest-side,transparent 68%,#000 72%);opacity:0;will-change:transform,opacity}
.ds .product-auth-sheet .auth-sheet .auth-resend-motion:disabled{cursor:default;opacity:1}
.ds .product-auth-sheet .auth-sheet .auth-resend-motion:focus-visible{outline:2px solid var(--blue,#315de6);outline-offset:3px}
`;

export function installResearchAuthMotion(win=window){
  if(win.ORDER_RESEARCH_AUTH_MOTION)return win.ORDER_RESEARCH_AUTH_MOTION;
  // Exact integrator and component springs from the supplied original sources.
  const S=(x,k=400,c=30)=>({x,v:0,t:x,k,c});
  const step=(s,dt)=>{const a=-s.k*(s.x-s.t)-s.c*s.v;s.v+=a*dt;s.x+=s.v*dt;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const check='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function mount(root,api){
    const controller=new win.AbortController(),signal=controller.signal,springs=[],timers=new Set();
    let raf=0,last=0,rotation=0,phase='idle',confirmed=false,settleCompletion=null;
    const reduced=()=>Boolean(api.reduced?.()||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const spring=(...args)=>{const value=S(...args);springs.push(value);return value;};
    const later=(delay,fn)=>{const timer=win.setTimeout(()=>{timers.delete(timer);if(!signal.aborted)fn();},delay);timers.add(timer);return timer;};
    const wrap=root.querySelector('.otp-wrap'),fields=[...root.querySelectorAll('.otp-digit')];
    const savedWrapStyle=wrap?.getAttribute('style');
    const boxes=fields.map(input=>{
      const glyph=win.document.createElement('i');glyph.className='auth-otp-glyph';glyph.setAttribute('aria-hidden','true');wrap.append(glyph);
      return {input,glyph,style:input.getAttribute('style'),text:'',y:spring(0,520,16),o:spring(0,400,28),a:spring(0,300,26)};
    });
    const M=spring(0,260,24),G=spring(0,220,28);
    let ok=null,originalWidth=0;
    if(wrap){wrap.dataset.authOtpMotion='';ok=win.document.createElement('span');ok.className='auth-otp-success';ok.setAttribute('aria-hidden','true');ok.innerHTML=check+'<span>인증됐어요</span>';wrap.append(ok);}
    const resend=root.querySelector('[data-action=resend]');
    const savedResend=resend?{html:resend.innerHTML,style:resend.getAttribute('style'),label:resend.getAttribute('aria-label')}:null;
    const W=spring(168,300,22),T=spring(1,400,30),P=spring(0,300,28),D=spring(0,220,20),RG=spring(0,200,30),K=spring(0,120,20);
    let txt,spin,done,tick;
    if(resend){
      resend.classList.add('auth-resend-motion');resend.innerHTML='<span class="auth-motion-text">인증번호 다시 받기</span><span class="auth-motion-spinner" aria-hidden="true"></span><span class="auth-motion-done" aria-hidden="true">'+check+'<span>보냈어요</span></span>';
      txt=resend.querySelector('.auth-motion-text');spin=resend.querySelector('.auth-motion-spinner');done=resend.querySelector('.auth-motion-done');tick=done.querySelector('path');tick.style.strokeDasharray='22';
    }
    function render(){
      if(wrap){
        const m=clamp(M.x,0,1.1),g=clamp(G.x,0,1),gap=8*(1-clamp(m,0,1));
        if(confirmed){wrap.style.gap=gap+'px';if(originalWidth)wrap.style.width=(originalWidth-8*(fields.length-1)*clamp(m,0,1))+'px';wrap.style.marginInline='auto';}
        const rect=wrap.getBoundingClientRect();
        boxes.forEach((box,i)=>{
          const r=14*(1-clamp(m,0,1)),a=clamp(box.a.x,0,1),inputRect=box.input.getBoundingClientRect();
          if(confirmed)box.input.style.borderRadius=i===0?'14px '+r+'px '+r+'px 14px':i===boxes.length-1?r+'px 14px 14px '+r+'px':r+'px';
          if(g>.01)box.input.style.background='color-mix(in srgb, #16845b '+(g*100).toFixed(1)+'%, #f2f4f6)';
          else if(!box.input.disabled&&!wrap.classList.contains('is-error'))box.input.style.background=a>.01?'color-mix(in srgb, #e7efff '+(a*100).toFixed(1)+'%, #f2f4f6)':'';
          else box.input.style.removeProperty('background');
          box.glyph.style.left=(inputRect.left-rect.left+inputRect.width/2)+'px';box.glyph.style.top=(inputRect.top-rect.top+inputRect.height/2)+'px';
          box.glyph.style.opacity=(clamp(box.o.x,0,1)*(1-g)).toFixed(3);
          box.glyph.style.transform='translate(-50%,-50%) translateY('+box.y.x.toFixed(2)+'px)';
        });
        ok.style.opacity=clamp(G.x*1.6-.5,0,1).toFixed(3);ok.style.transform='translateY('+((1-g)*8).toFixed(2)+'px)';
      }
      if(resend){
        const g=clamp(RG.x,0,1);resend.style.width=W.x.toFixed(2)+'px';resend.style.background=g>.01?'color-mix(in srgb, #16845b '+(g*100).toFixed(1)+'%, #191f28)':'';
        txt.style.opacity=clamp(T.x,0,1).toFixed(3);txt.style.transform='translateY('+((1-T.x)*14).toFixed(2)+'px)';
        spin.style.opacity=clamp(P.x,0,1).toFixed(3);spin.style.transform='rotate('+(rotation%360)+'deg) scale('+(.6+.4*clamp(P.x,0,1.2)).toFixed(3)+')';
        done.style.opacity=clamp(D.x,0,1).toFixed(3);done.style.transform='translateY('+((1-D.x)*12).toFixed(2)+'px)';tick.style.strokeDashoffset=(22*(1-clamp(K.x,0,1))).toFixed(2);
      }
    }
    function frame(now){
      raf=0;if(signal.aborted)return;
      const dt=Math.min(Math.max(0,(now-last)/1000),1/30);last=now;
      for(let i=0;i<4;i++)for(const value of springs)step(value,dt/4);
      if(phase==='loading')rotation+=dt*360*1.4;render();
      if(phase==='loading'||springs.some(value=>Math.abs(value.x-value.t)>.001||Math.abs(value.v)>.001))raf=win.requestAnimationFrame(frame);
    }
    function update(){
      if(signal.aborted)return;
      if(reduced()){for(const value of springs){value.x=value.t;value.v=0;}render();return;}
      render();if(!raf){last=win.performance.now();raf=win.requestAnimationFrame(frame);}
    }
    function syncDigits(){
      if(confirmed)return;
      boxes.forEach(box=>{
        const text=box.input.value;
        if(text&&text!==box.text){box.glyph.textContent=text;box.y.x=-14;box.y.v=0;box.o.x=0;box.o.t=1;}
        if(!text){box.glyph.textContent='';box.o.t=0;}
        box.text=text;box.a.t=!box.input.disabled&&box.input===win.document.activeElement?1:0;
      });update();
    }
    function setPhase(next){
      if(!resend||phase===next)return;phase=next;resend.dataset.authMotionPhase=next;
      if(next==='loading'){T.t=0;W.t=56;P.t=1;D.t=RG.t=K.t=0;resend.setAttribute('aria-label','인증번호 다시 받는 중');}
      if(next==='done'){P.t=0;W.t=140;RG.t=D.t=1;later(reduced()?0:150,()=>{K.t=1;update();});resend.setAttribute('aria-label','인증번호를 보냈어요');}
      if(next==='idle'){D.t=RG.t=K.t=P.t=0;W.t=168;T.t=1;resend.setAttribute('aria-label','인증번호 다시 받기');}
      update();
    }
    const observer=new win.MutationObserver(()=>{
      if(resend&&phase!=='done')setPhase(resend.getAttribute('aria-busy')==='true'?'loading':'idle');
      syncDigits();
    });
    observer.observe(root,{subtree:true,attributes:true,attributeFilter:['aria-busy','disabled','aria-invalid']});
    for(const name of ['input','paste','compositionend','focusin','focusout'])root.addEventListener(name,syncDigits,{signal});
    const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(()=>update()):null;if(wrap)resize?.observe(wrap);
    syncDigits();if(root.dataset.authState==='sending')setPhase('loading');
    function finish(button,callback,externalSignal){
      const action=button?.dataset.action;
      if(action!=='resend'&&action!=='verify-otp'){callback?.();return;}
      if(signal.aborted||externalSignal?.aborted)return;
      return new Promise(resolve=>{
        settleCompletion=resolve;
        const complete=()=>{settleCompletion=null;if(!signal.aborted&&!externalSignal?.aborted)callback?.();resolve();};
        if(action==='resend')setPhase('done');
        else{confirmed=true;wrap.dataset.authOtpConfirmed='';originalWidth=wrap.getBoundingClientRect().width;M.t=1;if(reduced())G.t=1;else later(300,()=>{G.t=1;update();});update();}
        later(reduced()?160:850,complete);
      });
    }
    function dispose(){
      if(signal.aborted)return;controller.abort();observer.disconnect();resize?.disconnect();win.cancelAnimationFrame(raf);for(const timer of timers)win.clearTimeout(timer);timers.clear();settleCompletion?.();settleCompletion=null;
      for(const box of boxes){box.glyph.remove();if(box.style===null)box.input.removeAttribute('style');else box.input.setAttribute('style',box.style);}
      if(wrap){delete wrap.dataset.authOtpMotion;delete wrap.dataset.authOtpConfirmed;ok.remove();if(savedWrapStyle===null)wrap.removeAttribute('style');else wrap.setAttribute('style',savedWrapStyle);}
      if(resend){resend.classList.remove('auth-resend-motion');delete resend.dataset.authMotionPhase;resend.innerHTML=savedResend.html;if(savedResend.style===null)resend.removeAttribute('style');else resend.setAttribute('style',savedResend.style);if(savedResend.label===null)resend.removeAttribute('aria-label');else resend.setAttribute('aria-label',savedResend.label);}
    }
    return {finish,dispose};
  }
  return win.ORDER_RESEARCH_AUTH_MOTION={mount};
}
