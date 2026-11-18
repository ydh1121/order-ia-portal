# order.ooo IA Portal — source / deployment boundary

Dedicated existing private repository: `ydh1121/order-ia-portal`.

## Private QA review (MSG0585)

Open the existing IA portal and select **QA 랩**. The standalone review URL is `/ia?view=qa-lab`. A signed OWNER session protects the page, artifacts and review API. Edits use the existing session’s CSRF token, a transaction ID and the last saved revision. A conflict preserves the reviewer’s unsubmitted text. Review status belongs to a particular screen, state, variant, width and artifact.

- `/ia?view=simple-r3` and `/ia?view=detailed-r3` run the integrated quote candidate with separate QA storage.
- `/ia?view=roles-r3` shows the business workflows. Real actions check membership and site on the server.
- `/ia?view=pricing-r3` is the price and delivery desk. `&practice=1` opens an isolated synthetic review space.
- `ORDER_QA_DB` is the private D1 binding on the production IA project. Apply the numbered migrations in order. Import the approved R2 feedback through `scripts/import-r3-feedback.py`; keep the source JSON and generated SQL outside Git and the public directory.
- `npm run test:ia` runs the server and state tests. The IA workflow additionally runs browser tests against the same source with temporary local sessions and SQLite.

The original IA references and their decisions are retained. Historical bootstrap notes follow.

## Deployment contract
The **only** publish directory for the existing Cloudflare Pages project is `public/`. The initial content is a nonconfidential holding page at `public/index.html`; do not copy or bundle `src/internal/` into it. Pages production branch: `main`. Cloudflare production authentication and Preview branch configuration have **not** been verified. The initial holding page may be publicly visible.

## Internal-only source
- `src/internal/archive/IA_R1_20261015_22CARD_LOCAL_REVIEW.html`: preserved historic local candidate; requires Access and server authorization before publication.
- `src/internal/archive/ORDER_IA_PORTAL_CURRENT_v03.html`: canonical original v0.3 source, preserved separately.
- `src/internal/planning/delta157-snapshot.json`: read-only sanitized metadata snapshot of the 76 canonical ScreenIDs and 25 policy decisions (24 active, 1 fully approved). It includes **no user-authored memo columns**. Policy display and backend behavior are not implemented in the public site.

Accepted old local QA: static 17/17, Chromium in-memory DOM 123/123, existing private Library files unchanged; no HTTP, Access or authenticated Production acceptance. User IA and customer Low-fi approval NONE.

## Security
No credentials, private user memos, company registration numbers, price quotes or live integrations. No production APIs. No commit of .env/secrets. GitHub PRIVATE does not make Pages content private. Do not publish the 76-screen internal site, private links, or policy details until authenticated Cloudflare Access covers the exact production host, signed-out direct-resource denial is demonstrated, and server-side role authorization is accepted.

Current task: same WO `WO-ORDER-IA-PORTAL-R0-R1-20261015-001`; MSG-20261015-0230 user-approved first safe bootstrap.
