/**
 * The write modules behind the operator pages (#1391) — a table with no page imports, on purpose.
 *
 * `boundary.ts` next door is the operator surface as **addresses**: twenty-three page modules the
 * router resolves, imported statically so a rename breaks `tsc`. This file is the same surface as
 * **endpoints**: the `actions.ts` modules beside those pages, which a server action's generated id
 * reaches without the page ever rendering. A 404 on `/admin/billing` is not a refusal of
 * `performComp`, which is the defect `#1391` phase 1 left open and this table names.
 *
 * **Why it is a sibling and not a section of `boundary.ts`.** The tables here are read by
 * `tests/admin-action-gates.test.ts`, which runs under plain `vitest run` — and `boundary.ts`
 * statically imports twenty-three page modules, whose graph reaches `@neon/auth` and `next/headers`
 * and cannot resolve outside the parity harness. A pure table is importable from both places, so
 * the audit does not have to mock a page to count an action.
 *
 * **The rows are a statement, not the source of truth.** The sibling `page.tsx` is: the expected
 * gates are derived from it (`scripts/action-gates.ts`), and the audit walks the tree, so a *new*
 * `actions.ts` under `admin/**` is discovered and must match its page or fail. A row here cannot go
 * stale without the audit going red, in either direction.
 */

/** One `actions.ts` behind an operator page, and the capability gates it opens with. */
export type OperatorActionModule = {
  /** The route whose page owns the write — always a row in `operatorRoutes`. */
  route: string;
  /** The module, repo-relative, as `ls` prints it. */
  module: string;
  /** The gates its sibling page asks for, in order. Written for a reader; the audit re-derives. */
  gates: readonly string[];
};

/**
 * The seven write modules the operator pages own.
 *
 * `email-templates` is the index route; `email-templates/[id]` imports the same module, so there is
 * one row and one gate for both pages. `instances/[id]` and its `report/` are separate modules and
 * separate rows, because they are separate endpoints: closing one is not closing the other.
 */
export const operatorActionModules: readonly OperatorActionModule[] = [
  {
    route: "/admin/billing",
    module: "app/(mainlayout)/admin/billing/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/broadcast",
    module: "app/(mainlayout)/admin/broadcast/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/email-templates",
    module: "app/(mainlayout)/admin/email-templates/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/inbox",
    module: "app/(mainlayout)/admin/inbox/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/instances/[id]",
    module: "app/(mainlayout)/admin/instances/[id]/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/instances/[id]/report",
    module: "app/(mainlayout)/admin/instances/[id]/report/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/review",
    module: "app/(mainlayout)/admin/review/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
  {
    route: "/admin/settings",
    module: "app/(mainlayout)/admin/settings/actions.ts",
    gates: ["requireAdminProduct", "requireOperator"],
  },
] as const;

/** The module paths alone — what the audit matches its walk against. */
export const OPERATOR_ACTION_MODULES: readonly string[] = operatorActionModules.map(
  (row) => row.module,
);

/**
 * The one `actions.ts` under `admin/**` that is **not** an operator module, with the reason.
 *
 * `/admin/templates` is template authoring — the product AlignSynch sells, not the back office —
 * and the issue excludes it from the operator set by name (`OPERATOR_EXCLUDED_PATTERNS` in
 * `boundary.ts`). Its actions still carry `requireAdminProduct()`, because a build without
 * `product.admin` must refuse the write as well as the page; they must **not** carry
 * `requireOperator()`, or a build that renders their pages would refuse their saves. The audit
 * derives exactly that from the page rather than from this list — which is why the list is one row
 * and not a policy.
 */
export const PRODUCT_ACTION_MODULES: readonly string[] = [
  "app/(mainlayout)/admin/templates/actions.ts",
];

/** Every `actions.ts` under `admin/**` the audit expects to find — operator ones first. */
export const ADMIN_ACTION_MODULES: readonly string[] = [
  ...OPERATOR_ACTION_MODULES,
  ...PRODUCT_ACTION_MODULES,
];
