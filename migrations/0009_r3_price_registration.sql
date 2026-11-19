-- Registration creates a catalogue and sales scope inside a previously authorized organization.
CREATE TABLE IF NOT EXISTS r3_price_registration (
  id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, origin_id TEXT NOT NULL, product_id TEXT NOT NULL,
  origin_name TEXT NOT NULL, product_name TEXT NOT NULL, definition TEXT NOT NULL CHECK(json_valid(definition)),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(supplier_id,origin_name,product_name), UNIQUE(supplier_id,origin_id,product_id)
);
CREATE TRIGGER IF NOT EXISTS r3_registration_guard BEFORE INSERT ON r3_price_registration BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_membership WHERE actor_id=NEW.created_by AND org_id=NEW.supplier_id
    AND active=1 AND site_id='' AND role IN('OPERATOR','SUPPLIER')) THEN RAISE(ABORT,'GRANT_REQUIRED') END;
END;
CREATE TRIGGER IF NOT EXISTS r3_registration_catalog AFTER INSERT ON r3_price_registration BEGIN
  INSERT INTO r3_price_scope(supplier_id,origin_id,product_id,active) VALUES(NEW.supplier_id,NEW.origin_id,NEW.product_id,1);
  INSERT INTO r3_price_catalog(supplier_id,origin_id,product_id,revision,definition,updated_by,updated_at)
    VALUES(NEW.supplier_id,NEW.origin_id,NEW.product_id,1,NEW.definition,NEW.created_by,NEW.created_at);
END;
-- A connection is one verified subject's writing right on one product. It never confers an organizational role.
CREATE TABLE IF NOT EXISTS r3_price_connection (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, verified_subject INTEGER NOT NULL CHECK(verified_subject IN(0,1)),
  applicant TEXT NOT NULL, company TEXT NOT NULL, target_org TEXT,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','LINKED','DECLINED','REVOKED')),
  supplier_id TEXT, origin_id TEXT, product_id TEXT, reviewer TEXT, changed_at TEXT NOT NULL,
  CHECK(state!='LINKED' OR (verified_subject=1 AND actor_id!=reviewer AND supplier_id IS NOT NULL AND origin_id IS NOT NULL AND product_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS r3_connection_pending ON r3_price_connection(actor_id,company,COALESCE(target_org,'')) WHERE state='PENDING';
CREATE INDEX IF NOT EXISTS r3_connection_scope ON r3_price_connection(actor_id,state,supplier_id,origin_id,product_id);
-- Practice storage never receives connection requests; this view keeps its existing queries physically isolated.
CREATE VIEW IF NOT EXISTS r3_practice_price_connection AS
  SELECT NULL AS actor_id,NULL AS state,NULL AS supplier_id,NULL AS origin_id,NULL AS product_id WHERE 0;
CREATE TRIGGER IF NOT EXISTS r3_price_event_guard_v2 BEFORE INSERT ON r3_price_event BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM r3_membership m WHERE active=1 AND actor_id=NEW.actor_id AND org_id=NEW.supplier_id AND role IN('SUPPLIER','OPERATOR') AND (NEW.action NOT IN('approve','return','withdraw') OR role='OPERATOR')) AND NOT (NEW.action IN('create','edit','submit') AND EXISTS(SELECT 1 FROM r3_price_connection a WHERE NOT EXISTS(SELECT 1 FROM r3_membership revoked WHERE revoked.actor_id=NEW.actor_id AND revoked.org_id=NEW.supplier_id AND revoked.active=0 AND revoked.role='SUPPLIER') AND a.state='LINKED' AND a.actor_id=NEW.actor_id AND a.supplier_id=NEW.supplier_id AND a.origin_id=json_extract(NEW.policy_json,'$.originId') AND a.product_id=json_extract(NEW.policy_json,'$.productId'))) THEN RAISE(ABORT,'GRANT_REQUIRED') END;
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
DROP TRIGGER IF EXISTS r3_price_event_guard;
