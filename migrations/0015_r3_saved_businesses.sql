-- Account-owned address book. These entries grant no organization or site role.
CREATE TABLE IF NOT EXISTS r3_saved_business_revision (
 actor_id TEXT NOT NULL,
 business_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 request_key TEXT NOT NULL,
 deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,business_id,revision),
 UNIQUE(actor_id,request_key)
);
CREATE INDEX IF NOT EXISTS r3_saved_business_actor ON r3_saved_business_revision(actor_id,business_id,revision DESC);
