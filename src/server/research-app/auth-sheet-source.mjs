/** The ordinary product sheet keeps its guarded entry. An explicitly selected
 * QA scenario may display an authored response state without sending an email
 * or claiming that an authentication provider accepted an operation. */
export function researchAuthSheetSource(source){
  const entryGuard=/if\s*\(\s*\[\s*(['"])success\1\s*,\s*\1verified\1\s*,\s*\1sent\1\s*,\s*\1complete\1\s*,\s*\1loading\1\s*,\s*\1sending\1\s*\]\s*\.includes\(entry\)\s*\)\s*return false;/g;
  if([...source.matchAll(entryGuard)].length!==1)throw Error('RESEARCH_AUTH_SHEET_SOURCE_CHANGED');
  return source.replace(entryGuard,match=>match.replace(/if\s*\(/,'if(!api.reviewScenario&&'));
}
