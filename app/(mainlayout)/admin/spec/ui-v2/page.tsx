/**
 * `/admin/spec/ui-v2` — the door to the v2 draft pages (2026-11-26, owner's move).
 *
 * **This route exists because the rail cannot hold an external href.** The drafts are a separate
 * deployment (`ADMIN_SPEC_DOCS_URL`, `data/pages/admin-spec.ts`), and every rail row must resolve
 * against `content/routes.ts` (`nav:menu --check`, E10) and be accounted for by the tree (E43). So
 * the row points here, and this page is one hop: an administrator who asked for the drafts lands on
 * the drafts. No second copy of the pages, no embedded surface, and the destination is still
 * written once — the fixture's constant, never a literal in this file.
 *
 * **The departure is announced before the click, not by it.** The rail row carries
 * `leaving: true`, so `NavRow` draws it through `LeavingLink`: a new tab, the external marker and a
 * name ending "opens in a new tab". That is why a plain `redirect()` is honest here rather than a
 * silent teleport — the reader was told, in the tab they were working in, that the click opens
 * another one. It also means this route is never reached in the reader's own tab by that row.
 *
 * **Three gates, in `/admin/spec`'s order.** `requireAdminProduct()` (#509) — the spec is a surface
 * inside the console template, so a build without `product.admin` answers the unknown-URL 404
 * before a session is read; `requireOperator()` (#1391) — this build ships the operator tooling;
 * then `requireAdmin()` — the rail row's own rung (`needs: "admin"`), so the page refuses exactly
 * the seats the row is not drawn for. A signed-out visitor is sent to
 * `/login?next=/admin/spec/ui-v2`.
 *
 * `force-dynamic` because the gate reads the request's session: `pnpm build` must never try to
 * prerender a redirect that depends on who is asking. `redirect()` answers 307 at request time.
 *
 * There is no screen here and therefore no copy: the words this route is reached by are the rail
 * row's (`data/pages/shell.ts::nav-alignsynch`), and its title is that same label rather than a
 * second spelling of it.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ADMIN_SPEC_DOCS_URL } from "@/data/pages/admin-spec";
import { shellPageCopy } from "@/data/pages/shell";
import { ADMIN_SPEC_UI_V2_PATH } from "@/lib/admin/spec-paths";
import { requireAdmin } from "@/lib/auth/require-role";
import { requireAdminProduct, requireOperator } from "@/lib/brand-boundary";
import { itemLabel, sectionOf } from "@/lib/page-copy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The rail's own word for this door, so the tab it briefly opens says the same thing.
  title: itemLabel(sectionOf(shellPageCopy, "nav-alignsynch"), "admin-spec-ui-v2"),
  robots: { index: false, follow: false },
};

export default async function AdminSpecUiV2Page() {
  requireAdminProduct();
  requireOperator();
  await requireAdmin({ next: ADMIN_SPEC_UI_V2_PATH });
  redirect(ADMIN_SPEC_DOCS_URL);
}
