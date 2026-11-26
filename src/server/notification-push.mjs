import {encryptWebPush, pushDigest, validatePushSubscription, validPushEndpoint, webPushAuthorization, webPushConfiguration} from './notification-push-crypto.mjs';
import {materializePriceNotifications, priceNotificationAudience} from './notification-price-events.mjs';

const query = (db, text, ...args) => db.prepare(text).bind(...args);
const DAY = 86400000, MAX_ATTEMPTS = 5, BATCH = 12;
const keys = value => value && typeof value === 'object' && !Array.isArray(value);
const registration = row => ({id: row.id, revision: row.revision, active: row.active === 1, updatedAt: row.updated_at, expiresAt: row.expiration_time ?? null});
const bound = row => [row.notification_id, row.actor_id, row.subscription_id, row.subscription_revision];
const identity = 'notification_id=? AND actor_id=? AND subscription_id=? AND subscription_revision=?';

export async function actorWebPushEnabled(db, actorId, env, now) {
  const configuration = webPushConfiguration(env); if (!configuration) return false;
  return Boolean(await query(db, `SELECT 1 ok FROM order_push_subscription WHERE actor_id=? AND active=1 AND application_server_key=?
    AND (expiration_time IS NULL OR expiration_time>?) LIMIT 1`, actorId, configuration.publicKey, Date.parse(now)).first());
}

/** The containing product handler supplies authentication, CSRF and withdrawal
 * checks. This module owns only this actor's explicit device registration. */
export async function notificationPush({db, env, actor, body, now}, {sql, replay, commit, fail}) {
  const configuration = webPushConfiguration(env);
  if (!body) {
    const registrations = (await sql(db, `SELECT id,revision,active,updated_at,expiration_time,application_server_key FROM order_push_subscription
      WHERE actor_id=? ORDER BY active DESC,updated_at DESC LIMIT 30`, actor.id).all()).results;
    return {available: Boolean(configuration), publicKey: configuration?.publicKey ?? null, serviceWorker: '/order-notifications-sw.js',
      registrations: registrations.map(row => ({...registration(row), keyCurrent: Boolean(configuration && row.application_server_key === configuration.publicKey)}))};
  }
  if (!['subscribe', 'unsubscribe'].includes(body.action) || Object.keys(body).some(key => !['action', 'expectedRevision', 'requestKey', 'id', 'subscription', 'applicationServerKey', 'consent'].includes(key))) fail('INVALID_PUSH_COMMAND');
  const kind = 'notification-push', previous = await replay(db, actor.id, body, kind); if (previous) return previous;
  let id = body.id, subscription = null;
  if (body.action === 'subscribe') {
    if (!configuration) fail('PUSH_NOT_CONFIGURED', 503);
    if (body.consent !== 'granted' || body.applicationServerKey !== configuration.publicKey || 'id' in body) fail('PUSH_CONSENT_REQUIRED');
    try {subscription = await validatePushSubscription(body.subscription, Date.parse(now));} catch {fail('INVALID_PUSH_SUBSCRIPTION');}
    id = await pushDigest(subscription.endpoint);
  } else if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || ['subscription', 'applicationServerKey', 'consent'].some(key => key in body)) fail('INVALID_PUSH_COMMAND');
  const old = await sql(db, 'SELECT * FROM order_push_subscription WHERE id=?', id).first();
  // A shared browser endpoint cannot receive messages for two different people.
  if (old && old.actor_id !== actor.id) fail('PUSH_SUBSCRIPTION_BOUND', 409);
  if (!old && body.action === 'unsubscribe') fail('PUSH_SUBSCRIPTION_NOT_FOUND', 404);
  if ((old?.revision ?? 0) !== body.expectedRevision) fail('REVISION_CONFLICT', 409);
  if (subscription && !old?.active) {
    const count = await sql(db, 'SELECT count(*) n FROM order_push_subscription WHERE actor_id=? AND active=1', actor.id).first();
    if (count.n >= 10) fail('PUSH_DEVICE_LIMIT', 409);
  }
  const active = subscription ? 1 : 0, revision = body.expectedRevision + 1;
  const result = {id, revision, active: Boolean(active), updatedAt: now, expiresAt: subscription?.expirationTime ?? null};
  const mutation = sql(db, `INSERT INTO order_push_subscription(id,actor_id,revision,active,endpoint,p256dh,auth,application_server_key,expiration_time,subscribed_at,updated_at,revoked_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE coalesce((SELECT revision FROM order_push_subscription WHERE id=?),0)=?
    AND NOT EXISTS(SELECT 1 FROM order_push_subscription WHERE id=? AND actor_id<>?)
    AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
    AND (?=0 OR EXISTS(SELECT 1 FROM order_push_subscription WHERE id=? AND actor_id=? AND active=1)
      OR (SELECT count(*) FROM order_push_subscription WHERE actor_id=? AND active=1)<10)
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,active=excluded.active,endpoint=excluded.endpoint,p256dh=excluded.p256dh,
      auth=excluded.auth,application_server_key=excluded.application_server_key,expiration_time=excluded.expiration_time,
      subscribed_at=excluded.subscribed_at,updated_at=excluded.updated_at,revoked_at=excluded.revoked_at`,
  id, actor.id, revision, active, subscription?.endpoint ?? null, subscription?.keys.p256dh ?? null, subscription?.keys.auth ?? null,
  subscription ? configuration.publicKey : null, subscription?.expirationTime ?? null, now, now, subscription ? null : now,
  id, body.expectedRevision, id, actor.id, actor.id, active, id, actor.id, actor.id);
  const cancel = sql(db, `UPDATE order_push_delivery SET state='cancelled',last_error='SUBSCRIPTION_CHANGED',lease_token=NULL,lease_until=NULL
    WHERE subscription_id=? AND actor_id=? AND state IN('pending','retry','sending')
    AND EXISTS(SELECT 1 FROM order_operation_event WHERE actor_id=? AND request_key=? AND kind='notification-push')`, id, actor.id, actor.id, body.requestKey);
  return commit(db, actor.id, body, kind, actor.id + ':' + id, mutation, result, now, [cancel]);
}

function categoryFor(data) {
  if (['price', 'price_change'].includes(data.category)) return 'price';
  if (['news', 'notice', 'announcement'].includes(data.category)) return 'news';
  if (['benefit', 'benefits', 'promotion'].includes(data.category)) return 'benefits';
  return null;
}
async function eligible(db, delivery, configuration, now) {
  const row = await query(db, `SELECT s.*,n.data_json,n.created_at AS notification_created_at,p.preferences_json
    FROM order_push_subscription s JOIN order_notification n ON n.id=? AND n.actor_id=s.actor_id
    LEFT JOIN order_notification_preference p ON p.actor_id=s.actor_id
    WHERE s.id=? AND s.actor_id=? AND s.revision=? AND s.active=1 AND s.application_server_key=?
    AND (s.expiration_time IS NULL OR s.expiration_time>?)
    AND coalesce((SELECT state FROM order_account WHERE actor_id=s.actor_id),'ACTIVE')='ACTIVE'`,
  delivery.notification_id, delivery.subscription_id, delivery.actor_id, delivery.subscription_revision, configuration.publicKey, Date.parse(now)).first();
  if (!row || !validPushEndpoint(row.endpoint) || Date.parse(now) - Date.parse(row.notification_created_at) > DAY) return null;
  const data = JSON.parse(row.data_json), category = categoryFor(data);
  if (category && JSON.parse(row.preferences_json || '{}')[category] !== true) return null;
  if (data.source?.kind === 'approved-price') {
    const allowed = await query(db, `SELECT 1 ok FROM r3_membership m WHERE m.actor_id=? AND ${priceNotificationAudience}
      AND EXISTS(SELECT 1 FROM r3_price_version v JOIN r3_price_scope s ON s.supplier_id=v.supplier_id
        AND s.origin_id=json_extract(v.policy_json,'$.originId') AND s.product_id=json_extract(v.policy_json,'$.productId')
        WHERE v.id=? AND v.revision=? AND v.status='APPROVED' AND s.active=1
        AND json_extract(v.policy_json,'$.effectiveFrom')<=? AND (json_extract(v.policy_json,'$.effectiveTo') IS NULL OR json_extract(v.policy_json,'$.effectiveTo')>?)) LIMIT 1`,
    delivery.actor_id, data.source.supplierId, data.source.versionId, data.source.revision, now, now).first();
    if (!allowed) return null;
  } else if (data.route === 'purchases') {
    const allowed = await query(db, `SELECT 1 ok FROM order_operation o JOIN r3_membership m ON m.actor_id=? AND m.active=1
      WHERE o.kind='purchase' AND o.id=? AND ((m.org_id=o.org_id AND (m.site_id=o.site_id OR m.role='OPERATOR'))
      OR m.org_id=json_extract(o.data_json,'$.supplierId')) LIMIT 1`, delivery.actor_id, data.entityId).first();
    if (!allowed) return null;
  } else if (data.route === 'business' && data.caseId) {
    const allowed = await query(db, `SELECT 1 ok FROM r3_case c JOIN r3_membership m ON m.org_id=c.org_id AND m.active=1 AND m.role='OPERATOR'
      WHERE c.id=? AND m.actor_id=? LIMIT 1`, data.caseId, delivery.actor_id).first();
    if (!allowed) return null;
  }
  return {...row, data};
}

const retryDelay = (attempt, header, now) => {
  let suggested = /^\d+$/.test(header || '') ? Number(header) * 1000 : Date.parse(header || '') - Date.parse(now);
  if (!Number.isFinite(suggested)) suggested = 0;
  return Math.min(3600000, Math.max(60000 * 2 ** (attempt - 1), suggested));
};

/** Provider acceptance is recorded as accepted, never as delivered/read. The
 * stable Topic and device tag collapse an ambiguous transport retry. */
export async function deliverNotificationOutbox(db, env, {now = new Date().toISOString(), fetcher = fetch, limit = BATCH} = {}) {
  const configuration = webPushConfiguration(env), summary = {configured: Boolean(configuration), attempted: 0, accepted: 0, retry: 0, failed: 0, cancelled: 0};
  if (!configuration) return summary;
  await query(db, `UPDATE order_push_delivery SET state='failed',last_error='RETRY_LIMIT',lease_token=NULL,lease_until=NULL
    WHERE state='sending' AND lease_until<=? AND attempts>=?`, now, MAX_ATTEMPTS).run();
  const due = (await query(db, `SELECT * FROM order_push_delivery WHERE attempts<? AND
    ((state IN('pending','retry') AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))
    ORDER BY next_attempt_at,notification_id LIMIT ?`, MAX_ATTEMPTS, now, now, Math.min(BATCH, Math.max(1, limit))).all()).results;
  async function send(row) {
    const token = crypto.randomUUID(), lease = new Date(Date.parse(now) + 30000).toISOString();
    const claimed = await query(db, `UPDATE order_push_delivery SET state='sending',lease_token=?,lease_until=?,attempts=attempts+1
      WHERE ${identity} AND attempts<? AND ((state IN('pending','retry') AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))`,
    token, lease, ...bound(row), MAX_ATTEMPTS, now, now).run();
    if (Number(claimed.meta?.changes) !== 1) return;
    const finish = (state, error, status = null, next = now) => query(db, `UPDATE order_push_delivery
      SET state=?,last_error=?,last_status=?,next_attempt_at=?,accepted_at=?,lease_token=NULL,lease_until=NULL
      WHERE ${identity} AND state='sending' AND lease_token=?`, state, error, status, next, state === 'accepted' ? now : null, ...bound(row), token).run();
    let subscription;
    try {subscription = await eligible(db, row, configuration, now);} catch {await finish('failed', 'SOURCE_UNAVAILABLE'); summary.failed++; return;}
    if (!subscription) {await finish('cancelled', 'RECIPIENT_NO_LONGER_ELIGIBLE'); summary.cancelled++; return;}
    const topic = (await pushDigest(JSON.stringify([row.actor_id, row.notification_id]))).slice(0, 32);
    // No prices, organization names, account identifiers or private message body
    // reach a locked/shared device. Opening the app rechecks the signed-in ACL.
    const category = categoryFor(subscription.data), title = category === 'price' ? '오더 · 시세 알림' : '오더 · 새 알림';
    const payload = JSON.stringify({version: 1, id: topic, title, body: '새 알림이 있어요. 오더에서 확인해 주세요.', url: '/ia?view=product-r3&screen=profile&state=notification'});
    let encrypted, authorization;
    try {
      [encrypted, authorization] = await Promise.all([
        encryptWebPush({keys: {p256dh: subscription.p256dh, auth: subscription.auth}}, payload),
        webPushAuthorization(configuration, subscription.endpoint, Date.parse(now))
      ]);
    } catch {await finish('failed', 'PUSH_CRYPTO_CONFIGURATION'); summary.failed++; return;}
    // Consent, account state, source access and cancellation may change while
    // encryption is running. Check again immediately before the provider call.
    const live = await query(db, `SELECT 1 ok FROM order_push_delivery WHERE ${identity} AND state='sending' AND lease_token=?`, ...bound(row), token).first();
    if (!live || !await eligible(db, row, configuration, now)) {await finish('cancelled', 'RECIPIENT_NO_LONGER_ELIGIBLE'); summary.cancelled++; return;}
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      summary.attempted++;
      response = await fetcher(subscription.endpoint, {method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {Authorization: authorization, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Topic: topic, Urgency: subscription.data.priority === 'urgent' ? 'high' : 'normal'}, body: encrypted});
    } catch {/* A timeout may have reached the provider; reuse the stable topic. */}
    finally {clearTimeout(timer);}
    const status = response?.status ?? null; await response?.body?.cancel?.().catch(() => {});
    if (status === 201 || status === 202 || status === 200) {await finish('accepted', null, status); summary.accepted++; return;}
    if (status === 404 || status === 410) {
      await db.batch([
        query(db, `UPDATE order_push_subscription SET active=0,revision=revision+1,endpoint=NULL,p256dh=NULL,auth=NULL,application_server_key=NULL,updated_at=?,revoked_at=? WHERE id=? AND revision=? AND active=1`, now, now, row.subscription_id, row.subscription_revision),
        query(db, `UPDATE order_push_delivery SET state='cancelled',last_error='SUBSCRIPTION_EXPIRED',last_status=?,lease_token=NULL,lease_until=NULL
          WHERE subscription_id=? AND subscription_revision=? AND state IN('pending','retry','sending')`, status, row.subscription_id, row.subscription_revision)
      ]); summary.cancelled++; return;
    }
    const retryable = status === null || status === 429 || status >= 500 && status <= 599, attempts = row.attempts + 1;
    if (retryable && attempts < MAX_ATTEMPTS) {
      await finish('retry', status === null ? 'PROVIDER_UNCONFIRMED' : 'PROVIDER_RETRY', status, new Date(Date.parse(now) + retryDelay(attempts, response?.headers.get('Retry-After'), now)).toISOString()); summary.retry++;
    } else {await finish('failed', retryable ? 'RETRY_LIMIT' : 'PROVIDER_REJECTED', status); summary.failed++;}
  }
  for (let index = 0; index < due.length; index += 4) await Promise.all(due.slice(index, index + 4).map(send));
  return summary;
}

export async function processNotificationWork(env, options = {}) {
  const db = env.ORDER_PRODUCT_DB || env.ORDER_QA_DB;
  if (!db) return {available: false};
  const now = options.now || new Date().toISOString();
  const prices = await materializePriceNotifications(db, now);
  return {available: true, prices, push: await deliverNotificationOutbox(db, env, {...options, now})};
}

// Pages supplies its own request lifetime. Without waitUntil, do not start an
// untracked fetch. The OWNER drain endpoint runs this same bounded operation.
export function scheduleNotificationWork(env, waitUntil) {
  if (typeof waitUntil !== 'function') return false;
  waitUntil(processNotificationWork(env).catch(() => ({available: false, error: 'NOTIFICATION_WORK_UNAVAILABLE'})));
  return true;
}
