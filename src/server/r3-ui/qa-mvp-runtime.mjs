// Isolated review interactions. This runtime intentionally has no network or account access.
export function registerQaMvp(montages={}) {
  function mount(root,state,api){
    const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
    const cleanups=[];
    // Opaque QA frames deliberately disallow native form submission. Review-only
    // actions validate locally and activate directly from their button or Enter.
    const localForm=(form,button,run)=>{
      const activate=()=>{if(!button.disabled&&form.reportValidity())run();};
      button.onclick=activate;form.onsubmit=event=>event.preventDefault();
      const onKey=event=>{
        if(event.key!=='Enter'||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!event.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=button])'))return;
        event.preventDefault();activate();
      };
      form.addEventListener('keydown',onKey);cleanups.push(()=>form.removeEventListener('keydown',onKey));
      return activate;
    };
    const brandPlayers=[];
    if(window.Code1Jelly)for(const svg of all('svg.brand-mark,svg[data-code1-jelly]')){
      const paths=[...svg.querySelectorAll('path')];if(paths.length!==3)continue;
      paths.forEach((path,index)=>path.setAttribute('data-jelly',String(index)));
      const player=window.Code1Jelly.mount(svg,{auto:!api.reduced?.(),interactive:false,minDelay:10000,maxDelay:15000});
      if(player){brandPlayers.push(player);cleanups.push(()=>player.destroy());}
    }
    for(const replay of all('[data-qa-brand-replay]'))replay.onclick=()=>{if(!api.reduced?.())brandPlayers.forEach(player=>player.gather());};
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
    for(const b of all('[data-qa-go]')){
      b.onclick=()=>api.select(b.dataset.qaGo,b.dataset.qaState||'default');
      if(b.tagName!=='BUTTON')b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}};
    }
    for(const b of all('[data-qa-flip]'))b.onclick=()=>{
      const card=b.closest('[data-pass-card]'),back=card.dataset.face!=='back';card.dataset.face=back?'back':'front';
      for(const control of card.querySelectorAll('[data-qa-flip]')){control.setAttribute('aria-expanded',String(back));control.tabIndex=control.closest('.mvp-pass-back')?(back?0:-1):(back?-1:0);}
      card.querySelector('.mvp-pass-front').setAttribute('aria-hidden',String(back));card.querySelector('.mvp-pass-back').setAttribute('aria-hidden',String(!back));
    };
    if($('[data-withdraw-form]')){
      const form=$('[data-withdraw-form]'),reason=$('[name=withdraw-reason]'),note=$('[name=withdraw-note]'),phrase=$('[name=withdraw-phrase]'),proceed=$('[data-withdraw-start]'),dialog=$('[data-withdraw-dialog]');
      const valid=()=>Boolean(reason.value&&phrase.value==='회원탈퇴'&&(reason.value!=='other'||note.value.trim()));
      const sync=()=>{proceed.disabled=!valid();note.required=reason.value==='other';};
      form.addEventListener('input',sync);form.addEventListener('change',sync);form.onsubmit=e=>e.preventDefault();
      proceed.onclick=()=>{if(!valid())return;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');};
      $('[data-withdraw-cancel]').onclick=()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open');proceed.focus();};
      $('[data-withdraw-confirm]').onclick=()=>{if(valid())api.select('account-settings','closed');};sync();
    }
    if($('[data-pass-card]')){
      for(const b of all('[data-mf-go],[data-mf-state]'))b.onclick=()=>{
        const dest=(b.dataset.mfGo||'').split('/');api.select(dest[0]||api.screen,b.dataset.mfState||b.dataset.mfGo?.split('/')[1]||'default');
      };
      for(const form of all('form'))form.onsubmit=e=>e.preventDefault();
      for(const b of all('[data-mf-action=validate]'))b.onclick=()=>{
        const form=b.closest('form');if(form&&!form.reportValidity())return;
        const [screen,next]=(b.dataset.mfSuccess||'delivery-request/submitted').split('/');api.select(screen,next);
      };
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
    if($('[data-qa-sales]')){
      const section=$('[data-qa-sales]'),source=JSON.parse(section.dataset.salesFixture),channel=section.dataset.salesChannel;
      const period=$('[data-sales-period]'),from=$('[data-sales-from]'),to=$('[data-sales-to]'),query=$('[data-sales-search]');
      const keys=['orders','trays','ordered','paid','cancelled','refunded','net','unpaid'];
      const blank=()=>Object.fromEntries(keys.map(key=>[key,0]));
      const format=(value,key)=>value.toLocaleString('ko-KR')+(key==='orders'?'건':key==='trays'?'판':'원');
      const calculate=order=>{
        const ordered=order.trays*order.unitPrice,cancelled=order.cancelledTrays*order.unitPrice,net=order.paid-order.refunded;
        return {orders:1,trays:order.trays,ordered,paid:order.paid,cancelled,refunded:order.refunded,net,unpaid:Math.max(0,ordered-cancelled-net)};
      };
      const cell=(row,value,tag='td')=>{const el=document.createElement(tag);el.textContent=value;row.append(el);return el;};
      const render=()=>{
        const invalid=Boolean(from.value&&to.value&&from.value>to.value),term=query.value.trim().toLocaleLowerCase('ko-KR');
        $('[data-sales-error]').hidden=!invalid;
        const selected=invalid?[]:source.filter(order=>order.channel===channel&&(!from.value||order.date>=from.value)&&(!to.value||order.date<=to.value)&&(!term||[order.id,order.targetId,order.target].join(' ').toLocaleLowerCase('ko-KR').includes(term)));
        const total=blank(),groups=new Map();
        for(const order of selected){
          if(!groups.has(order.targetId))groups.set(order.targetId,{id:order.targetId,name:order.target,...blank()});
          const amounts=calculate(order),group=groups.get(order.targetId);
          for(const key of keys){total[key]+=amounts[key];group[key]+=amounts[key];}
        }
        const rows=$('[data-sales-rows]');rows.replaceChildren();
        for(const group of [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id))){
          const tr=document.createElement('tr');tr.dataset.salesTarget=group.id;
          const target=cell(tr,group.name,'th');target.scope='row';const id=document.createElement('small');id.textContent=group.id;target.append(id);
          for(const key of keys){const td=cell(tr,format(group[key],key));td.dataset.salesValue=key;}rows.append(tr);
        }
        for(const key of keys){$('[data-sales-total='+key+']').textContent=format(total[key],key);const metric=$('[data-sales-metric='+key+']');if(metric)metric.textContent=format(total[key],key);}
        $('[data-sales-count]').textContent=invalid?'집계 기간을 확인해 주세요.':groups.size+'개 '+(channel==='campaign'?'공동구매 회차':'사업장')+' · '+format(total.orders,'orders')+' · '+format(total.trays,'trays');
        $('[data-sales-empty]').hidden=invalid||selected.length>0;
        const detail=$('[data-sales-source-rows]');detail.replaceChildren();
        for(const order of selected.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))){
          const tr=document.createElement('tr');for(const value of [order.id,order.date,order.target,format(order.trays,'trays'),format(order.unitPrice,'unitPrice'),format(order.paid,'paid'),format(order.cancelledTrays,'trays'),format(order.refunded,'refunded')])cell(tr,value);detail.append(tr);
        }
      };
      period.onchange=()=>{if(period.value==='all'){from.value='';to.value='';}else if(period.value!=='custom'){from.value=period.value+'-01';to.value=period.value+(period.value==='2026-11'?'-30':'-31');}render();};
      for(const input of [from,to]){input.oninput=()=>{period.value='custom';render();};input.onchange=input.oninput;}
      query.oninput=render;render();
    }
    if($('[data-revenue-form]')){
      const rows=$('[data-contributors]'),form=$('[data-revenue-form]'),sum=$('[data-rate-sum]');let serial=0;
      const recalc=()=>{
        const gross=Number($('[name=gross]').value)||0,cost=Number($('[name=cost]').value)||0,base=Math.max(0,gross-cost);
        let total=0;for(const row of rows.children){const rate=Number(row.querySelector('[data-rate]').value)||0;total+=rate;row.querySelector('output').textContent=Math.floor(base*rate/100).toLocaleString('ko-KR')+'원';}
        sum.textContent='배분율 '+total+'% · 배분 기준액 '+base.toLocaleString('ko-KR')+'원';sum.dataset.valid=String(Math.abs(total-100)<.00001);$('[data-revenue-apply]').disabled=Math.abs(total-100)>.00001;
      };
      const add=()=>{
        serial++;const row=document.createElement('tr');
        for(const [field,label,type,value] of [['name','기여자 이름','text',''],['code','레퍼럴 코드','text',''],['rate','배분율','number','0']]){
          const td=document.createElement('td'),input=document.createElement('input');input.type=type;input.value=value;input.setAttribute('aria-label',label+' '+serial);input.dataset[field]='';
          input.required=field!=='code';
          if(type==='number'){input.min='0';input.max='100';input.step='0.1';}else input.maxLength=80;td.append(input);row.append(td);
        }
        const amount=document.createElement('td');amount.append(document.createElement('output'));row.append(amount);
        const td=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.onclick=()=>{row.remove();recalc();};td.append(remove);row.append(td);rows.append(row);recalc();
      };
      $('[data-contributor-add]').onclick=add;form.oninput=recalc;
      localForm(form,$('[data-revenue-apply]'),()=>{$('[data-revenue-note]').textContent='이 검토 화면에 설정을 반영했어요. 운영 적용과 정산 확정은 관리자 승인 후 진행합니다.';});add();
      $('[name=initial-referral]').onchange=e=>{$('[data-referral-status]').textContent=e.target.checked?'첫 기여자 코드 자동 적용':'첫 기여자 코드 자동 적용 안 함';};
    }
    if($('[data-purchase-form]')){
      const form=$('[data-purchase-form]'),output=$('[data-purchase-total]');
      const recalc=()=>{const amount=(Number($('[name=unit-price]').value)||0)*(Number($('[name=quantity]').value)||0);output.textContent=amount.toLocaleString('ko-KR')+'원';for(const n of all('[data-same-price]'))n.textContent=output.textContent;};
      form.oninput=recalc;localForm(form,$('[data-purchase-confirm]'),()=>{const method=$('[name=payment]:checked')?.value;api.select('store-purchase',method==='card'?'card':'cash');});recalc();
    }
    if($('[data-email-editor]')){
      const render=()=>{$('[data-email-preview-subject]').textContent=$('[name=email-subject]').value;$('[data-email-preview-body]').textContent=$('[name=email-body]').value;};
      $('[data-email-editor]').oninput=render;render();
    }
    if($('[data-shipment-form]')){
      const form=$('[data-shipment-form]'),method=$('[name=shipment-method]'),tracking=$('[name=tracking-number]');
      method.onchange=()=>{tracking.required=method.value==='parcel';};
      const reflect=()=>{
        $('[data-shipment-summary]').textContent='검토 반영 · 합천 농장 · '+method.selectedOptions[0].textContent+' · '+$('[name=shipment-status]').selectedOptions[0].textContent+' · '+(tracking.value.trim()||'송장 미사용');
      };
      localForm(form,$('[data-shipment-apply]'),reflect);
      if(api.screen==='supplier-shipments'){
        for(const b of all('[data-op-route]'))b.onclick=()=>api.select(b.dataset.opRoute,'');
        for(const b of all('[data-action=list],[data-action=damage]'))b.onclick=()=>api.select(api.screen,b.dataset.action);
        const dispatch=$('[data-action=confirm-dispatch]');if(dispatch)dispatch.onclick=()=>{
          if(!form.reportValidity())return;$('[name=shipment-status]').value='dispatched';reflect();
        };
      }
    }
    return ()=>cleanups.forEach(f=>f());
  }
  const ids=['component-library','admin-revenue-rules','member-email-templates','store-purchase','delivery-request','account-settings','admin-shipments','supplier-shipments','admin-analytics'];
  const prior=new Map((window.ORDER_DESIGN_MODULES||[]).map(module=>[module.id,module]));
  window.ORDER_DESIGN_MODULES=[...(window.ORDER_DESIGN_MODULES||[]).filter(m=>!ids.includes(m.id)),...ids.map(id=>({id,mount(root,state,api){
    const old=['admin-shipments','supplier-shipments'].includes(id)?prior.get(id)?.mount?.(root,state,api):null;
    const current=mount(root,state,api);return ()=>{if(typeof old==='function')old();current();};
  }}))];
}
