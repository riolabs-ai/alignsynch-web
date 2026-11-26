# The rail's doors — including the one that leaves the app

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › The rail's doors · prev [Account deletion](account-deletion-spec.md) · next [Template catalogue](catalogue.md)

<!-- docs-nav:end -->

**The rule:** the Admin sidebar (`data/nav-menu.json`) may draw a destination that lives on another
origin, and when it does the row must say so. An external address can never be a row's `href`, and a
row that leaves must open a new tab and announce it.

## Why the href cannot be the external address

Two checks own the rail's destinations, and both read the tree:

| check                   | what it asks                                                                     | what an external href would do                                                                               |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm nav:menu --check` | every row's `href` resolves in `content/routes.ts`                               | fail: no route in this tree matches an `https://` address                                                    |
| `pnpm data:check` E43   | every route under `app/(mainlayout)` is a rail row or a named `unlisted` surface | prove nothing about the row, and the row would teach the schema to carry a destination the app cannot answer |

So the rail reaches another origin through an **internal door**: a page under the shell that gates
and then answers `redirect()` to the real destination. One route, no second copy of the pages, and
the destination stays written once — the fixture's constant (`ADMIN_SPEC_DOCS_URL`), never a literal
in the page and never in the document.

The shipped case is `/admin/spec/ui-v2` (2026-11-26): the rail's **UI Specs v2** row, a 307 to
`https://alignsynch-v2-docs-preview.vercel.app/`. It replaced the Project Spec submenu's last row
(`Docs — draft pages`), which was the only other way into the drafts.

## Why the row carries `leaving`

`components/layout/nav-menus.tsx::NavRow` already draws a departure correctly — `LeavingLink`, which
owns `target="_blank"`, `rel="noopener noreferrer"`, the `ExternalLink` marker and an accessible name
ending "opens in a new tab". It decides that by itself when the destination is a public marketing
route (`lib/marketing-routes.ts::leavesApp`), because the public tree is in this repository.

A door onto another origin has no such signature: its `href` is an ordinary internal address, so the
renderer would draw in-app navigation and the reader would be teleported off-site in the tab they
were working in — losing the screen they were on, which is the defect E39 exists to prevent. The
document therefore carries the fact:

```json
{
  "id": "admin-spec-ui-v2",
  "href": "/admin/spec/ui-v2",
  "icon": "library",
  "needs": "admin",
  "leaving": true
}
```

- `leaving` is a schema key since document **v6** (`content/nav.ts`), `true` or absent — never
  `false`, which would be a second spelling of the default.
- It travels to the renderer through `lib/nav-menu.ts::NavItem.leaving` and becomes `NavRow`'s
  `leaving` prop. Nothing else about the row changes: the rung still decides who sees it, and the
  href is still resolved like every other row's.
- The validator's tree view prints `leaves` beside such a row, so an operator can see the departure
  in `pnpm nav:menu --tree --as admin` without opening the JSON.

## What a new door owes

1. **A route that renders nothing.** `app/(mainlayout)/admin/spec/ui-v2/page.tsx` gates in the
   subtree's order (`requireAdminProduct`, `requireOperator`, `requireAdmin`) and then redirects.
   It is registered in `content/routes.ts` and in `data/nav-inventory.json`
   (`pnpm nav:menu --inventory`).
2. **An entry in the surface tables the gate reads.** `data/surface-columns.ts` (`wide`, with the
   reason that it draws no column) and `lib/operator/routes.ts`'s `OPERATOR_EXCLUDED_PATTERNS` — a
   door is an address, not a screen, so it is excluded from the operator surface rather than
   enumerated as one.
3. **The row, with `leaving`, and a label in the shell fixture.** `data/pages/shell.ts`
   (`nav-alignsynch`) carries the words; the document carries the id.
4. **One door.** A move is not a duplication: the surface that used to carry the link no longer
   renders it. `tests/admin-spec-ui-v2.test.ts` holds both halves.

## What must not happen

- No `https://` href in `data/nav-menu.json`, ever — not to skip the route.
- No weakening of E10 or E43 to make room for an external destination.
- No second copy of the off-origin pages inside this repository, and no embedding of them: the
  destination stays the one place they live.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › The rail's doors · prev [Account deletion](account-deletion-spec.md) · next [Template catalogue](catalogue.md)

<!-- docs-nav:end -->
