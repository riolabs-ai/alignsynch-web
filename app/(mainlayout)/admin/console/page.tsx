// template-ancestor: components/console/overview.tsx
import { StageColumn } from "@/components/assessment-flow/stage-column";
import { AdminSubmenu } from "@/components/admin/submenu/admin-submenu";
import { AdminConsoleOverview } from "@/components/v1/admin-console-overview";
import { ADMIN_CONSOLE_PATH } from "@/lib/admin/paths";
import { requireAdminProduct } from "@/lib/brand-boundary";

/**
 * `/admin/console` — the admin console's overview.
 *
 * **The shared submenu is at the top of it.** `/admin/start` and this page are the pair an operator
 * moves between, so both render `AdminSubmenu` with their own route handed in: the row is a `nav`
 * of links, not `Tabs`, and the current pill is derived from the path — no `usePathname`, so the
 * page stays server-rendered and the row ships no JavaScript. Items and words live in
 * `data/admin/submenu.ts`; this page names only `ADMIN_CONSOLE_PATH`, which is the route it is.
 *
 * A server page that renders one client component, because every figure on it is a count over the
 * in-browser store (`lib/v1/store.tsx`): the page has nothing to read on the server, and shipping
 * a count the server invented would be the one thing this console exists to prevent.
 *
 * The console used to live at `/v1/admin/console` and moved here (#478) so the `/v1` prototype can
 * be deleted without taking it. The role gate is the subtree layout's — `requireAdmin()` in
 * `layout.tsx` — so this page renders only for an allowlisted admin.
 *
 * **The capability gate is here as well as in the layout (#509).** The layout's call is what closes
 * the subtree — this page and the five beside it — and it is the one a request meets. This call is
 * the entry point stating its own boundary where the harness can read it:
 * `tests/parity/parity.check.ts` renders *page modules*, never nested layouts, so a console whose
 * only gate lived one level up would look unconditional to the boundary test. Two calls, one
 * answer, and the ordering rule is the same in both: `requireAdminProduct()` refuses before
 * `requireAdmin()` reads a session.
 */
export default function AdminConsolePage() {
  requireAdminProduct();
  return (
    <StageColumn>
      <div className="space-y-6">
        {/**
         * The shared submenu (#1377). This page is one of the two siblings the row exists for —
         * the other is `/admin/start` — and `ADMIN_CONSOLE_PATH` is the route this module is,
         * handed in so the row marks it `aria-current` with no pathname hook.
         */}
        <AdminSubmenu pathname={ADMIN_CONSOLE_PATH} />
        <AdminConsoleOverview />
      </div>
    </StageColumn>
  );
}
