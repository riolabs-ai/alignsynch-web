/**
 * `/admin/settings` — the integration directory (#1443 §9 D6-B, §11).
 *
 * **Why it exists.** Eight providers are configured across nine stores and four commands, and no
 * surface said which provider owns which variable, who the account is, or where you change it. A
 * reader tracing a bad Resend key read four files and a generated markdown page; a stale Neon key
 * was invisible until a release cut refused. The hard half was already built and gated — one table
 * of every variable (`scripts/env-manifest.ts`), the store census
 * (`docs/operations/env-stores.md`), the rotation ledger (`data/env/rotations.json`) — so what was
 * missing is a **directory**, not a table.
 *
 * **Two halves, one gate.** The directory (names, sources, dates) is read from committed files and
 * prints no value. The band below it is the write path this card adds: the four governed non-secret
 * variables an admin may store, each with its resolved value and the source that answered it, and the
 * two that cannot honour a stored value drawn as refused rows. A secret has no field here by
 * construction — the registry (`lib/admin/settings/governed.ts`) has no entry for a vault-sourced
 * name, and `refusalFor` refuses one by name if a payload asks anyway.
 *
 * **Three gates, in this order** — `/admin/health`'s order, unchanged. `requireAdminProduct()`
 * first (#509): the console is a template capability, so a template that does not claim
 * `product.admin` answers the 404 an unknown URL gets before a session is read. Then
 * `requireOperator()` (#1391): the operator tooling is a capability beside the console. Then
 * `requireAdmin({ next })` (`lib/auth/require-role.ts`): a signed-out visitor is sent to
 * `/login?next=/admin/settings`, a **`support`** session gets `notFound()` — the same 404 an unknown
 * URL returns, never a 403 that confirms the page exists — and an `admin` or `owner` session reaches
 * the read *and* the form. `tests/admin-settings.test.tsx` drives the `support` answer through the
 * real policy and asserts neither reader is called.
 *
 * **The precedence is resolved here, once.** `resolveGovernedSettings()` reads the `setting` table
 * one time and answers six `env > setting > default` decisions; the health screen resolves its own
 * two the same way. A deployment with no `DATABASE_URL` (the gate, `pnpm build`) answers
 * `absent` without opening a socket, so this page renders in CI and says that nothing can be stored
 * yet rather than failing.
 *
 * **No network at request time.** The directory's sources are committed files and one imported
 * table; the store census is a **snapshot** and the page prints the snapshot's own date beside every
 * count it qualifies. `pnpm env:matrix` stays a command — it needs a vault token and a Vercel session
 * this deployment does not hold, and a render that called a provider would be the one thing this
 * screen must not do.
 *
 * **Request-time, never a build artefact.** `force-dynamic`: an edited census, ledger, manifest row or
 * stored setting is live on the next request, and `pnpm build` needs none of them. That is also why
 * the form can be server-rendered: the action redirects back here and this render re-reads.
 *
 * `robots` matters even behind the gate: this screen names the accounts the product runs on.
 */
import { OperatorFrame } from "@/components/operator/frame";
import type { Metadata } from "next";

import { updateSettingAction } from "./actions";

import { GovernedSettingsView } from "@/components/admin/settings/governed-settings";
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
import { type SettingsSearchParams, settingStatusOf } from "@/lib/admin/settings/status";
import {
  type GovernedSettings,
  governedSettingsFromEnv,
  resolveGovernedSettings,
} from "@/lib/admin/settings/values";
import { requireAdminProduct, requireOperator } from "@/lib/brand-boundary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: adminSettingsPageCopy.heading,
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SettingsSearchParams>;
} = {}) {
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

  // The write path's half. A store that cannot be read is a panel, not a page failure: the
  // directory above it is still true, and every reader falls back to env > default.
  let settings: GovernedSettings = governedSettingsFromEnv();
  let storeUnreadable: string | null = null;
  try {
    settings = await resolveGovernedSettings();
  } catch (error) {
    console.error("admin-settings: the setting store could not be read", error);
    storeUnreadable = error instanceof Error ? error.message : String(error);
    settings = governedSettingsFromEnv();
  }

  const status = settingStatusOf((await searchParams) ?? {});

  return (
    <OperatorFrame>
      <div className="space-y-8">
        <SettingsDirectoryView
          copy={adminSettingsPageCopy}
          directory={directory}
          unreadable={unreadable}
        />
        {settings.resolutions.length === 0 ? null : (
          <GovernedSettingsView
            copy={adminSettingsPageCopy}
            settings={settings}
            unreadable={storeUnreadable}
            status={status}
            action={updateSettingAction}
          />
        )}
      </div>
    </OperatorFrame>
  );
}
