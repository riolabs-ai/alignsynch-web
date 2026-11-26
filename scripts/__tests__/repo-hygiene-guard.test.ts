/**
 * #1410 — the engine guard, proved where it has to fire: on an entry point, on an engine that is
 * refused, and **before** the `.ts` module is resolved.
 *
 * #1412 shipped the guard as a `prehygiene` hook, which covers `pnpm hygiene` and nothing else. A
 * direct `node scripts/repo-hygiene.mjs` has no hook — and the entry point held a **static** import of
 * `repo-hygiene-rules.ts`, which Node resolves while it links the module, before the first line of
 * the script body runs. So on Node 18 the command still died in the loader with
 * `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"`, naming a file that was
 * never wrong, and the guard the previous card added could not fire on the path it was added for.
 *
 * Three properties make the guard real, and each is asserted here:
 *
 *   1. it refuses on an old runtime and names both versions;
 *   2. it refuses **before** the rules module is resolved — proved by leaving that module out of the
 *      fixture entirely, so a static import would fail to link (`ERR_MODULE_NOT_FOUND`) instead of
 *      reaching the check;
 *   3. every entry point that imports a `.ts` rules module does it dynamically, and every package
 *      script that runs one of them carries the `pre<script>` hook that covers the `pnpm` path
 *      (Node 18 aborts on `--disable-warning=…` while parsing argv, so the in-script check can never
 *      run for `pnpm <script>` — the hook is the only layer that can).
 *
 * The old runtime is **simulated**: `process.versions.node` is redefined in a `--import` preload of
 * the child, because CI has Node 24 and a suite that only ever runs on the engine it is checking
 * proves nothing about the engine it exists for. The loader underneath stays Node 24's, which is
 * exactly why the simulation is useful — the check passes on this engine only after the real one
 * would have failed, so a missing or late check lets the run continue and print a report.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

const ROOT = process.cwd();
const ENTRY = resolve(ROOT, "scripts", "repo-hygiene.mjs");
const GUARD = resolve(ROOT, "scripts", "require-node.mjs");

/** The engine this host's `node` is, and the one every failure in #1410 / #1412 was reported from. */
const OLD_ENGINE = "18.19.1";

/**
 * A preload that makes the child *believe* it is an old Node. `process.versions.node` is
 * non-writable but configurable; a plain assignment is silently ignored, which would leave a test
 * that looks like it simulates an old engine and does not.
 */
const SHIM = `Object.defineProperty(process.versions, "node", {
  value: ${JSON.stringify(OLD_ENGINE)},
  enumerable: true,
  configurable: true,
  writable: false,
});
`;

const fixtures: string[] = [];

after(() => {
  for (const directory of fixtures) rmSync(directory, { recursive: true, force: true });
});

/**
 * A stand-in tree holding the entry point and the guard **byte for byte** — the fixture must not
 * prove a copy of the rule — and a manifest declaring `engines` the caller picks. No
 * `repo-hygiene-rules.ts` is written: whether this run reaches the rules module at all is the
 * question the ordering cases ask.
 */
function entryFixture(engines: string): string {
  const root = mkdtempSync(join(tmpdir(), "alignsynch-hygiene-guard-"));
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", private: true, engines: { node: engines } }, null, 2)}\n`,
  );
  writeFileSync(join(root, "scripts", "require-node.mjs"), readFileSync(GUARD, "utf8"));
  writeFileSync(
    join(root, "scripts", "repo-hygiene.mjs"),
    readFileSync(ENTRY, "utf8"),
    // The copied entry keeps its shebang; nothing here executes it through the shell.
  );
  return root;
}

/** Source with comments removed, so a docstring that *names* a `.ts` file is not read as an import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("a direct `node scripts/repo-hygiene.mjs`", () => {
  it("refuses on a simulated old engine, naming both versions", () => {
    const root = entryFixture("24.x");
    const shim = join(root, "old-engine.mjs");
    writeFileSync(shim, SHIM);

    const result = spawnSync(
      process.execPath,
      ["--import", shim, join(root, "scripts", "repo-hygiene.mjs"), "--dry-run"],
      { cwd: root, encoding: "utf8" },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    assert.equal(result.status, 1, `the guard did not refuse:\n${output}`);
    assert.match(
      output,
      /requires Node 24\.x/,
      `the refusal must name the declared range:\n${output}`,
    );
    assert.ok(output.includes(OLD_ENGINE), `the refusal must name the running version:\n${output}`);
    assert.match(output, /node24\.sh/, "the refusal must say how to fix it");
    // The defect #1410 reports, by name: the loader error instead of a sentence.
    assert.doesNotMatch(
      output,
      /ERR_UNKNOWN_FILE_EXTENSION/,
      `the guard must replace the loader's error, not follow it:\n${output}`,
    );
    assert.equal(
      result.stdout,
      "",
      `the guard ran after the report — the check has to precede the work:\n${result.stdout}`,
    );
  });

  it("checks the engine before the rules module is resolved", () => {
    // The fixture has no `repo-hygiene-rules.ts` at all. A static import would be resolved while
    // this module links and the child would die with `ERR_MODULE_NOT_FOUND`, a `--dry-run` report
    // away from the version it should have named; a dynamic import after the check refuses first.
    const root = entryFixture("99.x");

    const result = spawnSync(
      process.execPath,
      [join(root, "scripts", "repo-hygiene.mjs"), "--dry-run"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    assert.equal(result.status, 1, `the run neither refused nor failed:\n${output}`);
    assert.match(
      output,
      /requires Node 99\.x/,
      `the refusal must name the declared range:\n${output}`,
    );
    assert.doesNotMatch(
      output,
      /ERR_MODULE_NOT_FOUND/,
      `the rules module was resolved before the check ran — that is the static import coming back:\n${output}`,
    );
  });
});

describe("every entry point with a `.ts` rules module", () => {
  // The three scripts `grep -n 'from "\./.*\.ts"' scripts/*.mjs` finds, which is also the run of
  // ops entry points `package.json` invokes without the `--import ./scripts/ts-modules.mjs` loader.
  const ENTRIES = ["repo-hygiene.mjs", "worktree-prune.mjs", "db-migrate.mjs"];

  it("loads it dynamically, after the engine check", () => {
    for (const name of ENTRIES) {
      const source = withoutComments(readFileSync(join(ROOT, "scripts", name), "utf8"));
      assert.doesNotMatch(
        source,
        /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s+["'][^"']+\.ts["']/m,
        `${name} imports a .ts module statically — Node resolves it before the check can run`,
      );
      assert.match(source, /^[ \t]*requireDeclaredNode\(\);$/m, `${name} does not call the guard`);
      assert.match(
        source,
        /\bawait import\(\s*["'][^"']+\.ts["']\s*\)/,
        `${name} does not load its rules module dynamically`,
      );
    }
  });

  it("is reachable through a pre-hook, which is the only layer `pnpm` can honour", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = manifest.scripts ?? {};
    // `prehygiene:apply` for `hygiene:apply` — measured: pnpm 12.16.1 derives pre/post hooks for
    // colon names too, and runs them by default.
    for (const name of ["hygiene", "hygiene:apply", "worktrees:prune", "db:migrate"]) {
      const hook = scripts[`pre${name}`];
      assert.ok(typeof scripts[name] === "string", `package.json has no \`${name}\` script`);
      assert.match(
        hook ?? "",
        /scripts\/require-node\.mjs/,
        `\`pnpm ${name}\` has no pre-hook: on Node 18 its --disable-warning flag aborts before the script, so nothing would name the engine`,
      );
    }
  });
});
