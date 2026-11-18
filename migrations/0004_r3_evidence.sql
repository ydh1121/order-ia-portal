-- Private locator records only. No pixels, OCR, original filenames, signatures or customer documents in QA D1.
CREATE TABLE IF NOT EXISTS r3_evidence_object (
 id TEXT PRIMARY KEY REFERENCES r3_evidence_receipt(id), case_id TEXT NOT NULL REFERENCES r3_case(id),
 actor_id TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
 pages INTEGER NOT NULL CHECK(pages BETWEEN 1 AND 8), created_at TEXT NOT NULL,
 UNIQUE(actor_id,request_key)
);
