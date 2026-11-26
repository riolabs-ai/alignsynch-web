# The operator seam — one surface, one contract, one arrow

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Operator seam · prev [Maintenance fields](maintenance-fields.md) · next [The spec register's GitHub join](spec-register-coverage.md)

<!-- docs-nav:end -->

**Status: implemented and enforced.** This document is the spec for the operator surface's dependency
rules. The decision record is the ADR
[`operator-separation-adr.md`](https://github.com/riolabs-ai/alignsynch/blob/wt/t_ac06abb3/docs/specs/operator-separation-adr.md)
(branch `wt/t_ac06abb3` @ `7bf5a4521`); this page states the shape that landed and where each rule
lives, so a reader who is adding a console screen does not have to reconstruct it from the test.

The rules are checked, not reviewed: `tests/operator-seam.test.ts` walks the shipped tree through
`scripts/operator-graph.ts` and fails on a new coupling. A screen that disagrees with this document
is a defect in the screen — or a failed attempt at one, which is what the check reports.

## The surface is enumerated once

`lib/operator/routes.ts` is the machine-readable home. Three constants, no imports, no reads.

| Constant                     | Holds              | Why                                                                                                                  |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `OPERATOR_ROUTES`            | 23 rows            | One row per address and page module. Two parallel lists drift; a row cannot.                                         |
| `OPERATOR_ACTION_FILES`      | 7 write modules    | A page gate closes an address, not an action id — a POST to a server action never renders the guarded page module.   |
| `OPERATOR_EXCLUDED_PATTERNS` | 3 surfaces by name | `/admin/docs/[...slug]` (the documentation pages), `/admin/templates*` (assessment authoring) and `/admin/console*`. |

The 23 page modules are every page under `app/(mainlayout)/admin/` except those three, and
`tests/operator-seam.test.ts` asserts exactly that: a new admin page is either named in the surface
or named in an exclusion, never silently ungated.

## The contract is the only door

`lib/operator/read.ts` is the one module the operator surface reads through. It exposes **facts** —
route inventory, audit rows, the spec register, template versions, the review shelf, the permissions
matrix and the mail register — and never a handle:

- plain data only: `readonly` records, the schemas' `z.infer` types, no component and no `ReactNode`;
- no pool, no query builder, no path a caller can write through;
- failures are values, `{ ok: true, rows } | { ok: false, reason }`, so a database or a file that
  does not answer draws one panel instead of a 500. Only the layer's own "could not read" error is
  answered that way; anything else is rethrown.

Reading a new kind of fact means adding one named read here, not importing the layer into a page.

## The arrow

| May import                                                                                       | May not import                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `content/**` (schemas and `z.infer` types)                                                       | `app/**` — any product page, layout, route or action module                                              |
| `lib/operator/routes.ts`, `lib/operator/read.ts`                                                 | `components/**` outside `components/admin/**`, `components/operator/**`, `components/ui/**`              |
| `components/ui/**` (primitives), `components/operator/**`, `components/admin/**`                 | `lib/db/**`, `lib/docs/**`, `lib/spec/**`, `lib/review/**`, `lib/admin/**` — except through the contract |
| `data/pages/admin-*`, `data/admin/**`, `data/spec/**` (operator-owned fixtures)                  | `data/**` product fixtures                                                                               |
| `lib/auth/*`, `lib/flags.ts`, `lib/brand-boundary.ts` (shared infrastructure), `next/*`, `react` | anything under `lib/flow/**`, `lib/member/**`, `lib/assessment*` — product domain                        |

**Product code may not import `lib/operator/**` or `components/operator/**`, value or type.** A
product page that needs an operator type is already shaped by the tooling, so the type import is
caught the same as a value import.

`components/operator/frame.tsx` is the one component the operator surface owns today: the page
column. It is not a redesign — `tests/admin-column.test.tsx` renders it and the product
`StageColumn` with the same child and asserts **identical markup**, so a width change on one side
fails a test instead of becoming a second left edge.

## The test, and the baseline

`scripts/operator-graph.ts` is pure — `{ file → source }` in, edges and findings out — and reuses
`scripts/client-graph.ts` for extraction, so the parser has one home. Three rules:

1. **operator → product** — no operator file imports `app/**` or a `components/**` module outside
   the three allowed directories;
2. **operator-owned → internals** — outside `lib/operator/read.ts`, no module under
   `lib/operator/**` or `components/operator/**` imports an internal layer or `pg`;
3. **product → operator** — value or type, always a finding.

`tests/fixtures/operator-seam-baseline.json` carries the measured violations this change did **not**
fix, as `file → [specifier…]` plus its starting and current counts. It may only shrink: an unlisted
violation fails, and so does a baseline row that is no longer a violation. A test that can permit a
row by being edited is an allowlist; this one cannot.

The census line prints every run — `N operator files walked, M violations, K allowlisted` — and is
the first thing to read when the count moves.

## What is still open

Ten files, eleven import edges, each waiting on something this spec may not decide alone:

| Open                                                                                 | Why it is not burned down here                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 5 × `components/layout/leaving-link` (permissions, the four spec views)              | It is the only markup that leaves the app (E39); a second copy would be a second rule. |
| 1 × `components/layout/rail-sheet-slot` (`spec-frame.tsx`)                           | The slot needs `MainLayout`'s provider; a copy would render nothing below `md`.        |
| 1 × `components/assessment-flow/{answer-form,aspect-drawer}` (`template-editor.tsx`) | Product authoring components with their own behaviour, not chrome.                     |
| 1 × `components/console/stat-card-grid` (`docs/features-index.tsx`)                  | The console's figure grid, used by more than one console screen.                       |
| 1 × `components/console/gap-analysis` (`/admin/gaps`)                                | Product feature component.                                                             |
| 1 × `components/relationship/relationship-edit-panel` (`/admin/instances/[id]`)      | Product feature component.                                                             |

The next phase (**seam-3**) routes every operator page's own reads through the contract, so rule 2
extends from `lib/operator/**` to the pages: today a page may still import `lib/db/**` directly, and
that is the remaining coupling the ADR's §4.1 burn-down list names.

## Adding a surface

Add the page module, add its row to `OPERATOR_ROUTES` (or to `OPERATOR_ACTION_FILES` if it is a
write module), and run `pnpm exec vitest run tests/operator-seam.test.ts`. A row without a file, a
file without a row, an excluded surface in the set, or an editor that bypasses the contract each
fail by name — which is the point: the seam is a test, not a convention.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Operator seam · prev [Maintenance fields](maintenance-fields.md) · next [The spec register's GitHub join](spec-register-coverage.md)

<!-- docs-nav:end -->
