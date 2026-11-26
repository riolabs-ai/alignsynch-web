# Settings & Integrations — the admin surface, and the matrix behind it

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Settings & integrations · prev [Help Center design spec (handoff)](spec-help-center/README.md) · next [Stages](stages.md)

<!-- docs-nav:end -->

Status: **initial spec, not built.** Scope is deliberately one screen and one data file. Issue:
to be filed from this page (feature.md headings below).

## 1. The decision

Build **`/admin/settings`**: one admin route that answers, for every provider this application
actually depends on, three questions and no fourth —

1. **Who is the account?** — the handle, org/project id and console address per environment.
2. **Is every variable it needs declared, present and fresh?** — rendered from the tables that
   already answer that, never re-typed.
3. **Where do I go to change it?** — a link to the provider's own key management, and a link to the
   variable's row in this repo.

It is **not** a secret reader, not a secret writer, and not a second source of truth. Every fact on
it is derived from `scripts/env-manifest.ts`, `docs/operations/env-stores.md`, `data/env/rotations.json`
and one new hand-authored file (`data/integrations.ts`) that holds only what no generator knows: the
account handles and the console URLs.

The model is Vercel's Integrations directory and Hermes' `/settings`: **a status board with rows you
click through from.** The work happens on the provider. The board's job is to make "which one is
it" and "is anything stale" answerable in one screen, which today takes four commands and a vault
unlock.

## 2. What already exists — measured, not assumed

This is the reason v1 is small: the hard half is already built and gated.

| Capability                              | Home                                                                           | Gate                                       | Measured                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Every variable, its env, its source     | `scripts/env-manifest.ts` (one table)                                          | `pnpm env:check` in **every** lane         | 45 declared · 3 `boot` · 63 out of scope · 82 names read across 1374 files               |
| Where each value actually lands         | `docs/operations/env-stores.md` (generated)                                    | `pnpm env:matrix --check` (local only)     | 50 names × 9 stores · 28 vault secrets · 6 vault keys no row names · 14 rows in no store |
| Stale credentials                       | `data/env/rotations.json` + `scripts/env-drift.mjs`                            | `release:preflight` refuses the cut        | 4 rotation sets; names + dates only, never a value                                       |
| Platform status                         | `/admin/health` → `lib/admin/platform-health.ts`                               | `requireAdminProduct()` + `requireAdmin()` | read-only, `Measured<T>`, live-vs-recorded split                                         |
| Reads a markdown matrix at request time | `/admin/permissions` → `lib/admin/{crud-matrix,crud-matrix-file}.ts`           | same two gates                             | the pure/node split is the E34-safe pattern to copy                                      |
| Admin writes with audit                 | `lib/admin/act.ts`                                                             | role read `FOR SHARE` in the writing txn   | one entry point, `before`/`after`, audit last                                            |
| Roles                                   | `content/identity.ts` (`owner`/`admin`/`support`/…), `lib/admin/act.ts` floors | —                                          | —                                                                                        |
| Route registration                      | `lib/operator/routes.ts` — 23 routes, page module per row                      | `tests/operator-seam.test.ts`              | widening is a red test                                                                   |

**So the gap is not a table. The gap is a directory.** Nothing in the repo says, in one place, that
`NEON_OBJSTORE_*` and `NEON_AUTH_COOKIE_SECRET` are the _same vendor with two consoles_, or that
Google sign-in's client config lives in **Neon Auth**, not in this repo's env at all
(`OUT_OF_SCOPE`: `GOOGLE_CLIENT_SECRET` — "the Neon auth provider holds the Google client config; no
app code path reads it"). A reader tracing a bad Resend key today reads four files and a generated
markdown page.

## 3. The matrix — what of it is real

The brief asked for five axes across every area. Measured against the tree, **two exist and three
do not**, and inventing the three on a settings page would be fabricated data:

| Axis                                                          | State                                         | Evidence                                                                                                                                                | v1 treatment                                                                   |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Environment** (local / preview / production)                | ✅ exists                                     | `ENVIRONMENTS` + a `Requirement` per row                                                                                                                | column, from the manifest                                                      |
| **Use / branch** (prod `main` / demo `demo`)                  | ⚠️ partial                                    | `.env.demo` is the `demo` branch; preview has all-branches + branch scopes; `ADMIN_EMAILS` is `forbidden` on demo                                       | column, derived from requirement — no new vocabulary                           |
| **Tool / method** (CLI / API / webhook / MCP)                 | ❌ missing                                    | `pnpm env:*` is the CLI; Resend + Stripe + GitHub inbound are webhooks; no inventory names which is which                                               | **one word per provider** in `data/integrations.ts`, hand-authored, small      |
| **User** (owner / admin / service / agent / cron)             | ❌ missing                                    | only `ADMIN_EMAILS`, `CRON_SECRET`, `GH_FEEDBACK_TOKEN` and an App identity exist; nothing declares "this credential belongs to the fleet, not the app" | **one `actor` field per provider** — `human` \| `service` \| `agent` \| `cron` |
| **Role / permission** (read / rw / scoped / project / global) | ⚠️ exists for _people_, not for _credentials_ | `act()` floors + `product.*` capabilities govern humans; a token's scope is nowhere recorded                                                            | **not in v1.** Stated as a known gap; see §8                                   |

The honest summary: the page can show environment and branch _today_, adds tool + actor _because
they are one hand-typed word per provider_, and refuses role/scope because that axis needs a
credential inventory that does not exist yet.

## 4. The surface

`/admin/settings` — server component, `force-dynamic`, gated `requireAdminProduct()` →
`requireAdmin()` (the `/admin/health` order, `notFound()` for `support`, never a 403).

**Band 1 — Integrations.** One card per provider, ordered by what breaks first if it is wrong:

| id       | provider                  | actor   | tool      | what it holds                                               |
| -------- | ------------------------- | ------- | --------- | ----------------------------------------------------------- |
| `neon`   | Neon                      | service | API       | branch + connection strings, Managed Auth, object storage   |
| `vercel` | Vercel                    | service | CLI + API | 4 env scopes, the deployment itself                         |
| `bws`    | Bitwarden Secrets Manager | service | CLI       | project `alignsynch-web`, the 28 readable secrets           |
| `resend` | Resend                    | service | webhook   | mail key, from-address, webhook secret, inbound             |
| `github` | GitHub                    | agent   | API       | `alignsynch-fleet` App, `GH_FEEDBACK_TOKEN`, feedback→issue |
| `google` | Google                    | human   | webhook   | OAuth client — **configured in Neon Auth, not in env**      |
| `stripe` | Stripe                    | service | webhook   | test keys per key-set, webhook secret                       |

Each card carries: account handle + console link (from `data/integrations.ts`), a count line
(`11 variables · 9 in vault · 0 stale · 0 absent`), the environment chips, and every variable it owns
as a compact row — **`source` and `status`, never a value**.

**Band 2 — The matrix.** The same rows as a table: `name · provider · local · preview · production ·
source · freshness`. Filterable by provider and by requirement. This is `docs/operations/env-stores.md`
rendered, which is why it must be derived from the same generators and not re-typed.

**Band 3 — Two honest panels,** because the generated page already has two failure shapes:
`env:matrix` needs a BWS token and a Vercel session that CI does not have, and the census is a
snapshot ("Generated 2026-11-21"). The page prints the snapshot's own date and says _recorded_, or
prints _not measured in this deployment_ — the `Measured<T>` rule from `/admin/health`, reused.

**Band 4 — Change it.** One link per variable to where it is edited, computed from `source`:
`vault → Bitwarden console (project alignsynch-web)` · `literal → this repo's manifest row` ·
`derived → nothing, it is computed` · `carried → the environment's own file`. **No form in v1.**

## 5. The data, and the split that keeps E34 out

```text
data/integrations.ts              # hand-authored: provider id, label, actor, tool,
                                  #   account handle per env, console URLs, docs link
lib/admin/settings/providers.ts   # PURE: grouping, status derivation, counts. No fs, no net.
lib/admin/settings/read.ts        # NODE: reads the manifest + env-stores.md + rotations.json
app/(mainlayout)/admin/settings/page.tsx
components/admin/settings/*       # server-rendered; no "use client" unless a filter needs it
```

The split is `crud-matrix.ts` / `crud-matrix-file.ts` replayed: the pure half is what a client
component may import, the reader half reaches `node:fs` and is asserted unreachable from the
`"use client"` graph by E34.

**Grouping is total, and a check proves it.** `providerOf(name)` maps every declared row and every
`OUT_OF_SCOPE` row to a provider id. A name it cannot place is a **failure that names the row**, not
a `general` bucket — the same rule `crud-matrix.ts` applies to an unknown column. `scripts/env-manifest.ts`
already knows this list; the first card adds `provider` as a field on the row rather than deriving it
from a prefix in a second place.

**Status is four badges, each from one source:**

| badge      | source                   | rule                                                                        |
| ---------- | ------------------------ | --------------------------------------------------------------------------- |
| `declared` | manifest                 | the row exists and the code reads it                                        |
| `present`  | `env-stores.md` census   | the store holds the name for that scope                                     |
| `fresh`    | `rotations.json` + drift | its `updatedAt` is not before the rotation that governs it                  |
| `valid`    | **nothing yet**          | phase 2: a provider probe. An absent probe prints `not checked`, never `ok` |

## 6. Menus that move together — measured

Adding one admin route is not one file. This list is grep-measured (`grep -rl /admin/health`), and
the first card must touch all of it or the gate goes red:

| File                                                                                                 | Why                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `content/routes.ts`                                                                                  | the route manifest; E10 fails on a literal `href` it cannot match               |
| `lib/operator/routes.ts`                                                                             | `OPERATOR_ROUTES` — the page module the capability gate guards (23 → 24)        |
| `tests/parity/boundary.ts`                                                                           | imports the page and asserts the `404` on a template without `product.operator` |
| `data/admin/start-surfaces.ts`                                                                       | the dashboard's 16-door directory                                               |
| `data/admin/submenu.ts`                                                                              | the pill row (`tests/admin-submenu.test.tsx` holds it to each page's own H1)    |
| `data/pages/admin-settings.ts` + `data/pages/index.ts`                                               | page copy as data; E23 measures the module's import closure at budget **0**     |
| `data/pages/budget.ts`                                                                               | the page's dirs/fixture/budget row (also the E37 render set)                    |
| `data/nav-menu.json` · `data/nav-inventory.json` · `data/surface-columns.ts` · `data/ui-registry.ts` | nav census — partly generated, regenerate rather than hand-merge                |
| `docs/ui-registry.md`                                                                                | generated: `node scripts/gen-ui-registry.mjs`                                   |
| `docs/docs.json` + `pnpm docs:nav`                                                                   | this page, and any guide it adds                                                |

**The consolidation half of the brief.** `/admin/health` answers "is the platform up",
`/admin/settings` answers "is the platform wired", and the two are currently four doors apart
(`health` and `audit` are in the pill row; nothing points at credentials). v1 adds **one** pill —
`Settings` — between `Platform health` and `Audit log`, and **one** dashboard door. Moving more
navigation than that is a second card: the pill row is deliberately five rows (`data/admin/submenu.ts`
says so), and widening it to all 16 doors is the duplicate navigation that file exists to prevent.

## 7. Must not

- **Never render a value.** Not truncated, not masked, not "length 32". Names, sources, dates and
  booleans only. `env-drift.mjs` already projects a listing to four fields before anything touches
  it; this page reads that projection, never a raw provider response.
- **Never call a provider from a render.** v1 does no network I/O at request time. `env:matrix`
  stays a command; the page reads its output.
- **Never invent a status.** `not checked`, `not measured in this deployment`, and `0 findings` are
  three different sentences.
- **No write path in v1.** No form, no server action, no `act()` call. The page imports no module
  that can mutate, and a test asserts it (the `/admin/health` "read-only, structurally" rule).
- **No second table of variables.** If a fact is in `scripts/env-manifest.ts`, it is read from there.
- **No `settings` table** until there is a v1.5 decision to write (§9). `db/migrations/` has 45 files
  and no global setting table; adding one to render a read-only row would be the opposite of KISS.

## 8. Known gaps this spec does not close

1. **Credential scope is unrecorded.** Nothing says a token is read-only, project-scoped or global.
   For a real control plane this is the missing axis; it needs a credential inventory, not a page.
2. **`valid` needs probes.** A Resend key's validity is a `GET /domains`; a Vercel token's is
   `/v2/user`; BWS has no cheap validity call beyond listing. Each needs a route handler with a
   timeout, a cache and a rate-limit story — a card of its own, and it must be **button-triggered,
   never on render**.
3. **Six vault keys no row names** (`ALIGNSYNCH_ADMIN_0{1,2}_{EMAIL,PASS}`,
   `ALIGNSYNCH_GOOGLE_CLIENT_SECRET`, `ALIGNSYNCH_WEB_NEON_KEY`) and **two store names no row
   declares** (`CRON_SECRET`, `NEON_AUTH_JWKS_URL`). The page will show them in a _Undeclared_ panel
   with their reason, because that is the panel that would have caught incident 1.
4. **14 rows sit in no store** and **14 names have two Preview entries.** Both are already counted;
   the page surfaces the count, it does not resolve them.

## 9. Decisions taken, and the one still open

| #      | Decision                      | Taken                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | Source of truth               | `scripts/env-manifest.ts` stays the only table; the page derives                                                                                                                                                                                                                         |
| D2     | Provider grouping             | a `provider` field on the manifest row, total, refused when unplaceable                                                                                                                                                                                                                  |
| D3     | Secrets                       | never read, never rendered, never written by this app                                                                                                                                                                                                                                    |
| D4     | Network at render             | none; the census is a recorded snapshot with its own date                                                                                                                                                                                                                                |
| D5     | Navigation                    | one pill + one dashboard door; the wider reorganisation is a second card                                                                                                                                                                                                                 |
| **D6** | **Editing non-secrets in v1** | **decided (C)** — v1 is read-only; a change is a PR to `data/integrations.ts`. The DB-backed override path is named as a follow-up card in §11, not built here. Reason: the page would otherwise become a writer of deployment config, which is the shape both incidents in §2 came from |

## 10. Acceptance — commands, not adjectives

```bash
bash scripts/verify.sh                 # green in every lane it runs
pnpm env:check                         # census unchanged: 45 declared, 0 unresolved
curl -s -o /dev/null -w '%{http_code}' localhost:3000/admin/settings   # 307 → /login signed out
# signed in as support:  404
# signed in as admin:    200, and the HTML contains no value from any .env file
grep -c "AdminSubmenuLink" data/admin/submenu.ts        # one new row, and its H1 matches
node scripts/gen-ui-registry.mjs --check                # registry not stale
```

Proven by test, not by reading:

- `tests/admin-settings.test.tsx` — the `support` session gets `404` and the reader is never called.
- `tests/admin-settings-providers.test.ts` — every declared row and every `OUT_OF_SCOPE` row resolves
  to a provider; a name added to either list without a provider fails by name.
- `tests/admin-settings-no-secret.test.ts` — the rendered tree of a fixture-provider set contains no
  value string and no `"use client"` module reaches `lib/admin/settings/read.ts` (E34's rule).

## 11. Deferred, explicitly

**D6-B — the write path** (the named follow-up, not built here): a `setting` table, a read path with
`env > setting > default` precedence, a `shadowed by env` badge, the form, and an `act()` assertion
that the audit row carries both sides. One card, blocked on this one landing.

Provider validity probes (§8.2) · credential scope inventory (§8.1) · a `/admin/settings/<provider>`
detail route · onboarding wizards (Hermes `pm install` / Vercel "New Project" style) · secret rotation
from the UI · MCP/plugin marketplace parity. Each is a card that cites this page, not a paragraph here.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Settings & integrations · prev [Help Center design spec (handoff)](spec-help-center/README.md) · next [Stages](stages.md)

<!-- docs-nav:end -->
