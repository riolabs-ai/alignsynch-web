#!/usr/bin/env node
/**
 * Import the assets the committed prototype pages actually reference.
 *
 * The catalogue publishes `prototypes/**.html` byte-for-byte, so a page's relative refs are its own
 * words and cannot be rewritten to suit the repository (see the card's MUST NOT). What was missing
 * was the other half: the cells beside the pages. PR #1420 committed 170 `.html` files and dropped
 * every `css/`, `js/`, `images/` and `fonts/` tree next to them, so every V2 prototype rendered
 * unstyled on the live catalogue and its entry count still read green.
 *
 * This script copies **only what a tracked page points at**, resolved the same way the build gate
 * resolves it (`scripts/lib/prototype-refs.mjs`), out of an authoring tree that mirrors
 * `prototypes/`:
 *
 *     node scripts/import-prototype-assets.mjs --from ~/Desktop/dev.local/alignsynch
 *
 * `--from` is the directory that *contains* `project-spec/` and `project-reqs/` — the source of
 * truth lives outside this repository (370 MB, mostly `.bak-*` trees and `reference/`). Nothing
 * that no page references is read, so the import is ~330 files rather than the whole tree.
 *
 * Two kinds of ref are followed:
 *
 *   1. `src` / `href` on every tracked page.
 *   2. `url(…)` inside every stylesheet reached that way, one hop, because the tokens sheet points
 *      at `../fonts/*.woff2` and copying the CSS alone leaves the pages in a fallback face.
 *
 * A ref whose file exists in neither the repository nor the source tree is **dead**: it cannot be
 * fixed by copying, it belongs to the prototype's owner, and it is reported by `--report` instead
 * of failing. The build prints the same list, so the two never disagree about what is dead.
 *
 * `--dry-run` prints the plan and writes nothing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { isHtml, isStyle, localRefs, styleRefs } from "./lib/prototype-refs.mjs";

function parseArgs(argv) {
  const opts = { from: null, into: "prototypes", dryRun: false, report: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--from") opts.from = next();
    else if (arg === "--into") opts.into = next();
    else if (arg === "--report") opts.report = next();
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: import-prototype-assets.mjs --from <dir> [--into prototypes] [--report <file>] [--dry-run]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.from) throw new Error("--from is required (the directory holding project-spec/)");
  return opts;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const from = path.resolve(opts.from);
  if (!fs.existsSync(from)) throw new Error(`--from does not exist: ${from}`);

  const pages = git(root, ["ls-files", opts.into])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && isHtml(line));
  if (!pages.length) throw new Error(`no tracked pages under ${opts.into}/ — nothing to resolve`);

  const copied = [];
  const already = [];
  const dead = [];
  const skipped = { root: 0, escaping: 0 };
  let bytes = 0;

  /** One ref: copy it if the page needs it and the source has it. Returns where it now lives. */
  const resolved = new Map();
  const take = (target, page) => {
    if (resolved.has(target)) return resolved.get(target);
    const repoPath = path.join(opts.into, target);
    const sourcePath = path.join(from, target);
    if (fs.existsSync(path.join(root, repoPath))) {
      if (!already.includes(repoPath)) already.push(repoPath);
      resolved.set(target, { repoPath, sourcePath: null });
      return resolved.get(target);
    }
    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()) {
      const size = fs.statSync(sourcePath).size;
      if (!opts.dryRun) {
        fs.mkdirSync(path.dirname(path.join(root, repoPath)), { recursive: true });
        fs.copyFileSync(sourcePath, path.join(root, repoPath));
      }
      copied.push({ path: repoPath, bytes: size, from: sourcePath });
      bytes += size;
      resolved.set(target, { repoPath, sourcePath });
      return resolved.get(target);
    }
    dead.push({ page, target });
    resolved.set(target, null);
    return null;
  };

  const styleQueue = [];
  const queued = new Set();
  const queueStyle = (entry) => {
    if (!entry || !isStyle(entry.repoPath) || queued.has(entry.repoPath)) return;
    queued.add(entry.repoPath);
    styleQueue.push(entry);
  };

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    // Targets are catalogue-relative (i.e. relative to `prototypes/`), not repository-relative.
    for (const ref of localRefs(html, page.slice(opts.into.length + 1))) {
      if (ref.kind !== "relative") {
        skipped[ref.kind] += 1;
        continue;
      }
      queueStyle(take(ref.target, page));
    }
  }

  while (styleQueue.length) {
    const style = styleQueue.shift();
    const at = style.sourcePath ?? path.join(root, style.repoPath);
    const css = fs.readFileSync(at, "utf8");
    for (const ref of styleRefs(css, style.repoPath.slice(opts.into.length + 1))) {
      take(ref.target, style.repoPath);
    }
  }

  const report = {
    from,
    pages: pages.length,
    copied,
    already: already.length,
    dead,
    skipped,
    bytes,
  };
  if (opts.report) {
    fs.writeFileSync(path.resolve(opts.report), `${JSON.stringify(report, null, 1)}\n`);
  }

  console.log(
    `import-prototype-assets: pages ${pages.length} | copied ${copied.length} (${(bytes / 1e6).toFixed(1)} MB) | already in the tree ${already.length} | dead refs ${dead.length}`,
  );
  if (opts.dryRun) console.log("dry run — nothing written");
  for (const entry of dead) {
    console.log(`dead: ${entry.page} -> ${entry.target}`);
  }
  if (skipped.root || skipped.escaping) {
    console.log(
      `not assets: ${skipped.root} root-relative (app routes), ${skipped.escaping} escaping the catalogue`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`import-prototype-assets: ${error.message}`);
  process.exit(1);
}
