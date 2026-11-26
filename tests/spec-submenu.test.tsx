/**
 * The Project Spec's submenu — and the row that left it (2026-11-26).
 *
 * `Docs — draft pages` was this column's last row: a `LeavingLink` to a different origin
 * (`https://alignsynch-v2-docs-preview.vercel.app/`), kept outside every group because it is not a
 * route of this surface. The owner moved it to the rail, where it is `UI Specs v2` in **Specs &
 * docs** (`data/nav-menu.json`, `leaving: true`), opening `/admin/spec/ui-v2`.
 *
 * **The move is the claim, so a deletion alone does not prove it.** Two things have to be true
 * together, and the second is what "just delete the row" would get wrong:
 *
 *   - this column carries **no** door to the drafts — not an anchor, not a label, not a second
 *     spelling under another group (one door, not two);
 *   - everything the column *does* carry is intact: every story renders, in the register's order,
 *     and the around-the-story group still closes it, so the removal disturbed no other row.
 *
 * The door itself is proven where it now lives: `tests/nav-menu.test.ts` for the rail row and the
 * departure's markup, `tests/admin-spec-ui-v2.test.ts` for the route that redirects.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpecSubmenu, type SpecCurrent } from "@/components/admin/spec/spec-submenu";
import { SPEC_STORY_GROUPS } from "@/content/spec";
import { ADMIN_SPEC_DOCS_URL, adminSpecPageCopy } from "@/data/pages/admin-spec";
import { readSpecValidation } from "@/lib/spec/file";

const copy = adminSpecPageCopy;
const overview: SpecCurrent = { kind: "overview" };

/** The submenu as one surface renders it — the same call the frame makes. */
function submenu(surface: "column" | "sheet"): string {
  return renderToStaticMarkup(
    createElement(SpecSubmenu, { copy, doc: readSpecValidation(), current: overview, surface }),
  );
}

describe.each(["column", "sheet"] as const)("the submenu — %s surface", (surface) => {
  it("carries no door to the v2 draft pages any more", () => {
    const markup = submenu(surface);
    const host = new URL(ADMIN_SPEC_DOCS_URL).host;
    // The origin, in any spelling the markup could carry it: an href, a title, a bare word.
    expect(markup).not.toContain(host);
    expect(markup).not.toContain(ADMIN_SPEC_DOCS_URL);
    // The word that row printed is gone from the fixture too, so nothing can bring it back by
    // reading the old id — a row removed from the markup but kept in copy is a door with no lock.
    expect(copy.items?.find((item) => item.id === "rail-docs")).toBeUndefined();
    // And no anchor in this column leaves the tab it is rendered in.
    expect(markup).not.toContain('target="_blank"');
  });

  it("still draws every story, in the register's order, closed by the around-the-story group", () => {
    const markup = submenu(surface);
    expect(markup).toContain(`data-spec-submenu="${surface}"`);

    const order = [...markup.matchAll(/data-spec-story="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(SPEC_STORY_GROUPS.map((story) => story.slug));

    // The last of the register's rows is still the last of the column: the group headings read
    // Overview → Validation → Story → Around the Story, and the surface ends on its final row —
    // nothing follows the last anchor but the closing tag, which is what the departed block was.
    const around = copy.items?.find((item) => item.id === "rail-around");
    expect(around, "the fixture carries no `rail-around` label").toBeDefined();
    expect(markup).toContain(around?.label ?? "");
    const afterLastAnchor = markup.slice(markup.lastIndexOf("</a>") + "</a>".length);
    expect(afterLastAnchor).not.toMatch(/<a\b/);
    expect(afterLastAnchor).not.toMatch(/target="_blank"/);
    expect(afterLastAnchor).toContain("</nav>");
  });
});
