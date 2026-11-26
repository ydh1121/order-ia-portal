import {pushDigest} from './notification-push-crypto.mjs';

const sql = (db, text, ...args) => db.prepare(text).bind(...args);
const DAY = 86400000;

// Recipients use their actual grants, not the organization last selected in a
// browser. These are the same approved supply offers exposed by r3-price.
export const priceNotificationAudience = `(m.active=1 AND (
 (m.role='BUYER' AND EXISTS(SELECT 1 FROM r3_business_site b JOIN r3_price_destination d
  ON d.org_id=b.org_id AND d.site_id=b.site_id WHERE b.org_id=m.org_id AND b.site_id=m.site_id AND b.verification='VERIFIED'))
 OR (m.role IN('SUPPLIER','OPERATOR') AND m.org_id=? AND m.site_id='')))`;

/** Consume only new approval events captured by migration 0019. A stale,
 * withdrawn, superseded or no-longer-published policy never becomes a notice.
 * The immutable source event and notice insertion are linked in one transaction. */
export async function materializePriceNotifications(db, now = new Date().toISOString(), limit = 4) {
  const due = (await sql(db, `SELECT * FROM order_notification_price_event
    WHERE state='pending' AND available_at<=? ORDER BY available_at,version_id,revision LIMIT ?`, now, limit).all()).results;
  let processed = 0, cancelled = 0;
  for (const event of due) {
    const policy = JSON.parse(event.policy_json);
    const current = await sql(db, `SELECT 1 ok FROM r3_price_version v JOIN r3_price_scope s
      ON s.supplier_id=v.supplier_id AND s.origin_id=json_extract(v.policy_json,'$.originId') AND s.product_id=json_extract(v.policy_json,'$.productId')
      WHERE v.id=? AND v.revision=? AND v.status='APPROVED' AND s.active=1
      AND json_extract(v.policy_json,'$.effectiveFrom')<=? AND (json_extract(v.policy_json,'$.effectiveTo') IS NULL OR json_extract(v.policy_json,'$.effectiveTo')>?)`,
    event.version_id, event.revision, now, now).first();
    if (!current || Date.parse(now) - Date.parse(event.available_at) > DAY) {
      const result = await sql(db, `UPDATE order_notification_price_event SET state='cancelled',completed_at=?,reason=?
        WHERE version_id=? AND revision=? AND state='pending'`, now, current ? 'STALE_EVENT' : 'SOURCE_NO_LONGER_ACTIVE', event.version_id, event.revision).run();
      cancelled += Number(result.meta?.changes || 0); continue;
    }
    const notificationId = 'price-' + await pushDigest(JSON.stringify([event.version_id, event.revision]));
    const name = typeof policy.displayName === 'string' ? policy.displayName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : '상품';
    const data = JSON.stringify({title: '공급 단가가 변경됐어요', body: `${name}의 승인 단가가 적용됐어요. 단가표에서 변경 내용을 확인해 주세요.`,
      category: 'price', route: 'pricing', eventOccurredAt: event.available_at,
      source: {kind: 'approved-price', versionId: event.version_id, revision: event.revision, supplierId: event.supplier_id,
        originId: policy.originId, productId: policy.productId, effectiveFrom: policy.effectiveFrom}});
    const results = await db.batch([
      sql(db, `INSERT OR IGNORE INTO order_notification(id,actor_id,revision,data_json,created_at)
        SELECT DISTINCT ?,m.actor_id,1,?,? FROM r3_membership m JOIN order_notification_preference p ON p.actor_id=m.actor_id
        WHERE ${priceNotificationAudience} AND json_extract(p.preferences_json,'$.price')=1 AND p.updated_at<=?
        AND coalesce((SELECT state FROM order_account WHERE actor_id=m.actor_id),'ACTIVE')='ACTIVE'
        AND EXISTS(SELECT 1 FROM order_notification_price_event e JOIN r3_price_version v ON v.id=e.version_id AND v.revision=e.revision
          JOIN r3_price_scope s ON s.supplier_id=v.supplier_id AND s.origin_id=json_extract(v.policy_json,'$.originId') AND s.product_id=json_extract(v.policy_json,'$.productId')
          WHERE e.version_id=? AND e.revision=? AND e.state='pending' AND v.status='APPROVED' AND s.active=1)`,
      notificationId, data, now, event.supplier_id, event.available_at, event.version_id, event.revision),
      sql(db, `UPDATE order_notification_price_event SET state='processed',completed_at=?
        WHERE version_id=? AND revision=? AND state='pending'`, now, event.version_id, event.revision)
    ]);
    processed += Number(results[1].meta?.changes || 0);
  }
  return {processed, cancelled};
}
