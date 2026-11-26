-- No subscriptions, consent, historical notifications or price events are
-- seeded. Only a new explicit browser registration can create a subscription.
CREATE TABLE IF NOT EXISTS order_push_subscription (
 id TEXT PRIMARY KEY CHECK(length(id)=64), actor_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0), active INTEGER NOT NULL CHECK(active IN(0,1)),
 endpoint TEXT, p256dh TEXT, auth TEXT, application_server_key TEXT,
 expiration_time INTEGER, subscribed_at TEXT NOT NULL, updated_at TEXT NOT NULL, revoked_at TEXT,
 CHECK(active=0 OR (endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND application_server_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS order_push_subscription_actor ON order_push_subscription(actor_id,active);

CREATE TABLE IF NOT EXISTS order_push_delivery (
 notification_id TEXT NOT NULL, actor_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
 subscription_revision INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
  CHECK(state IN('pending','sending','retry','accepted','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL,
 lease_token TEXT, lease_until TEXT, accepted_at TEXT, last_status INTEGER, last_error TEXT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(notification_id,actor_id,subscription_id,subscription_revision)
);
CREATE INDEX IF NOT EXISTS order_push_delivery_due ON order_push_delivery(state,next_attempt_at);

-- Approval is the real source of a supplier-price notice. Private price-table
-- drafts/schedules and QA fixture controls never write this table.
CREATE TABLE IF NOT EXISTS order_notification_price_event (
 version_id TEXT NOT NULL, revision INTEGER NOT NULL, supplier_id TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)), event_at TEXT NOT NULL, available_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processed','cancelled')),
 completed_at TEXT, reason TEXT, PRIMARY KEY(version_id,revision)
);
CREATE INDEX IF NOT EXISTS order_notification_price_due ON order_notification_price_event(state,available_at);
CREATE TRIGGER IF NOT EXISTS order_notification_new_price AFTER INSERT ON r3_price_event
WHEN NEW.action='approve' AND NEW.status='APPROVED'
BEGIN
 INSERT OR IGNORE INTO order_notification_price_event(version_id,revision,supplier_id,policy_json,event_at,available_at)
 VALUES(NEW.version_id,NEW.revision,NEW.supplier_id,NEW.policy_json,NEW.event_at,
  max(NEW.event_at,json_extract(NEW.policy_json,'$.effectiveFrom')));
END;

-- New notifications only: subscribing or migrating never backfills old mail.
CREATE TRIGGER IF NOT EXISTS order_notification_push_enqueue AFTER INSERT ON order_notification
BEGIN
 INSERT OR IGNORE INTO order_push_delivery(notification_id,actor_id,subscription_id,subscription_revision,next_attempt_at,created_at)
 SELECT NEW.id,NEW.actor_id,s.id,s.revision,NEW.created_at,NEW.created_at
 FROM order_push_subscription s LEFT JOIN order_notification_preference p ON p.actor_id=s.actor_id
 WHERE s.actor_id=NEW.actor_id AND s.active=1 AND s.subscribed_at<=coalesce(json_extract(NEW.data_json,'$.eventOccurredAt'),NEW.created_at)
 AND (s.expiration_time IS NULL OR s.expiration_time>CAST(strftime('%s',NEW.created_at) AS INTEGER)*1000)
 AND coalesce((SELECT state FROM order_account WHERE actor_id=s.actor_id),'ACTIVE')='ACTIVE'
 AND CASE coalesce(json_extract(NEW.data_json,'$.category'),'')
  WHEN 'price' THEN coalesce(json_extract(p.preferences_json,'$.price'),0)
  WHEN 'price_change' THEN coalesce(json_extract(p.preferences_json,'$.price'),0)
  WHEN 'news' THEN coalesce(json_extract(p.preferences_json,'$.news'),0)
  WHEN 'notice' THEN coalesce(json_extract(p.preferences_json,'$.news'),0)
  WHEN 'announcement' THEN coalesce(json_extract(p.preferences_json,'$.news'),0)
  WHEN 'benefit' THEN coalesce(json_extract(p.preferences_json,'$.benefits'),0)
  WHEN 'benefits' THEN coalesce(json_extract(p.preferences_json,'$.benefits'),0)
  WHEN 'promotion' THEN coalesce(json_extract(p.preferences_json,'$.benefits'),0)
  ELSE 1 END=1;
END;

CREATE TRIGGER IF NOT EXISTS order_push_consent_revoked AFTER UPDATE ON order_notification_preference
BEGIN
 UPDATE order_push_delivery SET state='cancelled',last_error='CONSENT_REVOKED',lease_token=NULL,lease_until=NULL
 WHERE actor_id=NEW.actor_id AND state IN('pending','retry','sending') AND notification_id IN
 (SELECT id FROM order_notification WHERE actor_id=NEW.actor_id AND
  CASE coalesce(json_extract(data_json,'$.category'),'')
   WHEN 'price' THEN json_extract(NEW.preferences_json,'$.price')
   WHEN 'price_change' THEN json_extract(NEW.preferences_json,'$.price')
   WHEN 'news' THEN json_extract(NEW.preferences_json,'$.news')
   WHEN 'notice' THEN json_extract(NEW.preferences_json,'$.news')
   WHEN 'announcement' THEN json_extract(NEW.preferences_json,'$.news')
   WHEN 'benefit' THEN json_extract(NEW.preferences_json,'$.benefits')
   WHEN 'benefits' THEN json_extract(NEW.preferences_json,'$.benefits')
   WHEN 'promotion' THEN json_extract(NEW.preferences_json,'$.benefits') ELSE 1 END=0);
END;
CREATE TRIGGER IF NOT EXISTS order_push_account_withdrawn AFTER UPDATE ON order_account
WHEN NEW.state='WITHDRAWN'
BEGIN
 UPDATE order_push_subscription SET active=0,revision=revision+1,endpoint=NULL,p256dh=NULL,auth=NULL,application_server_key=NULL,
  updated_at=NEW.updated_at,revoked_at=NEW.updated_at WHERE actor_id=NEW.actor_id AND active=1;
 UPDATE order_push_delivery SET state='cancelled',last_error='ACCOUNT_WITHDRAWN',lease_token=NULL,lease_until=NULL
  WHERE actor_id=NEW.actor_id AND state IN('pending','retry','sending');
END;
