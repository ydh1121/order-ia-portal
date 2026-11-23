import {researchAuthMotionCss} from './auth-motion.mjs';

/** Research-owned presentation and response fixtures for the preserved auth
 * renderer. No fixture value is an authentication result or a sent email. */
export const researchAuthPolishCss=researchAuthMotionCss+String.raw`
.ds .product-auth-sheet .auth-sheet .float-hint,.ds .product-auth-sheet .auth-sheet input::placeholder{font-size:16px;line-height:1.5}
/* The regular email editor retains the input inside its own suggestion owner.
   Keep the auth field's existing value/label geometry after that late mount. */
.ds .product-auth-sheet .auth-sheet .field.is-floating .input-shell:has(>.ui-email-field){overflow:visible}
.ds .product-auth-sheet .auth-sheet .field.is-floating .input-shell>.ui-email-field{position:relative;flex:1 1 0%;width:100%;min-width:0;height:100%;border-radius:inherit}
.ds .product-auth-sheet .auth-sheet .field.is-floating .input-shell>.ui-email-field>input{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:0;height:100%;padding:25px 38px 8px 14px;border:0;border-radius:inherit;outline:0;background:transparent;font-size:15px;font-weight:500;line-height:24px;color:var(--ink);box-shadow:none}
@container(max-width:350px){.ds .product-auth-sheet .auth-sheet .field.is-floating .input-shell>.ui-email-field>input{font-size:14px}}
.ds .product-auth-sheet .auth-sheet .ui-feedback-sr:not([hidden]){position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;pointer-events:none!important}
.ds .product-auth-sheet .auth-sheet .ui-email-suggestions{position:absolute;z-index:20;inset-inline:0;top:calc(100% + 4px);max-height:192px;overflow-y:auto;overscroll-behavior:contain;padding:4px;border:1px solid #d1d6db;border-radius:10px;background:#fff;box-shadow:0 8px 20px #152b4620}
.ds .product-auth-sheet .auth-sheet .ui-email-suggestions[hidden]{display:none!important}
.ds .product-auth-sheet .auth-sheet .ui-email-suggestions>button{display:block;width:100%;min-height:40px;padding:10px 8px;text-align:left;border:0;border-radius:6px;background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:400;overflow-wrap:anywhere}
.ds .product-auth-sheet .auth-sheet .ui-email-suggestions>button:is(:hover,[aria-selected=true]){background:#e7efff;color:var(--blue)}
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
.ds .product-auth-sheet .auth-sheet .recovery-methods{border:0;margin:0 0 12px;padding:0;min-width:0}
.ds .product-auth-sheet .auth-sheet .recovery-methods legend{margin-bottom:4px;font-size:14px;font-weight:600}
.ds .product-auth-sheet .auth-sheet .recovery-methods label{display:flex;align-items:center;gap:9px;min-height:40px;cursor:pointer}
.ds .product-auth-sheet .auth-sheet .recovery-methods input{width:18px;height:18px;accent-color:var(--blue)}
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
/* Transitions.dev Success check, source blob f91370d. The wrapper and path
   have different easings; translate must not replace the rotation transform. */
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark{
  --check-ease:cubic-bezier(.22,1,.36,1);transform-origin:center;
  animation:research-check-fade 550ms var(--check-ease) both,research-check-turn 550ms var(--check-ease) both,research-check-blur 500ms var(--check-ease) both,research-check-rise 450ms cubic-bezier(.34,1.35,.64,1) both
}
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark svg{display:block;overflow:visible;animation:none;stroke-dasharray:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark path{stroke-dasharray:var(--auth-check-length,20);stroke-dashoffset:0;animation:research-check-draw 550ms var(--check-ease) 80ms both}
@keyframes research-check-fade{from{opacity:0}to{opacity:1}}
@keyframes research-check-turn{from{transform:rotate(80deg)}to{transform:rotate(0deg)}}
@keyframes research-check-blur{from{filter:blur(10px)}to{filter:blur(0)}}
@keyframes research-check-rise{from{translate:0 40px}to{translate:0 0}}
@keyframes research-check-draw{from{stroke-dashoffset:var(--auth-check-length,20)}to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark,.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark path{animation:none}.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark{opacity:1}.ds .product-auth-sheet .auth-sheet .auth-complete .success-mark path{stroke-dashoffset:0}.ds .product-auth-sheet .auth-sheet .btn[aria-busy=true]::after{animation:none;transform:translate(-50%,-50%)}}
`;

export function installResearchAuthPolish(win=window){
  if(win.ORDER_RESEARCH_AUTH_POLISH)return win.ORDER_RESEARCH_AUTH_POLISH;
  const motions=new WeakMap(),pendingViews=new WeakMap();
  const recoveryForms=new WeakMap(),challenges=new WeakMap(),successSteps=new WeakMap(),loginFailures=new WeakMap();
  const methods=[
    {value:'send-login-code',label:'이메일 로그인 코드',button:'로그인 코드 받기'},
    {value:'send-temporary-password',label:'임시 비밀번호',button:'임시 비밀번호 받기'},
    {value:'send-reset',label:'새 비밀번호 설정',button:'재설정 안내 받기'}
  ];
  function mountRecovery(root,api,signal){
    // A challenge belongs to one open sheet. Signup OTP and a later visit must
    // never inherit the login-code challenge from an earlier request.
    if(api.screen!=='otp')challenges.delete(root);
    if(api.screen==='login'&&['error','limited'].includes(root.dataset.authState)){
      const link=root.querySelector('[data-action=reset-password]');
      if(link)link.textContent='다른 방법으로 로그인';
    }
    if(api.screen==='otp'&&challenges.has(root)&&root.querySelector('[data-action=verify-otp]')){
      root.querySelector('.sheet-title h1').textContent='이메일 로그인 코드 입력';
      root.querySelector('[data-action=verify-otp]').textContent='코드로 로그인';
    }
    const submit=root.querySelector('[data-action=send-reset]');
    if(api.screen==='password'&&submit){
      const title=root.querySelector('.sheet-title h1');
      title.textContent='로그인 복구';
      root.querySelector('[role=dialog]').setAttribute('aria-label',title.textContent);
      const group=win.document.createElement('fieldset'),legend=win.document.createElement('legend');
      group.className='recovery-methods';legend.textContent='복구 방법';group.append(legend);
      for(const method of methods){
        const label=win.document.createElement('label'),input=win.document.createElement('input');
        input.type='radio';input.name='recovery-method';input.value=method.value;
        input.checked=method.value==='send-reset';
        label.append(input,method.label);group.append(label);
      }
      const sync=()=>{const checked=group.querySelector(':checked');submit.textContent=methods.find(method=>method.value===checked.value).button;};
      group.addEventListener('change',sync,{signal});sync();submit.before(group);
    }
    recoveryForms.set(root,api);
    signal.addEventListener('abort',()=>recoveryForms.delete(root),{once:true});
  }
  function observeLoginFailures(root,api,signal){
    const submit=root.querySelector('[data-action=submit-login]');
    if(api.screen!=='login'||!submit)return;
    let retryAt=0,timer;
    function update(){
      win.clearTimeout(timer);
      if(!retryAt)return;
      const left=Math.max(0,Math.ceil((retryAt-Date.now())/1000));
      if(!left){retryAt=0;submit.textContent='로그인';submit.disabled=submit.hasAttribute('aria-busy');return;}
      submit.disabled=true;
      submit.textContent=String(Math.floor(left/60)).padStart(2,'0')+'분 '+String(left%60).padStart(2,'0')+'초 후 로그인 가능해요';
      timer=win.setTimeout(update,Math.max(1,retryAt-Date.now()-(left-1)*1000));
    }
    // The canonical submit releases its busy flag once the request settles.
    // A server deadline remains in force after that release.
    const observer=new win.MutationObserver(update);
    observer.observe(submit,{attributes:true,attributeFilter:['aria-busy']});
    loginFailures.set(root,result=>{
      const field=result?.reason==='password_incorrect'?'password':result?.reason==='email_unknown'?'email':null;
      if(field){
        const input=root.querySelector('[name='+field+']');
        win.QAUI.setFieldError(input,field==='password'?'비밀번호가 틀렸어요.':'등록된 이메일 정보가 없어요.');
        win.QAUI.shake(input.closest('.field'));
      }
      const attempts=result?.failedAttempts,remaining=result?.remainingAttempts;
      if(Number.isSafeInteger(attempts)&&attempts>0){
        api.toast(attempts+'회 연속 로그인에 실패했어요.'+(Number.isSafeInteger(remaining)&&remaining>0?' '+remaining+'회 더 실패하면 로그인이 제한돼요.':''));
      }else if(result?.error==='AUTH_PROVIDER_UNAVAILABLE')api.toast('로그인 서비스가 아직 연결되지 않았어요.');
      const deadline=typeof result?.retryAt==='number'?result.retryAt:Date.parse(result?.retryAt);
      if(Number.isFinite(deadline)&&deadline>Date.now()){
        retryAt=deadline;update();
        if(!Number.isSafeInteger(attempts)||attempts<1)api.toast('로그인이 일시적으로 제한됐어요.');
      }
    });
    signal.addEventListener('abort',()=>{observer.disconnect();win.clearTimeout(timer);loginFailures.delete(root);},{once:true});
  }
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
    mountRecovery(root,api,signal);observeLoginFailures(root,api,signal);
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
      if(notice)notice.textContent=auth.failedAttempts+'회 연속 로그인에 실패했어요. 아래 시간이 지나면 다시 시도하거나 다른 로그인 방법을 선택해 주세요.';
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
      // AnimateIcons Lucide Check, source blob 320bb00. Keep Order's colors.
      path.setAttribute('d','M5 13l4 4L19 7');
      let length=20;try{const measured=path.getTotalLength();if(Number.isFinite(measured)&&measured>0)length=Math.ceil(measured)+1;}catch{}
      path.style.setProperty('--auth-check-length',String(length));
    }
    signal.addEventListener('abort',()=>{win.clearTimeout(timer);busyObserver.disconnect();endPending();motion.dispose();if(pendingViews.get(root)===beginPending)pendingViews.delete(root);},{once:true});
    return ()=>controller.abort();
  }
  function finish(button,callback,signal){
    const next=successSteps.get(button)||callback,motion=motions.get(button);
    successSteps.delete(button);return motion?motion.finish(button,next,signal):next?.();
  }
  function performAction(api,root,action,detail){
    const view=recoveryForms.get(root),challenge=challenges.get(root);
    const fromChooser=action==='send-reset'&&view?.screen==='password';
    const fromCode=challenge&&view?.screen==='otp'&&['resend','verify-otp'].includes(action);
    const operation=fromChooser?root.querySelector('[name=recovery-method]:checked').value:
      fromCode?(action==='resend'?'resend-login-code':'verify-login-code'):action;
    // Let the regular service validate editable fields before the visual lock.
    const response=api.performAction(operation,fromCode?{...detail,challengeId:challenge}:detail);
    pendingViews.get(root)?.();
    if(action==='submit-login'&&loginFailures.has(root)){
      const report=loginFailures.get(root);
      return Promise.resolve(response).then(result=>{
        if(result?.confirmed!==true&&!detail.signal.aborted&&loginFailures.get(root)===report)report(result);
        return result;
      });
    }
    if(!fromChooser&&!fromCode)return response;
    const failed=()=>view.toast('요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    return Promise.resolve(response).then(result=>{
      if(detail.signal.aborted||recoveryForms.get(root)!==view)return {confirmed:false};
      if(result?.confirmed!==true){
        if(result?.error==='AUTH_PROVIDER_UNAVAILABLE')view.toast('이메일 복구 서비스가 아직 연결되지 않았어요.');
        else if(result?.error!=='INVALID_CONTACT')failed();
        return result;
      }
      if(operation==='send-login-code'||operation==='resend-login-code'){
        const id=result.challengeId||(operation==='resend-login-code'?challenge:null);
        if(typeof id!=='string'||!id.trim()){failed();return {confirmed:false};}
        challenges.set(root,id);
        successSteps.set(detail.button,()=>view.select('otp','empty'));
      }else if(operation==='verify-login-code'){
        successSteps.set(detail.button,()=>view.select('login','success'));
      }else if(operation==='send-temporary-password'){
        successSteps.set(detail.button,()=>{
          view.select('login','empty');view.toast('가입 정보와 일치하면 임시 비밀번호를 이메일로 보내드려요.');
        });
      }
      return result;
    },error=>{
      if(!detail.signal.aborted&&recoveryForms.get(root)===view)failed();
      throw error;
    });
  }
  return win.ORDER_RESEARCH_AUTH_POLISH={state,mount,finish,performAction};
}
