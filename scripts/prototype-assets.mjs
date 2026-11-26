#!/usr/bin/env node
/**
 * Import the assets a published prototype page looks for, at the path it looks for them (#1436).
 *
 * The catalogue commit (#1420) carried `prototypes/**` as 170 HTML pages and nothing else, so every
 * stylesheet, script, font and image beside them answered 404 and a V2 prototype rendered as bare
 * text. The pages are the artefact; the assets beside them are what make the artefact look like the
 * design it documents. This tool copies **exactly the referenced files** — never the source tree,
 * which is 370 MB of history and `.bak-*` snapshots the issue forbids committing.
 *
 * Usage:
 *   node scripts/prototype-assets.mjs --from <dir>:<prefix>... [--apply] [--check] [--quiet]
 *
 * `--from ~/Desktop/dev.local/alignsynch/project-spec:project-spec` means: the pages under
 * `prototypes/project-spec/**` were exported from `<dir>`, so a ref they make resolves against it.
 * Repeat the flag once per exported tree; `project-reqs` is the second.
 *
 *   (no flag)  print what would be imported, and what is already there — changes nothing
 *   --apply    copy the missing files in
 *   --check    exit 1 when a referenced asset is not committed, or has drifted from its source
 *
 * Three properties it keeps on purpose:
 *
 * 1. **One hop through a stylesheet.** A font is named by `url(…)` inside a `.css` file, never by
 *    the page, so a page-only walk imports the CSS and leaves every `@font-face` source 404.
 * 2. **The path the page asks for, exactly.** The source trees were exported from macOS, so a page
 *    that says `images/AlignSynch-Icon.png` may sit beside `images/alignsynch-icon.png`. The copy
 *    lands on the ref's spelling, because the build host is case-sensitive and so is the deploy.
 * 3. **Pages define the set.** Only a tracked page imports anything: an untracked `.html` under
 *    `prototypes/` is not published, so its assets are not published either. A page ref that names
 *    a file existing nowhere is printed and never invented — that is the prototype owner's
 *    evidence, not this tool's repair.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { classifyRef, isAssetRef, isPageRef, refsInCss, refsInHtml } from "./prototype-refs.mjs";

const PROTOTYPES = "prototypes";

function parseArgs(argv) {
  const opts = { from: [], apply: false, check: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--from") {
      const raw = next();
      const split = raw.lastIndexOf(":");
      if (split === -1 || !/^[A-Za-z0-9._-]+$/.test(raw.slice(split + 1))) {
        throw new Error(`--from needs <dir>:<prefix under prototypes/>, got ${raw}`);
      }
      opts.from.push({ dir: path.resolve(raw.slice(0, split)), prefix: raw.slice(split + 1) });
    } else if (arg === "--apply") opts.apply = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: prototype-assets.mjs --from <dir>:<prefix>... [--apply] [--check] [--quiet]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.from.length) throw new Error("--from is required at least once");
  return opts;
}

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** Directory listings, cached — a case-insensitive walk would otherwise re-read the same dirs. */
const listings = new Map();
function listing(dir) {
  if (!listings.has(dir)) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      names = [];
    }
    listings.set(dir, names);
  }
  return listings.get(dir);
}

/** Resolve `rel` under `base`, tolerating the case the exporter wrote. */
function resolveCaseInsensitive(base, rel) {
  let current = base;
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      current = path.dirname(current);
      continue;
    }
    const exact = path.join(current, segment);
    if (fs.existsSync(exact)) {
      current = exact;
      continue;
    }
    const hit = listing(current).find((name) => name.toLowerCase() === segment.toLowerCase());
    if (!hit) return null;
    current = path.join(current, hit);
  }
  return fs.existsSync(current) && fs.statSync(current).isFile() ? current : null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = git(".", ["rev-parse", "--show-toplevel"]).trim();
  const tracked = git(root, ["ls-files", PROTOTYPES])
    .split("\n")
    .filter((line) => line.trim());
  const trackedSet = new Set(tracked);
  const pages = tracked.filter((file) => /\.html?$/i.test(file)).sort();

  const imports = new Map(); // dest under prototypes/ -> { source, pages:Set }
  const present = new Map(); // dest under prototypes/ -> { source, bytesEqual }
  const dead = new Map(); // `${page} → ${ref}` -> ref kind
  const outside = [];
  const absentSources = [];

  for (const source of opts.from) {
    if (!fs.existsSync(source.dir)) {
      absentSources.push(source.dir);
      continue;
    }
    for (const pageRel of pages) {
      const inner = pageRel.slice(PROTOTYPES.length + 1);
      if (!inner.startsWith(`${source.prefix}/`)) continue;
      const sourcePage = path.join(source.dir, inner.slice(source.prefix.length + 1));
      if (!fs.existsSync(sourcePage)) continue;

      // Breadth-first, so a stylesheet the page names is walked for its own refs exactly once.
      const queue = [{ file: sourcePage, html: true }];
      const walked = new Set([sourcePage]);
      while (queue.length) {
        const { file, html } = queue.shift();
        const refs = html
          ? refsInHtml(fs.readFileSync(file, "utf8"))
          : refsInCss(fs.readFileSync(file, "utf8"));
        for (const raw of refs) {
          const { kind, path: refPath } = classifyRef(raw);
          if (kind !== "relative") continue;
          const target = resolveCaseInsensitive(path.dirname(file), refPath);
          if (!target) {
            if (isAssetRef(refPath) || isPageRef(refPath)) {
              dead.set(`${pageRel} → ${refPath}`, isAssetRef(refPath) ? "asset" : "page");
            }
            continue;
          }
          const relative = path.relative(source.dir, target).split(path.sep).join("/");
          if (relative.startsWith("..")) {
            outside.push({ page: pageRel, ref: refPath, source: target });
            continue;
          }
          if (!isAssetRef(refPath)) continue; // a page: already published, or not this tool's business
          // The destination is spelled by the **ref**, not by the file that satisfied it: a page
          // that asks for `images/Logo.png` beside `images/logo.png` needs the capital on Linux.
          const lexical = path.relative(source.dir, path.resolve(path.dirname(file), refPath));
          const destRel = `${PROTOTYPES}/${source.prefix}/${lexical.split(path.sep).join("/")}`;
          const row =
            trackedSet.has(destRel) || fs.existsSync(path.join(root, destRel)) ? present : imports;
          const entry = row.get(destRel) ?? { source: target, pages: new Set() };
          entry.pages.add(pageRel);
          row.set(destRel, entry);
          if (/\.css$/i.test(target) && !walked.has(target)) {
            walked.add(target);
            queue.push({ file: target, html: false });
          }
        }
      }
    }
  }

  const importRows = [...imports].sort(([a], [b]) => a.localeCompare(b));
  const bytes = importRows.reduce((total, [, row]) => total + fs.statSync(row.source).size, 0);
  const byExtension = importRows.reduce((counts, [dest]) => {
    const extension = path.extname(dest).toLowerCase() || "(none)";
    counts[extension] = (counts[extension] ?? 0) + 1;
    return counts;
  }, {});

  if (!opts.quiet) {
    for (const [dest, row] of importRows) console.log(`import ${dest}  ←  ${row.source}`);
    for (const item of outside) console.log(`outside-tree ${item.page} → ${item.ref}`);
    for (const [key, kind] of dead) console.log(`dead-ref(${kind}) ${key}`);
  }

  const extensionLine = Object.entries(byExtension)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, count]) => `${count} ${extension.replace(/^\./, "")}`)
    .join(" · ");
  console.log(
    `prototype-assets: ${trackedSet.size - pages.length} asset(s) tracked · ${pages.length} page(s) · ` +
      `${importRows.length} to import · ${[...present].length} already here` +
      `${importRows.length ? ` (${(bytes / 1048576).toFixed(1)} MB: ${extensionLine})` : ""}`,
  );
  if (dead.size) {
    const assetDead = [...dead].filter(([, kind]) => kind === "asset").length;
    console.log(
      `prototype-assets: ${dead.size} ref(s) name a file that exists nowhere (${assetDead} asset) — ` +
        "prototype-owner evidence, not an error",
    );
  }

  if (absentSources.length) {
    console.error(
      `prototype-assets: source tree(s) absent: ${absentSources.join(", ")} — pass the directory the pages were exported from`,
    );
    process.exit(1);
  }

  if (opts.apply) {
    for (const [dest, row] of importRows) {
      const target = path.join(root, dest);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(row.source, target);
    }
    console.log(`prototype-assets: wrote ${importRows.length} file(s) under ${PROTOTYPES}/`);
    return;
  }

  if (!opts.check) return;

  const drifted = [];
  for (const [dest, row] of present) {
    const committed = path.join(root, dest);
    if (!fs.existsSync(committed)) continue;
    if (!fs.readFileSync(committed).equals(fs.readFileSync(row.source))) drifted.push(dest);
  }
  if (importRows.length || drifted.length) {
    if (drifted.length) {
      console.error(
        `prototype-assets: ${drifted.length} committed asset(s) differ from the source they were imported from: ${drifted.slice(0, 10).join(", ")}${drifted.length > 10 ? ", …" : ""}`,
      );
    }
    if (importRows.length) {
      console.error(
        `prototype-assets: ${importRows.length} referenced asset(s) are not committed — run with --apply`,
      );
    }
    process.exit(1);
  }
  console.log("prototype-assets: every referenced asset is committed and matches its source");
}

try {
  main();
} catch (error) {
  console.error(`prototype-assets: ${error.message}`);
  process.exit(1);
}
