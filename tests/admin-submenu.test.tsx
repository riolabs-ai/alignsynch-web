/**
 * The shared admin submenu — the row, its derivation, and the two pages that carry it.
 *
 * Three claims, because the card that asked for this row made three and only one of them is a
 * rendering:
 *
 *   1. **every pill resolves.** The fixture spells its addresses as literals (it is a `data/` row,
 *      which E10 does not read the way it reads a JSX `href`), so this file resolves each one
 *      against `content/routes.ts`'s manifest. A pill no page answers is red here rather than a
 *      404 in an operator's hand.
 *   2. **the current pill follows the path.** `adminSubmenuCurrent` is a pure function of a string
 *      — the derivation both pages hand in, instead of a `usePathname` that would make a row of
 *      links a client component. Start marks Start, console marks Console, a query string selects
 *      a state rather than a route, and a path that names no row marks nothing at all.
 *   3. **both routes render it, with the right pill current.** `/admin/start` is driven through
 *      its real page module with its four reads stubbed (the same shape `admin-start-page.test.tsx`
 *      uses); `/admin/console` is driven through its page with the overview's client component
 *      stubbed, because what this file is asserting is the row above it and not the store's
 *      arithmetic.
 *
 * It also holds the labels equal to the names those pages print: `Start here` is
 * `data/pages/admin-start.ts`'s heading, and the other four are the titles
 * `data/admin/start-surfaces.ts` gives the same screens. Two fixtures describing one screen's name
 * is how a pill ends up calling a page something the page no longer says.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    require("react").createElement("a", { href, ...rest }, children as unknown),
}));

const requireAdminProduct = vi.fn(() => undefined);
vi.mock("@/lib/brand-boundary", () => ({ requireAdminProduct: () => requireAdminProduct() }));
vi.mock("@/components/v1/admin-console-overview", () => ({
  AdminConsoleOverview: () => require("react").createElement("div", { "data-console": "" }),
}));

const requireAdmin = vi.fn(async (_options?: unknown) => ({ user: { userId: "user-admin" } }));
vi.mock("@/lib/auth/require-role", () => ({
  requireAdmin: (options: unknown) => requireAdmin(options),
}));
vi.mock("@/lib/db/admin-inbox", () => ({
  readInbox: vi.fn(async () => ({ messages: [], seats: [], hidden: 0 })),
}));
vi.mock("@/lib/db/review-artifacts", () => ({ listReviewArtifacts: vi.fn(async () => []) }));
vi.mock("@/lib/db/admin-sessions", () => ({ listAdminSessions: vi.fn(async () => []) }));
vi.mock("@/lib/db/admin-audit", () => ({ readAuditLog: vi.fn(async () => []) }));

import AdminConsolePage from "@/app/(mainlayout)/admin/console/page";
import AdminStartPage from "@/app/(mainlayout)/admin/start/page";
import { AdminSubmenu } from "@/components/admin/submenu/admin-submenu";
import { ADMIN_START_SURFACES } from "@/data/admin/start-surfaces";
import { ADMIN_SUBMENU_LINKS, adminSubmenuCurrent } from "@/data/admin/submenu";
import { adminStartPageCopy } from "@/data/pages/admin-start";
import { ROUTE_PATTERNS } from "@/content/routes";
import { ADMIN_CONSOLE_PATH, ADMIN_START_PATH } from "@/lib/admin/paths";

/** Every `<a …>` open tag in a rendered string, so "which one is current" is answerable. */
function anchors(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
}

/** The one anchor carrying `aria-current="page"` — asserting there is exactly one is the point. */
function currentAnchor(html: string): string {
  const current = anchors(html).filter((anchor) => anchor.includes('aria-current="page"'));
  expect(current).toHaveLength(1);
  const [anchor] = current;
  if (!anchor) throw new Error("no current pill");
  return anchor;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the submenu's rows", () => {
  it("resolves every href against the route manifest", () => {
    for (const link of ADMIN_SUBMENU_LINKS) {
      const resolves = ROUTE_PATTERNS.some(
        (pattern) =>
          pattern === link.href ||
          (pattern.includes("[") &&
            new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(link.href)),
      );
      expect(resolves, `${link.id} → ${link.href} is not a route`).toBe(true);
    }
  });

  it("names each page the way that page names itself", () => {
    const titles = new Map(ADMIN_START_SURFACES.map((surface) => [surface.id, surface.title]));
    for (const link of ADMIN_SUBMENU_LINKS) {
      if (link.id === "start") {
        expect(link.label).toBe(adminStartPageCopy.heading);
        continue;
      }
      expect(link.label, `${link.id}'s pill disagrees with the landing's directory`).toBe(
        titles.get(link.id),
      );
    }
  });

  it("covers both pages the card exists for, and no duplicate address", () => {
    const hrefs = ADMIN_SUBMENU_LINKS.map((link) => link.href);
    expect(hrefs).toContain(ADMIN_START_PATH);
    expect(hrefs).toContain(ADMIN_CONSOLE_PATH);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("adminSubmenuCurrent", () => {
  it("derives the row from the path each page hands in", () => {
    expect(adminSubmenuCurrent(ADMIN_START_PATH)?.id).toBe("start");
    expect(adminSubmenuCurrent(ADMIN_CONSOLE_PATH)?.id).toBe("console");
  });

  it("treats a query string as a state of the route, not another route", () => {
    expect(adminSubmenuCurrent(`${ADMIN_CONSOLE_PATH}?view=latest`)?.id).toBe("console");
    expect(adminSubmenuCurrent("/admin/instances?stage=aligned")?.id).toBe("instances");
  });

  it("answers null rather than guessing for a path that names no row", () => {
    expect(adminSubmenuCurrent("/admin/review")).toBeNull();
    expect(adminSubmenuCurrent("/")).toBeNull();
  });
});

describe("<AdminSubmenu />", () => {
  it("draws a nav of links, never a tab set", () => {
    const html = renderToStaticMarkup(<AdminSubmenu pathname={ADMIN_START_PATH} />);
    expect(html).toContain('aria-label="Admin sections"');
    expect(html).toContain(`data-admin-submenu="start"`);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(anchors(html)).toHaveLength(ADMIN_SUBMENU_LINKS.length);
  });

  it("marks the row its path names, and only that row", () => {
    expect(
      currentAnchor(renderToStaticMarkup(<AdminSubmenu pathname={ADMIN_START_PATH} />)),
    ).toContain(`href="${ADMIN_START_PATH}"`);
    expect(
      currentAnchor(renderToStaticMarkup(<AdminSubmenu pathname={ADMIN_CONSOLE_PATH} />)),
    ).toContain(`href="${ADMIN_CONSOLE_PATH}"`);
  });

  it("renders every pill idle when the path names no row", () => {
    const html = renderToStaticMarkup(<AdminSubmenu pathname="/admin/review" />);
    expect(html).toContain('data-admin-submenu="none"');
    expect(html).not.toContain('aria-current="page"');
  });
});

describe("both routes carry it", () => {
  it("/admin/start renders the row with Start current", async () => {
    const html = renderToStaticMarkup(await AdminStartPage());
    expect(html).toContain('data-admin-submenu="start"');
    expect(currentAnchor(html)).toContain(`href="${ADMIN_START_PATH}"`);
    // Still the landing behind the row: the four reads ran and the page rendered.
    expect(requireAdmin).toHaveBeenCalledWith({ next: ADMIN_START_PATH });
    expect(html).toContain(adminStartPageCopy.heading);
  });

  it("/admin/console renders the row with Console current", () => {
    const html = renderToStaticMarkup(<AdminConsolePage />);
    expect(requireAdminProduct).toHaveBeenCalled();
    expect(html).toContain('data-admin-submenu="console"');
    expect(currentAnchor(html)).toContain(`href="${ADMIN_CONSOLE_PATH}"`);
    // The overview is still there, below the row.
    expect(html).toContain('data-console=""');
  });
});
