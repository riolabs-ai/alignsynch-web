/**
 * The status a settings write reports, read back off the URL (#1443 §11).
 *
 * **Why the URL and not a return value.** The form on `/admin/settings` is server-rendered and posts
 * to a server action, and a server action answering a plain `<form>` reports by redirecting. Turning
 * the form into a client component to hold an `ActionResult` would put a `pg`-reaching import behind
 * a `"use client"` boundary — the crossing `data:check` E34 exists to refuse — so the status travels
 * as a query parameter and the page draws its sentence from its own fixture (`data/pages/admin-settings.ts`).
 *
 * **Pure, and strict about its input.** A browser, or a person editing the address bar, can put
 * anything in `?setting=`; only the four refusal codes this app emits are recognised, and anything
 * else renders nothing rather than inventing a sentence. That is the difference between a status
 * channel and a copy injection.
 */

/** Why a write was refused. The four codes `refuseFor` / `valueToStore` can produce. */
export type SettingRefusal =
  | "unknown-key"
  | "vault-sourced"
  | "fixed-by-deployment"
  | "invalid-value";

/** The four codes, in the order the form's vocabulary lists them. */
export const SETTING_REFUSALS: readonly SettingRefusal[] = [
  "unknown-key",
  "vault-sourced",
  "fixed-by-deployment",
  "invalid-value",
];

/** What the last submit answered. */
export type SettingStatus =
  | { readonly kind: "saved"; readonly key: string }
  | { readonly kind: "cleared"; readonly key: string }
  | { readonly kind: "refused"; readonly reason: SettingRefusal };

/** A query object as Next hands it over: a key may carry one value, several, or none. */
export type SettingsSearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query key, or `""`. A browser can post an array; this never trusts the shape. */
function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Is this string one of the four refusal codes? */
export function isSettingRefusal(value: string): value is SettingRefusal {
  return (SETTING_REFUSALS as readonly string[]).includes(value);
}

/**
 * The status the action put on the URL, or `null` when there is none.
 *
 * `saved` and `cleared` before `setting` because the action emits exactly one of the three, and a
 * URL carrying two is not one this app wrote — the first the reader meets wins rather than a
 * priority that would have to be argued.
 */
export function settingStatusOf(params: SettingsSearchParams): SettingStatus | null {
  const saved = first(params.saved);
  if (saved !== "") return { kind: "saved", key: saved };
  const cleared = first(params.cleared);
  if (cleared !== "") return { kind: "cleared", key: cleared };
  const refused = first(params.setting);
  return isSettingRefusal(refused) ? { kind: "refused", reason: refused } : null;
}
