import {catalog, cssHash, previousCssHash} from './r3-ui/catalog.gen.mjs';
import {widthIndex} from './r3-ui/approved-widths.gen.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {getQaSupplemental} from './r3-qa-assets.mjs';
import {qaReviewRuntimeDigest,qaFixtureForRow} from './r3-qa-review-runtime.mjs';

// Issue a fresh candidate ID before publishing a different IA commit, even with an identical product catalog.
const candidateId = 'MSG0585-R3-20261122-REWORK-ONLY-14';
let digest;

export async function publicationIdentity() {
  digest ??= getQaSupplemental().then(additions=>crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify([catalog, widthIndex, cssHash, previousCssHash,additions.rows,qaReviewRuntimeDigest,[...catalog,...additions.rows].map(row=>[row.id,qaFixtureForRow(row)])])
  ))).then(value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join(''));
  return {candidateId, catalogDigest: await digest, productCommit: quoteCommit};
}

export async function readPublication(db, hostname) {
  if (!db) return null;
  const {candidateId, catalogDigest, productCommit} = await publicationIdentity();
  try {
    // Main and preview have independent immutable receipts even when their
    // catalog is identical. A preview receipt never attests a merge deployment.
    const mainHost = 'order-ia-portal.pages.dev';
    const branchHost = 'feat-ia-r3-private-0585.order-ia-portal.pages.dev';
    const candidates = hostname === mainHost ? [candidateId + ':main'] :
      hostname === branchHost ? [candidateId] : [candidateId, candidateId + ':main'];
    for (const id of candidates) {
      const receipt = await db.prepare(
        'SELECT ia_commit AS iaCommit, product_commit AS productCommit, deployment_id AS deploymentId ' +
        'FROM qa_publications WHERE candidate_id=? AND catalog_digest=? AND product_commit=?'
      ).bind(id, catalogDigest, productCommit).first();
      if (!receipt) continue;
      const alias = id.endsWith(':main') ? mainHost : branchHost;
      const immutableHost = receipt.deploymentId.slice(0, 8) + '.order-ia-portal.pages.dev';
      if (hostname === alias || hostname === immutableHost) return receipt;
    }
    return null;
  } catch {
    // The catalog is still available while its receipt or D1 migration is pending.
    return null;
  }
}

