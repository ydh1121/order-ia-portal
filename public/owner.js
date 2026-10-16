'use strict';
let csrf='';
const status=document.getElementById('user-state'),output=document.getElementById('data-result');
async function getStatus(){
  const res=await fetch('/api/ia/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok){location.replace('/login.html');return;}
  const data=await res.json();if(data.role!=='OWNER')throw Error('DENIED');csrf=data.csrf;
  status.textContent='인증된 계정: '+data.email+' · 권한: '+data.role;
}
getStatus().catch(()=>{status.textContent='권한 확인에 실패했습니다.'});
document.getElementById('load-screens').addEventListener('click',async()=>{
  output.textContent='요청 중…';
  try{
    const res=await fetch('/api/ia/screens',{credentials:'same-origin',cache:'no-store'});
    if(res.status===403){output.textContent='로그인 권한을 확인할 수 없습니다.';return;}
    if(res.status===503){output.textContent='Google 데이터 접근 권한이 아직 연결되지 않았습니다.';return;}
    if(!res.ok){output.textContent='조회할 수 없습니다.';return;}
    const obj=await res.json();output.textContent='조회한 화면 수: '+obj.total+'건 (서버 인증 데이터)';
  }catch{output.textContent='조회 연결에 실패했습니다.'}
});
document.getElementById('logout').addEventListener('click',async()=>{
  if(!csrf){status.textContent='세션 확인 후 다시 시도해 주세요.';return;}
  try{
    const res=await fetch('/api/ia/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-IA-CSRF':csrf},cache:'no-store'});
    if(!res.ok)throw Error('LOGOUT_FAILED');location.replace('/login.html');
  }catch{status.textContent='로그아웃 처리에 실패했습니다.'}
});
