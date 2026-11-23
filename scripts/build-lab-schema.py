"""Compile the *same* product migrations and allowlisted SQL identifiers for D1.

SQLite parses statement boundaries (including triggers); request data never
supplies SQL, table names, schema, grants or a database binding.
"""
import hashlib
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = [
    '0003_r3_roles', '0002_r3_price', '0004_r3_evidence',
    '0006_r3_price_catalog', '0008_r3_role_workspace',
    '0009_r3_price_registration', '0010_r3_member_requests',
    '0011_r3_personal_price_draft', '0014_r3_price_workspace',
    '0015_r3_saved_businesses', '0017_product_operations', '0018_notification_preferences',
]
statements, sources = [], []
db = sqlite3.connect(':memory:')
for name in NAMES:
    raw = (ROOT / 'migrations' / (name + '.sql')).read_text()
    sources.append({'path': 'migrations/' + name + '.sql', 'sha256': hashlib.sha256(raw.encode()).hexdigest()})
    pending = ''
    for line in raw.splitlines(keepends=True):
        pending += line
        if sqlite3.complete_statement(pending):
            statements.append(pending.strip())
            db.executescript(pending)
            pending = ''
    if pending.strip() and re.sub(r'--[^\n]*', '', pending).strip():
        raise ValueError('Incomplete SQL: ' + name)
objects = [r for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name") if not r[1].startswith('r3_practice_') and not r[2].startswith('r3_practice_')]
tables = []
for kind, name, _, _ in objects:
    if kind == 'table':
        info = db.execute('PRAGMA table_info(' + name + ')').fetchall()
        tables.append({'name': name, 'columns': [c[1] for c in info], 'primaryKey': [c[1] for c in sorted(info, key=lambda c: c[5]) if c[5]], 'references': sorted({r[2] for r in db.execute('PRAGMA foreign_key_list(' + name + ')')})})
ordered = []
while tables:
    ready = [t for t in tables if all(ref in {p['name'] for p in ordered} or ref == t['name'] for ref in t['references'])]
    if not ready:
        raise ValueError('Cyclic product schema needs an explicit restore plan')
    ordered.extend(ready)
    tables = [t for t in tables if t not in ready]
tables = ordered
# The final schema, not the intermediate migrations, is used when creating a
# fresh namespace. Restores load rows before installing the canonical triggers.
ddl = [sql for target in ['table','index'] for kind, _, _, sql in objects if kind == target and sql]
triggers = [sql for kind, _, _, sql in objects if kind == 'trigger' and sql]
schema = {'version': 1, 'sources': sources, 'identifiers': [r[1] for r in objects], 'tables': tables, 'ddl': ddl, 'triggers': triggers}
digest = hashlib.sha256(json.dumps(schema, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
target = ROOT / 'src/server/product-lab-schema.gen.mjs'
target.write_text('// Generated from canonical migrations by scripts/build-lab-schema.py.\nexport const labSchema = ' + json.dumps({**schema, 'digest': digest}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(json.dumps({'tables': len(tables), 'triggers': len(triggers), 'digest': digest}))
