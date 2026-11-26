/**
 * #1088 — one table for every environment variable, held against the tree in both directions.
 *
 * The cases below are the ways this table has already been wrong or could become wrong, and they
 * are deliberately about the *rule* rather than about one row: a row nobody reads, a read nobody
 * declared, a boot flag the code does not back, an environment that contradicts itself, and a
 * live-mode credential. The last case walks the real tree, because a rule nobody can violate in a
 * fixture is a comment.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENV_ROWS,
  OUT_OF_SCOPE,
  checkManifest,
  declaredNames,
  exampleNames,
  exampleProblems,
  extractBootReads,
  extractReads,
  forbiddenIn,
  formatEnvLine,
  parseEnvText,
  parseEnvValue,
  readTree,
  renderExample,
  requiredRows,
  rowsFor,
  type EnvRow,
  type SourceFile,
} from "../scripts/env-manifest";
import { carriedFile, planRender } from "../scripts/env-render";
import { KNOWN_ENDPOINTS } from "../scripts/neon-endpoints.mjs";

const row = (
  name: string,
  cells: readonly [
    EnvRow["environments"]["local"],
    EnvRow["environments"]["preview"],
    EnvRow["environments"]["production"],
  ],
  source?: EnvRow["source"],
  boot = false,
): EnvRow => ({
  name,
  boot,
  environments: { local: cells[0], preview: cells[1], production: cells[2] },
  source,
  why: "fixture row",
});

/** A boot module and a plain reader, so the boot rule has something real to agree with. */
const BOOT_FILE: SourceFile = {
  path: "lib/auth/server.ts",
  source: [
    'const AUTH_ENV_BASE_URL = "NEON_AUTH_BASE_URL";',
    "export function required(name: string): string {",
    "  throw new Error(`${name} is not set`);",
    "}",
    "export const boot = () => required(AUTH_ENV_BASE_URL);",
  ].join("\n"),
};

const READER_FILE: SourceFile = {
  path: "lib/mail.ts",
  source: [
    "export const key = process.env.RESEND_API_KEY;",
    'export const host = process.env["BILLING_HOST"];',
    "export const helper = (name: string) => process.env[name];",
  ].join("\n"),
};

const fixture = (rows: EnvRow[], files: SourceFile[] = [BOOT_FILE, READER_FILE]) => ({
  files,
  rows,
  outOfScope: [],
});

describe("extractReads", () => {
  it("finds a dotted read and a bracketed literal — and never a helper's parameter", () => {
    const reads = extractReads([
      { path: "a.ts", source: `${BOOT_FILE.source}\n${READER_FILE.source}` },
    ]);
    expect([...reads.keys()].sort()).toEqual(["BILLING_HOST", "RESEND_API_KEY"]);
    expect(reads.get("RESEND_API_KEY")).toEqual(new Set(["a.ts"]));
  });
});

describe("the boot set", () => {
  it("reads the boot modules through their constant table, and only the boot modules", () => {
    const boot = extractBootReads([BOOT_FILE, READER_FILE]);
    expect([...boot.keys()]).toEqual(["NEON_AUTH_BASE_URL"]);
  });
});

describe("checkManifest", () => {
  it("passes a table that agrees with the code", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "required", "required"], { carried: true }, true),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], { carried: true }),
        row("BILLING_HOST", ["required", "forbidden", "required"], { carried: true }),
      ]),
    );
    expect(report.problems).toEqual([]);
    expect(report.census).toMatchObject({ declared: 3, boot: 1, unresolved: 0, outOfScope: 0 });
  });

  it("fails a read no row declares", () => {
    const report = checkManifest(
      fixture([row("NEON_AUTH_BASE_URL", ["required", "required", "required"], undefined, true)]),
    );
    const undeclared = report.problems.filter((problem) => problem.rule === "undeclared");
    expect(undeclared.map((problem) => problem.name).sort()).toEqual([
      "BILLING_HOST",
      "RESEND_API_KEY",
    ]);
    expect(undeclared[0].message).toContain("add it to ENV_ROWS or OUT_OF_SCOPE");
    expect(report.census.unresolved).toBe(2);
  });

  it("fails a row the tree never names — the row a rename left behind", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "required", "required"], undefined, true),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], undefined),
        row("BILLING_HOST", ["required", "forbidden", "required"], undefined),
        row("STRIPE_LEGACY_KEY", ["optional", "optional", "optional"], undefined),
      ]),
    );
    expect(report.problems).toEqual([
      expect.objectContaining({ name: "STRIPE_LEGACY_KEY", rule: "rotted" }),
    ]);
  });

  it("fails a boot variable whose row does not say so, and a row that claims boot with no reader", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "required", "required"], undefined, false),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], undefined, true),
        row("BILLING_HOST", ["required", "forbidden", "required"], undefined, false),
      ]),
    );
    const boot = report.problems.filter((problem) => problem.rule === "boot");
    expect(boot.map((problem) => problem.name).sort()).toEqual([
      "NEON_AUTH_BASE_URL",
      "RESEND_API_KEY",
    ]);
    expect(boot.find((problem) => problem.name === "RESEND_API_KEY")?.message).toContain(
      "no boot module",
    );
  });

  it("fails a boot variable the demo could not hold, and a row forbidden everywhere", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "forbidden", "required"], undefined, true),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], undefined),
        row("BILLING_HOST", ["required", "forbidden", "required"], undefined),
        row("DEAD_ROW", ["forbidden", "forbidden", "forbidden"], undefined),
      ]),
    );
    const environments = report.problems.filter((problem) => problem.rule === "environments");
    expect(environments.map((problem) => problem.name)).toContain("NEON_AUTH_BASE_URL");
    expect(
      environments.find((problem) => problem.name === "NEON_AUTH_BASE_URL")?.message,
    ).toContain("that deployment could not start");
  });

  it("fails a live-mode credential, in a vault name or in a literal", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "required", "required"], undefined, true),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], {
          vault: "ALIGNSYNCH_STRIPE_LIVE_KEY",
        }),
        row("BILLING_HOST", ["required", "forbidden", "required"], {
          literal: "sk_live_not_a_test_key",
        }),
      ]),
    );
    const live = report.problems.filter((problem) => problem.rule === "live");
    expect(live.map((problem) => problem.name).sort()).toEqual(["BILLING_HOST", "RESEND_API_KEY"]);
  });

  it("fails one variable declared twice", () => {
    const report = checkManifest(
      fixture([
        row("NEON_AUTH_BASE_URL", ["required", "required", "required"], undefined, true),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], undefined),
        row("RESEND_API_KEY", ["optional", "optional", "optional"], undefined),
        row("BILLING_HOST", ["required", "forbidden", "required"], undefined),
      ]),
    );
    expect(report.problems).toEqual([
      expect.objectContaining({ name: "RESEND_API_KEY", rule: "duplicate" }),
    ]);
  });
});

describe("the table's own policy", () => {
  it("forbids the operator allowlist on the demo, and names no live key set", () => {
    expect(forbiddenIn("preview").has("ADMIN_EMAILS")).toBe(true);
    const sources = ENV_ROWS.flatMap((entry) =>
      [entry.source, ...Object.values(entry.sources ?? {})].flatMap((source) =>
        source === undefined
          ? []
          : "vault" in source
            ? [source.vault]
            : "literal" in source
              ? [source.literal]
              : [],
      ),
    );
    expect(sources.filter((name) => /_live\b|sk_live_|alignsynch-live/i.test(name))).toEqual([]);
  });

  it("keeps forbidden rows out of an environment's file and its required set", () => {
    expect(rowsFor("preview").some((entry) => entry.name === "ADMIN_EMAILS")).toBe(false);
    expect(requiredRows("preview").some((entry) => entry.name === "ADMIN_EMAILS")).toBe(false);
    expect(declaredNames()).toContain("DATABASE_URL");
  });

  it("names every out-of-scope variable exactly once, with a reason", () => {
    const names = OUT_OF_SCOPE.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(OUT_OF_SCOPE.every((entry) => entry.why.trim().length > 10)).toBe(true);
    expect(names.some((name) => name.includes("*"))).toBe(false);
  });
});

describe("the real tree", () => {
  it("agrees with the code in both directions, with nothing unresolved", () => {
    const report = checkManifest({ files: readTree(process.cwd()) });
    expect(report.problems).toEqual([]);
    expect(report.census).toMatchObject({ declared: ENV_ROWS.length, boot: 3, unresolved: 0 });
    expect(report.census.outOfScope).toBe(OUT_OF_SCOPE.length);
  });
});

describe("a render never crosses environments", () => {
  it("reads the production file for production and the demo file for the demo", () => {
    expect(carriedFile("production")).toBe(".env");
    expect(carriedFile("preview")).toBe(".env.demo");
    expect(carriedFile("local")).toBe(".env.local");
  });

  it("refuses a required row that does not resolve, and writes no partial body", () => {
    const plan = planRender({
      environment: "production",
      rows: [
        row(
          "DATABASE_URL",
          ["required", "required", "required"],
          { vault: "ALIGNSYNCH_PROD_DATABASE_URL" },
          true,
        ),
        row("BRAND", ["required", "required", "required"], { literal: "alignsynch" }),
      ],
      vault: new Map(),
    });
    expect(plan.body).toBeNull();
    expect(plan.missing.map((entry) => entry.name)).toEqual(["DATABASE_URL"]);
    expect(plan.missing[0].from).toBe("vault ALIGNSYNCH_PROD_DATABASE_URL");
  });

  it("resolves vault, literal, derived and carried sources without printing a value", () => {
    const plan = planRender({
      environment: "preview",
      rows: [
        row(
          "DATABASE_URL",
          ["required", "required", "required"],
          { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
          true,
        ),
        row("BRAND", ["required", "required", "required"], { literal: "alignsynch" }),
        row("APP_VERSION", ["required", "required", "required"], {
          derived: "package.json:version",
        }),
        row("DEMO_PIN", ["required", "required", "forbidden"], { carried: true }),
        row("ADMIN_EMAILS", ["optional", "forbidden", "required"], { carried: true }),
        row("STRIPE_API_VERSION", ["optional", "optional", "optional"], undefined),
      ],
      vault: new Map([["ALIGNSYNCH_DEMO_DATABASE_URL", "postgres://demo"]]),
      carried: new Map([
        ["DEMO_PIN", "4321"],
        ["ADMIN_EMAILS", "someone@example.com"],
      ]),
      derived: new Map([["package.json:version", "1.20.1"]]),
    });
    expect(plan.body).toContain("DEMO_PIN='4321'");
    expect(plan.body).toContain("APP_VERSION='1.20.1'");
    expect(plan.body).not.toContain("ADMIN_EMAILS");
    expect(plan.body).not.toContain("STRIPE_API_VERSION");
    expect(plan.resolutions.map((entry) => entry.name)).not.toContain("ADMIN_EMAILS");
    expect(plan.resolutions.find((entry) => entry.name === "STRIPE_API_VERSION")?.status).toBe(
      "app-default",
    );
    // The plan says where a value came from, never what it is.
    expect(Object.keys(plan.resolutions[0]).sort()).toEqual(["from", "name", "status"]);
  });

  it("fails an optional row softly: reported missing, file still written", () => {
    const plan = planRender({
      environment: "local",
      rows: [row("RESEND_FROM", ["optional", "optional", "optional"], { carried: true })],
      carried: new Map(),
    });
    expect(plan.body).not.toBeNull();
    expect(plan.missing).toEqual([]);
    expect(plan.resolutions[0].status).toBe("missing");
  });
});

/**
 * #1339 — the six declared vault rows still named the retired project while six `_V2` twins held
 * the live values, and `env:render` resolved every stale cell as `ok`, writing the dead endpoint
 * into `.env.local`, `.env.demo` and `.env`. A vault value that names a `retired: true` row of
 * `scripts/neon-endpoints.mjs` is not a value; the cases below build the vault in memory, so they
 * need no token, no network and no database.
 */
describe("a render refuses a vault value on a retired endpoint", () => {
  /** A connection string for an endpoint, with a fake credential — nothing here ever connects. */
  const urlFor = (endpoint: string) =>
    `postgresql://neondb_owner:***@${endpoint}.c-8.us-east-2.aws.neon.tech/neondb`;

  /** The same branch through the pooler: a second host, the same endpoint. */
  const pooledFor = (endpoint: string) => urlFor(`${endpoint}-pooler`);

  const rows: EnvRow[] = [
    row(
      "DATABASE_URL",
      ["required", "required", "required"],
      { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
      true,
    ),
    row("BRAND", ["required", "required", "required"], { literal: "alignsynch" }),
  ];

  const plan = (databaseUrl: string) =>
    planRender({
      environment: "local",
      rows,
      vault: new Map([["ALIGNSYNCH_DEMO_DATABASE_URL", databaseUrl]]),
    });

  it("does not resolve a value naming the retired project, pooled or direct", () => {
    const retired = KNOWN_ENDPOINTS.find((entry) => entry.retired);
    expect(retired).toBeDefined();
    if (retired === undefined) return;

    for (const stale of [urlFor(retired.endpoint), pooledFor(retired.endpoint)]) {
      const result = plan(stale);
      // No value means no line, and no line means no file: the plan carries no body at all.
      expect(result.body).toBeNull();
      expect(result.missing.map((entry) => entry.name)).toEqual(["DATABASE_URL"]);

      const [entry] = result.missing;
      expect(entry.status).toBe("missing");
      expect(entry.from).toBe("vault ALIGNSYNCH_DEMO_DATABASE_URL");
      // The note names the row, the endpoint, and the role/project the table carries.
      expect(entry.note).toContain("vault ALIGNSYNCH_DEMO_DATABASE_URL");
      expect(entry.note).toContain(retired.endpoint);
      expect(entry.note).toContain(retired.role);
      expect(entry.note).toContain(retired.project);
      // ...and never the value, which is the rule the whole command is built on.
      expect(entry.note).not.toContain("neondb_owner");
      expect(JSON.stringify(result)).not.toContain("neondb_owner");
    }
  });

  it("resolves the same fixture on the live project's endpoint", () => {
    const result = plan(urlFor("ep-fancy-bar-bd0pzuz0"));
    expect(result.missing).toEqual([]);
    expect(result.resolutions[0].status).toBe("ok");
    expect(result.resolutions[0].note).toBeUndefined();
    expect(result.body).toContain("DATABASE_URL='postgresql://");
  });

  it("leaves a vault value that is not an address alone", () => {
    // A key, a secret, a host the table has never heard of: nothing to refuse, and refusing one
    // would be a rule about values rather than about the retired project.
    for (const untouched of ["sk_test_123", "https://example.test/auth", "ep-scratch-99999999"]) {
      expect(plan(untouched).missing).toEqual([]);
    }
  });
});

describe("the checked-in template is the table's own projection", () => {
  /** One row whose value differs by environment, which is the shape the template must explain. */
  const splitRow: EnvRow = {
    name: "DATABASE_URL",
    boot: true,
    environments: { local: "required", preview: "required", production: "required" },
    sources: {
      local: { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
      preview: { vault: "ALIGNSYNCH_DEMO_DATABASE_URL" },
      production: { vault: "ALIGNSYNCH_PROD_DATABASE_URL" },
    },
    why: "fixture row",
  };
  const rows: EnvRow[] = [
    splitRow,
    row("BRAND", ["required", "required", "required"], { literal: "alignsynch" }),
    row("DEMO_PIN", ["required", "required", "forbidden"], { carried: true }),
  ];

  it("renders one empty-quoted value slot per row, in table order, carrying no value", () => {
    const text = renderExample(rows);
    expect(exampleNames(text)).toEqual(["DATABASE_URL", "BRAND", "DEMO_PIN"]);
    // The slot is the renderer's own syntax — `NAME=''` — so filling it in keeps the quotes that
    // stop a `&` in a connection string from ending the shell assignment (#1422).
    const declarations = text.split("\n").filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line));
    expect(declarations).toEqual(["DATABASE_URL=''", "BRAND=''", "DEMO_PIN=''"]);
    // A split source is named per environment, which is the question a deployment failure asks.
    expect(text).toContain("production vault ALIGNSYNCH_PROD_DATABASE_URL");
    expect(text).toContain("production forbidden");
  });

  it("passes when it was rendered from the table it is checked against", () => {
    expect(exampleProblems(renderExample(rows), rows)).toEqual([]);
  });

  it("fails a row the template does not declare — the deliberately removed row", () => {
    const removed = rows.filter((entry) => entry.name !== "DEMO_PIN");
    const findings = exampleProblems(renderExample(rows), removed);
    expect(findings.map((finding) => [finding.rule, finding.name])).toEqual([
      ["example", "DEMO_PIN"],
    ]);
    // The same removal is caught by the table check too: the code still reads it.
    const report = checkManifest({
      files: [{ path: "lib/demo.ts", source: "export const pin = process.env.DEMO_PIN;" }],
      rows: removed,
      outOfScope: [],
    });
    expect(report.problems.map((problem) => problem.rule)).toContain("undeclared");
  });

  it("fails a line no row declares, and a template out of table order", () => {
    const withPhantom = `${renderExample(rows)}\nGHOST_FLAG=\n`;
    expect(exampleProblems(withPhantom, rows).map((finding) => finding.name)).toEqual([
      "GHOST_FLAG",
    ]);

    const reordered = [
      "# a template whose names are not in table order",
      "BRAND=",
      "DATABASE_URL=",
      "DEMO_PIN=",
      "",
    ].join("\n");
    expect(exampleProblems(reordered, rows).map((finding) => finding.message)).toContain(
      "the names are out of table order — the template is a reading of the table",
    );
  });

  it("declares every name the table declares in the real tree's template", () => {
    const report = checkManifest({ files: readTree(process.cwd()) });
    expect(report.problems).toEqual([]);
    expect(declaredNames()).toContain("RESEND_ENDPOINT");
  });
});

describe("a read through an env record that defaults to process.env", () => {
  it("counts a property read on that record, and not on somebody else's", () => {
    const reads = extractReads([
      {
        path: "lib/flow/email.ts",
        source: [
          "export function mailEndpoint(env: MailEnv = process.env): string {",
          "  return env.RESEND_ENDPOINT ?? DEFAULT_ENDPOINT;",
          "}",
        ].join("\n"),
      },
      {
        // No `= process.env` default, so this record is somebody else's and is not a read of ours.
        path: "lib/other.ts",
        source: "export const name = env.RESEND_KEY_MODE;",
      },
    ]);
    expect([...reads.keys()]).toEqual(["RESEND_ENDPOINT"]);
  });
});

/**
 * #1422 — the rendered file is **sourced**, so a value is data only if bash agrees it is.
 *
 * The v2.1.0 cut refused on "DATABASE_URL is unset and --no-record was not passed" twice, and
 * `demo:verify` blamed the wrong branch, because the renderer wrote a Neon URL bare:
 *
 *     $ bash -c 'X=a?b&c=d; echo X=$X'
 *     X=                        ← the assignment was backgrounded empty; `c=d` ran as a command
 *
 * Every plain value still loaded, so the environment looked half-loaded and the failure was
 * blamed on the wrong variable. These cases render a plan, write it to a file, source that file in
 * a fresh bash with `set -a`, and compare **length and sha256** — never the value — so a regression
 * is a red test rather than a release cut that cannot start.
 */
describe("a rendered env file loads whole in bash", () => {
  /** Every character a shell would eat if the value were bare, and the URL that started this. */
  const HOSTILE: ReadonlyMap<string, string> = new Map([
    [
      "FIXTURE_CONNECTION",
      "postgresql://neondb_owner:***@ep-fancy-bar-pooler.c-8.us-east-2.aws.neon.tech/neondb" +
        "?sslmode=require&channel_binding=require",
    ],
    ["FIXTURE_SPACES", "two words  and a tab\there"],
    ["FIXTURE_EXPANSION", "literal $HOME and ${PATH} and `id` and $(id)"],
    ["FIXTURE_HASH", "value # not a comment"],
    ["FIXTURE_QUOTE", "it's a quote, and 'two' of them"],
    ["FIXTURE_DQUOTE", 'a "double" quote'],
    ["FIXTURE_BACKSLASH", "trailing backslash \\ and a \\n escape"],
    ["FIXTURE_EMPTYISH", "-"],
  ]);

  /** One plan whose every row is a literal taken from `HOSTILE` — no vault, no network. */
  const renderedRows: EnvRow[] = [...HOSTILE.entries()].map(([name, value]) => ({
    ...row(name, ["required", "required", "required"], { literal: value }),
  }));

  const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

  /** A probe that prints length + hash per name, so a failing case never prints a value. */
  const PROBE = [
    'import { createHash } from "node:crypto";',
    "const out = {};",
    "for (const name of process.argv.slice(2)) {",
    "  const value = process.env[name];",
    '  out[name] = value === undefined ? null : [value.length, createHash("sha256").update(value).digest("hex")];',
    "}",
    "process.stdout.write(JSON.stringify(out));",
  ].join("\n");

  it("writes a single-quoted literal that re-parses to its own bytes", () => {
    for (const [name, value] of HOSTILE) {
      const line = formatEnvLine(name, value);
      expect(line.startsWith(`${name}='`), name).toBe(true);
      expect(line.endsWith("'"), name).toBe(true);
      expect(parseEnvValue(line.slice(line.indexOf("=") + 1)), name).toBe(value);
    }
    // The one shape a `NAME=value` line cannot carry is a line break: refused, by name, and the
    // message must not quote the value it refused.
    let refusal = "";
    try {
      formatEnvLine("BROKEN", "secret\nsecond line");
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    expect(refusal).toContain("BROKEN");
    expect(refusal).toContain("line break");
    expect(refusal).not.toContain("secret");
  });

  it("sources in a fresh bash with every value byte-identical", () => {
    const plan = planRender({ environment: "local", rows: renderedRows });
    expect(plan.missing).toEqual([]);
    const body = plan.body ?? "";
    expect(body.length).toBeGreaterThan(0);

    // The repo's own reader agrees with the file, key for key.
    const parsed = parseEnvText(body);
    for (const [name, value] of HOSTILE) expect(parsed.get(name), name).toBe(value);

    // ...and so does bash, which is the half that was broken.
    const directory = mkdtempSync(join(tmpdir(), "env-roundtrip-"));
    try {
      const file = join(directory, ".env.local");
      const probe = join(directory, "probe.mjs");
      writeFileSync(file, body);
      writeFileSync(probe, PROBE);
      const names = [...HOSTILE.keys()];
      const raw = execFileSync(
        "bash",
        [
          "-c",
          `set -a; . ${JSON.stringify(file)}; node ${JSON.stringify(probe)} ${names.join(" ")}`,
        ],
        { encoding: "utf8" },
      );
      const seen = JSON.parse(raw) as Record<string, [number, string] | null>;

      for (const name of names) {
        const expected = HOSTILE.get(name) ?? "";
        expect(seen[name], name).not.toBeNull();
        // Length and hash: the assertion that proves bytes without printing them.
        expect(seen[name]?.[0], name).toBe(expected.length);
        expect(seen[name]?.[1], name).toBe(sha(expected));
      }
      // Every key the manifest asked for is present — the old bug left exactly one unset while
      // its neighbours loaded, which is why the failure was reported against the wrong variable.
      expect(Object.values(seen).filter((entry) => entry === null)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("leaves no rendered line unquoted", () => {
    const plan = planRender({ environment: "local", rows: renderedRows });
    for (const line of (plan.body ?? "").split("\n")) {
      if (line === "" || line.startsWith("#")) continue;
      expect(/^[A-Z_][A-Z0-9_]*='.*'$/.test(line), line.slice(0, line.indexOf("="))).toBe(true);
    }
  });

  /**
   * The vault holds one of these for real: `ALIGNSYNCH_GH_FEEDBACK_TOKEN` is a token plus a
   * trailing newline, and a bare line used to carry it by accident. Trailing framing is dropped and
   * said out loud — the value the app sees is unchanged — while a break *inside* a value has no
   * representable form and is unresolved by name (`planRender`), refused if the row is required.
   */
  it("drops a trailing line break as framing, and refuses an interior one by name", () => {
    const trailing = planRender({
      environment: "local",
      rows: [row("FEEDBACK_TOKEN", ["optional", "optional", "optional"], { literal: "sekrit\n" })],
    });
    expect(trailing.body).toContain("FEEDBACK_TOKEN='sekrit'");
    expect(trailing.resolutions[0].status).toBe("ok");
    expect(trailing.resolutions[0].note).toContain("ends with a line break");
    expect(JSON.stringify(trailing.resolutions)).not.toContain("sekrit");

    const interior = planRender({
      environment: "local",
      rows: [row("CERT", ["required", "required", "required"], { literal: "line one\nline two" })],
    });
    expect(interior.body).toBeNull();
    expect(interior.missing.map((entry) => entry.name)).toEqual(["CERT"]);
    expect(interior.missing[0].note).toContain("line break");
    expect(JSON.stringify(interior.resolutions)).not.toContain("line one");
  });
});
