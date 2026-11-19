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
  const productIcon = simple => w.ORDER_INTRO_ICON ? w.ORDER_INTRO_ICON(simple) : icon('search',42);
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
    const top=member ? '<strong class="ob-wordmark">Order<span class="ob-period" aria-hidden="true">.</span></strong>'+link(brandMark,'profile/menu','ob-mark-btn') :
      '<button type="button" class="ob-brand" data-action="animate-brand" aria-label="Order 로고"><strong>Order.</strong>'+brandMark+'</button>'+link('회원가입','signup/empty','ob-join');
    const content=step===4?'<div class="ob-mode-grid">'+mode(true,member,true)+mode(false,member,true)+'</div>':
      step<=2?'<img class="ob-art" alt="" width="287" height="226" data-intro-art>':'';
    const tray=member ? (step<4?mode(true,true,false)+mode(false,true,false):'') : link('로그인','login/empty','ob-login');
    const quick=member?'<nav class="ob-quick" aria-label="빠른 메뉴"><div hidden class="ob-quick-items">'+link('계란 시세','price-policy/overview')+link('오더패스','passes/grid')+'</div><button type="button" data-action="quick" aria-expanded="false" aria-label="알림과 빠른 메뉴">'+icon('deck',21)+'<span class="quick-unread" aria-label="읽지 않은 알림" hidden></span></button></nav>':'';
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
    let drag=null,suppressClick=false,exiting=false,modeFlight=null,ghost=null,fromTray=[],stepRequest=0;
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
    const items=shell.querySelector('.ob-quick-items');
    const fan=quick&&w.ORDER_CUSTOMER_CONTROLS?.speedDial(quick,items,ctl.signal);
    function menu(open){if(!quick)return;if(fan){fan(open);return;}quick.setAttribute('aria-expanded',String(open));items.hidden=!open;}
    if(quick)on(window,'message',e=>{
      const m=e.data;
      if(e.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.type!=='noticeCountFixture'||!Number.isInteger(m.payload)||m.payload<0||m.payload>99)return;
      const badge=quick.querySelector('.quick-unread');if(!badge)return;
      const text=String(m.payload),changed=badge.textContent!==''&&badge.textContent!==text;
      badge.textContent=text;badge.hidden=!m.payload;quick.setAttribute('aria-label','알림과 빠른 메뉴'+(m.payload?' · 읽지 않은 알림 '+text+'개':''));
      if(changed&&m.payload)w.ORDER_CUSTOMER_CONTROLS?.motion(badge,[{scale:'.65'},{scale:'1.2',offset:.66},{scale:'1'}],{duration:230});
    });
    if(quick)on(shell,'pointerdown',e=>{if(!e.target.closest('.ob-quick')&&quick.getAttribute('aria-expanded')==='true')menu(false);});
    const mark=shell.querySelector('.ob-mark-btn');
    on(window,'message',e=>{
      if(e.source!==parent||e.data?.scope!=='ORDER_R3_HOST'||e.data.type!=='memberArrival'||!mark)return;
      shell.dataset.memberArrival='true';
      if(api.reduced?.())return;
      const period=shell.querySelector('.ob-period');
      period?.animate([{opacity:1},{opacity:0}],{duration:300});
      const distance=mark.getBoundingClientRect().left-shell.querySelector('.ob-wordmark').getBoundingClientRect().right;
      mark.animate([{transform:'translateX('+(-Math.max(0,distance))+'px)'},{transform:'translateX(7px)',offset:.7},{transform:'translateX(-3px)',offset:.88},{transform:'translateX(0)'}],{duration:570,easing:'ease-out'});
    });
    const svg=shell.querySelector('header .ob-dots-logo svg');
    if(svg?.getAttribute('viewBox')==='-36 -40 572.045 280'){
      const paths=svg.querySelectorAll('g path');
      if(paths.length===3)paths.forEach((path,i)=>path.setAttribute('data-jelly',String(i)));
    }
    const jelly=svg?.querySelectorAll('[data-jelly]').length===3 && w.Code1Jelly
      ? w.Code1Jelly.mount(svg,{auto:!api.reduced?.(),interactive:false,minDelay:10000,maxDelay:15000}) : null;
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
      menu(false);magnetic?.destroy();modeIcons?.destroy();
      const nextNav=nextMain.querySelector('.ob-pages'),nextStep=Number(next.dataset.introStep);
      if(nav && nextNav){nextNav.replaceWith(nav);}
      else {pill?.destroy();pill=null;nav=nextNav;}
      main.replaceWith(nextMain);
      stage.querySelector('.ob-tasks').replaceWith(nextTray);
      main=nextMain;step=nextStep;shell.dataset.introStep=String(step);
      if(pill)pill.select(step);else if(nav)pill=w.ORDER_INTRO_PAGINATION?.(nav,api.reduced);
      exiting=false;drag=null;suppressClick=false;
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
        controller?.activate();magnetic?.reset();modeIcons?.pause();jelly?.stopRandom(); jelly?.stop();
        paused=stage.getAnimations?.({subtree:true}).filter(a=>a.playState==='running')||[];
        for(const a of paused)a.pause();
        for(const svg of stage.querySelectorAll('svg'))svg.pauseAnimations?.();
      }else{
        controller?.deactivate();controller?.reset();modeIcons?.resume();if(!api.reduced?.())jelly?.startRandom({minDelay:10000,maxDelay:15000});
        for(const a of paused)a.play();paused=[];
        for(const svg of stage.querySelectorAll('svg'))svg.unpauseAnimations?.();
      }
      shade.hidden=!open;stage.inert=open;shell.classList.toggle('footer-open',open);menu(false);
      if(open)grip.focus({preventScroll:true});else opener.focus({preventScroll:true});
    }
    on(shell,'click',e=>{
      const b=e.target.closest('button');
      if(e.target===shade||b?.hasAttribute('data-company-close')){show(false);return;}
      if(!b)return;
      if(suppressClick&&b.closest('.ob-pages')){suppressClick=false;return;}
      if(b.hasAttribute('data-company-open')){show(true);return;}
      if(b.dataset.mfGo){
        const [target,s]=b.dataset.mfGo.split('/');
        if(b.classList.contains('ob-mode')&&['simple-r3','detailed-r3'].includes(target)){
          if(!exiting){exiting=true;modeMorph(b,false,()=>{if(!ctl.signal.aborted)api.select(target,s);});}
        }else api.select(target,s);
        return;
      }
      if(b.dataset.mfIntro){go(Number(b.dataset.mfIntro));return;}
      if(b===quick){menu(quick.getAttribute('aria-expanded')!=='true');return;}
      if(b.dataset.action==='delivery-policy'){const note=shell.querySelector('.ob-policy');note.hidden=!note.hidden;b.setAttribute('aria-expanded',String(!note.hidden));return;}
      if(b.dataset.action==='animate-brand'&&!api.reduced?.())jelly?.gather();
    });
    on(shell,'keydown',e=>{
      if(!shade.hidden){if(e.key==='Escape'){e.preventDefault();show(false);return;}
        if(e.key==='Tab'){const all=[...modal.querySelectorAll('button')].filter(b=>!b.closest('[hidden]'));if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}}return;}
      if(e.key==='Escape'&&quick?.getAttribute('aria-expanded')==='true'){menu(false);quick.focus();return;}
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(step+(e.key==='ArrowRight'?1:-1));}
    });
    on(shell,'pointerdown',e=>{if(!main.contains(e.target)||e.button!==0||e.target.closest('button:not([data-mf-intro])'))return;drag={x:e.clientX,y:e.clientY,id:e.pointerId,dot:!!e.target.closest('.ob-pages')};
});
    on(shell,'pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,dot=drag.dot;drag=null;
      if(Math.abs(dx)>(dot?9:45)&&Math.abs(dx)>Math.abs(dy)*1.4){
        if(dot){
          const buttons=[...nav.querySelectorAll('[data-mf-intro]')];
          const distance=b=>{const r=b.getBoundingClientRect();return Math.abs(e.clientX-r.x-r.width/2);};
          const closest=buttons.reduce((best,b)=>distance(b)<distance(best)?b:best);
          suppressClick=true;setTimeout(()=>{suppressClick=false;},0);go(Number(closest.dataset.mfIntro));
        }else{suppressClick=true;setTimeout(()=>{suppressClick=false;},0);go(step+(dx<0?1:-1));}
      }});
    on(shell,'pointercancel',()=>{drag=null;});
    if(state==='company')show(true);
    return ()=>{cancelMode();magnetic?.destroy();pill?.destroy();modeIcons?.destroy();jelly?.destroy();ctl.abort();};
  }
  const positions=['guest','member'].flatMap(type=>[1,2,3,4].map(n=>[type+'-'+n,(type==='guest'?'비회원 ':'회원 ')+n]));
  w.ORDER_DESIGN_MODULES.push({id:'onboarding',label:'소개·견적 모드',group:'매장 고객',role:'customer',width:'mobile',
    states:states([...positions,['company','사업자 정보']]),render,mount});
})(window);
