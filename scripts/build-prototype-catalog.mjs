#!/usr/bin/env node
/**
 * Build the AlignSynch prototype catalog.
 *
 * Walks every HTML prototype under `--root`, copies each file byte-for-byte into
 * `<out>/p/<path>` and writes `<out>/index.html` + `<out>/catalog.json`.
 *
 * Provenance, in this order:
 *   date    — `git log -1 --format=%cs -- <path>` for tracked files;
 *             mtime only for untracked files, and those rows are marked
 *             (`dateSource: "mtime"`, `untracked: true`).
 *   version — the nearest tag reachable from the commit that last touched the
 *             file: `git describe --tags --abbrev=0 <sha>`. Not a path guess.
 *             Rows with no tag are marked (`version: null`, `versionSource:
 *             "none"`) rather than filled in.
 *
 * The copies are verbatim: the prototypes are artefacts, not templates, and
 * in-page `#anchor` deep links must survive.
 *
 * Usage:
 *   node scripts/build-prototype-catalog.mjs --root <dir> --out <dir>
 *        [--min-entries N] [--require <path>] [--allow-empty]
 *
 * `--min-entries` and `--require` make an incomplete build fail loudly instead
 * of deploying a catalog that silently lost most of its rows.
 *
 * An ABSENT root is a hard error by default, and `--allow-empty` is the only
 * thing that changes that (#1419). The distinction is about the caller, not
 * about the tree: `prototypes/` is not committed yet, so on this repository an
 * absent default root means "nothing to publish yet" — the workflow says so
 * with a notice and never calls this script. But a root that was *named* and
 * does not resolve (a typo in `--root`, a moved tree) is broken input, and it
 * must stay exit 1 wherever it happens. So the flag is a statement a caller
 * makes about its own tree, never a property of the builder.
 *
 * It excuses nothing else. A root that exists and carries too few prototypes
 * still fails `--min-entries`, and a missing `--require` target still fails —
 * `--allow-empty` is not a licence to publish an empty catalog over a good one,
 * and it writes no output at all, so a previous build is left untouched.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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
  const opts = { root: null, out: null, minEntries: 0, require: [], allowEmpty: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--root") opts.root = next();
    else if (arg === "--out") opts.out = next();
    else if (arg === "--min-entries") opts.minEntries = Number(next());
    else if (arg === "--require") opts.require.push(next());
    else if (arg === "--allow-empty") opts.allowEmpty = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: build-prototype-catalog.mjs --root <dir> --out <dir> [--min-entries N] [--require <path>] [--allow-empty]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.root || !opts.out) throw new Error("--root and --out are required");
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
      if (entry.isFile() && HTML_EXT.has(path.extname(entry.name).toLowerCase())) {
        found.push(full);
      }
    }
  };
  visit(root);
  return found.sort();
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

function provenance(file, root) {
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
  const root = path.resolve(opts.root);
  const out = path.resolve(opts.out);
  if (!fs.existsSync(root)) {
    if (!opts.allowEmpty) {
      throw new Error(
        `prototype root does not exist: ${root} — a named root that does not resolve is broken input; pass --allow-empty only when an absent root means "nothing to build yet"`,
      );
    }
    // Nothing to build, and nothing to say about `out`: the previous build stays
    // where it is, so an empty run cannot erase a catalog that is still live.
    console.log(
      `build-prototype-catalog: prototype root absent (${root}) — nothing to build (--allow-empty). Wrote nothing to ${out}.`,
    );
    return;
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "p"), { recursive: true });

  const tagCache = new Map();
  const nearestTag = (repo, commit) => {
    const key = `${repo}\u0000${commit}`;
    if (tagCache.has(key)) return tagCache.get(key);
    const tag = git(repo, ["describe", "--tags", "--abbrev=0", commit]);
    tagCache.set(key, tag);
    return tag;
  };

  const files = walk(root);
  const entries = [];

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const target = path.join(out, "p", rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);

    const prov = provenance(file, root);
    const stat = fs.statSync(file);
    let date;
    let dateSource;
    let version = null;
    let versionSource = "none";
    let commit = null;

    if (prov) {
      date = prov.date;
      dateSource = "git";
      commit = prov.commit;
      const tag = nearestTag(prov.repo, prov.commit);
      if (tag) {
        version = tag;
        versionSource = "tag";
      }
    } else {
      date = new Date(stat.mtime).toISOString().slice(0, 10);
      dateSource = "mtime";
    }

    const segments = rel.split("/");
    entries.push({
      path: rel,
      title: titleOf(file, path.basename(file)),
      size: stat.size,
      date,
      dateSource,
      version,
      versionSource,
      untracked: dateSource !== "git",
      commit,
      group: segments[0],
      sub: segments.slice(1, -1).join("/").slice(0, 120),
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));

  const counts = {
    gitDates: entries.filter((e) => e.dateSource === "git").length,
    mtimeDates: entries.filter((e) => e.dateSource === "mtime").length,
    tagVersions: entries.filter((e) => e.versionSource === "tag").length,
    noVersion: entries.filter((e) => e.versionSource === "none").length,
  };

  fs.writeFileSync(path.join(out, "catalog.json"), `${JSON.stringify(entries, null, 1)}\n`);
  fs.writeFileSync(path.join(out, "index.html"), renderIndex(entries, counts, root));

  const present = new Set(entries.map((e) => e.path));
  const missing = opts.require.filter((p) => !present.has(p));
  console.log(
    `entries: ${entries.length} | git dates: ${counts.gitDates} | mtime fallback: ${counts.mtimeDates} | tag versions: ${counts.tagVersions} | no version: ${counts.noVersion}`,
  );
  console.log(`groups: ${[...new Set(entries.map((e) => e.group))].sort().join(", ")}`);
  console.log(`out: ${out}`);

  if (entries.length < opts.minEntries) {
    throw new Error(
      `catalog has ${entries.length} entries, expected at least ${opts.minEntries} — refusing to publish an incomplete catalog`,
    );
  }
  if (missing.length) {
    throw new Error(`required prototype(s) missing from the catalog: ${missing.join(", ")}`);
  }
}

function renderIndex(entries, counts, root) {
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
          ? `<td class=v title="nearest release tag">${esc(e.version)}</td>`
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
<div class=legend>${counts.gitDates} date${counts.gitDates === 1 ? "" : "s"} from git · ${counts.tagVersions} version${counts.tagVersions === 1 ? "" : "s"} from release tags · <span style="color:var(--warn)">${counts.mtimeDates}*</span> untracked (date from file mtime, no tag)</div>
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
