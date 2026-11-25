/**
 * The rail's menu is data, and the data is a role-constrained ladder (#542 phase 2).
 *
 * The defect this file exists for, measured on `main`: `/admin/console` had **no row anywhere in
 * the UI** — the operator's five destinations were a separately gated block of JSX, and the hub
 * every one of them hangs off was in neither list. An admin could reach their own console only by
 * typing the URL.
 *
 * So the assertions are about the *descriptor* first (`lib/nav-menu.ts` — pure, no React) and about
 * the rendered rail second:
 *
 *   1. every row names a real fixture label and a real route: a row is not a string nobody checks;
 *   2. the five sections read Start · Operations · Content & configuration · Specs & docs ·
 *      Member, no `/admin` destination sits in Member, and the two rows #929 had parked inside the
 *      member's Support group (`/admin/review`, `/admin/health`) are drawn in Operations;
 *   3. the four rungs produce four different menus, each one the whole document **in the
 *      document's order** with the rows that seat cannot reach removed — `needs` gates
 *      visibility, never the sequence (#929);
 *   4. the rendered rail agrees with `menuFor`, because a descriptor nothing renders is a document.
 *
 * **Membership is not authorisation**, and this file does not pretend otherwise: every `/admin/*`
 * page refuses a member with `notFound()` (`lib/auth/require-role.ts`), and every audited write
 * re-asks its floor inside the transaction (`lib/admin/act.ts`). What is proven here is that the
 * rail does not *advertise* a surface the reader would be refused — a row pointing at a 404 is a
 * row that tells a stranger the surface exists.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import { AppNav } from "@/components/layout/nav-menus";
import {
  NAV_DOCUMENT_VERSION,
  NAV_ICON_NAMES,
  zNavDocument,
  type NavRowRecord,
} from "@/content/nav";
import { matchRoute } from "@/content/route-manifest";
import { routeManifest } from "@/content/routes";
import navDocument from "@/data/nav-menu.json";
import { shellPageCopy } from "@/data/pages/shell";
import { navViewer } from "@/lib/nav";
import { ALIGN_MENU, allItems, menuFor } from "@/lib/nav-menu";
import { itemLabel, sectionOf } from "@/lib/page-copy";
import { USER_ROLES, roleAdmits, type UserRole } from "@/content/role-ladder";

/** Every `href` in a rendered tree, in document order. */
function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

/** The alignment rail's markup for one role — the same mount the shell uses. */
function railHtml(role: UserRole | null): string {
  return renderToStaticMarkup(
    createElement(AppNav, {
      brandId: "alignsynch",
      viewer: navViewer(role),
      copy: shellPageCopy,
      collapsed: false,
      pathname: "/dashboard",
      onNavigate: () => undefined,
    }),
  );
}

/** The rail's destinations for one role. */
function railHrefs(role: UserRole | null): string[] {
  return hrefsOf(railHtml(role));
}

/** The aligned menu's rows for one role, flattened. */
function hrefsFor(role: UserRole | null): string[] {
  return menuFor(role).flatMap((group) => group.items.map((item) => item.href));
}

/** Every href the document accounts for as a surface the rail does not draw. */
function unlistedHrefs(): string[] {
  const document = navDocument as unknown as { unlisted?: { href: string }[] };
  return (document.unlisted ?? []).map((entry) => entry.href);
}

/**
 * The five sections of the 2026-11-23 rail, in the document's order — one constant per section,
 * because several cases assert the same rows and a second copy is how a menu edit lands in one
 * expectation and not the others.
 *
 * `Start` (the admin landing, surfaced by this change), `Operations` (the six surfaces one operator
 * uses together), `Content & configuration` (a change to a setting), `Specs & docs` (the spec and the
 * docs tree as one family) and `Member` (the reader's own work plus the help pair — the old
 * `group-app` and `group-support`, folded into one section because both are the member's).
 */
const START = ["/admin/start"];

const OPERATIONS = [
  "/admin/console",
  "/admin/instances",
  "/admin/gaps",
  "/admin/inbox",
  // #665 — the review shelf, moved out of the member's Support group by this change.
  "/admin/review",
  // …and platform health beside it.
  "/admin/health",
];

const CONTENT = [
  "/admin/billing",
  "/admin/broadcast",
  // #1138 — the transactional-mail override editor: what the product writes to a person.
  "/admin/email-templates",
  // #1126 — the CRUD & Permissions matrix: which role may do what.
  "/admin/permissions",
  "/admin/audit",
  // #906 — the brand and audience profile, surfaced by this change.
  "/admin/brand",
];

const SPECS = [
  // #1252 — the project spec, first of its family.
  "/admin/spec",
  "/admin/docs",
  "/admin/spec/validation",
  "/admin/docs/updates",
  "/admin/docs/releases",
];

/**
 * The member's six rows: the four Workspace rows every rung shares (#620, #877, #1129, #1131) and
 * the help/contact pair the old Support group carried.
 */
const MEMBER = [
  "/dashboard",
  "/dashboard/relationships",
  "/dashboard/templates",
  "/dashboard/chat",
  "/dashboard/help",
  "/dashboard/support",
];

const EVERY_SECTION = [...START, ...OPERATIONS, ...CONTENT, ...SPECS, ...MEMBER];

const SECTION_IDS = [
  "group-start",
  "group-operations",
  "group-content",
  "group-specs",
  "group-member",
];

describe("the menu descriptor", () => {
  it("names a fixture label that exists — the words are the shell's, not the rail's", () => {
    const nav = sectionOf(shellPageCopy, "nav-alignsynch");
    const ids = new Set(nav.items?.map((item) => item.id) ?? []);
    for (const group of ALIGN_MENU) {
      // Throws on a missing id, which is the failure mode this case is for. A **title-less** group
      // declares no label id at all (the project-spec group above the Admin heading), and the
      // absence is the statement — so the check is on a label the group actually carries.
      if (group.label !== undefined) expect(itemLabel(nav, group.label)).toBeTruthy();
      for (const item of group.items) {
        expect(ids.has(item.id), `${item.href} names id "${item.id}"`).toBe(true);
        expect(itemLabel(nav, item.id)).toBeTruthy();
      }
    }
  });

  it("points every row at a route the router resolves", () => {
    for (const item of allItems()) {
      expect(matchRoute(routeManifest, item.href), `${item.href} is not a route`).toBeDefined();
    }
  });

  it("draws no section twice — one row per destination", () => {
    const hrefs = allItems().map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /**
   * 2026-11-23 — **the rail opens on Start**, the admin landing, in a section of its own.
   *
   * It was `unlisted` until this change: the landing had one door (the account menu) and the ruling
   * was that a second would be a duplicate control. The rail's job is to name destinations, and the
   * landing an operator opens on is the first of them — so the account-menu door stays and this is
   * the second door, which is the one place that reasoning was wrong rather than the ruling.
   *
   * The section is one row and **carries a heading**, unlike the one-row group it replaces: a
   * section of the taxonomy names itself, and "Start" over a row reading "Dashboard" (#1382, it read
   * "Admin start" when the section was drawn) is a heading doing work (the old row's own word was
   * the heading, which is why it had none).
   */
  it("opens the rail on Start, in a titled one-row section", () => {
    expect(ALIGN_MENU[0]?.id).toBe("group-start");
    expect(ALIGN_MENU[0]?.label).toBe("group-start");
    expect(ALIGN_MENU[0]?.items.map((item) => item.href)).toEqual(["/admin/start"]);
    // …and Operations follows it, so the landing is above the operator's surfaces and nowhere else.
    expect(ALIGN_MENU[1]?.id).toBe("group-operations");
    // One row, one href — the defect two rows pointing at a destination would be.
    const drawn = (navDocument as unknown as { groups: { items: { href: string }[] }[] }).groups
      .flatMap((group) => group.items)
      .filter((row) => row.href === "/admin/start");
    expect(drawn).toHaveLength(1);
    expect(allItems().filter((item) => item.href === "/admin/start")).toHaveLength(1);
    // It is no longer accounted for as `unlisted` — one statement, one door (nav:menu --check's rule).
    expect(unlistedHrefs()).not.toContain("/admin/start");
  });

  /**
   * 2026-11-23 — **Operations is the six surfaces one operator uses together**, which is what the
   * `group-admin` + `group-support` split had made non-adjacent (nav evaluation F2, F5). The inbox
   * leads for the rung that works it; the console hub stays beside the surfaces it opens; the audit
   * log sits in the *other* section now, because a log is configuration-adjacent, not an operation.
   *
   * #1095's growth row is still absent, and its absence is asserted below rather than left implied.
   */
  it("draws Operations as console, instances, gaps, inbox, review and health", () => {
    const operations = ALIGN_MENU.find((group) => group.id === "group-operations");
    expect(operations).toBeDefined();
    expect(operations?.items.map((item) => item.href)).toEqual([
      "/admin/console",
      "/admin/instances",
      "/admin/gaps",
      "/admin/inbox",
      "/admin/review",
      "/admin/health",
    ]);
    // The two rows that left the member's Support group are here, which is the whole point of the
    // move: `review` and `admin-health` were staff rows under a heading that named a member surface.
    expect(operations?.items.map((item) => item.id)).toContain("review");
    expect(operations?.items.map((item) => item.id)).toContain("admin-health");
  });

  /**
   * #1382 — **the two words the owner asked for**, resolved the way the sidebar resolves them
   * (`itemLabel` over `nav-alignsynch`): the operator's landing reads `Dashboard` (it read
   * `Admin start`) and the console hub reads `Admin Console` (it read `Console`). The ids, the
   * hrefs and the rungs of both rows are untouched, and the cases around this one still assert
   * them — this is presentation, not a move.
   *
   * The count is the point. The member's `/dashboard` row still says `Start`, so the rail carries
   * exactly one `Dashboard`; the collision the change creates is in the account menu, where the
   * same fixture id sits directly above the member's own `Dashboard` row (pinned by
   * `tests/account-menu-session.test.ts`).
   */
  it("names the operator's landing Dashboard and the console hub Admin Console (#1382)", () => {
    const nav = sectionOf(shellPageCopy, "nav-alignsynch");
    const words = ALIGN_MENU.flatMap((group) => group.items.map((item) => itemLabel(nav, item.id)));
    expect(itemLabel(nav, "admin-start")).toBe("Dashboard");
    expect(itemLabel(nav, "console")).toBe("Admin Console");
    expect(words.filter((word) => word === "Dashboard")).toHaveLength(1);
    expect(words.filter((word) => word === "Admin Console")).toHaveLength(1);
    expect(words).not.toContain("Admin start");
    expect(words).not.toContain("Console");
  });

  /**
   * #1095 — `/admin/growth` is **URL-only**. The owner's ruling kept the page and dropped the
   * menu row, because a screen charting a simulated business does not belong in an operator's
   * rail. The assertion is negative on purpose and sits where the positive one lived, so the
   * absence is proven at every rung instead of going unmentioned — and the route is asserted
   * present in the same case, because "off the rail" is not "out of the tree".
   */
  it("does not draw the growth model, and still resolves its URL", () => {
    expect(allItems().map((item) => item.href)).not.toContain("/admin/growth");
    expect(hrefsFor("admin")).not.toContain("/admin/growth");
    expect(hrefsFor("owner")).not.toContain("/admin/growth");
    expect(railHrefs("admin")).not.toContain("/admin/growth");
    expect(railHrefs("owner")).not.toContain("/admin/growth");
    // The page is untouched: the route still resolves, so the address is still the way in.
    expect(matchRoute(routeManifest, "/admin/growth")).toBeDefined();
  });

  /**
   * The invariant #929 stated as "two staff rows may live in Support" becomes simpler and stronger
   * after 2026-11-23: **a member section draws no `/admin` destination, and every `/admin`
   * destination sits in one of the four staff sections.** The old exception — the review shelf and
   * the health page inside `group-support` — was exactly what the reorganisation removed (nav
   * evaluation F2), so a `/admin` row reappearing under Member is now the failure the case is for.
   */
  it("keeps every /admin destination in a staff section and none under Member", () => {
    const STAFF_SECTIONS = ["group-start", "group-operations", "group-content", "group-specs"];
    const member = ALIGN_MENU.find((group) => group.id === "group-member");
    expect(member).toBeDefined();
    expect(
      (member?.items ?? []).map((item) => item.href).filter((href) => href.startsWith("/admin")),
    ).toEqual([]);

    for (const group of ALIGN_MENU) {
      if (STAFF_SECTIONS.includes(group.id)) continue;
      for (const item of group.items) {
        expect(item.href.startsWith("/admin"), `${item.href} sits outside the staff sections`).toBe(
          false,
        );
      }
    }
    // Every staff row, counted: 1 + 6 + 6 + 5 = 18 `/admin` rows, and none of them unaccounted for.
    expect(allItems().filter((item) => item.href.startsWith("/admin"))).toHaveLength(18);
  });

  /**
   * 2026-11-23 — the five surfaces this card moved **out of `unlisted` and into a section**, proved
   * from both halves of the document at once: each is a rail row, and each has left the `unlisted`
   * list (the validator refuses a destination that is in both, and a "surfaced" row that still says
   * it is hidden would be the drift nobody reads).
   */
  it("surfaces the five rows it names, and stops calling them unlisted", () => {
    const SURFACED = [
      "/admin/start",
      "/admin/brand",
      "/admin/spec/validation",
      "/admin/docs/updates",
      "/admin/docs/releases",
    ];
    const drawn = allItems().map((item) => item.href);
    for (const href of SURFACED) {
      expect(drawn, `${href} is not drawn`).toContain(href);
      expect(unlistedHrefs(), `${href} is still unlisted`).not.toContain(href);
    }
    // …and the three that stay inside their tree are still accounted for, not deleted to fit a shape.
    for (const href of [
      "/admin/docs/features",
      "/admin/console/users",
      "/admin/console/relationships",
      "/admin/console/templates",
    ]) {
      expect(drawn, `${href} is drawn`).not.toContain(href);
      expect(unlistedHrefs(), `${href} is unaccounted for`).toContain(href);
    }
  });
});

describe("the ladder decides the rows", () => {
  /** The five rungs, in order, with the rung each row's floor is met by. */
  const MENUS: Record<UserRole, string[]> = {
    member: hrefsFor("member"),
    stakeholder: hrefsFor("stakeholder"),
    support: hrefsFor("support"),
    admin: hrefsFor("admin"),
    owner: hrefsFor("owner"),
  };

  /**
   * The five sections, as the document writes them — the constants live at module scope beside
   * `ALIGN_MENU`, because the rendered-rail block reads them too.
   */

  /**
   * **The rule the amendment added, and the one that is easy to lose in a "just move these six
   * rows" edit.** `needs` gates visibility, never the sequence: what a role sees is the document
   * filtered, so the document's order is the *only* order any role gets. A per-role reshuffle —
   * moving the staff rows back to the top for an admin, or closing the gap for a member — fails
   * here even though every individual row is still present.
   */
  it("gives every role the document's own order — needs gates visibility, never the sequence", () => {
    const document = allItems();
    for (const role of USER_ROLES) {
      // Both gates, in the order `menuFor` applies them: the rung (`needs`) and, since #1252, the
      // capability a row may also name (`admin-spec` needs stakeholder *and* `spec-read`, which is
      // how a support seat passes the floor and is still not drawn the row).
      const capabilities = navViewer(role).capabilities;
      const visible = document
        .filter(
          (item) =>
            roleAdmits(item.needs, role) &&
            (item.capability === undefined || capabilities.has(item.capability)),
        )
        .map((item) => item.href);
      expect(hrefsFor(role), `role "${role}" is a re-sort of the document`).toEqual(visible);
      // And the groups a role sees are the document's groups, in the document's order.
      expect(menuFor(role).map((group) => group.id)).toEqual(
        SECTION_IDS.filter((id) =>
          hrefsFor(role).some((href) =>
            (ALIGN_MENU.find((group) => group.id === id)?.items ?? []).some(
              (item) => item.href === href,
            ),
          ),
        ),
      );
    }
  });

  it("gives a member the six rows that are theirs, and no staff row", () => {
    expect(MENUS.member).toEqual(MEMBER);
    expect(MENUS.member.filter((href) => href.startsWith("/admin"))).toEqual([]);
  });

  /**
   * 2026-11-23 — the Member section is **exactly six rows**: the four the Workspace group carried
   * (#620, #877, #1129, #1131) and the help pair the Support group carried, folded into one section
   * because both are the member's own surfaces. The assertion is over the descriptor rather than a
   * screenshot: a menu is data, and the ids are the owner's words, so a row cannot be added back
   * without naming it here.
   */
  it("draws exactly six Member rows — Start, My Relationships, Templates, Chat, Help, Support", () => {
    const member = ALIGN_MENU.find((group) => group.id === "group-member");
    expect(member?.items.map((item) => item.id)).toEqual([
      "start",
      "my-relationships",
      "templates",
      "chat",
      "how-it-works",
      "support",
    ]);
    expect(member?.items.map((item) => item.href)).toEqual(MEMBER);
    // The member's section is the only one drawn without a staff rung, and it draws no `/admin`
    // destination: the two that used to sit here are in Operations now.
    expect(member?.items.map((item) => item.href)).not.toContain("/admin/review");
    expect(member?.items.map((item) => item.href)).not.toContain("/admin/health");
  });

  /**
   * A support seat's rail opens on Operations — the one queue they work — and then the member's own
   * rows. `group-specs` is dropped whole for this rung: its two spec rows need `spec-read`, which a
   * support seat — admitted by the rung above it — does not carry.
   */
  it("gives a support seat the one queue it works, at the top of the document's order", () => {
    expect(MENUS.support).toEqual(["/admin/inbox", ...MENUS.member]);
    expect(menuFor("support").map((group) => group.id)).toEqual([
      "group-operations",
      "group-member",
    ]);
  });

  it("gives an admin every section but the member's, in the document's five-part order", () => {
    expect(MENUS.admin).toEqual(EVERY_SECTION);
    // The two rows #929 had put inside Support are drawn under Operations now, which is the claim
    // this whole card makes about them — "moved", not "deleted".
    expect(MENUS.admin).toContain("/admin/review");
    expect(MENUS.admin).toContain("/admin/health");
    // The five surfaces that left `unlisted` this change are drawn for an admin…
    for (const href of [
      "/admin/start",
      "/admin/brand",
      "/admin/spec/validation",
      "/admin/docs/updates",
      "/admin/docs/releases",
    ]) {
      expect(MENUS.admin, `${href} is not on the admin's rail`).toContain(href);
    }
    // …and the sections are drawn in the order the brief named them.
    expect(menuFor("admin").map((group) => group.id)).toEqual(SECTION_IDS);
    expect(EVERY_SECTION).toHaveLength(24);
  });

  /**
   * #1252 — the stakeholder seat. It sits **between** member and support on the ladder, and the two
   * rows it draws from the staff side prove both halves of the rule: the rung (`needs: stakeholder`)
   * is what a member lacks, and the capability (`spec-read`) is what support — a rung *above* it —
   * lacks. A stakeholder therefore gets the spec and its validation page, in the Specs & docs
   * section, and nothing from Operations or Content & configuration.
   */
  it("gives a stakeholder the spec and its validation page — no console, no inbox", () => {
    expect(MENUS.stakeholder).toEqual(["/admin/spec", "/admin/spec/validation", ...MENUS.member]);
    expect(hrefsFor("stakeholder")).not.toContain("/admin/console");
    expect(hrefsFor("stakeholder")).not.toContain("/admin/inbox");
    expect(navViewer("stakeholder").capabilities.has("admin-console")).toBe(false);
    // …and the row is not drawn for the seat that outranks it, which is the capability's whole job.
    expect(hrefsFor("support")).not.toContain("/admin/spec");
    expect(railHrefs("stakeholder")).toContain("/admin/spec");
    expect(railHrefs("support")).not.toContain("/admin/spec");
  });

  /**
   * #901 — `/admin/docs` renders the 117-page manifest and had **no** rail row, so the whole tree
   * was reachable only by typing the address. The assertion is over both halves the defect needs:
   * the descriptor carries the row, and the rail actually draws it for an operator and for nobody
   * below one.
   */
  it("gives the docs home a row, for an operator and for nobody below one", () => {
    expect(hrefsFor("admin")).toContain("/admin/docs");
    expect(hrefsFor("owner")).toContain("/admin/docs");
    expect(hrefsFor("support")).not.toContain("/admin/docs");
    expect(railHrefs("admin")).toContain("/admin/docs");
    expect(railHrefs("member")).not.toContain("/admin/docs");
  });

  it("gives an owner everything an admin sees — the top rung is not a second list", () => {
    expect(MENUS.owner).toEqual(MENUS.admin);
    expect(MENUS.owner).toEqual(allItems().map((item) => item.href));
  });

  it("counts the rows each rung draws — five rungs, four shapes", () => {
    const counts = USER_ROLES.map((role) => MENUS[role].length);
    // 2026-11-23 — the counts are the sections added up, and they moved for reasons a reader can
    // check: a member keeps 6 (Member, which now carries the help pair); a stakeholder has 8 (the
    // two spec rows plus Member); a support seat has 7 (the inbox plus Member); a staff rung has 24
    // (START 1 + OPERATIONS 6 + CONTENT 6 + SPECS 5 + MEMBER 6), because four rows left `unlisted`
    // and one (`/admin/start`) joined the rail.
    expect(counts).toEqual([6, 8, 7, 24, 24]);
    // Not decoration: the first two rungs differ by exactly the rows the second exists for.
    expect(counts[1]).toBe(counts[0] + 2);
    expect(counts[2]).toBe(counts[0] + 1);
    expect(counts[3]).toBe(counts[2] + 17);
  });

  it("shows a signed-out visitor the member menu, and never a staff row", () => {
    // `null` is nobody signed in. Every member row answers a signed-out request with
    // `redirect(/login?next=…)` — a working destination — so the reader is shown them and
    // nothing they would be refused.
    expect(hrefsFor(null)).toEqual(MENUS.member);
  });

  it("draws no group heading over no rows", () => {
    expect(menuFor("member").map((group) => group.id)).toEqual(["group-member"]);
    // 2026-11-23 — every section that survives has a heading, and there is no title-less group left
    // in the document (v3's one-row exception is gone): a stakeholder draws the two spec rows under
    // "Specs & docs", a support seat draws Operations and Member, and a staff rung draws all five.
    const STAFF: Record<string, string[]> = {
      stakeholder: ["group-specs", "group-member"],
      support: ["group-operations", "group-member"],
      admin: SECTION_IDS,
      owner: SECTION_IDS,
    };
    for (const [role, expected] of Object.entries(STAFF)) {
      const groups = menuFor(role as UserRole);
      expect(
        groups.map((group) => group.id),
        role,
      ).toEqual(expected);
      for (const group of groups) {
        expect(group.items.length, `${role} · ${group.id}`).toBeGreaterThan(0);
        // A heading over rows, always: the word is what makes it a section.
        expect(group.label, `${role} · ${group.id} draws no heading`).toBeDefined();
      }
    }
  });
});

describe("the rendered rail", () => {
  it("renders the descriptor's rows for each role, in order", () => {
    for (const role of USER_ROLES) {
      expect(railHrefs(role)).toEqual(hrefsFor(role));
    }
  });

  /**
   * 2026-11-23, read off the markup rather than the descriptor: **Start is the first row an
   * operator's rail draws, in its own section**, and a member's rail opens on their own work
   * because the four staff sections are dropped whole when every row in them is refused.
   *
   * A support seat still opens on the one queue it works (`/admin/inbox`), and a stakeholder still
   * opens on the spec — the rungs did not change, only the sections the rows sit in.
   */
  it("draws Start first for a staff rung, and opens on the member's work for a member", () => {
    expect(railHrefs("admin")[0]).toBe("/admin/start");
    expect(railHrefs("owner")[0]).toBe("/admin/start");
    expect(railHrefs("admin")[1]).toBe("/admin/console");
    expect(railHrefs("support")[0]).toBe("/admin/inbox");
    expect(railHrefs("stakeholder")[0]).toBe("/admin/spec");
    expect(railHrefs("member")[0]).toBe("/dashboard");
    // The member's six rows close an admin's rail, in the same order a member reads them — the two
    // staff rows that used to be here are in Operations now, not at the tail.
    expect(railHrefs("admin").slice(-6)).toEqual(MEMBER);
    expect(railHrefs("member")).not.toContain("/admin/review");
  });

  /**
   * 2026-11-23 — **five sections, five headings, in the document's order.** The old arrangement could
   * not say this: its first group drew no heading at all, on purpose. A section of a taxonomy names
   * itself, so the case reads each heading out of the fixture and asserts its position in the markup.
   */
  it("draws a heading for every section, in the document's order", () => {
    const nav = sectionOf(shellPageCopy, "nav-alignsynch");
    const html = railHtml("admin");
    // The markup is HTML: `Content & configuration` ships as `Content &amp; configuration`, and the
    // group's `data-nav-group` carries the same escaped words.
    const positions = SECTION_IDS.map((id) => {
      const words = itemLabel(nav, id).replace(/&/g, "&amp;");
      const at = html.indexOf(`data-nav-group="${words}"`);
      expect(at, `${id} draws no heading`).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    // No section draws without a heading — the title-less group is a v3 arrangement, not this one.
    for (const group of menuFor("admin")) expect(group.label).toBeDefined();
  });

  it("renders the console hub for an admin and an owner, and for nobody below them", () => {
    expect(railHrefs("admin")).toContain("/admin/console");
    expect(railHrefs("owner")).toContain("/admin/console");
    expect(railHrefs("support")).not.toContain("/admin/console");
    expect(railHrefs("member")).not.toContain("/admin/console");
    expect(railHrefs(null)).not.toContain("/admin/console");
  });

  it("does not leave an operator row in the markup for a member", () => {
    // The refusal is that a member does not learn the surface exists — so the words are absent
    // from the HTML, not `hidden` in a class a reader could still select.
    const nav = sectionOf(shellPageCopy, "nav-alignsynch");
    const html = railHtml("member");
    for (const id of [
      "console",
      "admin-instances",
      "admin-audit",
      "admin-inbox",
      "admin-health",
      "admin-spec",
    ]) {
      expect(html).not.toContain(`>${itemLabel(nav, id)}<`);
    }
  });

  it("marks the current page — and only the current page", () => {
    const activeOf = (pathname: string, role: UserRole = "member") =>
      [
        ...renderToStaticMarkup(
          createElement(AppNav, {
            brandId: "alignsynch",
            viewer: navViewer(role),
            copy: shellPageCopy,
            collapsed: false,
            pathname,
            onNavigate: () => undefined,
          }),
        ).matchAll(/<a\b[^>]*>/g),
      ]
        .map((match) => match[0])
        .filter((tag) => tag.includes("bg-nav-active"))
        .map((tag) => /href="([^"]*)"/.exec(tag)?.[1] ?? "");

    // #1129 brought Start back as `/dashboard`, and its row is `exact`: the landing lights, and
    // the child pages below it do not light it beside their own row.
    expect(activeOf("/dashboard")).toEqual(["/dashboard"]);
    expect(activeOf("/dashboard/relationships")).toEqual(["/dashboard/relationships"]);
    // A child page keeps its list row lit.
    expect(activeOf("/dashboard/relationships/abc")).toEqual(["/dashboard/relationships"]);
    expect(activeOf("/admin/console", "admin")).toEqual(["/admin/console"]);
  });
});

/**
 * #861 — the rows are a document (`data/nav-menu.json`), and the assertions that used to be about
 * an array in `lib/nav-menu.ts` are now about the file an operator edits. The two halves are
 * checked separately on purpose: this block proves the *document* is complete and honest (schema,
 * rung, route, label, hidden-with-reason), and the blocks above prove the *rail* draws it.
 */
describe("the document the rail is read from", () => {
  /**
   * The JSON's inferred type is a union of row shapes (#1129 added `exact` to one row), and a union
   * of arrays is not a `flatMap` input. Reading it through the record type once keeps the assertions
   * below about the *document*, which is what this block is for.
   */
  const document = navDocument as unknown as { groups: { items: NavRowRecord[] }[] };
  const rows = document.groups.flatMap((group) => group.items) as unknown as NavRowRecord[];

  it("satisfies the schema in content/nav.ts — strict, so an unknown key is a failure", () => {
    const parsed = zNavDocument.safeParse(navDocument);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("names the version this build reads", () => {
    expect(navDocument.version).toBe(NAV_DOCUMENT_VERSION);
  });

  it("draws exactly the document's rows, in the document's order", () => {
    // No row uses the explicit `order` key today: the order an editor reads is the order the rail
    // draws, which is the property the move must not lose.
    expect(rows.filter((row) => row.order !== undefined)).toEqual([]);
    expect(allItems().map((item) => item.href)).toEqual(
      rows.filter((row) => row.hidden !== true).map((row) => row.href),
    );
  });

  it("keeps every row — hidden ones included — pointed at a route, an icon and a real label", () => {
    const nav = sectionOf(shellPageCopy, "nav-alignsynch");
    const ids = new Set(nav.items?.map((item) => item.id) ?? []);
    for (const row of document.groups.flatMap(
      (group) => group.items,
    ) as unknown as NavRowRecord[]) {
      expect(matchRoute(routeManifest, row.href), `${row.href} is not a route`).toBeDefined();
      expect(NAV_ICON_NAMES, `${row.icon} is not an icon name`).toContain(row.icon);
      expect(ids.has(row.label ?? row.id), `${row.href} names "${row.label ?? row.id}"`).toBe(true);
      expect(USER_ROLES).toContain(row.needs);
    }
  });

  it("gives a hidden row a reason — `hidden` is not a role gate, so it has to say why", () => {
    for (const row of rows.filter((candidate) => candidate.hidden === true)) {
      expect((row.reason ?? "").trim(), `row "${row.id}" is hidden with no reason`).not.toBe("");
    }
  });
});
