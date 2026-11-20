// Runs before the unchanged R1 frame controller. The controller continues to own
// state transitions, annotation channels and animation continuity.
export function installQaReviewRuntime(session,installFixture,installAdapter){
  const adapter=installFixture(session,installAdapter);
  const preservePurchase=()=>{
    const snapshot=adapter.fixture.inspect();
    parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'qaPurchaseFixture',
      payload:{purchases:snapshot.data.purchases,selectedPurchaseId:snapshot.selectedPurchaseId}},'*');
  };
  // Product navigation keeps the selected dummy order through the next QA
  // document. Selecting a state chip directly still starts that fixture afresh.
  for(const module of window.ORDER_DESIGN_MODULES||[]){
    if(typeof module.mount!=='function')continue;
    const mount=module.mount;
    module.mount=(root,state,api)=>mount(root,state,{...api,adapter,brandAccount:window.ORDER_BRAND_ACCOUNT_CONTEXT,
      select(...args){preservePurchase();return api.select(...args);}});
  }
  addEventListener('order-qa-before-navigate',preservePurchase);
  const onMessage=event=>{
    const message=event.data;
    if(event.source!==parent||message?.scope!=='ORDER_R3_HOST'||message.channel!==session.channel||message.artifact!==session.artifact)return;
    if(!['componentState','onboardingState','resultState'].includes(message.type))return;
    const payload=message.payload;
    if(!payload||typeof payload.state!=='string'||!/^[a-f0-9]{64}$/.test(payload.hash)||!/^[a-f0-9-]{36}$/.test(payload.channel))return;
    if(payload.fixture)adapter.fixture.configure(payload.fixture);
    // The original controller receives the same session object. It performs its
    // own validated transition before replacing the channel and artifact hash.
    session.fixture=payload.fixture||session.fixture;
  };
  addEventListener('message',onMessage);
  addEventListener('pagehide',()=>{removeEventListener('message',onMessage);removeEventListener('order-qa-before-navigate',preservePurchase);adapter.fixture.dispose();},{once:true});
  return adapter;
}
