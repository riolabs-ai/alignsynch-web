/**
 * The env-drift report — card t_bc244ff3. A credential drifted, the surface stayed up, and nothing
 * said so.
 *
 * The cases are the ways this report can be wrong, in the order they would hurt:
 *
 *   1. **it accuses nothing when it should** — the historical Neon rows, dated exactly as the card
 *      records them, must all be named against a rotation of 2026-11-24; and the post-fix rows, all
 *      written 2026-11-26, must name none;
 *   2. **it leaks a value** — the Vercel listing carries `value` on some rows, so the projection is
 *      held against a listing with a secret on every row, and the rendered report is searched for it
 *      and for a hash of it;
 *   3. **the declared dates are not dates** — a rotations file that holds a credential, an
 *      impossible day or a name-shaped secret is refused, and the refusal never echoes it;
 *   4. **the rule is too broad** — an uncovered variable is counted, never accused; a variable
 *      written the day of the rotation is current; a variable with no readable timestamp is
 *      unknown, which is not the same as fresh.
 *
 * The last group holds the committed `data/env/rotations.json` against the env manifest: every name
 * a rotation claims must be a row the application actually reads, or the entry is coverage of
 * nothing and the check silently never fires.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ENV_ROWS, OUT_OF_SCOPE, declaredNames } from "../scripts/env-manifest";
import {
  dayOf,
  findDrift,
  isDay,
  parseRotations,
  projectRows,
  remedy,
  rotationFor,
  staleLines,
  summary,
} from "../scripts/env-drift-rules.mjs";

const CLI = fileURLToPath(new URL("../scripts/env-drift.mjs", import.meta.url));
const ROTATIONS = fileURLToPath(new URL("../data/env/rotations.json", import.meta.url));

const NEON = {
  id: "neon-account",
  changedAt: "2026-11-24",
  why: "the Neon account moved",
  names: [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "NEON_API_KEY",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "NEON_BRANCH",
  ],
  platform: ["NEON_AUTH_JWKS_URL"],
  prefixes: [],
};

/** The rows the card records, as Vercel reported them the day before the fix. */
const BEFORE = [
  ["NEON_API_KEY", "2026-11-04"],
  ["NEON_AUTH_COOKIE_SECRET", "2026-10-30"],
  ["DATABASE_URL", "2026-11-21"],
  ["DATABASE_URL_UNPOOLED", "2026-11-21"],
  ["NEON_AUTH_BASE_URL", "2026-11-21"],
  ["NEON_AUTH_JWKS_URL", "2026-11-21"],
  ["NEON_BRANCH", "2026-11-01"],
];

const row = (key: string, updatedAt: string | null, target = ["production"]) => ({
  key,
  target,
  type: "sensitive",
  createdAt: updatedAt,
  updatedAt,
});

describe("the report names what the card's incident would have named", () => {
  it("flags all seven Neon variables, each with its own last-updated day", () => {
    const report = findDrift(
      BEFORE.map(([key, day]) => row(key, day)),
      [NEON],
    );
    expect(report.stale.map((entry) => entry.key).sort()).toEqual(
      BEFORE.map(([key]) => key).sort(),
    );
    expect(report.stale.find((entry) => entry.key === "NEON_AUTH_COOKIE_SECRET")).toEqual({
      key: "NEON_AUTH_COOKIE_SECRET",
      updatedAt: "2026-10-30",
      rotation: { id: "neon-account", changedAt: "2026-11-24" },
    });
    expect(report.compared).toBe(7);
    expect(report.stale).toHaveLength(7);
  });

  it("is empty against the values production holds today — all written after the move", () => {
    const report = findDrift(
      BEFORE.map(([key]) => row(key, "2026-11-26")),
      [NEON],
    );
    expect(report.stale).toEqual([]);
    expect(report.compared).toBe(7);
  });

  it("counts a variable written the day of the rotation as current, not stale", () => {
    expect(findDrift([row("NEON_BRANCH", "2026-11-24")], [NEON]).stale).toEqual([]);
    expect(findDrift([row("NEON_BRANCH", "2026-11-23")], [NEON]).stale).toHaveLength(1);
  });

  it("ignores a variable that is not on the target, and one no rotation covers", () => {
    const report = findDrift(
      [row("DATABASE_URL", "2026-01-01"), row("STRIPE_TEST_SECRET_KEY", "2020-01-01")],
      [NEON],
    );
    expect(report.stale.map((entry) => entry.key)).toEqual(["DATABASE_URL"]);
    expect(report.compared).toBe(1);
    expect(report.uncovered).toBe(1);

    const elsewhere = findDrift([row("DATABASE_URL", "2026-01-01", ["preview"])], [NEON]);
    expect(elsewhere.stale).toEqual([]);
    expect(elsewhere.onTarget).toBe(0);
  });

  it("reports an unreadable timestamp as unknown — never as fresh", () => {
    const report = findDrift([row("NEON_API_KEY", null)], [NEON]);
    expect(report.stale).toEqual([]);
    expect(report.unknown.map((entry) => entry.key)).toEqual(["NEON_API_KEY"]);
  });

  it("sorts by name so two runs over one listing print the same transcript", () => {
    const report = findDrift(
      [row("NEON_BRANCH", "2026-01-01"), row("DATABASE_URL", "2026-01-01")],
      [NEON],
    );
    expect(report.stale.map((entry) => entry.key)).toEqual(["DATABASE_URL", "NEON_BRANCH"]);
  });
});

describe("a value cannot leave this module", () => {
  const SECRET = "napi_2xQ9supersecretvalue_do_not_print";

  it("drops `value`, `decrypted` and every field it does not read", () => {
    const projected = projectRows({
      envs: [
        {
          id: "env_1",
          key: "NEON_API_KEY",
          value: SECRET,
          decrypted: true,
          target: ["production"],
          type: "sensitive",
          createdAt: 1795675687012,
          updatedAt: 1795675687012,
          lastEditedByDisplayName: "jaden",
        },
      ],
    });
    expect(projected).toHaveLength(1);
    expect(Object.keys(projected[0]).sort()).toEqual([
      "createdAt",
      "key",
      "target",
      "type",
      "updatedAt",
    ]);
    expect(JSON.stringify(projected)).not.toContain(SECRET);
  });

  it("renders no value, no prefix of it and no hash of it", () => {
    const digest = createHash("sha256").update(SECRET).digest("hex");
    const rows = projectRows([
      { key: "NEON_API_KEY", value: SECRET, target: ["production"], updatedAt: "2026-11-04" },
    ]);
    const report = findDrift(rows, [NEON]);
    const printed = [
      summary(report, [NEON]),
      ...staleLines(report.stale),
      remedy(report.stale),
    ].join("\n");
    expect(printed).toContain("NEON_API_KEY");
    expect(printed).toContain("2026-11-04");
    expect(printed).not.toContain(SECRET);
    expect(printed).not.toContain(SECRET.slice(0, 8));
    expect(printed).not.toContain(digest);
    expect(printed).not.toContain("napi_");
  });

  it("accepts the API body and a bare array, and normalises both timestamp shapes", () => {
    expect(projectRows({ envs: [{ key: "A", updatedAt: 1795675687012 }] })[0].updatedAt).toBe(
      "2026-11-26",
    );
    expect(projectRows([{ key: "A", updatedAt: "2026-11-04T09:00:00.000Z" }])[0].updatedAt).toBe(
      "2026-11-04",
    );
    expect(projectRows([{ key: "A", updatedAt: "not a date" }])[0].updatedAt).toBeNull();
    expect(projectRows(null)).toEqual([]);
    expect(projectRows({ envs: "nonsense" })).toEqual([]);
  });
});

describe("the declared rotations are dates, and the file is not a place for a credential", () => {
  const parse = (body: unknown) => parseRotations(JSON.stringify(body));

  it("accepts the committed file as it stands", () => {
    const { rotations, problems } = parseRotations(readFileSync(ROTATIONS, "utf8"));
    expect(problems).toEqual([]);
    expect(rotations.map((entry) => entry.id)).toContain("neon-account");
    expect(rotations.find((entry) => entry.id === "neon-account")?.changedAt).toBe("2026-11-24");
  });

  it("refuses a real-looking but impossible day, and a date in another spelling", () => {
    for (const changedAt of ["2026-02-30", "24/11/2026", "2026-11-24T00:00:00Z", ""]) {
      const { problems } = parse({ rotations: [{ ...NEON, changedAt }] });
      expect(problems.map((problem) => problem.where)).toContain("rotations[0].changedAt");
    }
    expect(isDay("2026-11-24")).toBe(true);
    expect(isDay("2024-02-29")).toBe(true);
  });

  it("refuses a rotation that carries a value, and never echoes what it carried", () => {
    const { rotations, problems } = parse({
      rotations: [{ ...NEON, value: "napi_2xQ9supersecretvalue" }],
    });
    expect(problems.map((problem) => problem.where)).toContain("rotations[0].value");
    expect(problems.map((problem) => problem.message).join(" ")).not.toContain("napi_");
    expect(rotations).toEqual([]);
  });

  it("refuses a pasted secret where a name should be", () => {
    const { problems } = parse({
      rotations: [{ ...NEON, names: ["NEON_API_KEY", "napi_2xQ9supersecretvalue"] }],
    });
    expect(problems.map((problem) => problem.message).join(" ")).toContain("not env names");
  });

  it("refuses a duplicate id, an empty coverage list and a rotation with no reason", () => {
    expect(
      parse({ rotations: [NEON, NEON] })
        .problems.map((problem) => problem.message)
        .join(" "),
    ).toContain("twice");
    expect(
      parse({ rotations: [{ ...NEON, names: [], platform: [], prefixes: [] }] })
        .problems.map((problem) => problem.message)
        .join(" "),
    ).toContain("covers no variable");
    expect(
      parse({ rotations: [{ ...NEON, why: "  " }] }).problems.map((problem) => problem.where),
    ).toContain("rotations[0].why");
  });

  it("refuses a file that is not JSON, and one with no rotations list", () => {
    expect(parseRotations("{ not json").problems[0].message).toBe("is not JSON");
    expect(parseRotations("[]").problems[0].message).toBe("is not a JSON object");
    expect(parse({}).problems.map((problem) => problem.where)).toContain("rotations");
  });

  it("names the longest matching prefix, so a family is covered once", () => {
    const base = { ...NEON, names: [], platform: [], prefixes: [] };
    const objstore = { ...base, id: "neon-objstore", prefixes: ["NEON_OBJSTORE_"] };
    const narrow = { ...base, id: "narrow", prefixes: ["NEON_OBJSTORE_ACCESS_"] };
    expect(rotationFor("NEON_OBJSTORE_BUCKET", [objstore])?.id).toBe("neon-objstore");
    expect(rotationFor("NEON_OBJSTORE_BUCKET", [NEON, objstore])?.id).toBe("neon-objstore");
    expect(rotationFor("NEON_OBJSTORE_ACCESS_KEY", [objstore, narrow])?.id).toBe("narrow");
    expect(rotationFor("NEON_OBJSTORE_ACCESS_KEY", [narrow, objstore])?.id).toBe("narrow");
    expect(rotationFor("NEON_API_KEY", [objstore, NEON])?.id).toBe("neon-account");
    expect(rotationFor("STRIPE_TEST_SECRET_KEY", [NEON])).toBeNull();
  });

  it("covers a family by prefix, and a platform value by name", () => {
    const objstore = {
      ...NEON,
      id: "neon-objstore",
      names: [],
      platform: [],
      prefixes: ["NEON_OBJSTORE_"],
    };
    const report = findDrift(
      [row("NEON_OBJSTORE_BUCKET", "2026-01-01"), row("NEON_AUTH_JWKS_URL", "2026-01-02")],
      [objstore, NEON],
    );
    expect(report.stale.map((entry) => entry.key)).toEqual([
      "NEON_AUTH_JWKS_URL",
      "NEON_OBJSTORE_BUCKET",
    ]);
    expect(report.compared).toBe(2);
    expect(report.stale[0].rotation.id).toBe("neon-account");
    expect(report.stale[1].rotation.id).toBe("neon-objstore");
  });
});

describe("the committed rotations cover real variables", () => {
  type Rotation = {
    id: string;
    changedAt: string;
    names: string[];
    platform: string[];
    prefixes: string[];
    ci: string[];
  };
  const { rotations } = parseRotations(readFileSync(ROTATIONS, "utf8")) as {
    rotations: Rotation[];
  };
  const declared = new Set(declaredNames());

  it.each(
    rotations.flatMap((entry) => entry.names.map((name) => [entry.id, name] as [string, string])),
  )("%s names %s, which the manifest declares", (_id, name) => {
    expect(declared.has(name)).toBe(true);
    expect(ENV_ROWS.find((entry) => entry.name === name)?.environments.production).not.toBe(
      "forbidden",
    );
  });

  it("names no variable the manifest does not declare, so coverage cannot be a typo", () => {
    for (const entry of rotations) {
      for (const name of entry.platform) {
        expect(declared.has(name), `${name} is a manifest row — declare it as a name`).toBe(false);
      }
    }
  });

  it("every prefix matches at least one declared name — coverage of nothing is a silent no-op", () => {
    for (const entry of rotations) {
      for (const prefix of entry.prefixes) {
        expect(
          [...declared].filter((name) => name.startsWith(prefix)),
          `prefix ${prefix} covers no declared variable`,
        ).not.toHaveLength(0);
      }
    }
  });

  it("files a CI-only credential as `ci`, never as a name a deployment is compared on", () => {
    const outOfScope = new Set(OUT_OF_SCOPE.map((row) => row.name));
    const covered = rotations.flatMap((entry) => entry.ci);
    expect(covered.length, "no rotation records a CI-only credential").toBeGreaterThan(0);
    for (const name of covered) {
      expect(outOfScope.has(name), `${name} is not an out-of-scope row`).toBe(true);
      expect(
        declared.has(name),
        `${name} is a deployment variable — declare it as a name so drift compares it`,
      ).toBe(false);
    }
  });

  it("refuses a name filed both as a deployment value and as a CI credential", () => {
    const { problems } = parseRotations(
      JSON.stringify({ rotations: [{ ...NEON, ci: ["DATABASE_URL"] }] }),
    );
    expect(problems.map((problem: { message: string }) => problem.message).join(" ")).toContain(
      "both a deployment value and a CI-only credential",
    );
  });
});

describe("the CLI, over a captured listing — no network, no token, real exit codes", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-drift-"));
  const write = (name: string, body: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(body, null, 2));
    return path;
  };
  const listing = write("listing.json", {
    envs: [
      ...BEFORE.map(([key, day]) => ({
        key,
        value: "napi_2xQ9supersecretvalue",
        target: ["production"],
        type: "sensitive",
        updatedAt: day,
      })),
      { key: "BRAND", value: "alignsynch", target: ["production"], updatedAt: "2026-01-01" },
    ],
  });
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

  it("exits 1 and prints every stale name with both dates when a rotation is declared after the writes", () => {
    const result = run("--from", listing, "--rotations", ROTATIONS);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("7 stale");
    for (const [key, day] of BEFORE) {
      expect(result.stdout).toContain(key);
      expect(result.stdout).toContain(`last updated ${day}`);
    }
    expect(result.stdout).toContain("predates neon-account (changed 2026-11-24)");
    expect(result.stdout).toContain("the write is the owner's");
  });

  it("exits 0 when every governed variable is newer than the rotation", () => {
    const fixed = write("fixed.json", {
      envs: BEFORE.map(([key]) => ({
        key,
        target: ["production"],
        updatedAt: 1795675687012,
      })),
    });
    const result = run("--from", fixed, "--rotations", ROTATIONS);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 stale");
    expect(result.stdout).toContain("env-drift: PASS");
  });

  it("never prints a value, in either direction, on stdout or stderr", () => {
    for (const path of [listing]) {
      const result = run("--from", path, "--rotations", ROTATIONS);
      expect(`${result.stdout}${result.stderr}`).not.toContain("napi_");
      expect(`${result.stdout}${result.stderr}`).not.toContain("alignsynch");
    }
  });

  it("exits 2 — never 0 — when the check could not run", () => {
    const broken = write("rotations.json", { rotations: [{ ...NEON, changedAt: "yesterday" }] });
    const result = run("--from", listing, "--rotations", broken);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not run");
    expect(result.stdout).not.toContain("PASS");

    const missing = run("--from", join(dir, "absent.json"), "--rotations", ROTATIONS);
    expect(missing.status).toBe(2);

    const noRotations = run("--from", listing, "--rotations", join(dir, "absent.json"));
    expect(noRotations.status).toBe(2);
  });

  it("writes the report as JSON for release:preflight, with the stale rows and nothing else", () => {
    const result = run("--from", listing, "--rotations", ROTATIONS, "--json");
    expect(result.status).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.available).toBe(true);
    expect(body.target).toBe("production");
    expect(body.stale).toHaveLength(7);
    expect(body.stale[0]).toHaveProperty("rotation.changedAt");
    expect(result.stdout).not.toContain("napi_");
    // Every stamped field is a calendar day: a report of dates cannot carry a value by shape.
    for (const entry of body.stale) expect(isDay(entry.updatedAt)).toBe(true);
    expect(dayOf(Date.now())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
