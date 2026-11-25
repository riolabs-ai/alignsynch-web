// template-ancestor: components/admin/spec/spec-submenu.tsx   (variation: a pill row rather than a 208px column — the sibling set is one fixture of five doors instead of four groups with counts, and the current row is decided by the route the page passes in, exactly as the spec submenu's is)
/**
 * The shared admin submenu — one pill row over sibling admin routes.
 *
 * **A route switch is links, not tabs.** `components/ui/tabs.tsx` is in-page state: a `Tabs` over
 * real routes draws a control that cannot be deep-linked, opened in a new tab, or reached by a
 * crawler, and re-implements the router in a component. This is a `<nav>` of `<a href>`s with
 * `aria-current="page"` on the one the reader is standing on — the same shape
 * `components/admin/spec/spec-submenu.tsx` draws, at one row instead of a column.
 *
 * **The items are data and the component is item-agnostic.** Every address and every word comes
 * from `data/admin/submenu.ts`; nothing in this file names `/admin/dashboard`, `/admin/console` or any
 * other route. A second row over a different sibling set is a prop change, not a second component,
 * which is the point of keeping it generic (§ template doctrine, question 2).
 *
 * **`aria-current` is derived, not hooked.** The page hands in the path it is rendering
 * (`ADMIN_START_PATH`, `ADMIN_CONSOLE_PATH`) and `adminSubmenuCurrent` picks the row, so this stays
 * a server component with no state, no handler and no clock — and the two screens gain no
 * JavaScript from a row of links. The derivation lives in the fixture beside the rows it derives
 * from, so the pill and the page cannot disagree about which route is current.
 *
 * **The pill classes are the console's own** (`components/v1/admin-relationship-registry.tsx`'s
 * filter chips): `rounded-full border px-3 py-1`, action token when active, card when idle. The
 * active state is a **token**, never a palette step — `pnpm lint` fails a literal `indigo-*` here
 * for the same reason it does anywhere else.
 *
 * A server component: `Link`, a `map` and `cn`, which is the whole of it.
 */
import Link from "next/link";

import { ADMIN_SUBMENU_LINKS, ADMIN_SUBMENU_NAME, adminSubmenuCurrent } from "@/data/admin/submenu";
import { cn } from "@/lib/utils";

/** The pill's own class list, so the row and any later row over another set cannot drift. */
const PILL =
  "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PILL_CURRENT = "border-action bg-action font-semibold text-action-foreground";
const PILL_IDLE = "border-border bg-card text-foreground hover:bg-muted";

export function AdminSubmenu({ pathname }: { pathname: string }) {
  const current = adminSubmenuCurrent(pathname);

  return (
    <nav
      aria-label={ADMIN_SUBMENU_NAME}
      className="flex flex-wrap gap-2"
      data-admin-submenu={current?.id ?? "none"}
    >
      {ADMIN_SUBMENU_LINKS.map((link) => {
        const active = current?.id === link.id;
        return (
          <Link
            key={link.id}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(PILL, active ? PILL_CURRENT : PILL_IDLE)}
            data-admin-submenu-item={link.id}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
