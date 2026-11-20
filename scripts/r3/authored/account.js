(function (w) {
  'use strict';
  const U=w.QAUI,{esc,icon,button,field,head,states,note}=U;
  const registry=w.ORDER_DESIGN_MODULES;
  const EXAMPLE_PASSWORD='';
  const meterText=['비밀번호를 입력해 주세요','추측하기 쉬워요','조금 더 길게 만들어 주세요','사용할 수 있는 조합이에요','강력한 비밀번호예요'];
  const meetsPasswordRule = value => value.length >= 10 && /[a-z]/i.test(value) && /[0-9]/.test(value) && /[^a-z0-9\s]/i.test(value);
  const strength = value => !value ? 0 : meetsPasswordRule(value) ? (value.length >= 15 ? 4 : 3) : value.length < 6 ? 1 : 2;
  const passwordRule = '영문·숫자·특수문자를 포함해 10자 이상 입력해 주세요.';
  const spinner = '<span class="spinner" aria-hidden="true"></span><span class="sr-only">처리 중</span>';
  const interactive=api=>typeof api.interactive==='function'?api.interactive():api.interactive!==false;
  const social=()=>'<div class="social-buttons integrated-providers" role="group" aria-label="간편 로그인">'+['kakao','naver','google'].map(provider=>{
    const ref=w.ORDER_QA_PROVIDER_BUTTONS?.[provider];
    return ref?'<button type="button" class="integrated-provider" data-action="social-'+provider+'" aria-label="'+esc(ref.label)+'"><img width="48" height="48" alt="" src="data:image/png;base64,'+ref.png+'"></button>':button(({kakao:'카카오',naver:'네이버',google:'구글'})[provider],'social-'+provider,'social '+provider);
  }).join('')+'</div>';
  const success=(title,body,action='login')=>`<div class="empty"><div class="success-mark">${icon('check')}</div><h2>${title}</h2><p>${body}</p>${button('계속하기',action)}</div>`;
  const meter=(level=0)=>`<div class="password-meter" data-level="${level}" aria-label="비밀번호 강도 예시"><div class="liquid-segments">${[1,2,3,4].map(i=>`<i class="${i<=level?'filled':''}"><b></b><em aria-hidden="true"></em></i>`).join('')}</div><p class="meter-label" aria-live="polite">${meterText[level]}</p></div>`;

  // Only synchronous user navigation may carry these values. Render/export never reads them.
  let pendingFocus=null,pendingTermsSession=null,pendingSignupRestore=null;
  function navigate(api,id,state,focus) {
    if(!api.select)return;
    const previous=pendingFocus;pendingFocus=focus||null;
    try {api.select(id,state);} finally {pendingFocus=previous;}
  }
  function applyPendingFocus(root,api) {
    if(pendingFocus&&interactive(api))root.querySelector(pendingFocus)?.focus({preventScroll:true});
  }
  function complete(api,btn,callback,root,signal) {
    if(!btn||btn.disabled)return;
    if(api.mode==='product'){
      if(typeof api.performAction!=='function'){api.onUnavailable?.(btn.dataset.action);api.toast?.('아직 연결되지 않은 기능이에요.');return;}
      btn.disabled=true;btn.setAttribute('aria-busy','true');
      Promise.resolve().then(()=>api.performAction(btn.dataset.action,{root,button:btn,signal})).then(result=>{
        if(!signal?.aborted&&result?.confirmed===true)callback?.();
        else if(!signal?.aborted)api.onUnavailable?.(btn.dataset.action);
      }).catch(error=>{if(!signal?.aborted)api.onError?.(error);}).finally(()=>{if(!signal?.aborted){btn.disabled=false;btn.removeAttribute('aria-busy');}});
      return;
    }
    if(api.demoSuccess)api.demoSuccess(btn,callback);else callback?.();
  }
  // The review frame keeps typed credentials in its own controls only.
  function lockSubmittedFields(root) {
    for (const input of root.querySelectorAll('input[name=email], input[name*=password]')) {
      const secret = input.name.includes('password');
      if (secret) input.type='password';
      const placeholder = secret ? '•'.repeat(Array.from(input.value).length) : input.value;
      if (placeholder) {
        input.value='';
        input.placeholder=placeholder;
        const hint=input.closest('.field')?.querySelector('.float-hint');
        if(hint)hint.textContent=placeholder;
        U.syncField(input);
      }
      input.disabled=true;
    }
    for(const toggle of root.querySelectorAll('[data-action=password-visibility]')) toggle.hidden=true;
  }
  function frozenFixture(form) {
    // Isolated loading-state examples. No previously typed fields enter an export.
    return form.replace(/placeholder="(?:비밀번호(?: 입력)?|한 번 더 입력해 주세요)"/g,'placeholder="••••••••••"')
      .replace(/class="float-hint">(?:비밀번호(?: 입력)?|한 번 더 입력해 주세요)</g,'class="float-hint">••••••••••<')
      .replace(/<button type="button" class="field-icon"[^>]*>[\s\S]*?<\/button>/g,'')
      .replace(/<input (?=[^>]*name="(?:email|password|password-confirm)")/g,'<input disabled ');
  }
  function runDeadline(value, render, signal) {
    const end=typeof value==='number'?value:Date.parse(value);
    if(!Number.isFinite(end))return;
    let timer;
    function tick() {
      if(signal.aborted)return;
      const seconds=Math.max(0,Math.ceil((end-Date.now())/1000));
      render(seconds,String(Math.floor(seconds/60)).padStart(2,'0')+'분 '+String(seconds%60).padStart(2,'0')+'초');
      if(seconds)timer=setTimeout(tick,Math.min(1000,Math.max(1,end-Date.now()-(seconds-1)*1000)));
    }
    signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});tick();
  }
  function fieldError(input,message) {
    U.setFieldError(input,message);
    if(message)U.shake(input?.closest('.field'));
    return !message;
  }
  function emailValid(input) {
    if(!input)return false;
    input.value=input.value.trim();
    return fieldError(input,!input.value?'이메일 주소를 입력해 주세요.':input.validity.typeMismatch?'이메일 양식을 확인해 주세요.':'');
  }
  function firstInvalid(root) {root.querySelector('input[aria-invalid="true"]')?.focus({preventScroll:true});}
  function mountMeter(root,c,api) {
    const input=root.querySelector('[name=password],[name=new-password]'),el=root.querySelector('.password-meter');
    if(!input||!el)return;
    const label=el.querySelector('.meter-label'),bars=[...el.querySelectorAll('.liquid-segments i')];
    label.id ||= U.uid('password-strength');
    const descriptions=new Set((input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));
    descriptions.add(label.id);input.setAttribute('aria-describedby',[...descriptions].join(' '));
    const flights=new Map();
    const stop=target=>{flights.get(target)?.cancel();flights.delete(target);};
    function move(target,frames,options){
      stop(target);
      if(!target.animate||api.reduced?.())return;
      const flight=target.animate(frames,options);flights.set(target,flight);
      flight.finished.then(()=>{if(flights.get(target)===flight)flights.delete(target);},()=>{});
    }
    function update(animate){
      const level=strength(input.value),old=Number(el.dataset.level);
      if(animate&&level===old)return;
      el.dataset.level=String(level);
      label.textContent=meterText[level];
      const advancing=level>old;
      bars.forEach((bar,index)=>{
        const filled=index<level,changed=(index<old)!==filled,fill=bar.querySelector('b');
        let neck=bar.querySelector('em');
        if(!neck){neck=document.createElement('em');neck.setAttribute('aria-hidden','true');bar.append(neck);}
        const start=animate&&changed?w.getComputedStyle(fill).transform:null;
        bar.classList.toggle('filled',filled);
        if(!animate||!changed)return;
        const delay=(advancing?index-old:old-index-1)*50;
        move(fill,[{transform:start==='none'?'scaleX('+(filled?0:1)+')':start},
          {transform:'scaleX('+(filled?1:0)+')'}],{duration:300,delay,easing:'cubic-bezier(.25,.6,.3,1)',fill:'backwards'});
        if(!index)return;
        // The frame-6 neck spans the gap at 133ms, thins at 167ms and breaks by 200ms.
        const neckFrames=[[0,0,0],[.333,.2,.4],[.443,1.05,1],[.557,1,.32],[.667,0,0],[1,0,0]]
          .map(([offset,x,y])=>({offset,transform:'scale('+x+','+y+')',opacity:x?1:0}));
        move(neck,neckFrames,{duration:300,delay,direction:advancing?'normal':'reverse',fill:'backwards',easing:'linear'});
      });
      if(animate)move(label,[{opacity:.55,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
    }
    update(false);
    input.addEventListener('input',event=>{if(!event.isComposing)update(true);},{signal:c.signal});
    input.addEventListener('compositionend',()=>update(true),{signal:c.signal});
    c.signal.addEventListener('abort',()=>{for(const flight of flights.values())flight.cancel();flights.clear();},{once:true});
  }
  function exitSheet(root,api,callback,signal) {
    const content=root.querySelector('.auth-sheet');
    if(!content || api.reduced?.() || !content.animate){callback();return;}
    if(content.inert)return;
    content.inert=true;
    const anim=content.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(22%)'}],{duration:220,easing:'cubic-bezier(.32,0,.67,.55)',fill:'forwards'});
    signal.addEventListener('abort',()=>anim.cancel(),{once:true});
    anim.finished.then(()=>{if(!signal.aborted)callback();},()=>{});
  }
  function scene(content,title,opts={}) {
    const closed=opts.sheetState==='closed';
    return `<div class="auth-scene ${closed?'is-closed':''}"><div class="auth-background" ${closed?'':'aria-hidden="true" inert'}>${head('우리 사업장에 맞는<br>계란 최저가를 알아보세요','',opts)}<div class="scene-egg">${w.ORDER_QA_ASSETS?.avatar||''}</div></div><div class="sheet-dim" aria-hidden="true" ${closed?'hidden':''}></div><section class="auth-sheet t-modal is-open" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1" ${closed?'hidden':''}><div class="sheet-handle" aria-hidden="true"></div>${content}</section>${title==='로그인'?'<div class="auth-return-action" '+(closed?'':'hidden')+'>'+button('로그인','open-login')+'</div>':''}</div>`;
  }
  function consumeAuthReturn(api,authenticated) {
    const target=w.ORDER_QA_AUTH_RETURN;
    if(!target||target.module!=='onboarding'||!/^guest-[1-4]$/.test(target.guestState)||!/^member-[1-4]$/.test(target.memberState))return false;
    delete w.ORDER_QA_AUTH_RETURN;
    navigate(api,target.module,authenticated?target.memberState:target.guestState);
    return true;
  }
  function commonAuthMount(root,state,api,authenticated=false) {
    const c=new AbortController();
    const context=api.brandAccount||w.ORDER_BRAND_ACCOUNT_CONTEXT||{},brand=root.querySelector('.auth-background .brand');
    const brandMenu=brand&&w.mountBrandAccountMenu?.(brand,{...context,authenticated:context.authenticated===true,animateInitial:context.consumeArrival?.()===true,reducedMotion:api.reduced});
    c.signal.addEventListener('abort',()=>brandMenu?.destroy(),{once:true});
    const handle=root.querySelector('.sheet-handle'),sheet=root.querySelector('.auth-sheet');
    const scene=root.querySelector('.auth-scene'),background=root.querySelector('.auth-background'),dim=root.querySelector('.sheet-dim');
    const ownLogin=api.screen==='login'||Boolean(root.querySelector('.auth-layout'));
    let sheetOpen=state!=='closed',moving=false,flight=null;
    let reopen=root.querySelector('.auth-return-action');
    if(ownLogin&&!reopen){reopen=document.createElement('div');reopen.className='auth-return-action';reopen.innerHTML=button('로그인','open-login');reopen.hidden=sheetOpen;scene?.append(reopen);}
    const notify=next=>{if(api.localState)api.localState(next);else navigate(api,'login',next);};
    function settle(open,announce=true){
      sheetOpen=open;moving=false;sheet.hidden=!open;sheet.inert=!open;sheet.style.transform='';
      scene?.classList.toggle('is-closed',!open);if(dim)dim.hidden=!open;if(reopen)reopen.hidden=open;
      if(background){background.inert=open;if(open)background.setAttribute('aria-hidden','true');else background.removeAttribute('aria-hidden');}
      if(open)brandMenu?.pause();else brandMenu?.resume();
      if(open){gesture?.activate();gesture?.reset();sheet.querySelector('input,button')?.focus({preventScroll:true});}else{gesture?.deactivate();reopen?.querySelector('button')?.focus({preventScroll:true});}
      if(announce)notify(open?'empty':'closed');
    }
    const close=(options={})=>{
      if(moving||!sheetOpen||!sheet){options.done?.();return;}
      if(!ownLogin||authenticated){if(!consumeAuthReturn(api,authenticated))navigate(api,'onboarding',authenticated?'member-4':'guest-4');return;}
      moving=true;sheet.inert=true;flight?.cancel();
      const finish=()=>{if(c.signal.aborted)return;settle(false,options.announce!==false&&!api.authOriginStep);options.done?.();if(api.authOriginStep&&options.announce!==false)navigate(api,'login','closed');};
      if(api.reduced?.()||!sheet.animate){finish();return;}
      const from=sheet.style.transform||'translateY(0)';
      flight=sheet.animate([{transform:from,filter:'blur(0px)'},{transform:'translateY(105%)',filter:'blur(2px)'}],{duration:350,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
      dim?.animate([{opacity:1},{opacity:0}],{duration:280,easing:'ease-out'});
      flight.finished.then(finish,()=>{});
    };
    const gesture=w.ORDER_QA_SHEET?.(sheet,[handle],{signal:c.signal,reduced:api.reduced,close,open:sheetOpen});
    function openSheet(announce=true,done=null){
      if(!ownLogin||sheetOpen||moving)return false;moving=true;flight?.cancel();
      sheet.hidden=false;sheet.inert=false;scene?.classList.remove('is-closed');if(dim)dim.hidden=false;if(reopen)reopen.hidden=true;
      if(background){background.inert=true;background.setAttribute('aria-hidden','true');}gesture?.activate();gesture?.reset();
      brandMenu?.pause();
      const finish=()=>{if(!c.signal.aborted){settle(true,announce);done?.();}};
      if(api.reduced?.()||!sheet.animate){finish();return true;}
      flight=sheet.animate([{transform:'translateY(100px)',opacity:0,filter:'blur(2px)'},{transform:'translateY(0)',opacity:1,filter:'blur(0px)'}],{duration:400,easing:'cubic-bezier(.22,1,.36,1)'});
      flight.finished.then(finish,()=>{});return true;
    }
    root.addEventListener('r3-auth-sheet-state',event=>{
      const next=event.detail?.state;if(!ownLogin||authenticated||!['empty','closed'].includes(next))return;
      event.preventDefault();flight?.cancel();moving=false;
      if(next==='closed')close({announce:false,done:event.detail.done});
      else if(!openSheet(false,event.detail.done)){settle(true,false);event.detail.done?.();}
    },{signal:c.signal});
    c.signal.addEventListener('abort',()=>flight?.cancel(),{once:true});
    root.querySelectorAll('.sheet-close').forEach(el=>el.remove());
    if(dim)dim.addEventListener('click',close,{signal:c.signal});
    if(ownLogin&&state==='closed')settle(false,false);
    else if(sheetOpen)brandMenu?.pause();
    const eyes='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="eye-open"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></g><g class="eye-closed"><path d="M3 10c2.2 3.6 5.2 5.2 9 5.2s6.8-1.6 9-5.2M5 13l-1.5 2M9 15l-.5 2M15 15l.5 2M19 13l1.5 2"/></g></svg>';
    for(const toggle of root.querySelectorAll('[data-action=password-visibility]')){
      toggle.innerHTML=eyes;toggle.classList.add('password-eye');
      const sync=()=>toggle.classList.toggle('is-visible',toggle.closest('.field')?.querySelector('input')?.type==='text');
      toggle.addEventListener('click',()=>queueMicrotask(sync),{signal:c.signal});sync();
    }
    if(authenticated && interactive(api)){
      const timer=setTimeout(()=>exitSheet(root,api,close,c.signal),api.reduced?.()?250:780);
      c.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
    }
    root.addEventListener('click',e=>{
      const a=e.target.closest('[data-action]')?.dataset.action;
      if(a==='close-sheet')close();
      if(a?.startsWith('social-'))api.toast?.(`${{'social-kakao':'카카오','social-naver':'네이버','social-google':'구글'}[a]} 로그인을 선택했어요.`);
      if(a==='login')navigate(api,'login','empty','[name=email]');
      if(a==='signup')navigate(api,'signup','empty','[name=email]');
      if(a==='reset-password')navigate(api,'password','request','[name=email]');
    },{signal:c.signal});
    root.addEventListener('keydown',e=>{
      if(!interactive(api))return;
      const dialog=e.target.closest('[role=dialog]');
      if(!dialog||!root.contains(dialog)||!dialog.contains(root.ownerDocument.activeElement))return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
      if(e.key!=='Tab')return;
      const focusable=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[hidden],[inert]')&&w.getComputedStyle(el).display!=='none'&&w.getComputedStyle(el).visibility!=='hidden');
      if(!focusable.length){e.preventDefault();dialog.focus({preventScroll:true});return;}
      const first=focusable[0],last=focusable[focusable.length-1],active=root.ownerDocument.activeElement;
      if(e.shiftKey&&(active===first||active===dialog)){e.preventDefault();last.focus({preventScroll:true});}
      else if(!e.shiftKey&&(active===last||active===dialog)){e.preventDefault();first.focus({preventScroll:true});}
    },{signal:c.signal});
    applyPendingFocus(root,api);
    const dispose=()=>c.abort();dispose.open=openSheet;return dispose;
  }

  registry.push({id:'login',group:'로그인·가입',label:'로그인 바텀시트',description:'이메일 우선·간편 로그인 우선·통합형 배치와 인증 예외를 비교합니다.',width:'mobile',variants:[{id:'email',label:'이메일 우선'},{id:'social',label:'간편 로그인 우선'},{id:'compact',label:'통합형'}],states:states([['empty','기본'],['filled','입력됨'],['email-error','이메일 오류'],['error','인증 오류'],['loading','처리 중'],['limited','시도 제한'],['success','완료 예시'],['closed','닫힘']]),render(s,o={}) {
    const form=`${field('이메일','email','이메일 주소',{type:'email',autocomplete:'email',required:true,value:s==='filled'?'my@order.ooo':s==='email-error'?'my.order.ooo':'',error:s==='email-error'?'이메일 양식을 확인해 주세요.':''})}${field('비밀번호','password','비밀번호',{type:'password',autocomplete:'current-password',required:true,value:s==='filled'?EXAMPLE_PASSWORD:'',error:s==='error'?'비밀번호를 확인해 주세요.':''})}<div class="auth-options"><label class="check-row"><input type="checkbox">로그인 상태 유지</label>${button('비밀번호 찾기','reset-password','text')}</div>${s==='limited'?note('시도가 많아요. 잠시 후 다시 시도해 주세요.','error'):''}${button(s==='loading'?spinner:s==='limited'?'잠시 후 재시도':'로그인','submit-login','primary wide',s==='loading'||s==='limited'?'disabled':'')}`;
    const v=o.variant==='social'?'social':o.variant==='email'?'email':'compact',sep='<div class="auth-separator"><span>또는</span></div>';
    const body=s==='success'?'<div class="auth-complete" role="status"><span class="success-mark">'+icon('check',32)+'</span><h2>로그인했어요</h2></div>':`<div class="sheet-title"><h1>로그인</h1></div><form novalidate data-submit-action="submit-login">${v==='social'?social()+sep+form:form+sep+social(v==='compact')}</form><div class="auth-footer"><span>아직 계정이 없나요?</span>${button('회원가입','signup','text blue')}</div>`;
    return scene(`<div class="auth-layout ${v}">${s==='loading'?frozenFixture(body):body}</div>`,'로그인',{...o,sheetState:s==='closed'?'closed':'open'});
  },mount(root,s,api={}) {
    const dispose=commonAuthMount(root,s,api,s==='success'),c=new AbortController();
    if(s==='error'&&api.authState?.reason==='email_unknown'){
      U.setFieldError(root.querySelector('[name=password]'),'');
      fieldError(root.querySelector('[name=email]'),'이메일을 확인해 주세요.');
    }
    if(s==='limited')runDeadline(api.authState?.retryAt,(remaining,text)=>{
      const submit=root.querySelector('[data-action="submit-login"]');
      if(submit){submit.disabled=remaining>0;submit.textContent=remaining?text+' 후 로그인 가능해요':'로그인';}
    },c.signal);
    root.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]'),a=btn?.dataset.action;if(btn?.disabled)return;
      if(a==='open-login'&&!dispose.open?.())navigate(api,'login','empty','[name=email]');
      if(a==='submit-login'){
        const email=root.querySelector('[name=email]'),pass=root.querySelector('[name=password]');
        const validEmail=emailValid(email),validPass=fieldError(pass,pass?.value?'':'비밀번호를 입력해 주세요.');
        if(!validEmail||!validPass){firstInvalid(root);return;}
        if(api.mode!=='product')lockSubmittedFields(root);
        complete(api,btn,()=>navigate(api,'login','success','[data-action="close-sheet"]'),root,c.signal);
      }
    },{signal:c.signal});
    return()=>{dispose();c.abort();};
  }});

  function captureSignup(root) {
    return {email:root.querySelector('[name=email]').value,password:root.querySelector('[name=password]').value,confirm:root.querySelector('[name=password-confirm]').value,required:root.querySelector('[name=required-consent]').checked,marketing:root.querySelector('[name=marketing-consent]').checked};
  }
  function restoreSignup(root,draft) {
    [['email','email'],['password','password'],['password-confirm','confirm']].forEach(([name,key])=>{const input=root.querySelector(`[name="${name}"]`);if(input)input.value=draft[key];});
    root.querySelector('[name=required-consent]').checked=!!draft.required;
    root.querySelector('[name=marketing-consent]').checked=!!draft.marketing;
  }
  function openTerms(api,session,state) {
    const previous=pendingTermsSession;pendingTermsSession=session;
    try {navigate(api,'terms',state,'[name=terms-check]');} finally {pendingTermsSession=previous;}
  }
  function returnFromTerms(api,session) {
    const draft=session?.draft||null,previous=pendingSignupRestore;pendingSignupRestore=draft;
    try {navigate(api,'signup','empty','[name=required-consent]');}
    finally {pendingSignupRestore=previous;if(session)session.draft=null;}
  }
  registry.push({id:'signup',group:'로그인·가입',label:'회원가입',description:'가입 입력·약관 동의·처리 상태를 비교합니다. 소셜 인증은 연결 위치만 표시합니다.',width:'mobile',states:states([['empty','기본'],['filled','입력됨'],['email-error','이메일 오류'],['mismatch','비밀번호 불일치'],['terms','동의 누락'],['loading','처리 중'],['success','다음 단계']]),render(s,o={}) {
    const filled=s==='filled';
    const content=s==='success'?success('이메일을 확인해 주세요','받은 메일의 인증번호와 만료 시각을 확인해 주세요. 만료되면 새 인증번호를 받을 수 있어요.','open-otp'):`<div class="sheet-title"><h1>Order 시작하기</h1></div><form novalidate data-submit-action="submit-signup">${field('이메일','email','이메일 주소',{type:'email',autocomplete:'email',value:filled?'my@order.ooo':s==='email-error'?'my.order.ooo':'',required:true,error:s==='email-error'?'이메일 양식을 확인해 주세요.':''})}${field('비밀번호','password','비밀번호 입력',{type:'password',autocomplete:'new-password',required:true,help:passwordRule,value:filled?EXAMPLE_PASSWORD:''})}${meter(filled?strength(EXAMPLE_PASSWORD):0)}${field('비밀번호 확인','password-confirm','한 번 더 입력해 주세요',{type:'password',autocomplete:'new-password',required:true,value:filled?EXAMPLE_PASSWORD:'',error:s==='mismatch'?'입력한 비밀번호가 달라요.':''})}<div class="consent-block ${s==='terms'?'consent-error':''}"><label class="check-row"><input type="checkbox" name="required-consent" ${filled?'checked':''}>[필수] 이용약관·개인정보 처리방침 동의<button type="button" data-action="open-terms" aria-label="약관 보기">${icon('next',17)}</button></label><label class="check-row"><input type="checkbox" name="marketing-consent">[선택] 시세 변동 알림·소식·혜택 받기</label></div><section class="consent-choice" data-opt-choice hidden aria-label="선택 알림"><p>계란 시세가 바뀌면 알려드려요. 시세 변동 알림을 받으실까요?</p>${button('받을게요','allow-notices','text')}${button('받지 않고 계속','skip-notices','secondary')}</section><div class="sr-only" data-consent-feedback ${s==='terms'?'':'hidden'}>${note('필수 약관에 동의해 주세요.','error')}</div>${button(s==='loading'?spinner:'이메일 인증하기','submit-signup','primary wide',s==='loading'?'disabled':'')}</form>`;
    return scene(s==='loading'?frozenFixture(content):content,'회원가입',o);
  },mount(root,s,api={}) {
    const restore=pendingSignupRestore;
    if(restore&&s==='empty'&&interactive(api))restoreSignup(root,restore);
    const dispose=commonAuthMount(root,s,api),c=new AbortController();mountMeter(root,c,api);
    root.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]'),a=btn?.dataset.action;if(btn?.disabled)return;
      if(a==='allow-notices'||a==='skip-notices'){
        root.querySelector('[name=marketing-consent]').checked=a==='allow-notices';
        const choice=root.querySelector('[data-opt-choice]');choice.hidden=true;choice.dataset.answered='1';
        root.querySelector('[data-action="submit-signup"]').click();return;
      }
      if(a==='open-otp')navigate(api,'otp','empty','.otp-digit');
      if(a==='open-terms')openTerms(api,{draft:captureSignup(root),checks:{}},'required');
      if(a==='submit-signup'){
        const email=root.querySelector('[name=email]'),p=root.querySelector('[name=password]'),q=root.querySelector('[name=password-confirm]');
        const validEmail=emailValid(email),validPass=fieldError(p,meetsPasswordRule(p.value)?'':passwordRule),validConfirm=fieldError(q,!q.value?'비밀번호를 한 번 더 입력해 주세요.':p.value!==q.value?'입력한 비밀번호가 달라요.':'');
        const consent=root.querySelector('[name=required-consent]'),agreed=consent.checked;
        root.querySelector('.consent-block').classList.toggle('consent-error',!agreed);root.querySelector('[data-consent-feedback]').hidden=agreed;consent.setAttribute('aria-invalid',String(!agreed));
        if(!validEmail||!validPass||!validConfirm){firstInvalid(root);return;}
        if(!agreed){consent.focus({preventScroll:true});return;}
        const choice=root.querySelector('[data-opt-choice]');
        if(!root.querySelector('[name=marketing-consent]').checked&&choice.dataset.answered!=='1'){
          choice.hidden=false;choice.querySelector('button').focus();return;
        }
        if(api.mode!=='product')lockSubmittedFields(root);
        complete(api,btn,()=>navigate(api,'signup','success','[data-action="open-otp"]'),root,c.signal);
      }
    },{signal:c.signal});
    root.querySelector('[name=required-consent]')?.addEventListener('change',e=>{if(e.target.checked){root.querySelector('.consent-block').classList.remove('consent-error');root.querySelector('[data-consent-feedback]').hidden=true;e.target.setAttribute('aria-invalid','false');}},{signal:c.signal});
    return()=>{dispose();c.abort();};
  }});

  registry.push({id:'otp',group:'로그인·가입',label:'이메일 인증번호',description:'6자리 입력·붙여넣기·오류·만료·재전송을 확인합니다.',width:'mobile',states:states([['empty','입력 전'],['partial','일부 입력'],['error','번호 오류'],['expired','시간 만료'],['sending','재전송 중'],['verified','인증 예시']]),render(s,o={}) {
    if(s==='verified')return scene('<div class="auth-complete" role="status"><span class="success-mark">'+icon('check')+'</span><h2>회원가입이 완료됐어요</h2></div>','회원가입 완료',o);
    const errorId=U.uid('otp-error');
    return scene(`<div data-submit-action="verify-otp"><div class="sheet-title"><h1>인증번호 입력</h1></div><div class="otp-wrap t-input ${s==='error'||s==='expired'?'is-error is-shaking':''}">${Array.from({length:6},(_,i)=>`<input class="otp-digit" ${s==='expired'?'disabled':''} type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="${i===0?'one-time-code':'off'}" maxlength="6" required aria-label="인증번호 ${i+1}번째 자리" aria-invalid="${s==='error'||s==='expired'}" aria-describedby="${errorId}" value="${s==='partial'&&i<3?i+1:''}">`).join('')}</div><div class="row between otp-meta"><span class="${s==='expired'?'danger':'blue'}" data-otp-clock>${s==='expired'?'00분 00초':'받은 메일에서 인증번호 만료 시간을 확인해 주세요.'}</span>${button(s==='sending'?spinner:'인증번호 다시 받기','resend','text',s==='sending'?'disabled':'')}</div><div id="${errorId}" class="sr-only" data-otp-feedback ${s==='error'||s==='expired'?'':'hidden'}>${note(s==='expired'?'인증번호를 다시 받아 주세요.':'인증번호가 맞지 않아요. 다시 확인해 주세요.','error')}</div><div class="surface otp-help"><h3>메일이 도착하지 않았나요?</h3><p class="muted">스팸메일함과 휴면 메일함도 확인해 주세요.</p></div><div class="bottom-actions">${button('인증하기','verify-otp','primary',s==='expired'?'disabled':'')}</div></div>`,'인증번호 입력',o);
  },mount(root,s,api={}) {
    const c=new AbortController(),dispose=commonAuthMount(root,s,api,s==='verified'),fields=[...root.querySelectorAll('.otp-digit')];
    const clock=root.querySelector('[data-otp-clock]');
    if(clock&&s!=='expired')runDeadline(api.authState?.otpExpiresAt,(remaining,time)=>{
      clock.textContent=remaining?time+' 후 인증번호가 만료돼요':'00분 00초';
      if(!remaining){root.querySelector('.otp-wrap')?.classList.add('is-error');const reason=root.querySelector('[data-otp-feedback]');if(reason){reason.hidden=false;reason.textContent='인증번호가 만료됐어요. 인증번호를 다시 받아 주세요.';}fields.forEach(field=>{field.disabled=true;field.setAttribute('aria-invalid','true');});const verify=root.querySelector('[data-action="verify-otp"]');if(verify)verify.disabled=true;}
    },c.signal);
    const clearError=()=>{if(s==='expired')return;root.querySelector('.otp-wrap')?.classList.remove('is-error','is-shaking');fields.forEach(el=>el.setAttribute('aria-invalid','false'));const msg=root.querySelector('[data-otp-feedback]');if(msg)msg.hidden=true;};
    function fill(value,index,multiple) {
      const digits=value.replace(/\D/g,'').slice(0,6),start=digits.length===6?0:index;
      if(multiple)fields.slice(start).forEach(el=>el.value='');
      [...digits].forEach((digit,j)=>{if(fields[start+j])fields[start+j].value=digit;});
      if(!digits)fields[index].value='';
      clearError();
      if(digits)fields[Math.min(start+digits.length,5)]?.focus({preventScroll:true});
    }
    fields.forEach((input,i)=>{
      input.addEventListener('focus',()=>input.select(),{signal:c.signal});
      input.addEventListener('input',e=>{
        if(e.isComposing)return;
        const oneKey=e.inputType==='insertText'&&e.data?.length===1;
        const value=oneKey?e.data:input.value;
        if(oneKey)input.value='';fill(value,i,!oneKey&&value.replace(/\D/g,'').length>1);
      },{signal:c.signal});
      input.addEventListener('compositionend',()=>fill(input.value,i,input.value.length>1),{signal:c.signal});
      input.addEventListener('keydown',e=>{
        if(e.key==='Backspace'&&!input.value&&i>0){e.preventDefault();fields[i-1].focus({preventScroll:true});}
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();fields[i+(e.key==='ArrowLeft'?-1:1)]?.focus({preventScroll:true});}
      },{signal:c.signal});
      input.addEventListener('paste',e=>{e.preventDefault();fill(e.clipboardData?.getData('text')||'',i,true);},{signal:c.signal});
    });
    root.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]'),a=btn?.dataset.action;if(btn?.disabled)return;
      if(a==='resend'){
        if(btn.disabled)return;
        if(api.mode==='product'){complete(api,btn,()=>navigate(api,'otp','empty','.otp-digit'),root,c.signal);return;}
        btn.disabled=true;btn.setAttribute('aria-busy','true');btn.innerHTML=spinner;
        const finish=()=>{if(!c.signal.aborted)navigate(api,'otp','empty','.otp-digit');};
        if(api.reduced?.()||!btn.animate)finish();
        else {const transition=btn.animate([{opacity:.6},{opacity:1}],{duration:180});c.signal.addEventListener('abort',()=>transition.cancel(),{once:true});transition.finished.then(finish,()=>{});}
      }
      if(a==='verify-otp'){
        const missing=fields.find(el=>!/^\d$/.test(el.value));
        if(missing){root.querySelector('.otp-wrap').classList.add('is-error');root.querySelector('[data-otp-feedback]').hidden=false;fields.forEach(el=>el.setAttribute('aria-invalid','true'));U.shake(root.querySelector('.otp-wrap'));missing.focus({preventScroll:true});return;}
        complete(api,btn,()=>navigate(api,'otp','verified','[data-action="login"]'),root,c.signal);
      }
      if(a==='login'&&s==='verified'&&consumeAuthReturn(api,true))return;
      if(a==='back'||a==='login')navigate(api,'login','empty','[name=email]');
    },{signal:c.signal});
    applyPendingFocus(root,api);return()=>{dispose();c.abort();};
  }});

  registry.push({id:'password',group:'로그인·가입',label:'비밀번호 재설정',description:'계정 존재 여부를 노출하지 않는 안내와 Liquid Link 강도 표시를 비교합니다.',width:'mobile',states:states([['request','이메일 입력'],['request-error','이메일 오류'],['sent','안내 완료'],['weak','짧은 비밀번호'],['strong','긴 비밀번호'],['error','일치 오류'],['complete','완료 예시']]),render(s,o={}) {
    const request=s==='request'||s==='request-error';
    return scene(`<div data-submit-action="${request?'send-reset':'submit-password'}"><div class="sheet-title"><h1>비밀번호 재설정</h1></div>${request?`${field('이메일','email','이메일 주소',{type:'email',autocomplete:'email',required:true,error:s==='request-error'?'이메일 양식을 확인해 주세요.':'',value:s==='request-error'?'my.order.ooo':''})}${button('인증코드 전송','send-reset','primary wide')}`:s==='sent'?success('메일함을 확인해 주세요','가입 정보와 일치하면 재설정 안내를 보내드려요.','show-password'):s==='complete'?success('비밀번호를 바꿨어요','새 비밀번호로 로그인해 주세요.','login'):`${field('새 비밀번호','new-password','비밀번호 입력',{type:'password',autocomplete:'new-password',required:true,value:s==='strong'?EXAMPLE_PASSWORD:s==='weak'?'abc':''})}${meter(s==='strong'?strength(EXAMPLE_PASSWORD):s==='weak'?1:0)}${field('비밀번호 확인','password-confirm','한 번 더 입력해 주세요',{type:'password',autocomplete:'new-password',required:true,value:s==='strong'?EXAMPLE_PASSWORD:'',error:s==='error'?'입력한 비밀번호가 달라요.':''})}<div class="bottom-actions">${button('비밀번호 바꾸기','submit-password')}</div>`}</div>`,'비밀번호 재설정',o);
  },mount(root,s,api={}) {
    const c=new AbortController(),dispose=commonAuthMount(root,s,api);mountMeter(root,c,api);
    root.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]'),a=btn?.dataset.action;if(btn?.disabled)return;
      if(a==='send-reset'){if(!emailValid(root.querySelector('[name=email]'))){firstInvalid(root);return;}complete(api,btn,()=>navigate(api,'password','sent','[data-action="show-password"]'),root,c.signal);}
      if(a==='show-password')navigate(api,'password','weak','[name=new-password]');
      if(a==='submit-password'){
        const p=root.querySelector('[name=new-password]'),q=root.querySelector('[name=password-confirm]');
        const validPass=fieldError(p,meetsPasswordRule(p.value)?'':passwordRule),validConfirm=fieldError(q,!q.value?'비밀번호를 한 번 더 입력해 주세요.':p.value!==q.value?'입력한 비밀번호가 달라요.':'');
        if(!validPass||!validConfirm){firstInvalid(root);return;}complete(api,btn,()=>exitSheet(root,api,()=>navigate(api,'password','complete','[data-action="login"]'),c.signal),root,c.signal);
      }
      if(a==='login'||a==='back')navigate(api,'login','empty','[name=email]');
    },{signal:c.signal});
    applyPendingFocus(root,api);return()=>{dispose();c.abort();};
  }});

  registry.push({id:'terms',group:'로그인·가입',label:'약관·동의',description:'필수·선택 동의와 목차 이동을 검토합니다. 확정 약관 원문은 연결 전이며 본문은 빈 문서선으로 표시합니다.',width:'mobile',states:states([['required','필수 약관'],['privacy','개인정보'],['optional','선택 동의'],['missing','동의 누락']]),render(s,o={}) {
    const titles=[s==='privacy'?'개인정보 처리방침':s==='optional'?'선택 알림':'서비스 이용약관'];
    return `<div class="page terms-page">${head('약관을<br>확인해 주세요','',{...o,back:true})}<div class="segmented"><button type="button" data-term="required" class="${s==='missing'?'terms-invalid':s==='required'?'active':''}">이용약관</button><button type="button" data-term="privacy" class="${s==='privacy'?'active':''}">개인정보</button><button type="button" data-term="optional" class="${s==='optional'?'active':''}">선택 동의</button></div><div class="terms-reading"><div class="scroll-region terms-body" tabindex="0" aria-label="약관 내용">${titles.map((t,i)=>`<section data-term-section="${i}"><h3>${t}</h3><div class="terms-copy-lines" aria-label="약관 원문 자리"><i></i><i></i><i></i><i></i></div></section>`).join('')}</div></div><label class="check-row ${s==='missing'?'terms-invalid':''}"><input aria-invalid="${s==='missing'}" name="terms-check" type="checkbox" ${s==='optional'?'':'required'}>${s==='optional'?'[선택] 소식과 혜택을 받아볼게요':'[필수] 내용을 확인하고 동의해요'}</label><div class="sr-only" data-terms-feedback ${s==='missing'?'':'hidden'}>${note('필수 약관에 동의해 주세요.','error')}</div><div class="bottom-actions">${button('확인','terms-done')}</div></div>`;
  },mount(root,s,api={}) {
    const c=new AbortController(),session=pendingTermsSession,check=root.querySelector('[name=terms-check]');
    if(session?.draft&&interactive(api))check.checked=session.checks[s]??(s==='optional'?session.draft.marketing:session.draft.required);
    root.addEventListener('click',e=>{
      const btn=e.target.closest('button');if(!btn)return;
      if(btn.dataset.term){if(session)session.checks[s]=check.checked;openTerms(api,session,btn.dataset.term);}
      if(btn.dataset.section!==undefined){
        const region=root.querySelector('.terms-body'),target=region.querySelector(`[data-term-section="${btn.dataset.section}"]`);
        if(target){const top=Math.max(0,target.getBoundingClientRect().top-region.getBoundingClientRect().top+region.scrollTop-8);if(region.scrollTo)region.scrollTo({top,behavior:api.reduced?.()?'auto':'smooth'});else region.scrollTop=top;}
        root.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b===btn));
      }
      if(btn.dataset.action==='terms-done'){
        if(!check.checked&&s!=='optional'){root.querySelector('[data-terms-feedback]').hidden=false;check.setAttribute('aria-invalid','true');const chip=root.querySelector('[data-term="'+(s==='privacy'?'privacy':'required')+'"]');chip?.classList.add('terms-invalid');check.closest('label').classList.add('terms-invalid');U.shake(chip);chip?.focus();return;}
        if(session?.draft){if(s==='optional')session.draft.marketing=check.checked;else session.draft.required=true;}
        returnFromTerms(api,session);
      }
      if(btn.dataset.action==='back')returnFromTerms(api,session);
    },{signal:c.signal});
    check.addEventListener('change',()=>{if(check.checked){root.querySelector('[data-terms-feedback]').hidden=true;check.setAttribute('aria-invalid','false');root.querySelectorAll('.terms-invalid').forEach(el=>el.classList.remove('terms-invalid'));}},{signal:c.signal});
    applyPendingFocus(root,api);
    return()=>{c.abort();if(session&&pendingTermsSession!==session&&pendingSignupRestore!==session.draft)session.draft=null;};
  }});
  w.QA_ACCOUNT={meter};
})(window);
