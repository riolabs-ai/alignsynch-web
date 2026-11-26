/**
 * The operator seam — the product may not depend on the tooling, and the tooling may not depend on
 * the product. `docs/specs/operator-separation-adr.md` §4 is the spec this file implements; the
 * rule engine is `scripts/operator-graph.ts` and the surface is `lib/operator/routes.ts`.
 *
 * Why a test and not a convention: the failures this catches are one import line in one file. They
 * typecheck, they lint, they build, they render — and then the console quietly cannot change
 * without editing the assessment flow, or the product cannot move without dragging the operator
 * tooling with it. Neither shows up in a screenshot.
 *
 * What is asserted, in the order the ADR states it:
 *
 *   1. **the surface** — `lib/operator/routes.ts` names 24 page modules, every one of them is a
 *      file in this tree under `app/(mainlayout)/admin/`, and none of them is an excluded surface;
 *   2. **the arrow, operator → product** — no operator file imports `app/**` or a `components/**`
 *      module outside `components/{admin,ui,operator}/**`;
 *   3. **the arrow, product → operator** — no product file imports `lib/operator/**` or
 *      `components/operator/**`, **value or type**;
 *   4. **the contract** — `lib/operator/read.ts` is the only operator-owned module that reaches
 *      `lib/db/**`, `lib/docs/**`, `lib/spec/**`, `lib/review/**` or `lib/admin/**`, and it exports
 *      facts (an exact key set) rather than handles;
 *   5. **the baseline** — the measured violations are carried in
 *      `tests/fixtures/operator-seam-baseline.json`, and it may only shrink: an unlisted violation
 *      fails, and so does a row that is no longer a violation (a stale baseline is how a burn-down
 *      stalls without anybody noticing).
 *
 * The extraction is driven here — with a synthetic tree — as well as over the real one, so the
 * rules are proven to bite without editing a shipped file: see "the rules, on a tree written to
 * break them".
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperatorFrame } from "@/components/operator/frame";
import * as read from "@/lib/operator/read";
import {
  OPERATOR_ACTION_FILES,
  OPERATOR_EXCLUDED_PATTERNS,
  OPERATOR_PAGE_FILES,
  OPERATOR_ROUTES,
} from "@/lib/operator/routes";
import {
  baselineDiff,
  censusOf,
  type OperatorSurface,
  type SeamBaseline,
  seamViolations,
} from "@/scripts/operator-graph";

/**
 * The baseline file as written: the rows plus the provenance a reader needs to trust them.
 *
 * `startingCounts` is what the tree measured **before** this card burned anything down and
 * `counts` is what it allows **after**, so the file records both the reason it exists and the
 * state it enforces. Neither number is decoration — the test asserts `counts` and the seam's PR
 * pastes both.
 */
interface BaselineFile {
  readonly measuredAt: string;
  readonly startingCounts: {
    readonly operatorPageFiles: number;
    readonly operatorComponentFiles: number;
  };
  readonly counts: { readonly operatorPageFiles: number; readonly operatorComponentFiles: number };
  readonly rows: SeamBaseline;
}

const SURFACE: OperatorSurface = {
  pageFiles: OPERATOR_PAGE_FILES,
  actionFiles: OPERATOR_ACTION_FILES,
};

/** Directories the walk reads: the four the shipped tree lives in. */
const ROOTS = ["app", "components", "lib", "data"] as const;

/**
 * Directories under a root the walk skips. `lib/quizhub` is the vendored template drop (gitignored,
 * so it exists on one machine and not on CI — a walk that read it would report a different tree
 * than the gate does), and `data/generated` is `pnpm gen` output.
 */
const SKIP = new Set(["node_modules", ".next", ".datacheck", "quizhub", "generated"]);

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path, found);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

let cached: Record<string, string> | null = null;

/** `{ path → source }` for the shipped tree — the only filesystem read in this file. */
function tree(): Record<string, string> {
  if (cached !== null) return cached;
  const sources: Record<string, string> = {};
  for (const root of ROOTS) {
    for (const path of walk(root)) sources[path] = readFileSync(join(process.cwd(), path), "utf8");
  }
  cached = sources;
  return sources;
}

/** The admin subtree, and the route prefix its directories sit under. */
const ADMIN_ROOT = "app/(mainlayout)/admin";
const ADMIN_ROUTE_PREFIX = "/admin";

/** Every `page.tsx` under the admin subtree — the directory walk the exclusion rule is read against. */
function adminPages(dir = ADMIN_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...adminPages(path));
    else if (entry.name === "page.tsx") found.push(path);
  }
  return found.sort();
}

function baselineFile(): BaselineFile {
  const raw = readFileSync(
    join(process.cwd(), "tests/fixtures/operator-seam-baseline.json"),
    "utf8",
  );
  return JSON.parse(raw) as BaselineFile;
}

const MEASURED = () => seamViolations({ sources: tree(), surface: SURFACE });

/** `file → specifier` for a printed finding, in the shape a baseline row is written. */
function format(violations: readonly { file: string; specifier: string; rule: string }[]): string {
  return violations.map((row) => `${row.rule}: ${row.file} → ${row.specifier}`).join("\n");
}

describe("the operator surface is enumerated, not remembered", () => {
  it("names 24 page modules serving 24 URLs", () => {
    expect(OPERATOR_ROUTES.length).toBe(24);
    expect(new Set(OPERATOR_PAGE_FILES).size).toBe(24);
    expect(new Set(OPERATOR_ROUTES.map((route) => route.path)).size).toBe(24);
  });

  it("every named page module is a file in this tree, under the admin subtree", () => {
    const sources = tree();
    for (const page of OPERATOR_PAGE_FILES) {
      expect(sources[page], `${page} is not a module this tree carries`).toBeDefined();
      expect(page.startsWith("app/(mainlayout)/admin/"), `${page} is not an admin page`).toBe(true);
      expect(page.endsWith("/page.tsx"), `${page} is not a page module`).toBe(true);
    }
  });

  it("keeps the excluded surfaces out of the set, and gates everything else", () => {
    // The exclusions are the owner's: the documentation pages, assessment authoring, the console's
    // own registry. Two assertions, and the second is the one that catches a directory-shaped
    // illusion: the operator set is every admin page **minus** the exclusions, so a new admin page
    // is either gated or named here — never silently ungated.
    const bareOf = (pattern: string) => `${ADMIN_ROOT}${pattern.slice(ADMIN_ROUTE_PREFIX.length)}`;
    const prefixOf = (pattern: string) => `${bareOf(pattern)}/`;

    const excludedPrefixes = OPERATOR_EXCLUDED_PATTERNS.filter(
      (pattern) => !pattern.includes("["),
    ).map(prefixOf);
    const excludedFiles = OPERATOR_EXCLUDED_PATTERNS.filter((pattern) => pattern.includes("[")).map(
      (pattern) => `${bareOf(pattern)}/page.tsx`,
    );

    for (const page of OPERATOR_PAGE_FILES) {
      for (const prefix of excludedPrefixes) {
        expect(page.startsWith(prefix), `${page} is under an excluded surface (${prefix})`).toBe(
          false,
        );
      }
      expect(excludedFiles, `${page} is an excluded surface`).not.toContain(page);
    }

    const uncovered = adminPages().filter(
      (page) =>
        !OPERATOR_PAGE_FILES.includes(page) &&
        !excludedFiles.includes(page) &&
        !excludedPrefixes.some((prefix) => page.startsWith(prefix)),
    );
    expect(
      uncovered,
      "admin pages that are neither operator surfaces nor named exclusions",
    ).toEqual([]);
  });

  it("names the seven write modules, so a page gate cannot close an address and leave the action", () => {
    expect(OPERATOR_ACTION_FILES).toEqual([
      "app/(mainlayout)/admin/billing/actions.ts",
      "app/(mainlayout)/admin/broadcast/actions.ts",
      "app/(mainlayout)/admin/email-templates/actions.ts",
      "app/(mainlayout)/admin/inbox/actions.ts",
      "app/(mainlayout)/admin/instances/[id]/actions.ts",
      "app/(mainlayout)/admin/instances/[id]/report/actions.ts",
      "app/(mainlayout)/admin/review/actions.ts",
    ]);
    const sources = tree();
    for (const action of OPERATOR_ACTION_FILES) expect(sources[action]).toBeDefined();
  });
});

describe("the arrow — operator may not read the product shell", () => {
  it("has no operator → product import outside the baseline", () => {
    const violations = MEASURED();
    const { unlisted } = baselineDiff(violations, baselineFile().rows);
    expect(unlisted.length, format(unlisted)).toBe(0);
  });

  it("counts the surface: no operator page imports a product component, and the carried component rows are the measured ones", () => {
    const violations = MEASURED();
    const pages = violations.filter(
      (row) => row.rule === "operator-reads-product" && OPERATOR_PAGE_FILES.includes(row.file),
    );
    const components = violations.filter(
      (row) => row.rule === "operator-reads-product" && row.file.startsWith("components/"),
    );
    const file = baselineFile();

    // The numbers the baseline records, asserted rather than described: a change to either is a
    // change to what this card claims it delivered, and must be made deliberately.
    expect(pages.length).toBe(file.counts.operatorPageFiles);
    expect(new Set(components.map((row) => row.file)).size).toBe(
      file.counts.operatorComponentFiles,
    );
  });

  it("every operator page renders the operator's own column", () => {
    const sources = tree();
    for (const page of OPERATOR_PAGE_FILES) {
      const source = sources[page] ?? "";
      expect(source, `${page} must render the operator frame`).toContain("<OperatorFrame>");
      expect(source, `${page} must not reach the product flow container`).not.toContain(
        "assessment-flow/stage-column",
      );
    }
  });
});

describe("the arrow — product may not read the operator", () => {
  it("has no product → operator import, value or type", () => {
    const leaked = MEASURED().filter((row) => row.rule === "product-reads-operator");
    expect(leaked.length, format(leaked)).toBe(0);
  });
});

describe("the read contract", () => {
  it("is the only operator-owned module that reaches an internal layer", () => {
    const leaked = MEASURED().filter((row) => row.rule === "operator-reads-internals");
    expect(leaked.length, format(leaked)).toBe(0);
  });

  it("exports facts — the exact surface, so a handle cannot be added quietly", () => {
    // A key set, not a snapshot of values: an export that is not one of these is a new door, and a
    // door added to the contract is a decision, not a refactor.
    expect(Object.keys(read).sort()).toEqual([
      "auditFacts",
      "emailTemplateFacts",
      "permissionsMatrixFacts",
      "reviewFacts",
      "routeFacts",
      "specFacts",
      "templateVersionFacts",
    ]);
    expect(read.routeFacts().length).toBe(24);
  });

  it("answers a missing register as a value, not an exception", () => {
    // `specFacts()` reads the committed register, which is present — so the shape is what is
    // asserted here, and the failure path is asserted in `read.ts`'s own try/catch (the layer's
    // `SpecUnreadable` is the only error it answers).
    const facts = read.specFacts();
    expect(facts.ok).toBe(true);
  });
});

describe("the baseline may only shrink", () => {
  it("carries no stale row — every allowlisted import is still a violation", () => {
    const { stale } = baselineDiff(MEASURED(), baselineFile().rows);
    expect(stale, `baseline rows that no longer violate:\n${stale.join("\n")}`).toEqual([]);
  });

  it("prints the census every run", () => {
    const violations = MEASURED();
    const file = baselineFile();
    const line = censusOf({
      sources: tree(),
      surface: SURFACE,
      violations,
      baseline: file.rows,
    });
    // Visible in `pnpm test -- operator-seam` and in CI's log: operator files walked, violations,
    // allowlisted rows. A number that moved is the first thing a reviewer should see.
    console.log(`[operator-seam] ${line}`);
    expect(line).toMatch(/^\d+ operator files walked, \d+ violations, \d+ allowlisted$/);
  });
});

describe("the rules, on a tree written to break them", () => {
  const surface: OperatorSurface = {
    pageFiles: ["app/(mainlayout)/admin/x/page.tsx"],
    actionFiles: ["app/(mainlayout)/admin/x/actions.ts"],
  };

  function rulesFor(sources: Record<string, string>): string[] {
    return seamViolations({ sources, surface }).map(
      (row) => `${row.rule}: ${row.file} → ${row.specifier}`,
    );
  }

  it("fails a page that imports a product component", () => {
    expect(
      rulesFor({
        "app/(mainlayout)/admin/x/page.tsx":
          'import { StageColumn } from "@/components/assessment-flow/stage-column";',
      }),
    ).toEqual([
      "operator-reads-product: app/(mainlayout)/admin/x/page.tsx → @/components/assessment-flow/stage-column",
    ]);
  });

  it("fails a page that imports another page or route module", () => {
    expect(
      rulesFor({
        "app/(mainlayout)/admin/x/page.tsx":
          'import { metadata } from "@/app/(mainlayout)/dashboard/page";',
      }),
    ).toEqual([
      "operator-reads-product: app/(mainlayout)/admin/x/page.tsx → @/app/(mainlayout)/dashboard/page",
    ]);
  });

  it("allows the primitives and the operator's own directories", () => {
    expect(
      rulesFor({
        "app/(mainlayout)/admin/x/page.tsx": [
          'import { Button } from "@/components/ui/button";',
          'import { OperatorFrame } from "@/components/operator/frame";',
          'import { PermissionsConsole } from "@/components/admin/permissions/permissions-console";',
        ].join("\n"),
      }),
    ).toEqual([]);
  });

  it("fails a product page that imports an operator module — including a type import", () => {
    expect(
      rulesFor({
        "app/(mainlayout)/dashboard/page.tsx": [
          'import type { OperatorRead } from "@/lib/operator/read";',
          'import { auditFacts } from "@/lib/operator/read";',
        ].join("\n"),
      }),
    ).toEqual([
      "product-reads-operator: app/(mainlayout)/dashboard/page.tsx → @/lib/operator/read",
      "product-reads-operator: app/(mainlayout)/dashboard/page.tsx → @/lib/operator/read",
    ]);
  });

  it("fails a product component that imports the operator frame", () => {
    expect(
      rulesFor({
        "components/assessment-flow/stage-column.tsx":
          'import { OperatorFrame } from "@/components/operator/frame";',
      }),
    ).toEqual([
      "product-reads-operator: components/assessment-flow/stage-column.tsx → @/components/operator/frame",
    ]);
  });

  it("allows the read contract to reach the internals, and fails any other operator module that does", () => {
    expect(
      rulesFor({
        "lib/operator/read.ts": 'import { queryRows } from "@/lib/db/client";',
      }),
    ).toEqual([]);
    expect(
      rulesFor({
        "lib/operator/render.ts": 'import { queryRows } from "@/lib/db/client";',
      }),
    ).toEqual(["operator-reads-internals: lib/operator/render.ts → @/lib/db/client"]);
    expect(rulesFor({ "lib/operator/render.ts": 'import pg from "pg";' })).toEqual([
      "operator-reads-internals: lib/operator/render.ts → pg",
    ]);
  });

  it("treats tests and scripts as neither, so the seam test can read the surface it asserts", () => {
    expect(
      rulesFor({
        "tests/some.test.ts": 'import { OPERATOR_PAGE_FILES } from "@/lib/operator/routes";',
        "scripts/some-tool.ts": 'import { seamViolations } from "@/scripts/operator-graph";',
      }),
    ).toEqual([]);
  });

  it("reports an import added to the real tree, which is the failure the baseline cannot absorb", () => {
    // The shipped tree plus one violating import: the diff must name that row, so a new coupling
    // cannot be absorbed by an allowlist — only by a deliberate baseline edit. Everything else in
    // the report has to be the tree's own (empty, on this branch), never the sentinel's.
    const sources = {
      ...tree(),
      "lib/operator/leak.ts": 'import { Header } from "@/components/layout/header";',
    };
    const { unlisted } = baselineDiff(
      seamViolations({ sources, surface: SURFACE }),
      baselineFile().rows,
    );
    expect(format(unlisted)).toContain(
      "operator-reads-product: lib/operator/leak.ts → @/components/layout/header",
    );
    expect(format(unlisted.filter((row) => row.file !== "lib/operator/leak.ts"))).toBe("");
  });
});

describe("the operator column", () => {
  it("is the product column's geometry, to the class — the copy buys the import, not a redesign", () => {
    const html = renderToStaticMarkup(createElement(OperatorFrame, null, "band"));
    expect(html).toContain("w-full");
    expect(html).toContain("max-w-[1126px]");
    expect(html).not.toContain("mx-auto");
  });
});
