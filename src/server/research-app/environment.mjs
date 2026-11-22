/** Environment composition. Product navigation and forms do not import this
 * fixture implementation. Promotion supplies the real transport at this seam. */
export function createResearchEnvironment(config, installFixture, installAdapter) {
  // Draft schema, rather than a deploy hash, owns an ordinary research session.
  // Explicit review scenarios use the quote workspace's separate fixture scope.
  const namespace=config.inspection?.version==='recorded'?'research:recorded:'+config.build.slice(0,16):'research:v1', storageKey='order-research-session-v1:'+namespace;
  let adapter=null, session=null, saved=null,ownerSession=null,scenarioBackup=null;
  try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  const persist=()=>{if(!adapter?.fixture)return;const value=adapter.fixture.inspect();try{sessionStorage.setItem(storageKey,JSON.stringify({controls:{...value.controls,scenario:'normal'},data:scenarioBackup||value.data,selectedPurchaseId:value.selectedPurchaseId}));}catch{}};
  return {kind:'research-fixture',namespace,
    regular:{address:{configured:true,fetcher:async(_url,settings={})=>{
      ownerSession??=fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'}).then(async response=>{if(!response.ok)throw Error('ADDRESS_SESSION_REQUIRED');const value=await response.json();if(typeof value.csrf!=='string')throw Error('ADDRESS_SESSION_REQUIRED');return value;}).catch(error=>{ownerSession=null;throw error;});
      const identity=await ownerSession,headers=new Headers(settings.headers);headers.set('X-IA-CSRF',identity.csrf);
      return fetch('/api/ia/research-address',{...settings,credentials:'same-origin',headers});
    }}},
    async createAdapter({initial,navigate,signal}){
      if(adapter)return adapter;
      session={...initial,fixture:saved?{...saved.controls,data:saved.data,selectedPurchaseId:saved.selectedPurchaseId}:config.fixture||{}};
      adapter=installFixture(session,(context,options)=>installAdapter(context,{...options,navigate:(screen,state)=>navigate(typeof screen==='object'?screen:{screen,state}),onOperation(operation){options.onOperation?.(operation);persist();}}));
      signal.addEventListener('abort',persist,{once:true});return adapter;
    },
    async configure(route,current,fixture){
      Object.assign(session,route);
      const authenticated=['login','signup','otp','password','terms'].includes(route.screen)?['success','verified'].includes(route.state):route.screen==='onboarding'?route.state.startsWith('member-'):route.state!=='qa-guest';
      const scenario=({'qa-loading':'loading','qa-error':'error','qa-empty':'empty'})[route.state]||'normal';
      const selectedScenario=fixture?.scenario||scenario;
      if(selectedScenario==='empty'&&!scenarioBackup)scenarioBackup=current.fixture.inspect().data;
      const restore=selectedScenario!=='empty'&&scenarioBackup?scenarioBackup:null;
      current.fixture.releasePending({authenticated,persona:authenticated?(route.screen.startsWith('admin-')||route.screen==='member-email-templates'||route.screen==='receipt'?'operator':route.screen.startsWith('supplier-')?'supplier':'buyer'):'guest',scenario,...(restore?{data:restore}:{}),...(fixture||{})});
      if(restore)scenarioBackup=null;
      await current.refreshSession?.();
    },
    dispose(){persist();adapter?.fixture?.dispose();}
  };
}
