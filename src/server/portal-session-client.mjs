/** Account controls for the existing IA portal. The server owns the deadline. */
export async function mountPortalSession(banner,installSession) {
  if(!banner||banner.dataset.sessionMounted)return;
  banner.dataset.sessionMounted='true';
  installSession();
  const countdown=document.createElement('span');countdown.className='ux-account';
  countdown.dataset.sessionCountdown='';countdown.style.fontVariantNumeric='tabular-nums';
  countdown.textContent='로그인 만료까지 00:00:00';
  const logout=document.createElement('button');logout.type='button';
  logout.className='ux-session-button';logout.textContent='로그아웃';
  const notice=document.createElement('span');notice.className='ux-session-notice';notice.setAttribute('role','status');
  if(banner.dataset.sourceError)notice.textContent=banner.dataset.sourceError;
  // Swap the former logout/status order: countdown first, logout at the right.
  banner.replaceChildren(notice,countdown,logout);
  let csrf='',deadline=null,checkedDeadline=false,closed=false,reauth=false;
  const clock=()=>performance.now();
  function paint(){
    const seconds=deadline===null?0:Math.max(0,Math.ceil((deadline-clock())/1000));
    const text=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    countdown.textContent='로그인 만료까지 '+text;
    if(deadline!==null&&seconds===0&&!checkedDeadline){checkedDeadline=true;document.dispatchEvent(new CustomEvent('ia-session-check'));}
  }
  function use(event){
    const value=event.detail;if(!value||!Number.isFinite(value.expiresAt)||!Number.isFinite(value.serverNow))return;
    csrf=value.csrf||csrf;deadline=clock()+Math.max(0,value.expiresAt-value.serverNow)*1000;checkedDeadline=false;reauth=false;logout.textContent='로그아웃';
    if(!banner.dataset.sourceError)notice.textContent='';paint();
  }
  document.addEventListener('ia-session-updated',use);
  document.addEventListener('ia-session-expired',()=>{deadline=clock();checkedDeadline=true;reauth=true;logout.textContent='다시 로그인';paint();notice.textContent='로그인이 만료됐습니다.';});
  logout.addEventListener('click',async()=>{
    if(reauth){location.reload();return;}
    if(logout.disabled)return;logout.disabled=true;
    try{
      const response=await fetch('/api/ia/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'manual',headers:{'X-IA-CSRF':csrf}});
      if(response.ok){location.replace('/login');return;}
      notice.textContent='로그아웃하지 못했습니다. 다시 시도해 주세요.';
      document.dispatchEvent(new CustomEvent('ia-session-check'));
    }catch{notice.textContent='연결을 확인한 뒤 다시 시도해 주세요.';}
    finally{if(!closed)logout.disabled=false;}
  });
  const resume=()=>{if(document.visibilityState!=='hidden'){paint();document.dispatchEvent(new CustomEvent('ia-session-check'));}};
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  const timer=setInterval(paint,1000);
  window.addEventListener('pagehide',event=>{if(event.persisted)return;closed=true;clearInterval(timer);document.removeEventListener('ia-session-updated',use);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);});
  try{
    const response=await fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'manual'});
    if(response.ok){const identity=await response.json();document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:identity}));use({detail:identity});}
    else if([401,403].includes(response.status)){notice.textContent='로그인이 만료됐습니다.';logout.textContent='다시 로그인';reauth=true;}
  }catch{notice.textContent='로그인 시간을 확인하지 못했습니다. 연결을 확인해 주세요.';}
}
