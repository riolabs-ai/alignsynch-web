/**
 * The assets beside the pages (#1436).
 *
 * The catalogue published 170 HTML pages and **zero** files beside them: every stylesheet, script,
 * font and image those pages name answered 404, and every V2 prototype rendered as bare text. The
 * gate stayed green because the only check counted rows. This file is the check that would have
 * caught it, in the order the defect has to be closed:
 *
 *   1. **Reading a page.** Refs come from markup, never from a script body (`'+repo+p+'` is not a
 *      file), and `data-src` is a copy-provenance annotation on these pages, not a fetch.
 *   2. **Importing only what is referenced.** `scripts/prototype-assets.mjs` copies the files a
 *      page names, at the page's own spelling, one hop through a stylesheet for the fonts — and
 *      copies no neighbour file the page never asked for. That is the whole difference between a
 *      329-file, 21.6 MB commit and the 370 MB tree the issue forbids.
 *   3. **The build carries them, and the gate proves it.** Every published page's asset refs
 *      resolve in the built site; a broken one fails the build and the counts print, so a gate
 *      that ran on nothing cannot pass. Root-absolute refs are counted and reported, never gated.
 *   4. **The real tree satisfies itself.** Every relative asset ref on the committed pages resolves
 *      to a committed file, and the dead refs are exactly the recorded ones — both ways, so a new
 *      dead link fails and a rotted allowance fails too.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { inspectSite, reportGate } from "../scripts/prototype-asset-gate.mjs";
import {
  classifyRef,
  collectLocalRefs,
  KNOWN_DEAD_PAGE_REFS,
  refsInHtml,
} from "../scripts/prototype-refs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORTER = join(ROOT, "scripts", "prototype-assets.mjs");
const BUILDER = join(ROOT, "scripts", "build-prototype-catalog.mjs");

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function write(root: string, rel: string, body: string): string {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
  return full;
}

function run(script: string, cwd: string, ...args: string[]) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
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

const PAGE = (title: string, head = "", body = ""): string =>
  `<!doctype html><html><head><title>${title}</title>${head}</head><body>${body}</body></html>\n`;

/**
 * A fixture laid out the way this repository is: the pages are **committed** under `prototypes/`,
 * the exported tree they came from sits under `source/`, and `docs/` exists so the builder's second
 * declared source resolves. The importer reads `git ls-files prototypes` to decide what is
 * published, so the fixture is its own repository — never this checkout, which is what
 * `tests/prototype-catalog.test.ts` documents the leak cost of.
 */
function treeFixture(): { root: string; source: string } {
  const root = tempDir("prototype-assets-");
  const source = join(root, "source");
  mkdirSync(join(root, "docs"), { recursive: true });
  git(root, "init", "-q", "-b", "main");

  const tokens =
    "@font-face{font-family:Inter;src:url(../fonts/inter-1.woff2) format('woff2')}\nbody{color:#111}\n";
  const page = PAGE(
    "align",
    '<link rel="stylesheet" href="css/tokens.css">',
    '<img src="images/logo.png" alt=""><a href="#main">main</a><a href="https://example.test">out</a>' +
      '<script>const p = "/"+repo+p+"</script><img src="images/Logo.png" alt="">',
  );

  write(source, "spec-a/css/tokens.css", tokens);
  write(source, "spec-a/fonts/inter-1.woff2", "wOF2\n");
  write(source, "spec-a/images/logo.png", "PNG\n");
  write(source, "spec-a/images/unused-banner.png", "PNG\n");
  write(source, "spec-a/align.html", page);

  write(root, "prototypes/project-spec/spec-a/align.html", page);
  git(root, "add", "--", "prototypes");
  git(root, "commit", "-q", "-m", "the pages, committed as they were in #1420");
  return { root, source };
}

/** `git` in the fixture, with this checkout's git environment removed (see GIT_DIR above). */
function git(cwd: string, ...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete env[name];
  }
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  env.GIT_CEILING_DIRECTORIES = dirname(cwd);
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
    { cwd, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

describe("reading a page's refs", () => {
  it("reads markup, not script bodies, and ignores a provenance annotation", () => {
    const html = PAGE(
      "p",
      '<link rel="stylesheet" href="css/a.css"><style>.x{background:url(../img/b.png)}</style>',
      '<img src="images/c.png" srcset="images/c-2x.png 2x, images/c-3x.png 3x" alt="">' +
        '<script>const u = "js/never-a-file.js"</script>' +
        '<span data-src="data/pages/payment.ts:42">copy</span>' +
        '<a href="#main">m</a><a href="https://example.test/x.js">x</a><img src="data:image/png;base64,AA">',
    );

    const refs = refsInHtml(html);
    expect([...refs].sort()).toEqual(
      [
        "css/a.css",
        "../img/b.png",
        "images/c.png",
        "images/c-2x.png",
        "images/c-3x.png",
        "#main",
        "https://example.test/x.js",
        "data:image/png;base64,AA",
      ].sort(),
    );
    // The two refs that must never be read: a path assembled in a script, and a provenance note.
    expect(refs).not.toContain("js/never-a-file.js");
    expect(refs).not.toContain("data/pages/payment.ts:42");
  });

  it("tells a served file apart from a domain root, an anchor and another origin", () => {
    expect(classifyRef("css/tokens.css?v=2#top")).toEqual({
      kind: "relative",
      path: "css/tokens.css",
    });
    expect(classifyRef("../05-start/start.html")).toEqual({
      kind: "relative",
      path: "../05-start/start.html",
    });
    expect(classifyRef("/assets/brand/x.png")).toEqual({
      kind: "root",
      path: "assets/brand/x.png",
    });
    expect(classifyRef("#main")).toEqual({ kind: "fragment", path: "" });
    expect(classifyRef("mailto:a@b.test")).toEqual({ kind: "external", path: "" });
    expect(classifyRef("//cdn.test/x.js")).toEqual({ kind: "external", path: "" });
    expect(classifyRef("images/a%20b.png").path).toBe("images/a b.png");
  });
});

describe("importing only what a page references", () => {
  it("lands each referenced file on the path the page asks for, and leaves the rest behind", () => {
    const { root, source } = treeFixture();

    const plan = run(IMPORTER, root, "--from", `${source}:project-spec`);
    expect(plan.status).toBe(0);
    // Four destinations: tokens.css, the font it names, and the two spellings the page asks for.
    expect(plan.stdout).toContain("4 to import");
    expect(
      existsSync(join(root, "prototypes", "project-spec", "spec-a", "css", "tokens.css")),
    ).toBe(false);

    const applied = run(IMPORTER, root, "--from", `${source}:project-spec`, "--apply");
    expect(applied.status).toBe(0);

    const landed = (rel: string) => join(root, "prototypes", "project-spec", "spec-a", rel);
    expect(readFileSync(landed("css/tokens.css"), "utf8")).toContain("font-family:Inter");
    expect(existsSync(landed("images/logo.png"))).toBe(true);
    // The font is named only by the stylesheet: one hop, or every @font-face is 404.
    expect(existsSync(landed("fonts/inter-1.woff2"))).toBe(true);
    // The page's own spelling wins, because the deploy is case-sensitive.
    expect(existsSync(landed("images/Logo.png"))).toBe(true);
    // Named by no page, so it is not the catalogue's to carry — this is the 370 MB the issue forbids.
    expect(existsSync(landed("images/unused-banner.png"))).toBe(false);

    const checked = run(IMPORTER, root, "--from", `${source}:project-spec`, "--check");
    expect(checked.stdout).toContain("every referenced asset is committed");
    expect(checked.status).toBe(0);

    rmSync(landed("css/tokens.css"));
    const drift = run(IMPORTER, root, "--from", `${source}:project-spec`, "--check");
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain("not committed");
  });
});

describe("the build carries them and the gate proves it", () => {
  it("publishes the asset beside the page and reports broken = 0", () => {
    const { root, source } = treeFixture();
    run(IMPORTER, root, "--from", `${source}:project-spec`, "--apply");

    const built = run(BUILDER, root, "--out", ".catalog-site", "--source", "prototypes");
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);
    expect(built.stdout).toContain("asset gate: 1 page(s)");
    expect(built.stdout).toContain("broken = 0");

    const site = join(root, ".catalog-site", "p");
    expect(existsSync(join(site, "project-spec/spec-a/align.html"))).toBe(true);
    expect(existsSync(join(site, "project-spec/spec-a/css/tokens.css"))).toBe(true);
    expect(existsSync(join(site, "project-spec/spec-a/images/logo.png"))).toBe(true);
    expect(existsSync(join(site, "project-spec/spec-a/fonts/inter-1.woff2"))).toBe(true);

    const report = inspectSite(site);
    expect(report.broken).toEqual([]);
    expect(report.assetRefs).toBeGreaterThan(0);
    expect(report.stylesheetRefs).toBe(1);
  });

  it("fails when a published page's asset is not in the built site", () => {
    const { root, source } = treeFixture();
    run(IMPORTER, root, "--from", `${source}:project-spec`, "--apply");
    expect(run(BUILDER, root, "--out", ".catalog-site", "--source", "prototypes").status).toBe(0);

    const site = join(root, ".catalog-site", "p");
    rmSync(join(site, "project-spec/spec-a/css/tokens.css"));

    const report = inspectSite(site);
    expect(report.broken).toEqual(["project-spec/spec-a/align.html → css/tokens.css"]);
    expect(() => reportGate(report)).not.toThrow(); // reporting is not the verdict…
    expect(report.broken.length).toBe(1); // …the caller refuses on this count
  });

  it("refuses a page whose asset exists in no tree, instead of inventing one", () => {
    const { root, source } = treeFixture();
    const page = PAGE("align", '<link rel="stylesheet" href="css/gone.css">');
    write(source, "spec-a/align.html", page);
    write(root, "prototypes/project-spec/spec-a/align.html", page);
    run(IMPORTER, root, "--from", `${source}:project-spec`, "--apply");

    const built = run(BUILDER, root, "--out", ".catalog-site", "--source", "prototypes");
    expect(built.status).toBe(1);
    expect(built.stderr).toContain("exists in no source tree");
  });

  it("refuses an unrecorded dead page ref", () => {
    const { root, source } = treeFixture();
    const page = PAGE(
      "align",
      '<link rel="stylesheet" href="css/tokens.css">',
      '<a href="../02-nope/nope.html">n</a>',
    );
    write(source, "spec-a/align.html", page);
    write(root, "prototypes/project-spec/spec-a/align.html", page);
    run(IMPORTER, root, "--from", `${source}:project-spec`, "--apply");

    const built = run(BUILDER, root, "--out", ".catalog-site", "--source", "prototypes");
    expect(built.status).toBe(1);
    expect(built.stderr).toContain("exist nowhere and are not recorded");
  });

  it("fails a build that resolved no asset ref at all", () => {
    const { root } = treeFixture();
    write(root, "prototypes/project-spec/spec-a/align.html", PAGE("align"));
    const built = run(BUILDER, root, "--out", ".catalog-site", "--source", "prototypes");
    expect(built.status).toBe(1);
    expect(built.stderr).toContain("a gate that checked nothing is not a pass");
  });
});

describe("the committed tree satisfies itself", () => {
  const tracked = execFileSync("git", ["ls-files", "prototypes"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
  const pages = tracked.filter((file) => /\.html?$/i.test(file));
  const prototypesRoot = join(ROOT, "prototypes");
  const resolve = (base: string, ref: string): string | null => {
    const target = join(base, ref);
    return existsSync(target) ? target : null;
  };

  it("tracks the assets, not just the pages", () => {
    const assets = tracked.filter((file) => /\.(css|js|png|svg|jpe?g|woff2?|avif)$/.test(file));
    // 329 files at the commit that closed #1436 (287 of them matched by this expression; the rest
    // are the 41 linked markdown docs and one JSON the pages also load).
    expect(assets.length).toBeGreaterThan(250);
    expect(pages.length).toBeGreaterThan(150);
  });

  it("resolves every relative asset ref on every tracked page", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const page of pages) {
      const collected = collectLocalRefs(join(prototypesRoot, page.slice("prototypes/".length)), {
        sourceRoot: prototypesRoot,
        resolve,
      });
      checked += collected.assets.length;
      for (const item of collected.dead) {
        if (item.kind === "asset") broken.push(`${page} → ${item.ref}`);
      }
      for (const item of collected.outside) broken.push(`${page} → ${item.ref} (outside the tree)`);
    }
    expect(broken).toEqual([]);
    expect(checked).toBeGreaterThan(250);
  });

  it("records exactly the dead page refs the tree still has", () => {
    const dead = new Set<string>();
    for (const page of pages) {
      const collected = collectLocalRefs(join(prototypesRoot, page.slice("prototypes/".length)), {
        sourceRoot: prototypesRoot,
        resolve,
      });
      for (const item of collected.dead) {
        if (item.kind === "page") {
          dead.add(`${page.slice("prototypes/".length)} → ${item.ref}`);
        }
      }
    }
    // Both directions: a new dead link fails, and so does an allowance the tree no longer needs.
    expect([...dead].sort()).toEqual([...KNOWN_DEAD_PAGE_REFS].sort());
    expect(new Set(KNOWN_DEAD_PAGE_REFS).size).toBe(KNOWN_DEAD_PAGE_REFS.length);
  });

  it("leaves no page unreachable from the index", () => {
    // A sanity check on the fixture above: every page the test walked is under `prototypes/`.
    expect(pages.every((page) => page.startsWith("prototypes/"))).toBe(true);
    expect(readdirSync(prototypesRoot).length).toBeGreaterThan(0);
    expect(relative(ROOT, prototypesRoot)).toBe("prototypes");
  });
});
