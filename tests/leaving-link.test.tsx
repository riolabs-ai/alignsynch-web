/**
 * A rail that leaves the app says so — the rendered half of E39 (issue #5xx).
 *
 * `scripts/leaving-links.ts` reads the tree statically and `scripts/brand-lint` reads class
 * strings; neither can see what a component *renders*, and the rail's rows take their `href` as
 * a prop, so the static rule cannot see the literal at the call site either. This file renders
 * the two shared surfaces and reads the markup:
 *
 *   - every public destination carries `target="_blank"` and both rel tokens, and its accessible
 *     name ends "opens in a new tab" (the announcement the rule requires);
 *   - every in-app destination carries **neither**, because in-app navigation stays in the tab —
 *     the rule is about leaving, and a row that opens a second tab onto a page already in the app
 *     is friction of exactly the kind the card exists to remove;
 *   - a row the **document** marks `leaving` is a departure even though its href is internal
 *     (2026-11-26): the v2 draft pages are another origin with no route in this tree, so the rail
 *     reaches them through `/admin/spec/ui-v2`, and the href alone cannot say the click leaves.
 *     `leavesApp()` only knows the marketing routes, so the document's flag is the second
 *     declaration of a departure and this file holds both to the same markup;
 *   - the footer's behaviour is the mount's decision: the same component leaves from the
 *     dashboard and stays in the tab on the marketing routes it renders into.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { Footer } from "@/components/layout/footer";
import { AppNav } from "@/components/layout/nav-menus";
import type { BrandId } from "@/data/brand";
import { shellPageCopy } from "@/data/pages/shell";
import { leavesApp } from "@/lib/marketing-routes";
import { type NavViewer, PLATFORM_VIEWER, navViewer } from "@/lib/nav";
import { allItems } from "@/lib/nav-menu";

/**
 * The destinations the rail's own document marks `leaving` — the second way a row says its click
 * leaves the app, because an off-origin door has an internal href (`/admin/spec/ui-v2`, the v2
 * draft pages) and `leavesApp()` cannot see that.
 */
const DOCUMENT_DEPARTURES = new Set(
  allItems()
    .filter((item) => item.leaving === true)
    .map((item) => item.href),
);

/** Every anchor in a rendered tree: its href, its target, its rel and its accessible name. */
function anchorsOf(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>/g)].map((match) => {
    const attributes = match[1] ?? "";
    const read = (name: string) =>
      new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1] ?? undefined;
    return {
      href: read("href") ?? "",
      target: read("target"),
      rel: read("rel"),
      label: read("aria-label"),
    };
  });
}

function navHtml(brandId: BrandId, viewer: NavViewer = PLATFORM_VIEWER): string {
  return renderToStaticMarkup(
    createElement(AppNav, {
      brandId,
      viewer,
      copy: shellPageCopy,
      collapsed: false,
      labelled: true,
      pathname: "/dashboard",
      onNavigate: () => {},
    }),
  );
}

describe("the rail", () => {
  for (const brandId of ["quizhub", "alignsynch"] as const) {
    describe(brandId, () => {
      const anchors = anchorsOf(navHtml(brandId));

      it("opens every public destination in a new tab, announced", () => {
        const leaving = anchors.filter((anchor) => leavesApp(anchor.href));
        for (const anchor of leaving) {
          expect(anchor.target, `${anchor.href} target`).toBe("_blank");
          expect(anchor.rel, `${anchor.href} rel`).toBe("noopener noreferrer");
          expect(anchor.label, `${anchor.href} name`).toMatch(/opens in a new tab$/);
        }
      });

      /**
       * The guard on the rule above, per brand.
       *
       * The quiz rail still carries public rows (`/`, `/pricing`, `/support`), so the marking rule
       * is exercised on something. The alignment rail carries **none** since #542 phase 1 moved
       * Support, Help and the library to `/dashboard/*` and the catalogue's `#templates` anchor to
       * `/templates/relationship` — so an empty list is that brand's claim, not a missing row.
       */
      it("draws the public rows this brand has, and no others", () => {
        const leaving = anchors.filter((anchor) => leavesApp(anchor.href));
        if (brandId === "quizhub") expect(leaving.length).toBeGreaterThan(0);
        else expect(leaving).toEqual([]);
      });

      /**
       * 2026-11-26 — the departure whose href is an internal door.
       *
       * `UI Specs v2` points at `/admin/spec/ui-v2`, and that route redirects to the v2 draft
       * pages on another origin. `leavesApp()` is right to call the href in-app (there *is* a page
       * in this tree); the document's `leaving` is what says the page then sends the reader away.
       * Both brands are checked, and the alignment rail is the one with a row to check.
       */
      it("opens the document's own departures in a new tab, announced", () => {
        // The alignment rail draws its staff rows for a staff viewer, so this case renders the
        // surface an operator actually gets rather than the member menu the describe's viewer sees.
        const drawn =
          brandId === "alignsynch" ? anchorsOf(navHtml(brandId, navViewer("admin"))) : anchors;
        const marked = drawn.filter((anchor) => DOCUMENT_DEPARTURES.has(anchor.href));
        if (brandId === "alignsynch") {
          expect(marked.map((anchor) => anchor.href)).toEqual([...DOCUMENT_DEPARTURES]);
        }
        for (const anchor of marked) {
          expect(anchor.target, `${anchor.href} target`).toBe("_blank");
          expect(anchor.rel, `${anchor.href} rel`).toBe("noopener noreferrer");
          expect(anchor.label, `${anchor.href} name`).toMatch(/opens in a new tab$/);
        }
      });

      it("keeps every in-app destination in this tab", () => {
        const inside = anchors.filter(
          (anchor) =>
            anchor.href.startsWith("/") &&
            !leavesApp(anchor.href) &&
            // A door the document marks `leaving` looks in-app by its href and is not: it redirects
            // off-origin, and the case above holds it to the departure's markup.
            !DOCUMENT_DEPARTURES.has(anchor.href),
        );
        expect(inside.length).toBeGreaterThan(0);
        for (const anchor of inside) {
          expect(anchor.target, `${anchor.href} must not open a new tab`).toBeUndefined();
          expect(anchor.rel, `${anchor.href} must not carry rel`).toBeUndefined();
        }
      });
    });
  }
});

describe("the footer", () => {
  const footerHtml = (leaving: boolean) =>
    renderToStaticMarkup(createElement(Footer, { copy: shellPageCopy, hiddenNav: [], leaving }));

  it("leaves from a dashboard mount", () => {
    const leaving = anchorsOf(footerHtml(true)).filter((anchor) => leavesApp(anchor.href));
    expect(leaving.length).toBeGreaterThan(0);
    for (const anchor of leaving) {
      expect(anchor.target, `${anchor.href} target`).toBe("_blank");
      expect(anchor.rel, `${anchor.href} rel`).toBe("noopener noreferrer");
      expect(anchor.label, `${anchor.href} name`).toMatch(/opens in a new tab$/);
    }
  });

  it("stays in the tab on a marketing mount — the public site is not leaving itself", () => {
    for (const anchor of anchorsOf(footerHtml(false))) {
      expect(anchor.target, `${anchor.href} must not open a new tab`).toBeUndefined();
    }
  });

  it("draws the same in-app rows either way", () => {
    const inside = (html: string) =>
      anchorsOf(html)
        .filter((anchor) => anchor.href.startsWith("/") && !leavesApp(anchor.href))
        .map((anchor) => anchor.href);
    expect(inside(footerHtml(true))).toEqual(inside(footerHtml(false)));
  });
});
