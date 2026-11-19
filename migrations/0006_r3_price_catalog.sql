-- Human-readable catalogue for existing, separately granted supplier/depot/product scopes.
-- An untitled scope is never advertised as a purchasable assortment.
CREATE TABLE IF NOT EXISTS r3_price_catalog (
  supplier_id TEXT NOT NULL, origin_id TEXT NOT NULL, product_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0), definition TEXT NOT NULL CHECK(json_valid(definition)),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (supplier_id,origin_id,product_id),
  FOREIGN KEY (supplier_id,origin_id,product_id) REFERENCES r3_price_scope(supplier_id,origin_id,product_id)
);
CREATE TABLE IF NOT EXISTS r3_practice_price_catalog (
  supplier_id TEXT NOT NULL, origin_id TEXT NOT NULL, product_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0), definition TEXT NOT NULL CHECK(json_valid(definition)),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (supplier_id,origin_id,product_id),
  FOREIGN KEY (supplier_id,origin_id,product_id) REFERENCES r3_practice_price_scope(supplier_id,origin_id,product_id)
);
