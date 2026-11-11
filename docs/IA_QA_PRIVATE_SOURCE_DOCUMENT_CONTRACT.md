# MSG0566 — existing Pages private source / authenticated document candidate

Status: LOCAL_CANDIDATE / PUBLICATION_HOLD. Same WO-ORDER-IA-PORTAL-R0-R1-20261015-001, branch fix/ia-decision-parity-20261101, Draft PR1. Base a8ffee8e8d2cc6a2a43ba5e6c9836c4148f6ad06. This document supersedes only the source/provider/document-preparation descriptions of the earlier implementation report; it does not promote any runtime, registry or browser acceptance.

## Authority and actual state

Planning contract: Drive 1_0HdXpbup5wpWeTWaRqyS1BN0hlj4BEA; review/hash evidence 1JkyCNfdHbwblXzrV816gijFL82rBMYpI. The expected principal is decided: ia-portal@order-511904.iam.gserviceaccount.com. No new identity decision or service/Worker is needed. Actual encrypted Pages binding client_email equality has NOT been inspected. Connected-user ACL metadata for the four pinned files still returned only the owner, with shared=false. No reader grant or same-principal Google read was performed.

New code is not pushed or published. The current tool connection exposes Cloudflare whoami, GitHub reads and Google Drive reads, but no Pages settings GET, source mutation, sharing or upload actions. Browser connection returned missing originating context. These are observed tool-capability limits, not proof that repository permissions were revoked. Prior preview=none (2026-11-06T15:44:39.918Z) is historical evidence, not a fresh push preflight. No operational secrets were read or copied into this package.

## Source adapter

`qa-drive-source.mjs` runs inside existing Pages Functions and is injected into `handleQaRequest` as readPrivateArtifact. It does not use or provision IA_QA_PRIVATE_SOURCE. The old generic binding adapter remains historical compatibility code, not the new route's active dependency.

The only external selector is artifact_id+version. The server resolves two fixed R3 tuples, their four Drive IDs, entrypoint, sizes, baseline and SHA256. Metadata must match id/mimeType/size/trashed=false and capabilities.canDownload=true. Only then is alt=media downloaded, with bounded streaming. Both standalone HTML and ZIP bytes are hashed; ZIP's upper entry must equal the standalone HTML. No URL, Drive ID, baseline override, extra query, redirect or version fallback is accepted.

The expected existing credential is IA_GOOGLE_SERVICE_ACCOUNT_JSON. Runtime parses client_email and rejects any mismatch before token exchange. A separate drive.readonly JWT is signed for the fixed OAuth token endpoint; there is no subject/domain-wide delegation, no change to spreadsheets.readonly, and no shared token cache. Tokens exist only within one read invocation. Authentication and upstream errors are sanitized; source keys, assertions, tokens and owner cookies are never logged or returned. Drive404 is ambiguous between absence and inaccessible/unshared content, not proof of physical deletion.

`IA_QA_DRIVE_READ_ENABLED=true` is a proposed nonsecret, disabled-by-default switch. No environment value was set. Runtime identity match/configuration, actual ACL, canDownload, content read and hash verification are separate evidence states.

Limits: package32MiB, HTML8MiB, expanded ZIP64MiB, members256. `qa-zip-content.mjs` checks central/local headers, normalized paths and aliases, duplicate names, encryption, supported compression, symlinks, ZIP64/Unicode extras, descriptors, overlaps, declared/actual lengths and CRC for every member; expansion is sequential and bounded. Unsupported decompression runtime fails closed. Limits are not an edge CPU/memory acceptance result.

## First native review, distinct from preview acceptance

`IA_QA_RESEARCH_POLICY_JSON` is a proposed nonsecret server policy; absent/disabled is the current and default state. It has exact keys enabled, purpose=FIRST_NATIVE_REVIEW, publication_id, parent_origin, expires_at and one or two exact identity/hash tuples. Canonical parent only. Policy expiry is at most one hour at issuance. Extra acceptance flags are rejected. Setting this policy requires separate authorization; tests enable only synthetic fixtures.

An OWNER session may request GET /api/ia/qa/research-permit using two exact selectors, same-origin Fetch Metadata, explicit intent and the existing session CSRF value. It returns a nonsecret receipt and a domain-separated HMAC, Secure/HttpOnly/SameSite=Strict __Host-ia_qa_research cookie bound to the existing session, tuple, publication, random generation and expiry. Max lifetime is 300 seconds, further clipped to OWNER session and policy expiry. No new key or account is created; existing session key is used with a distinct HMAC context. No cookies or credentials are passed to UX scripts or postMessage.

GET /api/ia/qa/document?artifact_id=<exact>&version=R3 requires the existing OWNER authentication, a valid session-bound research cookie, same-origin iframe-navigation Fetch Metadata, and the active exact policy. Top-level, foreign-origin, missing/duplicate/forged/expired/mismatched permits are rejected before source invocation. Session/permit are checked again after source work so expiry during download cannot release bytes. The response is the unchanged upper HTML, not a redirect or public static asset. Ordinary preview remains false and is not unlocked by this permit.

This permit is not a durable one-use ticket or cross-isolate immediate revocation service. Same-session/same-tuple re-navigation before expiry remains server-authorized; host detects a second outer load and disposes that frame. Existing OWNER session revocation limitations are unchanged. These limits must be considered in publication review, not hidden under an isolation PASS.

## Parent and child transport

Only the existing design-tokens and qa-lab OWNER pages add frame-src https://order-ia-portal.pages.dev/api/ia/qa/document. The parent script nonce and all other page policies are preserved. The HTML response applies HTTP CSP sandbox allow-scripts, fixed script hashes, script-src-attr none, data-only embedded resources and no connect/worker/media/form/object/base capability. The iframe is separately sandbox allow-scripts, no-referrer, with sensitive feature permissions denied. No allow-same-origin, parent script unsafe-inline/eval or original script/style/nonce injection.

This outer HTTP navigation is deliberately NOT credentialless or srcdoc: its initial request requires the existing HttpOnly OWNER and research cookies at the server. The resulting document is intended to become opaque under the HTTP and element sandbox. That intended separation MUST be verified in the permitted real browser, together with inherited nested-frame CSP and storage/network denials. Source strings, a Node Request/Response and opaque-origin intent are not actual enforcement evidence.

Design uses the single existing order.ia.viewer/1 / ux-r3-observer-1 observer via a shared host function; company buttons remain package-owned and preset_control=false. Old source/window/nonce/identity/generation/request/preset and real modules/storage/pending gates, applied vs accepted and disposal are preserved. COPY has no design outward observer: load becomes DISPLAY_LOADED_UNVERIFIED, never fake ready/engine acceptance. No UX inner child or original is modified.

## Verification and build impact

Actual local suite: 150 tests, 100 new plus50 affected existing; not 165+150 and not the whole repository CI. It includes real crypto synthetic OWNER/Access signatures, ACL/token/metadata failure simulation, bounds/ZIP/CRC errors, first-review negative gates, HTTP host lifecycle, exact R3 contract and existing observer regressions. No production secret or real provider token is used. Seven test files are executed together. The existing qa-menus-0560 helper was updated for verify's two selectors; its full suite was NOT_RUN in this partial checkout because the unchanged v03-ux.js.mjs dependency was not materialized. It is syntax-checked and must be run with the full repository CI. No skipped test in the executed150 is an assertion about the omitted suites.

A separate Node check sends the fixed original package/upper-entry bytes through the actual new reader and document functions with mocked upstream and synthetic OWNER authentication. Exact document Response bytes and ZIP member CRCs are checked. This is NOT an authenticated Pages read, not browser execution, and not an edge benchmark. The upper entry is extracted from the already pinned ZIP and validated against its expected standalone hash; it is not falsely reported as a new standalone download.

Actual main-to-a8 GitHub comparison: four commits,36files. It includes public/owner.js; google.mjs, ia-reference.mjs, projection.mjs, original owner template/runtime; QA modules, functions, tests and test workflow. The current patch adds provider/document/permit modules and touches existing QA host/API/menu response. Thus a future deployment is the existing project's complete public/ output plus its full Pages Functions bundle, NOT a two-URL-only patch. It carries the existing decision-parity/P29 and legacy private-template changes as well. Public files, login/auth/session source and the Sheets adapter are unchanged by THIS patch. No private UX HTML/font is added to public/ or Git.

Full repository build, generated Functions bundle size, edge CPU/memory and same-new-commit complete CI remain NOT_RUN. The 23.5MB COPY ZIP and expanded checks can consume significant memory when combined with verified snapshots and response copies; the local bounds do not prove the unknown deployed runtime budget. Obtain build/runtime evidence before an activation request.

## Minimum later publication review and recovery plan — not permission

Logical requested surface: only existing canonical OWNER design-tokens and qa-lab, protected catalogue/detail/readiness/verify/research-permit/document, and exact two R3 tuples. Actual release unit: whole existing Pages project built from one fixed commit/tree of the same branch/PR. No separate origin, preview environment, new Worker or tunnel. Existing preview environment was previously empty; it is not an assumed substitute. Fixed parent origin prohibits arbitrary branch preview execution.

Before push: restore the existing authenticated Pages settings read path, GET preview=none and project/repo/main/canonical/config, check actual branch HEAD for conflicts, then use a non-forced expected-HEAD update. If either read fails, retain the local patch and stop only push. Before real source use: confirm client_email equality inside the approved server without outputting credentials; apply reader only to the four explicit files through an authorized action; confirm API authorization and same-principal metadata/canDownload/alt=media results separately. No folder/domain/anyone/editor/global IAM expansion.

Before publication: fix commit/tree, run full CI and build, inspect public output and server bundle, enumerate changed routes and existing36-file impact, and obtain explicit scope/activation authorization. All controls remain disabled until then. Request a bounded research permit, not general preview acceptance, and do not manufacture real_boot_verified/security_verified.

Recovery reference: last verified canonical deployment4287ab54-1627-4192-b59b-5118186a4316, source main0627a897553c5b02fa3d1c18c7570e61688b0027. Revalidate their availability and current config before any publication. If a later authorized candidate leaks data, loses OWNER protection, changes original bytes or cannot enforce isolation, stop research issuance and remove the active frame; after explicit recovery authorization, restore the existing canonical deployment through the existing project's supported rollback operation. Never delete earlier deployments, force-reset main, rotate owner keys, alter Access or create an alternate host. Recheck root/login/private API/old menu behavior after any authorized recovery. This is an unexecuted plan, not a rollback receipt.

## Required native negative sequence (NOT_RUN)

1. Signed-out/forged/expired/non-OWNER API and direct document denial; missing/stale/wrong-session/tuple permit; foreign/top-level/null-origin navigation; no raw content before authentication.
2. Initial server session cookie present only in the legitimate navigation; UX cannot read document.cookie, parent DOM/cookies/localStorage/sessionStorage/IndexedDB or invoke IA/API/network; no credential forwarded in messages. Nested child enforces equivalent restrictions.
3. CSP blocks unauthorized inline/external/data scripts as designed, eval/worker/fetch/XHR/beacon/WebSocket/form/image/font destinations outside the fixed embedded policy; same-origin/reload/popups/top-navigation escapes fail. Test actual inherited nested CSP, not string assertions.
4. Actual design boot and observer evidence, then original→IBM→Linear→Vercel→original, same-frame input/draft/error/result/scroll preservation; real recovery/dispose/stale generation rejection. COPY separately verifies display/manual demo semantics without invented ready.
5. After basic execution,24renders and320px/native200%/actual fonts/keyboard/Esc/reduced-motion/cancel/re-entry. No source test is counted as a render.

Native, execution URL, captures and runtime isolation remain NOT_RUN/null/0. Five registered originals plus two R3 received candidates, selected/integrated NONE and general preview=false remain unchanged. MSG0571 is not ACKed by this track. No other Phase1,09A/B, whole LOWFI/commercial acceptance or Astra product integration is included.
