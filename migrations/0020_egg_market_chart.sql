-- Only a deliberate publication of customer-facing rates populates this column.
-- Existing drafts and previously applied private price books remain private.
ALTER TABLE r3_price_workspace_event ADD COLUMN market_projection TEXT
  CHECK (market_projection IS NULL OR (action <> 'draft' AND json_valid(market_projection)));
CREATE INDEX r3_price_workspace_market
  ON r3_price_workspace_event(effective_at DESC,saved_at DESC,revision DESC,principal)
  WHERE market_projection IS NOT NULL;
