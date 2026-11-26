/**
 * `/admin/spec/ui-v2` — the internal door to the v2 draft pages (2026-11-26).
 *
 * The rail's `UI Specs v2` row cannot hold `ADMIN_SPEC_DOCS_URL`: a rail row's href must resolve
 * against `content/routes.ts` (`nav:menu --check`, E10) and the route must exist in the tree, which
 * `data:check` E43 reconciles. So the row points here and this route redirects — and the four
 * things that makes honest are each invisible in a diff:
 *
 *   1. the address **is** a route (static, beside `/admin/spec/[group]`), so the href resolves and
 *      the redirect is not a 404 dressed as a door;
 *   2. the destination is the fixture's constant, **never a literal** — one spelling of that URL in
 *      the repository, in `data/pages/admin-spec.ts`;
 *   3. the gates are `/admin/spec`'s, in its order, so a seat the row is not drawn for is refused a
 *      line earlier than the redirect (the row's rung is `needs: "admin"`);
 *   4. the Project Spec's submenu no longer names it, so the move left one door and not two.
 *
 * The departure's *announcement* — the new tab, the marker, the "opens in a new tab" name — is the
 * rail row's, proven in `tests/nav-menu.test.ts`; this file is the hop itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { matchRoute } from "@/content/route-manifest";
import { routeManifest } from "@/content/routes";
import { ADMIN_SPEC_DOCS_URL } from "@/data/pages/admin-spec";
import { ADMIN_SPEC_UI_V2_PATH } from "@/lib/admin/spec-paths";

const REPO = process.cwd();

function source(path: string): string {
  return readFileSync(join(REPO, path), "utf8");
}

const page = source("app/(mainlayout)/admin/spec/ui-v2/page.tsx");

describe("the v2 drafts door", () => {
  it("is an address the route manifest resolves — and one the page tree answers", () => {
    expect(ADMIN_SPEC_UI_V2_PATH).toBe("/admin/spec/ui-v2");
    const route = matchRoute(routeManifest, ADMIN_SPEC_UI_V2_PATH);
    expect(route, `${ADMIN_SPEC_UI_V2_PATH} resolves no route`).toBeDefined();
    expect(route?.kind).toBe("static");
    // A page file exists at the manifest's spelling, which is what E43 walks.
    expect(page).toContain("export default async function");
  });

  it("redirects to the fixture's constant, not to a spelling of its own", () => {
    expect(page).toContain('import { ADMIN_SPEC_DOCS_URL } from "@/data/pages/admin-spec"');
    expect(page).toContain("redirect(ADMIN_SPEC_DOCS_URL)");
    // The host appears nowhere: a second spelling is how the preview moves in one place and not
    // the other. (The import above is the only way this file names the destination.)
    expect(page).not.toContain(new URL(ADMIN_SPEC_DOCS_URL).host);
    expect(page).not.toContain("https://");
  });

  it("gates in the spec's order, with the row's own rung last", () => {
    const product = page.indexOf("requireAdminProduct()");
    const operator = page.indexOf("requireOperator()");
    const admin = page.indexOf("requireAdmin({ next: ADMIN_SPEC_UI_V2_PATH })");
    expect(product).toBeGreaterThan(-1);
    expect(operator).toBeGreaterThan(product);
    expect(admin).toBeGreaterThan(operator);
    // …and the redirect comes after every gate, so a refusal is never raced by a hop off-site.
    expect(page.indexOf("redirect(ADMIN_SPEC_DOCS_URL)")).toBeGreaterThan(admin);
  });

  it("leaves one door, not two — the Project Spec submenu no longer names it", () => {
    const submenu = source("components/admin/spec/spec-submenu.tsx");
    // Not the words in its prose (the docstring explains where the row went): the *import* and the
    // *control*. A component that no longer reads the constant and renders no `LeavingLink` cannot
    // draw the door, whatever its comments say.
    expect(submenu).not.toContain('from "@/data/pages/admin-spec"');
    expect(submenu).not.toContain("<LeavingLink");
    expect(submenu).not.toContain("rail-docs");
  });
});
