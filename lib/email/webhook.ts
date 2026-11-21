/**
 * The inbound decision for one delivery (#439b) — verify, read, record once, mark.
 *
 * The route is a two-line wrapper around this function, for the reason `lib/billing`'s adapter is:
 * the part with an *order* to prove is here, so `tests/resend-webhook.test.ts` can drive every
 * branch with no HTTP and no database, and the route cannot accidentally skip a step.
 *
 * **The order, and why each step is where it is.**
 *
 *   1. **Not this deployment's endpoint → 410, before the body is read and before the secret is
 *      consulted.** The provider's account webhook belongs to `alignsynch.com` (production); a
 *      preview or demo deployment answers `410` on its own identity, so a copy of the secret that
 *      drifted into a preview store cannot make a demo deployment ingest production mail events.
 *      It comes first because the honest first sentence is "this deployment is not the owner", not
 *      "you are misconfigured" — and because an unset secret on a non-owner would otherwise answer
 *      `503` and read as a task for the operator. Absent `VERCEL_ENV` (local `pnpm dev`, CI, the
 *      documented signed-`curl` proof) there is no deployment identity and no refusal.
 *   2. **No signing secret → 503, before the body is read.** The card is explicit: an unset
 *      `RESEND_WEBHOOK_SECRET` must refuse every delivery rather than accept one unsigned
 *      "temporarily". Reading the body first would also let an anonymous caller make this endpoint
 *      buffer a large upload it is about to reject.
 *   3. **Verify the signature → 401.** Unparseable JSON is checked *after* this, so a forged body
 *      never reaches the parser and a signature mismatch says one thing (401), not two.
 *   4. **Read the envelope.** A body that is not a JSON object with a `type` is 400: nothing about
 *      it can be stored or routed, and the provider's retry cannot change that.
 *   5. **A type this receiver does not act on → 200, nothing written.** A 4xx would be a retry
 *      storm over an event we deliberately ignore, and a row for it would be noise in the table
 *      #507 reads to refuse a send.
 *   6. **Rate limit by client → 429.** Checked after the signature because a cheap HMAC rejection
 *      is the right answer to garbage, and before the write because the point of a limit is that a
 *      flood costs no row. The count is a database read over the window `0027` indexes — an
 *      in-process counter would be per session on a deployment that runs several.
 *   7. **Record once, and mark in the same transaction.** The store's insert is
 *      `ON CONFLICT (provider_event_id) DO NOTHING`; a duplicate is a 200 that writes nothing,
 *      which is what makes a redelivery idempotent. A storage failure is 503 — "not stored" is a
 *      state, never a quiet success, and the provider retries a 5xx.
 *
 * **Nothing logs an address.** The outcome carries the event type and the provider's delivery id
 * and nothing else a log line could copy out of it; the payload — which contains the recipient —
 * goes to the table and never to `console`.
 *
 * **The rate limit is a flood valve, not a send throttle.** The provider delivers a broadcast in
 * bursts, so the budget is generous (see `EMAIL_WEBHOOK_RATE_MAX`): it exists so an unauthenticated
 * endpoint that writes cannot be hammered by a forged-signature loop or a replay of a captured
 * request, and a genuine burst that trips it is retried by the provider with the `Retry-After` this
 * answers.
 */
import { rateExceeded } from "@/lib/contact/validation";
import {
  type EmailWebhookRefusalCode,
  EmailWebhookRefusal,
  type SvixDeliveryHeaders,
  verifySvixSignature,
} from "@/lib/email/signature";
import { type SuppressionMark, parseEmailWebhook } from "@/lib/email/inbound";

/**
 * The rate window and its budget: this many deliveries per client inside one minute.
 *
 * 600 a minute is ten a second from one client. The provider's own delivery rate to one endpoint is
 * far below that in normal operation, and a burst over it is either a broadcast arriving through a
 * single egress address or a flood — both are served better by a `429` the provider retries than by
 * an endpoint that writes without a bound.
 */
export const EMAIL_WEBHOOK_RATE_WINDOW_MS = 60_000;
export const EMAIL_WEBHOOK_RATE_MAX = 600;

/** The row a store writes when a delivery is new. */
export interface EmailEventWrite {
  /** The `svix-id` header: the delivery's identity, unique in `email_event`. */
  readonly providerEventId: string;
  readonly type: string;
  readonly recipient: string;
  readonly subject: string | null;
  readonly occurredAt: Date;
  readonly payload: unknown;
  readonly suppression: SuppressionMark;
  /** The client's rate-limit bucket (`lib/forms/ip.ts`), never its address. */
  readonly ipHash: string;
}

/**
 * What one write did.
 *
 * `duplicate` is a **success**: the delivery was already recorded, so nothing was written and the
 * provider is told so. `unavailable` is the database not answering — a 503, because the provider
 * retrying is exactly the right next step.
 */
export type EmailEventStoreOutcome =
  | { readonly stored: true; readonly marked: boolean }
  | { readonly stored: false; readonly reason: "duplicate" | "unavailable" };

/** The two database operations this feature needs, as an interface so a test can own them. */
export interface EmailEventStore {
  /** Insert the event once; on a replay insert nothing. Mark the address in the same transaction. */
  readonly apply: (event: EmailEventWrite) => Promise<EmailEventStoreOutcome>;
  /** How many deliveries this client bucket has had since `since`. */
  readonly countRecent: (ipHash: string, since: Date) => Promise<number>;
}

/** What happened, as a status code plus the facts a log line is allowed to carry. */
export interface EmailWebhookOutcome {
  readonly status: 200 | 400 | 401 | 410 | 429 | 503;
  readonly kind:
    | "stored"
    | "duplicate"
    | "ignored"
    | "unreadable"
    | "refused"
    | "not-owner"
    | "throttled"
    | "unconfigured"
    | "unavailable";
  readonly body: Record<string, unknown>;
  /** Only on a verified delivery: the event type, for the operator's log line. */
  readonly type?: string;
  /** Only on a verified delivery: the provider's delivery id (`svix-id`). */
  readonly providerEventId?: string;
  /** Set when a mark was written on `news_signup`. */
  readonly marked?: boolean;
  /** Why a delivery was refused, or why an ignored one was ignored. */
  readonly refusal?: EmailWebhookRefusalCode | EmailWebhookOwnershipRefusalCode;
  readonly detail?: string;
}

/**
 * Why a delivery was refused on **this deployment's** identity rather than on the sender's.
 *
 * Kept apart from `EmailWebhookRefusalCode`, which is about a delivery that reached the wrong
 * endpoint or was signed by the wrong key — different cause, and a different operator action.
 */
export type EmailWebhookOwnershipRefusalCode = "deployment";

/**
 * The deployment's own identity, handed in rather than read.
 *
 * The same shape `lib/auth/demo-mode.ts::DemoEnv` uses for the same question: `VERCEL_ENV` is the
 * one value Vercel sets that says *what this deployment is*, and `undefined` is a tree that is not
 * a Vercel deployment at all. Nothing here reads `process.env`, so a test drives every branch.
 */
export interface EmailWebhookDeployment {
  /** `production`, `preview`, `development` on Vercel; `undefined` locally and in CI. */
  readonly vercelEnv: string | undefined;
}

/**
 * Whether this deployment is the account webhook's owner at all.
 *
 * The provider's account-level webhook points at `alignsynch.com`, so exactly one deployment —
 * the one Vercel reports as `production` — may accept its deliveries. Every other Vercel
 * deployment answers `410`, and a tree with no `VERCEL_ENV` (local `pnpm dev`, CI, the signed
 * `curl` in `docs/operations/resend-inbound.md`) is not a deployment and keeps working.
 *
 * **Why `VERCEL_ENV` and not the secret.** A secret is a *value*, and values drift: the demo store
 * carried a copy of the account endpoint's secret, which made a deployment that owns nothing verify
 * deliveries addressed to someone else. `VERCEL_ENV` is set by the platform on every deployment and
 * cannot be unset, so it is a property of the deployment rather than of a store that was copied.
 */
export function webhookOwnershipRefusal(
  deployment: EmailWebhookDeployment,
): EmailWebhookOwnershipRefusalCode | null {
  if (deployment.vercelEnv === undefined) return null;
  return deployment.vercelEnv === "production" ? null : "deployment";
}

/** The status a verification refusal answers with: our configuration, or the sender's request. */
function refusalStatus(code: EmailWebhookRefusalCode): 401 | 503 {
  return code === "unconfigured" ? 503 : 401;
}

/**
 * One delivery, decided.
 *
 * `readBody` is a thunk rather than a string so the unconfigured path can refuse without consuming
 * the request; `now` is an argument so the tolerance window is drivable in a test.
 */
export async function handleEmailWebhook(input: {
  readonly readBody: () => Promise<string>;
  readonly headers: SvixDeliveryHeaders;
  readonly ipHash: string;
  readonly secret: string;
  readonly store: EmailEventStore;
  readonly now?: Date;
  /** The deployment's identity — step 1 of the order, and the only thing that can refuse on it. */
  readonly deployment: EmailWebhookDeployment;
}): Promise<EmailWebhookOutcome> {
  const now = input.now ?? new Date();

  const ownership = webhookOwnershipRefusal(input.deployment);
  if (ownership !== null) {
    return {
      status: 410,
      kind: "not-owner",
      refusal: ownership,
      body: {
        error: "not-owner",
        message:
          "this deployment does not own the mail provider's account webhook, so it accepts nothing",
      },
    };
  }

  if (input.secret.trim() === "") {
    return {
      status: 503,
      kind: "unconfigured",
      body: {
        error: "unconfigured",
        message: "this deployment has no RESEND_WEBHOOK_SECRET, so no delivery can be verified",
      },
    };
  }

  let rawBody: string;
  try {
    rawBody = await input.readBody();
  } catch {
    return {
      status: 400,
      kind: "unreadable",
      body: { error: "unreadable", message: "the request body could not be read" },
    };
  }

  try {
    verifySvixSignature({ rawBody, headers: input.headers, secret: input.secret, now });
  } catch (error) {
    if (!(error instanceof EmailWebhookRefusal)) throw error;
    return {
      status: refusalStatus(error.code),
      kind: error.code === "unconfigured" ? "unconfigured" : "refused",
      refusal: error.code,
      body: { error: error.code, message: error.message },
    };
  }

  const providerEventId = input.headers.id?.trim() ?? "";
  const parsed = parseEmailWebhook(rawBody, now);

  if (parsed.kind === "unreadable") {
    return {
      status: 400,
      kind: "unreadable",
      providerEventId,
      detail: parsed.detail,
      body: { error: "unreadable", message: parsed.detail },
    };
  }

  if (parsed.kind === "ignored") {
    return {
      status: 200,
      kind: "ignored",
      type: parsed.type,
      providerEventId,
      detail: parsed.detail,
      body: { received: true, ignored: true, type: parsed.type, detail: parsed.detail },
    };
  }

  try {
    const recent = await input.store.countRecent(
      input.ipHash,
      new Date(now.getTime() - EMAIL_WEBHOOK_RATE_WINDOW_MS),
    );
    if (rateExceeded(recent, EMAIL_WEBHOOK_RATE_MAX)) {
      return {
        status: 429,
        kind: "throttled",
        type: parsed.event.type,
        providerEventId,
        body: {
          error: "throttled",
          message: "this client has spent its delivery budget for the window",
          retryAfterSeconds: Math.ceil(EMAIL_WEBHOOK_RATE_WINDOW_MS / 1000),
        },
      };
    }
  } catch {
    return {
      status: 503,
      kind: "unavailable",
      type: parsed.event.type,
      providerEventId,
      body: {
        error: "unavailable",
        message: "the delivery could not be checked against the store; the provider may retry",
      },
    };
  }

  try {
    const outcome = await input.store.apply({
      providerEventId,
      type: parsed.event.type,
      recipient: parsed.event.recipient,
      subject: parsed.event.subject,
      occurredAt: parsed.event.occurredAt,
      payload: parsed.event.payload,
      suppression: parsed.event.suppression,
      ipHash: input.ipHash,
    });

    if (!outcome.stored) {
      if (outcome.reason === "duplicate") {
        return {
          status: 200,
          kind: "duplicate",
          type: parsed.event.type,
          providerEventId,
          body: { received: true, stored: false, duplicate: true, type: parsed.event.type },
        };
      }
      return {
        status: 503,
        kind: "unavailable",
        type: parsed.event.type,
        providerEventId,
        body: {
          error: "unavailable",
          message: "the delivery could not be stored; the provider may retry",
        },
      };
    }

    return {
      status: 200,
      kind: "stored",
      type: parsed.event.type,
      providerEventId,
      marked: outcome.marked,
      body: {
        received: true,
        stored: true,
        type: parsed.event.type,
        marked: outcome.marked,
      },
    };
  } catch {
    return {
      status: 503,
      kind: "unavailable",
      type: parsed.event.type,
      providerEventId,
      body: {
        error: "unavailable",
        message: "the delivery could not be stored; the provider may retry",
      },
    };
  }
}
