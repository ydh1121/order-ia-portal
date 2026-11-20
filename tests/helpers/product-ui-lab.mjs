// Test-only transport: browser modules call the canonical handler and SQLite D1.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProductLab} from '../../src/server/product-lab.mjs';
export async function createProductUiLab(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
  const prepare=(query,params=[])=>({query,params,bind:(...args)=>prepare(query,args),first:async()=>sqlite.prepare(query).get(...params)||null,all:async()=>({results:sqlite.prepare(query).all(...params)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...params).changes)}})});
  const db={prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements){const compiled=sqlite.prepare(statement.query);result.push(compiled.columns().length?{results:compiled.all(...statement.params),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...statement.params).changes)}});}sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const env={ORDER_LAB_DB:db,ORDER_QA_DB:{prepare(){throw Error('Production access during UI test');}},CF_PAGES_COMMIT_SHA:'ui-canonical-handler'},owner={id:'ui-review-owner',role:'OWNER',expiresAt:Date.now()/1000+43200};
  const invoke=async(path,body)=>{const request=new Request('https://lab.test/api/ia/lab'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://lab.test','X-IA-CSRF':'csrf'},body:JSON.stringify(body)}:{});const response=await handleProductLab({request,env,actor:owner,path,csrf:'csrf',clock:()=> '2026-11-20T00:00:00.000Z'});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{code:value.error,status:response.status});return value;};
  const {run}=await invoke('/runs',{label:'공통 UI 실제 저장 검증',requestKey:crypto.randomUUID()});
  const transports=new Map();
  const adapter=role=>{if(!transports.has(role))transports.set(role,{selectedPurchaseId:null,calls:[],async request(path,body){this.calls.push({path,body});return invoke('/runs/'+run.id+'/as/'+role+'/product'+path,body);}});return transports.get(role);};
  return {run,adapter,close:()=>sqlite.close()};
}
