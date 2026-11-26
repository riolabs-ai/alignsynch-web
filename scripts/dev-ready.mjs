/**
 * `pnpm dev:ready` — start the dev server on a branch whose accounts exist (#1401).
 *
 * The loop this replaces: start the server, open `/demo`, type the PIN, get *no* role buttons
 * because `demo_account` is empty, then remember that the fix is `pnpm db:seed` — which is
 * sometimes true and sometimes not, and which takes a fleet-wide lock even when nothing is wrong.
 *
 * Four steps, and the third is the only one that writes:
 *
 * 1. **Load** the repo's own environment (`.env.local` wins over `.env`), so the same file the dev
 *    server reads decides the databases and the admin seats.
 * 2. **Census** — one read, no lock: content rows, `demo_account` rows, and which `ADMIN_NN_EMAIL`
 *    addresses `neon_auth` already holds.
 * 3. **Seed, only if the census says so** — `lib/dev/ready.ts` makes that call, and it is tested
 *    without a database. Reasons are printed; notes (a half-configured seat, no seat at all) are
 *    printed and never fail the loop.
 * 4. **Start** `next dev --turbo` with the caller's stdio, so ctrl-c reaches it.
 *
 * **A branch with no `DATABASE_URL` is not an error.** QuizHub runs on fixtures and has no
 * `.env.local` by design; it prints one line and starts, which is also the right answer for a
 * reviewer who has never run `neon env pull`.
 *
 * **Why this is not `db:seed --check`.** `--check` (#865) is lock-free as well, but it asks about
 * *relationship* drift against the committed bundle: on a bare branch — zero relationships, the
 * one state this command exists to repair — it prints `converged` and exits 0, and it counts
 * neither `demo_account` nor a seat. The census below is the smallest read that answers *this*
 * question; the seed's own sweep question stays in `db:seed --check`.
 *
 * Never prints a value from `ADMIN_NN_PASS` — the census reads nothing from a password, and the
 * seed it spawns prints one line per seat and no credentials.
 */
import { spawn } from "node:child_process";
import { Client } from "pg";

import { bootstrapPlan, censusLine, forwardedArgs, readyDecision } from "../lib/dev/ready.ts";
import { loadEnv, repoRoot } from "./load-env.mjs";

/** The same numbering the seed uses: `ADMIN_01_EMAIL` … `ADMIN_99_EMAIL`. */
const SEAT_KEY = /^ADMIN_(\d+)_(EMAIL|PASS)$/;

/** The node flags `pnpm db:seed` runs with, so this spawns the identical command. */
const SEED_ARGS = [
  "--import",
  "./scripts/ts-modules.mjs",
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  "scripts/db-seed.mjs",
];

/** `next dev --turbo`, with anything after `pnpm dev:ready --` appended (e.g. `--port 3000`). */
const DEV_ARGS = ["next", "dev", "--turbo", ...forwardedArgs(process.argv.slice(2))];

/** Every `ADMIN_NN_*` pair the environment names, half-configured ones included. */
function readSeats() {
  const suffixes = new Set();
  for (const key of Object.keys(process.env)) {
    const match = key.match(SEAT_KEY);
    if (match) suffixes.add(match[1]);
  }
  return [...suffixes].sort().map((suffix) => ({
    suffix,
    email: (process.env[`ADMIN_${suffix}_EMAIL`] ?? "").trim(),
    hasPassword: (process.env[`ADMIN_${suffix}_PASS`] ?? "").trim() !== "",
  }));
}

/** The user table is Neon's, so its spelling is read rather than assumed. */
async function userTable(client) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'neon_auth' AND table_name IN ('user', 'users')
      ORDER BY table_name = 'user' DESC LIMIT 1`,
  );
  return rows[0]?.table_name ?? null;
}

/**
 * Step 2: the counts. Two `SELECT`s — the two scalars ride one statement, because a census that
 * costs three round trips on the common path is a census a person notices.
 */
async function census(client) {
  const { rows: totals } = await client.query(
    `SELECT (SELECT count(*)::int FROM record)         AS content_rows,
            (SELECT count(*)::int FROM demo_account)   AS demo_accounts`,
  );
  const table = await userTable(client);
  const presentEmails = table
    ? (await client.query(`SELECT lower(email) AS email FROM neon_auth."${table}"`)).rows.map(
        (row) => String(row.email ?? ""),
      )
    : [];

  return {
    contentRows: totals[0]?.content_rows ?? 0,
    demoAccounts: totals[0]?.demo_accounts ?? 0,
    seats: readSeats(),
    presentEmails,
  };
}

/** Step 3: the seed, as its own process, so its exit code is the answer. */
function seed() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, SEED_ARGS, { cwd: repoRoot, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Step 4: the dev server, inheriting stdio so ctrl-c and its logs belong to the caller. */
function dev() {
  return new Promise((resolve) => {
    const child = spawn("pnpm", DEV_ARGS, { cwd: repoRoot, stdio: "inherit" });
    child.on("exit", (code, signal) => resolve(signal ? 130 : (code ?? 0)));
  });
}

async function main() {
  loadEnv();

  const plan = bootstrapPlan({ hasDatabaseUrl: (process.env.DATABASE_URL ?? "") !== "" });
  if (plan.kind === "start") {
    for (const line of plan.lines) console.log(line);
    process.exitCode = await dev();
    return;
  }

  const url = process.env.DATABASE_URL ?? "";
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || url });
  let found;
  try {
    await client.connect();
    found = await census(client);
  } catch (error) {
    // A branch the census cannot read is a branch that needs a human: say which, and start anyway
    // so the failure is visible in the browser rather than swallowed by a pre-start script.
    console.log(`dev:ready — the census could not be read: ${error?.message ?? error}`);
    process.exitCode = await dev();
    return;
  } finally {
    await client.end().catch(() => {});
  }

  const decision = readyDecision(found);
  console.log(censusLine(found));
  for (const note of decision.notes) console.log(`  · ${note}`);

  if (!decision.needed) {
    console.log("  ✓ nothing to do — starting the server");
    process.exitCode = await dev();
    return;
  }

  for (const reason of decision.reasons) console.log(`  ! ${reason}`);
  console.log("  → running db:seed first");
  const code = await seed();
  if (code !== 0) {
    console.error(
      `dev:ready — db:seed exited ${code}; not starting a server on a half-seeded branch`,
    );
    process.exitCode = code;
    return;
  }

  process.exitCode = await dev();
}

await main();
