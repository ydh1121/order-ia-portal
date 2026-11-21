# Product UI ownership

`product-app-page`, `product-account-panels`, and `product-auth-sheet` read this
directory directly. Its import graph has no review host, annotation controller,
fixture, component showcase, or QA session dependency.

| Owner | Contents |
| --- | --- |
| `catalog.gen.mjs` | Current canonical screen definitions, frame bodies and style data |
| `runtime.gen.mjs` | Canonical authored product browser modules only |
| `assets.gen.mjs` | Product primitives, reusable templates and real application module source |
| `documents.mjs` | Actual purchase, account, sales and shipping document composition |
| `modules.mjs` | Application behavior using the injected service adapter |
| `bootstrap.gen.mjs` | Frozen common/admin/workflow/async/evidence bootstrap and CSS |
| `business-directory.mjs`, `sales.mjs` | Product form and view definitions without QA transport |

The `r3-ui/catalog.gen.mjs`, `runtime.gen.mjs` and `qa-assets.gen.mjs` paths remain
compatibility exports for existing review consumers and tests. The host and frame
controller live only in `r3-ui/review-engine.gen.mjs`. The QA adapter composes
product documents with its component showcase and response fixtures. It never
defines or substitutes product workflows.

## Shared runtime lifetime

Both product documents and QA artifact documents install the frozen bootstrap.
The R1 review host does not install it. All feature installers run synchronously
before any authored module mounts. `ORDER_PRODUCT_UI.mount(module, root, state,
api)` supplies the current adapter, consultation API, common motion, root signal,
and asynchronous motion instance. It disposes root controllers on replacement,
abort, or page exit. Document listeners survive individual root disposal.

An authored admin module owns its admin helpers. The workflow installer returns
the same controller for a root, allowing its authored and registry entrypoints to
share one lifecycle. Inline account panels and auth sheets use the same registry.

The authored onboarding module owns the existing `.ob-quick` notification button.
It passes that button and container to `mountGooey` as `options.trigger` and
`options.container`; the helper never creates another floating trigger. Exactly
two circular, icon-only actions fan out: the existing deck icon opens the Order
Pass through `manage.quotes`, and an egg with a backslash opens the existing
`notifications` panel. The original bell, unread badge and authentication state
remain owned by onboarding and the shared account menu. The registry, admin
modules and embedded account/auth panels do not add generic floating actions.
Source wiring does not establish test, deployment or user acceptance status.

## Generation for the 2026-11-21 changes

First capture the exact release10 review epoch from its immutable checkout.
Migration is needed only once:

```sh
node scripts/r3/migrate-product-ui.mjs
```

Refresh current product source without invoking older history-writing scripts:

```sh
node scripts/r3/refresh-product-motion21.mjs /absolute/path/to/release10-baseline
node scripts/r3/collect-qa-assets.mjs
node scripts/r3/build-product-ui-bootstrap.mjs
node scripts/r3/build-qa-review-runtime.mjs
node scripts/r3/compile-approved-widths.mjs
node scripts/build-product-manifest.mjs
```

The motion refresh verifies the baseline commit and exact authored suffixes,
rebuilds only runtime families containing the declared authored/shared-function
owners from the latest source files, and recalculates affected current catalog
hashes. Other current runtime families are retained as inputs. It writes no host, frame or history. Rendering changes preserve
the existing shared style nodes and the canonical root. The refresh is safe to
repeat: an already updated source is accepted, and unchanged frames stay stable.

The bootstrap must be frozen before the QA review runtime is generated. This
keeps local and Worker-bundled artifact identities equal despite the bundler's
function-name instrumentation. `--check` on either bootstrap/runtime generator
verifies that checked-in output matches its current source.

```sh
node --experimental-vm-modules scripts/check-product-ui-boundaries.mjs
node --test tests/product-ui-ownership.test.mjs tests/r3-qa-mvp-bundle.test.mjs
```
