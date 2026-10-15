# IA Portal — data connection and access contract (MSG0233)

**Status:** code implemented / local mock verified / real Cloudflare Access and Google service account NOT configured or tested. No Google write performed. Existing public/ contains ONLY safe holding page.

## Source of truth and ownership

Native spreadsheet 5 existing tabs. Use server-only env `IA_GOOGLE_SHEET_ID`, NOT a public JavaScript URL. Google Drive assets remain private; no uploads or source URLs are enabled until permission, retention, archive, version and untrusted-file isolation acceptance.

| Existing tab | Read projection (fixed server A1 range) | Write position and rules |
| --- | --- | --- |
| 화면_관리 | A-H read fields; 76 ScreenIDs, names, phases; **no M user notes** on listing | Existing M user memo retained. Any edit requires actor, expected row revision and explicit approval; not yet enabled |
| 향후_검토 | A-E only, 25 decisions / 24 active / 1 fully approved; PENDING19 operational review remains open | F user input retained; proposed separate append-only review ledger, not enabled |
| 사업_로드맵 | A-G Stage0-6, distinct IA-R0..R6 technical roadmap in repo | Owner/planner approval only, disabled |
| 의견_기록 | A-D/F-H only via privileged `/notes` list (OWNER/IA_PLANNER); user text retained | Append-only note events with idempotency + audit and conflict strategy proposed; disabled |
| 사용_안내 | A-C read-only | No online writes |

## Server interface

`GET /api/ia/screens[?screenId=F17]`, `/decisions`, `/roadmap`, `/guide`, `/notes[?screenId=F17]`, `/assets?screenId=F17`.
Authenticated production API requires verified Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, issuer, audience, expiry, RSA signature fetched from tenant JWKS). Explicit OWNER, IA_PLANNER, REVIEWER, UIUX, ENGINEER mapping is provisioned by owner's `IA_ROLE_BINDINGS_JSON`. No self-signup, no inherited Workspace/IndiaDesk passwords or sessions. Role authorization is SERVER-SIDE and deny by default. OWNER/IA_PLANNER only may view user memo records; no automatic note→user-approval. No unverified URL returned by asset endpoint. No Google query can choose an arbitrary sheet, range, spreadsheet ID or endpoint.

`POST /api/ia/notes` and other writes deliberately return 405, even for OWNER, until explicit owner permission and atomic conflict/audit contract. Google Sheets `values.update` is NOT atomic compare-and-swap. A pre-read+write alone permits lost updates; do not claim concurrency solved or overwrite user cells. Proposed future `REVIEW_NOTES` and `AUDIT_EVENTS` logs require an approved atomic/idempotent workflow (or proof acceptable concurrency semantics) before enabling. `ASSET_VERSION_INDEX` and `ROLES` are logical private server/index contracts, NOT created new tabs or databases.

## Cloudflare Pages Functions bindings (owner-only, no credentials in Git)

- `IA_ACCESS_TEAM_DOMAIN`: exact HTTPS `https://<team>.cloudflareaccess.com`
- `IA_ACCESS_AUD`: Application Audience tag for exact protected production site
- `IA_ROLE_BINDINGS_JSON`: private normalized email → OWNER / IA_PLANNER / REVIEWER / UIUX / ENGINEER role mapping
- `IA_GOOGLE_READ_ENABLED`: must explicitly be `true` for Google read
- `IA_GOOGLE_SHEET_ID`: single existing IA spreadsheet ID
- `IA_GOOGLE_SERVICE_ACCOUNT_JSON`: dedicated Google service-account JSON, encrypted environment secret; share only exact existing spreadsheet with service account (read permission initially). No new Google Cloud project or account is created by code.

Provider flow: service-account WebCrypto RSA-SHA256 assertion → Google OAuth token (`spreadsheets.readonly` scope) → fixed `spreadsheets.values:batchGet` call. No Google secret or private data is ever imported by `public/`. Missing Access settings returns 403; missing Google config after authenticated role returns 503.

## R0 and full internal release gate

The existing safe public holding page can stay live. Full internal 76-screen IA/25 decision interactive UI, original docs, links and user notes MUST NOT be copied to `public/` until exact production `order-ia-portal.pages.dev` Cloudflare Access policy with allowed identities, origin JWT verification, root/direct URL access denial, and role-specific functionality are verified. Existing `public/` remains single-file and unchanged by this work. Live Google read/write, Cloudflare deployment ID and full UI approval are NOT VERIFIED.

No D1/Supabase/Firestore/Worker/Apps Script/new Cloud project, no client-side Sheets OAuth/secret. Actual customer quote/order and IP/analytics product DB are explicitly out of scope.
