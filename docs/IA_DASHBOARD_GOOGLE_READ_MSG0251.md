# CODE1 / order.ooo — IA dashboard Google Sheets read-only connection

WORK_ORDER: WO-ORDER-IA-PORTAL-R0-R1-20261015-001
MESSAGE: MSG-20261017-0251

## What is implemented

Existing private repo and existing Pages project only. The function at `/ia/` authenticates the OWNER cookie on every GET/HEAD and emits a generic HTML shell without any private ScreenID/decisions/sheet content. Static `public/owner.js` and `owner.css` contain only generic UI code. The new same-origin endpoint `GET /api/ia/dashboard` validates the session at the server before reading Google, authorizes OWNER only, then fetches FIVE fixed Sheets tab ranges in one OAuth batch request. It validates 76 canonical ScreenIDs, exactly 25 policy IDs (24 open/partial and 1 fully approved) and seven ordered business phases (0~6). It includes read-only screened review-log data, never a write or implicit user approval.

The five tabs are `화면_관리` (A1:S77), `향후_검토` (A1:N26), `사업_로드맵` (A1:G8), `사용_안내` (A1:C24), `의견_기록` (A1:K250). Any provider denial, configuration failure or parity mismatch produces a bounded 503 with a nonsecret reason **only after OWNER authentication**. Other per-resource GETs remain intact; POST is 405. Historical source/QA, production price quotes, lowfi v0.15R2 and raw user's Sheet cells are not changed. Static output contains no private data/links/prices, and no test HTML is committed under `public/`.

## Exact one-time Google authorization (owner)

1. In an **existing Google Cloud project you administer**, identify a dedicated service account for this IA read-only use, not credentials borrowed from IndiaDesk/CODE1 Workspace. If none is available, choose whether to create one **inside an existing project**. No new Cloud project is needed. Ensure Google Sheets API is enabled in that project. A service account key may be prohibited by organization policy; if so, keep the feature disabled and choose a keyless authorized design rather than weakening authentication.
2. In Google Sheets, open the **existing restricted IA document** `28_ORDER_IA_MASTER_화면·검토·의견_v0.1`, press **Share**, enter ONLY the dedicated service account email ending `gserviceaccount.com`, assign **Viewer**, leave general access **Restricted**. Do not grant Editor or public link access. Source spreadsheet ID is `1-HKnaTZuH8k6asKtJg1IKHy3mJOIO6CXSw1zFfws5Sg`.
3. In the existing Cloudflare dashboard **Workers & Pages → order-ia-portal → Settings → Variables and Secrets → Production**, add `IA_GOOGLE_SHEET_ID` as the ID above (Text), `IA_GOOGLE_SERVICE_ACCOUNT_JSON` as the complete existing authorized service-account JSON (**Encrypt**), then set `IA_GOOGLE_READ_ENABLED` to `true` (Text), and save. Do not alter `IA_OWNER_*` values or regenerate your existing password/keys.
4. Trigger a deployment of the existing Pages production branch **only if required to activate those bindings**. Open the same canonical https://order-ia-portal.pages.dev/ia/ in your already authenticated OWNER session and press **원장 새로고침**. Successful authorized server reads show screen 76, decisions 25, roadmap 7. If the session has naturally expired, reauthenticate normally; no password rotation. Read errors stay 503 and show a safe reason such as `GOOGLE_TOKEN_DENIED`, `GOOGLE_SHEET_NOT_SHARED`, `GOOGLE_READ_FAILED`, or a parity error. Do not paste private keys, access tokens, password or secret JSON in chats, Drive, GitHub, tickets or screenshots.

## Security limits and release classification

This iteration does not add a database, storage bucket, Worker, new Pages project, Preview hostname or new domain. Server stateless session security from MSG0249 remains unchanged; logout E2E is not yet independently verified on the owner's actual device. Challenge replay cache and login rate limiter are per isolate; stateless logout does not revoke an already stolen session cookie during its remaining ten-minute TTL. Full private asset launch remains HOLD until Google owner read, anonymous direct URL denial and role tests are demonstrated. USER_APPROVED_IA=NONE, LOWFI=NONE; owner Sheet notes in original columns M and F are preserved.

### Test levels

- Scoped Node server security/provider-projection tests: local MOCK_PASS only.
- Chromium 390/1440 render/search/detail/tabs tests: MOCK_PASS only. Browser mock uses in-memory synthetic rows and no owner password.
- Production anonymous API and real Google-account OWNER readback must be checked separately post-deployment. A 503 before owner permission is expected, not LIVE_PASS.
