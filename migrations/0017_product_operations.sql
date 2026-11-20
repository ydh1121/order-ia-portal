-- Canonical product state. The lab applies this same migration to an isolated
-- database namespace; no test actors or commercial permissions are seeded here.
CREATE TABLE IF NOT EXISTS order_account (
 actor_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(state IN ('ACTIVE','WITHDRAWN')),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_operation (
 kind TEXT NOT NULL, id TEXT NOT NULL, org_id TEXT NOT NULL, site_id TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS order_operation_scope ON order_operation(kind,org_id,site_id,updated_at);
CREATE TABLE IF NOT EXISTS order_operation_event (
 actor_id TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 kind TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL,
 action TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,request_key), UNIQUE(kind,entity_id,revision)
);
CREATE TABLE IF NOT EXISTS order_notification (
 id TEXT NOT NULL, actor_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 read_at TEXT, data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL,
 PRIMARY KEY(id,actor_id)
);
CREATE TABLE IF NOT EXISTS order_quote_draft (
 actor_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('simple','detailed')),
 revision INTEGER NOT NULL CHECK(revision>0), request_key TEXT NOT NULL,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)), updated_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,mode), UNIQUE(actor_id,request_key)
);
