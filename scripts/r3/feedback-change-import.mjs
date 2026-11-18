// Prepare idempotent developer evidence for a pinned private feedback export. Run
// from the reviewed IA checkout. This script emits parameters and makes no DB call.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {catalog, release} from '../../src/server/r3-ui/catalog.gen.mjs';

const [traceFile, output] = process.argv.slice(2);
if (!traceFile || !output) throw new Error('Usage: node feedback-change-import.mjs feedback-trace.json output.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = 'e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
const trace = JSON.parse(await readFile(traceFile, 'utf8'));
const catalogFile = await readFile(new URL('../../src/server/r3-ui/catalog.gen.mjs', import.meta.url));
if (trace.sources.originalSha256 !== source || trace.sources.catalogSha256 !== sha(catalogFile))
  throw new Error('Original feedback or current catalog differs from the correction matrix.');
const byFrame = new Map(catalog.map(row => [row.id, row]));
const seen = new Set();
const parameters = [];
for (const comment of trace.comments) {
  if (seen.has(comment.id)) throw new Error('Duplicate feedback ID');
  seen.add(comment.id);
  if (comment.originalDeleted) continue;
  const row = byFrame.get(comment.afterFrameId);
  const viewport = Number(comment.record.split('/').at(-1));
  if (!row || !row.hashes[viewport] || comment.record !== row.id+'/'+viewport) throw new Error('Unmatched target '+comment.id);
  const artifactHash = row.hashes[viewport];
  const change = comment.disposition === 'SOURCE_DELTA_REVIEW_REQUIRED';
  if (change && !comment.evidence?.observed) throw new Error('Missing observation '+comment.id);
  const data = {
    target:{screen:row.screen, state:row.state, variant:row.variant, viewport, artifactHash},
    sourceKey:comment.record, sourceCommentId:comment.id, status:change?'recheck':'unknown',
    body:change?comment.evidence.observed:'이 의견에 개별 반영 근거를 아직 연결하지 않았습니다.'
  };
  if (change) data.evidenceRef = String(comment.evidence.path || trace.sources.iaCommit).slice(0,512);
  const content = JSON.stringify(data);
  const id = 'feedback:'+comment.id+':'+artifactHash;
  const hash = sha(id+'\n'+content);
  parameters.push([release,id,content,'astra-evidence:'+hash,hash,source,comment.record,comment.id]);
}
if (seen.size !== 173 || parameters.length !== 162) throw new Error('Feedback counts do not match the original');
const sql = `WITH incoming(release,id,data,event_key,digest,source_sha,source_key,comment_id) AS
 (VALUES (?,?,?,?,?,?,?,?))
INSERT INTO qa_review_events (release,kind,id,revision,action,reason,data,actor,request_key,request_hash)
SELECT i.release,'change',i.id,1+COALESCE((SELECT max(e.revision) FROM qa_review_events e
 WHERE e.release=i.release AND e.kind='change' AND e.id=i.id),0),'save','',i.data,
 'ASTRA_ENGINE_EXECUTION',i.event_key,i.digest FROM incoming i
WHERE EXISTS (SELECT 1 FROM qa_legacy_records r JOIN qa_legacy_sources s ON s.sha256=r.source_sha,
 json_each(r.payload,'$.comments') c WHERE r.source_sha=i.source_sha AND s.complete=1
 AND r.source_key=i.source_key AND json_extract(c.value,'$.id')=i.comment_id AND COALESCE(json_extract(c.value,'$.deleted'),0)=0)
 AND NOT EXISTS (SELECT 1 FROM qa_review_events e WHERE e.actor='ASTRA_ENGINE_EXECUTION' AND e.request_key=i.event_key)`;
await writeFile(output, JSON.stringify({release,source,sql,parameters}));
