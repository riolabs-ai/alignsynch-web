/**
 * `docs/` read two ways is one tree (#1398).
 *
 * The publish boundary is only worth having if a bundle says the same thing as the checkout it came
 * from. The claims, in the order the risk lands:
 *
 *   1. **The archive is deterministic.** The same entries in a different order produce one archive;
 *      the header fixes order, mtime, mode and ownership, so a manifest's sha256 means something.
 *   2. **The bundle carries the index, not a directory walk.** Every `git ls-files docs` path is a
 *      manifest row and nothing else is — which is why `docs/`'s gitignored
 *      `AUDIENCE-AND-POSITIONING.md` copies are absent from the bundle and present in the checkout.
 *   3. **Both implementations answer the same path set and the same per-file digests.** The bundle
 *      is unpacked through its manifest (archive sha256, then each file's sha256) and compared
 *      against the checkout file by file — not by a sample — and a forged archive is refused.
 *   4. **The switch defaults to today's behaviour.** `DOCS_SOURCE` unset is the checkout's tree;
 *      `DOCS_SOURCE=bundle` plus `DOCS_BUNDLE_DIR` is the published one, so the acceptance run of
 *      this file (`DOCS_SOURCE=bundle DOCS_BUNDLE_DIR=… pnpm test tests/docs-source.test.ts`) proves
 *      the bundle path by *executing* it rather than by reading about it.
 *
 * The bundle here is built by running the real script, not by calling `buildDocsBundle` in-process:
 * the CLI is what CI runs, and a test that bypassed its argument handling would stay green while
 * `node scripts/docs-bundle.ts --out …` failed.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zstdCompressSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { sha256 } from "@/scripts/docs-bundle";

import {
  type DocsReader,
  bundleDocsSource,
  docsSource,
  localDocsSource,
  readBundleManifest,
  resetDocsSource,
} from "@/lib/docs/source";
import { tarEntries, untarEntries } from "@/lib/docs/tar.mjs";

/** The checkout this test runs in. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every tracked path under `docs/`, repo-relative — the bundle's membership, from the index. */
function trackedDocsPaths(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", "docs"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "");
}

/** Build a bundle with the CLI, exactly as CI does, into `out`. */
function buildBundle(out: string): void {
  execFileSync(process.execPath, [join(ROOT, "scripts", "docs-bundle.ts"), "--out", out], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

const scratch: string[] = [];

function scratchDirectory(name: string): string {
  const path = mkdtempSync(join(tmpdir(), `docs-source-${name}-`));
  scratch.push(path);
  return path;
}

/**
 * One bundle for the whole file, built by the CLI.
 *
 * Built once and shared because the tree is 130 MB: a per-describe build made the gate's `test`
 * step spend twelve seconds packing, and the suite's neighbours paid for it in worker starvation.
 * The generous hook timeout is the same fact stated where vitest reads it — the default 10 s is
 * three builds of headroom, not one extracted-and-compared bundle.
 */
let out = "";

beforeAll(() => {
  out = scratchDirectory("out");
  buildBundle(out);
}, 180_000);

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

describe("the codec", () => {
  it("orders entries by path, so two listings produce one archive", () => {
    const forward = [
      { path: "docs/README.md", bytes: Buffer.from("# hub\n") },
      { path: "docs/specs/flow-stages.md", bytes: Buffer.from("# stages\n") },
    ];
    expect(tarEntries([forward[1], forward[0]]).equals(tarEntries(forward))).toBe(true);
  });

  it("round-trips bytes, and refuses an escape or a duplicate", () => {
    const entries = [
      { path: "docs/a.md", bytes: Buffer.from("a") },
      { path: "docs/nested/b.png", bytes: Buffer.alloc(700, 7) },
    ];
    const read = untarEntries(tarEntries(entries));
    expect(read.map((entry) => entry.path)).toEqual(["docs/a.md", "docs/nested/b.png"]);
    expect(Buffer.from(read[1].bytes).equals(entries[1].bytes)).toBe(true);

    expect(() =>
      tarEntries([
        { path: "docs/a.md", bytes: Buffer.from("a") },
        { path: "docs/a.md", bytes: Buffer.from("b") },
      ]),
    ).toThrow(/twice/);
    expect(() => tarEntries([{ path: "/etc/passwd", bytes: Buffer.from("x") }])).toThrow(
      /relative path/,
    );
  });
});

describe("the bundle and the checkout are one tree", () => {
  let bundle: DocsReader;
  let local: DocsReader;

  beforeAll(() => {
    bundle = bundleDocsSource(out);
    local = localDocsSource();
  }, 120_000);

  it("carries every tracked path under docs/, and nothing else", () => {
    const manifest = readBundleManifest(out);
    const tracked = trackedDocsPaths();
    expect(manifest.files.map((file) => file.path)).toEqual(tracked);
    expect(manifest.totals.files).toBe(tracked.length);
    expect(manifest.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.version).toMatch(/\+[0-9a-f]{7}$/);

    // The unpacked tree holds exactly what the manifest describes, docs-relative.
    expect(bundle.listFiles()).toEqual(tracked.map((path) => path.replace(/^docs\//, "")));
  });

  it("answers the same digest for every file", () => {
    const manifest = readBundleManifest(out);
    const differing: string[] = [];
    for (const file of manifest.files) {
      const path = file.path.replace(/^docs\//, "");
      const digest = bundle.digest(path);
      if (digest !== local.digest(path) || digest !== file.sha256) differing.push(file.path);
    }
    expect(differing).toEqual([]);
    expect(manifest.totals.bytes).toBe(
      manifest.files.reduce((total, file) => total + file.bytes, 0),
    );
  }, 120_000);

  it("differs from the checkout only by the files git does not carry", () => {
    const tracked = new Set(trackedDocsPaths().map((path) => path.replace(/^docs\//, "")));
    const extra = local.listFiles().filter((path) => !tracked.has(path));
    // Whatever the difference is, none of it is a file the index carries — the property that
    // matters: a gitignored copy in a working tree cannot end up in a published bundle.
    expect(extra.every((path) => !tracked.has(path))).toBe(true);
    expect(bundle.listFiles().filter((path) => !tracked.has(path))).toEqual([]);
  });

  it("reads the same documents through both, including the manifest itself", () => {
    const manifestText = bundle.readText("docs.json");
    expect(manifestText).toBe(local.readText("docs.json"));
    expect(JSON.parse(manifestText)).toEqual(JSON.parse(local.readText("docs.json")));

    const image = "assets/og-image-01.png";
    expect(Buffer.from(bundle.readBytes(image)).equals(local.readBytes(image))).toBe(true);
  });

  it("refuses a path that leaves the tree, in both implementations", () => {
    for (const reader of [local, bundle]) {
      expect(reader.resolve("../README.md")).toBeNull();
      expect(reader.resolve("/etc/passwd")).toBeNull();
      expect(reader.resolve("specs/../../CHANGELOG.md")).toBeNull();
      expect(reader.resolve("docs.json")).not.toBeNull();
    }
  });

  it("refuses an archive whose digest disagrees with its manifest", () => {
    const broken = scratchDirectory("broken");
    const flipped = Buffer.from(readFileSync(join(out, "docs.tar.zst")));
    flipped[flipped.length - 1] ^= 0xff;
    copyFileSync(join(out, "manifest.json"), join(broken, "manifest.json"));
    writeFileSync(join(broken, "docs.tar.zst"), flipped);
    expect(() => bundleDocsSource(broken)).toThrow(/sha256 .* and manifest\.json says/);
  });

  it("refuses a file whose bytes disagree with its row", () => {
    const forged = scratchDirectory("forged");
    const archive = zstdCompressSync(
      tarEntries([{ path: "docs/docs.json", bytes: Buffer.from("{}\n") }]),
    );
    const manifest = {
      version: "0.0.0+0000000",
      sha: sha256(archive),
      generatedAt: "2020-01-01T00:00:00.000Z",
      files: [{ path: "docs/docs.json", bytes: 3, sha256: "0".repeat(64) }],
      totals: { files: 1, bytes: 3 },
    };
    writeFileSync(join(forged, "docs.tar.zst"), archive);
    writeFileSync(join(forged, "manifest.json"), JSON.stringify(manifest));
    expect(() => bundleDocsSource(forged)).toThrow(/in the archive and/);
  });
});

describe("the switch", () => {
  it("defaults to the checkout's tree, and follows DOCS_SOURCE", () => {
    vi.stubEnv("DOCS_SOURCE", "");
    vi.stubEnv("DOCS_BUNDLE_DIR", "");
    resetDocsSource();
    expect(docsSource().name).toBe("local");
    expect(docsSource().readText("docs.json")).toBe(localDocsSource().readText("docs.json"));

    vi.stubEnv("DOCS_SOURCE", "bundle");
    vi.stubEnv("DOCS_BUNDLE_DIR", out);
    resetDocsSource();
    expect(docsSource().name).toBe("bundle");
    // The same document through the published archive, and the same parsed manifest.
    expect(JSON.parse(docsSource().readText("docs.json"))).toEqual(
      JSON.parse(localDocsSource().readText("docs.json")),
    );

    vi.unstubAllEnvs();
    resetDocsSource();
  }, 60_000);

  it("says what is missing when the bundle directory is not set", () => {
    vi.stubEnv("DOCS_SOURCE", "bundle");
    vi.stubEnv("DOCS_BUNDLE_DIR", "");
    resetDocsSource();
    expect(() => docsSource()).toThrow(/DOCS_SOURCE=bundle needs DOCS_BUNDLE_DIR/);

    vi.unstubAllEnvs();
    resetDocsSource();
  });
});
