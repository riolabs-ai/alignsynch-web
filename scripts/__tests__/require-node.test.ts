/**
 * #1410 — the version preflight: one sentence naming both versions, instead of a stack trace.
 *
 * The card this closes started as "the script is broken". It was not: `pnpm hygiene` was run on
 * Node 18 against a tree whose `engines.node` says `24.x`, and Node 18 cannot load the `.ts` rules
 * module — so the reader got `ERR_UNKNOWN_FILE_EXTENSION` out of Node's own loader and went looking
 * in the wrong file. The repair is a guard that runs **before** the script (`prehygiene`), which is
 * also the only placement that works: the `--disable-warning` flag in the same command line is a
 * `bad option` on Node 18, so Node exits before any line of the script would have run.
 *
 * The pure cases pin the comparison; the last case pins the wiring, by running the real CLI against
 * a manifest that declares an engine nobody has. That is the half a pure test cannot see — the exact
 * failure this suite exists to stop.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

import { nodeVersionProblem, parseNodeRange, parseVersion } from "../require-node.mjs";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts", "require-node.mjs");

const fixtures: string[] = [];

after(() => {
  for (const directory of fixtures) rmSync(directory, { recursive: true, force: true });
});

describe("engines.node, read as semver", () => {
  it("reads the forms this repository uses, and refuses the rest", () => {
    assert.deepEqual(parseNodeRange("24.x"), { mode: "major", major: 24, minor: 0, patch: 0 });
    assert.deepEqual(parseNodeRange("24"), { mode: "major", major: 24, minor: 0, patch: 0 });
    assert.deepEqual(parseNodeRange("^24.1.0"), {
      mode: "major",
      major: 24,
      minor: 1,
      patch: 0,
    });
    assert.deepEqual(parseNodeRange(">=20.9.0"), { mode: "min", major: 20, minor: 9, patch: 0 });
    assert.deepEqual(parseNodeRange("~24.1.0"), { mode: "patch", major: 24, minor: 1, patch: 0 });
    assert.deepEqual(parseNodeRange("24.1.0"), { mode: "exact", major: 24, minor: 1, patch: 0 });
    // Not guessed at: an unreadable range is a refusal, not a pass.
    assert.equal(parseNodeRange("latest"), null);
    assert.equal(parseNodeRange(""), null);
  });

  it("reads a version, and nothing that is not one", () => {
    assert.deepEqual(parseVersion("24.22.0"), { major: 24, minor: 22, patch: 0 });
    assert.deepEqual(parseVersion("v18.19.1"), { major: 18, minor: 19, patch: 1 });
    assert.equal(parseVersion("twenty-four"), null);
  });
});

describe("the refusal", () => {
  it("stays quiet on the declared engine", () => {
    assert.equal(nodeVersionProblem("24.x", "24.22.0"), null);
    assert.equal(nodeVersionProblem("24.x", "24.0.0"), null);
    assert.equal(nodeVersionProblem(">=20.9.0", "20.9.0"), null);
    assert.equal(nodeVersionProblem("^24.1.0", "24.9.1"), null);
    assert.equal(nodeVersionProblem("~24.1.0", "24.1.9"), null);
  });

  it("names both versions when the runtime is below the pin", () => {
    const problem = nodeVersionProblem("24.x", "18.19.1");
    assert.ok(problem !== null);
    assert.match(problem, /requires Node 24\.x/);
    assert.match(problem, /this is Node 18\.19\.1/);
  });

  it("refuses a newer major too — `24.x` is a pin, not a floor", () => {
    const problem = nodeVersionProblem("24.x", "26.4.0");
    assert.ok(problem !== null, "Node 26 is outside 24.x and this gate has not been run on it");
    assert.match(problem, /this is Node 26\.4\.0/);
  });

  it("respects a minor floor and an exact version", () => {
    assert.ok(nodeVersionProblem("^24.1.0", "24.0.9") !== null);
    assert.ok(nodeVersionProblem("~24.1.0", "24.2.0") !== null);
    assert.ok(nodeVersionProblem(">=20.9.0", "20.8.2") !== null);
    assert.ok(nodeVersionProblem("24.1.0", "24.1.1") !== null);
  });

  it("refuses rather than guesses when the range or the runtime is unreadable", () => {
    assert.match(nodeVersionProblem("latest", "24.22.0") ?? "", /cannot read/);
    assert.match(nodeVersionProblem("24.x", "banana") ?? "", /not a readable Node version/);
  });
});

describe("the CLI the prehook runs", () => {
  it("exits 0 and prints nothing on this engine", () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  it("exits 1 and names both versions when the manifest declares another engine", () => {
    // A manifest nobody can satisfy, so the refusal is proved on any engine the suite runs on —
    // including CI, where Node 18 is not installed to try it against.
    const root = mkdtempSync(join(tmpdir(), "alignsynch-require-node-"));
    fixtures.push(root);
    mkdirSync(join(root, "scripts"));
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ name: "fixture", engines: { node: "99.x" } }, null, 2)}\n`,
    );
    // The script under test, byte for byte: the fixture must not prove a copy of the rule.
    writeFileSync(join(root, "scripts", "require-node.mjs"), readFileSync(SCRIPT, "utf8"));

    const result = spawnSync(process.execPath, [join(root, "scripts", "require-node.mjs")], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires Node 99\.x/);
    assert.ok(
      result.stderr.includes(process.versions.node),
      `the refusal must name the running version:\n${result.stderr}`,
    );
    assert.match(result.stderr, /node24\.sh/, "the refusal must say how to fix it");
  });
});
