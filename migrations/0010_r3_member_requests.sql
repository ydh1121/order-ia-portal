-- Requests are separate from effective business memberships and never activate an account.
CREATE TABLE IF NOT EXISTS r3_member_request (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, org_id TEXT NOT NULL, site_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('INVITE','CHANGE')), contact TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK(requested_role IN ('BUYER','SUPPLIER')), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS r3_member_request_scope ON r3_member_request(org_id,site_id,created_at);
