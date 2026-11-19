import test from 'node:test';
import assert from 'node:assert/strict';
import {signedWorkspace,origin,issueExampleQuote} from './r3-business-identities.fixture.mjs';
import {handleIaRequest} from '../src/server/router.mjs';

test('registered product, independently verified request, explicit single-product draft assignment and revocation',async()=>{
  const f=signedWorkspace();
  f.db.exec("DELETE FROM r3_price_catalog; DELETE FROM r3_price_scope");
  const base='/api/ia/r3-price';
  async function api(actor,path,body,csrf){
    const headers={'Cf-Access-Jwt-Assertion':f.assertion(actor),Origin:origin,'Content-Type':'application/json'};
    if(body){
      const session=await handleIaRequest(new Request(origin+base+'/session',{headers}),f.env,{fetcher:f.certs});
      headers['X-IA-CSRF']=csrf??(await session.json()).csrf;
    }
    const result=await handleIaRequest(new Request(origin+base+path,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}),f.env,{fetcher:f.certs});
    return {status:result.status,body:await result.json()};
  }
  const product={action:'product',supplierId:'farm',supplierName:'공급처',originName:'출고장',productName:'검수 계란',shell:'2',packSize:30,requestKey:crypto.randomUUID()};
  const desk=(await api('operator','/registration')).body;
  assert.ok(desk.organizations.some(item=>item.supplierId==='farm'&&item.role==='OPERATOR'));
  assert.equal((await api('unassigned','/registration',product)).status,403);
  assert.equal((await api('supplier','/registration',{...product,supplierId:'store'})).status,403);
  assert.equal((await api('supplier','/registration',product,'wrong')).status,403);
  const scope=(await api('operator','/registration',product)).body;
  assert.ok(scope.product_id && scope.origin_id);
  assert.deepEqual((await api('operator','/registration',product)).body,scope);
  const second=(await api('supplier','/registration',{...product,productName:'다른 계란',requestKey:crypto.randomUUID()})).body;
  assert.equal(scope.origin_id,second.origin_id);
  assert.notEqual(scope.product_id,second.product_id);
  assert.equal(f.db.prepare("SELECT count(*) n FROM r3_price_scope").get().n,2);
  const invite=(await api('operator','/registration')).body.organizations.find(o=>o.supplierId==='farm').invitation;
  const request={action:'request',supplierName:'공급처',invite,requestKey:crypto.randomUUID()};
  const requested=(await api('unassigned','/registration',request)).body;
  assert.equal(requested.state,'PENDING');
  assert.deepEqual((await api('unassigned','/registration',request)).body,requested);
  assert.deepEqual((await api('unassigned','/desk')).body.scopes,[]);
  assert.equal((await api('unassigned','/registration')).body.own[0].state,'PENDING');
  assert.equal((await api('operator','/registration')).body.review[0].verified,1);
  const link={action:'link',id:requested.id,supplierId:'farm',originId:scope.origin_id,productId:scope.product_id};
  assert.equal((await api('supplier','/registration',link)).status,409);
  assert.equal((await api('unassigned','/registration',link)).status,409);
  assert.equal((await api('operator','/registration',link)).body.state,'LINKED');
  const visible=(await api('unassigned','/desk')).body.scopes;
  assert.equal(visible.length,1);assert.equal(visible[0].product_id,scope.product_id);assert.equal(visible[0].role,'WRITER');
  const {grades}=visible[0].definition;
  const policy={supplierId:'farm',originId:scope.origin_id,productId:scope.product_id,groupId:'eggs',unit:'tray',packaging:'s2.p30',policyId:'scope-test',currency:'KRW',timeZone:'Asia/Seoul',packSize:30,minimumOrder:10,effectiveFrom:'2026-11-01T15:00:00.000Z',effectiveTo:null,rounding:'HALF_UP',discount:{ruleId:'none',type:'NONE'},tax:{ruleId:'inc',type:'INCLUDED'},performance:{basis:'DELIVERY'},matrix:{schema:1,shell:'2',grades,rows:[{min:1,max:null,cells:['5,980원','+210','',0,'협의','판매 안 함','5,000','5,210']}]},delivery:{ruleSetId:'terms',regionVersion:'v1',groupBasis:'SHIPMENT',regions:[]}};
  const write={id:'first-version',action:'create',expectedRevision:0,requestKey:crypto.randomUUID(),policy};
  assert.equal((await api('unassigned','/version',{...write,policy:{...policy,productId:second.product_id}})).status,403);
  assert.equal((await api('unassigned','/version',write)).body.status,'DRAFT');
  assert.deepEqual((await api('unassigned','/version?id=first-version')).body.version.policy.matrix.rows[0].cells,['5980','+210','','0','협의','미판매','5000','5210']);
  assert.equal((await api('unassigned','/version',{action:'approve',id:write.id,expectedRevision:1,requestKey:crypto.randomUUID()})).status,403);
  assert.equal(f.db.prepare("SELECT count(*) n FROM r3_membership WHERE actor_id='unassigned'").get().n,0);
  assert.equal((await api('operator','/registration',{...link,action:'revoke'})).body.state,'REVOKED');
  assert.equal((await api('unassigned','/version?id=first-version')).status,403);
  assert.equal((await api('unassigned','/desk')).body.scopes.length,0);
});

test('same-condition refill projects only the verified site’s frozen nonfinancial inputs, including after expiry',async()=>{
  const f=signedWorkspace(),id=await issueExampleQuote(f);
  const read=async(actor,quoteId=id)=>{const response=await f.request(actor,'/api/ia/r3-price/quote-inputs?id='+quoteId);return {status:response.status,body:await response.json()};};
  const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const expected={orgId:'store',siteId:'site',status:'REVIEW_INPUTS',offerId:'version',quantity:3,serviceDate:date,grade:null,packing:null};
  assert.deepEqual((await read('buyer')).body,expected);
  assert.equal((await read('buyer2')).status,403);assert.equal((await read('supplier')).status,403);
  // Old immutable records are copied into this isolated fixture with a historical issue/expiry.
  const fields=f.db.prepare("PRAGMA table_info(r3_price_quote)").all().map(x=>x.name);
  const original=f.db.prepare("SELECT * FROM r3_price_quote WHERE id=?").get(id);
  const writeCopy=(patch)=>{const row={...original,...patch};f.db.prepare('INSERT INTO r3_price_quote('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>row[k]));};
  writeCopy({id:'expired-quote',issued_at:'2023-01-01T00:00:00.000Z',expires_at:'2023-01-08T00:00:00.000Z',request_key:'expired-example'});
  assert.deepEqual((await read('buyer','expired-quote')).body,expected);
  const source=JSON.parse(original.sources_json);source.lines.push({...source.lines[0],id:'two'});
  writeCopy({id:'multi',request_key:'multiple-example',sources_json:JSON.stringify(source)});
  assert.deepEqual((await read('buyer','multi')).body,{orgId:'store',siteId:'site',status:'REVIEW_LINES'});
  f.db.prepare("UPDATE r3_price_scope SET active=0 WHERE supplier_id='farm'").run();
  assert.deepEqual((await read('buyer')).body,{...expected,offerId:null});
  f.db.prepare("UPDATE r3_business_site SET verification='REVOKED' WHERE org_id='store'").run();
  assert.equal((await read('buyer')).status,403);
});
