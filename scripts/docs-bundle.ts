/**
 * `pnpm docs:bundle` and the CI artifact — `docs/` as one deterministic archive (#1398).
 *
 * The reader (`lib/docs/tree.ts`) opens `docs/` from the checkout today, which is exactly right for
 * a tree that ships beside the app and wrong the day it does not. This script is the publish
 * boundary in the other direction: it walks the tree the *index* carries and writes two files —
 *
 *   `docs.tar.zst`   a ustar of every tracked file under `docs/`, sorted, fixed mtime, no ownership
 *                    (`lib/docs/tar.mjs`), compressed with `node:zlib`'s zstd.
 *   `manifest.json`  `{ version, sha, generatedAt, files: [{ path, bytes, sha256 }], totals }`, so
 *                    a consumer can verify what it extracted and name the tree it came from.
 *
 * **Membership is the index, never a directory walk.** `.gitignore` deliberately keeps five
 * `AUDIENCE-AND-POSITIONING.md` copies out of this tree, so a filesystem walk would pack files no
 * clone has and no gate judges — `scripts/docs-check.mjs` reads membership from `git ls-files` for
 * the same reason (#1020). `manifest.files.length` is therefore `git ls-files docs | wc -l` by
 * construction, not by luck.
 *
 * **Reproducible, and that is the acceptance, not a nicety.** Entry order, mtime, mode and ownership
 * are fixed in the codec; `generatedAt` is the *source commit's* own date (or `SOURCE_DATE_EPOCH`
 * when a build wants to pin it) rather than the wall clock, so two builds of one tree produce one
 * archive and one manifest, byte for byte. `tests/docs-source.test.ts` builds the bundle twice and
 * compares both files.
 *
 * **What this script does not do:** it does not deploy, publish to a registry, or move a file. It
 * writes two files into `--out` and prints the census (`docs-bundle.yml` uploads them).
 *
 * Run under plain node 24 — no loader, no `@/` alias, no dependency:
 *
 *   node scripts/docs-bundle.ts --out /tmp/docs-out [--root <checkout>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants as zlibConstants, zstdCompressSync } from "node:zlib";

import type { BundleFile, BundleManifest } from "../lib/docs/source";
import { tarEntries } from "../lib/docs/tar.mjs";

/** The archive's name inside `--out`. The reader looks for exactly this. */
export const BUNDLE_ARCHIVE_NAME = "docs.tar.zst";

/** The manifest's name inside `--out`. The reader looks for exactly this. */
export const BUNDLE_MANIFEST_NAME = "manifest.json";

/** The tree the bundle publishes. Repo-relative, and the one spelling of it. */
const DOCS_DIRECTORY = "docs";

/** sha256 of a buffer, hex. The one digest the bundle and the reader both use. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** `git <args>` in `root`, as text, trimmed. */
function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Every tracked path under `docs/`, sorted by UTF-8 byte order.
 *
 * `-z` so a path with a space or an unusual byte arrives whole, and the sort is byte order rather
 * than git's own (which is byte order for this listing already, but the archive's hash must not
 * rest on that being true of git).
 */
export function trackedDocsPaths(root: string): string[] {
  return git(root, ["ls-files", "-z", "--", DOCS_DIRECTORY])
    .split("\0")
    .filter((path) => path !== "")
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

/**
 * The bundle for the tree at `root`, as the two file contents it writes.
 *
 * Pure over the checkout: no clock, no environment beyond `SOURCE_DATE_EPOCH`, so a caller can hold
 * both builds in memory and compare them (the test does).
 */
export function buildDocsBundle(root: string): {
  archive: Buffer;
  manifest: BundleManifest;
  manifestText: string;
} {
  const paths = trackedDocsPaths(root);
  if (paths.length === 0) {
    throw new Error(`docs-bundle: ${root} has no tracked files under ${DOCS_DIRECTORY}/`);
  }

  const files: BundleFile[] = [];
  const entries: { path: string; bytes: Uint8Array }[] = [];
  for (const path of paths) {
    const bytes = readFileSync(resolve(root, path));
    files.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
    entries.push({ path, bytes });
  }

  const tar = tarEntries(entries);
  // Level 3 is zstd's default and a fixed parameter, not a guess: the same input at the same level
  // is the same output, and the tree is 130 MB of mostly-binary documents where a higher level
  // buys single-digit percentages for minutes of CI.
  const archive = zstdCompressSync(tar, {
    params: { [zlibConstants.ZSTD_c_compressionLevel]: 3 },
  });

  const appVersion = (
    JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version?: unknown }
  ).version;
  if (typeof appVersion !== "string" || appVersion === "") {
    throw new Error("docs-bundle: package.json carries no version to name the bundle with");
  }
  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const manifest: BundleManifest = {
    version: `${appVersion}+${commit.slice(0, 7)}`,
    sha: sha256(archive),
    generatedAt: sourceInstant(root),
    files,
    totals: { files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) },
  };
  return { archive, manifest, manifestText: `${JSON.stringify(manifest, null, 2)}\n` };
}

/**
 * The instant the bundle says it was generated: `SOURCE_DATE_EPOCH` when a build pins it, else the
 * source commit's committer date.
 *
 * A `new Date()` here would make every build of one tree differ and turn the manifest's own hash
 * into noise, which is the whole failure this file exists to avoid.
 */
function sourceInstant(root: string): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && epoch !== "") {
    const seconds = Number(epoch);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      throw new Error(`docs-bundle: SOURCE_DATE_EPOCH=${epoch} is not a whole number of seconds`);
    }
    return new Date(seconds * 1000).toISOString();
  }
  const iso = git(root, ["log", "-1", "--format=%cI", "HEAD"]).trim();
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`docs-bundle: git reported ${JSON.stringify(iso)} as the commit date`);
  }
  return parsed.toISOString();
}

/** The default `--root`: the checkout this script sits in, resolved from its own path. */
function defaultRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/** `--out <dir>`, `--root <dir>`; anything else is a usage error, not a silent default. */
function parseArgs(argv: readonly string[]): { out: string; root: string } {
  let out = "docs-bundle";
  let root = defaultRoot();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--out" && flag !== "--root") {
      throw new Error(`docs-bundle: unknown argument ${JSON.stringify(flag)} (--out, --root)`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`docs-bundle: ${flag} needs a value`);
    }
    if (flag === "--out") out = value;
    else root = value;
    index += 1;
  }
  return { out: resolve(out), root: resolve(root) };
}

/** Write the bundle into `out` and print its census. Returns what was written, for a caller. */
export function writeDocsBundle(
  root: string,
  out: string,
): { archivePath: string; manifestPath: string; manifest: BundleManifest } {
  const { archive, manifest, manifestText } = buildDocsBundle(root);
  mkdirSync(out, { recursive: true });
  const archivePath = resolve(out, BUNDLE_ARCHIVE_NAME);
  const manifestPath = resolve(out, BUNDLE_MANIFEST_NAME);
  writeFileSync(archivePath, archive);
  writeFileSync(manifestPath, manifestText);
  return { archivePath, manifestPath, manifest };
}

const invokedDirectly = /docs-bundle\.(?:ts|js|mjs)$/.test(process.argv[1] ?? "");

if (invokedDirectly) {
  try {
    const { out, root } = parseArgs(process.argv.slice(2));
    const { archivePath, manifestPath, manifest } = writeDocsBundle(root, out);
    console.log(
      `docs-bundle: ${manifest.totals.files} files, ${manifest.totals.bytes} bytes → ${archivePath}`,
    );
    console.log(
      `docs-bundle: archive sha256 ${manifest.sha} (${readdirSync(out).length} files in ${out})`,
    );
    console.log(
      `docs-bundle: manifest ${manifestPath} — version ${manifest.version}, generatedAt ${manifest.generatedAt}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
