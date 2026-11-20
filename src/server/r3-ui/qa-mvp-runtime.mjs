// The product and QA lab mount this same module. Business state changes only
// after the injected product API acknowledges them; visual players remain local.
export function registerQaMvp(montages={}) {
  const previous=new Map((window.ORDER_DESIGN_MODULES||[]).map(module=>[module.id,module]));
  const libraryModule=window.ORDER_LIBRARY_SOURCE?previous.get(window.ORDER_LIBRARY_SOURCE.screen):null;
  function mount(root,state,api){
    const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
    const cleanups=[],pendingKeys=new Map();let alive=true;
    const shared=window.QAUI,adapter=api.adapter||window.ORDER_APP_ADAPTER,context=window.ORDER_APP_CONTEXT||{},brandContext=api.brandAccount||window.ORDER_BRAND_ACCOUNT_CONTEXT||{};
    const connected=Boolean(adapter?.request);let purchaseLoad;
    const loadPurchases=()=>purchaseLoad??=(request('/purchases'));
    const request=async(path,body)=>{if(!connected)throw Object.assign(Error('PRODUCT_API_UNCONNECTED'),{code:'PRODUCT_API_UNCONNECTED'});return adapter.request(path,body);};
    const message=error=>({PRODUCT_API_UNCONNECTED:'서비스 연결을 확인하지 못했어요. 연결 후 다시 시도해 주세요.',ACCESS_DENIED:'이 작업을 수행할 권한이 없어요.',REVISION_CONFLICT:'다른 화면에서 먼저 변경했어요. 입력을 보존했습니다. 최신 자료를 다시 확인해 주세요.',PAYMENT_PROVIDER_UNAVAILABLE:'카드 결제가 아직 연결되지 않았어요. 주문은 결제 대기로 유지됩니다.',ACTIVE_ORDERS_EXIST:'진행 중인 주문이 있어 탈퇴할 수 없어요. 주문을 먼저 확인해 주세요.',OFFER_UNAVAILABLE:'이 판매 조건을 사용할 수 없어요. 상품을 다시 선택해 주세요.',RATES_MUST_TOTAL_100:'배분율 합계가 100%가 되도록 입력해 주세요.',DISPATCH_CONDITIONS_REQUIRED:'입금 확인과 배송 정보를 확인해 주세요.',QUOTE_EXPIRED:'확인한 견적이 만료됐어요. 금액을 다시 확인해 주세요.',QUOTE_EXPIRED_OR_CHANGED:'확인한 견적이 만료되거나 변경됐어요. 금액을 다시 확인해 주세요.',QUOTE_INPUT_CHANGED:'상품이나 수량이 바뀌었어요. 금액을 다시 확인해 주세요.'}[error?.code||error?.error||error?.message]||'저장하지 못했어요. 입력을 유지했으니 연결을 확인하고 다시 시도해 주세요.');
    const setStatus=(element,text,error=false)=>{if(!element||!alive)return;element.textContent=text;element.classList.toggle('field-error',error);element.setAttribute('role',error?'alert':'status');};
    const keyFor=(path,payload)=>{const fingerprint=path+'|'+JSON.stringify(payload);if(!pendingKeys.has(fingerprint))pendingKeys.set(fingerprint,crypto.randomUUID());return {fingerprint,key:pendingKeys.get(fingerprint)};};
    const mutate=async(path,payload)=>{const token=keyFor(path,payload);const result=await request(path,{...payload,requestKey:token.key});pendingKeys.delete(token.fingerprint);return result;};
    const guard=(form,button,status,work)=>async()=>{
      if(button.disabled||button.dataset.busy==='true')return;
      if(form&&!validate(form))return;
      const controls=form?[...form.querySelectorAll('input,textarea,select,button')]:[button],disabled=controls.map(el=>el.disabled);
      button.dataset.busy='true';button.setAttribute('aria-busy','true');controls.forEach(el=>el.disabled=true);
      try{await work();}catch(error){setStatus(status,message(error),true);}finally{if(alive){controls.forEach((el,index)=>el.disabled=disabled[index]);button.dataset.busy='false';button.removeAttribute('aria-busy');root.dispatchEvent(new CustomEvent('order-app-operation-end'));}}
    };
    function fieldError(input,text){
      if(shared?.setFieldError)shared.setFieldError(input,text);else input.setAttribute('aria-invalid',String(Boolean(text)));
      if(text&&shared?.shake&&!api.reduced?.())shared.shake(input.closest('.field')||input);
    }
    function validate(form){
      let first=null;
      for(const input of form.querySelectorAll('input,textarea,select')){
        if(input.disabled||input.readOnly||['hidden','button','submit'].includes(input.type))continue;
        const v=input.validity;let error='';
        if(v?.valueMissing)error='필수 항목을 입력해 주세요.';
        else if(v?.typeMismatch)error=input.type==='email'?'이메일 주소를 확인해 주세요.':'입력 형식을 확인해 주세요.';
        else if(v?.badInput||v?.stepMismatch)error='올바른 숫자를 입력해 주세요.';
        else if(v?.rangeUnderflow)error=input.min+' 이상을 입력해 주세요.';
        else if(v?.rangeOverflow)error=input.max+' 이하를 입력해 주세요.';
        else if(v?.tooLong)error='입력 가능한 길이를 초과했어요.';
        else if(v?.patternMismatch||v?.customError)error='입력 내용을 확인해 주세요.';
        fieldError(input,error);if(error&&!first)first=input;
      }
      first?.focus();return !first;
    }
    function bindForm(form,button,work,status){
      form.noValidate=true;const activate=guard(form,button,status,work);button.onclick=activate;
      const submit=e=>{e.preventDefault();activate();},keydown=e=>{if(e.key==='Enter'&&!e.defaultPrevented&&!e.isComposing&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.target.matches('input:not([type=checkbox]):not([type=radio])')){e.preventDefault();activate();}};
      form.addEventListener('submit',submit);form.addEventListener('keydown',keydown);
      cleanups.push(()=>{form.removeEventListener('submit',submit);form.removeEventListener('keydown',keydown);});
    }
    const magnetic=new WeakMap();
    const mountButtons=scope=>{if(!window.OrderMagneticAction)return;for(const button of scope.querySelectorAll('.btn')){if(button.closest('[inert],[data-component-source]')||magnetic.has(button))continue;const instance=window.OrderMagneticAction(button,{reducedMotion:()=>Boolean(api.reduced?.())});magnetic.set(button,instance);cleanups.push(()=>instance?.destroy());}};
    const applyShared=scope=>{mountButtons(scope);for(const input of scope.querySelectorAll('input,textarea'))shared?.syncField?.(input);};
    root.dataset.appConnection=connected?'connected':'unconnected';
    // The operations sidebar is hidden by the canonical narrow-layout rule.
    // Move its existing brand into the existing topline; never clone its SVG,
    // authenticated menu or motion owner.
    for(const shell of all('.ops-page')){
      if(shell.closest('[data-component-source]'))continue;
      const brand=shell.querySelector('.ops-side-brand .brand'),top=shell.querySelector('.ops-topline');if(!brand||!top)continue;
      const parent=brand.parentNode,next=brand.nextSibling,query=window.matchMedia?.('(max-width:760px)');
      const place=()=>{if(query?.matches)top.append(brand);else parent.insertBefore(brand,next?.parentNode===parent?next:null);};
      place();query?.addEventListener?.('change',place);cleanups.push(()=>{query?.removeEventListener?.('change',place);parent.insertBefore(brand,next?.parentNode===parent?next:null);});
    }
    const brandPlayers=[];
    for(const brand of all('.brand')){
      if(brand.closest('[inert],[data-component-source]'))continue;
      if(window.mountBrandAccountMenu){
        const menu=window.mountBrandAccountMenu(brand,{authenticated:brandContext.authenticated??Boolean(context.authenticated??context.actor),canAccess:brandContext.canAccess,reducedMotion:()=>Boolean(api.reduced?.()),navigate:id=>{
          if(brandContext.navigate)return brandContext.navigate(id);
          if(adapter?.navigate)return adapter.navigate(id);
          const destinations={'profile.account':['account-settings','normal'],'profile.personal':['profile','menu'],'profile.connections':['account-settings','normal'],'manage.delivery':['customer-orders','list'],'manage.payments':['receipt','before'],'manage.quotes':['quote-history','list'],'manage.business':['business-manage','list'],'manage.dashboard':['admin-overview','normal']};
          const route=destinations[id];if(route)api.select(...route);
        },renderPanel:({id,container,signal,push})=>{
          if(brandContext.renderPanel)return brandContext.renderPanel({id,container,signal,push});
          if(adapter?.renderBrandPanel)return adapter.renderBrandPanel({id,container,signal,api});
          if(id==='notifications'){
            container.textContent='알림을 불러오는 중이에요.';
            return request('/notifications').then(result=>{if(signal?.aborted||!alive)return;container.replaceChildren();for(const item of result.items||[]){const row=document.createElement('p');row.textContent=item.title;container.append(row);}if(!result.items?.length)container.textContent='새 알림이 없어요.';}).catch(error=>{if(!signal?.aborted)setStatus(container,message(error),true);});
          }
        }});cleanups.push(()=>menu.destroy());brandPlayers.push(menu);
      }else if(window.Code1Jelly){
        const svg=brand.querySelector('svg.brand-mark');if(!svg)continue;
        const paths=[...svg.querySelectorAll('path')];if(paths.length!==3)continue;paths.forEach((path,index)=>path.setAttribute('data-jelly',String(index)));
        const player=window.Code1Jelly.mount(svg,{auto:!api.reduced?.(),interactive:true,minDelay:10000,maxDelay:15000});if(player){brandPlayers.push(player);cleanups.push(()=>player.destroy());}
      }
    }
    for(const button of all('[data-qa-brand-replay]'))button.onclick=()=>{if(!api.reduced?.())for(const player of brandPlayers)player.gather?.();const source=root.querySelector('[data-component-source] .brand');source?.querySelector('button')?.click();};
    const sourceInfo=window.ORDER_LIBRARY_SOURCE,sourceRoot=$('[data-component-source]');
    if(sourceInfo&&sourceRoot){
      const target=sourceRoot.querySelectorAll(sourceInfo.selector)[sourceInfo.index||0];if(target)target.dataset.componentTarget='';
      if(libraryModule?.mount){
        const sourceApi={...api,screen:sourceInfo.screen,variant:sourceInfo.variant,adapter,
          demoSuccess:()=>api.toast?.('이 기능의 서버 연결을 확인해 주세요.'),
          localState:next=>{sourceRoot.dataset.componentState=next;}};
        try{const dispose=libraryModule.mount(sourceRoot,sourceInfo.state,sourceApi);if(typeof dispose==='function')cleanups.push(dispose);setStatus($('[data-component-runtime]'),'원본 화면과 런타임이 연결됐어요. 변경하려는 상태를 직접 확인해 주세요.');}
        catch{setStatus($('[data-component-runtime]'),'원본 런타임을 연결하지 못했어요. 사용처에서 다시 확인해 주세요.',true);}
      }else setStatus($('[data-component-runtime]'),'이 사용 화면에는 연결된 동작 모듈이 없습니다. 구조와 사용처를 확인할 수 있어요.');
    }
    for(const b of all('[data-qa-go]')){
      if(b.closest('[data-component-source]'))continue;
      b.onclick=()=>api.select(b.dataset.qaGo,b.dataset.qaState||'default');
    }
    for(const b of all('[data-op-route]'))if(!b.closest('[data-component-source]')){b.classList.toggle('active',b.dataset.opRoute===api.screen);b.onclick=()=>api.select(b.dataset.opRoute,'');}
    for(const b of all('[data-action=collapse]'))if(!b.closest('[data-component-source]'))b.onclick=()=>{const shell=b.closest('.ops-page');shell?.classList.toggle('collapsed');b.setAttribute('aria-expanded',String(!shell?.classList.contains('collapsed')));};
    for(const b of all('[data-qa-flip]'))b.onclick=()=>{
      const card=b.closest('[data-pass-card]'),back=card.dataset.face!=='back';card.dataset.face=back?'back':'front';
      for(const control of card.querySelectorAll('[data-qa-flip]')){control.setAttribute('aria-expanded',String(back));control.tabIndex=control.closest('.qa-pass-back')?(back?0:-1):(back?-1:0);}
      card.querySelector('.qa-pass-front').setAttribute('aria-hidden',String(back));card.querySelector('.qa-pass-back').setAttribute('aria-hidden',String(!back));
    };
    if($('[data-qa-art-motion]')){
      const stage=$('[data-qa-art-motion]'),play=$('[data-qa-art-play]'),pause=$('[data-qa-art-pause]'),reset=$('[data-qa-art-reset]'),status=$('[data-qa-art-status-text]');
      const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const reduced=()=>Boolean(api.reduced?.()||preference?.matches);
      let playback='idle';
      const sync=()=>{
        const quiet=reduced();if(quiet)playback='idle';stage.dataset.qaArtStatus=playback;
        play.disabled=quiet||playback==='playing';pause.disabled=quiet||playback!=='playing';reset.disabled=playback==='idle';
        status.textContent=quiet?'모션 줄이기 설정 · 정지 이미지':playback==='playing'?'재생 중':playback==='paused'?'일시정지':'정지 · 재생을 눌러 확인해 주세요.';
      };
      play.onclick=()=>{if(!reduced())playback='playing';sync();};pause.onclick=()=>{playback='paused';sync();};reset.onclick=()=>{playback='idle';sync();};
      preference?.addEventListener?.('change',sync);sync();
      cleanups.push(()=>{preference?.removeEventListener?.('change',sync);stage.dataset.qaArtStatus='idle';});
    }
    if($('[data-bloub-player-slot]')){
      const slot=$('[data-bloub-player-slot]'),upper=$('[data-bloub-upper]'),result=$('[data-bloub-result]'),status=$('[data-bloub-status]'),resultPanel=$('[data-bloub-result-panel]'),preview=$('[data-bloub-preview]');
      let player=null,epoch=0,timer=null,resultShown=false,paused=false;
      const labels={entry:'등장',comparing:'비교 중',delayed:'지연',finishing:'마무리',complete:'견적 완료'};
      const stop=()=>{epoch++;clearInterval(timer);timer=null;player?.destroy();player=null;slot.replaceChildren();preview.dataset.result='false';resultPanel.hidden=true;resultShown=false;paused=false;};
      const play=async(sequence)=>{
        stop();const token=epoch,keys=sequence?[upper.value,'finishing',result.value]:[upper.value];
        const definition=JSON.parse(JSON.stringify(montages[keys[0]]));
        definition.name=keys.map(key=>labels[key]).join(' → ');definition.loop=$('[data-bloub-loop]').checked;
        definition.blocks=keys.flatMap(key=>montages[key].blocks);
        const resultStart=keys.slice(0,-1).flatMap(key=>montages[key].blocks).reduce((total,block)=>total+block.duration,0);
        status.textContent=definition.name;slot.dataset.sequence=keys.join(',');
        try{
          const next=await window.BloubR4.mountBloub(slot,definition,{autoplay:!api.reduced?.(),ariaLabel:definition.name});
          if(token!==epoch){next.destroy();return;}player=next;
          const showResult=()=>{
            if(resultShown)return;resultShown=true;
            const outcome=$('[data-bloub-outcome]').value,template=$('[data-result-template="'+outcome+'"]');
            resultPanel.replaceChildren(template.content.cloneNode(true));resultPanel.hidden=false;preview.dataset.result='true';
            const control=resultPanel.querySelector('[data-result-open]');if(control)control.onclick=()=>api.select('quote-result',outcome);
          };
          if(api.reduced?.()&&sequence){player.seek(player.getState().duration);showResult();}
          timer=setInterval(()=>{if(!player)return;const s=player.getState();status.textContent=definition.name+' · '+s.time.toFixed(1)+' / '+s.duration.toFixed(1)+'초'+(s.blockedBy.includes('reduced-motion')||api.reduced?.()?' · 모션 줄이기 설정':'')+(paused?' · 일시정지':'');if(sequence&&s.time>=resultStart)showResult();else if(definition.loop&&resultShown){resultShown=false;resultPanel.hidden=true;preview.dataset.result='false';}},150);
        }catch{status.textContent='원본 애니메이션을 표시하지 못했어요.';}
      };
      $('[data-bloub-play]').onclick=()=>play(true);$('[data-bloub-single]').onclick=()=>play(false);
      $('[data-bloub-pause]').onclick=()=>{paused=true;player?.pause();status.textContent+=' · 일시정지';};
      $('[data-bloub-reset]').onclick=()=>{stop();status.textContent='재생할 상태를 선택해 주세요.';};
      cleanups.push(stop);
    }
    if($('[data-withdraw-form]')){
      const form=$('[data-withdraw-form]'),reason=$('[name=withdraw-reason]'),note=$('[name=withdraw-note]'),phrase=$('[name=withdraw-phrase]'),proceed=$('[data-withdraw-start]'),dialog=$('[data-withdraw-dialog]'),sheet=dialog.querySelector('[role=dialog]'),confirm=$('[data-withdraw-confirm]');
      let revision=null,open=false,savedInert=[];
      const valid=()=>Boolean(reason.value&&phrase.value==='회원탈퇴'&&(reason.value!=='other'||note.value.trim()));
      const sync=()=>{proceed.disabled=revision===null||!valid();note.required=reason.value==='other';};
      const controller=new AbortController();
      const close=()=>{if(!open||confirm.dataset.busy==='true')return;open=false;motion?.deactivate();dialog.hidden=true;dialog.removeAttribute('open');for(const [el,inert] of savedInert)el.inert=inert;savedInert=[];proceed.focus();};
      const motion=window.ORDER_QA_SHEET?.(sheet,[sheet.querySelector('.sheet-handle')],{signal:controller.signal,reduced:()=>Boolean(api.reduced?.()),close,open:false,surface:dialog.querySelector('.sheet-dim')});
      proceed.onclick=()=>{
        if(!valid()||revision===null||!validate(form))return;open=true;dialog.hidden=false;dialog.setAttribute('open','');sheet.classList.add('is-open');motion?.reset();motion?.activate();
        savedInert=[...dialog.parentElement.children].filter(el=>el!==dialog).map(el=>[el,el.inert]);for(const [el] of savedInert)el.inert=true;sheet.focus();
      };
      for(const button of all('[data-withdraw-dismiss],[data-withdraw-cancel]'))button.onclick=close;
      const keydown=e=>{if(!open)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){
        const targets=[...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];if(!targets.length){e.preventDefault();return;}
        if(e.shiftKey&&(document.activeElement===targets[0]||document.activeElement===sheet)){e.preventDefault();targets.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===targets.at(-1)){e.preventDefault();targets[0].focus();}
      }};
      document.addEventListener('keydown',keydown);form.addEventListener('input',sync);form.addEventListener('change',sync);form.onsubmit=e=>e.preventDefault();
      confirm.onclick=guard(null,confirm,$('[data-withdraw-dialog-status]'),async()=>{
        if(!valid()||revision===null)return;
        const result=await mutate('/account',{expectedRevision:revision,action:'withdraw',reason:reason.value,note:note.value,phrase:phrase.value});
        if(!alive)return;if(result.state!=='WITHDRAWN')throw Error('WITHDRAWAL_NOT_CONFIRMED');revision=result.revision;api.select('account-settings','closed');
      });
      request('/account').then(result=>{if(!alive)return;revision=result.revision;const box=$('.mf-withdraw-box');if(box){const title=box.querySelector('h2'),email=box.querySelector('p');if(title)title.textContent=result.profile?.name||'내 계정';if(email)email.textContent=result.profile?.email||'';}sync();}).catch(error=>setStatus($('[data-withdraw-status]'),message(error),true));
      sync();cleanups.push(()=>{controller.abort();motion?.deactivate();document.removeEventListener('keydown',keydown);for(const [el,inert] of savedInert)el.inert=inert;});
    }
    if($('[data-pass-card]')){
      loadPurchases().then(result=>{
        if(!alive)return;const order=result.items?.find(item=>item.id===adapter.selectedPurchaseId);
        if(!order){setStatus($('[data-delivery-status]'),'주문을 선택하면 오더패스에 납품 정보가 표시돼요.');return;}
        setStatus($('[data-delivery-status]'),'저장된 주문의 납품 정보입니다.');
        const values={date:order.date,status:order.status,target:order.target,product:order.product,quantity:order.quantity+'판',amount:order.total.toLocaleString('ko-KR')+'원',payment:order.paid>=order.total?'결제 확인':'결제 대기'};
        for(const [key,value] of Object.entries(values))for(const node of all('[data-pass-'+key+']'))node.textContent=value;
      }).catch(error=>setStatus($('[data-delivery-status]'),message(error),true));
      for(const b of all('[data-mf-go],[data-mf-state]'))b.onclick=()=>{const dest=(b.dataset.mfGo||'').split('/');api.select(dest[0]||api.screen,b.dataset.mfState||dest[1]||'default');};
      for(const form of all('form'))form.onsubmit=e=>e.preventDefault();
      for(const b of all('[data-mf-action=validate]'))b.onclick=()=>{if(!validate(b.closest('form')))return;api.select('store-purchase','select');};
    }
    if($('[data-qa-sales]')){
      const section=$('[data-qa-sales]'),channel=section.dataset.salesChannel;
      const period=$('[data-sales-period]'),from=$('[data-sales-from]'),to=$('[data-sales-to]'),query=$('[data-sales-search]');
      const keys=['orders','trays','ordered','paid','cancelled','refunded','net','unpaid'],labels={orders:'주문',trays:'판수',ordered:'주문 금액',paid:'결제 금액',cancelled:'취소 금액',refunded:'환불 금액',net:'순매출',unpaid:'미입금'};
      let source=null;
      const blank=()=>Object.fromEntries(keys.map(key=>[key,0]));
      const format=(value,key)=>Number(value).toLocaleString('ko-KR')+(key==='orders'?'건':key==='trays'?'판':'원');
      const calculate=order=>{const trays=Number(order.trays??order.quantity)||0,ordered=Number(order.total??trays*order.unitPrice)||0,cancelled=(Number(order.cancelledTrays)||0)*Number(order.unitPrice),paid=Number(order.paid)||0,refunded=Number(order.refunded)||0,net=paid-refunded;return {orders:1,trays,ordered,paid,cancelled,refunded,net,unpaid:Math.max(0,ordered-cancelled-net)};};
      const cell=(row,value,label,tag='td')=>{const el=document.createElement(tag);el.textContent=value;if(label)el.dataset.label=label;row.append(el);return el;};
      const render=()=>{
        if(!source)return;
        const invalid=Boolean(from.value&&to.value&&from.value>to.value),term=query.value.trim().toLocaleLowerCase('ko-KR');
        $('[data-sales-error]').hidden=!invalid;fieldError(from,invalid?'시작일과 종료일을 확인해 주세요.':'');
        const selected=invalid?[]:source.filter(order=>(channel==='campaign'?order.channel==='campaign':['business','store','farm'].includes(order.channel))&&(!from.value||order.date>=from.value)&&(!to.value||order.date<=to.value)&&(!term||[order.id,order.targetId,order.target].join(' ').toLocaleLowerCase('ko-KR').includes(term)));
        const total=blank(),groups=new Map();for(const order of selected){if(!groups.has(order.targetId))groups.set(order.targetId,{id:order.targetId,name:order.target,...blank()});const amounts=calculate(order),group=groups.get(order.targetId);for(const key of keys){total[key]+=amounts[key];group[key]+=amounts[key];}}
        const rows=$('[data-sales-rows]');rows.replaceChildren();
        for(const group of [...groups.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
          const tr=document.createElement('tr');tr.dataset.salesTarget=group.id;
          const target=cell(tr,'',channel==='campaign'?'공동구매 회차':'사업장');target.className='ops-primary-cell';
          const open=document.createElement('button');open.type='button';open.className='btn text';open.textContent=group.name;open.onclick=()=>{query.value=group.id;shared?.syncField(query);render();};target.append(open);
          const id=document.createElement('small');id.textContent=group.id;target.append(id);
          for(const key of keys){const td=cell(tr,format(group[key],key),labels[key]);td.dataset.salesValue=key;}rows.append(tr);
        }
        for(const key of keys){$('[data-sales-total='+key+']').textContent=format(total[key],key);const metric=$('[data-sales-metric='+key+']');if(metric)metric.textContent=format(total[key],key);}
        $('[data-sales-count]').textContent=invalid?'집계 기간을 확인해 주세요.':groups.size+'개 '+(channel==='campaign'?'공동구매 회차':'사업장')+' · '+format(total.orders,'orders')+' · '+format(total.trays,'trays');
        $('[data-sales-empty]').hidden=invalid||selected.length>0;
        const detail=$('[data-sales-source-rows]');detail.replaceChildren();
        for(const order of selected.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))){
          const tr=document.createElement('tr'),id=cell(tr,'','주문');id.className='ops-primary-cell';const button=document.createElement('button');button.type='button';button.className='btn text';button.textContent=order.id;button.onclick=()=>{adapter.selectedPurchaseId=order.id;api.select('admin-orders','detail');};id.append(button);
          for(const [value,label] of [[order.date,'주문일'],[order.target,'대상'],[format(order.trays??order.quantity,'trays'),'판수'],[format(order.unitPrice,'price'),'판당 단가'],[format(order.paid,'paid'),'결제'],[format(order.cancelledTrays,'trays'),'취소 판수'],[format(order.refunded,'refunded'),'환불']])cell(tr,value,label);detail.append(tr);
        }
        applyShared(section);
      };
      const setPeriod=()=>{const now=new Date(context.now||Date.now());if(period.value==='all'){from.value='';to.value='';}else if(['month','previous'].includes(period.value)){const month=now.getUTCMonth()-(period.value==='previous'?1:0);from.value=new Date(Date.UTC(now.getUTCFullYear(),month,1)).toISOString().slice(0,10);to.value=new Date(Date.UTC(now.getUTCFullYear(),month+1,0)).toISOString().slice(0,10);}shared?.syncField(from);shared?.syncField(to);render();};
      period.onchange=setPeriod;for(const input of [from,to]){input.oninput=()=>{period.value='custom';render();};input.onchange=input.oninput;}query.oninput=render;setPeriod();
      request('/sales').then(result=>{if(!alive)return;source=result.items||[];setStatus($('[data-sales-provenance]'),context.mode==='lab'?'QA 실행에서 저장한 주문·결제 내역입니다. 운영 매출과 분리됩니다.':'저장된 주문과 확인된 결제·환불 내역입니다.');render();}).catch(error=>setStatus($('[data-sales-provenance]'),message(error),true));
    }
    if($('[data-revenue-form]')){
      const rows=$('[data-contributors]'),form=$('[data-revenue-form]'),sum=$('[data-rate-sum]'),save=$('[data-revenue-apply]'),note=$('[data-revenue-note]');let serial=0,revision=null;form.inert=true;
      const recalc=()=>{
        const gross=Number($('[name=gross]').value)||0,cost=Number($('[name=cost]').value)||0,base=Math.max(0,gross-cost);
        let total=0;for(const row of rows.children){const rate=Number(row.querySelector('[data-rate]').value)||0;total+=Math.round(rate*100);row.querySelector('output').textContent=Math.floor(base*rate/100).toLocaleString('ko-KR')+'원';}
        sum.textContent='배분율 '+(total/100)+'% · 예상 배분 기준액 '+base.toLocaleString('ko-KR')+'원';sum.dataset.valid=String(total===10000);save.disabled=revision===null||total!==10000;
        $('[data-referral-status]').textContent=$('[name=initial-referral]').checked?'첫 기여자 코드 자동 적용':'첫 기여자 코드 자동 적용 안 함';
      };
      const add=(value={name:'',code:'',rate:0})=>{
        serial++;const row=document.createElement('tr');
        for(const [key,label,type] of [['name','기여자 이름','text'],['code','레퍼럴 코드','text'],['rate','배분율','number']]){
          const td=document.createElement('td');td.dataset.label=label;
          td.innerHTML=shared.field(label,'contributor-'+key+'-'+serial,'',{type,value:value[key],required:key!=='code',max:80,...(type==='number'?{min:0,maximum:100,step:.01}:{})});
          td.querySelector('input').dataset[key]='';row.append(td);
        }
        const amount=document.createElement('td');amount.dataset.label='계산 금액';amount.append(document.createElement('output'));row.append(amount);
        const action=document.createElement('td');action.dataset.label='관리';action.innerHTML=shared.button('삭제','remove-contributor','text');action.querySelector('button').onclick=()=>{row.remove();recalc();};row.append(action);rows.append(row);applyShared(row);recalc();
      };
      const addButton=$('[data-contributor-add]');addButton.disabled=true;addButton.onclick=()=>add();form.oninput=recalc;form.onchange=recalc;
      bindForm(form,save,async()=>{
        const data={initialReferral:$('[name=initial-referral]').checked,contributors:[...rows.children].map(row=>({name:row.querySelector('[data-name]').value.trim(),code:row.querySelector('[data-code]').value.trim(),rate:Number(row.querySelector('[data-rate]').value)}))};
        const result=await mutate('/revenue',{expectedRevision:revision,data});if(!alive)return;revision=result.revision;setStatus(note,'수익 배분 설정을 저장했어요.');
      },note);
      request('/revenue').then(result=>{if(!alive)return;revision=result.revision;form.inert=false;$('[name=initial-referral]').checked=Boolean(result.data.initialReferral);for(const value of result.data.contributors||[])add(value);if(!rows.children.length)add();addButton.disabled=false;setStatus(note,result.revision?'저장된 수익 배분 설정입니다.':'배분율과 기여자를 입력해 주세요.');recalc();}).catch(error=>setStatus(note,message(error),true));
    }
    if($('[data-purchase-operations]')){
      const section=$('[data-purchase-operations]'),form=$('[data-order-form]'),select=$('[data-order-select]'),status=$('[data-order-status]'),reference=$('[name=cash-reference]'),documents=$('[data-order-documents]');
      let orders=[],capabilities={};const current=()=>orders.find(item=>item.id===select.value);
      const statusNames={AWAITING_CASH:'입금 확인 대기',AWAITING_CARD:'카드 결제 대기',PAID:'결제 확인',DISPATCHED:'배송 중',RECEIVED:'납품 완료',CANCELLED:'취소'};
      const allowed=item=>{
        if(!item)return [];
        if(Array.isArray(item.actions))return item.actions;
        const actions=[];if(capabilities.confirmCash&&item.status==='AWAITING_CASH')actions.push('confirm-cash');if(capabilities.create&&item.status==='AWAITING_CARD')actions.push('card');if(capabilities.receive&&item.status==='DISPATCHED')actions.push('receive');if(capabilities.cancel&&['AWAITING_CASH','AWAITING_CARD'].includes(item.status))actions.push('cancel');return actions;
      };
      const sync=()=>{const item=current(),actions=allowed(item);section.hidden=!orders.length;form.inert=!item;
        if(item){$('[data-order-product]').textContent=item.product;$('[data-order-state]').textContent=statusNames[item.status]||item.status;$('[data-order-amount]').textContent=item.total.toLocaleString('ko-KR')+'원';$('[data-order-paid]').textContent=item.paid.toLocaleString('ko-KR')+'원';}
        for(const button of section.querySelectorAll('[data-order-action]')){button.hidden=!actions.includes(button.dataset.orderAction);button.disabled=button.hidden;}
        const cash=actions.includes('confirm-cash');$('[data-cash-reference]').hidden=!cash;reference.required=cash;reference.disabled=!cash;$('[data-order-documents-open]').disabled=!item;
      };
      const render=()=>{const selected=select.value||adapter?.selectedPurchaseId;select.replaceChildren();for(const item of orders){const option=document.createElement('option');option.value=item.id;option.textContent=item.product+' · '+(statusNames[item.status]||item.status)+' · '+item.id;select.append(option);}if(orders.some(item=>item.id===selected))select.value=selected;sync();};
      select.onchange=()=>{adapter.selectedPurchaseId=select.value;reference.value='';shared?.syncField(reference);documents.hidden=true;sync();};
      for(const button of section.querySelectorAll('[data-order-action]'))button.onclick=guard(form,button,status,async()=>{
        const item=current(),action=button.dataset.orderAction;if(!item||!allowed(item).includes(action))return;
        const result=await mutate('/purchases',{action,id:item.id,expectedRevision:item.revision,...(action==='confirm-cash'?{reference:reference.value.trim()}:{})});if(!alive)return;
        orders=orders.map(old=>old.id===result.item.id?result.item:old);adapter.selectedPurchaseId=result.item.id;documents.hidden=true;setStatus(status,action==='confirm-cash'?'입금을 확인했어요.':action==='receive'?'수령 확인을 저장했어요.':action==='cancel'?'주문을 취소했어요.':'결제 결과를 확인했어요.');
        // Actions are server-owned and refreshed after every successful transition.
        try{const latest=await request('/purchases');if(!alive)return;orders=latest.items||[];capabilities=latest.capabilities||{};}catch{setStatus(status,'처리는 저장됐지만 새 목록을 불러오지 못했어요. 화면을 다시 열어 확인해 주세요.');}render();
      });
      form.onsubmit=e=>e.preventDefault();root.addEventListener('order-app-operation-end',sync);cleanups.push(()=>root.removeEventListener('order-app-operation-end',sync));
      $('[data-order-documents-open]').onclick=guard(null,$('[data-order-documents-open]'),status,async()=>{
        const item=current();if(!item)return;const result=await request('/documents/'+item.id);if(!alive)return;
        const order=result.order||item;for(const [key,value] of Object.entries({id:item.id,product:order.product||item.product,quantity:(order.quantity??item.quantity)+'판',total:(order.total??item.total).toLocaleString('ko-KR')+'원',payment:result.receipt?(result.receipt.paid??item.paid).toLocaleString('ko-KR')+'원 · 영수증 발급':'결제 확인 전 · 견적서'}))$('[data-document-'+key+']').textContent=value;
        documents.hidden=false;
      });
      loadPurchases().then(result=>{if(!alive)return;orders=result.items||[];capabilities=result.capabilities||{};render();}).catch(error=>{section.hidden=false;setStatus(status,message(error),true);form.inert=true;});
    }
    if($('[data-purchase-form]')){
      const form=$('[data-purchase-form]'),select=$('[data-purchase-offer]'),unit=$('[name=unit-price]'),quantity=$('[name=quantity]'),save=$('[data-purchase-confirm]'),status=$('[data-purchase-status]');
      let offers=[],quote=null,requestEpoch=0,loaded=false;form.inert=true;
      const selected=()=>offers.find(offer=>offer.id===select.value);
      const recalc=()=>{
        requestEpoch++;quote=null;const offer=selected();unit.value=offer?.unitPrice??'';quantity.min=String(offer?.minQuantity||1);shared?.syncField(unit);
        const amount=offer?Number(offer.unitPrice)*Number(quantity.value):null;
        $('[data-purchase-total]').textContent=amount===null?'—':amount.toLocaleString('ko-KR')+'원 (예상)';for(const output of all('[data-same-price]'))output.textContent=amount===null?'—':amount.toLocaleString('ko-KR')+'원 (예상)';
        $('[data-purchase-origin]').textContent=offer?'출고처 · '+offer.shipmentOrigin:'';save.disabled=!loaded||!offer;const label=save.querySelector('[data-magnetic-label]')||save;label.textContent='금액 확인';
      };
      form.oninput=recalc;form.onchange=recalc;
      select.onchange=()=>{const offer=selected();if(offer&&Number(quantity.value)<offer.minQuantity)quantity.value=String(offer.minQuantity);shared?.syncField(quantity);recalc();};
      bindForm(form,save,async()=>{
        const offer=selected();if(!offer)return;const count=Number(quantity.value);
        if(!quote){
          const epoch=requestEpoch;
          const result=await mutate('/purchase-quote',{offerId:offer.id,quantity:count,expectedRevision:0});if(!alive||epoch!==requestEpoch)return;
          quote=result;unit.value=String(result.unitPrice);shared?.syncField(unit);$('[data-purchase-total]').textContent=result.total.toLocaleString('ko-KR')+'원';for(const output of all('[data-same-price]'))output.textContent=result.total.toLocaleString('ko-KR')+'원';
          const label=save.querySelector('[data-magnetic-label]')||save;label.textContent='주문 확정';setStatus(status,'금액을 확인한 뒤 주문을 확정해 주세요.');return;
        }
        let result;
        try{result=await mutate('/purchases',{action:'create',expectedRevision:0,offerId:offer.id,quantity:count,paymentMethod:$('[name=payment]:checked').value,channel:'store',acceptedQuoteId:quote.quoteId,serviceDate:quote.serviceDate});}
        catch(error){if(['QUOTE_EXPIRED','QUOTE_EXPIRED_OR_CHANGED','QUOTE_INPUT_CHANGED','OFFER_UNAVAILABLE'].includes(error.code||error.message)){quote=null;(save.querySelector('[data-magnetic-label]')||save).textContent='금액 확인';}throw error;}
        if(!alive)return;adapter.selectedPurchaseId=result.item.id;api.select('store-purchase',result.item.paymentMethod==='card'?'card':'cash');
      },status);
      loadPurchases().then(result=>{if(!alive)return;offers=result.offers||[];form.inert=false;select.replaceChildren();for(const offer of offers){const option=document.createElement('option');option.value=offer.id;option.textContent=offer.label;select.append(option);}loaded=true;if(result.capabilities?.create===false){form.hidden=true;}if(offers.length){quantity.value=String(Math.max(Number(quantity.value)||1,offers[0].minQuantity));shared?.syncField(quantity);}recalc();setStatus(status,offers.length?'상품과 판수를 선택해 금액을 확인해 주세요.':result.capabilities?.create===false?'주문 목록에서 처리할 주문을 선택해 주세요.':'구매할 수 있는 승인 상품이 없습니다.');}).catch(error=>setStatus(status,message(error),true));
    }
    if($('[data-purchase-detail]')){
      const status=$('[data-purchase-status]'),pay=$('[data-purchase-card]');let order=null;
      const render=()=>{if(!order)return;$('[data-purchase-title]').textContent=order.product;$('[data-purchase-id]').textContent=order.id;$('[data-purchase-amount]').textContent=order.total.toLocaleString('ko-KR')+'원';$('[data-purchase-state]').textContent=({AWAITING_CASH:'입금 확인 대기',AWAITING_CARD:'카드 결제 대기',PAID:'결제 확인',DISPATCHED:'배송 중',RECEIVED:'납품 완료',CANCELLED:'취소'})[order.status]||order.status;if(pay)pay.disabled=order.status!=='AWAITING_CARD';};
      loadPurchases().then(result=>{if(!alive)return;order=result.items.find(item=>item.id===adapter.selectedPurchaseId);if(!order){setStatus(status,'주문을 먼저 선택해 주세요.');return;}render();setStatus(status,'저장된 주문 정보입니다.');}).catch(error=>setStatus(status,message(error),true));
      if(pay)pay.onclick=guard(null,pay,status,async()=>{if(!order)return;const result=await mutate('/purchases',{action:'card',id:order.id,expectedRevision:order.revision});if(!alive)return;order=result.item;render();setStatus(status,'결제 결과를 확인했어요.');});
    }
    if($('[data-email-editor]')){
      const form=$('[data-email-editor]'),subject=$('[data-email-subject]'),body=$('[data-email-body]'),save=$('[data-email-save]'),status=$('[data-email-status]');let revision=null,templates=[];form.inert=true;
      const render=()=>{$('[data-email-preview-subject]').textContent=subject.value;$('[data-email-preview-body]').textContent=body.value;};
      form.oninput=render;
      bindForm(form,save,async()=>{
        const data={templates:[...templates.filter(template=>template.id!==form.dataset.emailKind),{id:form.dataset.emailKind,subject:subject.value,body:body.value}]};
        const result=await mutate('/email-templates',{expectedRevision:revision,data});if(!alive)return;revision=result.revision;templates=result.data.templates;setStatus(status,'이메일 양식을 저장했어요.');
      },status);
      request('/email-templates').then(result=>{if(!alive)return;revision=result.revision;form.inert=false;templates=result.data.templates||[];const template=templates.find(item=>item.id===form.dataset.emailKind);subject.value=template?.subject||'';body.value=template?.body||'';shared?.syncField(subject);shared?.syncField(body);save.disabled=false;render();setStatus(status,template?'저장된 이메일 양식입니다.':'새 이메일 양식을 작성해 주세요.');}).catch(error=>setStatus(status,message(error),true));
    }
    if($('[data-shipment-form]')){
      const form=$('[data-shipment-form]'),select=$('[data-shipment-order]'),method=$('[name=shipment-method]'),tracking=$('[name=tracking-number]'),state=$('[name=shipment-status]'),save=$('[data-shipment-apply]'),status=$('[data-shipment-summary]');let orders=[];form.inert=true;
      const order=()=>orders.find(item=>item.id===select.value);
      const sync=()=>{const item=order();tracking.required=method.value==='parcel';save.disabled=!item||item.status!=='PAID'||state.value!=='dispatched';};
      select.onchange=()=>{const item=order();if(item){adapter.selectedPurchaseId=item.id;method.value=item.carrier||'farm';tracking.value=item.tracking||'';state.value=({DISPATCHED:'dispatched',RECEIVED:'delivered'})[item.status]||'packing';shared?.syncField(tracking);setStatus(status,item.product+' · '+item.id+' · '+({PAID:'결제 확인',AWAITING_CASH:'입금 확인 대기',DISPATCHED:'배송 중',RECEIVED:'납품 완료'})[item.status]);}sync();};
      method.onchange=sync;state.onchange=sync;root.addEventListener('order-app-operation-end',sync);cleanups.push(()=>root.removeEventListener('order-app-operation-end',sync));
      bindForm(form,save,async()=>{const item=order();if(!item)return;const result=await mutate('/purchases',{action:'dispatch',id:item.id,expectedRevision:item.revision,carrier:method.value,tracking:tracking.value});if(!alive)return;orders=orders.map(old=>old.id===result.item.id?result.item:old);setStatus(status,'배송 정보를 저장했어요.');sync();},status);
      loadPurchases().then(result=>{if(!alive)return;orders=result.items||[];form.inert=false;select.replaceChildren();for(const item of orders){const option=document.createElement('option');option.value=item.id;option.textContent=item.product+' · '+item.id;select.append(option);}if(orders.some(item=>item.id===adapter.selectedPurchaseId))select.value=adapter.selectedPurchaseId;if(orders.length)select.onchange();else setStatus(status,'배송할 주문이 없습니다.');}).catch(error=>setStatus(status,message(error),true));
      for(const b of all('[data-action=confirm-dispatch]'))b.onclick=()=>{state.value='dispatched';sync();save.click();};
    }
    applyShared(root);
    return ()=>{alive=false;cleanups.forEach(f=>f());};
  }
  const ids=['component-library','admin-revenue-rules','member-email-templates','store-purchase','delivery-request','account-settings','admin-shipments','supplier-shipments','admin-analytics'];
  window.ORDER_DESIGN_MODULES=[...(window.ORDER_DESIGN_MODULES||[]).filter(module=>!ids.includes(module.id)),...ids.map(id=>({id,mount(root,state,api){return mount(root,state,api);}}))];
}
