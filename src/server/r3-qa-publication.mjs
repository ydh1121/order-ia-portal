import {readPublicationReceipt} from './r3-qa-publication-receipt.mjs';
import {catalog, cssHash, previousCssHash} from './r3-ui/catalog.gen.mjs';
import {widthIndex} from './r3-ui/approved-widths.gen.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {getQaSupplemental} from './r3-qa-assets.mjs';
import {qaReviewRuntimeDigest,qaFixtureForRow} from './r3-qa-review-runtime.mjs';
import {researchBuild} from './research-app/assets.gen.mjs';

// Issue a fresh candidate ID before publishing a different IA commit, even with an identical product catalog.
const candidateId = 'MSG0585-R3-20261127-EGG-MARKET-01';
let digest;

export async function publicationIdentity() {
  digest ??= getQaSupplemental().then(additions=>crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify([catalog, widthIndex, cssHash, previousCssHash,additions.rows,qaReviewRuntimeDigest,[...catalog,...additions.rows].map(row=>[row.id,qaFixtureForRow(row)]),researchBuild.digest])
  ))).then(value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join(''));
  return {candidateId, catalogDigest: await digest, productCommit: quoteCommit};
}

export async function readPublication(db, hostname) {
  if (!db) return null;
  return readPublicationReceipt(db, hostname, await publicationIdentity());
}
