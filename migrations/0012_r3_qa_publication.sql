-- The release operator attests a deployed preview here. The QA application only reads it.
CREATE TABLE IF NOT EXISTS qa_publications (
  candidate_id TEXT PRIMARY KEY NOT NULL,
  catalog_digest TEXT NOT NULL CHECK(length(catalog_digest)=64 AND catalog_digest NOT GLOB '*[^0-9a-f]*'),
  product_commit TEXT NOT NULL CHECK(length(product_commit)=40 AND product_commit NOT GLOB '*[^0-9a-f]*'),
  ia_commit TEXT NOT NULL CHECK(length(ia_commit)=40 AND ia_commit NOT GLOB '*[^0-9a-f]*'),
  deployment_id TEXT NOT NULL UNIQUE CHECK(length(deployment_id)=36 AND deployment_id NOT GLOB '*[^0-9a-f-]*'),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS qa_publications_once BEFORE INSERT ON qa_publications
WHEN EXISTS (SELECT 1 FROM qa_publications WHERE candidate_id=NEW.candidate_id OR deployment_id=NEW.deployment_id)
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM qa_publications WHERE candidate_id=NEW.candidate_id AND catalog_digest=NEW.catalog_digest
    AND product_commit=NEW.product_commit AND ia_commit=NEW.ia_commit AND deployment_id=NEW.deployment_id
  ) THEN RAISE(IGNORE) ELSE RAISE(ABORT,'QA publication already recorded') END;
END;
CREATE TRIGGER IF NOT EXISTS qa_publications_no_update BEFORE UPDATE ON qa_publications
BEGIN SELECT RAISE(ABORT,'QA publication is immutable'); END;
CREATE TRIGGER IF NOT EXISTS qa_publications_no_delete BEFORE DELETE ON qa_publications
BEGIN SELECT RAISE(ABORT,'QA publication is immutable'); END;
