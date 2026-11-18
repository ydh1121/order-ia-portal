// R3 private review operations. State advancement never executes payment, dispatch or document issuance.
const definitions = {
  business: [
    ['DRAFT','submit','REVIEW','BUYER'], ['DRAFT','manual','EVIDENCE_REQUIRED','BUYER'],
    ['EVIDENCE_REQUIRED','attach','REVIEW','BUYER'], ['REVIEW','supplement','NEEDS_INFO','OPERATOR'],
    ['NEEDS_INFO','attach','REVIEW','BUYER'], ['REVIEW','verify','VERIFIED','OPERATOR'],
    ['REVIEW','reject','REJECTED','OPERATOR'], ['VERIFIED','revoke','REVOKED','OPERATOR'],
  ],
  supply: [
    ['DRAFT','submit','REVIEW','SUPPLIER'], ['REVIEW','supplement','NEEDS_INFO','OPERATOR'],
    ['NEEDS_INFO','submit','REVIEW','SUPPLIER'], ['REVIEW','approve','APPROVED','OPERATOR'], ['REVIEW','reject','REJECTED','OPERATOR'],
  ],
  catalog: [
    ['DRAFT','submit','REVIEW','SUPPLIER'], ['REVIEW','supplement','NEEDS_INFO','OPERATOR'],
    ['NEEDS_INFO','submit','REVIEW','SUPPLIER'], ['REVIEW','approve','APPROVED','OPERATOR'], ['REVIEW','reject','REJECTED','OPERATOR'],
  ],
  consult: [
    ['DRAFT','submit','OPEN','BUYER'], ['OPEN','respond','ANSWERED','OPERATOR'],
    ['ANSWERED','followup','OPEN','BUYER'], ['ANSWERED','resolve','CLOSED','BUYER'],
  ],
  reprice: [
    ['DRAFT','attach','REVIEW','BUYER'], ['REVIEW','supplement','NEEDS_INFO','OPERATOR'],
    ['NEEDS_INFO','attach','REVIEW','BUYER'], ['REVIEW','request-price','RECALCULATION_REQUESTED','OPERATOR'],
    ['RECALCULATION_REQUESTED','link-requote','QUOTE_UPDATED','BUYER'],
    ['REVIEW','reject','REJECTED','OPERATOR'],
  ],
  delivery: [
    ['DRAFT','submit','REQUESTED','BUYER'], ['REQUESTED','accept','ACCEPTED','OPERATOR'],
    ['REQUESTED','reject','REJECTED','OPERATOR'], ['ACCEPTED','payment-request','PAYMENT_REVIEW','BUYER'],
    ['PAYMENT_REVIEW','payment-review','PAYMENT_REVIEWED','OPERATOR'], ['PAYMENT_REVIEWED','schedule','SCHEDULED','SUPPLIER'],
    ['SCHEDULED','dispatch','DISPATCHED','SUPPLIER'], ['DISPATCHED','report-issue','ISSUE_REVIEW','BUYER'],
    ['ISSUE_REVIEW','reschedule','SCHEDULED','OPERATOR'], ['DISPATCHED','receive','RECEIVED','BUYER'],
    ['RECEIVED','attach','RECEIVED','SUPPLIER'], ['DOCUMENT_REVIEWED','attach','DOCUMENT_REVIEWED','SUPPLIER'],
    ['RECEIVED','document-review','DOCUMENT_REVIEWED','OPERATOR'], ['DOCUMENT_REVIEWED','settlement-review','SETTLEMENT_REVIEW','SUPPLIER'],
    ['SETTLEMENT_REVIEW','supplement','DOCUMENT_REVIEWED','OPERATOR'], ['SETTLEMENT_REVIEW','settle','SETTLEMENT_REVIEWED','OPERATOR'],
  ],
};
export const caseKinds = Object.freeze(Object.keys(definitions));
export const creatorRole = kind => ['catalog','supply'].includes(kind) ? 'SUPPLIER' : 'BUYER';
export function transitions(kind,state) {
  const rules = (definitions[kind] || []).filter(row=>row[0]===state);
  if (['DRAFT','NEEDS_INFO','EVIDENCE_REQUIRED','REQUESTED','OPEN'].includes(state)) rules.push([state,'cancel','CANCELLED',creatorRole(kind)]);
  if (state==='CANCELLED') rules.push([state,'resume','DRAFT',creatorRole(kind)]);
  return rules.map(([,action,next,role])=>({action,next,role}));
}
export const dispositionReasons = new Set(['MISSING_EVIDENCE','SCOPE_MISMATCH','INVALID_DETAILS','DELIVERY_EXCEPTION','REVIEW_DECISION']);
export const reasonRequired = new Set(['reject','revoke','supplement','report-issue']);
