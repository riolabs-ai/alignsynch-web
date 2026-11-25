"use server";

/**
 * `/dashboard/payment` — the one write the invoices card makes (#1282, APP-46).
 *
 * **It writes nothing.** The click asks the provider where *this account's* invoices live and
 * answers the URL; the browser leaves for it. No row, no email, no plan and no price moves — APP-46
 * is a read surface, and the reason this is a server action rather than an `href` is that a billing
 * page cannot be linked: the provider mints a single-use session per customer on demand, with a
 * secret key that never leaves the server.
 *
 * **The account is the session's, never the body's.** `requireRole("member")` resolves it from the
 * request's own cookies — the same gate the page itself passes — so a crafted call cannot ask for
 * somebody else's invoices, and there is no argument to accept in the first place.
 *
 * **Three answers, and only one of them has a URL.** `available` → `{ ok: true, url }`; a provider
 * subscription that the provider would not mint a page for (`unavailable`, e.g. its billing portal
 * is not activated on that account) or a stale click on an account with no live subscription answer
 * `{ ok: false, code }` and the screen says one sentence. The provider's own `detail` goes to the
 * server log with the reason — an operator reads it, a member is not shown an environment
 * variable or a provider's dashboard URL.
 *
 * A transport failure is a `{ ok: false }` too: the click is repeatable, so a dead provider must
 * not be a 500 on a page whose other half is a read that succeeded.
 */
import { baseUrl } from "@/lib/flow/email";
import { requireRole } from "@/lib/auth/require-role";
import { openInvoicePortal } from "@/lib/billing";
import { BillingRefusal } from "@/lib/billing/port";
import type { InvoicePortalRefusal } from "@/lib/billing/types";
import { PAYMENT_PATH } from "@/lib/flow/paths";

/** What the invoices card draws after a click. `url` is present only when `ok`. */
export type InvoicePortalOutcome =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly code: InvoicePortalRefusal | "failed" };

export async function openInvoicePortalAction(): Promise<InvoicePortalOutcome> {
  const { user } = await requireRole("member", { next: PAYMENT_PATH });

  let answer: Awaited<ReturnType<typeof openInvoicePortal>>;
  try {
    answer = await openInvoicePortal({
      userId: user.userId,
      returnUrl: `${baseUrl()}${PAYMENT_PATH}`,
    });
  } catch (error) {
    // `BillingRefusal("not-configured")` is the keyless tree and an unreachable provider is a bare
    // `Error`; both mean the same thing to the member, and both are logged by name.
    console.error(
      "payment: the invoice portal could not be opened",
      error instanceof BillingRefusal ? `${error.code}: ${error.message}` : error,
    );
    return { ok: false, code: "failed" };
  }

  if (!answer.available) {
    console.warn(`payment: no invoice portal (${answer.reason}) — ${answer.detail}`);
    return { ok: false, code: answer.reason };
  }

  return { ok: true, url: answer.url };
}
