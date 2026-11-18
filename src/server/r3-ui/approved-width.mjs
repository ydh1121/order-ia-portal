// Additional approved viewport choices keep all previously issued review identities.
export {approvedWidths} from './approved-width-list.mjs';
import {additionalWidths} from './approved-width-list.mjs';
import {widthIndex} from './approved-widths.gen.mjs';
const cache = new Map();

export async function approvedHash(row, width, version) {
  const hashes = version === 'previous' ? row.previousHashes : row.hashes;
  if (hashes[width]) return hashes[width];
  if (!additionalWidths.includes(width)) return undefined;
  const source = hashes[width < 768 ? 390 : 1440];
  if (widthIndex[source]?.[width]) return widthIndex[source][width];
  const identity = 'MSG0585-R3|viewport|' + width + '|' + source;
  if (!cache.has(identity)) {
    const bytes = new TextEncoder().encode(identity);
    cache.set(identity, crypto.subtle.digest('SHA-256', bytes).then(digest =>
      Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')));
  }
  return cache.get(identity);
}

export async function reviewHashes(row) {
  const mobile=widthIndex[row.hashes[390]], desktop=widthIndex[row.hashes[1440]];
  if (mobile && desktop) return {...row.hashes,...mobile,...desktop};
  const values = await Promise.all(additionalWidths.map(width => approvedHash(row,width,'current')));
  return {...row.hashes,...Object.fromEntries(additionalWidths.map((width,i)=>[width,values[i]]))};
}
