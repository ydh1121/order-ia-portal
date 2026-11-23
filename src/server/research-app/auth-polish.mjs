import {researchAuthMotionCss} from './auth-motion.mjs';

/** Research-owned presentation and response fixtures for the preserved auth
 * renderer. No fixture value is an authentication result or a sent email. */
export const researchAuthPolishCss=researchAuthMotionCss+String.raw`
.ds .product-auth-sheet .auth-sheet .float-hint,.ds .product-auth-sheet .auth-sheet input::placeholder{font-size:16px;line-height:1.5}
.ds .product-auth-sheet .auth-sheet .consent-block .check-row{display:flex;align-items:center;gap:8px;line-height:1.5}
.ds .product-auth-sheet .auth-sheet .consent-block .check-row input{flex:0 0 auto;accent-color:var(--blue)}
.ds .product-auth-sheet .auth-sheet .consent-error .check-row:first-child{outline:none;border:0;box-shadow:none;padding-right:0;color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .consent-error .check-row:first-child::after{content:none}
.ds .product-auth-sheet .auth-sheet .consent-error .check-row:first-child input{accent-color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .consent-error .check-row:first-child [data-action=open-terms]{color:inherit}
.ds .product-auth-sheet .auth-sheet .consent-choice{padding:14px 16px;border-radius:16px;background:#f2f5fa;color:var(--ink,#1f2937)}
.ds .product-auth-sheet .auth-sheet .consent-choice[hidden]{display:none}
.ds .product-auth-sheet .auth-sheet .consent-choice p{font-size:14px;line-height:1.6}
.ds .product-auth-sheet .auth-sheet .otp-wrap.is-error{outline:none;border:0;box-shadow:none}
.ds .product-auth-sheet .auth-sheet .otp-wrap.is-error .otp-digit{border:0;box-shadow:none;background:#fff0f2;color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .otp-wrap .otp-digit:disabled{background:#f2f4f6;color:#8b95a1;opacity:.7}
.ds .product-auth-sheet .auth-sheet .otp-meta{font-size:15px;line-height:1.6;text-align:center;gap:10px}
.ds .product-auth-sheet .auth-sheet .otp-meta>span{white-space:normal}
.ds .product-auth-sheet .auth-sheet .otp-meta .btn{font-size:14px}
.ds .product-auth-sheet .auth-sheet [data-auth-expiry]{font-size:14px;line-height:1.6;color:var(--muted,#6b7684);margin-top:12px}
.ds .product-auth-sheet .auth-sheet .terms-page>.check-row{display:flex;align-items:center;gap:8px;line-height:1.5}
.ds .product-auth-sheet .auth-sheet .terms-page>.check-row input{flex:0 0 auto;accent-color:var(--blue)}
.ds .product-auth-sheet .auth-sheet .terms-page>.check-row.terms-invalid{outline:none;border:0;box-shadow:none;color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .terms-page>.check-row.terms-invalid input{accent-color:var(--danger,#d33443)}
.ds .product-auth-sheet .auth-sheet .btn[aria-busy=true]:not(.auth-resend-motion){position:relative;color:transparent}
.ds .product-auth-sheet .auth-sheet .btn[aria-busy=true]:not(.auth-resend-motion)::after{content:'';position:absolute;left:50%;top:50%;width:18px;height:18px;border:2px solid var(--blue,#315de6);border-right-color:transparent;border-radius:50%;animation:research-auth-pending 700ms linear infinite}
.ds .product-auth-sheet .auth-sheet .btn.primary[aria-busy=true]:not(.auth-resend-motion)::after{border-color:white;border-right-color:transparent}
.ds .product-auth-sheet .auth-sheet [data-auth-pending-field]>:not(.auth-pending-placeholder){opacity:0!important}
.ds .product-auth-sheet .auth-sheet [data-auth-pending-field]{position:relative}
.ds .product-auth-sheet .auth-sheet .auth-pending-placeholder{position:absolute;inset:0;display:flex;align-items:center;padding-inline:16px;font-size:16px;line-height:1.5;white-space:pre;overflow:hidden;color:var(--muted,#6b7684);pointer-events:none}
@keyframes research-auth-pending{from{transform:translate(-50%,-50%) rotate(0)}to{transform:translate(-50%,-50%) rotate(360deg)}}
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark{animation:research-auth-success var(--duration-very-slow,500ms) var(--ease-smooth-out,cubic-bezier(.22,1,.36,1)) both}
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark svg{animation:none;stroke-dasharray:none}
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark path{stroke-dasharray:var(--auth-check-length,24);stroke-dashoffset:0;animation:research-auth-check 400ms 100ms var(--ease-smooth-out,cubic-bezier(.22,1,.36,1)) both}
@keyframes research-auth-success{from{opacity:0;transform:translateY(30px) rotate(-12deg) scale(.9);filter:blur(8px)}to{opacity:1;transform:translateY(0) rotate(0) scale(1);filter:blur(0)}}
@keyframes research-auth-check{from{stroke-dashoffset:var(--auth-check-length,24)}to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark,.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark path{animation:none}.ds .product-auth-sheet .auth-sheet .btn[aria-busy=true]::after{animation:none;transform:translate(-50%,-50%)}}
`;

export function installResearchAuthPolish(win=window){
  if(win.ORDER_RESEARCH_AUTH_POLISH)return win.ORDER_RESEARCH_AUTH_POLISH;
  const motions=new WeakMap(),pendingViews=new WeakMap();
  function state(api,screen,value){
    if(api.authState)return api.authState;
    // Only the explicit review state gets a deterministic response fixture.
    // Ordinary entry and an unavailable provider never invent a deadline.
    if(!api.reviewScenario)return undefined;
    const now=Date.now();
    if(screen==='login'&&value==='limited')return {fixture:true,retryAt:now+120000,failedAttempts:5};
    if(screen==='login'&&value==='error')return {fixture:true,reason:'password_incorrect'};
    if(screen==='otp'&&!['expired','verified'].includes(value)||screen==='signup'&&value==='success')return {fixture:true,otpExpiresAt:now+15*60000};
    return undefined;
  }
  function mount(root,api){
    const controller=new win.AbortController(),signal=controller.signal;
    const motion=win.ORDER_RESEARCH_AUTH_MOTION.mount(root,api);
    for(const button of root.querySelectorAll('[data-action=resend],[data-action=verify-otp]'))motions.set(button,motion);
    let timer,pending=null;
    function endPending(){
      if(!pending)return;
      for(const saved of pending.controls){saved.input.readOnly=saved.readOnly;saved.input.disabled=saved.disabled;}
      for(const {shell,placeholder} of pending.fields){delete shell.dataset.authPendingField;placeholder.remove();}
      for(const saved of pending.eyes)saved.button.disabled=saved.disabled;
      pending=null;delete root.dataset.authPending;
    }
    function beginPending(){
      if(!root.querySelector('.btn[aria-busy=true]'))return;
      if(pending)return;
      pending={controls:[],fields:[],eyes:[]};root.dataset.authPending='';
      for(const input of root.querySelectorAll('input,textarea,select')){
        pending.controls.push({input,readOnly:input.readOnly,disabled:input.disabled});
        if(input.matches('input:not([type=checkbox]):not([type=radio]),textarea'))input.readOnly=true;
        else input.disabled=true;
        const shell=input.closest('.input-shell');
        if(!shell||shell.hasAttribute('data-auth-pending-field'))continue;
        const placeholder=win.document.createElement('span');placeholder.className='auth-pending-placeholder';placeholder.setAttribute('aria-hidden','true');
        placeholder.textContent=input.name.includes('password')?'•'.repeat(Array.from(input.value).length)||input.placeholder:input.value||input.placeholder;
        shell.dataset.authPendingField='';shell.append(placeholder);pending.fields.push({shell,placeholder});
      }
      for(const button of root.querySelectorAll('[data-action=password-visibility]')){pending.eyes.push({button,disabled:button.disabled});button.disabled=true;}
    }
    pendingViews.set(root,beginPending);
    const busyObserver=new win.MutationObserver(()=>{if(!root.querySelector('.btn[aria-busy=true]'))endPending();});
    busyObserver.observe(root,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
    const auth=api.authState;
    if(api.screen==='login'&&Number.isInteger(auth?.failedAttempts)){
      const notice=root.querySelector('.auth-layout .notice.error');
      if(notice)notice.textContent=auth.failedAttempts+'회 연속 로그인에 실패했어요. 아래 시간이 지나면 다시 시도하거나 비밀번호를 재설정해 주세요.';
    }
    if(api.screen==='signup'&&root.dataset.authState==='success'&&auth?.otpExpiresAt){
      const expires=typeof auth.otpExpiresAt==='number'?auth.otpExpiresAt:Date.parse(auth.otpExpiresAt);
      if(Number.isFinite(expires)){
        const copy=root.querySelector('.empty>p');
        if(copy){copy.dataset.authExpiry='';const tick=()=>{
          if(signal.aborted||!copy.isConnected)return;
          const remaining=Math.max(0,Math.ceil((expires-Date.now())/1000));
          copy.textContent=remaining?'인증번호는 '+String(Math.floor(remaining/60)).padStart(2,'0')+'분 '+String(remaining%60).padStart(2,'0')+'초 후 만료돼요. 스팸메일함과 휴면 메일함도 확인해 주세요.':'인증번호가 만료됐어요. 인증번호를 다시 받아 주세요.';
          if(remaining)timer=win.setTimeout(tick,1000);
        };tick();}
      }
    }
    // The original Check path owns its actual stroke length. Scaling the icon
    // must not leave a long, hard-coded invisible prefix before it is drawn.
    for(const path of root.querySelectorAll('.auth-complete .success-mark path')){
      let length=24;try{const measured=path.getTotalLength();if(Number.isFinite(measured)&&measured>0)length=Math.ceil(measured)+1;}catch{}
      path.style.setProperty('--auth-check-length',String(length));
    }
    signal.addEventListener('abort',()=>{win.clearTimeout(timer);busyObserver.disconnect();endPending();motion.dispose();if(pendingViews.get(root)===beginPending)pendingViews.delete(root);},{once:true});
    return ()=>controller.abort();
  }
  function finish(button,callback,signal){const motion=motions.get(button);return motion?motion.finish(button,callback,signal):callback?.();}
  function performAction(api,root,...args){
    // The regular application validates editable controls synchronously before
    // awaiting its requests. Start the visual lock after that validation has
    // started, so a read-only presentation never skips its validation gate.
    const response=api.performAction(...args);pendingViews.get(root)?.();return response;
  }
  return win.ORDER_RESEARCH_AUTH_POLISH={state,mount,finish,performAction};
}
