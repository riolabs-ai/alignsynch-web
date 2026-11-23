/**
 * `/admin/start`'s render (#1374) — the half the pure fold cannot see.
 *
 * `tests/admin-start-figures.test.ts` proves the arithmetic; this file proves the screen: four tiles
 * carrying the numbers it was handed, a door per tile, the directory of surfaces, and the two states
 * the page must never confuse — "the store answered and nothing is open" and "the store did not
 * answer". Everything is decided on the server, so `renderToStaticMarkup` is the whole page.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AdminStartView } from "@/components/admin/start/start-view";
import { ADMIN_START_SURFACES } from "@/data/admin/start-surfaces";
import { adminStartPageCopy } from "@/data/pages/admin-start";
import type { StartFigures } from "@/lib/admin/start";

const FIGURES: StartFigures = {
  inboxMessages: 12,
  inboxSeats: 2,
  reviewArtifacts: 3,
  reviewOpenTodos: 7,
  reviewOpenIssues: 4,
  sessions: 41,
  auditRows: 50,
};

function render(
  figures: StartFigures | null,
  unreadable: string | null,
  surfaces = ADMIN_START_SURFACES,
) {
  return renderToStaticMarkup(
    createElement(AdminStartView, {
      copy: adminStartPageCopy,
      figures,
      unreadable,
      surfaces,
    }),
  );
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("/admin/start, rendered", () => {
  it("draws the page's own heading and one tile per figure, each a door into its shelf", () => {
    const html = render(FIGURES, null);
    expect(html).toContain(adminStartPageCopy.heading);
    // The four numbers are the fold's, printed as they were handed in — a zero would be a different
    // screen, and the cases below prove that one says so in words.
    for (const value of ["12", "7", "41", "50"]) expect(html).toContain(`>${value}</span>`);
    const hrefs = hrefsOf(html);
    expect(hrefs).toEqual(
      expect.arrayContaining(["/admin/inbox", "/admin/review", "/admin/instances", "/admin/audit"]),
    );
  });

  it("lists every registered surface, so a count above can be checked", () => {
    // `&` in a fixture title is printed as `&amp;` in markup — the row's words, not an escape bug.
    const html = render(FIGURES, null).replaceAll("&amp;", "&");
    for (const surface of ADMIN_START_SURFACES) {
      expect(hrefsOf(html), surface.id).toContain(surface.href);
      expect(html, surface.id).toContain(surface.title);
    }
  });

  it("replaces the tiles with the reason when a shelf could not be read", () => {
    const html = render(null, "connect ECONNREFUSED");
    // The panel, the database's own words, and no invented figures.
    expect(html).toContain("The figures could not be read");
    expect(html).toContain("connect ECONNREFUSED");
    expect(html).not.toContain(">41</span>");
    // The directory is a route list, not a query, so it still renders.
    expect(hrefsOf(html)).toContain("/admin/audit");
  });

  it("gives an empty directory a bordered block and one action (E40 rule 7)", () => {
    const html = render(FIGURES, null, []);
    expect(html).toContain("No surface is registered");
    expect(html).toContain("border-dashed");
    expect(hrefsOf(html)).toContain("/admin/console");
  });
});
