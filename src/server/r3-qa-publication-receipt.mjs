export async function readPublicationReceipt(db, hostname, {candidateId, catalogDigest, productCommit}) {
  if (!db) return null;
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

