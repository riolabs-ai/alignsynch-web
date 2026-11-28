/**
 * The operator gate, one level down (#1391).
 *
 * Phase 1 closed twenty-three page modules under `app/(mainlayout)/admin/**` with
 * `requireAdminProduct()` + `requireOperator()`. It did not close the **write modules** beside
 * them: five `actions.ts` files carried no `require*()` at all, and a server action is a POST
 * endpoint addressed by an id of its own, so a caller holding that id reaches the write path on a
 * build where the page answers 404. A 404 on `/admin/billing` is not a refusal of `performComp`.
 *
 * This suite is the gate that closes that hole, in three claims:
 *
 *   1. **Discovery** — every `actions.ts` under `admin/**`, and every module carrying a real
 *      `"use server"` directive, is walked. A new one that is not in
 *      `tests/parity/boundary.ts::ADMIN_ACTION_MODULES` fails here rather than shipping ungated.
 *   2. **The page's rule, on the action** — each exported server action opens with the capability
 *      gates its sibling `page.tsx` opens with, in the same order. The expectation is *derived*
 *      from the page (`scripts/action-gates.ts`), so a gate added to a page asks the same of its
 *      actions in the same commit, and a hand-maintained list cannot drift.
 *   3. **The table means something** — every row of `operatorActionModules` names a row of
 *      `operatorRoutes` and the gates its page actually asks for.
 *
 * `/admin/templates/actions.ts` is the one module that is not an operator one: template authoring
 * is a product surface the issue excludes by name, so its actions carry `requireAdminProduct()`
 * and no `requireOperator()` — exactly what its page asks for, which is why the derivation is a
 * rule and not an exception.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditActionModules,
  expectedActionGates,
  exportedActions,
  stripComments,
} from "@/scripts/action-gates";

import {
  ADMIN_ACTION_MODULES,
  OPERATOR_ACTION_MODULES,
  PRODUCT_ACTION_MODULES,
  operatorActionModules,
} from "./parity/action-modules";

const ADMIN_ROOT = join(process.cwd(), "app", "(mainlayout)", "admin");

/** Every source file under `admin/**`, repo-relative with forward slashes. */
function adminFiles(): string[] {
  return readdirSync(ADMIN_ROOT, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(sep).join("/"))
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => `app/(mainlayout)/admin/${entry}`);
}

function sourceOf(path: string): string {
  return readFileSync(path.startsWith("/") ? path : join(process.cwd(), path), "utf8");
}

/** How a `"use server"` directive is recognised: first statement of a file, comments stripped. */
const SERVER_DIRECTIVE = /^\s*["']use server["']\s*;?\s*$/m;

describe("the admin write modules are discovered, not listed", () => {
  const discovered = adminFiles().filter((path) => path.endsWith("/actions.ts"));

  it("finds exactly the modules the boundary table names, in both directions", () => {
    expect(
      [...discovered].sort(),
      "this walk and `tests/parity/boundary.ts::ADMIN_ACTION_MODULES` disagree — a new " +
        "`actions.ts` under `admin/**` must be added to that table **and** open every exported " +
        "action with `requireAdminProduct()` (plus `requireOperator()` when its page closes with " +
        "the operator capability), or it ships as an ungated POST endpoint while the page answers " +
        "404; a module that no longer exists must leave the table",
    ).toEqual([...ADMIN_ACTION_MODULES].sort());
  });

  it("no server action hides in a module not named `actions.ts`", () => {
    const inline = adminFiles()
      .filter((path) => !path.endsWith("/actions.ts"))
      .filter((path) => SERVER_DIRECTIVE.test(stripComments(sourceOf(path))));

    expect(
      inline,
      'a `"use server"` module that is not `actions.ts` carries exported POST endpoints this ' +
        "audit does not walk — name it `actions.ts` beside its page so the gate can find it",
    ).toEqual([]);
  });
});

describe("every exported admin action opens with its page's capability gates", () => {
  const modules = Object.fromEntries(
    adminFiles()
      .filter((path) => path.endsWith("/actions.ts"))
      .map((path) => [path, sourceOf(path)]),
  );
  const pages = Object.fromEntries(
    Object.keys(modules)
      .map((path) => path.replace(/actions\.ts$/, "page.tsx"))
      .map((path) => [path, sourceOf(path)]),
  );
  const audit = auditActionModules({ modules, pages });

  it("reports no ungated action and no action gated differently from its page", () => {
    const lines = audit.findings.map(
      (finding) =>
        `${finding.module} → ${finding.action}: ${finding.reason}\n` +
        `    has      [${finding.found.join(", ")}]\n` +
        `    expected [${finding.expected.join(", ")}]`,
    );

    expect(
      lines,
      "a server action is a POST endpoint with an id of its own, so the page's 404 does not " +
        "refuse it. Every exported action opens with `requireAdminProduct();` then " +
        "`requireOperator();` — the order and the calls the page module uses — before the " +
        "session read, the params and the payload",
    ).toEqual([]);
  });

  it("counts the surface: nine modules, twenty-five actions, eight operator modules", () => {
    // A census, not a promise: the numbers move only when a module is added or an action is
    // exported, and both are the change this suite exists to see.
    expect(audit.census).toEqual({
      modules: 9,
      actions: 25,
      gated: 25,
      operatorModules: 8,
    });
  });

  it("the one product module is not an operator module", () => {
    const product = PRODUCT_ACTION_MODULES[0];
    expect(
      OPERATOR_ACTION_MODULES,
      "`/admin/templates` is excluded from the operator set by name — a gate that closes its " +
        "saves on a build that renders its pages is not this card's change",
    ).not.toContain(product);

    const gates = exportedActions(sourceOf(product)).map((action) => action.gates);
    expect(gates.every((list) => list.join() === "requireAdminProduct")).toBe(true);
  });
});

describe("the action table agrees with the pages it names", () => {
  it("every row's page asks for the gates its row lists", () => {
    for (const row of operatorActionModules) {
      // The route→page hop is `tests/parity/parity.check.ts`'s assertion (`row.route` is a row of
      // `operatorRoutes`) — this suite cannot import that list, because every page module in it
      // reaches `@neon/auth` and only the parity harness can resolve that graph.
      const page = `app/(mainlayout)${row.route}/page.tsx`;
      expect(
        expectedActionGates(sourceOf(page)),
        `${row.route}'s page does not ask for the gates its row lists (${row.gates.join(", ")})`,
      ).toEqual([...row.gates]);
    }
  });

  it("the eight operator modules are the eight the issue names", () => {
    expect(OPERATOR_ACTION_MODULES).toHaveLength(8);
    expect(new Set(OPERATOR_ACTION_MODULES).size).toBe(8);
  });
});

/* ------------------------------------------------------------------ *
 * The extraction itself, driven by strings
 * ------------------------------------------------------------------ */

const PAGE_WITH_BOTH_GATES = `import { requireAdminProduct, requireOperator } from "@/lib/brand-boundary";

export default async function Page() {
  requireAdminProduct();
  requireOperator(); // #1391 — product.operator
  await requireAdmin({ next: "/admin/billing" });
  return null;
}
`;

const PAGE_WITH_CONSOLE_ONLY = `import { requireAdminProduct } from "@/lib/brand-boundary";

export default async function Page() {
  requireAdminProduct();
  await requireAdmin({ next: "/admin/templates" });
  return null;
}
`;

const PAGE_THAT_ONLY_NAMES_THE_GATE = `/**
 * Two gates, in the console's order: \`requireAdminProduct()\` and then \`requireOperator()\`
 * before the role gate.
 */
export default async function Page() {
  requireAdminProduct();
  await requireAdmin({ next: "/admin/templates" });
  return null;
}
`;

describe("what the audit reads, and what it refuses to read", () => {
  it("a page's gates come from the calls, not from its docstring", () => {
    expect(expectedActionGates(PAGE_WITH_BOTH_GATES)).toEqual([
      "requireAdminProduct",
      "requireOperator",
    ]);
    expect(expectedActionGates(PAGE_WITH_CONSOLE_ONLY)).toEqual(["requireAdminProduct"]);
    expect(
      expectedActionGates(PAGE_THAT_ONLY_NAMES_THE_GATE),
      "a docstring that names `requireOperator()` is prose — a page that does not call it does " +
        "not ask its actions for it",
    ).toEqual(["requireAdminProduct"]);
  });

  it("an ungated action is found by name", () => {
    const module = `"use server";
export async function performComp(input: unknown) {
  const user = await currentUser();
  return input;
}
`;
    const audit = auditActionModules({
      modules: { "app/(mainlayout)/admin/billing/actions.ts": module },
      pages: { "app/(mainlayout)/admin/billing/page.tsx": PAGE_WITH_BOTH_GATES },
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].action).toBe("performComp");
    expect(audit.findings[0].found).toEqual([]);
    expect(audit.findings[0].reason).toContain("no capability gate");
  });

  it("the wrong order is a finding, not a pass", () => {
    const module = `"use server";
export async function performComp(input: unknown) {
  requireOperator();
  requireAdminProduct();
  return input;
}
`;
    const audit = auditActionModules({
      modules: { "app/(mainlayout)/admin/billing/actions.ts": module },
      pages: { "app/(mainlayout)/admin/billing/page.tsx": PAGE_WITH_BOTH_GATES },
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].found).toEqual(["requireOperator", "requireAdminProduct"]);
  });

  it("a gate after the session read does not count", () => {
    const module = `"use server";
export async function performComp(input: unknown) {
  const user = await currentUser();
  requireAdminProduct();
  requireOperator();
  return user;
}
`;
    const audit = auditActionModules({
      modules: { "app/(mainlayout)/admin/billing/actions.ts": module },
      pages: { "app/(mainlayout)/admin/billing/page.tsx": PAGE_WITH_BOTH_GATES },
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].found).toEqual([]);
  });

  it("a delegating action still opens with its own gate", () => {
    const module = `"use server";
export async function archiveTemplateVersion(payload: unknown) {
  requireAdminProduct();
  return versionWrite(payload);
}
export async function destroyTemplateVersion(payload: unknown) {
  return versionWrite(payload);
}
`;
    const audit = auditActionModules({
      modules: { "app/(mainlayout)/admin/templates/actions.ts": module },
      pages: { "app/(mainlayout)/admin/templates/page.tsx": PAGE_WITH_CONSOLE_ONLY },
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].action).toBe("destroyTemplateVersion");
  });

  it("an action module with no sibling page cannot be measured", () => {
    const audit = auditActionModules({
      modules: {
        "app/(mainlayout)/admin/newthing/actions.ts": `"use server";
export async function doThing() {
  requireAdminProduct();
  requireOperator();
}
`,
      },
      pages: {},
    });

    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0].reason).toContain("no sibling");
  });
});
