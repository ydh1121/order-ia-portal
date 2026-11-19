// Explicitly selecting a QA loading state holds its own projected skeleton until
// the reviewer supplies a response. No static timer represents a server outcome.
export function mountSelectedLoading(root,api,install,originalMount,state) {
  const cleanup=originalMount(root,state,api);
  const region=root.querySelector('.qa-admin-main,.ops-skeleton,.t-skel');
  if(!region)return cleanup;
  const controller=install(root,{source:'controlled-qa'});
  let active=true;
  const finish=({signal})=>new Promise((resolve,reject)=>{
    const stop=()=>{root.removeEventListener('r3-motion-scenario',change);signal.removeEventListener('abort',cancel);};
    const cancel=()=>{stop();reject(new DOMException('Unmounted','AbortError'));};
    const change=event=>{
      const mode=event.detail?.mode;
      if(!['normal','complete','offline','error'].includes(mode))return;
      stop();
      if(mode==='offline'||mode==='error')reject(new Error(mode));else resolve({ok:true});
    };
    root.addEventListener('r3-motion-scenario',change);signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted)cancel();
  });
  controller.reveal(region,finish,{requestId:'selected-loading'}).then(()=>{
    if(active)api.select(api.screen,api.screen==='common'?'revealed':'normal');
  },()=>{
    if(active)api.select(api.screen,api.screen==='admin-analytics'?'partial':'error');
  });
  return ()=>{active=false;controller.destroy();cleanup?.();};
}
