/** Review-session maintenance. This is serialized into the trusted QA shell only.
 * Activity checks an existing fixed-deadline session; it never creates an authenticated
 * session or redirects away from a comment draft. The server enforces all limits.
 */
export function installQaSession() {
  const clock=()=>performance.now();
  let session=null,expired=false,inFlight=false,lastActivity=clock(),lastAttempt=0,lastProbe=-Infinity;
  const ACTIVITY_WINDOW=5*60*1000,REFRESH_INTERVAL=4*60*1000;
  const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
  const valid=value=>value&&typeof value.csrf==='string'&&value.csrf.length>=20&&Number.isFinite(value.expiresAt);
  function use(value,restored=false){
    if(!valid(value))return false;
    session={csrf:value.csrf,expiresAt:value.expiresAt,absoluteExpiresAt:value.absoluteExpiresAt,serverNow:value.serverNow};
    const wasExpired=expired;expired=false;
    emit('ia-session-updated',{...session});
    if(restored||wasExpired)emit('ia-session-restored',{...session});
    return true;
  }
  function expire(reason){if(expired)return;expired=true;emit('ia-session-expired',{reason});}
  async function read(response){
    if(response.type==='opaqueredirect'||response.redirected){expire('AUTHENTICATION_REQUIRED');return null;}
    if(!(response.headers.get('Content-Type')||'').includes('application/json')){
      if(response.ok||[401,403].includes(response.status))expire('AUTHENTICATION_REQUIRED');
      return null;
    }
    const value=await response.json();
    if(!response.ok){
      if([401,403].includes(response.status)&&value.error!=='CSRF_DENIED')expire(value.error||'AUTHENTICATION_REQUIRED');
      return {error:value.error,status:response.status};
    }
    return value;
  }
  async function probe(){
    if(inFlight||document.visibilityState==='hidden'||clock()-lastProbe<1500)return;
    lastProbe=clock();inFlight=true;
    try{
      const response=await fetch('/api/ia/auth/me',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'manual'});
      const value=await read(response);if(value?.authenticated)use(value,true);
    }catch{/* Offline/server failure keeps the current draft and does not log the reviewer out. */}
    finally{inFlight=false;}
  }
  async function maintain(){
    const now=clock();
    if(!session||inFlight||document.visibilityState==='hidden')return;
    if(expired)return;
    // The device clock can differ from the server or change during review.
    // expiresAt is only a renewal hint: only an authenticated server response
    // may declare expiry. Monotonic intervals also keep retries bounded offline.
    if(now-lastActivity>ACTIVITY_WINDOW||now-lastAttempt<REFRESH_INTERVAL)return;
    lastAttempt=now;inFlight=true;let staleCsrf=false;
    try{
      const response=await fetch('/api/ia/auth/refresh',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'manual',headers:{'X-IA-CSRF':session.csrf}});
      const value=await read(response);
      if(value?.authenticated)use(value,false);
      else staleCsrf=value?.error==='CSRF_DENIED';
    }catch{/* A failed heartbeat must not navigate or discard text. */}
    finally{inFlight=false;}
    if(staleCsrf)await probe();
  }
  function activity(){lastActivity=clock();if(expired)void probe();else if(session&&session.expiresAt*1000-Date.now()<5*60*1000)void maintain();}
  const activityEvents=['pointerdown','keydown','input','wheel','touchstart','ia-session-activity'];
  for(const name of activityEvents)document.addEventListener(name,activity,{capture:true,passive:true});
  const ready=event=>{if(use(event.detail)){
    const now=clock();lastActivity=now;
    // Reading /auth/me is not a renewal. An already old cookie must be
    // eligible before the four-minute cooldown and next timer tick expire it.
    lastAttempt=now-(session.expiresAt*1000-Date.now()<=REFRESH_INTERVAL+60000?REFRESH_INTERVAL:0);
    void maintain();
  }};
  const externalExpiry=event=>expire(event.detail?.reason||'AUTHENTICATION_REQUIRED');
  const resume=()=>{if(document.visibilityState!=='hidden'&&(expired||session&&session.expiresAt*1000-Date.now()<60000))void probe();};
  document.addEventListener('ia-session-ready',ready);
  document.addEventListener('ia-session-check',()=>void probe());
  document.addEventListener('ia-session-invalid',externalExpiry);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('focus',resume);
  window.addEventListener('online',resume);
  const timer=setInterval(()=>void maintain(),60000);
  window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(timer);});
  // The initial authenticated identity is supplied by host after its own /auth/me
  // read. No duplicate bootstrap request and no secrets are placed on window.
}
