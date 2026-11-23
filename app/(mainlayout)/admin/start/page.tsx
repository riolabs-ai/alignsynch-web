/**
 * `/admin/start` — the read-only admin landing (#1374): what the operator sees first, and the
 * directory of every surface the console already has.
 *
 * **Two gates, in the order every console screen uses.** `requireAdminProduct()` first (#509): the
 * console is a template capability, so a template that does not claim `product.admin` answers the
 * 404 an unknown URL gets before a session is read. Then `requireAdmin({ next: ADMIN_START_PATH })`,
 * which sends a signed-out visitor to `/login?next=/admin/start` and answers a signed-in **member**
 * the same 404. No new gate and no new capability: this is the pair `/admin/audit`, `/admin/inbox`
 * and `/admin/health` each open with, and the role itself is read from `user_profile` for this
 * request — an allowlist entry, never a form field.
 *
 * **Four reads, and not one of them is new.** `readInbox()` (`/admin/inbox`),
 * `listReviewArtifacts()` (`/admin/review`), `listAdminSessions()` (`/admin/instances`) and
 * `readAuditLog(NO_AUDIT_FILTER)` (`/admin/audit`) are the statements those screens already make;
 * this page folds their answers through `startFigures()` and prints them. A figure that wanted a
 * table, a column or a migration would be a different card — there is none here, and nothing on this
 * render writes: no form, no server action, no mutation.
 *
 * **A read that fails is a sentence, not a zero.** Each of the four is caught separately; a
 * `DatabaseUnavailableError` turns into the fixture's `unreadable` panel carrying the database's own
 * reason, and the directory below still renders, because it is a route list and not a query.
 * Anything that is not that error is re-thrown — a bug must not be reported as an outage.
 *
 * **Request-time, always.** `force-dynamic`: the figures are database reads on every visit, and
 * `pnpm build` must keep passing with `DATABASE_URL` unset — nothing here is prerendered. A
 * *request* to a tree with no auth env answers 500 `NEON_AUTH_BASE_URL is not set`, exactly as the
 * other gated console routes do; the gate never issues one.
 *
 * **One instant, and no label reads it.** `now` is handed to `listAdminSessions` because that read
 * decides an invitation's expiry against an instant the caller supplies; this page prints none of
 * those states, so no rendered string depends on the clock and there is nothing for hydration to
 * disagree with.
 */
import { StageColumn } from "@/components/assessment-flow/stage-column";
import type { Metadata } from "next";

import { AdminStartView } from "@/components/admin/start/start-view";
import { AdminSubmenu } from "@/components/admin/submenu/admin-submenu";
import { ADMIN_START_SURFACES } from "@/data/admin/start-surfaces";
import { adminStartPageCopy } from "@/data/pages/admin-start";
import { requireAdmin } from "@/lib/auth/require-role";
import { requireAdminProduct } from "@/lib/brand-boundary";
import { ADMIN_START_PATH } from "@/lib/admin/paths";
import { startFigures } from "@/lib/admin/start";
import { NO_AUDIT_FILTER } from "@/lib/admin/audit-log";
import { readInbox, type InboxSource } from "@/lib/db/admin-inbox";
import { listAdminSessions } from "@/lib/db/admin-sessions";
import { readAuditLog } from "@/lib/db/admin-audit";
import { DatabaseUnavailableError } from "@/lib/db/client";
import { listReviewArtifacts, type ReviewArtifactSummary } from "@/lib/db/review-artifacts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: adminStartPageCopy.heading,
  robots: { index: false, follow: false },
};

/**
 * Run one read, turning the one error that means "the store is down" into `null` and its reason.
 * Anything else is a bug and is re-thrown, for the same reason the shelves re-throw it: an outage
 * and a defect are different answers and only one of them is temporary.
 */
async function readOr<T>(read: () => Promise<T>, reasons: string[]): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    reasons.push(error.reason);
    return null;
  }
}

export default async function AdminStartPage() {
  // The capability before the role (#509), then the role: a template without a console answers the
  // unknown-URL 404 before any session is read.
  requireAdminProduct();
  await requireAdmin({ next: ADMIN_START_PATH });

  const reasons: string[] = [];
  const now = new Date();
  const [inbox, review, sessions, auditRows] = await Promise.all([
    readOr<InboxSource>(() => readInbox(), reasons),
    readOr<readonly ReviewArtifactSummary[]>(() => listReviewArtifacts(), reasons),
    // Only the count is printed, so the read's rows never reach the browser.
    readOr<number>(async () => (await listAdminSessions(now)).length, reasons),
    readOr<number>(async () => (await readAuditLog(NO_AUDIT_FILTER)).length, reasons),
  ]);

  const read = inbox !== null && review !== null && sessions !== null && auditRows !== null;
  const figures = read ? startFigures({ inbox, review, sessions, auditRows }) : null;

  return (
    <StageColumn>
      <div className="space-y-6">
        {/**
         * The shared submenu (#1377), above the page's own bands: `/admin/start` and
         * `/admin/console` are siblings, and this is the row that says so. `ADMIN_START_PATH` is
         * the route this module *is*, handed in so the row can mark it `aria-current` without a
         * pathname hook — see `data/admin/submenu.ts::adminSubmenuCurrent`.
         */}
        <AdminSubmenu pathname={ADMIN_START_PATH} />
        <AdminStartView
          copy={adminStartPageCopy}
          figures={figures}
          unreadable={read ? null : [...new Set(reasons)].join(" · ")}
          surfaces={ADMIN_START_SURFACES}
        />
      </div>
    </StageColumn>
  );
}
