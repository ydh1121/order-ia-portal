// QA-only asset and animation players. Product modules are captured, not copied.
export function registerQaShowcase(montages={}){
  const previous=new Map((window.ORDER_DESIGN_MODULES||[]).map(module=>[module.id,module]));
  const libraryModule=window.ORDER_LIBRARY_SOURCE?previous.get(window.ORDER_LIBRARY_SOURCE.screen):null;
  const productModule=previous.get('store-purchase');
  function mount(root,state,api){
    const owned=element=>{const source=element.closest('[data-component-source]');return !source||source===root;};
    const all=selector=>[...root.querySelectorAll(selector)].filter(owned),$=selector=>all(selector)[0]||null;
    const cleanups=[],adapter=api.adapter||window.ORDER_APP_ADAPTER;
    const setStatus=(element,text,error=false)=>{if(!element)return;element.textContent=text;element.classList.toggle('field-error',error);element.setAttribute('role',error?'alert':'status');};
    const dispose=productModule?.mount?.(root,state,api);if(typeof dispose==='function')cleanups.push(dispose);
    for(const button of all('[data-qa-brand-replay]'))button.onclick=()=>{if(!api.reduced?.())for(const brand of all('.brand'))brand.__orderAccountMenu?.gather?.();const source=root.querySelector('[data-component-source] .brand');source?.querySelector('button')?.click();};
    const sourceInfo=window.ORDER_LIBRARY_SOURCE,sourceRoot=root.querySelector('[data-component-source]');
    if(sourceInfo&&sourceRoot){
      const target=sourceRoot.querySelectorAll(sourceInfo.selector)[sourceInfo.index||0];if(target)target.dataset.componentTarget='';
      if(libraryModule?.mount){
        const sourceApi={...api,screen:sourceInfo.screen,variant:sourceInfo.variant,adapter,
          demoSuccess:()=>api.toast?.('이 기능의 서버 연결을 확인해 주세요.'),
          localState:next=>{sourceRoot.dataset.componentState=next;}};
        try{const dispose=window.ORDER_PRODUCT_UI?.mount(libraryModule,sourceRoot,sourceInfo.state,sourceApi)||libraryModule.mount(sourceRoot,sourceInfo.state,sourceApi);if(typeof dispose==='function')cleanups.push(dispose);setStatus($('[data-component-runtime]'),'원본 화면과 런타임이 연결됐어요. 변경하려는 상태를 직접 확인해 주세요.');}
        catch{setStatus($('[data-component-runtime]'),'원본 런타임을 연결하지 못했어요. 사용처에서 다시 확인해 주세요.',true);}
      }else setStatus($('[data-component-runtime]'),'이 사용 화면에는 연결된 동작 모듈이 없습니다. 구조와 사용처를 확인할 수 있어요.');
    }
    for(const b of all('[data-qa-go]')){
      if(b.dataset.componentVariant){
        const selected=sourceInfo?.variantId===b.dataset.componentVariant;
        b.setAttribute('aria-pressed',String(selected));b.classList.toggle('primary',selected);b.classList.toggle('secondary',!selected);
        b.onclick=()=>api.select('component-library',state,{componentVariant:b.dataset.componentVariant});
      }else b.onclick=()=>api.select(b.dataset.qaGo,b.dataset.qaState||'default');
    }
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
    return()=>{for(const cleanup of cleanups.reverse())cleanup();};
  }
  window.ORDER_DESIGN_MODULES=[...(window.ORDER_DESIGN_MODULES||[]).filter(module=>module.id!=='component-library'),{id:'component-library',mount}];
}
