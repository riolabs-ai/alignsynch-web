/**
 * `env > setting > default` — the precedence, the refusals and the two call sites (#1443 §11).
 *
 * Five claims, and each is one the card's acceptance line names:
 *
 *   1. **The order is the order.** An environment variable beats a stored row, a stored row beats
 *      the default, and a value that does not parse falls to the default *with its sentence* rather
 *      than quietly obeying the layer beneath it.
 *   2. **A shadowed row says so.** `shadowedByEnv` is true exactly when a stored row exists *and*
 *      the environment carries the key, which is the state the form draws a badge for.
 *   3. **A secret is refused by name.** `RESEND_API_KEY` answers `vault-sourced`; `NAV_SOURCE` and
 *      `DEMO_ALLOW_PRODUCTION` answer `fixed-by-deployment` with their reason; a typo answers
 *      `unknown-key`. None of the three reaches a statement.
 *   4. **The database's allow-list and the registry are the same list.** The migration's CHECK is
 *      the refusal an INSERT meets, so a key added to one and not the other would be a form that
 *      offers a field the table rejects — read out of the SQL, not remembered.
 *   5. **An env-set key wins at the real call sites**, not only in the pure function: `sendMail`
 *      posts the environment's From header, and the health screen's drift limit is the
 *      environment's number even while a stored row says otherwise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRIFT_LIMIT,
  DEFAULT_FRESHNESS_HOURS,
  knobsFromEnv,
  knobsOf,
  driftLimitOf,
} from "@/lib/admin/platform-health";
import { DEFAULT_FROM, RESEND_ENDPOINT, sendMail } from "@/lib/flow/email";
import {
  DEMO_ALLOW_PRODUCTION,
  GOVERNED_KEYS,
  NAV_SOURCE,
  PLATFORM_HEALTH_DRIFT_LIMIT,
  PLATFORM_HEALTH_DRIFT_LIMIT_FALLBACK,
  PLATFORM_HEALTH_FRESHNESS_HOURS,
  RESEND_ENDPOINT as RESEND_ENDPOINT_KEY,
  RESEND_ENDPOINT_FALLBACK,
  RESEND_FROM,
  RESEND_FROM_FALLBACK,
  type GovernedSpec,
  WRITABLE_KEYS,
  governedSpecOf,
  resolveGoverned,
  resolveFromEnv,
} from "@/lib/admin/settings/governed";
import type { ActSql } from "@/lib/admin/act";
import {
  readStoredSettings,
  refusalFor,
  resolveGovernedSettings,
  valueToStore,
} from "@/lib/admin/settings/values";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A spec by key, or a throw that names the missing one rather than a `undefined` deref. */
function spec(key: string): GovernedSpec {
  const found = governedSpecOf(key);
  if (found === null) throw new Error(`test: ${key} is not in the registry`);
  return found;
}

/** A statement runner whose one answer is the rows it is handed. */
function rowsSql(rows: readonly { key: string; value: unknown }[]): ActSql & { reads: number } {
  const answer = {
    reads: 0,
    query: async <R>() => {
      answer.reads += 1;
      return { rows: rows as unknown as readonly R[] };
    },
  };
  return answer;
}

describe("the precedence", () => {
  const drift = spec(PLATFORM_HEALTH_DRIFT_LIMIT);

  it("answers the default when neither source carries the key", () => {
    const resolution = resolveGoverned(drift, { env: undefined, stored: null });
    expect(resolution).toMatchObject({
      key: PLATFORM_HEALTH_DRIFT_LIMIT,
      value: "5",
      source: "default",
      shadowedByEnv: false,
      stored: null,
      problem: null,
      writable: true,
    });
  });

  it("answers the stored row when the environment says nothing, and calls it a setting", () => {
    const resolution = resolveGoverned(drift, { env: undefined, stored: "12" });
    expect(resolution).toMatchObject({ value: "12", source: "setting", shadowedByEnv: false });
  });

  it("lets the environment beat a stored row, and marks the row as shadowed", () => {
    const resolution = resolveGoverned(drift, { env: "9", stored: "3" });
    expect(resolution).toMatchObject({
      value: "9",
      source: "env",
      shadowedByEnv: true,
      stored: "3",
    });
  });

  it("does not claim shadowing when only the environment carries the key", () => {
    expect(resolveGoverned(drift, { env: "9", stored: null }).shadowedByEnv).toBe(false);
  });

  it("falls to the default with the reader's sentence when the winning value is not a count", () => {
    const resolution = resolveGoverned(drift, { env: "five", stored: "3" });
    expect(resolution.value).toBe("5");
    expect(resolution.source).toBe("default");
    expect(resolution.problem).toBe(
      'PLATFORM_HEALTH_DRIFT_LIMIT="five" is not a whole number of commits; the default applies',
    );
  });

  it("refuses a stored value the same way, so a bad row cannot reach a reader", () => {
    const resolution = resolveGoverned(drift, { env: undefined, stored: "-1" });
    expect(resolution).toMatchObject({ value: "5", source: "default" });
    expect(resolution.problem).toContain("is not a whole number of commits");
  });

  it("treats a blank value as absent, at either source", () => {
    expect(resolveGoverned(drift, { env: "   ", stored: "  " })).toMatchObject({
      value: "5",
      source: "default",
      shadowedByEnv: false,
    });
  });

  it("reads text settings verbatim", () => {
    const resolution = resolveGoverned(spec(RESEND_FROM), {
      env: undefined,
      stored: "ops@example.com",
    });
    expect(resolution).toMatchObject({ value: "ops@example.com", source: "setting" });
  });
});

describe("the governed set", () => {
  it("names six keys, four of them writable", () => {
    expect(GOVERNED_KEYS).toHaveLength(6);
    expect(WRITABLE_KEYS).toEqual([
      PLATFORM_HEALTH_DRIFT_LIMIT,
      PLATFORM_HEALTH_FRESHNESS_HOURS,
      RESEND_FROM,
      RESEND_ENDPOINT_KEY,
    ]);
  });

  it("refuses the two a stored value could never move, with the reason on the row", () => {
    for (const key of [DEMO_ALLOW_PRODUCTION, NAV_SOURCE]) {
      const found = spec(key);
      expect(found.fixedBy).not.toBeNull();
      expect(found.fixedBy).toContain("read");
      const resolution = resolveGoverned(found, { env: undefined, stored: "x" });
      expect(resolution.writable).toBe(false);
    }
  });

  it("refuses a vault-sourced secret by name", () => {
    const refusal = refusalFor("RESEND_API_KEY");
    expect(refusal?.reason).toBe("vault-sourced");
    expect(refusal?.message).toContain("RESEND_API_KEY");
    expect(refusal?.message).toContain("vault-sourced secret");
  });

  it("refuses a governed key that is fixed by the deployment, and an unknown name", () => {
    expect(refusalFor(NAV_SOURCE)?.reason).toBe("fixed-by-deployment");
    expect(refusalFor("NOT_A_REAL_KEY")?.reason).toBe("unknown-key");
  });

  it("accepts the four writable keys", () => {
    for (const key of WRITABLE_KEYS) expect(refusalFor(key)).toBeNull();
  });

  it("holds the migration's allow-list equal to the writable set", () => {
    const sql = readFileSync(join(ROOT, "db/migrations/0046_setting.sql"), "utf8");
    const check = /CONSTRAINT setting_key_governed CHECK \(\s*key IN \(([\s\S]*?)\)\s*\)/.exec(sql);
    expect(check).not.toBeNull();
    const allowed = [...(check?.[1] ?? "").matchAll(/'([A-Z0-9_]+)'/g)].map((match) => match[1]);
    expect(allowed).toEqual([...WRITABLE_KEYS]);
  });

  it("keeps one spelling of each default", () => {
    expect(DEFAULT_DRIFT_LIMIT).toBe(Number.parseInt(PLATFORM_HEALTH_DRIFT_LIMIT_FALLBACK, 10));
    expect(DEFAULT_FRESHNESS_HOURS).toBe(72);
    expect(DEFAULT_FROM).toBe(RESEND_FROM_FALLBACK);
    expect(RESEND_ENDPOINT).toBe(RESEND_ENDPOINT_FALLBACK);
  });
});

describe("the store", () => {
  it("answers `absent` with no connection string, which is the gate and the build", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const stored = await readStoredSettings();
      expect(stored).toEqual({ state: "absent", values: {} });
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("answers `unmigrated` for an undefined table rather than failing a send", async () => {
    const sql: ActSql = {
      query: async () => {
        throw Object.assign(new Error('relation "setting" does not exist'), { code: "42P01" });
      },
    };
    await expect(readStoredSettings(sql)).resolves.toEqual({ state: "unmigrated", values: {} });
  });

  it("rethrows any other read failure — silence would discard an override", async () => {
    const sql: ActSql = {
      query: async () => {
        throw Object.assign(new Error("permission denied"), { code: "42501" });
      },
    };
    await expect(readStoredSettings(sql)).rejects.toThrow("permission denied");
  });

  it("resolves six keys from one read, and lets env beat a stored row", async () => {
    const sql = rowsSql([{ key: PLATFORM_HEALTH_DRIFT_LIMIT, value: "3" }]);
    const settings = await resolveGovernedSettings({
      env: { [PLATFORM_HEALTH_DRIFT_LIMIT]: "9" },
      sql,
    });
    expect(sql.reads).toBe(1);
    expect(settings.store).toBe("read");
    const drift = settings.resolutions.find((row) => row.key === PLATFORM_HEALTH_DRIFT_LIMIT);
    expect(drift).toMatchObject({ value: "9", source: "env", shadowedByEnv: true, stored: "3" });
    const freshness = settings.resolutions.find(
      (row) => row.key === PLATFORM_HEALTH_FRESHNESS_HOURS,
    );
    expect(freshness).toMatchObject({ value: "72", source: "default" });
  });
});

describe("the value a form may store", () => {
  it("trims a count and refuses one that is not a whole number", () => {
    expect(valueToStore(spec(RESEND_FROM), "  ops@example.com ")).toEqual({
      stored: "ops@example.com",
    });
    const refused = valueToStore(spec(PLATFORM_HEALTH_FRESHNESS_HOURS), "1.5");
    expect(refused).toBeInstanceOf(Error);
    expect((refused as { reason?: string }).reason).toBe("invalid-value");
  });

  it("reads an empty value as clearing the row", () => {
    expect(valueToStore(spec(RESEND_FROM), "   ")).toEqual({ stored: null });
  });
});

describe("the call sites", () => {
  it("sends with the environment's From header when one is set", async () => {
    const previousEnv = { ...process.env };
    process.env.RESEND_API_KEY = "re_live_key";
    process.env.RESEND_FROM = "env@example.com";
    delete process.env.DATABASE_URL;
    const sent: { url: string; body: string }[] = [];
    try {
      const outcome = await sendMail(
        { to: "someone@example.com", subject: "s", text: "t" },
        {
          sender: "invite",
          fetchImpl: (async (url: string, init: { body: string }) => {
            sent.push({ url: String(url), body: String(init.body) });
            return new Response("{}", { status: 200 });
          }) as unknown as typeof fetch,
        },
      );
      expect(outcome).toBe("sent");
      expect(JSON.parse(sent[0]?.body ?? "{}").from).toBe("env@example.com");
    } finally {
      process.env = previousEnv;
    }
  });

  it("gives the health screen the environment's limit while a stored row says otherwise", async () => {
    const sql = rowsSql([{ key: PLATFORM_HEALTH_DRIFT_LIMIT, value: "3" }]);
    const settings = await resolveGovernedSettings({
      env: { [PLATFORM_HEALTH_DRIFT_LIMIT]: "9" },
      sql,
    });
    const limit = driftLimitOf(knobsOf(settings.resolutions).drift);
    expect(limit).toMatchObject({ limit: 9, origin: "env", problem: null });
  });

  it("still answers `env > default` with no store at all", () => {
    const knobs = knobsFromEnv({ [PLATFORM_HEALTH_FRESHNESS_HOURS]: "24" });
    expect(knobs.freshness).toMatchObject({ value: "24", source: "env" });
    expect(resolveFromEnv(spec(RESEND_ENDPOINT_KEY), {}).value).toBe(RESEND_ENDPOINT_FALLBACK);
  });
});
