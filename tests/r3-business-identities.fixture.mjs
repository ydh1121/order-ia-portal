import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleIaRequest} from '../src/server/router.mjs';
export const origin='https://order-ia-portal.pages.dev';
export function signedWorkspace({emptyPriceCatalog=false}={}){
  const db=new DatabaseSync(':memory:');
  const folder=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,folder),'utf8'));
  function prepare(sql,params=[]){const stmt=db.prepare(sql);return {
    bind:(...values)=>prepare(sql,values),first:async()=>stmt.get(...params),
    all:async()=>({results:stmt.all(...params)}),run:async()=>({meta:stmt.run(...params)})};}
  const store={prepare,async batch(list){db.exec('BEGIN');try{const result=[];for(const q of list)result.push(await q.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const team='https://order-business-test.cloudflareaccess.com',aud='r3_workflow_fixture_business',keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...keys.publicKey.export({format:'jwk'}),kid:'r3-business-test',alg:'RS256'};
  const certs=async url=>{if(url!==team+'/cdn-cgi/access/certs')throw Error('external fetch is disabled in this fixture');return Response.json({keys:[jwk]});};
  const objects=new Map();
  const bucket={put:async(k,b)=>objects.set(k,new Uint8Array(b)),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{size:objects.get(k).length,body:objects.get(k)}:null};
  const env={IA_ACCESS_TEAM_DOMAIN:team,IA_BUSINESS_ACCESS_AUD:aud,ORDER_QA_DB:store,ORDER_PRIVATE_EVIDENCE:bucket};
  if(emptyPriceCatalog){
    // Already authorized fixture subjects start without any catalog, assignment or price version.
    // Supplier and operator can only act within their shared farm.
    db.exec("INSERT INTO r3_membership VALUES('operator','OPERATOR','farm','',1),('supplier','SUPPLIER','farm','',1),('supplier2','SUPPLIER','other-farm','',1)");
  }else{
    db.exec("INSERT INTO r3_membership VALUES('buyer','BUYER','store','site',1),('buyer2','BUYER','other','site',1),('supplier','SUPPLIER','farm','',1),('operator','OPERATOR','store','',1),('operator','OPERATOR','farm','',1); INSERT INTO r3_release_admin VALUES('operator',1); INSERT INTO r3_business_site VALUES('store','site','VERIFIED',1); INSERT INTO r3_price_scope VALUES('farm','dep','sku',1); INSERT INTO r3_price_destination VALUES('store','site','1100000000','v1','08843')");
    db.prepare('INSERT INTO r3_price_catalog VALUES(?,?,?,?,?,?,?)').run('farm','dep','sku',1,JSON.stringify({productName:'시험 특란',originName:'시험 출고장',supplierName:'시험 공급사'}),'operator',new Date().toISOString());
  }
  const tokens=new Map();
  function token(id,ttl=3600){
    const now=Math.floor(Date.now()/1000);const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const content=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({iss:team,aud:[aud],sub:id,email:id+'@example.invalid',iat:now-10,exp:now+ttl});
    return content+'.'+sign('RSA-SHA256',Buffer.from(content),keys.privateKey).toString('base64url');
  }
  function assertion(id){if(!tokens.has(id))tokens.set(id,token(id));return tokens.get(id);}
  async function request(id,path,body,override={}){
    const jwt=override.jwt??assertion(id);
    const headers={'Cf-Access-Jwt-Assertion':jwt,Origin:origin,'Content-Type':'application/json'};
    if(body){
      const session=await handleIaRequest(new Request(origin+'/api/ia/r3-role/session',{headers}),env,{fetcher:certs});
      headers['X-IA-CSRF']=override.csrf??(await session.json()).csrf??'';
    }
    return handleIaRequest(new Request(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env,{fetcher:certs});
  }
  async function upload(subject,caseId,bytes){
    const csrf=(await (await request(subject,'/api/ia/r3-role/session')).json()).csrf;
    const headers={'Cf-Access-Jwt-Assertion':assertion(subject),'Content-Type':'application/vnd.order.masked-rasters','Idempotency-Key':crypto.randomUUID(),'X-IA-CSRF':csrf,Origin:origin};
    return handleIaRequest(new Request(origin+'/api/ia/r3-role/evidence?caseId='+caseId,{method:'POST',headers,body:bytes}),env,{fetcher:certs});
  }
  return {db,env,certs,request,assertion,token,upload};
}
export async function issueExampleQuote(f){
  const policy={supplierId:'farm',originId:'dep',productId:'sku',groupId:'eggs',unit:'tray',packaging:'wrapped',policyId:'test',currency:'KRW',timeZone:'Asia/Seoul',packSize:30,minimumOrder:1,effectiveFrom:new Date(Date.now()-86400000).toISOString(),effectiveTo:null,rounding:'HALF_UP',discount:{ruleId:'none',type:'NONE'},tax:{ruleId:'inc',type:'INCLUDED'},performance:{basis:'DELIVERY'},tiers:[{min:1,max:null,price:'100',packMode:'FINAL'}],delivery:{ruleSetId:'terms',regionVersion:'v1',groupBasis:'SHIPMENT',regions:[{id:'local',prefix:'11',label:'시험',priority:1,minimumQty:1,weekdays:[0,1,2,3,4,5,6],status:'FREE',fee:'0'}]}};
  for(const [who,action,expectedRevision] of [['supplier','create',0],['supplier','submit',1],['operator','approve',2]]){
    const r=await f.request(who,'/api/ia/r3-price/version',{id:'version',action,expectedRevision,requestKey:crypto.randomUUID(),...(action==='create'?{policy}:{})});
    if(!r.ok)throw Error(action+' '+await r.text());
  }
  const r=await f.request('buyer','/api/ia/r3-price/quote',{orgId:'store',siteId:'site',requestKey:crypto.randomUUID(),inputRevision:1,lines:[{id:'one',shipmentId:'first',versionId:'version',productId:'sku',deliveryQty:3,unit:'tray',serviceDate:new Date(Date.now()+86400000).toISOString().slice(0,10)}]});
  if(!r.ok)throw Error(await r.text());return (await r.json()).id;
}
