// The review adapter alone supplies fixture groups and manually resolved requests.
// It shares the actual R4 player, cursor and request lifecycle with the buyer desk.
export function installWaitPlayer(montages,createWait,mountScene) {
  const component=window.ORDER_DESIGN_MODULES.find(item=>item.id==='quote-wait');
  component.mount=function(root,state,api) {
    const host=root.querySelector('.mf-wait');
    if(!host)return;
    host.dataset.waitScene='';host.dataset.waitSource='review-fixture';
    const items=[['4번 특란','대란','중란','왕란'],['2,000판','400판','600판'],['서울 관악구','서울 종로구'],['정기배송','1회 배송']].map(values=>({values}));
    let resolve,reject,ended=false,serial=0,terminalPlayer=null;
    const ctl=new AbortController();
    const runner=mountScene(host,montages,createWait,(phase,data)=>{
      root.dataset.waitRequest=String(data.requestId??'');
      host.querySelector('[data-banner-stack]').hidden=['error','offline','complete','idle'].includes(phase);
      let footer=host.querySelector('footer,.mf-footer');
      if(!footer){footer=document.createElement('footer');host.append(footer);}
      if(['error','offline'].includes(phase)){
        if(!footer.querySelector('[data-wait-retry]')){
          footer.replaceChildren();const back=document.createElement('button'),retry=document.createElement('button');
          back.type=retry.type='button';back.textContent='돌아가기';retry.textContent='다시 비교하기';retry.dataset.waitRetry='';
          back.onclick=()=>api.select?.('quote-review','normal');retry.onclick=()=>start('entry');footer.append(back,retry);
        }
      }else footer.replaceChildren();
    });
    function start(phase){
      terminalPlayer?.destroy();terminalPlayer=null;
      const id=++serial;
      runner.request((signal)=>new Promise((ok,fail)=>{
        resolve=ok;reject=fail;signal.addEventListener('abort',()=>fail(new Error('ABORTED')),{once:true});
      }),items,phase).then(result=>{
        if(!ended && id===serial && result)api.select?.('quote-result',result.canView===true?'saving':'locked');
      }).catch(()=>{});
    }
    function receive(event){
      const d=event.detail;
      if(!d || String(d.requestId)!==root.dataset.waitRequest || !root.dataset.waitRequest)return;
      if(d.status==='retry'){start('entry');return;}
      if(!runner.id)return;
      if(d.status==='success')resolve({canView:d.canView});
      else if(d.status==='error'||d.status==='offline')reject(Object.assign(new Error(d.status),{code:d.status==='offline'?'OFFLINE':'REQUEST_FAILED'}));
      else runner.progress(runner.id,d.status);
    }
    root.addEventListener('order:quote-response',receive,{signal:ctl.signal});
    root.addEventListener('r3-wait-pause',()=>runner.pause(),{signal:ctl.signal});root.addEventListener('r3-wait-resume',()=>runner.resume(),{signal:ctl.signal});
    if(state==='complete'){
      runner.stop('complete');const art=host.querySelector('.mf-wait-avatar'),slot=document.createElement('div');slot.setAttribute('aria-hidden','true');art.append(slot);
      window.BloubR4.mountBloub(slot,montages.complete,{autoplay:!document.documentElement.hasAttribute('data-review-reduced')&&!matchMedia('(prefers-reduced-motion: reduce)').matches}).then(player=>{
        if(ended||serial){player.destroy();slot.remove();return;}terminalPlayer=player;const old=art.querySelector(':scope > svg');if(old)old.style.display='none';
      }).catch(()=>slot.remove());
    }
    else {start(({comparing:'comparing','slow-response':'comparing',delayed:'delayed'})[state]||'entry');
      if(state==='offline'||state==='server-error')reject(Object.assign(new Error(state),{code:state==='offline'?'OFFLINE':'REQUEST_FAILED'}));}
    return ()=>{ended=true;serial++;terminalPlayer?.destroy();ctl.abort();runner.destroy();delete root.dataset.waitRequest;};
  };
}
