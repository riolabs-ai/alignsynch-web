/**
 * `/admin/docs/updates` — the update ledger, one validated entry per merged pull request.
 *
 * **Two gates, in the order every console screen uses.** `requireAdminProduct()` first (#509): the
 * console is a template capability, so a template that does not claim `product.admin` answers the
 * 404 an unknown URL gets before a session is read. Then `requireAdmin()`, which sends a signed-out
 * visitor to `/login?next=/admin/docs/updates` and answers a member with the same 404 — never a 403
 * that would confirm the page exists.
 *
 * **The template is `/admin/docs/features`.** A server page behind both gates, a `OperatorFrame`, one
 * component whose every string comes from a `data/pages/**` fixture, and a read of the tree on the
 * request. The axis of variation is the data source: the features index reads `CHANGELOG.md` for
 * areas, this reads `docs/changelog/updates/*.json` for entries and joins each `specs[]` path to the
 * docs manifest so a spec link points at a document that exists.
 *
 * **Request-time, always.** `force-dynamic`: an entry merged a minute ago is on the page on the next
 * request, which is the whole point of a ledger written in the PR. `pnpm build` still needs no
 * database and no request.
 *
 * **One honest failure.** A ledger that cannot be read — a missing directory, a file that is not
 * JSON, an entry that does not satisfy the schema — is drawn as the screen's own panel with the
 * reason, never as an empty list: "nothing has changed yet" and "the record could not be read" are
 * different statements and only one of them is true.
 *
 * **No clock in this render.** Every date is the entry's own, and nothing here reads one.
 */
import { OperatorFrame } from "@/components/operator/frame";
import type { Metadata } from "next";

import { UpdatesLedger } from "@/components/admin/docs/updates-ledger";
import { adminDocsUpdatesPageCopy } from "@/data/pages/admin-docs";
import { requireAdmin } from "@/lib/auth/require-role";
import { requireAdminProduct } from "@/lib/brand-boundary";
import { docsSourceProblem } from "@/lib/docs/manifest";
import { hubPathsOf } from "@/lib/docs/rows";
import {
  ADMIN_DOCS_UPDATES_PATH,
  parseUpdateLedger,
  updateRows,
  type UpdateRow,
} from "@/lib/docs/updates";
import { readDocsManifest, readUpdateLedger } from "@/lib/docs/tree";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: adminDocsUpdatesPageCopy.heading,
  robots: { index: false, follow: false },
};

export default async function AdminDocsUpdatesPage() {
  // The capability before the role (#509): a template that does not claim the console answers the
  // 404 an unknown URL gets, with no session read and no file read behind it.
  requireAdminProduct();
  await requireAdmin({ next: ADMIN_DOCS_UPDATES_PATH });

  let rows: UpdateRow[] = [];
  let unreadable: string | null = null;
  try {
    // Two reads, one join: the entries are the record, and the manifest decides whether a spec link
    // is an address or a printed path. `parseUpdateLedger` is the same parser `data:check` E44 runs.
    rows = updateRows(parseUpdateLedger(readUpdateLedger()), hubPathsOf(readDocsManifest()));
  } catch (error) {
    const reason = docsSourceProblem(error);
    if (reason === null) throw error;
    console.error("admin-docs/updates: the update ledger could not be read", error);
    unreadable = reason;
  }

  return (
    <OperatorFrame>
      <UpdatesLedger copy={adminDocsUpdatesPageCopy} rows={rows} unreadable={unreadable} />
    </OperatorFrame>
  );
}
