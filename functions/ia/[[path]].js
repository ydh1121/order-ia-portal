/** Private Pages Function entry point. No confidential planning data is ever static. */
import {requireActor} from '../../src/server/auth.mjs';
const h={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',Vary:'Cookie, Cf-Access-Jwt-Assertion','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin'};
export async function onRequest({request,env}){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{...h,Allow:'GET, HEAD'}});
  let actor;try{actor=await requireActor(request,env)}catch{return new Response(null,{status:302,headers:{...h,Location:'/login.html'}})}
  if(actor.role!=='OWNER')return new Response('Forbidden',{status:403,headers:h});
  // All dynamic IA data must be retrieved from /api/ia/* after the same server authentication.
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>order.ooo IA — 개인 업무 공간</title><link rel="stylesheet" href="/owner.css"></head><body><main class="panel"><div class="eyebrow">ORDER.ooo · PRIVATE</div><h1>내부 IA 업무 공간</h1><p>본인 계정 인증이 확인되었습니다. 실제 IA 원장과 정책은 Google 읽기 권한이 설정된 후에만 조회합니다.</p><div id="user-state" role="status">권한 정보를 확인하고 있습니다.</div><section><h2>업무 자료</h2><p>현재는 인증된 API 연결 전 단계입니다. 화면 원장·검토 사항의 내용은 이 HTML에 포함되어 있지 않습니다.</p><button id="load-screens" type="button">화면 원장 조회</button><pre id="data-result" role="status" aria-live="polite"></pre></section><button id="logout" type="button" class="secondary">로그아웃</button></main><script src="/owner.js" defer></script></body></html>`;
  return new Response(request.method==='HEAD'?null:html,{status:200,headers:{...h,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
}
