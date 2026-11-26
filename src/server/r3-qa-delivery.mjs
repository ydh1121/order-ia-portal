import {researchBuild} from './research-app/assets.gen.mjs';
import {qaCatalogIdentity} from './r3-qa-catalog-identity.gen.mjs';
import {readPublicationReceipt} from './r3-qa-publication-receipt.mjs';
import {deliveryBuild,hasDeliveryBuild,deliveryResearchRow,deliveryResearchArtifact,deliveryArchivedResearchArtifact} from './research-release-delivery.mjs';
import {RESEARCH_RELEASE_WIDTHS,researchReviewIdentity,listResearchReleaseBuilds} from './research-app/release-store.mjs';

const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none';frame-ancestors 'none';sandbox",'X-Robots-Tag':'noindex'};
const json=(value,status=200)=>Response.json(value,{status,headers});
const catalogHeaders={...headers,'Content-Type':'application/json'};
const supportedKeys=new Set(['id','width','version','artifactHash','mode']);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const identityHash=(build,id,width,mode)=>hash(new TextEncoder().encode(JSON.stringify(researchReviewIdentity(build,id,width,mode))));
const active=env=>typeof env?.ASSETS?.fetch==='function'&&qaCatalogIdentity.build===researchBuild.digest&&researchBuild.digest===deliveryBuild;

async function catalogResponse(mode,env,url){
  const {sha256,bytes,publicationOffset}=qaCatalogIdentity.modes[mode];
  const file=new URL('/ia/research-releases/qa-catalog/'+sha256+'.json',url.origin);
  const [response,publication]=await Promise.all([
    env.ASSETS.fetch(new Request(file,{redirect:'manual'})),
    readPublicationReceipt(env.ORDER_QA_DB,url.hostname,qaCatalogIdentity.publication)
  ]);
  if(response.status!==200||response.redirected)throw Error('QA_CATALOG_UNAVAILABLE');
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length!==bytes||await hash(data)!==sha256)throw Error('QA_CATALOG_INTEGRITY');
  if(!publication)return new Response(data,{headers:catalogHeaders});
  const body=new Blob([data.subarray(0,publicationOffset),JSON.stringify(publication),data.subarray(publicationOffset+4)]);
  return new Response(body,{headers:catalogHeaders});
}

async function researchBuildFor(id,width,pinned,mode){
  if(!pinned)return deliveryBuild;
  if(!/^[0-9a-f]{64}$/.test(pinned))return null;
  if(pinned===await identityHash(deliveryBuild,id,width,mode))return deliveryBuild;
  // Check immutable identity first: asking whether a raw pin belongs to another
  // research release must not inflate each release's row table.
  const others=listResearchReleaseBuilds().filter(build=>build!==deliveryBuild);
  const matches=await Promise.all(others.map(async build=>(await identityHash(build,id,width,mode))===pinned));
  return others.find((_,index)=>matches[index])||null;
}

// The API router performs its normal OWNER check before calling this function.
export async function serveDeliveredQaArtifact(request,env){
  if(active(env)&&request.method==='GET'){
    const url=new URL(request.url),q=url.searchParams,mode=q.get('mode')??'simple';
    if(!['simple','detailed'].includes(mode)||q.getAll('mode').length>1)return json({error:'INVALID_REVIEW_MODE'},400);
    if(!q.has('id')){
      if(q.size&&!(q.size===1&&q.has('mode')))return json({error:'INVALID_CATALOG_REQUEST'},400);
      return catalogResponse(mode,env,url);
    }
    const id=q.get('id'),width=Number(q.get('width')),version=q.get('version'),pinned=q.get('artifactHash');
    const validQuery=RESEARCH_RELEASE_WIDTHS.includes(width)&&[...q.keys()].every(key=>supportedKeys.has(key));
    if(validQuery&&version==='previous'&&mode==='simple'){
      const {previousAuthoredArtifact}=await import('./r3-previous-artifact.mjs');
      const previous=await previousAuthoredArtifact(id,width,pinned);
      return previous?json(previous):json({error:'UNKNOWN_REVIEW_TARGET'},404);
    }
    if(validQuery&&version==='prior-r3'&&pinned&&mode==='simple'){
      // The approved shell rewrites a restored original pin to prior-r3 on reload.
      const {serveDeliveredRecordedArtifact}=await import('./r1-recorded-delivery.mjs');
      const prior=await serveDeliveredRecordedArtifact(id,width,pinned,env,url.origin,'prior-r3');
      if(prior)return json(prior);
    }
    if(validQuery&&['current','recorded'].includes(version)){
      const build=(pinned||version==='current')?await researchBuildFor(id,width,pinned,mode):null;
      if(build===deliveryBuild){
        const row=await deliveryResearchRow(id,env,url.origin);
        if(row)return json(await deliveryResearchArtifact(row,width,env,url.origin,mode));
      }else if(build){
        const artifact=await deliveryArchivedResearchArtifact(id,width,pinned,env,url.origin,mode,build);
        if(artifact)return json(artifact);
      }
      if(mode==='detailed')return json({error:'UNKNOWN_REVIEW_TARGET'},404);
      if(pinned&&!build){
        const {serveDeliveredRecordedArtifact}=await import('./r1-recorded-delivery.mjs');
        const recorded=await serveDeliveredRecordedArtifact(id,width,pinned,env,url.origin);
        if(recorded)return json(recorded);
        const {serveDeliveredReviewedArtifact}=await import('./reviewed-delivery.mjs');
        const successor=await serveDeliveredReviewedArtifact(id,width,pinned,env,url.origin);
        if(successor)return json(successor);
      }
    }
  }
  const {serveR3Artifact}=await import('./r3-qa-page.mjs');
  return serveR3Artifact(request,env);
}

export async function isDeliveredReviewTarget(target,revision,env,origin){
  if(active(env)&&revision==='MSG0585-R3'&&target&&RESEARCH_RELEASE_WIDTHS.includes(target.viewport)){
    const mode=target.mode??'simple';
    if((!Object.hasOwn(target,'mode')||['simple','detailed'].includes(target.mode))&&target.artifactHash){
      const id=[target.screen,target.state,target.variant].join('/');
      const build=await researchBuildFor(id,target.viewport,target.artifactHash,mode);
      if(build&&hasDeliveryBuild(build)){
        return Boolean(await deliveryResearchRow(id,env,origin,build));
      }
      if(!build&&mode==='simple'){
        const {isDeliveredReviewedTarget}=await import('./reviewed-delivery.mjs');
        if(await isDeliveredReviewedTarget(id,target.viewport,target.artifactHash,env,origin))return true;
      }
    }
  }
  const {isR3ReviewTarget}=await import('./r3-qa-page.mjs');
  return isR3ReviewTarget(target,revision);
}
