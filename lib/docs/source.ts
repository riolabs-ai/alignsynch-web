/**
 * `docs/` as an interface, with two implementations (#1398).
 *
 * The reader's other half, `lib/docs/tree.ts`, opens documents, the manifest, the release record and
 * the update ledger by path and parses them; none of that cares *where* the bytes came from. This
 * module is where it decides: the same paths, the same containment rule, the same "missing is a
 * throw, an escape is a null", over either
 *
 *   - **`local`** — `docs/` beside the app in the checkout, which is today's behaviour and the
 *     default. A deployment that sets nothing behaves exactly as it always has.
 *   - **`bundle`** — a published archive (`scripts/docs-bundle.ts`): `docs.tar.zst` plus its
 *     `manifest.json`, decompressed, **each file's sha256 verified against the manifest**, and
 *     unpacked once into a cache directory. Reads are then ordinary filesystem reads, because a
 *     per-request decompress of 130 MB is not a reader, it is an outage.
 *
 * **Read at build/start, never per request.** The archive and its manifest are opened once per
 * process (`docsSource()` memoises the reader; `tree.ts` already wraps the parses in React's
 * `cache`), so nothing here fetches, re-downloads or re-extracts inside a request. `DOCS_SOURCE` is
 * the switch and `DOCS_BUNDLE_DIR` names the directory holding the two files; both are optional and
 * both default to today's behaviour.
 *
 * **One containment rule, two callers.** `resolve()` normalises first, compares second, reads third,
 * with the separator appended to the root so `docs-evil/` cannot pass as `docs/` and an absolute
 * path is refused outright rather than being allowed to win the `resolve`. The bundle implementation
 * inherits the rule by *being* the same directory reader over a different root: the difference
 * between the two implementations is where the bytes come from and what proves them, not how a path
 * is resolved, and a second copy of that rule is a second place to get containment wrong.
 *
 * **A corrupt bundle is a sentence, not a 500.** `DocsBundleUnreadable` names what disagreed (the
 * archive's digest, a file's digest, a path in the manifest that its archive does not carry), so the
 * admin screen can draw the reason — the same shape `DocsManifestUnreadable` already has.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { zstdDecompressSync } from "node:zlib";

import { untarEntries } from "./tar.mjs";

/** Which implementation a reader is. The value `DOCS_SOURCE` accepts for the bundle. */
export type DocsSourceName = "local" | "bundle";

/** The tree's root in this checkout. `docs/` sits at the repository root, beside `app/`. */
export const DOCS_ROOT = join(process.cwd(), "docs");

/** The tree's directory name, and the prefix every bundle path carries. */
export const DOCS_DIRECTORY = "docs";

/** The names `scripts/docs-bundle.ts` writes into its `--out` directory. */
export const BUNDLE_ARCHIVE_NAME = "docs.tar.zst";
export const BUNDLE_MANIFEST_NAME = "manifest.json";

/**
 * One row of `manifest.files`.
 *
 * The two interfaces the bundle is described by live here rather than in the bundler (#1413):
 * `readBundleManifest` below is the reader that *validates* them, and `scripts/data-check.ts`
 * compiles this module into the gate. A declaration in `scripts/docs-bundle.ts` made that
 * impossible — importing it pulled the bundler's `import.meta` into a `commonjs` program — so the
 * two shapes moved to the side that reads them and the bundler imports them from here.
 */
export interface BundleFile {
  /** Repo-relative, `/`-separated: `docs/specs/flow-stages.md`. */
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** `manifest.json`, whole. The five keys are the card's contract; nothing else is invented. */
export interface BundleManifest {
  /** `<package.json version>+<source commit, 7>` — a bundle names the tree it came from. */
  readonly version: string;
  /** sha256 of `docs.tar.zst` — what a consumer verifies before extracting. */
  readonly sha: string;
  /** The source commit's own committer date, ISO-8601; never the wall clock. */
  readonly generatedAt: string;
  readonly files: readonly BundleFile[];
  readonly totals: { readonly files: number; readonly bytes: number };
}

/**
 * The reader `tree.ts` talks to: docs-relative paths in, bytes or names out.
 *
 * Paths are relative to the tree (`docs.json`, `specs/flow-stages.md`), exactly as `docs/docs.json`
 * spells them, so a caller passes a manifest row's `path` straight through.
 */
export interface DocsReader {
  /** `local` or `bundle` — for the census line, and for `tests/docs-source.test.ts`. */
  readonly name: DocsSourceName;
  /** The absolute directory the tree is read from: the checkout's, or the extracted one. */
  readonly root: string;
  /**
   * `path` resolved inside the tree, or `null` when it would leave it.
   *
   * `null` rather than a throw, because the callers' answer is `notFound()`: a manifest row naming
   * a path that escapes is refused by the schema and a request for one is a 404, not a 500.
   */
  resolve(path: string): string | null;
  /** The file's text. Throws when the file is missing or unreadable — callers decide what that means. */
  readText(path: string): string;
  /** The file's bytes. Throws on the same terms as `readText`. */
  readBytes(path: string): Buffer;
  /** One directory's entries, sorted; file *and* directory names, as `readdir` gives them. */
  listDirectory(path: string): string[];
  /** Every file under the tree, docs-relative and sorted. The tree's own inventory. */
  listFiles(): string[];
  /** sha256 of one file's bytes, hex — the comparison `tests/docs-source.test.ts` makes. */
  digest(path: string): string;
}

/** The bundle could not be opened, verified or unpacked. One class, one reason sentence. */
export class DocsBundleUnreadable extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "DocsBundleUnreadable";
    this.reason = reason;
  }
}

/** sha256 hex of a buffer — the one digest the bundler writes and this module checks. */
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The directory reader both implementations are: containment, reads, listings over one root.
 *
 * Deliberately not abstracted further. `local` and `bundle` differ in how the root came to exist and
 * what proved its contents; every read after that is the same seven lines of `node:fs`.
 */
function directoryReader(root: string, name: DocsSourceName): DocsReader {
  const base = resolve(root);

  function contained(path: string): string | null {
    if (path === "" || path.startsWith("/") || path.includes("\0")) return null;
    const full = resolve(base, path);
    if (full !== base && !full.startsWith(`${base}${sep}`)) return null;
    return full;
  }

  return {
    name,
    root: base,
    resolve: contained,
    readText(path) {
      const full = contained(path);
      if (full === null) throw new Error(`${path} leaves the ${name} docs tree`);
      return readFileSync(full, "utf8");
    },
    readBytes(path) {
      const full = contained(path);
      if (full === null) throw new Error(`${path} leaves the ${name} docs tree`);
      return readFileSync(full);
    },
    listDirectory(path) {
      const full = contained(path);
      if (full === null) throw new Error(`${path} leaves the ${name} docs tree`);
      return readdirSync(full).sort();
    },
    listFiles() {
      const files: string[] = [];
      walk(base, "", files);
      return files.sort();
    },
    digest(path) {
      const full = contained(path);
      if (full === null) throw new Error(`${path} leaves the ${name} docs tree`);
      return sha256(readFileSync(full));
    },
  };
}

/** Depth-first file walk, docs-relative, no symlink following (a bundle carries files only). */
function walk(root: string, prefix: string, into: string[]): void {
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(root, path, into);
    else if (entry.isFile()) into.push(path);
  }
}

/** Today's tree: `docs/` in the checkout. The default, and byte-for-byte the old behaviour. */
export function localDocsSource(root: string = DOCS_ROOT): DocsReader {
  return directoryReader(root, "local");
}

/**
 * `manifest.json` from a bundle directory, validated.
 *
 * Every field this module relies on is checked by name rather than coerced: a manifest that is
 * missing its `sha`, or carries a path with a `..` segment, is refused with a sentence instead of
 * quietly extracting something the archive's author did not describe.
 */
export function readBundleManifest(directory: string): BundleManifest {
  let text: string;
  try {
    text = readFileSync(join(directory, BUNDLE_MANIFEST_NAME), "utf8");
  } catch {
    throw new DocsBundleUnreadable(
      `${join(directory, BUNDLE_MANIFEST_NAME)} could not be read — DOCS_BUNDLE_DIR must hold ${BUNDLE_MANIFEST_NAME} and ${BUNDLE_ARCHIVE_NAME}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} is not valid JSON`);
  }
  if (typeof raw !== "object" || raw === null) {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} is not a JSON object`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.version !== "string" || record.version === "") {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} carries no \`version\``);
  }
  if (typeof record.sha !== "string" || !/^[0-9a-f]{64}$/.test(record.sha)) {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} carries no sha256 \`sha\``);
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} carries no ISO-8601 \`generatedAt\``);
  }
  if (!Array.isArray(record.files)) {
    throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME} carries no \`files\` array`);
  }
  const files = record.files.map((row: unknown) => {
    if (typeof row !== "object" || row === null) {
      throw new DocsBundleUnreadable(
        `${BUNDLE_MANIFEST_NAME} has a \`files\` row that is not an object`,
      );
    }
    const file = row as Record<string, unknown>;
    if (typeof file.path !== "string" || !isBundlePath(file.path)) {
      throw new DocsBundleUnreadable(
        `${BUNDLE_MANIFEST_NAME} has a row whose path ${JSON.stringify(file.path)} is not a ${DOCS_DIRECTORY}/ path`,
      );
    }
    if (typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME}: ${file.path} has no byte count`);
    }
    if (typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new DocsBundleUnreadable(`${BUNDLE_MANIFEST_NAME}: ${file.path} has no sha256`);
    }
    return { path: file.path, bytes: file.bytes, sha256: file.sha256 };
  });
  return {
    version: record.version,
    sha: record.sha,
    generatedAt: record.generatedAt,
    files,
    totals: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    },
  };
}

/** A bundle path: `docs/…`, relative, no empty/`.`/`..` segment, no NUL or `\`. */
function isBundlePath(path: string): boolean {
  if (!path.startsWith(`${DOCS_DIRECTORY}/`)) return false;
  if (path.includes("\0") || path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Where an extracted bundle lives: `DOCS_BUNDLE_CACHE`, else a directory under the OS temp dir. */
function bundleCacheRoot(): string {
  const configured = process.env.DOCS_BUNDLE_CACHE;
  return configured !== undefined && configured !== ""
    ? resolve(configured)
    : join(tmpdir(), "quizhub-docs-bundles");
}

/**
 * A published bundle, unpacked once and read like the checkout's tree.
 *
 * The verification order is the point: the archive's own sha256 must equal the manifest's `sha`
 * before a byte of it is trusted — checked on every open, because a tampered archive under an
 * unchanged manifest is exactly the case a cached unpack would hide — then every entry's bytes must
 * equal its row's `sha256` and `bytes`, and the two file sets must be equal in both directions. An
 * archive carrying a file its manifest does not describe is refused as loudly as a described file
 * the archive lost.
 *
 * Extraction itself is keyed by the archive's digest, so a second process on the same host reuses
 * the verified unpack rather than repeating it; the marker is written *after* the last file
 * verifies, so an interrupted extraction is never mistaken for a finished one.
 */
export function bundleDocsSource(directory: string): DocsReader {
  if (directory === "") {
    throw new DocsBundleUnreadable(
      "DOCS_SOURCE=bundle needs DOCS_BUNDLE_DIR — the directory holding docs.tar.zst and manifest.json",
    );
  }
  const manifest = readBundleManifest(directory);
  const archive = readArchive(directory, manifest);
  const target = join(bundleCacheRoot(), manifest.sha.slice(0, 16));
  const marker = join(target, ".verified");

  if (!isVerified(marker, manifest.sha)) extractBundle(archive, target, marker, manifest);

  return directoryReader(join(target, DOCS_DIRECTORY), "bundle");
}

/** The archive's bytes, once its digest is the one the manifest names. */
function readArchive(directory: string, manifest: BundleManifest): Buffer {
  const archivePath = join(directory, BUNDLE_ARCHIVE_NAME);
  let archive: Buffer;
  try {
    archive = readFileSync(archivePath);
  } catch {
    throw new DocsBundleUnreadable(`${archivePath} could not be read`);
  }
  const digest = sha256(archive);
  if (digest !== manifest.sha) {
    throw new DocsBundleUnreadable(
      `${BUNDLE_ARCHIVE_NAME} is sha256 ${digest} and ${BUNDLE_MANIFEST_NAME} says ${manifest.sha}`,
    );
  }
  return archive;
}

/** Has this archive already been unpacked and verified into `target`? */
function isVerified(marker: string, sha: string): boolean {
  try {
    return readFileSync(marker, "utf8").trim() === sha;
  } catch {
    return false;
  }
}

/** Decompress, unpack, verify every file, write it under `target`, then say the tree is verified. */
function extractBundle(
  archive: Buffer,
  target: string,
  marker: string,
  manifest: BundleManifest,
): void {
  let entries: { path: string; bytes: Uint8Array }[];
  try {
    entries = untarEntries(zstdDecompressSync(archive));
  } catch (error) {
    throw new DocsBundleUnreadable(
      `${BUNDLE_ARCHIVE_NAME} could not be unpacked: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rows = new Map(manifest.files.map((file) => [file.path, file]));
  for (const entry of entries) {
    const row = rows.get(entry.path);
    if (row === undefined) {
      throw new DocsBundleUnreadable(
        `${BUNDLE_ARCHIVE_NAME} carries ${entry.path}, which ${BUNDLE_MANIFEST_NAME} does not describe`,
      );
    }
    const digest = sha256(entry.bytes);
    if (digest !== row.sha256 || entry.bytes.byteLength !== row.bytes) {
      throw new DocsBundleUnreadable(
        `${entry.path} is ${entry.bytes.byteLength} bytes / sha256 ${digest} in the archive and ${row.bytes} / ${row.sha256} in the manifest`,
      );
    }
    const full = resolve(target, entry.path);
    if (!full.startsWith(`${resolve(target)}${sep}`)) {
      throw new DocsBundleUnreadable(
        `${entry.path} would be written outside the extraction directory`,
      );
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, entry.bytes);
  }

  const carried = new Set(entries.map((entry) => entry.path));
  for (const row of manifest.files) {
    if (!carried.has(row.path)) {
      throw new DocsBundleUnreadable(
        `${BUNDLE_MANIFEST_NAME} describes ${row.path} and ${BUNDLE_ARCHIVE_NAME} does not carry it`,
      );
    }
  }

  writeFileSync(marker, `${manifest.sha}\n`);
}

/** The reader `tree.ts` uses — memoised, so one process opens the tree once. */
let memoised: DocsReader | null = null;

/**
 * Which tree this process reads.
 *
 * `DOCS_SOURCE=bundle` selects the published archive (and needs `DOCS_BUNDLE_DIR`); anything else,
 * including nothing at all, is the checkout's `docs/`. That default is the reason this module can
 * land without changing a single rendered page: an unconfigured deployment never reaches the new
 * code path.
 */
export function docsSource(): DocsReader {
  if (memoised !== null) return memoised;
  if (process.env.DOCS_SOURCE === "bundle") {
    memoised = bundleDocsSource(process.env.DOCS_BUNDLE_DIR ?? "");
  } else {
    memoised = localDocsSource();
  }
  return memoised;
}

/** Forget the memoised reader — for a test that drives `docsSource()` with both settings. */
export function resetDocsSource(): void {
  memoised = null;
}
