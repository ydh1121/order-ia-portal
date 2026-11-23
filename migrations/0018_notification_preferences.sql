-- Optional notification consent belongs to the authenticated person. No rows
-- or opt-ins are seeded, and no business/organization grants are changed.
CREATE TABLE IF NOT EXISTS order_notification_preference (
 actor_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>0),
 preferences_json TEXT NOT NULL CHECK(json_valid(preferences_json)
  AND json_type(preferences_json)='object'
  AND coalesce(json_type(preferences_json,'$.price') IN ('true','false'),0)
  AND coalesce(json_type(preferences_json,'$.news') IN ('true','false'),0)
  AND coalesce(json_type(preferences_json,'$.benefits') IN ('true','false'),0)),
 updated_at TEXT NOT NULL
);
