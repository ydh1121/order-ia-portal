// Only explicit, current review frames receive a draft entered in this QA tab.
export function mountQuoteJourneyBridge(session) {
  if(window===parent || session.version!=='current')return;
  const root=document.querySelector('#order-single');
  const input=['q2','quote-review'].includes(session.screen);
  const question=['q1','q2','q3','q4','quote-review'].includes(session.screen);
  if(!question||!root)return;
  const send=(type,payload)=>parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type,payload},'*');
  if(input)root.addEventListener('r3-review-journey',event=>{
    if(event.detail?.type==='commit')send('quoteInput',event.detail.data);
    if(event.detail?.type==='open')send('quoteStep',event.detail.data);
  });
  addEventListener('message',event=>{
    const m=event.data;
    if(event.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.channel!==session.channel||m.artifact!==session.artifact)return;
    if(input&&m.type==='journeyDraft')root.dispatchEvent(new CustomEvent('r3-review-journey-draft',{detail:m.payload}));
    if(m.type!=='menuPublication')return;
    const brand=root.querySelector('header .brand');
    if(!brand)return;
    const old=brand.parentElement.querySelector('[data-order-menu]');
    if(!m.payload){old?.remove();return;}
    if(old)return;
    const menu=document.createElement('details'),trigger=document.createElement('summary'),group=document.createElement('div');
    menu.dataset.orderMenu='';trigger.textContent='▾';trigger.setAttribute('aria-label','Order 견적 모드 선택');
    for(const [label,mode] of [['간편 견적','simple'],['상세 견적','detailed']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.onclick=()=>{menu.open=false;send('quoteMode',mode);};group.append(button);
    }
    menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.open=false;trigger.focus();}});
    menu.append(trigger,group);brand.after(menu);
  });
}
