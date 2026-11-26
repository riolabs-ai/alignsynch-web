/**
 * The prototype catalogue's provenance rules (#1405).
 *
 * What this file proves, in the order the card asks for it:
 *
 *   1. **Dates come from git.** Every row's `date` is the committer date of the last commit that
 *      touched the file (`dateSource: "git"`) — never the mtime, which is what the snapshot used.
 *   2. **Versions come from tags.** A file committed *at* a tag carries `v2.0.0`; a file committed
 *      one commit *after* it carries `v2.0.0+1`, because "v2.0.0 alone" would claim a release the
 *      file was not in.
 *   3. **A row with neither is marked, not guessed.** A file whose last commit predates every tag
 *      carries `version: null`, `versionSource: "none"`; a file that is untracked carries
 *      `dateSource: "mtime"`, `untracked: true` — and `--fail-on-untracked`, which is what CI runs,
 *      refuses the build instead of publishing that guess.
 *   4. **The catalogue paths are the live paths.** `docs/` maps to `quizhub/quizhub/docs/…` and
 *      `prototypes/` keeps its own prefix, so a `#anchor` deep link does not move when the builder
 *      does.
 *   5. **The copies are verbatim.** Byte-identical to the source; the index is `noindex,nofollow`.
 *
 * Every case runs in an `mkdtemp` repository with its own commits and tags, so nothing here touches
 * this checkout's history, and the builder is spawned exactly the way CI spawns it.
 */
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const BUILDER = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "build-prototype-catalog.mjs",
);

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * The environment every fixture command runs under.
 *
 * `GIT_DIR` and friends are **removed**, not inherited. The pre-push hook exports `GIT_DIR` (this
 * checkout is a linked worktree) and `scripts/verify.sh` runs `pnpm test` from inside that hook, so
 * a fixture that inherits it commits into *this* branch instead of its own throwaway repository —
 * measured: six fixture commits on `alignsynch/t_a14071a8` before this was fixed. The same class of
 * leak `scripts/git-index.mjs` documents. `GIT_CEILING_DIRECTORIES` is the second net: even if a
 * variable slipped through, git cannot walk up out of the temp directory into this repository.
 */
function gitEnv(cwd: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
  ]) {
    delete env[name];
  }
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  env.GIT_CEILING_DIRECTORIES = dirname(cwd);
  return env;
}

/** A throwaway git repository, isolated from this checkout's git environment and config. */
function repoFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "catalog-"));
  scratch.push(root);
  git(root, "init", "-q", "-b", "main");
  // The fixture must be its own repository. Without this, a leak would show up as six stray commits
  // on the real branch and a *passing* suite — exactly the failure this file was written to catch.
  const toplevel = realpathSync(git(root, "rev-parse", "--show-toplevel"));
  if (toplevel !== realpathSync(root)) {
    throw new Error(`fixture repository leaked: ${root} resolves to ${toplevel}`);
  }
  return root;
}

function git(cwd: string, ...args: string[]): string {
  const options: ExecFileSyncOptionsWithStringEncoding = {
    cwd,
    encoding: "utf8",
    env: gitEnv(cwd),
    stdio: ["ignore", "pipe", "pipe"],
  };
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=catalog-test",
      "-c",
      "user.email=catalog@example.test",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    options,
  ).trim();
}

/** Write `<root>/<rel>` and commit it; `rel` is relative to the fixture root. */
function writeAndCommit(root: string, rel: string, html: string, message: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
  // The page names a stylesheet, and the stylesheet is beside it, because a catalogue page with no
  // refs at all is a tree the asset gate cannot check — and it refuses to pass on nothing (#1436).
  const sheet = join(dirname(full), "page.css");
  writeFileSync(sheet, "body{color:#111}\n");
  git(root, "add", "--", rel, join(dirname(rel), "page.css"));
  git(root, "commit", "-q", "-m", message);
}

function page(title: string): string {
  return `<!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="page.css"></head><body><h1 id="anchor">${title}</h1></body></html>\n`;
}

interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Spawn the builder the way CI does: `node scripts/build-prototype-catalog.mjs …` from the repo root. */
function build(cwd: string, ...args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [BUILDER, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv(cwd),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

interface Row {
  readonly path: string;
  readonly date: string;
  readonly dateSource: string;
  readonly version: string | null;
  readonly versionTag: string | null;
  readonly versionDistance: number | null;
  readonly versionSource: string;
  readonly untracked: boolean;
  readonly commit: string | null;
  readonly group: string;
}

function catalogOf(outDir: string): Row[] {
  return JSON.parse(readFileSync(join(outDir, "catalog.json"), "utf8")) as Row[];
}

function byPath(rows: readonly Row[], path: string): Row {
  const row = rows.find((candidate) => candidate.path === path);
  if (!row) throw new Error(`no row for ${path}: ${rows.map((r) => r.path).join(", ")}`);
  return row;
}

describe("the prototype catalogue's provenance", () => {
  it("dates every row from git and versions it from the nearest tag, with the distance", () => {
    const root = repoFixture();
    // One commit before any tag exists: this row can only ever be marked "no version".
    writeAndCommit(
      root,
      "prototypes/project-spec/pre-tag.html",
      page("pre tag"),
      "prototype before any tag",
    );
    writeAndCommit(root, "prototypes/project-spec/a.html", page("a"), "prototype a");
    writeAndCommit(root, "docs/qa/b.html", page("b"), "docs prototype b");
    git(root, "tag", "v2.0.0");
    // One commit after the tag: `v2.0.0+1`, not `v2.0.0`.
    writeAndCommit(root, "prototypes/project-spec/c.html", page("c"), "prototype c after the tag");
    const head = git(root, "rev-parse", "HEAD");

    const out = join(root, ".catalog-site");
    const run = build(root, "--out", out, "--min-entries", "3", "--require", "project-spec/a.html");
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);

    const rows = catalogOf(out);
    expect(rows).toHaveLength(4);

    // 1. Dates are git committer dates on every row.
    for (const row of rows) {
      expect(row.dateSource).toBe("git");
      expect(row.untracked).toBe(false);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.commit).toMatch(/^[0-9a-f]{40}$/);
    }

    // 2. Versions are the nearest tag reachable from the file's last commit, plus the distance.
    const atTag = byPath(rows, "quizhub/quizhub/docs/qa/b.html");
    expect(atTag.versionSource).toBe("tag");
    expect(atTag.versionTag).toBe("v2.0.0");
    expect(atTag.versionDistance).toBe(0);
    expect(atTag.version).toBe("v2.0.0");

    const afterTag = byPath(rows, "project-spec/c.html");
    expect(afterTag.versionSource).toBe("tag");
    expect(afterTag.versionDistance).toBe(1);
    expect(afterTag.version).toBe("v2.0.0+1");
    expect(afterTag.commit).toBe(head);

    // 3. A row whose last commit predates every tag, and one with no tag at all, are marked —
    //    neither is filled in from its filename.
    for (const path of ["project-spec/pre-tag.html", "project-spec/a.html"]) {
      const untagged = byPath(rows, path);
      expect(untagged.version).toBeNull();
      expect(untagged.versionTag).toBeNull();
      expect(untagged.versionSource).toBe("none");
    }

    // 4. The catalogue path keeps the live path for both sources.
    expect(byPath(rows, "quizhub/quizhub/docs/qa/b.html").group).toBe("quizhub");
  });

  it("copies every prototype byte-for-byte and keeps the index out of search", () => {
    const root = repoFixture();
    const html = page("deep link target");
    writeAndCommit(
      root,
      "prototypes/project-spec/spec-design-page-x/alignsynch-ui-specs.html",
      html,
      "add",
    );

    const out = join(root, "out");
    expect(build(root, "--out", out, "--source", "prototypes").status).toBe(0);

    const copy = readFileSync(
      join(out, "p", "project-spec", "spec-design-page-x", "alignsynch-ui-specs.html"),
      "utf8",
    );
    expect(copy).toBe(html);

    const index = readFileSync(join(out, "index.html"), "utf8");
    expect(index).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(index).toContain('href="p/project-spec/spec-design-page-x/alignsynch-ui-specs.html"');
    // The version cell never invents a value: an untagged row renders an em dash.
    expect(index).toContain('class="v none"');
  });

  it("marks an untracked prototype, and refuses it outright when told to", () => {
    const root = repoFixture();
    writeAndCommit(root, "prototypes/project-spec/tracked.html", page("tracked"), "add");
    mkdirSync(join(root, "prototypes", "project-spec"), { recursive: true });
    writeFileSync(join(root, "prototypes", "project-spec", "stray.html"), page("stray"));

    // Marked, not guessed: the row is published with its mtime and says so.
    const marked = build(root, "--out", join(root, "out"), "--source", "prototypes");
    expect(marked.status).toBe(0);
    const stray = byPath(catalogOf(join(root, "out")), "project-spec/stray.html");
    expect(stray.untracked).toBe(true);
    expect(stray.dateSource).toBe("mtime");
    expect(stray.versionSource).toBe("none");
    expect(marked.stdout).toContain("mtime fallback: 1");

    // Refused: what CI runs, so a guessed date can never ship as a shipped one.
    const strict = build(
      root,
      "--out",
      join(root, "strict"),
      "--source",
      "prototypes",
      "--fail-on-untracked",
    );
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain("not tracked by git");
    expect(strict.stderr).toContain("project-spec/stray.html");
  });

  it("refuses a short tree and a path two sources both claim", () => {
    const root = repoFixture();
    writeAndCommit(root, "prototypes/project-spec/a.html", page("a"), "add");

    const short = build(
      root,
      "--out",
      join(root, "out"),
      "--source",
      "prototypes",
      "--min-entries",
      "2",
    );
    expect(short.status).toBe(1);
    expect(short.stderr).toContain("refusing to publish an incomplete catalog");

    const missing = build(
      root,
      "--out",
      join(root, "out2"),
      "--source",
      "prototypes",
      "--require",
      "project-spec/nope.html",
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("required prototype(s) missing");

    const doubled = build(
      root,
      "--out",
      join(root, "out3"),
      "--source",
      "prototypes",
      "--source",
      "prototypes",
    );
    expect(doubled.status).toBe(1);
    expect(doubled.stderr).toContain("two sources claim the same catalog path");

    expect(existsSync(join(root, "out3", "catalog.json"))).toBe(false);
  });
});
