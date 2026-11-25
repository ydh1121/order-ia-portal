import {browserFunction} from '../browser-source.mjs';
import {installResearchAuthPolish} from './auth-polish.mjs';
import {installResearchAuthMotion} from './auth-motion.mjs';
import {researchGoogleSignInButton} from './auth-provider-assets.mjs';

/** The ordinary product sheet keeps its guarded entry. An explicitly selected
 * QA scenario may display an authored response state without sending an email
 * or claiming that an authentication provider accepted an operation. */
export function researchAuthSheetSource(source){
  const entryGuard=/if\s*\(\s*\[\s*(['"])success\1\s*,\s*\1verified\1\s*,\s*\1sent\1\s*,\s*\1complete\1\s*,\s*\1loading\1\s*,\s*\1sending\1\s*\]\s*\.includes\(entry\)\s*\)\s*return false;/g;
  if([...source.matchAll(entryGuard)].length!==1)throw Error('RESEARCH_AUTH_SHEET_SOURCE_CHANGED');
  // The regular email editor uses a text control for its selection/IME model.
  // Keep the authored message, timer and focus path, using that editor's parser
  // instead of the native email-only validity flag that no longer applies.
  const emailValidity='input.validity.typeMismatch';
  if(source.split(emailValidity).length!==2)throw Error('RESEARCH_AUTH_EMAIL_SOURCE_CHANGED');
  const replaceOne=(text,from,to)=>{
    if(text.split(from).length!==2)throw Error('RESEARCH_AUTH_PRESENTATION_SOURCE_CHANGED: '+from.slice(0,90));
    return text.replace(from,to);
  };
  const replaceSyntax=(text,from,to)=>{
    if([...text.matchAll(from)].length!==1)throw Error('RESEARCH_AUTH_PRESENTATION_SOURCE_CHANGED: '+from.source.slice(0,90));
    return text.replace(from,to);
  };
  let result=source.replace(entryGuard,match=>match.replace(/if\s*\(/,'if(!api.reviewScenario&&'))
    .replace(emailValidity,'!w.OrderEmail.parse(input.value).valid');
  const providerAssignment=/window\.ORDER_QA_PROVIDER_BUTTONS=([^\n]+);\n/g;
  const providers=[...result.matchAll(providerAssignment)];
  if(providers.length!==1)throw Error('RESEARCH_AUTH_PROVIDER_SOURCE_CHANGED');
  const providerRecords=JSON.parse(providers[0][1]);
  if(providerRecords.google?.pngSha256!=='707f430da8d0de13091baa30729a49475cd84af6b1d849b2a76aeabe0c093397')throw Error('RESEARCH_AUTH_PROVIDER_SOURCE_CHANGED');
  providerRecords.google=researchGoogleSignInButton;
  result=result.replace(providerAssignment,()=> 'window.ORDER_QA_PROVIDER_BUTTONS='+JSON.stringify(providerRecords)+';\n');
  // This installer crosses Function#toString in the Worker. Formatting and
  // quote choice may change under esbuild; retain one structural seam each.
  result=replaceSyntax(result,/disposeShared\s*=\s*null\s*,\s*viewEpoch\s*=\s*0/g,'disposeShared=null,disposePolish=null,viewEpoch=0');
  result=replaceSyntax(result,/function\s+clearView\s*\(\s*\)\s*\{\s*viewEpoch\s*\+\+\s*;/g,'function clearView(){viewEpoch++;disposePolish?.();disposePolish=null;');
  result=replaceSyntax(result,/const\s+viewApi\s*=\s*\{\s*\.\.\.api\s*,\s*screen\s*:\s*id\s*,/g,"const viewApi={...api,authState:window.ORDER_RESEARCH_AUTH_POLISH.state(api,id,next),performAction:typeof api.performAction==='function'?(...args)=>window.ORDER_RESEARCH_AUTH_POLISH.performAction(api,holder,...args):undefined,screen:id,");
  result=replaceSyntax(result,/namespace\s*\(\s*scene\s*,\s*id\s*\)\s*;/g,'namespace(scene,id);disposePolish=window.ORDER_RESEARCH_AUTH_POLISH.mount(holder,viewApi);');
  result=replaceSyntax(result,/\(\s*\)\s*=>\s*api\.select\(\s*(['"])onboarding\1\s*,\s*(['"])member-\2\s*\+\s*originState\.slice\(\s*-1\s*\)\s*\)/g,"()=>api.select('onboarding',id==='otp'&&next==='verified'?'member-4':'member-'+originState.slice(-1))");
  result=replaceOne(result,"if(!signal?.aborted&&result?.confirmed===true)callback?.();","if(!signal?.aborted&&result?.confirmed===true)return w.ORDER_RESEARCH_AUTH_POLISH.finish(btn,callback,signal);");
  result=replaceOne(result,"index=w.ORDER_ADMIN_MOTION?.mountScrollIndex(root,{reduced:api.reduced,regionSelector:'.terms-body',headingSelector:'h3'});",'index=null;');
  result=replaceOne(result,'비밀번호를 확인해 주세요.','비밀번호가 틀렸어요.');
  result=replaceOne(result,'이메일을 확인해 주세요.','등록된 이메일 정보가 없어요.');
  result=replaceOne(result,"const c=new AbortController(),session=pendingTermsSession,check=root.querySelector('[name=terms-check]');","const c=new AbortController(),session=pendingTermsSession,check=root.querySelector('[name=terms-check]');root.dataset.termsContext=session?.draft||api.reviewScenario&&s==='missing'?'consent':'read';");
  result=replaceOne(result,"if(!ready)return;","if(!ready)return;if(root.dataset.termsContext==='read'){api.select('login','closed');return;}");
  result=result.replaceAll('영문·숫자·특수문자를 포함해 10자 이상 입력해 주세요.','영문, 숫자, 특수문자를 포함해 10자 이상 입력해 주세요.')
    .replaceAll('이메일 양식을 확인해 주세요.','이메일 양식을 확인해 주세요')
    .replaceAll('입력한 비밀번호가 달라요.','비밀번호를 입력해 주세요')
    .replaceAll('비밀번호를 한 번 더 입력해 주세요.','비밀번호를 입력해 주세요')
    .replace('[선택] 시세 변동 알림·소식·혜택 받기','[선택] 시세 변동 알림·소식·혜택 받기 (마케팅 수신 동의)')
    .replace('계란 시세가 바뀌면 알려드려요. 시세 변동 알림을 받으실까요?','계란 시세가 바뀔 때 꼭 필요한 소식만 알려드려요. 알림을 끄면 시세 변동은 직접 확인하셔야 해요. 받아보실까요?');
  return '('+browserFunction(installResearchAuthMotion)+')(window);\n('+browserFunction(installResearchAuthPolish)+')(window);\n'+result;
}
