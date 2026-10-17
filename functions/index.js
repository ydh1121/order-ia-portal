/** Root routing for the existing Cloudflare Pages project only.
 * This function is preferred over the public/index.html safety fallback.
 * The private IA UI and Sheets stay behind the established OWNER server gate.
 */
import {requireActor} from '../src/server/auth.mjs';
const h={
  'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Cookie, Cf-Access-Jwt-Assertion',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"
};
export async function onRequest({request,env}){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...h,Allow:'GET, HEAD'}});
  let target='/login';
  try{
    const actor=await requireActor(request,env);
    if(actor.role==='OWNER')target='/ia/';
  }catch{/* Invalid, expired, or missing server session: never disclose IA data. */}
  return new Response(null,{status:302,headers:{...h,Location:target}});
}
