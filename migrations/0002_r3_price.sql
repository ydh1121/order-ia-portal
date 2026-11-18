-- Private QA workspace only. No active price, source, membership or grant is seeded.
CREATE TABLE IF NOT EXISTS r3_price_scope (
 supplier_id TEXT NOT NULL, origin_id TEXT NOT NULL, product_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)),
 PRIMARY KEY(supplier_id,origin_id,product_id)
);
CREATE TABLE IF NOT EXISTS r3_price_version (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, scope_key TEXT NOT NULL, predecessor TEXT,
 revision INTEGER NOT NULL, status TEXT NOT NULL, policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
 created_by TEXT NOT NULL, submitted_by TEXT, approved_by TEXT, approved_at TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS r3_price_supplier ON r3_price_version(supplier_id,scope_key,status);
CREATE TABLE IF NOT EXISTS r3_price_event (
 version_id TEXT NOT NULL, revision INTEGER NOT NULL, supplier_id TEXT NOT NULL, scope_key TEXT NOT NULL,
 predecessor TEXT, action TEXT NOT NULL CHECK(action IN('create','edit','submit','return','approve','withdraw')),
 status TEXT NOT NULL CHECK(status IN('DRAFT','SUBMITTED','RETURNED','APPROVED','WITHDRAWN')),
 actor_id TEXT NOT NULL, reason TEXT, event_at TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),PRIMARY KEY(version_id,revision), UNIQUE(actor_id,request_key)
);
CREATE TRIGGER IF NOT EXISTS r3_price_event_guard BEFORE INSERT ON r3_price_event BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_membership m WHERE active=1 AND actor_id=NEW.actor_id AND org_id=NEW.supplier_id AND role IN('SUPPLIER','OPERATOR') AND (NEW.action NOT IN('approve','return','withdraw') OR role='OPERATOR')) THEN RAISE(ABORT,'GRANT_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_price_scope WHERE supplier_id=NEW.supplier_id AND origin_id=json_extract(NEW.policy_json,'$.originId') AND product_id=json_extract(NEW.policy_json,'$.productId') AND active=1) THEN RAISE(ABORT,'PRODUCT_SCOPE_REQUIRED') END;
 SELECT CASE WHEN NEW.action='create' AND (NEW.revision<>1 OR EXISTS(SELECT 1 FROM r3_price_version WHERE id=NEW.version_id) OR (NEW.predecessor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM r3_price_version WHERE id=NEW.predecessor AND scope_key=NEW.scope_key AND supplier_id=NEW.supplier_id))) THEN RAISE(ABORT,'CONFLICT') END;
 SELECT CASE WHEN NEW.action<>'create' AND NOT EXISTS(SELECT 1 FROM r3_price_version WHERE id=NEW.version_id AND revision+1=NEW.revision AND supplier_id=NEW.supplier_id AND scope_key=NEW.scope_key AND (
  (NEW.action IN('edit','submit') AND status IN('DRAFT','RETURNED')) OR
  (NEW.action='return' AND status='SUBMITTED') OR
  (NEW.action='approve' AND status='SUBMITTED' AND created_by<>NEW.actor_id AND submitted_by<>NEW.actor_id AND NOT EXISTS(SELECT 1 FROM r3_price_event authors WHERE authors.version_id=NEW.version_id AND authors.actor_id=NEW.actor_id AND authors.action IN('create','edit','submit'))) OR
  (NEW.action='withdraw' AND status='APPROVED'))) THEN RAISE(ABORT,'CONFLICT') END;
 SELECT CASE WHEN NEW.action='approve' AND EXISTS(SELECT 1 FROM r3_price_version v WHERE v.scope_key=NEW.scope_key AND v.status='APPROVED'
  AND coalesce(json_extract(v.policy_json,'$.effectiveTo'),'9999')>json_extract(NEW.policy_json,'$.effectiveFrom')
  AND coalesce(json_extract(NEW.policy_json,'$.effectiveTo'),'9999')>json_extract(v.policy_json,'$.effectiveFrom')) THEN RAISE(ABORT,'VERSION_OVERLAP') END;
END;
CREATE TRIGGER IF NOT EXISTS r3_price_event_apply AFTER INSERT ON r3_price_event BEGIN
 INSERT INTO r3_price_version(id,supplier_id,scope_key,predecessor,revision,status,policy_json,created_by,submitted_by,approved_by,approved_at,updated_at)
 VALUES(NEW.version_id,NEW.supplier_id,NEW.scope_key,NEW.predecessor,NEW.revision,NEW.status,NEW.policy_json,NEW.actor_id,NULL,NULL,NULL,NEW.event_at)
 ON CONFLICT(id) DO UPDATE SET revision=NEW.revision,status=NEW.status,policy_json=NEW.policy_json,
 submitted_by=CASE WHEN NEW.action='submit' THEN NEW.actor_id ELSE submitted_by END,
 approved_by=CASE WHEN NEW.action='approve' THEN NEW.actor_id ELSE approved_by END,approved_at=CASE WHEN NEW.action='approve' THEN NEW.event_at ELSE approved_at END,updated_at=NEW.event_at;
END;
CREATE TABLE IF NOT EXISTS r3_price_performance (
 org_id TEXT NOT NULL, site_scope TEXT NOT NULL, supplier_scope TEXT NOT NULL, product_scope TEXT NOT NULL,
 period TEXT NOT NULL, unit TEXT NOT NULL, basis_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('FINAL','PENDING','UNAVAILABLE')),
 quantity INTEGER CHECK(quantity>=0), finalized_at TEXT,
 PRIMARY KEY(org_id,site_scope,supplier_scope,product_scope,period,unit,basis_key)
);
CREATE TABLE IF NOT EXISTS r3_price_destination (
 org_id TEXT NOT NULL, site_id TEXT NOT NULL, region_code TEXT NOT NULL, region_version TEXT NOT NULL, postcode TEXT,
 PRIMARY KEY(org_id,site_id)
);
CREATE TABLE IF NOT EXISTS r3_price_quote (
 id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,org_id TEXT NOT NULL,site_id TEXT NOT NULL,supplier_org_id TEXT NOT NULL,
 revision INTEGER NOT NULL, issued_at TEXT NOT NULL,expires_at TEXT NOT NULL, request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 source_digest TEXT NOT NULL, sources_json TEXT NOT NULL CHECK(json_valid(sources_json)),result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 UNIQUE(actor_id,request_key)
);
CREATE TRIGGER IF NOT EXISTS r3_price_issue_guard BEFORE INSERT ON r3_price_quote BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_membership m JOIN r3_business_site s ON s.org_id=m.org_id AND s.site_id=m.site_id WHERE m.role='BUYER' AND m.actor_id=NEW.actor_id AND m.org_id=NEW.org_id AND m.site_id=NEW.site_id AND m.active=1 AND s.verification='VERIFIED') THEN RAISE(ABORT,'GRANT_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_price_destination d WHERE d.org_id=NEW.org_id AND d.site_id=NEW.site_id AND d.region_code=json_extract(NEW.sources_json,'$.destination.region_code') AND d.region_version=json_extract(NEW.sources_json,'$.destination.region_version') AND d.postcode IS json_extract(NEW.sources_json,'$.destination.postcode')) THEN RAISE(ABORT,'DESTINATION_CHANGED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.sources_json,'$.versions') j WHERE NOT EXISTS(SELECT 1 FROM r3_price_version v JOIN r3_price_scope s ON s.supplier_id=v.supplier_id AND s.origin_id=json_extract(v.policy_json,'$.originId') AND s.product_id=json_extract(v.policy_json,'$.productId') AND s.active=1 WHERE v.id=json_extract(j.value,'$.id') AND v.revision=json_extract(j.value,'$.revision') AND v.status='APPROVED' AND v.supplier_id=NEW.supplier_org_id)) THEN RAISE(ABORT,'VERSION_CHANGED') END;
END;
CREATE TRIGGER IF NOT EXISTS r3_price_no_quote_update BEFORE UPDATE ON r3_price_quote BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SNAPSHOT'); END;
