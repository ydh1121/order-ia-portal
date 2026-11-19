// Account-owned QA organization is independent from review verdicts and source inventories.
export const mvpScreens = new Set([
  'onboarding','q1','q2','q3','q4','quote-review','quote-result','quote-wait',
  'delivery-request','application-status','saved-quote','passes','search',
  'login','signup','otp','password','terms','profile','account-settings','session-access',
  'business','proof','signature','store-home','store-settings','customer-orders','order-detail',
  'delivery-schedule','trade-documents','price-policy','consultation','help-center',
  'admin-access','admin-overview','admin-buyers','admin-business-review','admin-quotes',
  'admin-billing','receipt','admin-orders','admin-payments','admin-shipments','admin-documents',
  'admin-support','admin-settlements','admin-analytics','admin-price-approval','admin-catalog','admin-negotiations','admin-campaigns',
  'admin-policy','admin-audit','supplier-shipments','common','drawer',
  'component-library','admin-revenue-rules','member-email-templates','store-purchase'
]);

export function defaultQaNavigation(screens) {
  return {groups:[{id:'mvp',name:'1차 MVP'},{id:'future',name:'정식 - 향후 검토'}],
    assignments:Object.fromEntries([...new Set(screens)].map(id=>[id,mvpScreens.has(id)?'mvp':'future']))};
}

export function normalizeQaNavigation(value,screens) {
  const defaults=defaultQaNavigation(screens);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['groups','assignments'].includes(k)))throw Error('INVALID_NAVIGATION');
  if(!Array.isArray(value.groups)||value.groups.length!==2)throw Error('INVALID_GROUPS');
  const groups=defaults.groups.map(group=>{
    const found=value.groups.filter(g=>g?.id===group.id);
    if(found.length!==1||Object.keys(found[0]).some(k=>!['id','name'].includes(k)))throw Error('INVALID_GROUPS');
    const name=found[0].name;
    if(typeof name!=='string'||name.trim().length<1||name.trim().length>48||/[\u0000-\u001f\u007f]/.test(name))throw Error('INVALID_GROUP_NAME');
    return {id:group.id,name:name.trim()};
  });
  const a=value.assignments;
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length>500)throw Error('INVALID_ASSIGNMENTS');
  const allowed=new Set(screens);
  for(const [id,group] of Object.entries(a))if(!allowed.has(id)||!['mvp','future'].includes(group))throw Error('INVALID_ASSIGNMENTS');
  return {groups,assignments:{...defaults.assignments,...a}};
}

const headers={'Cache-Control':'private, no-store','Vary':'Cookie, Cf-Access-Jwt-Assertion','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>Response.json(body,{status,headers});
export async function handleQaNavigation({request,env,actor}) {
  if(!actor?.id||actor.role!=='OWNER')return json({error:'FORBIDDEN'},403);
  if(!env.ORDER_QA_DB)return json({error:'STORAGE_UNAVAILABLE'},503);
  const {catalog}=await import('./r3-ui/catalog.gen.mjs');
  const {supplementalScreenIds}=await import('./r3-qa-assets.mjs');
  const screens=[...new Set([...catalog.map(r=>r.screen),...supplementalScreenIds])];
  const db=env.ORDER_QA_DB;
  const latest=async()=>{
    const row=await db.prepare('SELECT revision, layout_json, updated_at FROM qa_navigation_revisions WHERE actor_id=? ORDER BY revision DESC LIMIT 1').bind(actor.id).first();
    return row?{revision:row.revision,layout:normalizeQaNavigation(JSON.parse(row.layout_json),screens),updatedAt:row.updated_at}:{revision:0,layout:defaultQaNavigation(screens),updatedAt:null};
  };
  if(request.method==='GET')return json(await latest());
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  let value,layout;
  try{
    const text=await request.text();if(text.length>32768)return json({error:'REQUEST_TOO_LARGE'},413);
    value=JSON.parse(text);
    if(!value||Object.keys(value).some(k=>!['expectedRevision','layout'].includes(k))||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0)throw Error('INVALID_REVISION');
    layout=normalizeQaNavigation(value.layout,screens);
  }catch(e){return json({error:e.message.startsWith('INVALID_')?e.message:'INVALID_REQUEST'},400);}
  const updatedAt=new Date().toISOString();
  const result=await db.prepare('INSERT INTO qa_navigation_revisions(actor_id,revision,layout_json,updated_at) SELECT ?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM qa_navigation_revisions WHERE actor_id=?),0)=?')
    .bind(actor.id,value.expectedRevision+1,JSON.stringify(layout),updatedAt,actor.id,value.expectedRevision).run();
  if(result.meta?.changes!==1)return json({error:'NAVIGATION_CONFLICT',current:await latest()},409);
  return json({revision:value.expectedRevision+1,layout,updatedAt});
}
