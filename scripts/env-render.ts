/**
 * env-render — write the three env files from the manifest. Nothing here invents a value.
 *
 *   pnpm env:render                     # write .env.local, .env.demo and .env
 *   pnpm env:render --dry-run           # print the plan, touch nothing
 *   pnpm env:render --dir <tree>        # read/write another tree (a worktree has no env files)
 *   pnpm env:render --source-dir <tree> # carry `carried` values from that tree's own files
 *
 * Three rules, each one an incident this repo has already had:
 *
 *   1. **A value is never printed and never derived from another environment.** Every line is
 *      `name ok (source …)` or `name MISSING (source …)`; the only place a value appears is the
 *      body of the file being written. `carried` resolves from `ENVIRONMENT_FILES[environment]`
 *      **and no other file** — that is the half of the `INVALID_ORIGIN` incident a table alone
 *      cannot hold: a production render may not read `.env.local`, so it cannot inherit the demo's
 *      credential and label it production.
 *   2. **Nothing comes from `vercel env pull`.** Those variables are marked `sensitive` and pull
 *      back unreadable, which surfaces as `401 Invalid API Key` somewhere else entirely.
 *   3. **A file whose required variables do not all resolve is not written.** The refusal names
 *      every missing variable and its expected source, and exits 1 with no partial file: a
 *      half-written env file is worse than none, because the next command reads it.
 *   3b. **A vault value that names a retired endpoint does not resolve.** The endpoint table
 *      (`scripts/neon-endpoints.mjs`) marks the paused project's branches `retired: true`; a vault
 *      row still holding one resolves as `missing` with a note naming the row and the endpoint, so
 *      a render after a project move refuses instead of publishing the dead database (#1339).
 *   4. **Every value is written as a single-quoted shell literal** (`NAME='…'`, an embedded `'`
 *      written `'\''`), and a line that does not re-parse to its own bytes refuses the render.
 *      Bare values are why the v2.1.0 cut could not pass check 8: a Neon URL's `&` ends the shell
 *      assignment, so `set -a; . .env.local` left `DATABASE_URL` unset while every plain value
 *      loaded — a half-loaded environment that blamed the wrong variable (#1422).
 *
 * The output is deterministic — rows in table order, no clock, no path — so rendering twice is
 * byte-identical and a diff of the rendered file is a diff of the table.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENVIRONMENT_FILES,
  ENVIRONMENTS,
  ENV_ROWS,
  OUT_OF_SCOPE,
  type EnvironmentId,
  type EnvRow,
  type Source,
  envFileValue,
  formatEnvLine,
  parseEnvFile,
  parseEnvValue,
  sourceFor,
} from "./env-manifest";
import { KNOWN_ENDPOINTS } from "./neon-endpoints.mjs";

/** The Bitwarden Secrets Manager project these rows live in (`alignsynch-web`). */
export const VAULT_PROJECT_ID = "e2b8d242-ebc6-4c79-8298-b3f7012a06fa";

/** Where `env:render` and `env:check` live, from this module's own location. */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/** What happened to one row, in one environment. Never carries a value. */
export interface Resolution {
  readonly name: string;
  readonly status: "ok" | "missing" | "app-default";
  /** The source, described for a human: `vault ALIGNSYNCH_…`, `literal`, `carried .env`. */
  readonly from: string;
  /** Why a resolved-looking value was refused, when it was. Names the row and the endpoint. */
  readonly note?: string;
}

/** One environment's plan: what resolved, what did not, and the file body when it is complete. */
export interface RenderPlan {
  readonly environment: EnvironmentId;
  readonly file: string;
  readonly resolutions: readonly Resolution[];
  /** `name=value` lines, in table order, when every required row resolved. */
  readonly body: string | null;
  readonly missing: readonly Resolution[];
}

const describe = (source: Source | undefined, environment: EnvironmentId): string => {
  if (source === undefined) return "app default";
  if ("vault" in source) return `vault ${source.vault}`;
  if ("literal" in source) return "literal";
  if ("derived" in source) return `derived ${source.derived}`;
  return `carried ${ENVIRONMENT_FILES[environment]}`;
};

/**
 * The file a `carried` value is read from — **the environment's own, and nothing else**.
 *
 * This is the one line the operator asked for by name: a production render may never read
 * `.env.local`, because that precedence (`.env.local` outranks `.env` under the repo's loader) is
 * exactly how a "production" credential write landed on the demo branch and was refused by the
 * provider as `INVALID_ORIGIN`, printed as `undefined`.
 */
export function carriedFile(environment: EnvironmentId): string {
  const file = ENVIRONMENT_FILES[environment];
  if (environment === "production" && (file === ".env.local" || file === ".env.demo")) {
    throw new Error(
      `env-render: a production render may not carry from ${file} — production reads ${".env"} only`,
    );
  }
  return file;
}

/**
 * `NAME='value'` — every value a single-quoted shell literal, and the line is proved before it is
 * emitted.
 *
 * The old form quoted only when a value matched `[\s#'"]`, so a Neon URL went out bare and its `&`
 * truncated the line on `. .env.local`: `DATABASE_URL` unset, every plain variable loaded, and both
 * the v2.1.0 cut (check 8) and `demo:verify` blamed the wrong thing. Quoting "when it looks risky"
 * is the defect — a value is data, so it is always quoted, and the one form that expands nothing is
 * `'…'` with an embedded quote written `'\''`.
 *
 * Two refusals here, both by name and never by value: a value carrying a line break _inside_ it
 * cannot be a `NAME=value` line at all (a trailing one is framing — see `envFileValue`), and a line
 * that does not re-parse to the exact bytes it was built from would be a file that half-loads — so
 * the renderer fails instead of writing it.
 */
function envLine(name: string, value: string): string {
  const carried = envFileValue(value);
  const line = formatEnvLine(name, value);
  const separator = line.indexOf("=");
  if (parseEnvValue(line.slice(separator + 1)) !== carried) {
    throw new Error(`env-render: ${name} does not survive this repo's own env-file syntax`);
  }
  return line;
}

/**
 * The endpoints `scripts/neon-endpoints.mjs` marks `retired: true` — the paused project's branches.
 * Filtered from the table, never typed again, so a project move is one edit there and this refusal
 * follows: the same derivation `PRODUCTION_HOST_MARKERS` uses (`scripts/demo-verify-rules.mjs`).
 */
const RETIRED_ENDPOINTS = KNOWN_ENDPOINTS.filter((entry) => entry.retired);

/** The endpoint id a value names — its host's first label, without the pooler suffix. */
function endpointIn(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  let host = trimmed;
  if (trimmed.includes("://")) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      return null;
    }
  }
  const label = host.split(".")[0]?.replace(/-pooler$/, "");
  return label === undefined || label === "" ? null : label;
}

/**
 * The retired table row a vault value names, or `null` for a live endpoint, an unknown one (a
 * scratch branch) or a value that is not an address at all.
 *
 * This is the half of #1339 a table alone could not hold: for a month after the project moved, the
 * six declared vault rows still held the **retired** project's connection strings while six `_V2`
 * twins held the live ones. `env:render` resolved every one of those cells as `ok` and wrote the
 * dead endpoint into `.env.local`, `.env.demo` **and** `.env` — one `env:sync --target production`
 * from being published. A value that names a retired endpoint is not a value; it is the incident.
 * `--dry-run` said `ok` the whole time, which is why the refusal lives on the resolution, not on a
 * flag: it is applied to every vault-sourced row that parses an endpoint, so a future re-move
 * (or a row that is re-pointed at the old project) is refused the same way.
 */
function retiredEndpointIn(value: string): (typeof RETIRED_ENDPOINTS)[number] | null {
  const endpoint = endpointIn(value);
  if (endpoint === null) return null;
  return (
    RETIRED_ENDPOINTS.find(
      (candidate) =>
        endpoint === candidate.endpoint || endpoint.startsWith(`${candidate.endpoint}-`),
    ) ?? null
  );
}

/**
 * The plan for one environment. Pure over its inputs so a case can pass three maps and a package
 * version: the vault, the carried file's contents, and the derived values.
 */
export function planRender(input: {
  readonly environment: EnvironmentId;
  readonly rows?: readonly EnvRow[];
  readonly vault?: ReadonlyMap<string, string>;
  readonly carried?: ReadonlyMap<string, string>;
  readonly derived?: ReadonlyMap<string, string>;
}): RenderPlan {
  const environment = input.environment;
  const rows = input.rows ?? ENV_ROWS;
  const vault = input.vault ?? new Map<string, string>();
  const carried = input.carried ?? new Map<string, string>();
  const derived = input.derived ?? new Map<string, string>();
  const resolutions: Resolution[] = [];
  const lines: string[] = [];
  const missing: Resolution[] = [];

  for (const row of rows) {
    const requirement = row.environments[environment];
    if (requirement === "forbidden") continue;
    const source = sourceFor(row, environment);
    if (source === undefined) {
      const resolution: Resolution = { name: row.name, status: "app-default", from: "app default" };
      if (requirement === "required") {
        // A required row with no source is a table defect, and it must fail as loudly as a
        // missing value: render cannot invent one and must not silently skip it.
        resolutions.push({ ...resolution, status: "missing" });
        missing.push({ ...resolution, status: "missing" });
      } else {
        resolutions.push(resolution);
      }
      continue;
    }

    let value: string | undefined;
    if ("vault" in source) value = vault.get(source.vault);
    else if ("literal" in source) value = source.literal;
    else if ("derived" in source) value = derived.get(source.derived);
    else value = carried.get(row.name);

    if (value === undefined || value === "") {
      const resolution: Resolution = {
        name: row.name,
        status: "missing",
        from: describe(source, environment),
      };
      resolutions.push(resolution);
      if (requirement === "required") missing.push(resolution);
      continue;
    }

    // A vault value naming a retired endpoint is the #1339 incident, not a resolvable cell: the
    // project it opens is paused, so writing it into a file publishes a dead database one
    // `env:sync` later. Whatever `bws` returns, this row has not resolved.
    if ("vault" in source) {
      const retired = retiredEndpointIn(value);
      if (retired !== null) {
        const resolution: Resolution = {
          name: row.name,
          status: "missing",
          from: describe(source, environment),
          note:
            `${describe(source, environment)} names ${retired.endpoint}, a retired endpoint ` +
            `(${retired.role} · ${retired.project}) — re-point the vault row at the live project`,
        };
        resolutions.push(resolution);
        if (requirement === "required") missing.push(resolution);
        continue;
      }
    }

    // A value a `NAME=value` line cannot carry is refused per row, the same way a retired endpoint
    // is: by name, with a note, and never by letting the line out. An interior line break is
    // unrepresentable, so the row has not resolved — a required one refuses the file, an optional
    // one is skipped and said out loud. A trailing one is framing and is dropped (`envFileValue`),
    // with a note, because the loader trims it anyway and the app has never seen it.
    const carriedValue = envFileValue(value);
    if (/[\r\n]/.test(carriedValue)) {
      const resolution: Resolution = {
        name: row.name,
        status: "missing",
        from: describe(source, environment),
        note:
          "the value carries a line break inside it, which a `NAME=value` line cannot hold — " +
          "trim the source row; nothing was written for this name",
      };
      resolutions.push(resolution);
      if (requirement === "required") missing.push(resolution);
      continue;
    }

    resolutions.push({
      name: row.name,
      status: "ok",
      from: describe(source, environment),
      ...(carriedValue === value
        ? {}
        : {
            note:
              "the source value ends with a line break, which no env file can carry — written " +
              "without it (the loader trims it anyway), so the value the app sees is unchanged",
          }),
    });
    lines.push(envLine(row.name, value));
  }

  // The one local credential a render must not swallow: the vault token the renderer itself needs.
  for (const entry of OUT_OF_SCOPE) {
    if (entry.carry !== true) continue;
    const value = carried.get(entry.name);
    if (value === undefined || value === "") continue;
    // Same refusal as a table row, and for the same reason: one unrepresentable value must not
    // take the whole render down, and it must not be written as a line that breaks the file.
    if (/[\r\n]/.test(envFileValue(value))) {
      resolutions.push({
        name: entry.name,
        status: "missing",
        from: `carried ${ENVIRONMENT_FILES[environment]}`,
        note: "the carried value carries a line break inside it — not written; fix the file it came from",
      });
      continue;
    }
    resolutions.push({
      name: entry.name,
      status: "ok",
      from: `carried ${ENVIRONMENT_FILES[environment]}`,
    });
    lines.push(envLine(entry.name, value));
  }

  const header = [
    `# GENERATED by \`pnpm env:render\` from scripts/env-manifest.ts — do not edit by hand.`,
    `# environment: ${environment} · ${lines.length} variable(s) · ${ENVIRONMENT_FILES[environment]}`,
    "# Values live in Bitwarden Secrets Manager (project alignsynch-web) or in the table's own",
    "# literals; this file is the resolution, not the source of truth.",
    "",
  ];

  return {
    environment,
    file: ENVIRONMENT_FILES[environment],
    resolutions,
    body: missing.length === 0 ? `${[...header, ...lines].join("\n")}\n` : null,
    missing,
  };
}

/** `bws secret list <project> -o json` → name → value. A failed read is an empty map, said out loud. */
function readVault(): { vault: Map<string, string>; note: string } {
  const token = process.env.BWS_ACCESS_TOKEN?.trim();
  if (token === undefined || token === "") {
    return {
      vault: new Map<string, string>(),
      note: "BWS_ACCESS_TOKEN is not set — every vault row will read as MISSING (never fall back to a file)",
    };
  }
  try {
    const raw = execFileSync("bws", ["secret", "list", VAULT_PROJECT_ID, "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    const parsed = JSON.parse(raw) as { key?: string; value?: string }[];
    const vault = new Map<string, string>();
    for (const entry of parsed) {
      if (typeof entry.key === "string" && typeof entry.value === "string") {
        vault.set(entry.key, entry.value);
      }
    }
    return { vault, note: `vault: ${vault.size} secret(s) readable from project alignsynch-web` };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return {
      vault: new Map<string, string>(),
      note: `the vault could not be read (${message}) — vault rows will read as MISSING`,
    };
  }
}

/** The derived values: the package version this tree carries, and the commit it is at. */
function readDerived(root: string): Map<string, string> {
  const derived = new Map<string, string>();
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string;
    };
    if (typeof pkg.version === "string") derived.set("package.json:version", pkg.version);
  } catch {
    /* a tree with no package.json cannot derive a version; the row reports MISSING */
  }
  try {
    const commit = execFileSync("git", ["-C", root, "rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commit !== "") derived.set("git:commit", commit);
  } catch {
    /* not a git tree: APP_COMMIT is optional */
  }
  return derived;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    return value !== undefined && !value.startsWith("--") ? resolve(value) : undefined;
  };
  const target = flag("dir") ?? repoRoot;
  const source = flag("source-dir") ?? target;
  const dryRun = argv.includes("--dry-run");

  const { vault, note } = readVault();
  const derived = readDerived(target);
  console.log(`env-render: ${note}`);

  const plans = ENVIRONMENTS.map((environment) => {
    const file = join(source, carriedFile(environment));
    // Rule 1: `carried` reads this environment's own file and no other — see `carriedFile`.
    const carried = parseEnvFile(file);
    return { environment, plan: planRender({ environment, vault, carried, derived }) };
  });

  let refused = 0;
  for (const { plan } of plans) {
    const ok = plan.resolutions.filter((entry) => entry.status === "ok").length;
    const appDefault = plan.resolutions.filter((entry) => entry.status === "app-default").length;
    console.log(
      `\nenv-render: ${plan.environment} (${plan.file}) — ${ok} resolved, ` +
        `${plan.missing.length} missing, ${appDefault} left to the app's own default`,
    );
    for (const entry of plan.resolutions) {
      const mark =
        entry.status === "missing" ? "MISSING" : entry.status === "ok" ? "ok     " : "default";
      console.log(`  ${mark} ${entry.name.padEnd(40)} (${entry.from})`);
      if (entry.note !== undefined) console.log(`        ${entry.note}`);
    }
    if (plan.missing.length > 0) {
      refused += 1;
      console.error(
        `  ✗ ${plan.file} not written: required variable(s) unresolved — ` +
          plan.missing.map((entry) => entry.name).join(", "),
      );
      continue;
    }
    if (dryRun) {
      console.log(`  --dry-run: ${plan.file} would be written (${plan.body?.length ?? 0} bytes)`);
      continue;
    }
    mkdirSync(dirname(join(target, plan.file)), { recursive: true });
    writeFileSync(join(target, plan.file), plan.body ?? "");
    console.log(`  wrote ${plan.file} (${plan.body?.length ?? 0} bytes, values never printed)`);
  }

  if (refused > 0) {
    console.error(
      `\nenv-render: REFUSED — ${refused} of ${plans.length} file(s) have a required variable that ` +
        "does not resolve. Nothing partial was written for those files; fill the source and re-run.",
    );
    return 1;
  }
  console.log(
    dryRun
      ? "\nenv-render: --dry-run — plan complete, nothing written"
      : "\nenv-render: 3 file(s) written from one table. Values were never printed.",
  );
  return 0;
}

/**
 * Invoked directly, or imported by a case? `process.argv[1]` rather than `import.meta.url`,
 * because `tsconfig.datacheck.json` compiles this module as CommonJS for the node:test suite.
 */
const invokedDirectly = /env-render\.(?:ts|js)$/.test(process.argv[1] ?? "");

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error("env-render: the renderer itself failed", error);
      process.exit(1);
    },
  );
}
