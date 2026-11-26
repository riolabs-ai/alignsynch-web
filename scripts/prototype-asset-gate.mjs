/**
 * The asset gate: does every published page's ref resolve in the built site? (#1436)
 *
 * The catalogue's own check counted rows and never fetched a file, so 170 pages shipped with every
 * stylesheet, script, font and image 404 beside them and the build stayed green. This is the check
 * that would have caught it, and it runs on the **built output**, not on the tree — the question is
 * what the deploy will serve, and only the site can answer it.
 *
 * One rule per ref kind, and the counts print on every call:
 *
 * | ref                                        | missing                                  |
 * | ------------------------------------------ | ---------------------------------------- |
 * | relative, an asset (`css/tokens.css`)      | **broken** — the page loads a 404        |
 * | relative, a page (`../05-…/start.html`)    | **dead** — recorded evidence, or a failure |
 * | inside a stylesheet's `url()` (fonts)      | **broken** — the stylesheet loads a 404  |
 * | root-absolute (`/assets/x.png`)            | counted and reported, never gated        |
 *
 * A root-absolute ref names a **domain root**, and these pages are mounted under `/p/`: one cannot
 * be satisfied there without serving the page's tree at the root or rewriting the page, and the
 * issue forbids rewriting. So it is a census — `rootAbsolute.refs` with how many of them are
 * assets — and never a silent pass, because the printed number is the evidence that the gate saw
 * them and chose.
 *
 * A gate that checks nothing must not pass: `pages` and `assetRefs` are returned so the caller can
 * refuse a run that resolved no refs at all.
 */
import fs from "node:fs";
import path from "node:path";

import {
  classifyRef,
  isAssetRef,
  KNOWN_DEAD_PAGE_REFS,
  refsInCss,
  refsInHtml,
} from "./prototype-refs.mjs";

const SKIP_DIRS = new Set([".git", "node_modules"]);

function walkFiles(root) {
  const found = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        visit(full);
      } else if (entry.isFile()) {
        found.push(full);
      }
    }
  };
  visit(root);
  return found.sort();
}

const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

/**
 * Inspect the served tree — the directory that becomes the site's `/p/`.
 *
 * `pages`, `assetRefs`, `pageRefs` and `stylesheetRefs` are the population; `broken`, `unknown` and
 * `rotted` are the three failures, each named rather than counted so a log says which page.
 */
export function inspectSite(siteDir) {
  const pages = walkFiles(siteDir).filter((file) => /\.html?$/i.test(file));
  const known = new Set(KNOWN_DEAD_PAGE_REFS);
  const broken = [];
  const dead = new Map();
  const rootAbsolute = { refs: 0, assets: 0 };
  let assetRefs = 0;
  let pageRefs = 0;
  let stylesheetRefs = 0;

  const catalogPathOf = (file) => path.relative(siteDir, file).split(path.sep).join("/");

  for (const page of pages) {
    const catalogPath = catalogPathOf(page);
    for (const raw of refsInHtml(fs.readFileSync(page, "utf8"))) {
      const { kind, path: refPath } = classifyRef(raw);
      if (kind === "external" || kind === "fragment") continue;
      if (kind === "root") {
        rootAbsolute.refs += 1;
        if (isAssetRef(refPath)) rootAbsolute.assets += 1;
        continue;
      }
      const exists = isFile(path.resolve(path.dirname(page), refPath));
      if (isAssetRef(refPath)) {
        assetRefs += 1;
        if (!exists) broken.push(`${catalogPath} → ${refPath}`);
        continue;
      }
      pageRefs += 1;
      if (!exists) dead.set(`${catalogPath} → ${refPath}`, true);
    }
  }

  // One hop through every stylesheet in the site: a font is named there, never by a page.
  for (const sheet of walkFiles(siteDir).filter(
    (file) => path.extname(file).toLowerCase() === ".css",
  )) {
    for (const raw of refsInCss(fs.readFileSync(sheet, "utf8"))) {
      const { kind, path: refPath } = classifyRef(raw);
      if (kind !== "relative" || !isAssetRef(refPath)) continue;
      stylesheetRefs += 1;
      if (!isFile(path.resolve(path.dirname(sheet), refPath))) {
        broken.push(`${catalogPathOf(sheet)} → ${refPath}`);
      }
    }
  }

  const deadKeys = [...dead.keys()].sort();
  return {
    pages: pages.length,
    assetRefs,
    pageRefs,
    stylesheetRefs,
    broken: broken.sort(),
    dead: deadKeys,
    unknown: deadKeys.filter((key) => !known.has(key)),
    rotted: [...known].filter((key) => !dead.has(key)).sort(),
    rootAbsolute,
  };
}

/** Print the gate's population before its verdict, so a silent pass is impossible to mistake. */
export function reportGate(report) {
  const targets = new Set(report.dead.map((key) => key.split(" → ")[1]));
  const deadPages = new Set(report.dead.map((key) => key.split(" → ")[0]));
  console.log(
    `asset gate: ${report.pages} page(s) · ${report.assetRefs} asset ref(s) + ${report.stylesheetRefs} stylesheet url() ref(s) · ${report.pageRefs} page ref(s) · broken = ${report.broken.length}`,
  );
  console.log(
    `asset gate: dead page refs = ${report.dead.length} on ${deadPages.size} page(s), ${targets.size} distinct target(s) [${[...targets].sort().join(", ")}] · root-absolute refs = ${report.rootAbsolute.refs} (${report.rootAbsolute.assets} assets) — reported, not gated`,
  );
  if (report.dead.length) {
    console.log("dead refs (prototype-owner evidence, not a build error):");
    for (const key of report.dead) console.log(`  ${key}`);
  }
  if (report.rotted.length) {
    console.log(
      `asset gate: ${report.rotted.length} recorded dead ref(s) no longer resolve — the allowance has rotted; tests/prototype-catalog-assets.test.ts fails on it, so trim the list:`,
    );
    for (const key of report.rotted) console.log(`  ${key}`);
  }
  if (report.broken.length) {
    console.log("broken asset refs:");
    for (const line of report.broken) console.log(`  ${line}`);
  }
}
