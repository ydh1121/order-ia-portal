"""Build bounded D1 SQL files for the pinned, private MSG0585 immutable source."""
import argparse
import hashlib
import json
from pathlib import Path

EXPECTED_SHA = 'e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144'

def sql(s):
    return "'" + s.replace("'", "''") + "'"

def build(source, out):
    raw = source.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA or len(raw) != 432073:
        raise ValueError('wrong source bytes')
    doc = json.loads(raw)
    records = doc['records']
    comments = [c for row in records.values() for c in row['comments']]
    totals = [len(records), len(comments), sum(bool(c['deleted']) for c in comments), sum(len(c['history']) for c in comments)]
    if totals != [131, 173, 11, 87]:
        raise ValueError(f'legacy shape mismatch: {totals}')
    chunks = [raw[i:i+16000] for i in range(0,len(raw),16000)]
    key = sql(sha)
    groups = [[f'INSERT OR IGNORE INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version) VALUES ({key},{len(raw)},{len(chunks)},{len(records)},1);']]
    for i,chunk in enumerate(chunks):
        groups.append([f"INSERT OR IGNORE INTO qa_legacy_chunks(source_sha,ordinal,raw_bytes) VALUES ({key},{i},X'{chunk.hex()}');"])
    for i,(name,record) in enumerate(records.items(),1):
        pointer='/records/'+name.replace('~','~0').replace('/','~1')
        value=json.dumps(record,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        groups.append([f'INSERT OR IGNORE INTO qa_legacy_records(source_sha,source_key,source_pointer,ordinal,payload) VALUES ({key},{sql(name)},{sql(pointer)},{i},{sql(value)});'])
    groups.append([f'UPDATE qa_legacy_sources SET complete=1 WHERE sha256={key} AND complete=0;'])
    out.mkdir(exist_ok=True,parents=True)
    for i,group in enumerate(groups):
        (out/f'{i:03}.sql').write_text('\n'.join(group)+'\n')
    return {'source':sha,'bytes':len(raw),'records':len(records),'chunks':len(chunks),'counts':totals,'statements':len(groups)}

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('source',type=Path)
    ap.add_argument('--out-dir',required=True,type=Path)
    args=ap.parse_args()
    print(json.dumps(build(args.source,args.out_dir)))
