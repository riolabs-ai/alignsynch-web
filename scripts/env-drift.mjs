#!/usr/bin/env node
/**
 * env-drift — the report a stale credential never had.
 *
 *   pnpm env:drift                          production's staleness against data/env/rotations.json
 *   pnpm env:drift --json                   the same report, for `release:preflight`
 *   pnpm env:drift --from <listing.json>    compare a captured listing instead of calling the API
 *   pnpm env:drift --rotations <file>       hold the tree against another declared rotation set
 *   pnpm env:drift --target preview         another Vercel target (all branches)
 *
 * The rule is in `scripts/env-drift-rules.mjs`; this file is the I/O and the transcript.
 *
 * ## Why time is the only observable
 *
 * `pnpm env:check` validates the *manifest*: one row per name the app reads, in both directions. It
 * cannot say whether Vercel holds the current **value**, because `vercel env pull` answers
 * `[SENSITIVE]` for 21 of 48 production variables. A value is therefore unreadable by design, and
 * reading is not the question anyway.
 *
 * What *is* observable is **when the value was last written**. On 2026-11-24 the Neon account moved;
 * on 2026-11-26 the operator re-sourced production by hand and found `NEON_AUTH_COOKIE_SECRET`
 * **27 days** stale, `NEON_API_KEY` 22, `NEON_BRANCH` 25 and the four connection/auth names 5 —
 * while production served the whole time, so nothing failed loudly and nothing said so.
 *
 * So the report is a comparison, not a habit: `data/env/rotations.json` records the day each
 * credential set changed, and every variable that set governs whose `updatedAt` predates that day is
 * named here with both dates.
 *
 * ## Never a value
 *
 * This script prints names and dates, and a date is not a value. The listing is projected to four
 * fields (`key`, `target`, `type`, `updatedAt`) before anything else touches it — see
 * `projectRows` — so a response carrying `value` on every row leaves nothing to leak here, in a log,
 * or in a `--json` payload a caller re-prints.
 *
 * ## Not a fixer, on purpose
 *
 * It writes nothing: no `PATCH`, no `POST`, no `vercel env add`. A wrong write to a production
 * environment is worse than a stale one — the stale value is serving requests, and the act of
 * replacing it is the owner's, made with the new credential in hand. The remedy is printed; running
 * it is a human's act.
 *
 * ## Exit codes
 *
 *   0  nothing stale — every governed variable was written on or after its rotation
 *   1  stale variables exist, and they are named
 *   2  the check could not run: no token, an API error, or a rotations file that does not parse
 *
 * 2 is deliberately distinct from 1. "I could not look" must never be reported as "it is fine", and
 * the release preflight treats both as a refusal.
 *
 * The requirement is card t_bc244ff3; no GitHub issue carries it, so the card is cited rather than
 * an invented number.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ROTATIONS_PATH,
  dayOf,
  findDrift,
  parseRotations,
  projectRows,
  remedy,
  staleLines,
  summary,
} from "./env-drift-rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const API = "https://api.vercel.com";
/** The project every other store-reading script in this repository names (env-sync, env-matrix). */
const PROJECT = "prj_jvt3U5GpGv5TnmWfyqkQ5kbbou5k";
const TEAM = "team_kA2uEuTmRU2RhACF1Len0GES";

/**
 * A readable failure. The message goes into a transcript and into the preflight's remedy line, so
 * it names the missing thing and never quotes a response body — an API error can echo a payload.
 */
class Refusal extends Error {}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value !== undefined && !value.startsWith("--") ? value : true;
}

/**
 * The Vercel token: the shell's, else the CLI's own auth file.
 *
 * Read from the environment first so a release cut in CI or under `bin/withenv.sh` supplies its
 * own; the file is the local operator's case, and it is where `vercel login` already puts it.
 */
function token() {
  const fromEnv = process.env.VERCEL_TOKEN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();
  const file = path.join(os.homedir(), ".local/share/com.vercel.cli/auth.json");
  try {
    const found = JSON.parse(fs.readFileSync(file, "utf8")).token;
    if (typeof found === "string" && found.trim() !== "") return found.trim();
  } catch {
    // No CLI session — fall through to the refusal below, which names both ways to supply one.
  }
  throw new Refusal(
    "no Vercel token — export VERCEL_TOKEN, or run `vercel login` (its session file is read from " +
      "~/.local/share/com.vercel.cli/auth.json)",
  );
}

/** One page of the project's env rows. `limit=100` is the API's maximum. */
async function page(tok, until) {
  const query = new URLSearchParams({ teamId: TEAM, limit: "100" });
  if (until) query.set("until", until);
  const response = await fetch(`${API}/v9/projects/${PROJECT}/env?${query}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is a refusal, and it is not quoted: an error payload can carry a value.
  }
  if (!response.ok) {
    const code = body?.error?.code ? ` ${body.error.code}` : "";
    throw new Refusal(
      `the Vercel env API answered ${response.status}${code} — the token may not read project ` +
        `${PROJECT}, or the teamId is wrong`,
    );
  }
  if (body === null || typeof body !== "object") {
    throw new Refusal("the Vercel env API answered with a body this script cannot read");
  }
  return body;
}

/**
 * Every env row of the project, projected before it leaves this function.
 *
 * The listing is paginated: `pagination.next` is the cursor for the following page and is absent on
 * the last one. Production holds fewer than 100 rows today, so the loop is one iteration — but a
 * report that silently reads only the first page is a report that says "nothing stale" about rows
 * it never saw, which is the failure this whole file is about.
 */
export async function listingFromApi(tok) {
  const rows = [];
  let until = null;
  for (let guard = 0; guard < 50; guard += 1) {
    const body = await page(tok, until);
    rows.push(...projectRows(body));
    const next = body.pagination?.next;
    if (next === null || next === undefined) return rows;
    until = String(next);
  }
  throw new Refusal(
    "the Vercel env listing did not finish after 50 pages — refusing a partial read",
  );
}

/** A captured listing: the shape `--json` writes, or the API's own body. */
function listingFromFile(file) {
  const absolute = path.resolve(file);
  let body;
  try {
    body = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Refusal(`${file} could not be read as JSON (${error?.code ?? "parse error"})`);
  }
  return projectRows(body);
}

/** The rotations, or a refusal naming every problem the file has. */
function rotationsFrom(file) {
  const absolute = path.resolve(file);
  let text;
  try {
    text = fs.readFileSync(absolute, "utf8");
  } catch {
    throw new Refusal(`${file} is absent — it records the day each credential set changed`);
  }
  const { rotations, problems } = parseRotations(text);
  if (problems.length > 0) {
    throw new Refusal(
      `${file} has ${problems.length} problem(s): ` +
        problems.map((problem) => `${problem.where} ${problem.message}`).join("; "),
    );
  }
  return rotations;
}

/**
 * The whole run, as data: what was read, what is stale, and why. `--json` prints this; the transcript
 * is rendered from it; `release:preflight` reads the same object.
 */
export async function gatherDrift({ target = "production", rotationsPath, from } = {}) {
  const rotations = rotationsFrom(rotationsPath ?? path.join(ROOT, DEFAULT_ROTATIONS_PATH));
  const rows = from ? listingFromFile(from) : await listingFromApi(token());
  const report = findDrift(rows, rotations, { target });
  return {
    target,
    generatedFor: dayOf(Date.now()),
    rotations: rotations.map((entry) => ({
      id: entry.id,
      changedAt: entry.changedAt,
      covers: entry.names.length + entry.platform.length + entry.prefixes.length,
    })),
    compared: report.compared,
    uncovered: report.uncovered,
    onTarget: report.onTarget,
    stale: report.stale,
    unknown: report.unknown,
    summary: summary(report, rotations, { target }),
  };
}

async function main() {
  const target = arg("target", "production");
  if (!["production", "preview", "development"].includes(target)) {
    process.stderr.write(`env-drift: --target must be production|preview|development\n`);
    return 2;
  }
  const rotationsPath = arg("rotations", DEFAULT_ROTATIONS_PATH);
  if (rotationsPath === true) {
    process.stderr.write("env-drift: --rotations needs a path\n");
    return 2;
  }
  const from = arg("from");
  if (from === true) {
    process.stderr.write("env-drift: --from needs a path\n");
    return 2;
  }

  let report;
  try {
    report = await gatherDrift({
      target,
      rotationsPath: path.resolve(ROOT, rotationsPath),
      from: from || undefined,
    });
  } catch (error) {
    const message = error instanceof Refusal ? error.message : (error?.message ?? String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ available: false, reason: message }, null, 2)}\n`);
    }
    process.stderr.write(`env-drift: the check could not run — ${message}\n`);
    return 2;
  }

  const fresh = report.stale.length === 0 && report.unknown.length === 0;
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ available: true, ...report }, null, 2)}\n`);
    return fresh ? 0 : 1;
  }

  const say = (line = "") => process.stdout.write(`${line}\n`);
  say(report.summary);
  for (const line of staleLines(report.stale)) say(line);
  for (const row of report.unknown) {
    say(
      `  ${row.key}  has no readable updatedAt · predates ${row.rotation.id} (unknown when written)`,
    );
  }
  if (fresh) {
    say(
      `env-drift: PASS — every variable a rotation covers was written on or after it; names and ` +
        "dates only, no value was read, printed or stored",
    );
    return 0;
  }
  say(report.stale.length > 0 ? `\nenv-drift: FAIL — ${remedy(report.stale)}` : "");
  if (report.stale.length === 0) {
    say("\nenv-drift: FAIL — a variable covered by a rotation has no readable updatedAt");
  }
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`env-drift: ${error?.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
