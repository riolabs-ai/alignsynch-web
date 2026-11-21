#!/usr/bin/env node
/**
 * `pnpm demo:env` — which Neon endpoints is this shell actually pointed at? (#1336)
 *
 * The failure this answers is the one nobody can see: the project moved, `.env.local` still says
 * `NEON_BRANCH="demo"`, and it opens the **new production** endpoint. Every demo writer now refuses
 * on the host (`scripts/neon-endpoints.mjs`), but a refusal tells you only that this run was
 * stopped — not what else in the checkout is lying. This prints the label and the endpoint each
 * connection string opens, side by side, with the role the table knows, and says which file to fix.
 *
 * **It reads the environment and nothing else.** No connection, no `pg`, no auth call: pointing it
 * at production is safe, which is the whole point — the command that tells you the shell is wrong
 * must not be the command that hurts when it is.
 *
 * Exit codes:
 *
 *   0  the label and the endpoints agree with each other
 *   1  a label says `demo` and an endpoint is production (one sentence names the file to fix), or
 *      there is no endpoint at all — a distinct message, because the fix is `neon env pull`, not an
 *      edit
 */
import { loadEnv } from "./load-env.mjs";
import { endpointOf, hostOf } from "./demo-verify-rules.mjs";
import { KNOWN_ENDPOINTS } from "./neon-endpoints.mjs";

const VARIABLES = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"];

/** The table row this endpoint belongs to, or `null` for a host the table does not list. */
function knownEntry(endpoint) {
  if (endpoint === null) return null;
  return KNOWN_ENDPOINTS.find((entry) => entry.endpoint === endpoint) ?? null;
}

function main() {
  loadEnv();

  const label = (process.env.NEON_BRANCH ?? "").trim();
  const rows = VARIABLES.map((variable) => {
    const value = (process.env[variable] ?? "").trim();
    const host = hostOf(value);
    const endpoint = endpointOf(value);
    return { variable, host, endpoint, entry: knownEntry(endpoint) };
  }).filter((row) => row.endpoint !== null);

  console.log(
    `demo:env · NEON_BRANCH=${label === "" ? "(unset)" : label} · ${rows.length} endpoint(s) in this shell`,
  );

  if (rows.length === 0) {
    console.error(
      [
        "",
        "✗ demo:env — no endpoint in this shell.",
        "",
        `Neither ${VARIABLES.join(" nor ")} names a Neon endpoint (unset, empty or unparseable), so`,
        "there is nothing to report. `neon env pull` in the repo root, or export the demo branch's",
        "connection string, and re-run.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  const width = Math.max(...rows.map((row) => row.variable.length), "variable".length);
  console.log("");
  console.log(`  ${"variable".padEnd(width)}  ${"endpoint".padEnd(26)}  role`);
  for (const row of rows) {
    const role = row.entry?.role ?? "unknown (not in scripts/neon-endpoints.mjs)";
    const where = row.entry === null ? "" : ` — ${row.entry.project} · ${row.entry.branch}`;
    console.log(
      `  ${row.variable.padEnd(width)}  ${String(row.endpoint).padEnd(26)}  ${role}${where}`,
    );
  }

  const production = rows.filter((row) => row.entry?.role.startsWith("production"));
  if (label.toLowerCase() === "demo" && production.length > 0) {
    const names = production.map((row) => `${row.variable} opens ${row.endpoint}`).join(", ");
    console.error(
      [
        "",
        `✗ demo:env — the shell says NEON_BRANCH=demo, but ${names}, which is production.`,
        "",
        "Nothing was changed: this command only reads the environment. Fix the file that set these",
        "values — `.env.local` is the usual suspect after a project move — with `neon env pull`, or",
        "export the demo branch's connection string in the shell you are using.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  console.log("");
  console.log("✓ demo:env — the label and the endpoints agree. Nothing to change.");
  return 0;
}

process.exitCode = main();
