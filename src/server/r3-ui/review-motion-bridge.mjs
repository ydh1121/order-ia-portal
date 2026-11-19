// Only the parent of a current, opaque review document can select a fixture or
// advance that document's annotation identity. Neither message carries HTML.
export function installReviewMotion(session) {
  if(window===parent||session.version!=='current')return;
  const root=document.querySelector('#order-single');
  if(!root)return;
  const resultStates=new Set(['saving','new-detail','new-only-detail','current-detail','equal','current-lower','no-current','expired','recompare','no-result','locked']);
  const commands=new Set(['replay','normal','delay','error','offline','complete']);
  function notify(type,payload={}){
    parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type,payload},'*');
  }
  addEventListener('message',event=>{
    const m=event.data;
    if(event.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.channel!==session.channel||m.artifact!==session.artifact)return;
    const p=m.payload;
    if(['resultState','onboardingState'].includes(m.type)&&p&&/^[a-f0-9]{64}$/.test(p.hash)&&/^[a-f0-9-]{36}$/.test(p.channel)){
      if(m.type==='resultState'){
        if(session.screen!=='quote-result'||!resultStates.has(p.state))return;
        root.dispatchEvent(new CustomEvent('r3-result-state',{detail:{state:p.state}}));
      }else{
        const identity=/^(guest|member)-[1-4]$/;
        if(session.screen!=='onboarding'||!identity.test(p.state)||identity.exec(p.state)[1]!==identity.exec(session.state)?.[1]||typeof p.markup!=='string')return;
        const update=new CustomEvent('r3-onboarding-state',{detail:{state:p.state,markup:p.markup},cancelable:true});
        if(root.dispatchEvent(update))return; // A snapshot-only or older controller must remount normally.
      }
      root.dispatchEvent(new CustomEvent('r3-motion-identity-reset'));
      session.channel=p.channel;session.artifact=p.hash;session.state=p.state;
      notify('ready');
    }else if(m.type==='returnToMode'&&session.screen==='onboarding'&&['simple','detailed'].includes(p?.mode)){
      root.dispatchEvent(new CustomEvent('r3-return-to-mode',{detail:{mode:p.mode}}));
    }else if(m.type==='motionScenario'&&commands.has(p?.mode)){
      const mode=p.mode;
      root.dispatchEvent(new CustomEvent('r3-motion-scenario',{detail:{mode}}));
      if(session.screen==='quote-wait'){
        const status={normal:'pending',delay:'delayed',error:'error',offline:'offline',complete:'success',replay:'retry'}[mode];
        root.dispatchEvent(new CustomEvent('order:quote-response',{detail:{requestId:root.dataset.waitRequest,status,canView:true}}));
      }
      if(session.screen==='quote-result'&&mode==='replay'){
        root.dispatchEvent(new CustomEvent('r3-result-state',{detail:{state:session.state,replay:true}}));
      }
    }
  });
}
