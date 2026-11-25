# ADR — the operator surface: gate it, then put a seam in front of it

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › ADR — operator surface separation · prev [Maintenance fields](maintenance-fields.md) · next [ADR](pay-to-complete/ADR.md)

<!-- docs-nav:end -->

|               |                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status        | Proposed — two phases; phase 1 ready to build                                                                                                                        |
| Date          | 2026-11-25                                                                                                                                                           |
| Tree measured | `89900d3d0` (`origin/main`, package `2.0.0-rc2`)                                                                                                                     |
| Deciders      | Founder/CTO; engineering lead                                                                                                                                        |
| Supersedes    | Nothing. Replaces the earlier draft that proposed a public `/docs` surface — that draft answered the wrong question (it moved files; the owner ruled no file moves). |
| Cards         | `t_ac06abb3` (this ADR), `t_31d3662a` (inventory), `t_414c790c` (issue), `t_159fd054` (phase-1 wiring)                                                               |

## 1. Context

The owner's request was to "separate content, features and functionality in the /docs directory and repo
in general, leaving only the actual product docs for users — initiator and counterparty". Two rulings
came out of the grill and they bind this document:

1. **"Separated" means gated, not moved.** No file leaves the repo: no package, no sister repo, no
   branch mirror. The mechanism is a capability beside `product.admin`, resolved by a helper in
   `lib/brand-boundary.ts`, with an env override, answering **404** — never a redirect to `/login`.
2. **`/dashboard/templates` is excluded by name** — shipped product surface (native template
   creation, versioning, lifecycle), not dev machinery — along with its twelve `@flow`/create files
   and `/admin/console/templates`.

The goal behind it, in the owner's words: _"the goal is to be able to separate, and develop, or change
independent of the webapp user platform."_ That goal is not met by hiding URLs. It is met by a seam:
the operator tooling must be able to change without editing the user platform, and the user platform
must not be able to start depending on the tooling. So this ADR decides two things in order, and is
judged on both:

| Phase            | What it is                                                                 | What it buys                                                                                    | This ADR                                  |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **1 — the gate** | one capability, `product.operator`, 404 for a build that does not claim it | a **complete and provable** operator set: you cannot extract what you cannot list or switch off | decides it now                            |
| **2 — the seam** | one typed read contract, one dependency arrow, one stability test          | the operator surfaces can change on their own schedule without touching `app/(mainlayout)/**`   | decides its shape now, builds it as cards |

The home of the operator code — in-repo module, own package, own deployment, own repo — is
**roadmap, not scope** (§7). With the seam in place that decision is cheap; before it, every option
is the same costly migration.

## 2. Inventory — the eleven routes (measured on `89900d3d0`)

Every row was read out of the tree, not from memory. "Capability today" is the actual call sequence
at the top of each page module.

| #   | Route                       | Page module(s)                                                                                                                                                                                                                          | Capability today                                                 | Audience an initiator/counterparty needs it         | Disposition                                              |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| 1   | `/admin/spec`               | `app/(mainlayout)/admin/spec/page.tsx`                                                                                                                                                                                                  | `product.admin` → `requireSpecReader()`                          | no                                                  | **GATE** (`product.operator`)                            |
| 2   | `/admin/spec/validation`    | `admin/spec/validation/page.tsx`                                                                                                                                                                                                        | `product.admin` → `requireSpecReader()`                          | no                                                  | **GATE**                                                 |
| 3   | `/admin/brand`              | `admin/brand/page.tsx`                                                                                                                                                                                                                  | `product.admin` → `requireAlignmentProduct()` → `requireAdmin()` | no                                                  | **GATE** (keeps its alignment-only gate as well)         |
| 4   | `/admin/audit`              | `admin/audit/page.tsx` (+ `admin/audit-log.tsx` reads `lib/db/admin-audit`)                                                                                                                                                             | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE**                                                 |
| 5   | `/admin/review`             | `admin/review/page.tsx`, `admin/review/actions.ts`                                                                                                                                                                                      | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE** (page **and** actions)                          |
| 6   | `/admin/permissions`        | `admin/permissions/page.tsx`                                                                                                                                                                                                            | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE**                                                 |
| 7   | `/admin/docs/releases`      | `admin/docs/releases/page.tsx`                                                                                                                                                                                                          | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE**                                                 |
| 8   | `/admin/docs/updates`       | `admin/docs/updates/page.tsx`                                                                                                                                                                                                           | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE**                                                 |
| 9   | `/admin/email-templates`    | `admin/email-templates/page.tsx`, `[id]/page.tsx`, `actions.ts`                                                                                                                                                                         | `product.admin` → `requireAdmin()`                               | no                                                  | **GATE** (list, editor **and** actions)                  |
| 10  | `/admin/docs` (the **hub**) | `admin/docs/page.tsx`                                                                                                                                                                                                                   | `product.admin` → `requireAdmin()`                               | no — the _pages_ it lists are product documentation | **GATE the hub only**; `/admin/docs/[...slug]` unchanged |
| 11  | `/dashboard/templates`      | `dashboard/templates/**` — measured 18 files (13 `page.tsx`, 1 `route.ts`, 2 `actions.ts`, `layout.tsx`, `@flow/default.tsx`) plus 5 interception slots under `dashboard/relationships/@flow/(...)dashboard/templates/[slug]/create/**` | `requireRole("member")` — **no** product gate                    | **yes** — it is the initiator's own surface         | **KEEP** — excluded by name; no line touched             |

Two facts that the table alone does not show, both measured:

- **Twelve page modules serve the eleven routes.** `/admin/email-templates/[id]` and
  `/admin/spec/[group]` are children of listed paths and must be gated too, or the gate is a
  directory-shaped illusion — the exact failure the card warned about ("move every file and leave
  all 11 URLs live").
- **No subtree mount exists.** The only layout under `admin/` is
  `app/(mainlayout)/admin/console/layout.tsx`; the nine operator areas share no layout. A gate that
  mounts in a layout cannot cover them without also covering `/admin/docs/[...slug]`,
  `/admin/templates` and `/admin/console/templates`, which are excluded. So the check mounts **per
  route module**, the same shape `requireAdminProduct()` already uses on twenty-two quiz routes and
  the console.

### 2.1 The doors that must close with the routes

The gate is not real if the landing still offers a door to a 404. Measured doors to listed routes:

| Door                    | File                                                    | Rows affected                                                                                           |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Admin landing directory | `data/admin/start-surfaces.ts` (`ADMIN_START_SURFACES`) | `/admin/review` (`:52`), `/admin/audit` (`:64`), `/admin/docs` (`:118`), `/admin/spec` (`:124`)         |
| Admin submenu pill row  | `data/admin/submenu.ts` (`ADMIN_SUBMENU_LINKS:54`)      | `/admin/audit`                                                                                          |
| Landing figure tiles    | `components/admin/start/start-view.tsx:121,136`         | `/admin/review`, `/admin/audit`                                                                         |
| Notice bar              | `components/layout/admin-notice-bar.tsx:40,66`          | `/admin/brand` — already conditional on `adminProductShipped()`; must also read the operator capability |

`lib/flags.ts::hiddenNavHrefs()` is the existing single answer for "do not draw this href"
(`navSurfaces`, one href → one flag). Phase 1 extends that map with the operator hrefs and filters
the two `data/admin/*` fixtures through it, so the landing and the routes cannot disagree.

## 3. Decision, phase 1 — one capability, per-route gate, 404

### 3.1 Capability

| Item          | Value                                           | Why                                                                                                                                                                                               |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flag name     | `product.operator`                              | beside `product.quiz-surfaces` and `product.admin`; a capability noun, resolved by the same resolver                                                                                              |
| Env override  | `FLAG_PRODUCT_OPERATOR` (`1` / `0`)             | derived by `lib/flags.ts::envNameFor`; `product.operator` → `FLAG_PRODUCT_OPERATOR`, no guessing                                                                                                  |
| `default`     | `false`                                         | a template that does not name itself gets no operator tooling                                                                                                                                     |
| `templates`   | `["quizhub", "alignsynch"]`                     | both templates this tree ships claim it today, so **nothing changes for today's users** — the gate exists for the next template and for `FLAG_PRODUCT_OPERATOR=0`                                 |
| `adminBypass` | **absent**                                      | this is a build capability, not a role. A bypass would read the session to answer a question about what the build ships, and would hand an admin a surface the product deliberately does not have |
| Resolver      | `requireOperator()` in `lib/brand-boundary.ts`  | one helper, twelve call sites; the flag name, the resolution and the `notFound()` live in one place, exactly like `requireAdminProduct()`                                                         |
| Refusal       | Next `notFound()` — the 404 an unknown URL gets | a redirect to `/login` tells a stranger the route exists (#509's ruling, restated)                                                                                                                |
| Nav half      | `navSurfaces` rows in `lib/flags.ts`            | route and nav must agree, or the landing is a page of dead doors                                                                                                                                  |

`product.operator` is deliberately **not** named `product.dev` or `product.spec`: the set is not
"development" (it includes `/admin/audit` and `/admin/email-templates`, which are operations), and it
is not "the spec" (three of the eleven are docs shelves). "Operator" is the audience.

### 3.2 Mount and order

In every one of the twelve page modules, and in the two action modules:

```ts
requireAdminProduct();   // template claims the console at all
requireOperator();       // this template ships the operator tooling   ← new
await requireAdmin({ next: … });        // or requireSpecReader({ next: … }) on /admin/spec*
```

Order, and why it is fixed:

1. `requireAdminProduct()` first — the broadest capability. A template with no console has no
   operator tooling either; answering from the outer gate keeps the two answers consistent.
2. `requireOperator()` second — the narrower audience gate, still **before** any session read, so a
   build without the tooling costs no auth round trip.
3. The role gate last — `requireAdmin()` (three answers: `/login`, 404 for a member, render for an
   admin) or `requireSpecReader()` on `/admin/spec*` (stakeholder/admin/owner; `support` gets the 404).
   The operator gate **adds** to these; it never replaces them.

Every gate is the first statement of the render, ahead of `await params` and every read, so a closed
surface does no fixture work and no database work.

### 3.3 The exact set phase 1 touches

**Page modules (12 files → 11 URLs):**

```text
app/(mainlayout)/admin/spec/page.tsx
app/(mainlayout)/admin/spec/[group]/page.tsx
app/(mainlayout)/admin/spec/validation/page.tsx
app/(mainlayout)/admin/brand/page.tsx
app/(mainlayout)/admin/audit/page.tsx
app/(mainlayout)/admin/review/page.tsx
app/(mainlayout)/admin/permissions/page.tsx
app/(mainlayout)/admin/email-templates/page.tsx
app/(mainlayout)/admin/email-templates/[id]/page.tsx
app/(mainlayout)/admin/docs/page.tsx            ← the hub only
app/(mainlayout)/admin/docs/releases/page.tsx
app/(mainlayout)/admin/docs/updates/page.tsx
```

**Action modules (2 files, so the POST path cannot outlive the page gate):**

```text
app/(mainlayout)/admin/review/actions.ts          ← 1 write path
app/(mainlayout)/admin/email-templates/actions.ts ← 5 write paths
```

**Support modules:** `data/flags.ts` (record + `zFlags`), `lib/flags.ts` (`navSurfaces` rows),
`lib/brand-boundary.ts` (`OPERATOR_PRODUCT_FLAG`, `operatorProductShipped()`, `requireOperator()`),
`lib/operator/routes.ts` (new, pure: the enumeration below), `data/admin/start-surfaces.ts` +
`data/admin/submenu.ts` filtered through `hiddenNavHrefs()`, `components/admin/start/start-view.tsx`,
`components/layout/admin-notice-bar.tsx`.

**Tests:** `tests/brand-boundary.test.ts` (resolver, in `product.admin`'s shape: default off for an
unnamed template, on for both real templates, `FLAG_PRODUCT_OPERATOR=1|0` each way),
`tests/flags.test.ts` (nav rows resolve), `tests/parity/boundary.ts` (an `operatorRoutes` table, and
`parity.check.ts` asserting open on a template that claims it / 404 on the fixture template), and one
new `tests/operator-routes.test.ts` that reads `lib/operator/routes.ts` and asserts every listed file
calls `requireOperator()` while every excluded file does not.

`lib/operator/routes.ts` is three exported constants — `OPERATOR_ROUTES` (11 paths),
`OPERATOR_PAGE_FILES` (12), `OPERATOR_ACTION_FILES` (2) — with no imports beyond a type. It is the
one machine-readable home for the set, so the wiring test, the stability test and the evidence table
read the same list. Without it the gate is a convention repeated in twelve files.

### 3.4 What must not change

| Surface                                                                                                                                                                                                                                                                                  | Why it is excluded                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/templates` + every file under it (18: 13 `page.tsx`, `[id]/status/route.ts`, `actions.ts`, `[id]/propose/actions.ts`, `layout.tsx`, `@flow/default.tsx`, `@flow/(.)[slug]/create/*`) + the 5 `dashboard/relationships/@flow/(...)dashboard/templates/[slug]/create/**` slots | product surface — native template creation, versioning, lifecycle (owner, by name). **Note:** the cards said "twelve files"; the tree measures 18 under `dashboard/templates` plus 5 interception slots. The exclusion is by path, so the count does not change the decision — but the number in the card was wrong and is corrected here |
| `/admin/console/templates`, `/admin/console/templates/[id]`                                                                                                                                                                                                                              | the console's own template registry (owner, by name)                                                                                                                                                                                                                                                                                      |
| `/admin/templates`, `/admin/templates/[id]`                                                                                                                                                                                                                                              | assessment-template authoring — product authoring, gated by `requireAlignmentProduct()` today                                                                                                                                                                                                                                             |
| `/admin/docs/[...slug]`                                                                                                                                                                                                                                                                  | the documentation **pages** — product documentation; readable to any console admin, as today                                                                                                                                                                                                                                              |
| `/admin/console/{relationships,users}`, `/admin/{billing,broadcast,inbox,growth,health,instances,gaps,dashboard}`                                                                                                                                                                        | business operations, not dev machinery; outside the owner's eleven. Their dispositions are questions for `t_31d3662a` (§8), never a phase-1 edit                                                                                                                                                                                          |
| `components/**`, `lib/**`, every data fixture                                                                                                                                                                                                                                            | no file moves, no file renamed, nothing deleted                                                                                                                                                                                                                                                                                           |

### 3.5 Why this option and not the others

The five options the card carried are still evaluated, because they are the phase-2 roadmap:

| Option                           | Phase-1 verdict | Reason (measured)                                                                                                                                                                                       |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — capability gate (chosen)** | **do this now** | additive only: one flag, one helper, 12 call sites, 2 action modules. Reversible with `FLAG_PRODUCT_OPERATOR=1` or a one-commit revert. Enumerates the set — which is the precondition for independence |
| B — pnpm workspace package       | later, cheaply  | `pnpm-workspace.yaml` has **no`packages:` key**; introducing workspaces means a lockfile regeneration and a second build config, for zero gain until the seam exists                                    |
| C — sister repo                  | later, cheaply  | the operator surfaces read `docs/`, `data/spec/**` and six `lib/*` modules today; a repo split before the contract means copying the coupling, not removing it                                          |
| D — local-only executor repo     | no              | a second copy the gate cannot see; `data:check` E44 and the operator reads would be outside every check                                                                                                 |
| E — branch mirror                | no              | a green gate on a branch that is not the deployed tree proves nothing (`AGENTS.md`, detached-`HEAD` trap)                                                                                               |

Phase 1 costs one flag and twelve calls. Options B–E each cost a migration **and** leave the
dependency arrow exactly as tangled as it is today (§4.3). That is the whole argument for the order.

## 4. Decision, phase 2 — the seam

### 4.1 Contract module: `lib/operator/read.ts`

One module. The operator surfaces read through it and nothing else. It exposes **facts**, never
handles:

- plain data only — `readonly` records, discriminated unions, `z.infer` types from `content/**`;
- no `pg` client, no pool, no `lib/db/**` type, no connection string, no `DatabaseUnavailableError`
  leaking out as a class the caller must `instanceof`;
- no functions that return a query builder, a mutable row set, or a filesystem path;
- failures are values: `{ ok: true; rows: … } | { ok: false; reason: string }`, the shape
  `/dashboard/templates` already uses for `DatabaseUnavailableError` — so a broken read is a panel,
  not a 500.

Named reads, derived from what the twelve pages import **today** (measured):

| Route                                                          | Today's reads (measured imports)                                                                                                           | Contract read                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `/admin/audit`                                                 | `lib/db/admin-audit::readAuditLog`                                                                                                         | `auditFacts()`                                                 |
| `/admin/spec`, `/admin/spec/[group]`, `/admin/spec/validation` | `lib/spec/file::readSpecValidationSafe`, `lib/spec/issues-cache::readSpecIssues`, `content/spec::specStoryOf`, `data/spec/validation.json` | `specFacts()`, `specGroupFacts(group)`                         |
| `/admin/brand`                                                 | `data/brand.ts` via `components/admin/brand-profile`                                                                                       | `brandFacts()`                                                 |
| `/admin/review`                                                | `lib/review/*` + `lib/db/**` (shelf, to-dos, issues)                                                                                       | `reviewFacts()`, `reviewIssueFacts(id)`                        |
| `/admin/permissions`                                           | `lib/admin/crud-matrix-file::readCrudMatrix` → `docs/specs/v2-prototype/crud-matrix.md`                                                    | `permissionsMatrixFacts()`                                     |
| `/admin/email-templates`, `/[id]`                              | `lib/admin/email-templates`, `lib/email/samples::renderSampleEmail`                                                                        | `emailTemplateFacts()`, `emailTemplateFacts(id)`               |
| `/admin/docs` (hub), `/docs/releases`, `/docs/updates`         | `lib/docs/tree::readDocsManifest`, `readUpdateLedger`, `lib/docs/rows::docsRows`, `hubPathsOf`, `lib/docs/updates::parseUpdateLedger`      | `docsManifestFacts()`, `releaseFacts()`, `updateLedgerFacts()` |

`lib/operator/read.ts` is the **only** operator module allowed to import `lib/db/**`, `lib/docs/**`,
`lib/spec/**`, `lib/review/**`, `lib/admin/**`. Everything else under the operator surface calls it.
During the burn-down the contract may re-export the existing functions; the point of the first
commit is the boundary, not the rewrite — a thin pass-through that moves the dependency from twelve
pages to one module is already the seam.

### 4.2 The arrow — one direction only

```text
        ┌──────────────────────────────────────────────┐
        │ operator surface                             │
        │   app/(mainlayout)/admin/<the 9 areas>       │
        │   app/(mainlayout)/admin/docs/{page,releases,│
        │     updates}                                 │
        │   components/operator/**   lib/operator/**   │
        └───────────────┬──────────────────────────────┘
                        │  may read
          ┌─────────────┴───────────────┬───────────────────────┐
          ▼                             ▼                       ▼
  content/**  (schemas, types)   lib/operator/read.ts    data/pages/admin-*,
                                 (the contract)          data/spec/**, data/admin/**
```

Never the other way. Product code — `app/(mainlayout)/**` outside the operator routes,
`components/**` outside `components/operator/**`, the product fixtures — may not import
`lib/operator/**` or `components/operator/**`, value **or** type. A type import is the thin end of
the coupling: a product page that needs an operator type is already shaped by the tooling.

| May import                                                                                                    | May **not** import                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `content/**` (schemas, `z.infer` types)                                                                       | `app/**` — any product page or route module                                                                      |
| `lib/operator/read.ts` + `lib/operator/routes.ts`                                                             | `components/**` except `components/ui/**` and `components/operator/**`                                           |
| `components/ui/**` (shadcn primitives), `components/operator/**`                                              | `lib/db/**`, `pg`, `lib/docs/**`, `lib/spec/**`, `lib/review/**`, `lib/admin/**` — the contract is the only door |
| `data/pages/admin-*`, `data/admin/**`, `data/spec/**` (operator-owned fixtures)                               | `data/**` product fixtures, `lib/brand-theme`-driven product surfaces                                            |
| `lib/auth/*` (the role gates), `lib/flags`, `lib/brand-boundary` (shared infrastructure, allowlisted by name) | `@/app/(mainlayout)/**` in any spelling                                                                          |
| `next/*`, `react`                                                                                             | anything under `lib/flow/**`, `lib/member/**`, `lib/assessment*` — product domain                                |

`lib/brand-boundary.ts`, `lib/flags.ts` and `lib/auth/require-role.ts` are the allowlisted shared
infrastructure: they are how a gate is expressed and how a role is read, and re-homing them would be
the same rewrite this ADR defers.

### 4.3 The stability test — `tests/operator-seam.test.ts`

This test **is** the independence. It outlives the home decision: package, deployment or repo, the
rule is the same, and it is the one artifact that must move with the code.

- **Extractor:** `scripts/operator-graph.ts`, pure (no `fs`), modelled on `scripts/client-graph.ts`
  (E34) and `scripts/brand-word.ts` (E37): it takes `{file, source}` pairs and returns
  `{file, specifier, kind: "value" | "type"}` records. Resolving `@/` and relative specifiers is
  the caller's job; the extraction is testable without a tree.
- **Surface:** the globs in `lib/operator/routes.ts` — the 12 page files, 2 action files, plus
  `components/operator/**`, `lib/operator/**`.
- **Rules asserted:**
  1. no operator file imports `app/**` or a non-allowlisted `components/**`;
  2. no operator file outside `lib/operator/read.ts` imports `lib/db/**`, `pg`, `lib/docs/**`,
     `lib/spec/**`, `lib/review/**`, `lib/admin/**`;
  3. the **reverse** arrow: no product file imports `lib/operator/**` or `components/operator/**`,
     value or type;
  4. the baseline never grows, and **every baseline row must still be a violation** — a row that no
     longer matches is a finding, exactly as `BRAND_WORD_ALLOWANCES` treats a stale allowance
     (`scripts/brand-word.ts`). A check that cannot be widened in place.
- **Baseline:** `tests/fixtures/operator-seam-baseline.json`, `file → [specifier…]`, plus a count
  asserted in the test (`"12 operator page files import a product component"`). The test prints the
  census every run: `N operator files walked, M violations, K allowlisted`.
- **Measured first violations on this tree** (the reason the baseline is needed, and the burn-down
  list):
  - **12 of 12** operator page files import `@/components/assessment-flow/stage-column` — the
    assessment flow's product container;
  - **9** files under `components/admin/**` reach product-shell paths (`spec/{spec-issues,
    spec-submenu,spec-frame,validation-matrix,story-page}.tsx`, `permissions/permissions-console.tsx`,
    `broadcast-composer.tsx`, `report-operations.tsx`, `template-editor.tsx`).
    Both are shallow: `stage-column.tsx` is 32 lines and is a `div` with the flow's width and padding.
    The fix is an operator-owned copy (`components/operator/frame.tsx`) in the first phase-2 card, not
    a move of the product component.

### 4.4 Phase 2 burn-down (cards, in order)

| Card   | Work                                                                                                                       | Acceptance                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| seam-1 | add `lib/operator/read.ts` as pass-throughs over today's reads; add `scripts/operator-graph.ts`, the test and the baseline | `pnpm test -- operator-seam` green; census prints 12 + 9 allowlisted, 0 unlisted |
| seam-2 | `components/operator/frame.tsx`; flip the 12 page files; delete those 12 baseline rows                                     | census drops by 12; `pnpm build` green                                           |
| seam-3 | route every operator page read through the contract; forbid the five internals outside it                                  | rule 2 asserts zero exceptions outside `lib/operator/read.ts`                    |
| seam-4 | burn down the 9 component violations                                                                                       | baseline file empty; test asserts it is empty and that the assertion still runs  |

## 5. Migration steps — reversible by construction

| Step | Change                                                                                                                             | Undo                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | `data/flags.ts`: add `"product.operator"` to `zFlags` and to `flags` (`default: false`, `templates: ["quizhub","alignsynch"]`)     | delete the two entries              |
| 2    | `lib/brand-boundary.ts`: `OPERATOR_PRODUCT_FLAG`, `operatorProductShipped()`, `requireOperator()`                                  | delete three exports                |
| 3    | `lib/operator/routes.ts`: the three constants                                                                                      | delete the file                     |
| 4    | the 12 page modules and 2 action modules: one `requireOperator()` line each, after `requireAdminProduct()`                         | delete 14 lines                     |
| 5    | `lib/flags.ts` `navSurfaces` rows + the two `data/admin/*` fixtures filtered through `hiddenNavHrefs()` + the notice-bar condition | revert the rows and the two filters |
| 6    | tests: `brand-boundary`, `flags`, `parity/boundary`, `operator-routes`                                                             | revert                              |

Operational rollback is one environment variable: **`FLAG_PRODUCT_OPERATOR=1`** reopens all eleven
routes on a build that closed them, with no deploy of code. Reverting the calls restores the tree
byte for byte, because nothing was moved, renamed or deleted; the diff is additions plus one flag.
Each step is its own commit, so a partial rollback is a single `git revert`.

## 6. Proof the gate works (required in the implementation PR)

Per route, two states, on one server:

```bash
# closed: a build that does not claim the capability
FLAG_PRODUCT_OPERATOR=0 pnpm start &            # or BRAND=<template the flag record does not carry>
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/admin/spec          # → 404
# open: today's build, or the operator lever
FLAG_PRODUCT_OPERATOR=1 pnpm start &
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3000/admin/spec  # → 200 (admin) / 307 → /login
```

Two honest caveats, both already in `AGENTS.md` and both relevant to the evidence table:

- On a tree with **no** `NEON_AUTH_*`, an _open_ operator request answers **500**
  (`NEON_AUTH_BASE_URL is not set`), because `currentUser()` builds its server outside the `try`.
  That is the documented answer, not a defect. The 404 half is provable on any tree (it happens
  before any session read); the 200/307 half needs the demo branch or a local `.env.local`.
- `/admin/spec*` answers **404** for a signed-in `support` seat even when the capability is on —
  `requireSpecReader()` is a separate gate. The proof must use an admin session, or state the role.

The table to paste: 11 rows × {closed → 404, open → 200/307} + `git diff --stat origin/main...HEAD`
showing **no moved or deleted files** + `pnpm parity` unchanged + both brands built.

## 7. Roadmap — the home, deliberately undecided

With the contract and the test in place, the extraction target is a small decision:

| Home                                                         | Trigger that would make it right                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| in-repo module (`lib/operator/**`, `components/operator/**`) | default; today's choice by omission                                                                           |
| own pnpm workspace package                                   | the operator surface needs a release cadence of its own, or a second product consumes it                      |
| own deployment (same repo)                                   | operator reads stop being request-time in the product's request path                                          |
| own repo                                                     | the operator surface no longer reads `content/**` schemas the product also owns — the seam test will say when |

None of these is in scope. The rule that keeps the decision cheap: **the seam test must pass at every
step of any of them**, and it is the only file that has to move with the code.

## 8. Risks and open questions

| Risk                                                                                                                               | Evidence                                                                                                                                                | Mitigation                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Closing the hub strands the doc pages                                                                                              | `/admin/docs` is the only index of `docs/`; pages stay open at `/admin/docs/[...slug]`                                                                  | direct URLs keep working; a reader-side index is a follow-up card, **not** phase-1 scope. Named here so it is a decision, not a surprise |
| The landing links to closed routes                                                                                                 | `data/admin/start-surfaces.ts` has four listed doors; `start-view.tsx` two figure tiles                                                                 | step 5 of §5; the route/landing agreement is testable                                                                                    |
| A write path survives the page gate                                                                                                | `review/actions.ts`, `email-templates/actions.ts`                                                                                                       | both are in the set of 14 files; the wiring test asserts it                                                                              |
| `/admin/docs/features` is unclassified                                                                                             | not in the owner's eleven; it is a CHANGELOG-derived index, arguably operator                                                                           | **question for `t_31d3662a`** — gated or not is a decision, not a judgement call mid-implementation                                      |
| `/admin/console/{relationships,users}`, `/admin/{billing,broadcast,inbox,growth,health,instances,gaps,dashboard}` are unclassified | outside the eleven, business operations by their copy                                                                                                   | unchanged in phase 1; the inventory card classifies them with the same table                                                             |
| `parity`'s capability table is incomplete today                                                                                    | `tests/parity/boundary.ts::adminProductRoutes` lists 11 routes and omits `/admin/brand`, `/admin/permissions`, `/admin/email-templates`, `/admin/spec*` | phase 1 adds the operator table; the omissions are recorded here rather than fixed silently                                              |
| The gate could be mistaken for authorization                                                                                       | `product.operator` is a build capability                                                                                                                | §3.1: no `adminBypass`, role gates stay in place, docs say "capability, not permission"                                                  |

## 9. Evidence

| Fact                                                                          | Command / source                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12 page modules serve the 11 routes; no shared layout outside `admin/console` | `find "app/(mainlayout)/admin" -maxdepth 2 -name layout.tsx`; the route table in §2                                                                  |
| Every listed page already calls `requireAdminProduct()`                       | `grep -rn "requireAdminProduct" "app/(mainlayout)/admin"`                                                                                            |
| `/admin/spec*` gate on `requireSpecReader()`, not `requireAdmin()`            | `admin/spec/page.tsx:49`, `spec/[group]/page.tsx:49`, `spec/validation/page.tsx:38`                                                                  |
| `/admin/brand` is also alignment-only                                         | `admin/brand/page.tsx:57-60`                                                                                                                         |
| `/dashboard/templates` carries no product gate                                | `dashboard/templates/page.tsx` imports `requireRole`, no `requireAdminProduct`                                                                       |
| `product.admin` is `default: false`, `templates: ["quizhub","alignsynch"]`    | `data/flags.ts` record; `tests/parity/boundary.ts:325` comment                                                                                       |
| Env name derivation `.`/`-` → `_`                                             | `lib/flags.ts::envNameFor`                                                                                                                           |
| The 404-not-redirect rule and the order                                       | `lib/brand-boundary.ts` docstrings (`requireAdminProduct`)                                                                                           |
| 12/12 operator pages import the product `StageColumn`                         | `grep -l "components/assessment-flow/stage-column"` over the 12 files → 12                                                                           |
| 9`components/admin/**` files reach product-shell paths                        | `grep -rln "components/assessment-flow\|components/dashboard\|components/layout\|components/quiz" components/admin`                                  |
| The doors to listed routes                                                    | `data/admin/start-surfaces.ts:52,64,118,124`; `data/admin/submenu.ts:54`; `components/admin/start/start-view.tsx:121,136`                            |
| `/dashboard/templates` is 18 files (13 pages) + 5 interception slots          | `find "app/(mainlayout)/dashboard/templates" -type f \| wc -l` → 18; `…/dashboard/relationships/@flow/(...)dashboard/templates/[slug]/create/**` → 5 |

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › ADR — operator surface separation · prev [Maintenance fields](maintenance-fields.md) · next [ADR](pay-to-complete/ADR.md)

<!-- docs-nav:end -->
