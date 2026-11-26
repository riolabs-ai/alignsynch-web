/**
 * The catalog builder's two absences — #1419. `prototypes/` is a tree that arrives by decision, so a
 * checkout without it has nothing to publish; a source that was *declared* and does not resolve is
 * broken input. The builder used to report both as one hard error, which is why `main` was red on
 * every push before the tree landed — and why the fix must not go the other way and excuse a typo.
 *
 *   - **no input yet** — every declared source is absent, and the caller said so with
 *     `--allow-empty`. Exit 0, nothing written, the previous build left alone.
 *   - **broken input** — a source that does not resolve without that flag, a source that survives
 *     while another is missing and cannot clear the floor, a missing `--require` target. Exit 1.
 *
 * Every case runs the real CLI as a child process, because the flag only means anything at that
 * boundary. The trees are fixtures, so nothing here depends on whether this repository has
 * prototypes today (it does, since #1420).
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

describe("a tree where every declared source is absent", () => {
  it("is a hard error by default — a checkout that lost its tree is still caught", () => {
    const root = tree();
    const result = cli(["--out", "out"], root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /prototype source does not exist: .*prototypes/);
  });

  it("is 'nothing to build' only with --allow-empty, and writes nothing", () => {
    const root = tree();
    const out = join(root, "out");
    const result = cli(["--out", out, "--allow-empty"], root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /nothing to build — 2 declared source\(s\) absent/);
    assert.match(result.stdout, /source absent \(.*prototypes\) — skipped/);
    assert.equal(existsSync(out), false, "an empty run must not create the output tree");
  });

  it("leaves a previous build exactly where it is", () => {
    const root = tree();
    const out = join(root, "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "catalog.json"), "[]");

    const result = cli(["--out", out, "--allow-empty"], root);

    assert.equal(result.status, 0);
    assert.equal(readFileSync(join(out, "catalog.json"), "utf8"), "[]");
  });
});

describe("a tree where one source survives and one is absent", () => {
  it("still fails the floor — --allow-empty is not a licence for a short catalogue", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(
      [
        "--out",
        "out",
        "--source",
        "prototypes",
        "--source",
        "prototypes-prod",
        "--min-entries",
        "2",
        "--allow-empty",
      ],
      root,
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /catalog has 1 entries, expected at least 2/);
  });

  it("builds the surviving source when the caller accepts the absence", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const out = join(root, "out");
    const result = cli(
      [
        "--out",
        out,
        "--source",
        "prototypes",
        "--source",
        "prototypes-prod",
        "--min-entries",
        "1",
        "--allow-empty",
      ],
      root,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /entries: 1/);
    assert.match(result.stdout, /source absent \(.*prototypes-prod\) — skipped/);
    assert.equal(existsSync(join(out, "p", "proof.html")), true);
  });
});

describe("a prototype source that exists", () => {
  it("builds, and --allow-empty changes nothing about it", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE, "docs/page.html": PROTOTYPE });
    const out = join(root, "out");
    const result = cli(
      ["--out", out, "--source", "prototypes", "--min-entries", "1", "--allow-empty"],
      root,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /entries: 1/);
    assert.equal(JSON.parse(readFileSync(join(out, "catalog.json"), "utf8")).length, 1);
  });

  it("still fails when a --require target is missing", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(
      ["--out", "out", "--source", "prototypes", "--require", "project-spec/absent/deep-link.html"],
      root,
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /required prototype\(s\) missing from the catalog: project-spec/);
  });
});

describe("a typo'd source on a tree that has prototypes/", () => {
  it("exits non-zero — the name was given, so an absent directory is broken input", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(["--out", "out", "--source", "prototypes-prod"], root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /prototype source does not exist: .*prototypes-prod/);
  });

  it("does not fail when the same tree is asked for its real source", () => {
    const root = tree({ "prototypes/proof.html": PROTOTYPE });
    const result = cli(["--out", "out", "--source", "prototypes", "--min-entries", "1"], root);

    assert.equal(result.status, 0, result.stderr);
  });
});
