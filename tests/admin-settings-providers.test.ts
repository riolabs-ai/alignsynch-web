/**
 * The settings directory's grouping (#1443) — every row has an account, or the build says which row
 * does not.
 *
 * **Why this is a test and not a type.** `provider` is declared on the row and the ids come from
 * `data/integrations.ts`, so a *typed* row cannot name a provider that does not exist. What the type
 * cannot see is the row nobody stamped at all: `ENV_ROWS` is built from `owned(…)` runs, and a row
 * added outside every run carries no provider — that is exactly the state this file refuses, by
 * name, over the real table. `pnpm env:check` holds the other two directions of the same table (a
 * name the code reads and nobody declares; a row nothing reads); this is the third.
 *
 * The synthetic cases exist so the rule is proven to bite without editing a shipped row: a row with
 * no provider, a row naming an id no registry knows, and the three freshness answers — `current`,
 * `stale` and the honest `not measured` — which is the one badge with a rule worth pinning.
 */
import { describe, expect, it } from "vitest";

import { INTEGRATIONS, PROVIDER_IDS, isProviderId } from "@/data/integrations";
import {
  SettingsUnplaceable,
  buildDirectory,
  freshnessOf,
  governs,
  providerOf,
  sourceSummary,
  validityOf,
  type CensusSnapshot,
  type SettingsInput,
} from "@/lib/admin/settings/providers";
import { ENV_ROWS, OUT_OF_SCOPE } from "@/scripts/env-manifest";

describe("providerOf — total over the table, and refusing by name", () => {
  it("resolves every declared row to a registered provider", () => {
    for (const row of ENV_ROWS) {
      const provider = providerOf(row, INTEGRATIONS);
      expect(PROVIDER_IDS).toContain(provider);
    }
  });

  it("resolves every out-of-scope row to a registered provider", () => {
    for (const row of OUT_OF_SCOPE) {
      const provider = providerOf(row, INTEGRATIONS);
      expect(PROVIDER_IDS).toContain(provider);
    }
  });

  it("names the row that carries no provider", () => {
    expect(() => providerOf({ name: "SOMETHING_NEW" }, INTEGRATIONS)).toThrow(SettingsUnplaceable);
    try {
      providerOf({ name: "SOMETHING_NEW" }, INTEGRATIONS);
    } catch (error) {
      expect((error as SettingsUnplaceable).name).toBe("SettingsUnplaceable");
      expect((error as SettingsUnplaceable).message).toContain("SOMETHING_NEW");
    }
  });

  it("names the row and the unregistered id it carries", () => {
    expect(() => providerOf({ name: "SOMETHING_NEW", provider: "oracle" }, INTEGRATIONS)).toThrow(
      /SOMETHING_NEW.*oracle/,
    );
  });

  it("never falls into a general bucket", () => {
    // A row that named "general" would be the fallback this module exists to refuse: no registry
    // carries it, so it is an unregistered id like any other.
    expect(() => providerOf({ name: "X", provider: "general" }, INTEGRATIONS)).toThrow(
      SettingsUnplaceable,
    );
  });
});

describe("the registry itself", () => {
  it("registers the seven vendors and the tree", () => {
    expect(PROVIDER_IDS).toEqual([
      "neon",
      "vercel",
      "bws",
      "resend",
      "github",
      "google",
      "stripe",
      "repo",
    ]);
  });

  it("gives every provider a non-empty account for each deployment", () => {
    for (const integration of INTEGRATIONS) {
      for (const environment of ["local", "preview", "production"] as const) {
        expect(integration.account[environment].length).toBeGreaterThan(0);
      }
      expect(integration.console.startsWith("https://")).toBe(true);
      expect(integration.docs.startsWith("https://")).toBe(true);
    }
  });

  it("narrows a string to a provider id only when the registry carries it", () => {
    expect(isProviderId("neon")).toBe(true);
    expect(isProviderId("oracle")).toBe(false);
  });
});

describe("buildDirectory — every row lands on exactly one card", () => {
  const directory = buildDirectory({
    integrations: INTEGRATIONS,
    rows: ENV_ROWS,
    outOfScope: OUT_OF_SCOPE,
    census: null,
    rotations: [],
  });

  it("carries every manifest row and every out-of-scope name once", () => {
    const onCards = directory.cards.flatMap((card) => card.variables);
    expect(onCards).toHaveLength(ENV_ROWS.length + OUT_OF_SCOPE.length);
    expect(new Set(onCards.map((variable) => variable.name)).size).toBe(onCards.length);
    expect(directory.totals.declared).toBe(ENV_ROWS.length);
    expect(directory.totals.outOfScope).toBe(OUT_OF_SCOPE.length);
  });

  it("draws a card for every registered provider, even with no variable", () => {
    expect(directory.cards).toHaveLength(INTEGRATIONS.length);
    expect(directory.cards.map((card) => card.integration.id)).toEqual([...PROVIDER_IDS]);
  });

  it("derives the counts rather than typing them", () => {
    const google = directory.cards.find((card) => card.integration.id === "google");
    expect(google?.counts.variables).toBe(1);
    expect(google?.counts.declared).toBe(0);
    for (const card of directory.cards) {
      expect(card.counts.variables).toBe(card.variables.length);
      // No census: nobody read the vault, so nothing is claimed about it.
      expect(card.counts.readable).toBe(0);
      expect(card.counts.unreachable).toBe(0);
      expect(card.counts.stale).toBe(0);
    }
  });

  it("measures nothing when there is no census, and says so instead of guessing", () => {
    for (const card of directory.cards) {
      for (const variable of card.variables) {
        expect(variable.presence.local).toBe("unknown");
        expect(variable.fresh).toBe("not measured");
        expect(variable.valid).toBe("not measured");
      }
    }
    expect(directory.recordedAt).toBeNull();
    expect(directory.vaultReadable).toBeNull();
  });
});

describe("validityOf — the vault's four answers, from the census alone", () => {
  const census: CensusSnapshot = {
    recordedAt: "2026-11-21",
    stores: 9,
    vaultReadable: 28,
    findings: [],
    names: [
      { name: "READABLE_ONE", declaredByRow: true, cells: { BWS: "+", ".env": "+" } },
      { name: "EMPTY_ONE", declaredByRow: true, cells: { BWS: "o", ".env": "+" } },
      { name: "UNREAD_ONE", declaredByRow: true, cells: { BWS: "?", ".env": "+" } },
      { name: "ABSENT_ONE", declaredByRow: true, cells: { BWS: "·", ".env": "+" } },
    ],
  };

  it("reads the four cells as four facts", () => {
    expect(validityOf("READABLE_ONE", census)).toBe("readable");
    expect(validityOf("EMPTY_ONE", census)).toBe("empty");
    expect(validityOf("UNREAD_ONE", census)).toBe("unreachable");
    expect(validityOf("ABSENT_ONE", census)).toBe("absent");
  });

  it("names a row the census never listed as absent from the vault, not unread", () => {
    expect(validityOf("NOT_IN_THE_CENSUS", census)).toBe("absent");
  });

  it("reads a census with no vault line as a store it could not read", () => {
    // The `Vault: N secret(s) readable` line is the project-level evidence. Without it the census
    // did not read the vault at all, which is not the same fact as "every key is empty".
    expect(validityOf("READABLE_ONE", { ...census, vaultReadable: null })).toBe("unreachable");
  });

  it("says not measured when there is no census, never ok", () => {
    expect(validityOf("READABLE_ONE", null)).toBe("not measured");
  });

  it("stamps the readable count from the cells, so the badge and the count agree", () => {
    const built = buildDirectory({
      integrations: INTEGRATIONS,
      rows: [
        {
          name: "READABLE_ONE",
          boot: false,
          environments: { local: "optional", preview: "optional", production: "optional" },
          why: "why",
          provider: "bws",
        },
      ],
      outOfScope: [],
      census,
      rotations: [],
    });
    const bws = built.cards.find((card) => card.integration.id === "bws");
    expect(bws?.counts.readable).toBe(1);
    expect(bws?.counts.unreachable).toBe(0);
    expect(built.totals.readable).toBe(1);
  });
});

describe("freshness — current, stale, or not measured, and never fresh on no evidence", () => {
  const rotations = [
    {
      id: "neon-account",
      changedAt: "2026-11-24",
      why: "the Neon account moved",
      names: ["DATABASE_URL"],
      platform: [],
      prefixes: ["NEON_OBJSTORE_"],
    },
  ];

  it("governs by name, by platform list and by family prefix", () => {
    expect(governs(rotations[0], "DATABASE_URL")).toBe(true);
    expect(governs(rotations[0], "NEON_OBJSTORE_BUCKET")).toBe(true);
    expect(governs(rotations[0], "RESEND_API_KEY")).toBe(false);
  });

  it("is current only when the census was recorded on or after the rotation", () => {
    expect(freshnessOf("DATABASE_URL", rotations, "2026-11-24").fresh).toBe("current");
    expect(freshnessOf("DATABASE_URL", rotations, "2026-11-26").fresh).toBe("current");
  });

  it("is stale when the snapshot predates the rotation", () => {
    expect(freshnessOf("DATABASE_URL", rotations, "2026-11-21")).toEqual({
      fresh: "stale",
      rotation: "neon-account",
    });
  });

  it("is not measured when no rotation governs the name, or nothing was recorded", () => {
    expect(freshnessOf("RESEND_API_KEY", rotations, "2026-11-26").fresh).toBe("not measured");
    expect(freshnessOf("DATABASE_URL", rotations, null).fresh).toBe("not measured");
  });
});

describe("sourceSummary — names and vault keys, never a value", () => {
  const base = {
    name: "SYNTHETIC_NAME",
    boot: false,
    environments: { local: "required", preview: "required", production: "required" },
    why: "why",
  } as const;

  it("prints a vault key, and nothing else about it", () => {
    const summary = sourceSummary({ ...base, source: { vault: "ALIGNSYNCH_RESEND_API_KEY" } });
    expect(summary).toEqual({ label: "vault ALIGNSYNCH_RESEND_API_KEY", kind: "vault" });
  });

  it("says which deployments a split row splits for", () => {
    const summary = sourceSummary({
      ...base,
      sources: {
        local: { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
        preview: { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
        production: { vault: "ALIGNSYNCH_PROD_DATABASE_URL" },
      },
    });
    expect(summary.kind).toBe("mixed");
    expect(summary.label).toContain("ALIGNSYNCH_DEMO_DATABASE_URL (local, preview)");
    expect(summary.label).toContain("ALIGNSYNCH_PROD_DATABASE_URL (production)");
  });

  it("names the derived and default kinds rather than leaving a blank cell", () => {
    expect(sourceSummary({ ...base, source: { derived: "package.json:version" } }).label).toContain(
      "package.json:version",
    );
    expect(sourceSummary({ ...base, source: undefined }).kind).toBe("default");
  });
});

describe("the input shape", () => {
  it("accepts the real tables unchanged", () => {
    const input: SettingsInput = {
      integrations: INTEGRATIONS,
      rows: ENV_ROWS,
      outOfScope: OUT_OF_SCOPE,
      census: null,
      rotations: [],
    };
    expect(input.rows.length).toBeGreaterThan(0);
  });
});
