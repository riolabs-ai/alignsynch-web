/**
 * #1410 — the documented entry point, run the way the documentation spells it.
 *
 * The 26 cases in `repo-hygiene.test.ts` exercise the decision module directly and never execute
 * `scripts/repo-hygiene.mjs`, so the suite was green while the command in the docs failed on this
 * host: `pnpm hygiene` ran on Node 18 against a tree pinned to `24.x`, and Node 18 cannot load the
 * `.ts` rules module the entry point imports. Nothing in the suite could report that, because
 * nothing in the suite was the command.
 *
 * Two things make this a guard rather than a smoke test:
 *
 *   - the argv is **read out of `package.json`**, so the suite follows the documented command
 *     instead of agreeing with a hand-copied line that drifts from it;
 *   - it states its own precondition — the engine it runs on has to satisfy `engines.node`, checked
 *     with the preflight's own rule (`scripts/require-node.mjs`) rather than assumed. A guard that
 *     silently runs on an engine the repository does not declare is how the original failure was
 *     misread as a code defect.
 *
 * The child runs in a throwaway `git init` fixture with an `origin/main`, never in this checkout:
 * the job reads branches, worktrees and stashes, so in the real tree its exit code depends on what
 * every other worker has left dirty, and a guard that goes red because somebody else has an
 * uncommitted file is a guard nobody keeps.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

import { nodeVersionProblem } from "../require-node.mjs";

const ROOT = process.cwd();
const ENTRY_NAME = "scripts/repo-hygiene.mjs";
const ENTRY = resolve(ROOT, ENTRY_NAME);

interface Manifest {
  readonly engines?: { readonly node?: string };
  readonly scripts?: Record<string, string>;
}

function manifest(): Manifest {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Manifest;
}

/**
 * `node [flags] scripts/repo-hygiene.mjs`, exactly as `package.json` spells the documented command.
 * The script path is made absolute because the child's cwd is the fixture, not this tree.
 */
function documentedArgv(): string[] {
  const script = manifest().scripts?.hygiene;
  if (typeof script !== "string") throw new Error("package.json carries no `hygiene` script");
  const argv = script.split(/\s+/).filter(Boolean);
  assert.equal(argv[0], "node", `the hygiene script must run plain \`node\`, not \`${argv[0]}\``);
  assert.ok(argv.includes(ENTRY_NAME), `the hygiene script no longer runs ${ENTRY_NAME}`);
  return argv.slice(1).map((token) => (token === ENTRY_NAME ? ENTRY : token));
}

const fixtures: string[] = [];

after(() => {
  for (const directory of fixtures) rmSync(directory, { recursive: true, force: true });
});

/** A repository the job can read: one commit, an `origin/main`, nothing to prune. */
function gitFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "alignsynch-hygiene-"));
  fixtures.push(directory);
  const git = (...args: string[]) =>
    spawnSync(
      "git",
      ["-c", "user.name=repo-hygiene", "-c", "user.email=repo-hygiene@example.invalid", ...args],
      { cwd: directory, encoding: "utf8" },
    );
  const steps = [
    ["init", "-q", "-b", "main", "."],
    ["commit", "-q", "--allow-empty", "-m", "fixture"],
    ["update-ref", "refs/remotes/origin/main", "HEAD"],
  ];
  for (const step of steps) {
    const result = git(...step);
    assert.equal(result.status, 0, `git ${step.join(" ")} failed: ${result.stderr}`);
  }
  return directory;
}

describe("the documented entry point, run as documented", () => {
  it("runs on the engine the repository declares", () => {
    const required = manifest().engines?.node;
    assert.ok(typeof required === "string", "package.json declares no engines.node");
    const problem = nodeVersionProblem(required, process.versions.node);
    assert.equal(
      problem,
      null,
      `this suite is running on an engine the tree does not declare: ${problem}`,
    );
  });

  it("exits 0 and prints the report table", () => {
    const fixture = gitFixture();
    const result = spawnSync(process.execPath, [...documentedArgv(), "--dry-run"], {
      cwd: fixture,
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    assert.equal(result.status, 0, `pnpm hygiene exited ${result.status}:\n${output}`);
    // The run has to be the fixture's, not this checkout's — otherwise a green line proves nothing
    // about the tree under test.
    assert.match(output, /^repository:\s+\S/m);
    assert.ok(output.includes(fixture), `the run read a different tree:\n${output}`);
    assert.match(output, /^mode:\s+dry run$/m);
    for (const section of [
      "worktrees to remove",
      "branches to delete",
      "caches to clear",
      "needs a human",
    ]) {
      assert.ok(output.includes(section), `the report table lost its "${section}" section`);
    }
    assert.match(output, /^ {2}dry run — nothing deleted\./m);
  });
});
