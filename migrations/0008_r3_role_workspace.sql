-- Human-facing supplementary context for the existing case and append-only event.
CREATE TABLE IF NOT EXISTS r3_case_note (
  case_id TEXT NOT NULL, revision INTEGER NOT NULL, context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  PRIMARY KEY(case_id,revision), FOREIGN KEY(case_id,revision) REFERENCES r3_case_event(case_id,revision)
);
-- Publication permission is deliberately separate from stewardship of any one supplier or shop.
CREATE TABLE IF NOT EXISTS r3_release_admin(actor_id TEXT PRIMARY KEY,active INTEGER NOT NULL CHECK(active IN(0,1)));
CREATE TABLE IF NOT EXISTS r3_menu_publication(
  revision INTEGER PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
  actor_id TEXT NOT NULL,request_key TEXT NOT NULL,changed_at TEXT NOT NULL,
  UNIQUE(actor_id,request_key)
);
