/** Google OAuth service account read-only adapter; env-only credentials, never bundled into public/. */
const enc = new TextEncoder();
const b64u = input => btoa(String.fromCharCode(...input)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const TABS = Object.freeze({
  screens: "'화면_관리'!A1:S77",
  decisions: "'향후_검토'!A1:N26",
  roadmap: "'사업_로드맵'!A1:G8",
  guide: "'사용_안내'!A1:C24",
  notes: "'의견_기록'!A1:K250"
});
async function tokenFor(env, fetcher) {
  let account;
  try{account=JSON.parse(env.IA_GOOGLE_SERVICE_ACCOUNT_JSON||'')}catch{throw new Error('GOOGLE_ACCOUNT_NOT_CONFIGURED')}
  if(!account||account.type!=='service_account'||!account.client_email||!account.private_key||account.token_uri!=='https://oauth2.googleapis.com/token') throw new Error('GOOGLE_ACCOUNT_NOT_CONFIGURED');
  const header=b64u(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const now=Math.floor(Date.now()/1000);
  const payload=b64u(enc.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:account.token_uri,iat:now,exp:now+900})));
  const pem=account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const bytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+payload));
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+payload+'.'+b64u(new Uint8Array(sig))});
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
  if(!response.ok) throw new Error('GOOGLE_TOKEN_DENIED');
  const data=await response.json();
  if(!data.access_token||data.token_type!=='Bearer') throw new Error('GOOGLE_TOKEN_DENIED');
  return data.access_token;
}
export async function fetchTab(env, tab, fetcher=fetch) {
  if(!Object.prototype.hasOwnProperty.call(TABS,tab)) throw new Error('UNKNOWN_TAB');
  if(env.IA_GOOGLE_READ_ENABLED!=='true') throw new Error('GOOGLE_READ_DISABLED');
  const sheetId=env.IA_GOOGLE_SHEET_ID;
  if(typeof sheetId!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(sheetId)) throw new Error('GOOGLE_SHEET_NOT_CONFIGURED');
  const token=await tokenFor(env,fetcher);
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet?'+new URLSearchParams({ranges:TABS[tab],valueRenderOption:'FORMATTED_VALUE'});
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok) throw new Error('GOOGLE_READ_FAILED');
  const json=await response.json();
  if(!Array.isArray(json.valueRanges)||json.valueRanges.length!==1) throw new Error('GOOGLE_RESPONSE_INVALID');
  return json.valueRanges[0].values||[];
}

/** One owner-only provider read for the existing five operational tabs.
 * This never caches Google data or credentials in a public asset.
 */
export async function fetchDashboardTabs(env,fetcher=fetch){
  if(env.IA_GOOGLE_READ_ENABLED!=='true')throw new Error('GOOGLE_READ_DISABLED');
  const sheetId=env.IA_GOOGLE_SHEET_ID;
  if(typeof sheetId!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(sheetId))throw new Error('GOOGLE_SHEET_NOT_CONFIGURED');
  const token=await tokenFor(env,fetcher);
  const keys=['screens','decisions','roadmap','guide','notes'];
  const params=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
  for(const key of keys)params.append('ranges',TABS[key]);
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet?'+params;
  const res=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!res.ok)throw new Error(res.status===403||res.status===404?'GOOGLE_SHEET_NOT_SHARED':'GOOGLE_READ_FAILED');
  const body=await res.json();
  if(!Array.isArray(body.valueRanges)||body.valueRanges.length!==keys.length)throw new Error('GOOGLE_RESPONSE_INVALID');
  const out={};
  for(let i=0;i<keys.length;i++){
    const valueRange=body.valueRanges[i];
    if(!Array.isArray(valueRange.values)||valueRange.values.length<2)throw new Error('GOOGLE_RESPONSE_INVALID');
    // Sheets may normalize range notation in its response; positional pairing comes from the one batch request.
    out[keys[i]]=valueRange.values;
  }
  return out;
}
