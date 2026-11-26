import {defaultNotificationPreferences, validNotificationPreferenceCommand} from './research-app/notification-preferences-contract.mjs';
import {actorWebPushEnabled} from './notification-push.mjs';

/** Actor-private optional-message consent. A read never creates a preference or
 * permission. The containing product service owns authentication, CSRF,
 * withdrawal checks and the shared atomic event/replay transaction. */
export async function notificationPreferences({db, env, actor, body, now}, {sql, replay, commit, fail}) {
  const delivery = {webPush: await actorWebPushEnabled(db, actor.id, env, now)};
  if (!body) {
    const current = await sql(db, 'SELECT revision,preferences_json,updated_at FROM order_notification_preference WHERE actor_id=?', actor.id).first();
    return {revision: current?.revision || 0, preferences: current ? JSON.parse(current.preferences_json) : defaultNotificationPreferences(), updatedAt: current?.updated_at || null, delivery};
  }
  if (!validNotificationPreferenceCommand(body)) fail('INVALID_NOTIFICATION_PREFERENCES');
  const kind = 'notification-preference', previous = await replay(db, actor.id, body, kind);
  if (previous) return previous;
  const preferences = Object.fromEntries(['price', 'news', 'benefits'].map(key => [key, body.preferences[key]]));
  const revision = body.expectedRevision + 1, result = {revision, preferences, updatedAt: now, delivery};
  const mutation = sql(db, `INSERT INTO order_notification_preference(actor_id,revision,preferences_json,updated_at)
    SELECT ?,?,?,? WHERE coalesce((SELECT revision FROM order_notification_preference WHERE actor_id=?),0)=?
    AND coalesce((SELECT state FROM order_account WHERE actor_id=?),'ACTIVE')='ACTIVE'
    ON CONFLICT(actor_id) DO UPDATE SET revision=excluded.revision,preferences_json=excluded.preferences_json,updated_at=excluded.updated_at`,
    actor.id, revision, JSON.stringify(preferences), now, actor.id, body.expectedRevision, actor.id);
  return commit(db, actor.id, body, kind, actor.id, mutation, result, now);
}
