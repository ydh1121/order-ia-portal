import {verifyAccessActor} from '../src/server/auth.mjs';
import {issueSession,previewOwnerOrigin,readSession} from '../src/server/owner-session.mjs';

const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Robots-Tag':'noindex, nofollow',
  'Vary':'Cookie, Cf-Access-Jwt-Assertion'
};
const deny=status=>new Response(null,{status,headers});

// Only a document navigation may establish a session. JSON, files and writes
// pass through the normal OWNER/CSRF checks and cannot mint a cookie.
export async function handlePreview(context,fetcher=fetch) {
  const {request,env}=context;
  if(env.IA_PREVIEW_OWNER_ORIGIN===undefined)return context.next();
  const url=new URL(request.url);
  if(url.origin!==previewOwnerOrigin(env))return deny(404);
  if(request.method!=='GET' || !['/','/ia','/ia/','/login'].includes(url.pathname))return context.next();
  if(url.pathname==='/login'){
    // Deep links normally enter at /ia. Keep the existing login return contract.
    const dest=new URL('/ia/',url.origin);
    const view=url.searchParams.get('returnView');
    if(['qa-lab','pricing-r3','roles-r3','workflow-r3','simple-r3','detailed-r3'].includes(view)){
      dest.searchParams.set('view',view);
      if(view==='qa-lab'){
        const screen=url.searchParams.get('screen'),width=url.searchParams.get('width');
        if(screen && /^[\w./:-]{1,200}$/.test(screen))dest.searchParams.set('screen',screen);
        if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(width))dest.searchParams.set('width',width);
      }
    }
    return new Response(null,{status:303,headers:{...headers,Location:dest.pathname+dest.search}});
  }
  let existing;
  try { existing=await readSession(request,env); } catch { /* New or expired session. */ }
  if(existing)return context.next();

  let session;
  try {
    const actor=await verifyAccessActor(request,env,fetcher);
    if(actor.role!=='OWNER' || actor.email!==env.IA_OWNER_EMAIL.trim().toLowerCase())return deny(403);
    session=await issueSession(env);
  } catch { return deny(403); }

  const internalHeaders=new Headers(request.headers);
  internalHeaders.set('Cookie',session.cookie.split(';')[0]);
  const page=await context.next(new Request(request,{headers:internalHeaders}));
  const response=new Response(page.body,page);
  response.headers.append('Set-Cookie',session.cookie);
  for(const [name,value] of Object.entries(headers))response.headers.set(name,value);
  return response;
}
export const onRequest=context=>handlePreview(context);
