"use server";

/**
 * The `/admin/settings` write (#1443 §11): one governed, non-secret value at a time.
 *
 * **The capability before the session, on the action as well as the page (#1391).** A server action
 * is a POST endpoint of its own, so the page's 404 refuses the *render* and nothing else:
 * `requireAdminProduct()` and `requireOperator()` open this function for exactly that reason, and
 * then `requireAdmin({ next })` applies the screen's own rung — a `support` session is answered the
 * same 404 an unknown URL gets, before anything is read or written.
 *
 * **The floor that actually decides is `act()`'s.** `requireAdmin` here is the door; the rung is
 * re-read inside the writing transaction by `lib/admin/act.ts`, so a session demoted while the form
 * was open is refused on its next click, and this file cannot become a second place policy lives.
 *
 * **The actor comes from the session, never from the body.** `currentUser()` resolves it from the
 * cookies; the payload carries a key and a value and no user id, so a caller cannot choose whose
 * audit row it gets.
 *
 * **Refusals come back as codes on the URL, not as prose.** A server action that renders a form
 * server-side cannot return a value to it without a client component, and a client component is what
 * `data:check` E34 would then have to walk against a `pg` import. So a refusal redirects to
 * `?setting=<reason>` and the page draws the sentence from its own fixture — the same shape
 * `/admin/inbox` uses for `?problem=<code>`. A genuine failure is rethrown: it is not a refusal, and
 * a redirect would tell the operator "nothing happened" while losing the stack.
 *
 * **`redirect()` is called outside the `try`.** Next implements it by throwing; calling it inside a
 * `catch`-bearing block turns the navigation into the failure path, which is a trap this repo has
 * already paid for once.
 */
import { redirect } from "next/navigation";

import { ADMIN_SETTINGS_PATH } from "@/lib/admin/settings/read";
import { SettingRefused, writeSetting } from "@/lib/admin/settings/values";
import { requireAdmin } from "@/lib/auth/require-role";
import { requireAdminProduct, requireOperator } from "@/lib/brand-boundary";

/** One string field off a payload a browser could have posted anything into. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The status a completed save reports: `saved` for a write, `cleared` for a row that was removed. */
function outcomeOf(cleared: boolean): string {
  return cleared ? "cleared" : "saved";
}

export async function updateSettingAction(formData: FormData): Promise<void> {
  requireAdminProduct();
  requireOperator(); // #1391 — the page's gate, on the action

  const { user } = await requireAdmin({ next: ADMIN_SETTINGS_PATH });

  const key = text(formData.get("key")).trim();
  const value = text(formData.get("value"));
  const cleared = text(formData.get("intent")) === "clear";

  let destination: string;
  try {
    const written = await writeSetting({
      actorUserId: user.userId,
      key,
      value: cleared ? "" : value,
    });
    destination = `${ADMIN_SETTINGS_PATH}?${outcomeOf(written.after === null)}=${encodeURIComponent(
      written.key,
    )}`;
  } catch (error) {
    if (!(error instanceof SettingRefused)) throw error;
    destination = `${ADMIN_SETTINGS_PATH}?setting=${error.reason}`;
  }

  redirect(destination);
}
