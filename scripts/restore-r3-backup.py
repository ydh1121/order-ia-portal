"""Restore a private QA backup to a fresh, offline SQLite file for inspection.
Run import-r3-feedback.py separately for the immutable source referenced by the backup.
The program never alters an existing database or assigns business permissions.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sqlite3

SOURCE='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144'

def restore(source, destination):
    backup=json.loads(source.read_bytes())
    if backup.get('schema')!='order-r3-review-backup/v1' or backup['legacySourceSha256']!=SOURCE:
        raise ValueError('unexpected backup format or immutable source')
    release,events,until=backup['release'],backup['events'],backup['until']
    if not isinstance(release,str) or not isinstance(until,int) or until<0 or not isinstance(events,list):
        raise ValueError('invalid release or cursor')
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    os.close(fd)
    db=None
    try:
        db=sqlite3.connect(destination)
        db.executescript((Path(__file__).resolve().parent.parent/'migrations/0001_r3_qa.sql').read_text())
        last=0
        revisions={}
        for e in events:
            key=(e['kind'],e['id'])
            if (e['release']!=release or e['revision']!=revisions.get(key,0)+1 or
                    not last<e['cursor']<=until or not re.fullmatch('[0-9a-f]{64}',e['requestHash'])):
                raise ValueError('invalid order, scope or revision')
            last=e['cursor']
            revisions[key]=e['revision']
            db.execute('INSERT INTO qa_review_events(cursor,release,kind,id,revision,action,reason,data,actor,request_key,request_hash,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                       (last,release,*key,e['revision'],e['action'],e['reason'],json.dumps(e['data'],ensure_ascii=False),e['actor'],e['requestKey'],e['requestHash'],e['updatedAt']))
        if last!=until:
            raise ValueError('incomplete export')
        db.commit()
        return {'release':release,'events':len(events),'lastCursor':last,'records':len(revisions),'mode':'offline-restore'}
    except BaseException:
        if db is not None:db.close()
        destination.unlink(missing_ok=True)
        raise
    finally:
        if db is not None:db.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('backup',type=Path)
    parser.add_argument('new_database',type=Path)
    args=parser.parse_args()
    print(json.dumps(restore(args.backup,args.new_database)))
