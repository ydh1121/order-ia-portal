'use strict';
const form=document.getElementById('owner-login'),result=document.getElementById('result'),submit=document.getElementById('submit');
const encoder=new TextEncoder();
const decode=str=>Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),x=>x.charCodeAt(0));
const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function message(status,error){
  if(status===401)return '계정 또는 비밀번호가 일치하지 않습니다.';
  if(status===403)return '요청 출처가 허용되지 않습니다. 사이트 주소를 확인해 주세요.';
  if(status===429)return '로그인 요청이 제한되었습니다. 잠시 후 다시 시도해 주세요.';
  if(status===409||error==='LOGIN_CLIENT_UPDATE_REQUIRED')return '로그인 화면 버전이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.';
  if(status===500||status===503||status>=500)return '로그인 서버가 응답하지 않습니다. 비밀번호 오류가 아닐 수 있습니다. 잠시 후 다시 시도해 주세요.';
  return '로그인 요청을 처리하지 못했습니다.';
}
async function getChallenge(){
  const r=await fetch('/api/ia/auth/challenge',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!r.ok)throw Object.assign(new Error('CHALLENGE_UNAVAILABLE'),{status:r.status});
  const data=await r.json();
  if(data.algorithm!=='PBKDF2-SHA256'||!Number.isInteger(data.iterations)||data.iterations<310000||data.iterations>1000000||
     !/^[A-Za-z0-9_-]+$/.test(data.salt)||!/^[A-Za-z0-9_-]{32,64}$/.test(data.nonce))throw new Error('CHALLENGE_INVALID');
  return data;
}
async function prove(password,email,challenge){
  // High-cost PBKDF2 runs in the user's browser, never in the edge CPU budget.
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const raw=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(challenge.salt),iterations:challenge.iterations},key,256);
  const proofKey=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64(await crypto.subtle.sign('HMAC',proofKey,encoder.encode('ia.login.v1.'+challenge.nonce+'.'+email)));
}
form.addEventListener('submit',async event=>{
  event.preventDefault();result.textContent='';if(!form.reportValidity())return;
  submit.disabled=true;
  const email=form.elements.email.value.trim().toLowerCase();
  let password=form.elements.password.value;
  try{
    const challenge=await getChallenge();
    const proof=await prove(password,email,challenge);
    password='';form.elements.password.value='';
    const response=await fetch('/api/ia/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,nonce:challenge.nonce,proof}),cache:'no-store',redirect:'error'});
    if(response.ok){
      const incoming=new URLSearchParams(location.search), view=incoming.get('returnView');
      const target=new URLSearchParams();
      if(['qa-lab','research-r3','pricing-r3','roles-r3','workflow-r3','simple-r3','detailed-r3','businesses-r3','product-r3'].includes(view))target.set('view',view);
      if(incoming.has('labRun')){
        const run=incoming.get('labRun'),persona=incoming.get('persona');
        if(/^[a-f0-9]{32}$/.test(run)&&['buyer','supplier','operator','guest'].includes(persona)){target.set('labRun',run);target.set('persona',persona);const documentId=incoming.get('qaDocument');if(documentId&&/^[a-f0-9-]{36}$/.test(documentId))target.set('qaDocument',documentId);}
        else target.set('view','qa-lab');
      }
      if(['product-r3','research-r3'].includes(view))for(const name of ['screen','state','componentVariant','mode']){const value=incoming.get(name);if(value&&/^[-\w]{1,100}$/.test(value))target.set(name,value);}
      if(view==='qa-lab'){
        const screen=incoming.get('screen'),width=incoming.get('width');
        if(screen && /^[\w./:-]{1,200}$/.test(screen))target.set('screen',screen);
        if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(width))target.set('width',width);
        if(incoming.get('archive')==='1')target.set('archive','1');
        if(['current','previous','prior-r3','recorded'].includes(incoming.get('version')))target.set('version',incoming.get('version'));
        const artifactHash=incoming.get('artifactHash');if(artifactHash&&/^[a-f0-9]{64}$/.test(artifactHash))target.set('artifactHash',artifactHash);
        for(const key of ['state','variant','componentVariant']){const value=incoming.get(key);if(value&&/^[-\w]{1,100}$/.test(value))target.set(key,value);}
      const run=incoming.get('run'),page=incoming.get('page'),persona=incoming.get('persona');if(run&&/^[a-f0-9]{32}$/.test(run))target.set('run',run);if(page&&/^[-\w]{1,100}$/.test(page))target.set('page',page);if(['buyer','supplier','operator','guest'].includes(persona))target.set('persona',persona);
      }
      if(view==='pricing-r3'){
        if(incoming.get('mode')==='contract')target.set('mode','contract');
        if(incoming.get('practice')==='1')target.set('practice','1');
        for(const key of ['priceVersion','quote']){
          const value=incoming.get(key);
          if(value&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value))target.set(key,value);
        }
      }
      if(view==='roles-r3'&&incoming.get('menu')==='consult')target.set('menu','consult');
      location.assign(target.size?'/ia?'+target:'/ia/');return;
    }
    let error='';if((response.headers.get('content-type')||'').includes('application/json'))try{error=(await response.json()).error||''}catch{}
    result.textContent=message(response.status,error);
  }catch(err){result.textContent=err.status?message(err.status):'로그인 요청 중 통신 또는 암호화 오류가 발생했습니다. 비밀번호 오류가 아닐 수 있습니다.'}
  finally{password='';form.elements.password.value='';submit.disabled=false;}
});
