// template-ancestor: components/identity/settings-view.tsx   (variation: one row per governed non-secret variable — its resolved value, the source that answered it, and a save/clear pair — where the account settings screen draws per-section fields; refused keys carry no control at all)
//
// `/admin/settings` — the write path's surface (#1443 §11).
//
// **What this band is, and what it is not.** The four bands above it are a directory: names, sources
// and dates, no values. This one is the single place on the screen where a *value* is rendered,
// because it is the single place an admin can change one — and every key on it is non-secret by the
// registry's own construction (`lib/admin/settings/governed.ts` has no entry for a vault-sourced
// name), so a field here can never be a field over a secret. `tests/admin-settings-no-secret.test.ts`
// holds both halves: no secret row reaches a field, and no rendered value equals a secret.
//
// **The precedence is printed where the edit happens, not in a docstring.** `env > setting > default`
// is the band's body, and a row whose key the environment also carries draws `shadowed by env`
// beside its field — an edit that silently loses is the failure this screen exists to prevent, so the
// losing row says so before the operator types, not after.
//
// **A refused row is a row, not an absence.** `NAV_SOURCE` and `DEMO_ALLOW_PRODUCTION` are governed
// in name only: one is inlined at build time, the other read once at process start. They are drawn
// with their reason and no control, because "you cannot change this without a deploy" is the useful
// answer and a missing row is not.
//
// Server component, deliberately: the form posts to a server action and the page is `force-dynamic`,
// so there is no client bundle, no `useActionState` and no `"use client"` in this file's graph — which
// is one fewer hop for `data:check` E34 to have to keep clean.
//
// Every word is `data/pages/admin-settings.ts` (E23 budget 0); the key names, the reader paths and the
// reasons are the registry's, so a rename moves both.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSurface } from "@/components/ui/form-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PageCopy } from "@/content/pages";
import { type GovernedResolution, governedSpecOf } from "@/lib/admin/settings/governed";
import type { SettingRefusal, SettingStatus } from "@/lib/admin/settings/status";
import type { GovernedSettings } from "@/lib/admin/settings/values";
import { fillLabel, itemBody, itemLabel, sectionBody, sectionOf } from "@/lib/page-copy";

export interface GovernedSettingsProps {
  copy: PageCopy;
  /** The six resolutions and whether this request could read the store at all. */
  settings: GovernedSettings;
  /** A refusal that could not read the store, or `null`. */
  unreadable: string | null;
  status: SettingStatus | null;
  /**
   * The page's write, handed down rather than imported.
   *
   * `components/admin/**` may not import from `app/` — `tests/operator-seam.test.ts` is the wall,
   * and it is right: a component that reaches into a route module is a component only that route
   * can use. `components/support/support-request-form.tsx` and `components/admin/support-inbox.tsx`
   * take their action the same way. So the server action arrives as a prop and this file stays a
   * drawing of one band.
   */
  action: (formData: FormData) => void | Promise<void>;
}

/** Which fixture id names a source. One map, so a new source cannot render without a word. */
function sourceLabelId(source: GovernedResolution["source"]): string {
  if (source === "env") return "source-env";
  if (source === "setting") return "source-setting";
  return "source-default";
}

/** Which fixture id names a refusal. All four are declared; a fifth reason fails E23 rather than a render. */
function refusalLabelId(reason: SettingRefusal): string {
  return `refused-${reason}`;
}

export function GovernedSettingsView({
  copy,
  settings,
  unreadable,
  status,
  action,
}: GovernedSettingsProps) {
  const section = sectionOf(copy, "governance");
  const precedence = itemLabel(section, "precedence");
  const storeNote =
    unreadable !== null
      ? fillLabel(itemLabel(section, "store-unreadable"), { reason: unreadable })
      : settings.store === "absent"
        ? itemLabel(section, "store-absent")
        : settings.store === "unmigrated"
          ? itemLabel(section, "store-unmigrated")
          : null;

  return (
    <section data-settings-band="governance" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">{section.heading}</h2>
        <p className="max-w-3xl text-sm text-gray-600">{sectionBody(section)}</p>
        <p
          data-settings-precedence=""
          className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800"
        >
          {precedence}
        </p>
        <p className="max-w-3xl text-xs text-gray-600">{itemBody(section, "precedence")}</p>
      </div>

      {status === null ? null : (
        <p
          role="status"
          data-settings-status={status.kind}
          className="max-w-3xl rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
        >
          {status.kind === "refused"
            ? itemLabel(section, refusalLabelId(status.reason))
            : fillLabel(itemLabel(section, status.kind), { key: status.key })}
        </p>
      )}

      {storeNote === null ? null : (
        <div
          data-settings-store={unreadable === null ? settings.store : "unreadable"}
          className="max-w-3xl rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700"
        >
          <p className="font-medium text-gray-900">{storeNote}</p>
          <p className="mt-1">
            {unreadable !== null
              ? itemBody(section, "store-unreadable")
              : settings.store === "absent"
                ? itemBody(section, "store-absent")
                : itemBody(section, "store-unmigrated")}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {settings.resolutions.length === 0 ? (
          <div
            data-settings-none=""
            className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600"
          >
            {itemLabel(section, "none")}
          </div>
        ) : (
          settings.resolutions.map((resolution) => {
            const spec = governedSpecOf(resolution.key);
            const body = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {resolution.key}
                  </span>
                  <Badge variant="outline" data-settings-source={resolution.source}>
                    {itemLabel(section, sourceLabelId(resolution.source))}
                  </Badge>
                  {resolution.shadowedByEnv ? (
                    <Badge variant="outline" data-settings-loses-to-env="">
                      {itemLabel(section, "env-wins")}
                    </Badge>
                  ) : null}
                  {resolution.writable ? null : (
                    <Badge variant="outline" data-settings-fixed="">
                      {itemLabel(section, "fixed")}
                    </Badge>
                  )}
                </div>

                {resolution.writable ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`setting-${resolution.key}`}>
                        {fillLabel(itemLabel(section, "field-label"), { key: resolution.key })}
                      </Label>
                      <Input
                        id={`setting-${resolution.key}`}
                        name="value"
                        defaultValue={resolution.value}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full min-w-0 font-mono text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" name="intent" value="save" size="sm">
                        {itemLabel(section, "save")}
                      </Button>
                      <Button type="submit" name="intent" value="clear" size="sm" variant="outline">
                        {itemLabel(section, "clear")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-gray-600">
                  {resolution.stored === null
                    ? itemLabel(section, "not-stored")
                    : fillLabel(itemLabel(section, "stored"), { value: resolution.stored })}
                </p>

                {resolution.shadowedByEnv ? (
                  <p data-settings-loses-to-env-note="" className="text-xs text-gray-600">
                    {itemLabel(section, "env-wins-note")}
                  </p>
                ) : null}

                {spec === null ? null : (
                  <p className="text-xs text-gray-500">
                    {fillLabel(itemLabel(section, "read-by"), { where: spec.readBy })}
                  </p>
                )}

                {resolution.writable ? null : (
                  <p data-settings-fixed-reason="" className="text-xs text-gray-700">
                    {spec?.fixedBy ?? ""}
                  </p>
                )}
                {resolution.problem === null ? null : (
                  <p data-settings-problem="" className="text-xs text-gray-700">
                    {resolution.problem}
                  </p>
                )}
              </>
            );

            return (
              <FormSurface
                key={resolution.key}
                data-settings-key={resolution.key}
                className="px-4 py-3"
              >
                {resolution.writable ? (
                  // A writable row is the only place a POST exists: the key travels as a hidden
                  // field, the value as the field above, and the action re-checks both.
                  <form action={action} className="space-y-3">
                    <input type="hidden" name="key" value={resolution.key} />
                    {body}
                  </form>
                ) : (
                  // A refused row is drawn, never posted: a `<form>` here would be a control whose
                  // only possible answer is a refusal, and `refusalFor` would be its real gate.
                  <div data-settings-refused="" className="space-y-3">
                    {body}
                  </div>
                )}
              </FormSurface>
            );
          })
        )}
      </div>
    </section>
  );
}
