-- Private review workspace. Grants and trusted evidence receipts are provisioned server-side.
CREATE TABLE IF NOT EXISTS r3_membership (
  actor_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('BUYER','SUPPLIER','OPERATOR')),
  org_id TEXT NOT NULL, site_id TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL CHECK(active IN(0,1)),
  PRIMARY KEY(actor_id,role,org_id,site_id), CHECK ((role='BUYER')=(site_id<>''))
);
CREATE TABLE IF NOT EXISTS r3_business_site (
  org_id TEXT NOT NULL, site_id TEXT NOT NULL, verification TEXT NOT NULL CHECK(verification IN('PENDING','VERIFIED','REVOKED')),
  revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(org_id,site_id)
);
CREATE TABLE IF NOT EXISTS r3_evidence_receipt (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, site_id TEXT NOT NULL, purpose TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('MASKED_SCANNED','REVOKED'))
);
CREATE TABLE IF NOT EXISTS r3_case (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('business','supply','catalog','consult','reprice','delivery')),
  org_id TEXT NOT NULL, site_id TEXT NOT NULL, supplier_org_id TEXT, quote_id TEXT, product_id TEXT,
  order_id TEXT, delivery_id TEXT, document_id TEXT, settlement_id TEXT,
  state TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), created_by TEXT NOT NULL,
  site_revision INTEGER NOT NULL DEFAULT 0, evidence_id TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS r3_case_order ON r3_case(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS r3_case_delivery_quote ON r3_case(quote_id) WHERE kind='delivery' AND state NOT IN ('CANCELLED','REJECTED');
CREATE INDEX IF NOT EXISTS r3_case_queue ON r3_case(org_id,site_id,id);
CREATE INDEX IF NOT EXISTS r3_case_supply ON r3_case(supplier_org_id,id);
CREATE TABLE IF NOT EXISTS r3_case_event (
  case_id TEXT NOT NULL REFERENCES r3_case(id), revision INTEGER NOT NULL, actor_id TEXT NOT NULL,
  request_key TEXT NOT NULL, request_hash TEXT NOT NULL, action TEXT NOT NULL, previous_state TEXT,
  next_state TEXT NOT NULL, reason_code TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(case_id,revision),UNIQUE(actor_id,request_key)
);
