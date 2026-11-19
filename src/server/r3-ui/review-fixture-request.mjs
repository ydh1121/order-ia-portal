// Opaque frame only. Controls resolve isolated examples; no network or business data is accessible.
export function mountReviewRequests(root, motion) {
  const operations = new Map();
  let mode = 'normal', sequence = 0, generation = 0;
  function response(signal) {
    return new Promise((resolve,reject) => {
      let timer;
      const finish = ok => {
        clearTimeout(timer);
        signal.removeEventListener('abort',cancel);
        pending.delete(finish);
        if(ok)resolve({ok:true,source:'controlled-qa'});
        else reject(new Error(mode==='offline'?'OFFLINE':'CONTROLLED_QA_FAILURE'));
      };
      const cancel=()=>finish(false);
      pending.add(finish); signal.addEventListener('abort',cancel,{once:true});
      if(signal.aborted)return cancel();
      if(mode!=='delay')timer=setTimeout(()=>finish(!['offline','error'].includes(mode)),mode==='complete'?0:340);
    });
  }
  const pending=new Set();
  function run(button,done,options={}) {
    if(!button)return;
    if(operations.has(button))return operations.get(button);
    const start=generation,requestId='fixture-'+(++sequence);
    const task=motion.run(button,({signal})=>response(signal),{region:options.region,requestId});
    const settled=task.then(async result=>{
      if(done && !document.documentElement.hasAttribute('data-review-reduced') && !matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(resolve=>setTimeout(resolve,420));
      if(generation===start && root.isConnected)done?.(result);
      return true;
    },()=>false).finally(()=>{if(operations.get(button)===settled)operations.delete(button);});
    operations.set(button,settled);return settled;
  }
  const change=e=>{
    const value=e.detail?.mode;
    if(!['normal','delay','error','offline','complete','replay'].includes(value))return;
    mode=value==='replay'?'normal':value;
    if(['error','offline','complete'].includes(value))for(const settle of [...pending])settle(value==='complete');
  };
  const reset=()=>{generation++;for(const settle of [...pending])settle(false);operations.clear();mode='normal';};
  root.addEventListener('r3-motion-scenario',change);
  root.addEventListener('r3-motion-identity-reset',reset);
  return {run,destroy(){reset();root.removeEventListener('r3-motion-scenario',change);root.removeEventListener('r3-motion-identity-reset',reset);motion.destroy();}};
}
