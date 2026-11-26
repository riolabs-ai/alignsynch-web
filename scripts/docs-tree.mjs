#!/usr/bin/env node
/**
 * scripts/docs-tree.mjs — which `docs/` tree a script reads (#1399).
 *
 * `lib/docs/source.ts` defines the reader: the checkout's `docs/` by default, or a published
 * `docs.tar.zst` verified file by file against its `manifest.json` when `DOCS_SOURCE=bundle` names
 * one. The app already draws every docs read through it (`lib/docs/tree.ts`). The four generators
 * that *judge* the tree — the glossary page, the nav injected into every page, the md-normalised
 * fixture and the UI registry — did not: each opened `join(root, "docs/…")` directly, so under
 * `DOCS_SOURCE=bundle` they would have compared the published archive against the checkout and
 * called that a check. This module is the one line where they stop doing that.
 *
 * **Two ways in, deliberately named.** `checkoutDocsTree()` is the tree this script belongs to and
 * follows `DOCS_SOURCE`; `namedDocsTree(root)` is a tree somebody named with `--root` (a test
 * sandbox, another checkout) and is always read locally, because a bundle carries its own root and
 * cannot be re-pointed at one. A caller that names a root is naming a tree, not asking for the
 * switch — that is why the two are not one function with an optional argument.
 *
 * **The bundle is verified before it is read.** `bundleDocsSource` checks the archive's own sha256
 * against the manifest, then every entry's bytes, and refuses a file the manifest does not
 * describe. A corrupt bundle is a sentence, never a quietly empty tree: these scripts exit 1 and
 * name the reason.
 *
 * **Read-only when it is published.** A published tree cannot be written: `--write` against a
 * bundle would either fail on the extracted cache or, worse, "fix" a copy nobody publishes. Each
 * generator therefore compares under `bundle` and refuses to regenerate, with the sentence that
 * says which command regenerates the checkout.
 *
 * **No clock, no network.** Resolution is environment and bytes only, so a run of the gate in the
 * `alignsynch` lane and a run in the `quizhub` lane read two trees and make the same assertions.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleDocsSource, localDocsSource } from "../lib/docs/source.ts";

/** Repository root of this checkout — what `--root` falls back to, and where `docs/` sits. */
export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The two values `DOCS_SOURCE` accepts. Anything else is a typo, not a default. */
export const DOCS_SOURCES = ["local", "bundle"];

/**
 * The source this process runs under: `local` (also the unset case) or `bundle`.
 *
 * A value that is neither is refused by name rather than folded into `local`. `lib/docs/source.ts`
 * is deliberately forgiving there — an unconfigured deployment must behave exactly as it used to —
 * but a *gate* that silently checked the checkout while the lane claimed to check the archive would
 * be the one failure this card exists to prevent.
 */
export function docsSourceName() {
  const value = process.env.DOCS_SOURCE ?? "";
  if (value === "" || value === "local") return "local";
  if (value === "bundle") return "bundle";
  throw new Error(
    `DOCS_SOURCE=${JSON.stringify(value)} is not a docs source — expected one of ${DOCS_SOURCES.join(" | ")}`,
  );
}

/** One reader per process per root: 130 MB is unpacked once, not once per generator. */
/** @type {Map<string, import("../lib/docs/source.ts").DocsReader>} */
const readers = new Map();

/**
 * The checkout's tree: `docs/` beside this script, or the published bundle when `DOCS_SOURCE=bundle`.
 *
 * The bundle needs `DOCS_BUNDLE_DIR`; a missing one is a sentence rather than a fallback, because a
 * lane that asked for the archive and got the checkout back would report a green it did not earn.
 *
 * @returns {import("../lib/docs/source.ts").DocsReader}
 */
export function checkoutDocsTree() {
  const name = docsSourceName();
  const directory = name === "bundle" ? (process.env.DOCS_BUNDLE_DIR ?? "") : "";
  if (name === "bundle" && directory === "") {
    throw new Error(
      "DOCS_SOURCE=bundle needs DOCS_BUNDLE_DIR — the directory holding docs.tar.zst and manifest.json",
    );
  }
  const key = name === "bundle" ? `bundle:${resolve(directory)}` : `local:${DEFAULT_ROOT}`;
  if (!readers.has(key)) {
    readers.set(
      key,
      name === "bundle" ? bundleDocsSource(directory) : localDocsSource(join(DEFAULT_ROOT, "docs")),
    );
  }
  return readers.get(key);
}

/** A tree somebody named (`--root DIR`, a test sandbox): always the checkout flavour, never a bundle. */
/**
 * @param {string} root
 * @returns {import("../lib/docs/source.ts").DocsReader}
 */
export function namedDocsTree(root) {
  const base = resolve(root);
  const key = `local:${base}`;
  if (!readers.has(key)) readers.set(key, localDocsSource(join(base, "docs")));
  return readers.get(key);
}

/**
 * `docs/specs/flow-stages.md` → `specs/flow-stages.md`, which is how the reader addresses a file.
 *
 * A path that is not under `docs/` is refused here rather than handed to the reader: every call
 * site in these scripts means a tree path, and a repo path would silently read the wrong file
 * (`CHANGELOG.md` is beside the tree, not in it).
 */
export function underDocs(full) {
  const prefix = "docs/";
  if (!full.startsWith(prefix)) {
    throw new Error(`${full} is not a docs/ path — the tree is read docs-relative`);
  }
  return full.slice(prefix.length);
}

/** The tree's name, and where it is, for the one line each `--check` prints. */
export function describeTree(tree) {
  if (tree.name === "bundle") {
    const directory = process.env.DOCS_BUNDLE_DIR ?? "";
    return `bundle (docs.tar.zst in ${directory}, verified against its manifest)`;
  }
  return `local (${tree.root})`;
}

/** Is this tree writable? A published archive is not: its files are verified, then read. */
export function isWritable(tree) {
  return tree.name !== "bundle";
}

/** The sentence a generator prints when asked to regenerate a published tree. */
export function readOnlyReason(tree, command) {
  return (
    `${describeTree(tree)} is published and read-only — \`${command}\` regenerates the checkout's page. ` +
    "A bundle is a record of a tree that was written, never a place to write one."
  );
}
