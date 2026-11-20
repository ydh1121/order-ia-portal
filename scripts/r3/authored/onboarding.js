(function (w) {
  'use strict';
  const {states, icon} = w.QAUI;
  const copy = [
    ['우리 사업장에 맞는<br>계란 최저가를 알아보세요', '초기 창업자, 일반 매장 뿐만 아니라<br>엔터프라이즈급 사업장까지 지원해요'],
    ['최저가에<br>놀라지 마세요', '가격 거품을 최대한 걷어내고<br>국내 최대 규모의 농장에서 직접 배송해요'],
    ['다수 사업장도<br>간편하게 견적하세요', '사업장이 많거나 지역이 달라도<br>자동으로 합산해서 견적을 알려드려요'],
    ['견적 모드를<br>선택해 주세요', '']
  ];
  const originalMark = w.ORDER_QA_ASSETS?.brand?.match(/<svg[\s\S]+<\/svg>/)?.[0];
  const brandMark = originalMark ? '<span class="ob-dots-logo" aria-hidden="true">'+originalMark+'</span>' : '<span class="ob-dots-logo" aria-hidden="true"><i></i><i></i><i></i></span>';
  const productIcon = simple => w.ORDER_INTRO_ICON ? w.ORDER_INTRO_ICON(simple) : icon('search',42);
  // Reuse the retained AnimateIcons Lucide Bell paths; the notification owner supplies behavior.
  const noticeIcon = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ob-notice-icon"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>';
  function illustration(step) {
    const first=step===1;
    return '<div class="ob-illustration"><img class="ob-art" alt="" width="287" height="226" data-intro-art>'+
      '<p class="ob-art-caption"><span>'+(first?'1일 출하량 약 12만 구 이상 규모':'당사 1일 출하량 약 120,000 구 이상')+'</span>'+
      '<span class="ob-art-detail">난각번호 1번, 2번 합산 기준</span>'+
      (first?'':'<small>전국 1일 평균 : 약 16,000구</small>')+'</p></div>';
  }
  function link(text,dest,cls='') {
    return '<button type="button" class="'+cls+'" data-mf-go="'+dest+'">'+text+'</button>';
  }
  function mode(simple,member,card) {
    const label=simple?'간편 견적':'상세 견적';
    const dest=simple?'simple-r3/':member?'detailed-r3/':'login/empty';
    const style='ob-mode '+(simple?'simple':'detail')+(card?' card':' inline')+(!member&&!simple?' needs-login':'');
    const control=link((card?productIcon(simple):'')+'<span>'+label+'</span>',dest,style);
    return card?'<div class="ob-mode-cell">'+control+(!member?'<small>'+(simple?'비회원도 가능해요':'회원만 가능해요')+'</small>':'')+'</div>':control;
  }
  function dots(step) {
    return '<nav class="ob-pages" aria-label="소개 페이지">'+[1,2,3,4].map(n=>
      '<button type="button" data-mf-intro="'+n+'" aria-label="소개 '+n+'페이지"'+(step===n?' aria-current="step"':'')+'><i></i></button>'
    ).join('')+'</nav>';
  }
  function footer(open) {
    const info=['상호','대표자','사업자등록번호','통신판매업 신고','사업장 소재지','고객센터','이메일'].map(label=>
      '<div class="ob-company-line"><dt>'+label+'</dt><dd>등록 필요</dd></div>').join('');
    return '<section class="ob-shade" '+(open?'':'hidden')+'><section class="ob-drawer" role="dialog" aria-modal="true" aria-label="사업자 정보" tabindex="-1">'+
      '<button type="button" class="ob-grip" data-company-close aria-label="사업자 정보 닫기"><i></i></button>'+brandMark+
      '<nav aria-label="정책과 고객지원">'+link('이용약관','terms/required')+link('개인정보 처리방침','terms/privacy')+
      '<button data-action="delivery-policy" type="button" aria-expanded="false">배송·취소·환불</button>'+link('고객지원','help-center/home')+'</nav>'+
      '<section class="ob-policy" hidden><p>배송·취소·환불 안내를 준비하고 있어요.</p>'+link('문의하기','help-center/contact')+'</section>'+
      '<h2>사업자 정보</h2><dl>'+info+'<div class="ob-company-line"><dt>호스팅 제공자</dt><dd>Cloudflare</dd></div></dl><p class="ob-copyright">© Order.ooo</p></section></section>';
  }
  function render(state) {
    const member=state.startsWith('member-'), opened=state==='company', step=opened?1:Number(state.slice(-1));
    const [title,subtitle]=copy[step-1], inactive=opened?' inert':'';
    const top='<div class="brand ob-brand-common"><strong class="ob-wordmark brand-word">Order<span class="ob-period brand-dot" aria-hidden="true">.</span></strong>'+originalMark+'</div>'+(member?'':link('회원가입','signup/empty','ob-join'));
    const content=step===4?'<div class="ob-mode-grid">'+mode(true,member,true)+mode(false,member,true)+'</div>':
      step<=2?illustration(step):'';
    const tray=member ? (step<4?mode(true,true,false)+mode(false,true,false):'') : link('로그인','login/empty','ob-login');
    const quick=member?'<nav class="ob-quick" aria-label="알림"><button type="button" data-action="quick" aria-haspopup="menu" aria-expanded="false" aria-label="알림">'+noticeIcon+'<span class="quick-unread" aria-label="읽지 않은 알림" hidden></span></button></nav>':'';
    return '<section class="ob '+(member?'member ':'guest ')+(opened?'footer-open':'')+'" data-intro-step="'+step+'">'+
      '<div class="ob-stage"'+inactive+'><header>'+top+'</header><main class="ob-main step-'+step+'" tabindex="-1" aria-label="서비스 소개. 좌우 방향키로 이동할 수 있어요.">'+
      '<div class="ob-copy"><h1>'+title+'</h1>'+(subtitle?'<p>'+subtitle+'</p>':'')+'</div><div class="ob-visual">'+content+'</div>'+
      (member&&step===4?'':dots(step))+'</main>'+quick+'<div class="ob-tasks">'+tray+'</div><footer><button type="button" data-company-open aria-haspopup="dialog">사업자 정보</button></footer></div>'+footer(opened)+'</section>';
  }
  function mount(root,state,api) {
    const ctl=new AbortController(), on=(el,ev,cb)=>el.addEventListener(ev,cb,{signal:ctl.signal});
    const shell=root.querySelector('.ob'), stage=shell.querySelector('.ob-stage');
    let main=shell.querySelector('.ob-main'),step=Number(shell.dataset.introStep);
    const modal=shell.querySelector('.ob-drawer'), shade=shell.querySelector('.ob-shade'), grip=shell.querySelector('.ob-grip');
    const opener=shell.querySelector('[data-company-open]'), quick=shell.querySelector('[data-action=quick]');
    const prefix=shell.classList.contains('member')?'member':'guest';
    let drag=null,suppressClick=false,clickReset=null,exiting=false,modeFlight=null,ghost=null,fromTray=[],stepRequest=0;
    function endDrag(){
      const last=drag;drag=null;
      if(last?.capture?.hasPointerCapture?.(last.id))last.capture.releasePointerCapture(last.id);
      return last;
    }
    function cancelMode(){modeFlight?.cancel();modeFlight=null;ghost?.remove();ghost=null;}
    function modeMorph(button,reverse,done){
      cancelMode();
      if(api.reduced?.()||!button.animate){done();return;}
      const from=button.getBoundingClientRect(),to=main.getBoundingClientRect();
      if(!from.width||!from.height||!to.width||!to.height){done();return;}
      ghost=document.createElement('div');
      ghost.className='ob-mode-flight';ghost.setAttribute('aria-hidden','true');
      const color=getComputedStyle(button),radius=color.borderRadius;
      Object.assign(ghost.style,{position:'fixed',left:to.x+'px',top:to.y+'px',width:to.width+'px',height:to.height+'px',background:getComputedStyle(button.querySelector('[data-magnetic-material]')||button).backgroundColor,pointerEvents:'none',zIndex:'6',transformOrigin:'top left'});
      shell.append(ghost);
      const small={transform:'translate('+(from.x-to.x)+'px,'+(from.y-to.y)+'px) scale('+(from.width/to.width)+','+(from.height/to.height)+')',borderRadius:radius,opacity:.92};
      const large={transform:'translate(0,0) scale(1)',borderRadius:'16px',opacity:.22};
      const move=ghost.animate(reverse?[large,small]:[small,large],{duration:290,easing:'cubic-bezier(.2,.82,.3,1)',fill:'both'});
      modeFlight=move;
      move.finished.then(()=>{if(modeFlight!==move||ctl.signal.aborted)return;cancelMode();done();},()=>{});
    }
    on(root,'r3-return-to-mode',e=>{
      const dest={simple:'simple-r3/','detailed':'detailed-r3/'}[e.detail?.mode];
      const button=dest&&shell.querySelector('[data-mf-go="'+dest+'"]');
      if(button){exiting=false;button.focus({preventScroll:true});modeMorph(button,true,()=>{});}
    });
    const go=n=>{
      if(exiting || n===step || n<1 || n>4)return;
      const request=++stepRequest;
      const arrive=()=>{if(!ctl.signal.aborted&&request===stepRequest)api.select('onboarding',prefix+'-'+n);};
      if(prefix!=='member' || step!==3 || n!==4 || api.reduced?.() || !main.animate){arrive();return;}
      exiting=true;
      const dots=main.querySelector('.ob-pages'), tray=stage.querySelector('.ob-tasks');
      fromTray=[...tray.querySelectorAll('.ob-mode')].map(button=>button.getBoundingClientRect());
      const fades=[dots?.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'}),
        tray?.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-28px)',opacity:0}],{duration:210,fill:'forwards'})].filter(Boolean);
      ctl.signal.addEventListener('abort',()=>fades.forEach(a=>a.cancel()),{once:true});
      Promise.all(fades.map(a=>a.finished)).then(arrive,()=>{});
    };
    const brand=shell.querySelector('header .brand');
    const context=api.brandAccount||w.ORDER_BRAND_ACCOUNT_CONTEXT||{};
    function noticeState(snapshot){
      if(!quick)return;
      const count=Number.isSafeInteger(snapshot?.unread)&&snapshot.unread>0?snapshot.unread:0,badge=quick.querySelector('.quick-unread');
      if(badge){badge.textContent=count>99?'99+':String(count);badge.hidden=!count;}
      quick.setAttribute('aria-label','알림'+(count?' · 읽지 않은 알림 '+count+'개':''));
      quick.setAttribute('aria-expanded',String(snapshot?.page==='notifications'&&['open','opening'].includes(snapshot?.phase)));
      quick.disabled=snapshot?.authenticated!==true;
    }
    const brandMenu=w.mountBrandAccountMenu?.(brand,{...context,authenticated:context.authenticated===true,animateInitial:context.consumeArrival?.()===true,reducedMotion:api.reduced,
      onStateChange(snapshot){noticeState(snapshot);context.onStateChange?.(snapshot);}});
    if(quick){
      if(brandMenu?.panel)quick.setAttribute('aria-controls',brandMenu.panel.id);
      noticeState(brandMenu?.inspect());
    }
    on(window,'message',e=>{
      if(api.mode==='product')return;
      if(e.source!==parent||e.data?.scope!=='ORDER_R3_HOST'||e.data.type!=='memberArrival'||!brandMenu)return;
      shell.dataset.memberArrival='true';
      if(context.authenticated===true)brandMenu.arrival();
    });
    let paused=[];
    function connectPrimary(){
      const primary=stage.querySelector(prefix==='member'?'.ob-mode.detail':'.ob-mode.simple');
      return primary&&w.OrderMagneticAction?.(primary,{reducedMotion:api.reduced,fill:'var(--ob-blue)'});
    }
    let magnetic=connectPrimary(),modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);
    let nav=main.querySelector('.ob-pages'),pill=w.ORDER_INTRO_PAGINATION?.(nav,api.reduced);
    on(root,'r3-onboarding-state',event=>{
      const {state,markup}=event.detail || {};
      if(typeof state!=='string' || !['1','2','3','4'].some(n=>state===prefix+'-'+n) || typeof markup!=='string')return;
      const temp=document.createElement('template');
      temp.innerHTML=markup;
      const next=temp.content.querySelector('.ob.'+prefix);
      const nextMain=next?.querySelector('.ob-main'),nextTray=next?.querySelector('.ob-tasks');
      if(!nextMain || !nextTray || next.dataset.introStep!==state.slice(-1))return;
      ++stepRequest;
      const restore=main.contains(document.activeElement);
      if(!shade.hidden)show(false);
      brandMenu?.close({focus:false,immediate:true});magnetic?.destroy();modeIcons?.destroy();
      const nextNav=nextMain.querySelector('.ob-pages'),nextStep=Number(next.dataset.introStep);
      if(nav && nextNav){nextNav.replaceWith(nav);}
      else {pill?.destroy();pill=null;nav=nextNav;}
      main.replaceWith(nextMain);
      stage.querySelector('.ob-tasks').replaceWith(nextTray);
      main=nextMain;step=nextStep;shell.dataset.introStep=String(step);
      if(pill)pill.select(step);else if(nav)pill=w.ORDER_INTRO_PAGINATION?.(nav,api.reduced);
      exiting=false;endDrag();
      magnetic=connectPrimary();modeIcons=w.ORDER_INTRO_ICONS?.(main,api.reduced);
      if(fromTray.length && step===4 && !api.reduced?.()){
        const cards=main.querySelectorAll('.ob-mode.card');
        main.querySelector('.ob-mode-grid').style.animation='none';
        cards.forEach((button,i)=>{
          const prev=fromTray[i],next=button.getBoundingClientRect();
          if(!prev||!next.width)return;
          button.animate([{transformOrigin:'top left',transform:'translate('+(prev.x-next.x)+'px,'+(prev.y-next.y)+'px) scale('+(prev.width/next.width)+','+(prev.height/next.height)+')',borderRadius:'999px'},
            {transformOrigin:'top left',transform:'none',borderRadius:getComputedStyle(button).borderRadius}],{duration:320,easing:'cubic-bezier(.22,.85,.3,1)'});
        });
      }
      fromTray=[];
      if(restore)main.focus({preventScroll:true});
      event.preventDefault();
    });
    const controller=w.ORDER_QA_SHEET?.(modal,[grip],{signal:ctl.signal,reduced:api.reduced,open:false,surface:shade,close:()=>show(false)});

    function show(open){
      if(open){
        endDrag();
        controller?.activate();magnetic?.reset();modeIcons?.pause();brandMenu?.pause();
        paused=stage.getAnimations?.({subtree:true}).filter(a=>a.playState==='running')||[];
        for(const a of paused)a.pause();
        for(const svg of stage.querySelectorAll('svg'))svg.pauseAnimations?.();
      }else{
        controller?.deactivate();controller?.reset();modeIcons?.resume();brandMenu?.resume();
        for(const a of paused)a.play();paused=[];
        for(const svg of stage.querySelectorAll('svg'))svg.unpauseAnimations?.();
      }
      shade.hidden=!open;stage.inert=open;shell.classList.toggle('footer-open',open);
      if(open)grip.focus({preventScroll:true});else opener.focus({preventScroll:true});
    }
    on(shell,'click',e=>{
      if(suppressClick){suppressClick=false;e.preventDefault();return;}
      const b=e.target.closest('button');
      if(e.target===shade||b?.hasAttribute('data-company-close')){show(false);return;}
      if(!b)return;
      if(b.hasAttribute('data-company-open')){show(true);return;}
      if(b.dataset.mfGo){
        const [target,s]=b.dataset.mfGo.split('/');
        if(b.classList.contains('ob-mode')&&['simple-r3','detailed-r3'].includes(target)){
          if(!exiting){exiting=true;modeMorph(b,false,()=>{if(!ctl.signal.aborted)api.select(target,s);});}
        }else api.select(target,s);
        return;
      }
      if(b.dataset.mfIntro){go(Number(b.dataset.mfIntro));return;}
      if(b===quick){brandMenu?.open('notifications');return;}
      if(b.dataset.action==='delivery-policy'){const note=shell.querySelector('.ob-policy');note.hidden=!note.hidden;b.setAttribute('aria-expanded',String(!note.hidden));return;}
    });
    on(shell,'keydown',e=>{
      if(!shade.hidden){if(e.key==='Escape'){e.preventDefault();show(false);return;}
        if(e.key==='Tab'){const all=[...modal.querySelectorAll('button')].filter(b=>!b.closest('[hidden]'));if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}}return;}
      if(e.key==='Escape'&&quick?.getAttribute('aria-expanded')==='true'){brandMenu?.close();quick.focus();return;}
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(step+(e.key==='ArrowRight'?1:-1));}
    });
    on(shell,'dragstart',e=>{if(main.contains(e.target))e.preventDefault();});
    on(shell,'selectstart',e=>{if(main.contains(e.target))e.preventDefault();});
    on(shell,'pointerdown',e=>{
      if(!shade.hidden||!main.contains(e.target)||e.button!==0||e.isPrimary===false||e.target.closest('button:not([data-mf-intro])'))return;
      endDrag();drag={x:e.clientX,y:e.clientY,id:e.pointerId,dot:!!e.target.closest('.ob-pages'),axis:null,capture:null};
    });
    on(w,'pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const dx=Math.abs(e.clientX-drag.x),dy=Math.abs(e.clientY-drag.y);
      if(!drag.axis){
        if(Math.max(dx,dy)<8)return;
        // Vertical gestures belong to native scrolling. Once yielded, this gesture cannot change pages.
        if(dy>dx*1.15){endDrag();return;}
        if(dx<=dy*1.4)return;
        drag.axis='x';
        if(main.setPointerCapture){main.setPointerCapture(e.pointerId);drag.capture=main;}
      }
      e.preventDefault();
    });
    on(w,'pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const last=endDrag(),dx=e.clientX-last.x,dy=e.clientY-last.y,dot=last.dot;
      if(Math.abs(dx)>(dot?9:45)&&Math.abs(dx)>Math.abs(dy)*1.4){
        e.preventDefault();suppressClick=true;clearTimeout(clickReset);clickReset=setTimeout(()=>{suppressClick=false;clickReset=null;},0);
        if(dot){
          if(!nav)return;
          const buttons=[...nav.querySelectorAll('[data-mf-intro]')];
          const distance=b=>{const r=b.getBoundingClientRect();return Math.abs(e.clientX-r.x-r.width/2);};
          const closest=buttons.reduce((best,b)=>distance(b)<distance(best)?b:best);
          go(Number(closest.dataset.mfIntro));
        }else go(step+(dx<0?1:-1));
      }});
    on(w,'pointercancel',e=>{if(drag?.id===e.pointerId)endDrag();});
    on(shell,'lostpointercapture',e=>{if(drag?.id===e.pointerId)endDrag();});
    if(state==='company')show(true);
    return ()=>{endDrag();clearTimeout(clickReset);cancelMode();magnetic?.destroy();pill?.destroy();modeIcons?.destroy();brandMenu?.destroy();ctl.abort();};
  }
  const positions=['guest','member'].flatMap(type=>[1,2,3,4].map(n=>[type+'-'+n,(type==='guest'?'비회원 ':'회원 ')+n]));
  w.ORDER_DESIGN_MODULES.push({id:'onboarding',label:'소개·견적 모드',group:'매장 고객',role:'customer',width:'mobile',
    states:states([...positions,['company','사업자 정보']]),render,mount});
})(window);
