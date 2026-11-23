import {workingMemberships} from './product-account-context.mjs';
// Pending requests do not change a membership. Personal contacts are visible to the
// author and to the authorized operator of the same organization only.
const scope = `EXISTS (SELECT 1 FROM ${workingMemberships} g WHERE g.active=1 AND g.actor_id=?
 AND g.org_id=? AND g.site_id=?)`;
const all=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
export async function readAccountPanel(db,actorId){
  const sites=await all(db,`SELECT DISTINCT g.org_id,g.site_id,g.role,s.verification,
    (SELECT n.context_json FROM r3_case c JOIN r3_case_note n ON n.case_id=c.id AND n.revision=1
     WHERE c.kind='business' AND c.org_id=g.org_id AND c.site_id=g.site_id ORDER BY c.updated_at DESC LIMIT 1) info
    FROM ${workingMemberships} g LEFT JOIN r3_business_site s ON s.org_id=g.org_id AND s.site_id=g.site_id
    WHERE g.actor_id=? AND g.active=1 ORDER BY g.org_id,g.site_id,g.role`,actorId);
  const members=await all(db,`SELECT m.actor_id,m.org_id,m.site_id,m.role,m.actor_id=? AS self FROM r3_membership m
    WHERE m.active=1 AND (EXISTS(SELECT 1 FROM ${workingMemberships} self WHERE self.actor_id=? AND self.actor_id=m.actor_id AND self.org_id=m.org_id AND self.site_id=m.site_id AND self.active=1) OR EXISTS(SELECT 1 FROM ${workingMemberships} g WHERE g.active=1
    AND g.actor_id=? AND g.org_id=m.org_id AND g.role='OPERATOR')) ORDER BY m.org_id,m.site_id,m.role,m.actor_id LIMIT 250`,actorId,actorId,actorId);
  const requests=await all(db,`SELECT purpose,contact,requested_role,org_id,site_id,created_at FROM r3_member_request r
    WHERE (r.actor_id=? OR EXISTS (SELECT 1 FROM ${workingMemberships} g WHERE g.actor_id=? AND g.active=1
     AND g.org_id=r.org_id AND g.role='OPERATOR')) AND EXISTS (SELECT 1 FROM ${workingMemberships} g WHERE g.actor_id=? AND g.active=1 AND g.org_id=r.org_id AND (g.site_id=r.site_id OR g.role='OPERATOR'))
    ORDER BY created_at DESC LIMIT 100`,actorId,actorId,actorId);
  return {sites:sites.map(s=>({...s,info:JSON.parse(s.info||'{}')})),members,requests};
}
export async function requestMemberChange(db,actorId,input,now){
  const keys=['requestKey','orgId','siteId','purpose','contact','role'];
  if(!input||typeof input!=='object'||Object.keys(input).length!==keys.length||keys.some(k=>typeof input[k]!=='string')||
     !/^[\w-]{12,100}$/.test(input.requestKey)||!input.orgId||input.orgId.length>128||input.siteId.length>128||
     !['INVITE','CHANGE'].includes(input.purpose)||!['BUYER','SUPPLIER'].includes(input.role)||
     input.contact.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(input.contact)||/[\s,<>;]/.test(input.contact))
    return {status:400,error:'INVALID_INPUT'};
  const contact=input.contact.trim().toLowerCase();
  // Only current, exact scope holders may request changes. No subject binding is inferred from email.
  const args=[actorId,input.orgId,input.siteId];
  if(!await db.prepare('SELECT 1 ok WHERE '+scope+` AND EXISTS (SELECT 1 FROM ${workingMemberships} g WHERE g.active=1 AND g.actor_id=? AND g.org_id=? AND g.site_id=? AND g.role IN (?, 'OPERATOR'))`).bind(...args,...args,input.role).first())return {status:403,error:'ACCESS_DENIED'};
  await db.batch([db.prepare(`INSERT INTO r3_member_request(id,actor_id,org_id,site_id,purpose,contact,requested_role,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${scope} ON CONFLICT(id) DO NOTHING`).bind(input.requestKey,actorId,input.orgId,input.siteId,input.purpose,contact,input.role,now,...args)]);
  const prior=await db.prepare('SELECT 1 ok FROM r3_member_request WHERE id=? AND actor_id=? AND org_id=? AND site_id=? AND purpose=? AND contact=? AND requested_role=?').bind(input.requestKey,actorId,input.orgId,input.siteId,input.purpose,contact,input.role).first();
  return prior?{status:200,pending:true}:{status:409,error:'REVISION_CONFLICT'};
}
