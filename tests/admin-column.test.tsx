/**
 * The admin console's shared column (#717, C3 of the #714 wave) — one container, not eighteen.
 *
 * (Twenty pages since #892 added the documentation hub and one document; the count in the first case
 * is the floor on the walk, and every other case derives the list.)
 *
 * The issue asked for the admin pages to adopt **one** container, and measured it the wrong way
 * round: `grep mx-auto 'app/(mainlayout)/admin' --include=page.tsx` returned 0 because the page
 * files are thin — they gate, read and hand the result to a view component — while the *view*
 * components drew a centred column each. Six `components/v1/admin-*.tsx` spelled
 * `mx-auto max-w-4xl|5xl|6xl p-4 sm:p-8`, `components/console/gap-analysis.tsx` spelled
 * `container mx-auto max-w-5xl`, and `components/admin/platform-health.tsx` spelled
 * `container mx-auto max-w-7xl`. Eight columns, four widths, and not one of them the app's own.
 *
 * So the rule this file pins is structural, because a screenshot cannot see an absent class and
 * none of these screens mounts without a database:
 *
 *   1. **Every admin page renders the app's one container.** For a product page that is
 *      `StageColumn` (`components/assessment-flow/stage-column.tsx`), the container the rest of the
 *      app already uses (`components/console/overview.tsx`, the dashboard, the profile, the flow).
 *      For an operator page it is `OperatorFrame` (`components/operator/frame.tsx`) — the same
 *      element, owned by the operator surface, because the operator seam
 *      (`tests/operator-seam.test.ts`, `docs/specs/operator-separation-adr.md` §4) forbids an
 *      operator file importing the product flow's component. The split is derived, never guessed:
 *      `lib/operator/routes.ts::OPERATOR_PAGE_FILES` names the operator pages, and the list of
 *      pages below is derived from the directory, so a thirty-third admin page inherits the rule
 *      instead of the exemption.
 *   2. **Nothing under the admin views centres a column of its own** — no `mx-auto` beside the
 *      shared column, and no `container mx-auto` reintroducing one at the view root.
 *   3. **The two containers are one geometry** — `StageColumn` and `OperatorFrame` render
 *      **identical markup** for the same child, which is what makes (2) a measurable rule rather
 *      than a preference: the operator copy buys an import boundary, never a second width.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageColumn } from "@/components/assessment-flow/stage-column";
import { OperatorFrame } from "@/components/operator/frame";
import { OPERATOR_PAGE_FILES } from "@/lib/operator/routes";

const ADMIN_ROOT = "app/(mainlayout)/admin";

/** Every `page.tsx` under the admin subtree, derived — never a list to keep in step by hand. */
function adminPages(dir = ADMIN_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...adminPages(path));
    else if (entry.name === "page.tsx") found.push(path);
  }
  return found.sort();
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** The file's code without its comments: a docstring that *describes* a centred column is prose. */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** The modules the admin pages render that used to draw a column of their own. */
function adminViews(dir = "components"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "ui") continue;
      found.push(...adminViews(path));
    } else if (entry.name.endsWith(".tsx") && isAdminView(path)) found.push(path);
  }
  return found.sort();
}

/**
 * The admin console's own modules: `components/admin/**`, `components/console/**` and the six
 * `components/v1/admin-*.tsx` screens the console was moved out of the prototype with (#478).
 * Scoped on purpose — `components/ui/**` is primitives and `components/v1/**` otherwise is the
 * retired prototype, which has its own shell.
 */
function isAdminView(path: string): boolean {
  return (
    path.startsWith("components/admin/") ||
    path.startsWith("components/console/") ||
    /^components\/v1\/admin-[^/]+\.tsx$/.test(path)
  );
}

/**
 * The admin pages that render **no container at all** because they render nothing: a door that
 * gates and answers `redirect()`. Named rather than derived, because the derived rule below is
 * exactly right for a screen and cannot express a page that does not draw one — and it carries a
 * positive assertion, so the exemption can never hide a page that quietly stopped rendering.
 *
 * One today: `/admin/spec/ui-v2` (2026-11-26) — the rail's `UI Specs v2` row, a 307 to the v2
 * draft pages on another origin.
 */
const REDIRECT_DOORS = ["app/(mainlayout)/admin/spec/ui-v2/page.tsx"];

describe("the admin console's shared column", () => {
  it("exists — thirty-four pages today, and every one of them is a page module", () => {
    // Eighteen from #717's wave, plus the documentation hub and one document (#892), plus the
    // growth console (#920) and the brand and audience profile (#906), plus the features index and
    // the release shelf (#893), plus the CRUD & Permissions matrix (#1126), plus the transactional-
    // mail register and one template's editor (#1138), plus #1252's three spec routes (Overview,
    // Validation, one group's page), plus the update ledger (the owner ask of 2026-11-21), plus the
    // read-only landing (#1374), plus the v2 drafts door (2026-11-26) and the integration directory
    // (#1443). The count is a floor on the
    // walk, not a list: the two cases below derive the pages and hold each one to the rule, so a
    // thirty-fifth page inherits it.
    const pages = adminPages();
    expect(pages.length).toBe(34);
  });

  it("is what every admin page renders inside — the product's container or the operator's, by surface", () => {
    const pages = adminPages();
    for (const path of pages) {
      const file = code(path);
      // A redirect door renders no screen, so it owes no column — and it must really redirect.
      if (REDIRECT_DOORS.includes(path)) {
        expect(file, `${path} is exempt as a redirect door but does not redirect`).toContain(
          "redirect(",
        );
        continue;
      }
      const operator = OPERATOR_PAGE_FILES.includes(path);
      const column = operator ? "OperatorFrame" : "StageColumn";
      const specifier = operator ? "@/components/operator/frame" : "stage-column";
      expect(file, `${path} imports the shared column`).toContain(specifier);
      expect(file, `${path} renders the shared column`).toContain(`<${column}>`);
      expect(file, `${path} closes the shared column`).toContain(`</${column}>`);
    }
    // The exemption list is not a hiding place: every name in it is a page this walk found.
    for (const page of REDIRECT_DOORS) {
      expect(pages, `${page} is exempted but is not an admin page`).toContain(page);
    }
    // The operator list is a subset of the directory walk, never a parallel list: a page named
    // there that this walk cannot find is a seam that guards nothing.
    for (const page of OPERATOR_PAGE_FILES) {
      expect(pages, `${page} is named as an operator page but is not an admin page`).toContain(
        page,
      );
    }
  });

  it("leaves no admin page centring a column of its own", () => {
    for (const path of adminPages()) {
      expect(code(path), `${path} must not centre its column`).not.toContain("mx-auto");
    }
  });

  it("leaves no admin view drawing a second column beside it", () => {
    const views = adminViews();
    // The census: the folder that carries the rule is not silently empty.
    expect(views.length).toBeGreaterThan(10);
    for (const path of views) {
      const file = code(path);
      expect(file, `${path} must not centre a column of its own`).not.toContain("mx-auto");
      // Tailwind's `container` utility is the other way a view spelled its own page width.
      expect(file, `${path} must not reintroduce a container`).not.toMatch(
        /className="container\b/,
      );
    }
  });
});

describe("the column itself", () => {
  it("is one max width with the left edge where main put it — never centred", () => {
    const html = renderToStaticMarkup(createElement(StageColumn, null, "band"));
    expect(html).toContain("max-w-[1126px]");
    expect(html).toContain("w-full");
    expect(html).not.toContain("mx-auto");
  });

  it("is the same geometry on the operator side — the copy buys an import, never a second width", () => {
    // Identical markup for the same child. A change to either width fails here, so the operator
    // surface cannot drift into a column of its own while the seam test stays green.
    expect(renderToStaticMarkup(createElement(OperatorFrame, null, "band"))).toBe(
      renderToStaticMarkup(createElement(StageColumn, null, "band")),
    );
  });
});
