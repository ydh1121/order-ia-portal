// Private design-review input only. The product receives authorized issued snapshots.
export function reviewQuoteFixture(state) {
  const issued=Date.parse('2026-11-14T00:00:00+09:00');
  const end=issued+7*86400_000;
  const now=end-((6*24+21)*3600+13*60+59)*1000;
  if(state==='locked')return {now,model:{state:'unverified'}};
  if(state==='no-result')return {now,model:{state:'no-offer'}};
  if(state==='expired'||state==='recompare')return {now:end,model:{state:'expired',end,issued}};
  const quantity=2000,annualCount=12,currentUnit=6270;
  const proposedUnit=state==='equal'?6270:state==='current-lower'?6570:5970;
  const proposed=quantity*proposedUnit;
  const model={state:'offer',proposed:String(proposed),issued,end,quantityLabel:'2,000판',productLabel:'4번 특란',basis:'동일한 1회 납품 기준'};
  if(!['no-current','new-only-detail'].includes(state)){
    const current=quantity*currentUnit,delta=current-proposed,abs=Math.abs(delta),largest=Math.max(current,proposed);
    Object.assign(model,{state:delta>0?'saving':delta<0?'current-lower':'equal',current:String(current),difference:String(abs),
      currentRatio:100*current/largest,proposedRatio:100*proposed/largest,annualCount,annualSaving:String(abs*annualCount),
      savingRate:(100*abs/current).toFixed(2),currentPremium:(100*abs/proposed).toFixed(2),unitDifference:String(Math.abs(currentUnit-proposedUnit))});
  }
  return {now,model,selected:state==='current-detail'?'current':['new-detail','new-only-detail'].includes(state)?'proposed':null};
}

export function installReviewQuote(mount,fixture) {
  (window.ORDER_DESIGN_MODULES||=[]).push({id:'quote-result',mount(root,state,api){
    let sample=fixture(state);
    let currentState=state;
    const host=root.querySelector('[data-review-result]');
    let start=Date.now();
    const view=mount(host,{
      now:()=>sample.now+Date.now()-start,
      reducedMotion:()=>document.documentElement.hasAttribute('data-review-reduced'),
      guide:false,
      onDetail:async()=>sample.model,
      onSelected(kind){
        const single=['no-current','new-only-detail'].includes(currentState);
        if(!single&&!['saving','current-detail','new-detail'].includes(currentState))return;
        const next=single?(kind==='proposed'?'new-only-detail':'no-current'):
          kind==='current'?'current-detail':kind==='proposed'?'new-detail':'saving';
        if(currentState!==next)api.select('quote-result',next);
      },
      onAction(action){
        const targets={consult:['role-consult',''],delivery:['role-delivery',''],new:['q1','before'],same:['quote-review','normal'],back:['quote-review','normal'],verify:['business','empty']};
        if(targets[action])api.select(...targets[action]);
      }
    });
    function display(next,replay=false){
      const previous=sample;
      currentState=next;
      sample=fixture(next);
      host.dataset.view=next;
      if(replay||previous.now!==sample.now){start=Date.now();if(replay)view.clear();}
      if(next!=='recompare')host.querySelector('dialog[open]')?.close();
      view.show(sample.model,sample.selected);
      if(next==='recompare')view.chooseConditions();
    }
    const update=e=>display(e.detail.state,e.detail.replay);
    root.addEventListener('r3-result-state',update);
    display(state);
    return ()=>{root.removeEventListener('r3-result-state',update);view.clear();};
  }});
}
