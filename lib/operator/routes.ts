/**
 * lib/operator/routes.ts — the operator surface, enumerated once.
 *
 * The gate (phase 1, PR #1394) answers "may this build serve the operator tooling at all" with one
 * capability, `product.operator`. The seam (phase 2, this module) answers "which files *are* the
 * operator tooling", because a rule that is repeated in fourteen files is a convention, and a
 * convention is what the seam exists to replace.
 *
 * Three facts live here, and nothing else:
 *
 *   - **`OPERATOR_ROUTES`** — the address and the page module, in one row. Two parallel lists drift;
 *     a row cannot.
 *   - **`OPERATOR_ACTION_FILES`** — the write modules. A page gate closes an address, not an action
 *     id: a POST to a server action does not render the page module that guards the URL.
 *   - **`OPERATOR_EXCLUDED_PATTERNS`** — the surfaces a reader would *expect* in the list and must
 *     not find there, by name, so widening the set by judgement is a red test rather than a quiet
 *     decision. `/admin/docs/[...slug]` (the documentation pages), `/admin/templates*` (assessment
 *     authoring) and `/admin/console*` (the console's own registry) are product surfaces.
 *
 * Kept pure on purpose: no imports, no reads, no side effects. `tests/operator-seam.test.ts` reads
 * it as the surface, `scripts/operator-graph.ts` takes it as data, and the parity boundary in
 * `tests/parity/boundary.ts` (phase 1) carries the same set row for row — when both cards are on
 * `main`, that file should import these paths instead of repeating them.
 *
 * The measured set is 24 page modules serving 24 URLs (#1443 added `/admin/settings`); the ADR's
 * table listed 11 URLs because it
 * predates the gate, which the owner widened to every `/admin/**` surface except the three
 * exclusions above.
 */

/** The build capability that decides whether a template ships the operator tooling at all. */
export const OPERATOR_CAPABILITY = "product.operator" as const;

/** One operator route: the address a reader types, and the module that serves it. */
export interface OperatorRouteFact {
  /** The URL path, with no trailing slash. */
  readonly path: string;
  /** The page module, repo-relative and extension included — the file the gate guards. */
  readonly page: string;
}

/**
 * The 24 surfaces, measured on `origin/main` @ `e2b1c9c48` (the tree phase 1 gated), plus
 * `/admin/settings` (#1443).
 *
 * Order is the directory order, shallow before deep, so a diff that adds a row reads as an
 * insertion where the route lives rather than at the end of a list.
 */
export const OPERATOR_ROUTES: readonly OperatorRouteFact[] = [
  { path: "/admin/dashboard", page: "app/(mainlayout)/admin/dashboard/page.tsx" },
  { path: "/admin/audit", page: "app/(mainlayout)/admin/audit/page.tsx" },
  { path: "/admin/billing", page: "app/(mainlayout)/admin/billing/page.tsx" },
  { path: "/admin/brand", page: "app/(mainlayout)/admin/brand/page.tsx" },
  { path: "/admin/broadcast", page: "app/(mainlayout)/admin/broadcast/page.tsx" },
  { path: "/admin/docs", page: "app/(mainlayout)/admin/docs/page.tsx" },
  { path: "/admin/docs/features", page: "app/(mainlayout)/admin/docs/features/page.tsx" },
  { path: "/admin/docs/releases", page: "app/(mainlayout)/admin/docs/releases/page.tsx" },
  { path: "/admin/docs/updates", page: "app/(mainlayout)/admin/docs/updates/page.tsx" },
  { path: "/admin/email-templates", page: "app/(mainlayout)/admin/email-templates/page.tsx" },
  {
    path: "/admin/email-templates/[id]",
    page: "app/(mainlayout)/admin/email-templates/[id]/page.tsx",
  },
  { path: "/admin/gaps", page: "app/(mainlayout)/admin/gaps/page.tsx" },
  { path: "/admin/growth", page: "app/(mainlayout)/admin/growth/page.tsx" },
  { path: "/admin/health", page: "app/(mainlayout)/admin/health/page.tsx" },
  { path: "/admin/inbox", page: "app/(mainlayout)/admin/inbox/page.tsx" },
  { path: "/admin/instances", page: "app/(mainlayout)/admin/instances/page.tsx" },
  { path: "/admin/instances/[id]", page: "app/(mainlayout)/admin/instances/[id]/page.tsx" },
  {
    path: "/admin/instances/[id]/report",
    page: "app/(mainlayout)/admin/instances/[id]/report/page.tsx",
  },
  { path: "/admin/permissions", page: "app/(mainlayout)/admin/permissions/page.tsx" },
  { path: "/admin/review", page: "app/(mainlayout)/admin/review/page.tsx" },
  { path: "/admin/settings", page: "app/(mainlayout)/admin/settings/page.tsx" },
  { path: "/admin/spec", page: "app/(mainlayout)/admin/spec/page.tsx" },
  { path: "/admin/spec/[group]", page: "app/(mainlayout)/admin/spec/[group]/page.tsx" },
  { path: "/admin/spec/validation", page: "app/(mainlayout)/admin/spec/validation/page.tsx" },
];

/** The page modules, derived — never a second list to keep in step. */
export const OPERATOR_PAGE_FILES: readonly string[] = OPERATOR_ROUTES.map((route) => route.page);

/**
 * The write modules behind the operator pages — the sibling `actions.ts` of seven of them.
 *
 * Both halves of the card's warning live here: a page gate closes an address, not an action id
 * (a POST to a server action never renders the guarded page module), and a scan that only walks
 * `page.tsx` cannot see the module the button actually calls.
 *
 * Seven, not the ADR's two: the seam measured every relative import out of the 23 pages
 * (`./actions` from billing, broadcast, inbox, `/admin/instances/[id]` and its `/report` child,
 * review; `../actions` from `email-templates/[id]`). `admin/templates/actions.ts` is **not** here — that is
 * assessment authoring, an excluded product surface. Phase 1's gap list (§2.3) names the same
 * seven, five of which still carry no capability gate of their own; this list does not gate them,
 * it makes them visible to the seam.
 */
export const OPERATOR_ACTION_FILES: readonly string[] = [
  "app/(mainlayout)/admin/billing/actions.ts",
  "app/(mainlayout)/admin/broadcast/actions.ts",
  "app/(mainlayout)/admin/email-templates/actions.ts",
  "app/(mainlayout)/admin/inbox/actions.ts",
  "app/(mainlayout)/admin/instances/[id]/actions.ts",
  "app/(mainlayout)/admin/instances/[id]/report/actions.ts",
  "app/(mainlayout)/admin/review/actions.ts",
];

/**
 * Surfaces that look like operator tooling and are not — the owner's exclusions, by name.
 *
 * A pattern here that is also a page under `app/(mainlayout)/admin` is what the seam test asserts
 * against; the documentation *pages* stay readable to any console admin, and template authoring is
 * the initiator's own product surface.
 *
 * **`/admin/spec/ui-v2` is a door, not a surface** (2026-11-26). It gates like its spec siblings
 * (`requireAdminProduct`, `requireOperator`, `requireAdmin`) and then answers `redirect()` to the
 * v2 draft pages on another origin, so it renders nothing: there is no operator view behind it to
 * hold to the seam's import rules and no container for it to draw. That is why it is named here
 * rather than in `OPERATOR_ROUTES` — the seam test refuses an admin page that is neither, and the
 * exclusion is about what the file *renders*, not about how strictly it gates.
 */
export const OPERATOR_EXCLUDED_PATTERNS: readonly string[] = [
  "/admin/docs/[...slug]",
  "/admin/templates",
  "/admin/templates/[id]",
  // The redirect door to the v2 draft pages (`UI Specs v2`): an address, not a screen.
  "/admin/spec/ui-v2",
  "/admin/console",
  "/admin/console/relationships",
  "/admin/console/templates",
  "/admin/console/templates/[id]",
];
