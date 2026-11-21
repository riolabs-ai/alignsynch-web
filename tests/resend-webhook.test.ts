/**
 * The provider's inbound deliveries, asserted (#439b).
 *
 * Four things this file proves, and why each one is a test rather than a review note:
 *
 *   **a signature is the only way in.** An unsigned delivery, a body altered by one byte, a
 *   signature minted with another endpoint's secret and a timestamp outside the window all answer
 *   401 and write nothing — the "zero rows" claim is a property of the code, not of a rollback.
 *
 *   **a hard bounce suppresses, and a soft one does not.** `Permanent` (and the card's own word,
 *   `hard`) sets `bounced_at`; `Transient` and `Undetermined` store the row and mark nothing,
 *   because cutting a real address off after one temporary refusal is the failure this rule exists
 *   to prevent. A complaint marks `complained_at`; `email.delivered` marks nothing.
 *
 *   **a redelivery is idempotent.** The store's `ON CONFLICT (provider_event_id) DO NOTHING` is
 *   driven here through an in-memory store with the same semantics, so the second delivery of one
 *   `svix-id` answers 200 and the row count stays at one. The live proof against Postgres is the
 *   card's acceptance run, not this file.
 *
 *   **an unconfigured deployment refuses before it reads a body.** `RESEND_WEBHOOK_SECRET` unset
 *   answers 503 and the body thunk is never called — the card forbids accepting an unsigned
 *   delivery "temporarily", and reading first would also let an anonymous caller buffer an upload
 *   the endpoint is about to reject.
 *
 *   **a deployment that does not own the endpoint refuses before either.** The provider's account
 *   webhook belongs to `alignsynch.com`, so a deployment Vercel reports as anything but `production`
 *   answers `410` and never reaches the secret, the body or the store (#1338). A tree with no
 *   `VERCEL_ENV` — local `pnpm dev`, CI, the signed `curl` in `docs/operations/resend-inbound.md` —
 *   is not a deployment and keeps working, which is why the whole file still passes as it did.
 *
 * The signature cases are minted with the provider's own algorithm written out independently of
 * `lib/email/signature.ts` (base64-decode the secret, HMAC the three-part string), so passing them
 * is evidence about the algorithm rather than about a shared helper.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ apply: vi.fn(), countRecent: vi.fn() }));

vi.mock("@/lib/db/email-events", () => ({
  applyEmailEventOnce: db.apply,
  countRecentEmailEvents: db.countRecent,
}));

import { POST } from "@/app/api/resend/webhook/route";
import { parseEmailWebhook } from "@/lib/email/inbound";
import {
  EmailWebhookRefusal,
  parseSvixSignatureHeader,
  svixSigningKey,
  verifySvixSignature,
} from "@/lib/email/signature";
import {
  EMAIL_WEBHOOK_RATE_MAX,
  type EmailEventStore,
  type EmailEventStoreOutcome,
  type EmailEventWrite,
  handleEmailWebhook,
} from "@/lib/email/webhook";

/** The provider's documented secret shape: `whsec_` + base64. A fixture, not a deployment value. */
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const OTHER_SECRET = "whsec_c2Vjb25kLWtleS1mb3ItYW5vdGhlci1lbmRwb2ludA==";
const DELIVERY_ID = "msg_2bXk1eQ4pLmN0rTzVwY7aC";
const NOW = new Date("2026-11-03T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const ADDRESS = "Avery.Person@Example.com";
const NORMALISED = "avery.person@example.com";
const SUBJECT = "Your invitation to the assessment";
const OCCURRED_AT = "2026-11-03T11:58:31.000Z";

/**
 * `v1,base64(HMAC-SHA256(base64Decode(secret), `${id}.${timestamp}.${body}`))` — the provider's
 * algorithm, written here without touching the module under test.
 */
function sign(
  body: string,
  over: { id?: string; timestamp?: string; secret?: string } = {},
): string {
  const id = over.id ?? DELIVERY_ID;
  const timestamp = over.timestamp ?? String(NOW_SECONDS);
  const secret = over.secret ?? SECRET;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const mac = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");
  return `v1,${mac}`;
}

/** The envelope the provider posts: `type`, `created_at` and a per-type `data`. No id in the body. */
function body(
  type: string,
  data: Record<string, unknown>,
  createdAt = "2026-11-03T11:59:00.000Z",
): string {
  return JSON.stringify({ type, created_at: createdAt, data });
}

/** The `data` every email event carries, with the parts a case cares about on top. */
function emailData(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    from: "assessments@example.test",
    to: [ADDRESS],
    subject: SUBJECT,
    created_at: OCCURRED_AT,
    ...over,
  };
}

function bounced(bounceType: string, over: Record<string, unknown> = {}): string {
  return body(
    "email.bounced",
    emailData({ bounce: { type: bounceType, subType: "General", message: "550" }, ...over }),
  );
}

/**
 * A store with the semantics the SQL has: `provider_event_id` is unique, so a replay inserts
 * nothing and writes no second mark.
 */
function memoryStore(): {
  rows: Map<string, EmailEventWrite>;
  marks: Map<string, Set<string>>;
  store: EmailEventStore;
} {
  const rows = new Map<string, EmailEventWrite>();
  const marks = new Map<string, Set<string>>();
  const store: EmailEventStore = {
    apply: async (event) => {
      if (rows.has(event.providerEventId)) return { stored: false, reason: "duplicate" };
      rows.set(event.providerEventId, event);
      if (event.suppression === null) return { stored: true, marked: false };
      const existing = marks.get(event.recipient) ?? new Set<string>();
      existing.add(event.suppression);
      marks.set(event.recipient, existing);
      return { stored: true, marked: true };
    },
    countRecent: async () => 0,
  };
  return { rows, marks, store };
}

/** One delivery, the way the route receives it. */
async function deliver(
  rawBody: string,
  over: {
    id?: string;
    timestamp?: string;
    signature?: string | null;
    secret?: string;
    store?: EmailEventStore;
    now?: Date;
    ipHash?: string;
    deployment?: { vercelEnv: string | undefined };
  } = {},
) {
  const store = over.store ?? memoryStore().store;
  const timestamp = over.timestamp ?? String(NOW_SECONDS);
  const id = over.id ?? DELIVERY_ID;
  const readBody = vi.fn(async () => rawBody);
  const outcome = await handleEmailWebhook({
    readBody,
    headers: {
      id,
      timestamp,
      signature: over.signature === undefined ? sign(rawBody, { id, timestamp }) : over.signature,
    },
    ipHash: over.ipHash ?? "0".repeat(32),
    secret: over.secret ?? SECRET,
    store,
    now: over.now ?? NOW,
    // A tree with no `VERCEL_ENV` is the default, so the cases that predate #1338 keep the
    // behaviour they were written against.
    deployment: over.deployment ?? { vercelEnv: undefined },
  });
  return { outcome, store, readBody };
}

describe("the signature is the provider's, not ours", () => {
  it("decodes the whsec_ secret as base64 and drops the prefix", () => {
    expect(svixSigningKey(SECRET)).toEqual(Buffer.from(SECRET.slice("whsec_".length), "base64"));
  });

  it("reads several space-separated v1 entries, as a rotation sends them", () => {
    expect(parseSvixSignatureHeader("v1,aaa= v1,bbb=")).toEqual([
      { version: "v1", signature: "aaa=" },
      { version: "v1", signature: "bbb=" },
    ]);
  });

  it("accepts a delivery whose second entry matches", () => {
    const raw = bounced("Permanent");
    const header = `v1,${Buffer.from("not-a-signature").toString("base64")} ${sign(raw)}`;
    expect(() =>
      verifySvixSignature({
        rawBody: raw,
        headers: { id: DELIVERY_ID, timestamp: String(NOW_SECONDS), signature: header },
        secret: SECRET,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("refuses a body altered after signing", () => {
    const signed = bounced("Permanent");
    // One extra byte — a trailing space — is enough: the signature covers the raw body, not its
    // parsed meaning.
    expect(() =>
      verifySvixSignature({
        rawBody: `${signed} `,
        headers: {
          id: DELIVERY_ID,
          timestamp: String(NOW_SECONDS),
          signature: sign(signed),
        },
        secret: SECRET,
        now: NOW,
      }),
    ).toThrow(EmailWebhookRefusal);
  });

  it("refuses a signature minted with another endpoint's secret", () => {
    const raw = bounced("Permanent");
    let refusal: unknown;
    try {
      verifySvixSignature({
        rawBody: raw,
        headers: {
          id: DELIVERY_ID,
          timestamp: String(NOW_SECONDS),
          signature: sign(raw, { secret: OTHER_SECRET }),
        },
        secret: SECRET,
        now: NOW,
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(EmailWebhookRefusal);
    expect((refusal as EmailWebhookRefusal).code).toBe("mismatch");
  });

  it("refuses a delivery outside the five-minute window in either direction", () => {
    const raw = bounced("Permanent");
    for (const timestamp of [NOW_SECONDS - 301, NOW_SECONDS + 301]) {
      expect(() =>
        verifySvixSignature({
          rawBody: raw,
          headers: {
            id: DELIVERY_ID,
            timestamp: String(timestamp),
            signature: sign(raw, { timestamp: String(timestamp) }),
          },
          secret: SECRET,
          now: NOW,
        }),
      ).toThrow(/outside the 300s tolerance/);
    }
  });
});

describe("what a delivery does to the address", () => {
  it("a hard bounce is one row and one mark", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Permanent"), { store: memory.store });

    expect(outcome.status).toBe(200);
    expect(outcome.kind).toBe("stored");
    expect(outcome.marked).toBe(true);
    expect(memory.rows.size).toBe(1);
    const row = [...memory.rows.values()][0];
    expect(row).toMatchObject({
      providerEventId: DELIVERY_ID,
      type: "email.bounced",
      recipient: NORMALISED,
      subject: SUBJECT,
      suppression: "bounced",
    });
    expect(row?.occurredAt.toISOString()).toBe(OCCURRED_AT);
    expect([...(memory.marks.get(NORMALISED) ?? [])]).toEqual(["bounced"]);
  });

  it("accepts the card's own word for a hard bounce", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("hard"), { store: memory.store });
    expect(outcome.marked).toBe(true);
    expect([...(memory.marks.get(NORMALISED) ?? [])]).toEqual(["bounced"]);
  });

  it("a soft bounce is a row and no mark", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Transient"), { store: memory.store });
    expect(outcome.status).toBe(200);
    expect(outcome.marked).toBe(false);
    expect(memory.rows.size).toBe(1);
    expect([...memory.rows.values()][0]?.suppression).toBeNull();
    expect(memory.marks.size).toBe(0);
  });

  it("an undetermined bounce is not treated as permanent", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Undetermined"), { store: memory.store });
    expect(outcome.marked).toBe(false);
    expect(memory.marks.size).toBe(0);
  });

  it("a complaint marks the address and a delivery does not", async () => {
    const memory = memoryStore();
    const complaint = await deliver(body("email.complained", emailData()), { store: memory.store });
    const delivered = await deliver(body("email.delivered", emailData()), {
      store: memory.store,
      id: "msg_delivered",
    });

    expect(complaint.outcome.marked).toBe(true);
    expect(delivered.outcome.marked).toBe(false);
    expect([...(memory.marks.get(NORMALISED) ?? [])]).toEqual(["complained"]);
    expect(memory.rows.size).toBe(2);
  });

  it("a replay of one delivery is 200 with one row", async () => {
    const memory = memoryStore();
    const raw = bounced("Permanent");
    const first = await deliver(raw, { store: memory.store });
    const replay = await deliver(raw, { store: memory.store });

    expect(first.outcome.kind).toBe("stored");
    expect(replay.outcome.status).toBe(200);
    expect(replay.outcome.kind).toBe("duplicate");
    expect(replay.outcome.marked).toBeUndefined();
    expect(memory.rows.size).toBe(1);
    expect([...(memory.marks.get(NORMALISED) ?? [])]).toEqual(["bounced"]);
  });
});

describe("what is refused, and with what", () => {
  it("an unsigned delivery is 401 and writes nothing", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Permanent"), {
      store: memory.store,
      signature: null,
    });
    expect(outcome.status).toBe(401);
    expect(outcome.refusal).toBe("unsigned");
    expect(memory.rows.size).toBe(0);
  });

  it("a wrong signature is 401 and writes nothing", async () => {
    const memory = memoryStore();
    const raw = bounced("Permanent");
    const { outcome } = await deliver(raw, {
      store: memory.store,
      signature: sign(raw, { secret: OTHER_SECRET }),
    });
    expect(outcome.status).toBe(401);
    expect(outcome.refusal).toBe("mismatch");
    expect(memory.rows.size).toBe(0);
  });

  it("an unset secret is 503 and the body is never read", async () => {
    const { outcome, readBody } = await deliver(bounced("Permanent"), { secret: "" });
    expect(outcome.status).toBe(503);
    expect(outcome.kind).toBe("unconfigured");
    expect(readBody).not.toHaveBeenCalled();
  });

  it("an unknown event type is 200, ignored, and stores nothing", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(body("email.opened", emailData()), { store: memory.store });
    expect(outcome.status).toBe(200);
    expect(outcome.kind).toBe("ignored");
    expect(memory.rows.size).toBe(0);
  });

  it("a handled event with no usable recipient is 200, ignored, and stores nothing", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Permanent", { to: [] }), { store: memory.store });
    expect(outcome.status).toBe(200);
    expect(outcome.kind).toBe("ignored");
    expect(outcome.detail).toBe("no-recipient");
    expect(memory.rows.size).toBe(0);
  });

  it("a signed body that is not JSON is 400, and nothing is written", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver("not json at all", { store: memory.store });
    expect(outcome.status).toBe(400);
    expect(outcome.kind).toBe("unreadable");
    expect(memory.rows.size).toBe(0);
  });

  it("a client over its budget is 429 before anything is written", async () => {
    const memory = memoryStore();
    const apply = vi.fn(memory.store.apply);
    const { outcome } = await deliver(bounced("Permanent"), {
      store: { apply, countRecent: async () => EMAIL_WEBHOOK_RATE_MAX },
    });
    expect(outcome.status).toBe(429);
    expect(outcome.kind).toBe("throttled");
    expect(apply).not.toHaveBeenCalled();
  });

  it("a store that cannot answer is 503, not a quiet success", async () => {
    const { outcome } = await deliver(bounced("Permanent"), {
      store: {
        apply: async () => {
          throw new Error("connection terminated");
        },
        countRecent: async () => 0,
      },
    });
    expect(outcome.status).toBe(503);
    expect(outcome.kind).toBe("unavailable");
  });
});

describe("a deployment that does not own the endpoint", () => {
  /** The store, as spies, so "never asked" is a fact rather than a zero row count. */
  function spyStore() {
    const apply = vi.fn(
      async (_event: EmailEventWrite): Promise<EmailEventStoreOutcome> => ({
        stored: true,
        marked: true,
      }),
    );
    const countRecent = vi.fn(async (_ipHash: string, _since: Date) => 0);
    return { apply, countRecent, store: { apply, countRecent } };
  }

  it("a validly signed delivery to a preview deployment is 410, and the store is never asked", async () => {
    const spies = spyStore();
    const { outcome, readBody } = await deliver(bounced("Permanent"), {
      store: spies.store,
      deployment: { vercelEnv: "preview" },
    });

    expect(outcome.status).toBe(410);
    expect(outcome.kind).toBe("not-owner");
    expect(outcome.refusal).toBe("deployment");
    expect(spies.apply).not.toHaveBeenCalled();
    expect(spies.countRecent).not.toHaveBeenCalled();
    // Before the body is read: a non-owner does not buffer an upload it will refuse.
    expect(readBody).not.toHaveBeenCalled();
  });

  it("the same delivery to a production deployment is stored as before", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Permanent"), {
      store: memory.store,
      deployment: { vercelEnv: "production" },
    });

    expect(outcome.status).toBe(200);
    expect(outcome.kind).toBe("stored");
    expect(outcome.marked).toBe(true);
    expect(memory.rows.size).toBe(1);
  });

  it("the same delivery on a tree with no VERCEL_ENV is stored — local, CI and the signed curl", async () => {
    const memory = memoryStore();
    const { outcome } = await deliver(bounced("Permanent"), {
      store: memory.store,
      deployment: { vercelEnv: undefined },
    });

    expect(outcome.status).toBe(200);
    expect(outcome.kind).toBe("stored");
    expect(memory.rows.size).toBe(1);
  });

  it("an unset secret on a preview deployment is 410, not 503 — the order is the decision", async () => {
    const spies = spyStore();
    const { outcome } = await deliver(bounced("Permanent"), {
      secret: "",
      store: spies.store,
      deployment: { vercelEnv: "preview" },
    });

    // "Not this deployment's endpoint" is the first true sentence; "you are misconfigured" is not.
    expect(outcome.status).toBe(410);
    expect(outcome.kind).toBe("not-owner");
    expect(spies.apply).not.toHaveBeenCalled();
  });

  it("refuses every non-production identity Vercel reports, not only preview", async () => {
    for (const vercelEnv of ["preview", "development", "staging", "Production"]) {
      const spies = spyStore();
      const { outcome } = await deliver(bounced("Permanent"), {
        store: spies.store,
        deployment: { vercelEnv },
      });
      expect(outcome.status).toBe(410);
      expect(spies.apply).not.toHaveBeenCalled();
    }
  });
});

describe("a log line never carries the delivery", () => {
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  const previousVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    db.apply.mockReset();
    db.countRecent.mockReset();
    db.countRecent.mockResolvedValue(0);
    db.apply.mockResolvedValue({ stored: true, marked: true });
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    // A shell that carries a deployment identity would answer every delivery here with a 410.
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previous;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    vi.restoreAllMocks();
  });

  it("logs the event type and the delivery id, never the address or the subject", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }

    /** A signed delivery of `raw`, the way the provider posts one. */
    const send = (raw: string, id = DELIVERY_ID) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      return POST(
        new Request("http://localhost/api/resend/webhook", {
          method: "POST",
          body: raw,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.7",
            "svix-id": id,
            "svix-timestamp": timestamp,
            "svix-signature": sign(raw, { id, timestamp }),
          },
        }),
      );
    };

    // A stored delivery, its redelivery, an ignored type, a handled type with no address, and an
    // unsigned one — one of each line the route can print, so "no address" is not one path's
    // accident.
    db.apply.mockResolvedValueOnce({ stored: true, marked: true });
    db.apply.mockResolvedValueOnce({ stored: false, reason: "duplicate" });
    await send(bounced("Permanent"));
    await send(bounced("Permanent"));
    await send(body("email.opened", emailData()));
    await send(bounced("Permanent", { to: [] }));
    await POST(
      new Request("http://localhost/api/resend/webhook", {
        method: "POST",
        body: bounced("Permanent"),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      }),
    );

    const joined = lines.join("\n");
    expect(joined).toContain("email.bounced");
    expect(joined).toContain(DELIVERY_ID);
    expect(joined).not.toContain(NORMALISED);
    expect(joined).not.toContain("Avery.Person");
    expect(joined).not.toContain(SUBJECT);
    expect(joined).not.toContain(SECRET);
  });
});

describe("parseEmailWebhook", () => {
  it("falls back to the envelope's instant, then to the caller's clock", () => {
    const parsed = parseEmailWebhook(
      body("email.delivered", { to: [ADDRESS], subject: "Hi" }, "2026-11-03T11:59:59.000Z"),
      NOW,
    );
    expect(parsed.kind).toBe("handled");
    if (parsed.kind !== "handled") return;
    expect(parsed.event.recipient).toBe(NORMALISED);
    expect(parsed.event.occurredAt.toISOString()).toBe("2026-11-03T11:59:59.000Z");

    const noInstant = parseEmailWebhook(
      JSON.stringify({ type: "email.delivered", data: { to: ADDRESS } }),
      NOW,
    );
    expect(noInstant.kind).toBe("handled");
    if (noInstant.kind !== "handled") return;
    expect(noInstant.event.occurredAt).toEqual(NOW);
    expect(noInstant.event.subject).toBeNull();
  });
});

describe("POST /api/resend/webhook", () => {
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  // A Vercel deployment sets `VERCEL_ENV` for the whole process; a shell that happens to carry it
  // would otherwise make every case here a 410 (#1338). Deleted for the run, restored after it.
  const previousVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    db.apply.mockReset();
    db.countRecent.mockReset();
    db.countRecent.mockResolvedValue(0);
    db.apply.mockResolvedValue({ stored: true, marked: true });
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previous;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    vi.restoreAllMocks();
  });

  function request(
    raw: string,
    over: { id?: string; timestamp?: string; signature?: string | null } = {},
  ) {
    const id = over.id ?? DELIVERY_ID;
    const timestamp = over.timestamp ?? String(Math.floor(Date.now() / 1000));
    const signature = over.signature === undefined ? sign(raw, { id, timestamp }) : over.signature;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    };
    if (id !== "") headers["svix-id"] = id;
    if (timestamp !== "") headers["svix-timestamp"] = timestamp;
    if (signature !== null) headers["svix-signature"] = signature;
    return new Request("http://localhost/api/resend/webhook", {
      method: "POST",
      body: raw,
      headers,
    });
  }

  it("a signed hard bounce answers 200 and writes one event", async () => {
    const raw = bounced("Permanent");
    const response = await POST(request(raw));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, stored: true, marked: true });
    expect(db.apply).toHaveBeenCalledTimes(1);
    const write = db.apply.mock.calls[0]?.[0] as EmailEventWrite;
    expect(write).toMatchObject({
      providerEventId: DELIVERY_ID,
      type: "email.bounced",
      recipient: NORMALISED,
      suppression: "bounced",
    });
    expect(write.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("a replay answers 200 and the store sees one insert", async () => {
    db.apply.mockResolvedValueOnce({ stored: true, marked: true });
    db.apply.mockResolvedValueOnce({ stored: false, reason: "duplicate" });
    const raw = bounced("Permanent");
    expect((await POST(request(raw))).status).toBe(200);
    const replay = await POST(request(raw));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ duplicate: true, stored: false });
  });

  it("an unsigned delivery is 401 and the store is never asked", async () => {
    const response = await POST(request(bounced("Permanent"), { signature: null }));
    expect(response.status).toBe(401);
    expect(db.apply).not.toHaveBeenCalled();
    expect(db.countRecent).not.toHaveBeenCalled();
  });

  it("an unset secret is 503 and the store is never asked", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const response = await POST(request(bounced("Permanent")));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "unconfigured" });
    expect(db.apply).not.toHaveBeenCalled();
  });

  it("a delivered event is stored and marks nothing", async () => {
    db.apply.mockResolvedValue({ stored: true, marked: false });
    const response = await POST(request(body("email.delivered", emailData())));
    expect(response.status).toBe(200);
    const write = db.apply.mock.calls[0]?.[0] as EmailEventWrite;
    expect(write.suppression).toBeNull();
  });

  it("a client over budget answers 429 with a retry-after and writes nothing", async () => {
    db.countRecent.mockResolvedValue(EMAIL_WEBHOOK_RATE_MAX);
    const response = await POST(request(bounced("Permanent")));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(db.apply).not.toHaveBeenCalled();
  });

  it("with VERCEL_ENV=preview answers 410 and never touches the store", async () => {
    // The route, not the handler: this is the case that proves `process.env.VERCEL_ENV` reaches
    // `deployment.vercelEnv` — a correct signature and a set secret included, so the only thing
    // that can produce this status is the deployment's identity.
    process.env.VERCEL_ENV = "preview";
    const response = await POST(request(bounced("Permanent")));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: "not-owner" });
    expect(db.apply).not.toHaveBeenCalled();
    expect(db.countRecent).not.toHaveBeenCalled();
  });

  it("with VERCEL_ENV=production answers 200 and writes the event", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(request(bounced("Permanent")));
    expect(response.status).toBe(200);
    expect(db.apply).toHaveBeenCalledTimes(1);
  });

  it("logs the deployment identity on a 410, and nothing about the delivery", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    process.env.VERCEL_ENV = "preview";
    await POST(request(bounced("Permanent")));

    const joined = lines.join("\n");
    // The one line an operator greps to confirm the platform variable really arrives (#1338).
    expect(joined).toContain("vercelEnv=preview");
    expect(joined).not.toContain(NORMALISED);
    expect(joined).not.toContain(SUBJECT);
  });
});
