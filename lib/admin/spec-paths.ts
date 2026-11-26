/**
 * Where the project spec lives (#1252) — three addresses and the gate they share.
 *
 * **The constants exist so the gate and the landing cannot disagree.** `?next=` on a signed-out
 * visit, the sign-in landing (`lib/auth/paths.ts::signInLanding`) and the rail row
 * (`data/nav-menu.json`'s `admin-spec`) all name the same page, and a second literal in any of
 * them is how a role lands on a 404 after signing in. `content/routes.ts` carries the same three
 * patterns for the router, and `data:check` E10 resolves every `href` against it.
 *
 * **No imports, no runtime.** This module is read by the page modules, by the pure sign-in
 * landing and by the rail's validator, so it is three strings and one function — it may not reach
 * a session, a database or a brand.
 */

/** The spec's own front page — the Overview (s01), and where a stakeholder lands after sign-in. */
export const ADMIN_SPEC_PATH = "/admin/spec";

/** The validation matrix (s02) — pinned in the submenu, and never one click deeper. */
export const ADMIN_SPEC_VALIDATION_PATH = "/admin/spec/validation";

/**
 * The v2 draft pages' **internal door** (2026-11-26) — the rail's `UI Specs v2` row, and not the
 * pages themselves.
 *
 * The drafts are a separate deployment (`ADMIN_SPEC_DOCS_URL`, `data/pages/admin-spec.ts`) with no
 * route in this tree, so the rail cannot hold their address: every row's href must resolve against
 * `content/routes.ts` and be accounted for by the ordinary route walk (E43). This address is the
 * route that redirects, which is what makes an off-origin door a rail row at all — one hop, no
 * second copy of the pages, and the destination stays written once, in the fixture above.
 *
 * It sits on `/admin/spec/` beside `[group]`, exactly as `validation` does: a static segment under
 * the same parent wins, so Next resolves this page before a story segment called `ui-v2` could.
 */
export const ADMIN_SPEC_UI_V2_PATH = "/admin/spec/ui-v2";

/**
 * One group's story page (s03) — `/admin/spec/07-billing` and its ten siblings.
 *
 * The `[group]` segment is resolved by the page in the next card (the reader). In this spine the
 * route exists to answer the gate's three states correctly, which is why the function takes the
 * raw segment and does no vocabulary check of its own.
 */
export function adminSpecGroupPath(group: string): string {
  return `${ADMIN_SPEC_PATH}/${group}`;
}
