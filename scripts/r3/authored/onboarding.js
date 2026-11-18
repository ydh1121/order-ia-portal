(function (w) {
  'use strict';
  const {states, icon} = w.QAUI;
  const copy = [
    ['우리 사업장에 맞는<br>계란 최저가를 알아보세요', '초기 창업자, 일반 매장 뿐만 아니라<br>엔터프라이즈급 사업장까지 지원해요'],
    ['최저가에<br>놀라지 마세요', '가격 거품을 최대한 걷어내고<br>농장에서 직접 배송해요'],
    ['다수 사업장도<br>간편하게 견적하세요', '사업장이 많거나 지역이 달라도<br>자동으로 합산해서 견적을 알려드려요'],
    ['견적 모드를<br>선택해 주세요', '']
  ];
  const originalMark = w.ORDER_QA_ASSETS?.brand?.match(/<svg[\s\S]+<\/svg>/)?.[0];
  const brandMark = originalMark ? '<span class="ob-dots-logo" aria-hidden="true">'+originalMark+'</span>' : '<span class="ob-dots-logo" aria-hidden="true"><i></i><i></i><i></i></span>';
  const productIcon = simple => simple ? icon('search',42) :
    '<svg aria-hidden="true" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"><path d="M6 2h8l5 5v15H4V2h2m7 0v6h6"/><circle cx="10" cy="14" r="2.5"/><path d="m12 16 2 2"/></svg>';
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
      '<dt>'+label+'</dt><dd>등록 필요</dd>').join('');
    return '<section class="ob-shade" '+(open?'':'hidden')+'><section class="ob-drawer" role="dialog" aria-modal="true" aria-label="사업자 정보" tabindex="-1">'+
      '<button type="button" class="ob-grip" data-company-close aria-label="사업자 정보 닫기"><i></i></button>'+brandMark+
      '<nav aria-label="정책과 고객지원">'+link('이용약관','terms/required')+link('개인정보 처리방침','terms/privacy')+
      '<button data-action="delivery-policy" type="button" aria-expanded="false">배송·취소·환불</button>'+link('고객지원','help-center/home')+'</nav>'+
      '<section class="ob-policy" hidden><p>배송·취소·환불 안내를 준비하고 있어요.</p>'+link('문의하기','help-center/contact')+'</section>'+
      '<h2>사업자 정보</h2><dl>'+info+'<dt>호스팅 제공자</dt><dd>Cloudflare</dd></dl><p class="ob-copyright">© Order.ooo</p></section></section>';
  }
  function render(state) {
    const member=state.startsWith('member-'), opened=state==='company', step=opened?1:Number(state.slice(-1));
    const [title,subtitle]=copy[step-1], inactive=opened?' inert':'';
    const top=member ? '<strong class="ob-wordmark">Order</strong>'+link(brandMark,'profile/menu','ob-mark-btn') :
      '<button type="button" class="ob-brand" data-action="animate-brand" aria-label="Order 로고"><strong>Order.</strong>'+brandMark+'</button>'+link('회원가입','signup/empty','ob-join');
    const content=step===4?'<div class="ob-mode-grid">'+mode(true,member,true)+mode(false,member,true)+'</div>':
      step<=2?'<img class="ob-art" alt="" width="287" height="226" data-intro-art>':'';
    const tray=member ? (step<4?mode(true,true,false)+mode(false,true,false):'') : link('로그인','login/empty','ob-login');
    const quick=member?'<nav class="ob-quick" aria-label="빠른 메뉴"><div hidden class="ob-quick-items">'+link('계란 시세','price-policy/overview')+link('오더패스','passes/grid')+'</div><button type="button" data-action="quick" aria-expanded="false" aria-label="알림과 빠른 메뉴">'+icon('deck',21)+'</button></nav>':'';
    return '<section class="ob '+(member?'member ':'guest ')+(opened?'footer-open':'')+'" data-intro-step="'+step+'">'+
      '<div class="ob-stage"'+inactive+'><header>'+top+'</header><main class="ob-main step-'+step+'" tabindex="-1" aria-label="서비스 소개. 좌우 방향키로 이동할 수 있어요.">'+
      '<div class="ob-copy"><h1>'+title+'</h1>'+(subtitle?'<p>'+subtitle+'</p>':'')+'</div><div class="ob-visual">'+content+'</div>'+
      (member&&step===4?'':dots(step))+'</main>'+quick+'<div class="ob-tasks">'+tray+'</div><footer><button type="button" data-company-open aria-haspopup="dialog">사업자 정보</button></footer></div>'+footer(opened)+'</section>';
  }
  function mount(root,state,api) {
    const ctl=new AbortController(), on=(el,ev,cb)=>el.addEventListener(ev,cb,{signal:ctl.signal});
    const shell=root.querySelector('.ob'), stage=shell.querySelector('.ob-stage'), main=shell.querySelector('.ob-main');
    const modal=shell.querySelector('.ob-drawer'), shade=shell.querySelector('.ob-shade'), grip=shell.querySelector('.ob-grip');
    const opener=shell.querySelector('[data-company-open]'), quick=shell.querySelector('[data-action=quick]');
    const step=Number(shell.dataset.introStep), prefix=shell.classList.contains('member')?'member':'guest';
    let drag=null,gripStart=null,suppressClick=false;
    const go=n=>{if(n!==step && n>=1 && n<=4)api.select('onboarding',prefix+'-'+n);};
    function menu(open){if(quick){quick.setAttribute('aria-expanded',String(open));shell.querySelector('.ob-quick-items').hidden=!open;}}
    function show(open){shade.hidden=!open;stage.inert=open;shell.classList.toggle('footer-open',open);menu(false);if(open)grip.focus({preventScroll:true});else opener.focus({preventScroll:true});}
    on(shell,'click',e=>{
      const b=e.target.closest('button');
      if(e.target===shade||b?.hasAttribute('data-company-close')){show(false);return;}
      if(!b)return;
      if(suppressClick&&b.closest('.ob-pages')){suppressClick=false;return;}
      if(b.hasAttribute('data-company-open')){show(true);return;}
      if(b.dataset.mfGo){const [target,s]=b.dataset.mfGo.split('/');api.select(target,s);return;}
      if(b.dataset.mfIntro){go(Number(b.dataset.mfIntro));return;}
      if(b===quick){menu(quick.getAttribute('aria-expanded')!=='true');return;}
      if(b.dataset.action==='delivery-policy'){const note=shell.querySelector('.ob-policy');note.hidden=!note.hidden;b.setAttribute('aria-expanded',String(!note.hidden));return;}
      if(b.dataset.action==='animate-brand'&&!api.reduced?.()){b.querySelector('.ob-dots-logo').animate([{transform:'scale(1)'},{transform:'scale('+(1.08+Math.random()*.14)+',.9)'},{transform:'scale(1)'}],{duration:350});}
    });
    on(shell,'keydown',e=>{
      if(!shade.hidden){if(e.key==='Escape'){e.preventDefault();show(false);return;}
        if(e.key==='Tab'){const all=[...modal.querySelectorAll('button')].filter(b=>!b.closest('[hidden]'));if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}}return;}
      if(e.key==='Escape'&&quick?.getAttribute('aria-expanded')==='true'){menu(false);quick.focus();return;}
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(step+(e.key==='ArrowRight'?1:-1));}
    });
    on(main,'pointerdown',e=>{if(e.button!==0||e.target.closest('button:not([data-mf-intro])'))return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};});
    on(main,'pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4){suppressClick=true;go(step+(dx<0?1:-1));}});
    on(main,'pointercancel',()=>{drag=null;});
    on(grip,'pointerdown',e=>{gripStart=e.clientY;grip.setPointerCapture(e.pointerId);});
    on(grip,'pointermove',e=>{if(gripStart!==null)modal.style.transform='translateY('+Math.max(0,e.clientY-gripStart)*.75+'px)';});
    function release(e){if(gripStart!==null&&e.type==='pointerup'&&e.clientY-gripStart>55)show(false);gripStart=null;modal.style.removeProperty('transform');}
    on(grip,'pointerup',release);on(grip,'pointercancel',release);
    if(state==='company')show(true);
    return ()=>ctl.abort();
  }
  const positions=['guest','member'].flatMap(type=>[1,2,3,4].map(n=>[type+'-'+n,(type==='guest'?'비회원 ':'회원 ')+n]));
  w.ORDER_DESIGN_MODULES.push({id:'onboarding',label:'소개·견적 모드',group:'매장 고객',role:'customer',width:'mobile',
    states:states([...positions,['company','사업자 정보']]),render,mount});
})(window);
