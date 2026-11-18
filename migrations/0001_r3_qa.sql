CREATE TABLE IF NOT EXISTS qa_legacy_sources (
  sha256 TEXT PRIMARY KEY CHECK(length(sha256)=64),
  original_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
  record_count INTEGER NOT NULL, normalization_version INTEGER NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1)),
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS qa_legacy_chunks (
  source_sha TEXT NOT NULL REFERENCES qa_legacy_sources(sha256),
  ordinal INTEGER NOT NULL, raw_bytes BLOB NOT NULL, PRIMARY KEY(source_sha,ordinal)
);
CREATE TABLE IF NOT EXISTS qa_legacy_records (
  source_sha TEXT NOT NULL REFERENCES qa_legacy_sources(sha256),
  source_key TEXT NOT NULL, source_pointer TEXT NOT NULL, ordinal INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(source_sha,source_key),
  UNIQUE(source_sha,ordinal)
);
CREATE TRIGGER IF NOT EXISTS qa_verify_import BEFORE UPDATE OF complete ON qa_legacy_sources
WHEN NEW.complete=1 AND (
  (SELECT count(*) FROM qa_legacy_records WHERE source_sha=NEW.sha256)<>NEW.record_count
  OR (SELECT count(*) FROM qa_legacy_chunks WHERE source_sha=NEW.sha256)<>NEW.chunk_count
  OR (SELECT coalesce(sum(length(raw_bytes)),0) FROM qa_legacy_chunks WHERE source_sha=NEW.sha256)<>NEW.original_bytes)
BEGIN SELECT RAISE(ABORT,'incomplete import'); END;

CREATE TABLE IF NOT EXISTS qa_review_events (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  release TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL CHECK(json_valid(data)),
  actor TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(release,kind,id,revision), UNIQUE(actor,request_key)
);
CREATE INDEX IF NOT EXISTS qa_changes_for_release ON qa_review_events(release,cursor);
CREATE INDEX IF NOT EXISTS qa_changes_for_kind ON qa_review_events(release,kind,cursor);
