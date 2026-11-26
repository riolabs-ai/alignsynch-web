/**
 * `/admin/settings` — the integration directory (#1443).
 *
 * **Why it exists.** Eight providers are configured across nine stores and four commands, and no
 * surface said which provider owns which variable, who the account is, or where you change it. A
 * reader tracing a bad Resend key read four files and a generated markdown page; a stale Neon key
 * was invisible until a release cut refused. The hard half was already built and gated — one table
 * of every variable (`scripts/env-manifest.ts`), the store census
 * (`docs/operations/env-stores.md`), the rotation ledger (`data/env/rotations.json`) — so what was
 * missing is a **directory**, not a table.
 *
 * **Three gates, in this order** — `/admin/health`'s order, unchanged. `requireAdminProduct()`
 * first (#509): the console is a template capability, so a template that does not claim
 * `product.admin` answers the 404 an unknown URL gets before a session is read. Then
 * `requireOperator()` (#1391): the operator tooling is a capability beside the console. Then
 * `requireAdmin({ next })` (`lib/auth/require-role.ts`): a signed-out visitor is sent to
 * `/login?next=/admin/settings`, a **`support`** session gets `notFound()` — the same 404 an unknown
 * URL returns, never a 403 that confirms the page exists — and an `admin` or `owner` session reaches
 * the read. `tests/admin-settings.test.tsx` drives the `support` answer through the real policy and
 * asserts the reader is never called.
 *
 * **Read-only, structurally, and it is a test.** No form, no server action, no `act()` call and no
 * `"use client"` anywhere in the surface: the only two controls leave the app for a provider's own
 * console and docs, through `LeavingLink`. `tests/admin-settings-no-secret.test.ts` asserts the
 * import graph stays that way and that no rendered node carries a value.
 *
 * **No network at request time.** The three sources are committed files and one imported table; the
 * store census is a **snapshot** and the page prints the snapshot's own date beside every count it
 * qualifies. `pnpm env:matrix` stays a command — it needs a vault token and a Vercel session this
 * deployment does not hold, and a render that called a provider would be the one thing this screen
 * must not do.
 *
 * **Request-time, never a build artefact.** `force-dynamic`: an edited census, ledger or manifest row
 * is live on the next request, and `pnpm build` needs none of them.
 *
 * **One honest failure.** A tree whose census or ledger cannot be read draws one panel naming the
 * reason and the path — never a table of zeroes, because "no rotation is recorded" and "the ledger
 * could not be read" are different sentences and only one of them is ever true.
 *
 * `robots` matters even behind the gate: this screen names the accounts the product runs on.
 */
import { OperatorFrame } from "@/components/operator/frame";
import type { Metadata } from "next";

import { SettingsDirectoryView } from "@/components/admin/settings/settings-directory";
import { INTEGRATIONS } from "@/data/integrations";
import { adminSettingsPageCopy } from "@/data/pages/admin-settings";
import { requireAdmin } from "@/lib/auth/require-role";
import type { SettingsDirectory } from "@/lib/admin/settings/providers";
import {
  ADMIN_SETTINGS_PATH,
  SettingsUnreadable,
  readSettingsDirectory,
} from "@/lib/admin/settings/read";
import { requireAdminProduct, requireOperator } from "@/lib/brand-boundary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: adminSettingsPageCopy.heading,
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  // The capability before the role (#509): a template that does not claim the console answers the
  // 404 an unknown URL gets, with no session read and no file read behind it.
  requireAdminProduct();
  requireOperator(); // #1391 — product.operator: the operator tooling, not the console
  await requireAdmin({ next: ADMIN_SETTINGS_PATH });

  let directory: SettingsDirectory | null = null;
  let unreadable: string | null = null;
  try {
    directory = readSettingsDirectory(INTEGRATIONS);
  } catch (error) {
    if (!(error instanceof SettingsUnreadable)) throw error;
    console.error("admin-settings: the sources could not be read", error);
    unreadable = error.reason;
  }

  return (
    <OperatorFrame>
      <SettingsDirectoryView
        copy={adminSettingsPageCopy}
        directory={directory}
        unreadable={unreadable}
      />
    </OperatorFrame>
  );
}
