-- Append-only revisions. Effective price versions are selected using server time,
-- so scheduled application does not depend on an open browser or client timers.
CREATE TABLE IF NOT EXISTS r3_price_workspace_event (
  principal TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  request_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN('draft','apply','schedule')),
  price_date TEXT NOT NULL,
  effective_at TEXT,
  content TEXT NOT NULL CHECK(json_valid(content)),
  saved_at TEXT NOT NULL,
  PRIMARY KEY(principal,revision),
  UNIQUE(principal,request_key),
  CHECK((action='draft' AND effective_at IS NULL) OR (action<>'draft' AND effective_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS r3_price_workspace_effective ON r3_price_workspace_event(principal,effective_at DESC,revision DESC);
CREATE TRIGGER IF NOT EXISTS r3_price_workspace_no_update BEFORE UPDATE ON r3_price_workspace_event BEGIN SELECT RAISE(ABORT,'WORKSPACE_IMMUTABLE');END;
CREATE TRIGGER IF NOT EXISTS r3_price_workspace_no_delete BEFORE DELETE ON r3_price_workspace_event BEGIN SELECT RAISE(ABORT,'WORKSPACE_IMMUTABLE');END;
