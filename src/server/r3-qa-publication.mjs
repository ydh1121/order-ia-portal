import {catalog, cssHash, previousCssHash} from './r3-ui/catalog.gen.mjs';
import {widthIndex} from './r3-ui/approved-widths.gen.mjs';
import {quoteCommit} from './r3-product-sources.mjs';

// Issue a fresh candidate ID before publishing a different IA commit, even with an identical product catalog.
const candidateId = 'MSG0585-R3-20261119-QA-RECEIPT-01';
let digest;

export async function publicationIdentity() {
  digest ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify([catalog, widthIndex, cssHash, previousCssHash])
  )).then(value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join(''));
  return {candidateId, catalogDigest: await digest, productCommit: quoteCommit};
}

export async function readPublication(db, hostname) {
  if (!db) return null;
  const {candidateId, catalogDigest, productCommit} = await publicationIdentity();
  try {
    const receipt = await db.prepare(
      'SELECT ia_commit AS iaCommit, product_commit AS productCommit, deployment_id AS deploymentId ' +
      'FROM qa_publications WHERE candidate_id=? AND catalog_digest=? AND product_commit=?'
    ).bind(candidateId, catalogDigest, productCommit).first();
    if (!receipt) return null;
    // A preview receipt cannot attest a later main deployment or another preview's unique hostname.
    const immutableHost = receipt.deploymentId.slice(0, 8) + '.order-ia-portal.pages.dev';
    const branchHost = 'feat-ia-r3-private-0585.order-ia-portal.pages.dev';
    return hostname === branchHost || hostname === immutableHost ? receipt : null;
  } catch {
    // The catalog is still available while its receipt or D1 migration is pending.
    return null;
  }
}
