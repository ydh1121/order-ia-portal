-- Existing private IA database. No account, password, cookie or CSRF value is stored.
CREATE TABLE IF NOT EXISTS ia_owner_session_revocations (
 session_hash TEXT PRIMARY KEY NOT NULL,
 revoked_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 CHECK(expires_at>revoked_at)
);
CREATE INDEX IF NOT EXISTS ia_owner_session_revocations_expiry ON ia_owner_session_revocations(expires_at);
