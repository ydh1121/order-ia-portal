// Synthetic unit fixtures only. RSA material is created in memory, never persisted or printed.
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {issueSession} from '../../src/server/owner-session.mjs';
import {QA_DRIVE_PRINCIPAL} from '../../src/server/qa-drive-source.mjs';
import {R3_DOCUMENT_PROFILES} from '../../src/server/qa-r3-document-profile.mjs';
export const origin='https://order-ia-portal.pages.dev';
export function ownerEnv(){return {IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:`pbkdf2-sha256$310000$${randomBytes(16).toString('base64url')}$${randomBytes(32).toString('base64url')}`,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url')}}
export function driveEnv(){const kp=generateKeyPairSync('rsa',{modulusLength:2048});return {env:{IA_QA_DRIVE_READ_ENABLED:'true',IA_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:QA_DRIVE_PRINCIPAL,private_key:kp.privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'})},publicKey:kp.publicKey}}
export function policy(env,now=Math.floor(Date.now()/1000),tuples=R3_DOCUMENT_PROFILES){return {...env,IA_QA_RESEARCH_POLICY_JSON:JSON.stringify({enabled:true,purpose:'FIRST_NATIVE_REVIEW',publication_id:'SYNTHETIC_UNIT_ONLY_0566',parent_origin:origin,expires_at:now+600,tuples:tuples.map(r=>Object.fromEntries(['artifact_id','version','package_sha256','entrypoint_sha256','baseline_commit'].map(k=>[k,r[k]])))})}}
export const selection=r=>new URLSearchParams({artifact_id:r.artifact_id,version:r.version});
export function browserRequest(operation,record,cookie,headers={}){return new Request(origin+'/api/ia/qa/'+operation+'?'+selection(record),{headers:{Cookie:cookie,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Dest':operation==='document'?'iframe':'empty','Sec-Fetch-Mode':operation==='document'?'navigate':'same-origin',...headers}})}
export async function ownerSession(env,now){const s=await issueSession(env,now);return {cookie:s.cookie.split(';')[0],csrf:s.csrf}}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1}return (crc^0xffffffff)>>>0}
export function zipFixture(entries){const local=[],central=[];let offset=0;
 for(const item of entries){const name=Buffer.from(item.name),body=Buffer.from(item.body||''),method=item.method??0,compressed=method===8?deflateRawSync(body):body,crc=crc32(body),l=Buffer.alloc(30),c=Buffer.alloc(46);
  l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(body.length,22);l.writeUInt16LE(name.length,26);
  c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  local.push(l,name,compressed);central.push(c,name);offset+=l.length+name.length+compressed.length;
 }
 const cb=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cb.length,12);end.writeUInt32LE(offset,16);return new Uint8Array(Buffer.concat([...local,cb,end]));
}
