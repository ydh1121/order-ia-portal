/** Environment composition. Product navigation and forms do not import this
 * fixture implementation. Promotion supplies the real transport at this seam. */
export function createResearchEnvironment(config, installFixture, installAdapter) {
  // Draft schema, rather than a deploy hash, owns an ordinary research session.
  // Explicit review scenarios use the quote workspace's separate fixture scope.
  // Supplied only by Pages after validating this owner, active run and persona.
  const run=config.accountRun;
  const namespace=run?'research:lab:'+run.runId+':'+run.persona:config.inspection?.version==='recorded'?'research:recorded:'+config.build.slice(0,16):'research:v1', storageKey='order-research-session-v1:'+namespace;
  let adapter=null, session=null, saved=null,ownerSession=null,scenarioBackup=null;
  try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  const persist=()=>{if(!adapter?.fixture)return;const value=adapter.fixture.inspect();try{sessionStorage.setItem(storageKey,JSON.stringify({controls:{...value.controls,scenario:'normal'},data:scenarioBackup||value.data,selectedPurchaseId:value.selectedPurchaseId}));}catch{}};
  return {kind:run?'research-lab':'research-fixture',namespace,
    ...(run?{priceWorkspace:{createTransport:()=>({request:(path,body,{signal}={})=>adapter.priceRequest(path,body,signal),inspect:()=>({mode:'lab'})})}}:{}),
    regular:{address:{configured:true,fetcher:async(_url,settings={})=>{
      ownerSession??=fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'}).then(async response=>{if(!response.ok)throw Error('ADDRESS_SESSION_REQUIRED');const value=await response.json();if(typeof value.csrf!=='string')throw Error('ADDRESS_SESSION_REQUIRED');return value;}).catch(error=>{ownerSession=null;throw error;});
      const identity=await ownerSession,headers=new Headers(settings.headers);headers.set('X-IA-CSRF',identity.csrf);
      return fetch('/api/ia/research-address',{...settings,credentials:'same-origin',headers});
    }}},
    async createAdapter({initial,navigate,signal}){
      if(adapter)return adapter;
      if(run){
        adapter=installAdapter(run,{signal,navigate:(screen,state)=>navigate(typeof screen==='object'?screen:{screen,state})});
        await adapter.ready;return adapter;
      }
      session={...initial,fixture:saved?{...saved.controls,data:saved.data,selectedPurchaseId:saved.selectedPurchaseId}:config.fixture||{}};
      if(!saved&&initial.screen==='quote-result'&&initial.state==='locked-guest'){
        session.fixture={authenticated:false,persona:'guest',...session.fixture};
      }
      adapter=installFixture(session,(context,options)=>installAdapter(context,{...options,navigate:(screen,state)=>navigate(typeof screen==='object'?screen:{screen,state}),onOperation(operation){options.onOperation?.(operation);persist();}}));
      adapter.fixture.useConsultationPass=(pass,owner)=>{
        const scope={org_id:'qa-store',site_id:'qa-site'};
        const issued={...scope,businessName:pass.site,issued_at:pass.date.replaceAll('.','-'),expires_at:'2099-12-31T00:00:00.000Z'};
        const workspace={businesses:[{...scope,businessName:pass.site}],products:[],quotes:[
          {...issued,id:pass.id,productName:pass.lines.map(line=>line[0]).join(' · '),reviewPassId:pass.id},
          {...issued,id:'qa-existing-quote',productName:'QA 검토용 발급 견적',serviceDate:'2026-11-21'}
        ]};
        session.reviewConsultationWorkspace=workspace;
        owner.addEventListener('abort',()=>{if(session.reviewConsultationWorkspace===workspace)delete session.reviewConsultationWorkspace;},{once:true});
      };
      signal.addEventListener('abort',persist,{once:true});return adapter;
    },
    async configure(route,current,fixture){
      if(run)return;
      Object.assign(session,route);
      const authenticated=['login','signup','otp','password','terms'].includes(route.screen)?['success','verified'].includes(route.state)||route.screen==='login'&&route.state==='closed':route.screen==='onboarding'?route.state.startsWith('member-'):route.state!=='qa-guest'&&!(route.screen==='quote-result'&&route.state==='locked-guest')&&!(route.screen==='price-workspace'&&route.state==='guest');
      const scenario=({'qa-loading':'loading','qa-error':'error','qa-empty':'empty'})[route.state]||'normal';
      const selectedScenario=fixture?.scenario||scenario;
      if(selectedScenario==='empty'&&!scenarioBackup)scenarioBackup=current.fixture.inspect().data;
      const restore=selectedScenario!=='empty'&&scenarioBackup?scenarioBackup:null;
      current.fixture.releasePending({authenticated,persona:authenticated?(route.screen.startsWith('admin-')||route.screen==='member-email-templates'||route.screen==='receipt'||route.screen==='price-workspace'?'operator':route.screen.startsWith('supplier-')?'supplier':'buyer'):'guest',scenario,...(restore?{data:restore}:{}),...(fixture||{})});
      if(restore)scenarioBackup=null;
      if(route.screen==='passes'&&route.state==='loading')current.fixture.holdNextRead('product','/purchases');
      await current.refreshSession?.();
    },
    dispose(){persist();adapter?.fixture?.dispose();}
  };
}
