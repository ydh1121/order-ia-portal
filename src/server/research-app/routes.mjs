/** Application routes are independent of the review catalogue and its state chips. */
export const AUTH_ROUTES = new Set(['login','signup','otp','password','terms']);
export const QUOTE_ROUTES = new Set(['q1','q2','q3','q4','quote-review']);
export const ACCOUNT_PANELS = Object.freeze({
  profile:'profile.personal', 'account-settings':'profile.account', 'store-settings':'manage.business',
  'saved-quote':'manage.quotes', 'delivery-schedule':'manage.delivery',
});
export function researchRoute(input={}, previous={}) {
  if (typeof input==='string') input={screen:input};
  let screen=input.screen||'onboarding', state=input.state||'default';
  const mode=input.mode==='detailed'||screen==='detailed-r3'?'detailed':input.mode==='simple'||screen==='simple-r3'?'simple':previous.mode||'simple';
  if(screen==='simple-r3'||screen==='detailed-r3'){screen='q1';state='default';}
  if(screen==='business-manage')screen='store-settings';
  if(screen==='pricing-r3')screen='price-workspace';
  if(screen==='quote-history')screen='saved-quote';
  if(screen==='role-work'){screen=state==='consult'?'drawer':state==='delivery'?'delivery-request':state==='business'?'business':state==='case'?'proof':'saved-quote';state='default';}
  if(screen==='role-consult'){screen='drawer';state='info';}
  if(screen==='role-delivery'){screen='delivery-request';state='ready';}
  if(screen==='role-case'){screen='proof';state='empty';}
  if(state==='default')state=({q1:'before',q2:'empty',q3:'open',q4:'open','quote-review':'normal','account-settings':'normal','quote-result':'saving','quote-wait':'entry','saved-quote':'list','store-settings':'list','delivery-schedule':'calendar','delivery-request':'ready','admin-campaigns':'normal','price-workspace':'costs',passes:'grid',drawer:'info',business:'empty',proof:'empty',notifications:'list'})[screen]||state;
  if(screen==='onboarding'&&state==='default')state='guest-1';
  const variant=/^[\w-]{1,100}$/.test(input.variant||'')?input.variant:'email';
  if(!/^[\w-]{1,100}$/.test(screen)||!/^[\w-]{1,100}$/.test(state))throw TypeError('INVALID_RESEARCH_ROUTE');
  // The Gooey action opens passes in the existing account stack. A direct
  // passes route still owns a full page; its prior route never implies a panel.
  const scenePanel=screen==='passes'&&input.panel==='manage.research.passes.'+state?input.panel:null;
  const kind=AUTH_ROUTES.has(screen)?'auth':QUOTE_ROUTES.has(screen)?'quote':screen==='price-workspace'?'pricing':ACCOUNT_PANELS[screen]||scenePanel?'account':screen==='drawer'?'sheet':'page';
  const parent=kind==='auth'||kind==='account'||kind==='sheet'?(input.parent||previous.parent||(!['auth','account','sheet'].includes(previous.kind)&&previous.screen?{screen:previous.screen,state:previous.state,variant:previous.variant,mode:previous.mode}:kind==='sheet'?{screen:'passes',state:'grid',variant:'email',mode}:{screen:'onboarding',state:kind==='account'?'member-4':'guest-4',variant:'email',mode})):null;
  return {screen,state,variant,mode,kind,parent,panel:scenePanel||ACCOUNT_PANELS[screen]||null};
}
export function researchRouteUrl(route, base, {replace=false}={}) {
  const url=new URL(base);url.searchParams.set('view','research-r3');
  for(const key of ['screen','state','variant','mode'])url.searchParams.set(key,route[key]);
  for(const key of ['channel','artifact','version','width','inspect'])url.searchParams.delete(key);
  url.hash='';return url;
}
