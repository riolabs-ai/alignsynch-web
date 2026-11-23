/**
 * The shared admin submenu's rows — the pill row `/admin/start` and `/admin/console` both carry.
 *
 * **Why a fixture and not markup.** Every row is an address and the words that page already
 * prints, so the rows live here beside `data/admin/start-surfaces.ts` for the reason that file
 * carries its own: reader-visible copy is data (E23's rule), and a list a component spelled itself
 * would be five literals in JSX and a second name for a surface that already has one.
 *
 * **The set is a choice, and a small one.** The landing and the console are the pair this row
 * exists for — an operator reading what is going on has to be able to reach the operations it
 * points at, and back — and the three beside them are the shelves those two counts come from
 * (`/admin/instances`, `/admin/health`, `/admin/audit`). It is deliberately **not** the landing's
 * whole directory: that list is a page's job (`ADMIN_START_SURFACES`, sixteen doors), and a
 * submenu that repeated all sixteen would be a second navigation the shell already draws.
 *
 * **Labels are each page's own name**, byte for byte: `Start here` is `/admin/start`'s own H1
 * (`data/pages/admin-start.ts`), and the other four are the titles `data/admin/start-surfaces.ts`
 * gives the same pages. `tests/admin-submenu.test.tsx` holds the two fixtures equal, so a rename
 * upstream is one edit here rather than a pill that calls a screen something it no longer says.
 *
 * **Addresses are literals, and a test resolves them.** `lib/admin/paths.ts` owns the constants a
 * *page* links with, but the pill row is a fixture and E10 only reads literal `href` attributes in
 * `components/` and `app/` — a path built from a constant is invisible to it in exactly the way a
 * route-manifest row makes safe. So the rows spell their addresses, and `tests/admin-submenu.test.tsx`
 * resolves every one against `content/routes.ts`'s manifest: an address here that no page answers
 * is a red test, not a dead pill.
 */

/** The pages this row is about. A closed union, so a page cannot pass a handle that is not a row. */
export type AdminSubmenuId = "start" | "console" | "instances" | "health" | "audit";

/** One pill: where it goes, and the name that page prints for itself. */
export interface AdminSubmenuLink {
  /** Stable handle, the React key, and what the page hands the component as its own route. */
  readonly id: AdminSubmenuId;
  /** The route — one of `content/routes.ts`'s static admin rows, resolved by the fixture's test. */
  readonly href: string;
  /** The words: the page's own heading, never a second name for it. */
  readonly label: string;
}

/** The `nav`'s accessible name. A route switch is a navigation, and it has to say so. */
export const ADMIN_SUBMENU_NAME = "Admin sections";

/**
 * The row, in the order an operator works it: the landing, the console it points at, then the three
 * shelves the landing's own counts are read from.
 */
export const ADMIN_SUBMENU_LINKS: readonly AdminSubmenuLink[] = [
  { id: "start", href: "/admin/start", label: "Start here" },
  { id: "console", href: "/admin/console", label: "Console" },
  { id: "instances", href: "/admin/instances", label: "Relationships" },
  { id: "health", href: "/admin/health", label: "Platform health" },
  { id: "audit", href: "/admin/audit", label: "Audit log" },
];

/**
 * Which pill is the current one, from the path the page already knows.
 *
 * **A pure function of a string, never a hook.** `usePathname` would make this row a client
 * component for one boolean and ship JavaScript to a page that has none (both screens here are
 * server-rendered). So the page hands in the route it is rendering — `ADMIN_START_PATH`,
 * `ADMIN_CONSOLE_PATH` — and this derives the active row from it, which is the derivation
 * `components/admin/spec/spec-submenu.tsx` also takes from its route rather than from a hook.
 *
 * A query string selects a *state* of a route, not a different route (#1109), so it is stripped
 * before the comparison — `/admin/instances?stage=aligned` is the relationships row. A path that
 * names no row answers `null`: the row then renders with every pill idle rather than inventing a
 * current one, because a wrong `aria-current` is worse than none.
 */
export function adminSubmenuCurrent(pathname: string): AdminSubmenuLink | null {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return ADMIN_SUBMENU_LINKS.find((link) => link.href === path) ?? null;
}
