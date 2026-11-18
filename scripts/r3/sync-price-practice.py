"""Generate the isolated QA pricing schema from the same reviewed business tables and constraints."""
from pathlib import Path
import re
base=Path(__file__).resolve().parents[2]
source=(base/'migrations/0002_r3_price.sql').read_text()
roles=(base/'migrations/0003_r3_roles.sql').read_text()
shared='\n'.join(re.search(rf'CREATE TABLE IF NOT EXISTS {name} \(.*?\n\);',roles,re.S)[0] for name in ['r3_membership','r3_business_site'])
sql='-- Derived, physically isolated role practice tables. No customer record or grants.\n'+(shared+'\n'+source).replace('r3_', 'r3_practice_')
(base/'migrations/0005_r3_price_practice.sql').write_text(sql)
