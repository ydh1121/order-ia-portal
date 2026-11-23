// A context limits existing grants. Switching never creates or edits membership.
// Use this relation for the acting account only; notifying other members must
// not depend on which organization those recipients last viewed.
export const workingMemberships = `(SELECT g.* FROM r3_membership g
 WHERE NOT EXISTS (SELECT 1 FROM order_operation chosen
 WHERE chosen.kind='account-context' AND chosen.id=g.actor_id
 AND (chosen.org_id<>g.org_id OR chosen.site_id<>g.site_id)))`;

export async function readAccountContext(db, actorId) {
  const options = (await db.prepare(`SELECT DISTINCT org_id AS orgId,site_id AS siteId
    FROM r3_membership WHERE actor_id=? AND active=1 ORDER BY org_id,site_id`).bind(actorId).all()).results;
  const row = await db.prepare(`SELECT org_id,site_id,revision FROM order_operation
    WHERE kind='account-context' AND id=?`).bind(actorId).first();
  const selected = row ? options.find(option => option.orgId === row.org_id && option.siteId === row.site_id)
    : options.length === 1 ? options[0] : null;
  return {options, selected:selected ?? null, revision:row?.revision ?? 0};
}

export async function switchAccountContext(db, actor, body, now, {sql, replay, commit, fail}) {
  const {orgId, siteId, expectedRevision, requestKey} = body;
  if (body.action !== 'switch' || typeof orgId !== 'string' || !orgId || orgId.length > 128 ||
      typeof siteId !== 'string' || siteId.length > 128 || Object.keys(body).some(key =>
        !['action', 'orgId', 'siteId', 'expectedRevision', 'requestKey'].includes(key))) fail('INVALID_ACCOUNT_CONTEXT');
  const current = await readAccountContext(db, actor.id);
  if (!current.options.some(item => item.orgId === orgId && item.siteId === siteId)) fail('ACCESS_DENIED', 403);
  const prior = await replay(db, actor.id, body, 'account-context');
  if (prior) return current; // A retry must never reactivate an older selection.
  const revision = expectedRevision + 1;
  const statement = sql(db, `INSERT INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at)
    SELECT 'account-context',?,?,?,?,?,'ACTIVE','{}',?,?
    WHERE EXISTS (SELECT 1 FROM r3_membership WHERE actor_id=? AND active=1 AND org_id=? AND site_id=?)
    AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
    AND coalesce((SELECT revision FROM order_operation WHERE kind='account-context' AND id=?),0)=?
    ON CONFLICT(kind,id) DO UPDATE SET org_id=excluded.org_id,site_id=excluded.site_id,
    revision=excluded.revision,updated_at=excluded.updated_at`,
    actor.id,orgId,siteId,actor.id,revision,now,now,actor.id,orgId,siteId,actor.id,actor.id,expectedRevision);
  await commit(db, actor.id, body, 'account-context', actor.id, statement, {revision, orgId, siteId, requestKey}, now);
  return readAccountContext(db, actor.id);
}

// A tab editing the previous organization must explicitly reload before saving.
export async function readContextRevision(db, actorId) {
  const row = await db.prepare("SELECT revision FROM order_operation WHERE kind='account-context' AND id=?").bind(actorId).first();
  return row?.revision ?? 0;
}

export async function workingRevision(db, actorId, request) {
  const revision = await readContextRevision(db, actorId);
  const presented = request.headers.get('X-Order-Context-Revision') ?? '0';
  if (String(revision) !== presented) throw Object.assign(Error('ACCOUNT_CONTEXT_CHANGED'), {status:409});
  return revision;
}
