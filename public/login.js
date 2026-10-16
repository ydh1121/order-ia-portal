'use strict';
const form=document.getElementById('owner-login'),result=document.getElementById('result'),submit=document.getElementById('submit');
form.addEventListener('submit',async event=>{
  event.preventDefault();result.textContent='';
  if(!form.reportValidity())return;
  submit.disabled=true;
  try{
    const response=await fetch('/api/ia/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.elements.email.value.trim(),password:form.elements.password.value}),cache:'no-store',redirect:'error'});
    form.elements.password.value='';
    if(response.ok){location.assign('/ia/');return;}
    result.textContent=response.status===503?'로그인 설정이 아직 완료되지 않았습니다.':response.status===429?'요청이 많습니다. 잠시 후 다시 시도해 주세요.':'로그인할 수 없습니다. 계정과 비밀번호를 확인해 주세요.';
  }catch{result.textContent='연결에 실패했습니다. 다시 시도해 주세요.'}
  finally{submit.disabled=false;}
});
