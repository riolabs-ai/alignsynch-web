#!/usr/bin/env node
/**
 * Build the AlignSynch prototype catalog.
 *
 * Walks every HTML prototype under the configured sources, copies each file
 * byte-for-byte into `<out>/p/<catalog path>` and writes `<out>/index.html` +
 * `<out>/catalog.json`.
 *
 * ASSETS BESIDE THE PAGES (#1436). A page is not a design document on its own: it
 * names a stylesheet, a script, a font and a handful of images, and a catalogue
 * that carries the page alone publishes an unstyled draft. So for every page this
 * copies, the builder resolves the page's **relative** refs against the tree the
 * page came from and carries each target to the path the page looks for it, plus
 * one hop through a stylesheet's `url()` — that hop is the only way a `@font-face`
 * source is named. Root-absolute refs (`/assets/x.png`) are counted and reported,
 * never resolved: these pages are mounted under `/p/`, and a ref written for a
 * domain root cannot be satisfied there without rewriting the page.
 *
 * ASSET GATE. After writing, every published page's refs are resolved against the
 * built site. An **asset** ref that does not exist there is a broken build: a
 * stylesheet that 404s is the defect this gate exists for. A **page** ref that
 * does not exist is either one of the recorded dead refs
 * (`prototype-refs.mjs::KNOWN_DEAD_PAGE_REFS` — prototype-owner evidence, printed
 * by name) or a new one, which fails: the list is an allowance, not a bucket, and
 * a rotted entry fails too. Both counts print on every run, so a build that
 * checked nothing cannot pass by having nothing to check.
 *
 * SOURCES — where the prototypes live now (#1405). The catalog's paths are the
 * paths the live site has served since it was a snapshot, so they are declared,
 * not derived:
 *
 *   prototypes                → project-spec/**, project-reqs/**   (committed here)
 *   docs                      → quizhub/quizhub/docs/**            (this repo's docs tree)
 *
 * `<dir>` is walked recursively and every file lands at `<prefix>/<path inside dir>`.
 * An empty prefix means the file keeps its path relative to the source directory.
 * `inbox/**` is deliberately not a source: it is scratch, not product history.
 *
 * Provenance, in this order:
 *   date    — `git log -1 --format=%cs -- <path>` for tracked files;
 *             mtime only for untracked files, and those rows are marked
 *             (`dateSource: "mtime"`, `untracked: true`). `--fail-on-untracked`
 *             turns that fallback into a refusal, which is what CI runs.
 *   version — the nearest tag reachable from the commit that last touched the
 *             file: `git describe --tags --abbrev=0 <sha>`, plus how many
 *             commits past that tag the file landed (`git rev-list --count`).
 *             So `v2.0.0+12` reads "shipped after v2.0.0, twelve commits in" —
 *             never a guess from a filename. Rows with no reachable tag are
 *             marked (`version: null`, `versionSource: "none"`).
 *
 * The copies are verbatim: the prototypes are artefacts, not templates, and
 * in-page `#anchor` deep links must survive.
 *
 * Usage:
 *   node scripts/build-prototype-catalog.mjs --out <dir>
 *        [--source <dir>[:<catalog prefix>]]... [--min-entries N]
 *        [--require <path>]... [--fail-on-untracked] [--allow-empty]
 *
 * With no `--source`, the two sources above are used.
 *
 * `--min-entries`, `--require` and `--fail-on-untracked` make an incomplete or
 * half-guessed build fail loudly instead of deploying a catalog that silently
 * lost rows or filled a date in from a file's mtime.
 *
 * AN ABSENT SOURCE is a hard error by default, and `--allow-empty` is the only
 * thing that changes it (#1419). The distinction is about the caller, not about
 * the tree: `prototypes/` is a tree that arrives by decision, so a tree that
 * does not have it yet has nothing to publish, and the workflow says so with a
 * notice. But a source that was *declared* and does not resolve — a typo in
 * `--source`, a checkout that lost a directory — is broken input, and it must
 * stay exit 1 wherever it happens. So the flag is a statement a caller makes
 * about its own tree, never a property of the builder.
 *
 * It excuses nothing else. A run where every source is absent writes no output
 * and exits 0 (that is "nothing to build"); a run where *some* source survives
 * still has to clear `--min-entries`, `--require` and `--fail-on-untracked`, so
 * a partially checked-out tree cannot publish a short catalog over a good one.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { collectLocalRefs } from "./prototype-refs.mjs";
import { inspectSite, reportGate } from "./prototype-asset-gate.mjs";

const DEFAULT_SOURCES = [
  { dir: "prototypes", prefix: "" },
  { dir: "docs", prefix: "quizhub/quizhub/docs" },
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  ".worktrees",
  ".catalog-site",
  ".turbo",
  "_backups",
  "dist",
  "node_modules",
  "prototypes-site",
]);

const HTML_EXT = new Set([".html", ".htm"]);

function parseArgs(argv) {
  const opts = {
    sources: [],
    out: null,
    minEntries: 0,
    require: [],
    failOnUntracked: false,
    allowEmpty: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--source") {
      const raw = next();
      const split = raw.indexOf(":");
      opts.sources.push(
        split === -1
          ? { dir: raw, prefix: "" }
          : { dir: raw.slice(0, split), prefix: raw.slice(split + 1).replace(/^\/+|\/+$/g, "") },
      );
    } else if (arg === "--out") opts.out = next();
    else if (arg === "--min-entries") opts.minEntries = Number(next());
    else if (arg === "--require") opts.require.push(next());
    else if (arg === "--fail-on-untracked") opts.failOnUntracked = true;
    else if (arg === "--allow-empty") opts.allowEmpty = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: build-prototype-catalog.mjs --out <dir> [--source <dir>[:<prefix>]]... " +
          "[--min-entries N] [--require <path>]... [--fail-on-untracked] [--allow-empty]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.out) throw new Error("--out is required");
  if (!opts.sources.length) opts.sources = DEFAULT_SOURCES;
  return opts;
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** Walk up from `dir` to the first directory that owns a `.git`. */
function repoRootFor(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function walk(root) {
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
        continue;
      }
      if (entry.isFile()) found.push(full);
    }
  };
  visit(root);
  return found.sort();
}

const isHtml = (file) => HTML_EXT.has(path.extname(file).toLowerCase());

/** Where a file inside `source` lands in the site, relative to `<out>/p`. */
function catalogPathOf(source, file) {
  const inner = path.relative(source.dir, file).split(path.sep).join("/");
  return source.prefix ? `${source.prefix}/${inner}` : inner;
}

/**
 * Carry every asset the pages name, at the path each page looks for it.
 *
 * The ref is resolved **exactly** — the deploy is case-sensitive, so a page that
 * asks for `images/Foo.png` beside a file called `images/foo.png` is broken there
 * even where the exporter's macOS was forgiving. `scripts/prototype-assets.mjs`
 * is the tool that lands an import on the page's own spelling; this only copies.
 */
function carryAssets(pages, out) {
  const carried = new Map(); // destination -> source
  const conflicts = [];
  const outside = [];
  const unresolved = [];

  for (const page of pages) {
    const collected = collectLocalRefs(page.file, {
      sourceRoot: page.source.dir,
      resolve: (base, refPath) => {
        const target = path.resolve(base, refPath);
        return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
      },
    });
    for (const item of collected.outside) outside.push(`${page.catalogPath} → ${item.ref}`);
    for (const item of collected.dead) {
      if (item.kind === "asset") unresolved.push(`${page.catalogPath} → ${item.ref}`);
    }
    for (const asset of collected.assets) {
      const destination = path.join(out, "p", catalogPathOf(page.source, asset.target));
      const previous = carried.get(destination);
      if (previous && previous !== asset.target) {
        conflicts.push(`${catalogPathOf(page.source, asset.target)}`);
        continue;
      }
      carried.set(destination, asset.target);
    }
  }

  for (const [destination, source] of carried) {
    if (fs.existsSync(destination)) continue; // a page already occupies this path
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  return { carried, conflicts, outside, unresolved };
}

/** The carry's own line, printed before the gate so a page that names nothing is visible. */
function carryReport(assets) {
  console.log(
    `assets: ${assets.carried.size} carried · ${assets.unresolved.length} named by a page and present in no tree`,
  );
  if (assets.outside.length) {
    console.log(`assets: ${assets.outside.length} ref(s) climb out of their own tree:`);
    for (const line of assets.outside) console.log(`  outside-tree ${line}`);
  }
}

function titleOf(file, fallback) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 6000);
    const match = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return fallback;
    const text = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text ? text.slice(0, 160) : fallback;
  } catch {
    return fallback;
  }
}

/** The commit that last touched `rel` in `repo`, and the committer date (YYYY-MM-DD). */
function provenance(file) {
  const repo = repoRootFor(path.dirname(file));
  if (!repo) return null;
  const rel = path.relative(repo, file).split(path.sep).join("/");
  const tracked = git(repo, ["ls-files", "--error-unmatch", "--", rel]);
  if (!tracked) return null;
  const commit = git(repo, ["log", "-1", "--format=%H", "--", rel]);
  const date = git(repo, ["log", "-1", "--format=%cs", "--", rel]);
  if (!commit || !date) return null;
  return { repo, rel, commit, date };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = path.resolve(opts.out);

  const tagCache = new Map();
  /**
   * The nearest release tag reachable from `commit`, and how many commits the
   * commit sits past it. `v2.0.0` alone would claim a file shipped in that
   * release when it actually landed after it.
   */
  const describe = (repo, commit) => {
    const key = `${repo}\u0000${commit}`;
    if (tagCache.has(key)) return tagCache.get(key);
    const tag = git(repo, ["describe", "--tags", "--abbrev=0", commit]);
    let result = null;
    if (tag) {
      const count = git(repo, ["rev-list", "--count", `${tag}..${commit}`]);
      const distance = Number.parseInt(count || "0", 10);
      result = { tag, distance: Number.isFinite(distance) ? distance : 0 };
    }
    tagCache.set(key, result);
    return result;
  };

  const sources = [];
  const absent = [];
  for (const source of opts.sources) {
    const dir = path.resolve(source.dir);
    if (fs.existsSync(dir)) sources.push({ ...source, dir });
    else absent.push(dir);
  }

  if (absent.length) {
    if (!opts.allowEmpty) {
      throw new Error(
        `prototype source does not exist: ${absent[0]} — a declared source that does not resolve is broken input; pass --allow-empty only when an absent source means "nothing to build yet"`,
      );
    }
    for (const dir of absent) {
      console.log(`build-prototype-catalog: source absent (${dir}) — skipped (--allow-empty)`);
    }
    if (!sources.length) {
      // Nothing to build, and nothing to say about `out`: the previous build
      // stays where it is, so an empty run cannot erase a catalog that is live.
      console.log(
        `build-prototype-catalog: nothing to build — ${absent.length} declared source(s) absent. Wrote nothing to ${out}.`,
      );
      return;
    }
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "p"), { recursive: true });

  const entries = [];
  const pages = [];
  const seen = new Map();

  for (const source of sources) {
    for (const file of walk(source.dir)) {
      if (!isHtml(file)) continue;
      const inner = path.relative(source.dir, file).split(path.sep).join("/");
      const catalogPath = source.prefix ? `${source.prefix}/${inner}` : inner;
      if (seen.has(catalogPath)) {
        throw new Error(
          `two sources claim the same catalog path ${catalogPath}: ${seen.get(catalogPath)} and ${file}`,
        );
      }
      seen.set(catalogPath, file);

      const target = path.join(out, "p", catalogPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
      pages.push({ file, source, catalogPath });

      const prov = provenance(file);
      const stat = fs.statSync(file);
      let date;
      let dateSource;
      let version = null;
      let versionTag = null;
      let versionDistance = null;
      let versionSource = "none";
      let commit = null;

      if (prov) {
        date = prov.date;
        dateSource = "git";
        commit = prov.commit;
        const described = describe(prov.repo, prov.commit);
        if (described) {
          versionTag = described.tag;
          versionDistance = described.distance;
          version =
            described.distance === 0 ? described.tag : `${described.tag}+${described.distance}`;
          versionSource = "tag";
        }
      } else {
        date = new Date(stat.mtime).toISOString().slice(0, 10);
        dateSource = "mtime";
      }

      const segments = catalogPath.split("/");
      entries.push({
        path: catalogPath,
        title: titleOf(file, path.basename(file)),
        size: stat.size,
        date,
        dateSource,
        version,
        versionTag,
        versionDistance,
        versionSource,
        untracked: dateSource !== "git",
        commit,
        group: segments[0],
        sub: segments.slice(1, -1).join("/").slice(0, 120),
      });
    }
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));

  const counts = {
    gitDates: entries.filter((e) => e.dateSource === "git").length,
    mtimeDates: entries.filter((e) => e.dateSource === "mtime").length,
    tagVersions: entries.filter((e) => e.versionSource === "tag").length,
    noVersion: entries.filter((e) => e.versionSource === "none").length,
  };

  fs.writeFileSync(path.join(out, "catalog.json"), `${JSON.stringify(entries, null, 1)}\n`);
  fs.writeFileSync(path.join(out, "index.html"), renderIndex(entries, counts));

  const present = new Set(entries.map((e) => e.path));
  const missing = opts.require.filter((p) => !present.has(p));
  const untracked = entries.filter((e) => e.untracked).map((e) => e.path);

  console.log(
    `entries: ${entries.length} | git dates: ${counts.gitDates} | mtime fallback: ${counts.mtimeDates} | tag versions: ${counts.tagVersions} | no version: ${counts.noVersion}`,
  );
  console.log(`groups: ${[...new Set(entries.map((e) => e.group))].sort().join(", ")}`);
  console.log(`sources: ${sources.map((s) => `${s.dir}=>${s.prefix || "/"}`).join(" | ")}`);
  console.log(`out: ${out}`);

  const assets = carryAssets(pages, out);
  const report = inspectSite(path.join(out, "p"));
  carryReport(assets);
  reportGate(report);

  if (assets.unresolved.length) {
    throw new Error(
      `${assets.unresolved.length} asset ref(s) name a file that exists in no source tree: ${assets.unresolved.slice(0, 5).join(" | ")} — an asset a page asks for and no tree has is a dead ref, and one is never invented`,
    );
  }
  if (assets.conflicts.length) {
    throw new Error(
      `${assets.conflicts.length} asset path(s) are claimed by two different files: ${assets.conflicts.slice(0, 5).join(", ")}`,
    );
  }
  if (assets.outside.length) {
    throw new Error(
      `${assets.outside.length} ref(s) climb out of the tree they belong to and cannot be published under /p/: ${assets.outside.slice(0, 5).join(" | ")}`,
    );
  }
  if (report.broken.length) {
    throw new Error(
      `${report.broken.length} asset ref(s) do not exist in the built site — the catalogue would publish a page whose stylesheet, script or image 404s`,
    );
  }
  if (report.unknown.length) {
    throw new Error(
      `${report.unknown.length} page ref(s) exist nowhere and are not recorded as dead: ${report.unknown.slice(0, 5).join(" | ")}${report.unknown.length > 5 ? " …" : ""} — fix the link, or record it in KNOWN_DEAD_PAGE_REFS`,
    );
  }
  // A recorded dead ref that resolves again is reported, never fatal: the list is an allowance
  // about the *shipped* tree, and a fixture or a partial build has none of those pages at all. The
  // no-rot authority is `tests/prototype-catalog-assets.test.ts`, which asserts the list equals the
  // tree in both directions on the tree itself.

  if (entries.length < opts.minEntries) {
    throw new Error(
      `catalog has ${entries.length} entries, expected at least ${opts.minEntries} — refusing to publish an incomplete catalog`,
    );
  }
  if (missing.length) {
    throw new Error(`required prototype(s) missing from the catalog: ${missing.join(", ")}`);
  }
  if (opts.failOnUntracked && untracked.length) {
    throw new Error(
      `${untracked.length} prototype(s) are not tracked by git, so their date would be a file mtime guess: ${untracked.slice(0, 10).join(", ")}${untracked.length > 10 ? ", …" : ""}`,
    );
  }
  // Last, because it is the weakest statement: a run that already failed on its row count, its
  // required deep link or an untracked row should say that, not "nothing was checked". But a run
  // that resolved no asset ref at all is still a refusal — a gate that checked nothing is not a
  // pass, which is exactly how 170 unstyled pages shipped green (#1436).
  if (!report.pages || !report.assetRefs) {
    throw new Error(
      `the asset gate resolved ${report.assetRefs} asset ref(s) across ${report.pages} published page(s) — a gate that checked nothing is not a pass`,
    );
  }
}

function renderIndex(entries, counts) {
  const esc = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rows = entries
    .map((e) => {
      const dateCell =
        e.dateSource === "git"
          ? `<td class=d title="last commit that touched this file">${esc(e.date)}</td>`
          : `<td class=d m title="file mtime — not tracked by git">${esc(e.date)}*</td>`;
      const versionCell =
        e.versionSource === "tag"
          ? `<td class=v title="${esc(e.versionTag)}${e.versionDistance ? ` — ${e.versionDistance} commit${e.versionDistance === 1 ? "" : "s"} after it` : ""}">${esc(e.version)}</td>`
          : `<td class="v none" title="no release tag reachable from this file">—</td>`;
      const key = `${e.path} ${e.title} ${e.version ?? ""}`.toLowerCase();
      return `<tr data-k="${esc(key)}" data-g="${esc(e.group)}">${dateCell}${versionCell}<td><a href="p/${esc(e.path)}">${esc(e.title)}</a><div class=p>${esc(e.path)}</div></td><td class=s>${Math.round(e.size / 1024)} KB</td></tr>`;
    })
    .join("\n");

  const groups = [...new Set(entries.map((e) => e.group))].sort();

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>AlignSynch · prototype catalog (${entries.length})</title>
<style>
:root{--bg:#0b0d10;--fg:#e6e9ee;--dim:#8b93a1;--line:#1d222a;--acc:#7cc4ff;--warn:#e8b45c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:28px 24px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(11,13,16,.94);backdrop-filter:blur(8px);z-index:5}
h1{margin:0 0 4px;font-size:19px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:13px}
.legend{margin-top:6px;color:var(--dim);font-size:12px}
input{margin-top:14px;width:100%;max-width:460px;padding:9px 12px;border-radius:8px;border:1px solid var(--line);background:#12161b;color:var(--fg);font-size:14px}
input:focus{outline:1px solid var(--acc);border-color:var(--acc)}
.chips{margin-top:12px;display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:12px;padding:3px 9px;border:1px solid var(--line);border-radius:999px;color:var(--dim);cursor:pointer;background:none}
.chip[aria-pressed=true]{color:#0b0d10;background:var(--acc);border-color:var(--acc)}
table{width:100%;border-collapse:collapse;margin:0;font-size:14px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);padding:10px 24px;border-bottom:1px solid var(--line);position:sticky;top:158px;background:var(--bg)}
td{padding:11px 24px;border-bottom:1px solid var(--line);vertical-align:top}
td.d{color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:13px}
td.d.m{color:var(--warn)}
td.v{color:var(--acc);white-space:nowrap;font-size:13px}
td.v.none{color:#40474f}
td.s{color:var(--dim);text-align:right;white-space:nowrap;font-size:13px}
a{color:var(--fg);text-decoration:none;border-bottom:1px solid #2a313c}
a:hover{color:var(--acc);border-color:var(--acc)}
.p{color:var(--dim);font-size:12px;margin-top:2px;font-family:ui-monospace,SFMono-Regular,monospace}
.empty{padding:40px 24px;color:var(--dim)}
</style></head><body>
<header>
<h1>AlignSynch · prototype catalog</h1>
<div class=sub>${entries.length} HTML prototypes · newest first · deep links preserved</div>
<div class=legend>${counts.gitDates} date${counts.gitDates === 1 ? "" : "s"} from git · ${counts.tagVersions} version${counts.tagVersions === 1 ? "" : "s"} from release tags (<code>tag+N</code> = N commits after that tag) · <span style="color:var(--warn)">${counts.mtimeDates}*</span> untracked (date from file mtime, no tag)</div>
<input id=q placeholder="filter by name, path, version…" autofocus>
<div class=chips id=chips></div>
</header>
<table><thead><tr><th>date</th><th>version</th><th>prototype</th><th style="text-align:right">size</th></tr></thead>
<tbody id=tb>${rows}</tbody></table>
<div class=empty id=empty hidden>Nothing matches.</div>
<script>
const tb=document.getElementById('tb'),q=document.getElementById('q'),empty=document.getElementById('empty');
const rows=[...tb.rows];
const groups=[...new Set(rows.map(r=>r.dataset.g))].sort();
let g=null;
const chips=document.getElementById('chips');
['all',...groups].forEach(name=>{
  const b=document.createElement('button');b.className='chip';b.textContent=name;
  b.setAttribute('aria-pressed',name==='all');b.onclick=()=>{g=name==='all'?null:name;
    [...chips.children].forEach(c=>c.setAttribute('aria-pressed',c===b));apply();};
  chips.appendChild(b);
});
function apply(){
  const k=q.value.trim().toLowerCase();let n=0;
  rows.forEach(r=>{const ok=(!g||r.dataset.g===g)&&(!k||r.dataset.k.includes(k));
    r.hidden=!ok;if(ok)n++;});
  empty.hidden=n>0;
}
q.addEventListener('input',apply);
</script></body></html>
`;
}

try {
  main();
} catch (error) {
  console.error(`build-prototype-catalog: ${error.message}`);
  process.exit(1);
}
