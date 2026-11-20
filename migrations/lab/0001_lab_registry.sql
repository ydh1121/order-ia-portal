-- Apply only to ORDER_LAB_DB. The owner/session and review archive database is
-- deliberately absent from this schema and from every backup manifest.
CREATE TABLE IF NOT EXISTS product_lab_identity (
 id TEXT PRIMARY KEY CHECK(id='order-product-lab/v1'), created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO product_lab_identity VALUES('order-product-lab/v1',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS product_lab_run (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, label TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('CREATING','ACTIVE','ARCHIVED','FAILED')),
 schema_digest TEXT NOT NULL, source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 parent_snapshot_id TEXT, request_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(owner_id,request_key)
);
CREATE TABLE IF NOT EXISTS product_lab_snapshot (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES product_lab_run(id),
 owner_id TEXT NOT NULL, label TEXT NOT NULL, digest TEXT NOT NULL,
 content TEXT NOT NULL CHECK(json_valid(content)), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_lab_event (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES product_lab_run(id),
 owner_id TEXT NOT NULL, action TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL
);
