/**
 * The proof that `pnpm db:seed` refuses production **before** it connects (#1336).
 *
 * `tests/neon-endpoints.test.ts` proves the rule; this file proves the seeder asks it. That
 * distinction is the whole card: `scripts/db-seed.mjs` had no refusal at all, so it swept every
 * relationship row the bundle did not describe (#865) and rewrote the live branch when the shell
 * pointed at it — and the only honest way to prove a fix for that is *not* to run the command
 * against a branch. A static read of the file is the executable stand-in, and it fails on the one
 * mistake that matters: a guard placed after a `new Client(` is decorative, and every later "the
 * seed refuses production" sentence would be false.
 *
 * `scripts/health-record-rules.mjs` used to claim this file's guard already existed. It did not;
 * the cases below are what keeps the sentence true.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SEED = readFileSync(new URL("../scripts/db-seed.mjs", import.meta.url), "utf8");

/** Every connection site in the file, in source order. */
const clientSites = [...SEED.matchAll(/new Client\(/g)].map((match) => match.index ?? -1);

/** Where `main()` starts, so a call can be proved to be inside the run rather than at load time. */
const MAIN_START = SEED.indexOf("async function main() {");

describe("db:seed refuses production before it connects", () => {
  it("imports the one rule every demo writer uses", () => {
    expect(SEED).toContain('import { productionRefusal } from "./demo-verify-rules.mjs";');
  });

  it("asks it before the first `new Client(` in the file", () => {
    const guard = SEED.indexOf("productionRefusal({");
    expect(guard, "db-seed.mjs no longer calls productionRefusal()").toBeGreaterThan(-1);
    expect(clientSites.length, "db-seed.mjs no longer opens a connection").toBeGreaterThan(0);
    expect(
      guard,
      "the refusal is after the first `new Client(` — a guard that runs after a connection is decorative",
    ).toBeLessThan(clientSites[0] ?? Number.POSITIVE_INFINITY);
  });

  it("runs it in main() before every mode, including the read-only `--check`", () => {
    expect(MAIN_START).toBeGreaterThan(-1);
    const guardCall = SEED.indexOf("if (refuseProduction()) return;", MAIN_START);
    const checkCall = SEED.indexOf("await checkOnly();", MAIN_START);
    expect(guardCall, "main() no longer calls refuseProduction()").toBeGreaterThan(MAIN_START);
    expect(checkCall).toBeGreaterThan(guardCall);
    // And before every connection main() itself opens: `--review`, `--demo-accounts`, the seed.
    for (const site of clientSites.filter((index) => index > MAIN_START)) {
      expect(guardCall).toBeLessThan(site);
    }
  });

  it("reads both connection strings and the label, not one of them", () => {
    const start = SEED.indexOf("function refuseProduction()");
    const body = SEED.slice(start, SEED.indexOf("if (refusal === null) return false;", start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("DATABASE_URL_UNPOOLED");
    expect(body).toContain("DATABASE_URL");
    expect(body).toContain("NEON_BRANCH");
    // A refusal that leaves exit code 0 is a refusal in a comment.
    expect(SEED.slice(start, SEED.indexOf("\n}\n", start))).toContain("process.exitCode = 2");
  });
});
