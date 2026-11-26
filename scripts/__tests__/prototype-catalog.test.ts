/**
 * The catalog builder's two absences — #1419. `prototypes/` is not in this repository yet (the
 * decision that commits it is a separate card), and the builder treated "there is no such tree" as
 * one condition. That is two conditions:
 *
 *   - **no input yet** — the default `./prototypes` is absent because nothing has been committed
 *     there. The workflow reports a notice and stops green; this script does the same **only** when
 *     it is told so explicitly, with `--allow-empty`.
 *   - **broken input** — a root that was named (a repository variable, a `--root` on a hand run, a
 *     typo) and does not resolve, a root that exists but carries almost nothing, a `--require`
 *     target that is not there. All of these stay exit 1. The default is the hard error, so a wrong
 *     path in a real run is still caught — the flag is a caller's statement about its own tree, never
 *     a property of the builder.
 *
 * Every case below runs the real CLI as a child process, because the flag only means anything at the
 * process boundary. The tree is a fixture directory, so nothing here depends on whether the
 * repository has prototypes today.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts", "build-prototype-catalog.mjs");

const fixtures: string[] = [];

after(() => {
  for (const directory of fixtures) rmSync(directory, { recursive: true, force: true });
});

function fixture(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), `prototype-catalog-${label}-`));
  fixtures.push(directory);
  return directory;
}

/** A directory tree, written from `{ "<relative path>": "<contents>" }`. */
function tree(files: Record<string, string> = {}): string {
  const root = fixture("tree");
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const PROTOTYPE =
  "<!doctype html><html><head><title>Proof prototype</title></head><body></body></html>";

function cli(
  args: string[],
  cwd: string = ROOT,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("an absent prototype root", () => {
  it("is a hard error by default — a wrong path in a real run is still caught", () => {
    const root = fixture("absent");
    const result = cli(["--root", join(root, "prototypes"), "--out", join(root, "out")]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /prototype root does not exist: .*prototypes/);
  });

  it("is 'nothing to build' only with --allow-empty, and writes nothing", () => {
    const root = fixture("allow-empty");
    const out = join(root, "out");
    const result = cli(["--root", join(root, "prototypes"), "--out", out, "--allow-empty"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /prototype root absent \(.*prototypes\) — nothing to build/);
    assert.equal(existsSync(out), false, "an empty run must not create or empty the output tree");
  });

  it("creates no output tree even when one already exists", () => {
    const root = fixture("allow-empty-existing");
    const out = join(root, "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "keep.txt"), "previous build");

    const result = cli(["--root", join(root, "prototypes"), "--out", out, "--allow-empty"]);

    assert.equal(result.status, 0);
    assert.equal(readFileSync(join(out, "keep.txt"), "utf8"), "previous build");
  });
});

describe("a prototype root that exists", () => {
  it("builds, and --allow-empty changes nothing about it", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const out = join(root, "out");
    const result = cli([
      "--root",
      join(root, "prototypes"),
      "--out",
      out,
      "--min-entries",
      "1",
      "--allow-empty",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /entries: 1/);
    assert.equal(existsSync(join(out, "p", "proof.html")), true);
    assert.equal(JSON.parse(readFileSync(join(out, "catalog.json"), "utf8")).length, 1);
  });

  it("still fails when it carries nothing — --allow-empty is not a licence for an empty catalog", () => {
    const root = tree({ "prototypes/notes.md": "no prototypes here" });
    const result = cli([
      "--root",
      join(root, "prototypes"),
      "--out",
      join(root, "out"),
      "--min-entries",
      "250",
      "--allow-empty",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /catalog has 0 entries, expected at least 250/);
  });

  it("still fails when a --require target is missing", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli([
      "--root",
      join(root, "prototypes"),
      "--out",
      join(root, "out"),
      "--require",
      "project-spec/absent/deep-link.html",
    ]);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /required prototype\(s\) missing from the catalog: project-spec\/absent/,
    );
  });
});

describe("a typo'd root on a tree that has prototypes/", () => {
  it("exits non-zero — the name was given, so an absent directory is broken input", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(["--root", "prototypes-prod", "--out", "out"], root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /prototype root does not exist: .*prototypes-prod/);
  });

  it("does not fail when the same tree is asked for its real root", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(["--root", "prototypes", "--out", "out", "--min-entries", "1"], root);

    assert.equal(result.status, 0, result.stderr);
  });
});
