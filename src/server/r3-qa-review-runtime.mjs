// R1 owns review/navigation. Product modules own UI. This layer supplies only
// deterministic, in-memory QA state and source identity to the opaque frame.
import {qaReviewRuntimeScript,qaReviewRuntimeCss,qaReviewRuntimeDigest,qaReviewRuntimeSources} from './r3-ui/qa-review-runtime.gen.mjs';
import {approvedWidths} from './r3-ui/approved-width-list.mjs';

const enc=new TextEncoder(),identities=new Map();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
export function qaFixtureForRow(row){
  const auth=['login','signup','password','otp','terms'].includes(row.screen);
  const authComplete=row.screen==='login'&&row.state==='success'||row.screen==='otp'&&row.state==='verified';
  const guest=(auth&&!authComplete)||row.screen==='onboarding'&&!row.state.startsWith('member-')||row.state.startsWith('guest-')||['guest','qa-guest'].includes(row.state)||row.screen==='account-settings'&&row.state==='closed'||
    row.screen==='admin-access'||row.screen==='session-access'&&['expired','signed-out','oauth-cancel','unverified','draft'].includes(row.state);
  const scenario=row.state==='qa-loading'?'loading':row.state==='qa-error'?'error':row.state==='qa-empty'?'empty':'normal';
  const persona=row.role==='supplier'?'supplier':row.role==='admin'||row.screen==='receipt'?'operator':'buyer';
  return {authenticated:!guest,persona,scenario,
    arrival:row.screen==='onboarding'&&row.state==='member-4'||authComplete,...row.fixture};
}
export async function qaReviewHash(row,contentHash){
  if(!contentHash)return undefined;
  const value=JSON.stringify(['order-r1-review-runtime/v1',contentHash,qaReviewRuntimeDigest,qaFixtureForRow(row)]);
  if(!identities.has(value))identities.set(value,sha(value));
  return identities.get(value);
}
export async function qaReviewHashes(row,hashes){
  return Object.fromEntries(await Promise.all(approvedWidths.filter(width=>hashes[width]).map(async width=>[width,await qaReviewHash(row,hashes[width])])));
}
export function qaSourceForRow(row,contentHash){
  const files=row.sourceFiles||row.provenance?.files||
    (row.screen==='price-workspace'?['src/server/r3-price-workspace-page.mjs','src/server/r3-price-workspace-client.mjs','src/server/r3-price-workspace-model.mjs']:
      row.runtimeFamily?['src/server/product-ui/runtime.gen.mjs',...({integratedLogin:['scripts/r3/authored/account.js','scripts/r3/authored/integrated-login.mjs'],accountFeedback:['scripts/r3/authored/account.js'],account:['scripts/r3/authored/account.js'],onboarding:['scripts/r3/authored/onboarding.js'],navigation:['scripts/r3/authored/navigation.js'],business:['scripts/r3/authored/business.js'],questions:['scripts/r3/authored/questions.js'],quoteJourney:['scripts/r3/authored/quote-journey.mjs'],sharedQuoteResult:['src/server/r3-quote-result.mjs'],adminCommon:['scripts/r3/authored/admin-common.mjs'],adminLoading:['scripts/r3/authored/admin-common.mjs','scripts/r3/authored/selected-loading.mjs']}[row.runtimeFamily]||[])]:
      ['src/server/product-ui/documents.mjs','src/server/product-ui/modules.mjs']);
  return {format:'order-qa-source/v1',mode:'controlled-qa',contentHash,runtimeDigest:qaReviewRuntimeDigest,
    files:[...new Set(files)],sharedFiles:qaReviewRuntimeSources,persistence:'frame-memory',...(row.provenance?{provenance:row.provenance}:{})};
}
export async function withQaReviewRuntime(artifact,row){
  const contentHash=artifact.hash,hash=await qaReviewHash(row,contentHash),source=qaSourceForRow(row,contentHash),fixture=qaFixtureForRow(row);
  let html=artifact.html.replace('</style>','\n'+qaReviewRuntimeCss+'</style>');
  let editable=artifact.editable.replace('</style>','\n'+qaReviewRuntimeCss+'</style>');
  // Static exports retain the same source identity without executable transports.
  const metadata=/<script type="application\/json" id="frame-meta">([\s\S]*?)<\/script>/;
  const meta={release:artifact.release,artifactHash:hash,version:'current',screen:row.screen,state:row.state,variant:row.variant,
    viewport:Number(artifact.viewport),source,fixture};
  const json=JSON.stringify(meta).replaceAll('<','\\u003c');
  if(metadata.test(editable))editable=editable.replace(metadata,(_,raw)=>'<script type="application/json" id="frame-meta">'+JSON.stringify({...JSON.parse(raw),...meta}).replaceAll('<','\\u003c')+'</script>');
  else editable=editable.replace('</body>','<script type="application/json" id="frame-meta">'+json+'</script></body>');
  return {...artifact,hash,html,editable,exportHash:await sha(editable),fixture,source,qaRuntime:qaReviewRuntimeScript};
}
export {qaReviewRuntimeDigest};
