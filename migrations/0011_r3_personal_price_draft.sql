-- Private, unlinked author input. No foreign key or trigger points into a commercial price or grant.
CREATE TABLE IF NOT EXISTS r3_personal_price_edit (
  principal TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  request_key TEXT NOT NULL,
  content TEXT NOT NULL CHECK(json_valid(content)),
  saved_at TEXT NOT NULL,
  PRIMARY KEY(principal,revision),
  UNIQUE(principal,request_key)
);
