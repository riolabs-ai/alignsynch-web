/**
 * The invoices link, at the port (#1282, APP-46).
 *
 * Offline on purpose: the transport is injected and the database is stubbed, so every case here
 * drives the adapter's own decisions — which customer it resolves, what it sends, and what it says
 * when there is no page to open. The live proof (a real test-mode portal session behind a real
 * subscription) is the screenshot in the card's evidence, not this file.
 *
 * The four claims worth pinning:
 *
 *   1. **The customer is read from the subscription, not from the account's email.** The app stores
 *      no customer id, and an email lookup would attach one person's invoices to another customer
 *      that happens to share an address.
 *   2. **The offline adapter never invents a surface.** A `mock` row answers `no-provider-surface`
 *      and makes no network call — the fabricated receipt APP-46 forbids, refused at the port.
 *   3. **A provider that will not mint a page is a reason, not a throw.** An un-activated billing
 *      portal is the common failure and it must reach the screen as one sentence, not a 500.
 *   4. **Nothing but a URL crosses.** No amount, no date, no invoice row: the answer is one link.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
  StripeBillingAdapter,
} from "@/lib/billing/adapters/stripe";
import { MockBillingAdapter } from "@/lib/billing/adapters/mock";
import { resetBillingAdapter } from "@/lib/billing";
import type { Subscription } from "@/lib/billing/types";

const db = vi.hoisted(() => {
  const state = { live: null as Subscription | null };
  return {
    state,
    async readActiveSubscription(_userId: string) {
      return state.live;
    },
    async writeSubscription(_client: unknown, subscription: Subscription) {
      state.live = subscription;
      return subscription;
    },
    async applyBillingEventOnce(
      _event: unknown,
      work: (client: unknown) => Promise<Subscription | null>,
    ) {
      return { applied: true, subscription: await work({}) };
    },
  };
});

vi.mock("@/lib/db/billing", () => ({
  applyBillingEventOnce: db.applyBillingEventOnce,
  writeSubscription: db.writeSubscription,
  readActiveSubscription: db.readActiveSubscription,
  ENTITLING_STATUSES: ["active", "trialing", "past_due"],
}));

/** Fixture credentials: shaped like the real variables, obviously not real values. */
const ENV = {
  STRIPE_TEST_SECRET_KEY: "sk_test_fixture_only_not_a_credential",
  STRIPE_TEST_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_TEST_PUBLISHABLE_KEY: "pk_test_fixture",
  BILLING_HOST: "alignsynch",
} as const;

const RETURN_URL = "https://alignsynch.com/dashboard/payment";

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    userId: "account-avery",
    planId: "basic",
    interval: "month",
    provider: "stripe",
    providerSubscriptionId: "sub_test_1",
    status: "active",
    livemode: false,
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * A `fetch` that answers per-path and records every call.
 *
 * `portal` is the answer to the session POST — a payload, or `{ status, message }` for the refusal
 * the provider returns when its customer portal has never been activated.
 */
function fakeFetch(input: {
  subscriptionPayload?: unknown;
  portal?: { payload?: unknown; status?: number; message?: string };
}) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] =
    [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const target = String(url);
    calls.push({
      url: target,
      method: String(init.method ?? "GET"),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? init.body : "",
    });
    if (target.includes("/billing_portal/sessions")) {
      const portal = input.portal ?? {};
      const status = portal.status ?? 200;
      const payload =
        portal.payload ??
        (portal.message === undefined
          ? { id: "bps_test_1", url: "https://billing.stripe.com/p/session/test_1" }
          : { error: { message: portal.message } });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify(
        input.subscriptionPayload ?? {
          id: "sub_test_1",
          object: "subscription",
          customer: "cus_test_1",
        },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function adapter(fetchImpl: typeof fetch) {
  return new StripeBillingAdapter({ env: ENV, fetch: fetchImpl });
}

beforeEach(() => {
  db.state.live = null;
  resetBillingAdapter();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the hosted adapter's invoice portal", () => {
  it("resolves the customer from the subscription and answers the provider's own url", async () => {
    db.state.live = subscription();
    const { impl, calls } = fakeFetch({});

    const answer = await adapter(impl).invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(true);
    if (!answer.available) throw new Error("expected a url");
    expect(answer.url).toBe("https://billing.stripe.com/p/session/test_1");
    expect(answer.provider).toBe("stripe");

    // The subscription read: by the id our row carries, on the pinned API version.
    const read = calls.find((call) => call.url === `${STRIPE_API_BASE}/subscriptions/sub_test_1`);
    expect(read?.method).toBe("GET");
    expect(read?.headers["stripe-version"]).toBe(STRIPE_API_VERSION);

    // The session: the customer the provider named, and this deployment's own return url.
    const minted = calls.find((call) => call.url === `${STRIPE_API_BASE}/billing_portal/sessions`);
    expect(minted?.method).toBe("POST");
    const body = new URLSearchParams(minted?.body ?? "");
    expect(body.get("customer")).toBe("cus_test_1");
    expect(body.get("return_url")).toBe(RETURN_URL);
    // No amount, no price and no line item is ever sent or read: this is a link, not a purchase.
    expect(minted?.body ?? "").not.toContain("amount");
    expect(minted?.body ?? "").not.toContain("price");
  });

  it("answers `no-subscription` without touching the provider when nothing is live", async () => {
    const { impl, calls } = fakeFetch({});
    const answer = await adapter(impl).invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("no-subscription");
    expect(calls).toHaveLength(0);
  });

  it("answers `unavailable` with the provider's sentence when the portal is not activated", async () => {
    db.state.live = subscription();
    const message =
      "No configuration provided and your test mode default configuration has not been created. " +
      "Provide a configuration or create your default by saving your customer portal settings in " +
      "test mode at https://dashboard.stripe.com/test/settings/billing/portal.";
    const { impl } = fakeFetch({ portal: { status: 400, message } });

    const answer = await adapter(impl).invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("unavailable");
    // The operator's sentence travels in `detail` — where to activate the portal — and never as the
    // screen's copy.
    expect(answer.detail).toContain("dashboard.stripe.com/test/settings/billing/portal");
  });

  it("answers `unavailable` when the subscription names no customer", async () => {
    db.state.live = subscription();
    const { impl, calls } = fakeFetch({
      subscriptionPayload: { id: "sub_test_1", object: "subscription", customer: null },
    });

    const answer = await adapter(impl).invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("unavailable");
    // And it does not mint a session it cannot fill in.
    expect(calls.some((call) => call.url.includes("/billing_portal/sessions"))).toBe(false);
  });

  it("answers `unavailable` when the provider mints a session with no url", async () => {
    db.state.live = subscription();
    const { impl } = fakeFetch({ portal: { payload: { id: "bps_test_1", url: null } } });

    const answer = await adapter(impl).invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("unavailable");
  });
});

describe("the offline adapter's invoice portal", () => {
  it("refuses its own rows with `no-provider-surface` and no network call", async () => {
    db.state.live = subscription({
      provider: "mock",
      providerSubscriptionId: "mock-sub-basic-month-1",
    });
    const fetchSpy = vi.fn();
    const answer = await new MockBillingAdapter().invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("no-provider-surface");
    expect(answer.detail).toContain("mock-sub-basic-month-1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers `no-subscription` when the account holds no live row", async () => {
    const answer = await new MockBillingAdapter().invoicePortal({
      userId: "account-avery",
      returnUrl: RETURN_URL,
    });

    expect(answer.available).toBe(false);
    if (answer.available) throw new Error("expected a refusal");
    expect(answer.reason).toBe("no-subscription");
  });
});
