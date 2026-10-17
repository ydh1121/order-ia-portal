/** The /login clean route serves the same unprivileged form as /login.html. */
const h={
  'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Cookie',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"
};
export async function onRequest({request,env}){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...h,Allow:'GET, HEAD'}});
  if(!env?.ASSETS?.fetch)return new Response(null,{status:503,headers:h});
  const url=new URL('/login.html',request.url);
  const asset=await env.ASSETS.fetch(new Request(url,{method:request.method,headers:request.headers}));
  if(!asset.ok)return new Response(null,{status:503,headers:h});
  const headers=new Headers(asset.headers);
  for(const [k,v] of Object.entries(h))headers.set(k,v);
  headers.set('Content-Type','text/html; charset=utf-8');
  return new Response(request.method==='HEAD'?null:asset.body,{status:200,headers});
}
