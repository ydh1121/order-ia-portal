CREATE TABLE IF NOT EXISTS qa_navigation_revisions (
  actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  layout_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, revision)
);
