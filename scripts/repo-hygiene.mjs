#!/usr/bin/env node
/**
 * `scripts/repo-hygiene.mjs` — the weekly offboarding job (#1404): prune what the week left behind,
 * clear the caches nobody is using, and print what it refused to touch.
 *
 * Why this exists: nothing offboards on merge. Measured 2026-11-25 — the repository reached 20 G,
 * 1,138 branches (870 local, 858 carrying commits not in `main`), 42 registered worktrees holding
 * 18 G, `node_modules` in 29 of them and one `.next` at 2.9 G. A manual pass reclaimed 12.3 G and
 * without a job it returns within weeks, because the same three leaks refill it:
 *
 *   1. **a merged branch is never deleted** — it is a ref, and a ref outlives the card;
 *   2. **a worktree outlives its card** — `.worktrees/t_<id>` is created per card and no card gives
 *      one back, so dozens of shipped cards keep an install each;
 *   3. **an install outlives the worktree's use** — `node_modules` is where the disk went.
 *
 * ## The four things it does
 *
 *   1. **prune merged work** — worktrees go only where `decideWorktree` says so (card finished, the
 *      branch is on `origin/main` by ancestry or by a squashed patch, tree clean); then local
 *      branches that are ancestors of `origin/main` and no longer checked out anywhere are deleted
 *      with `git branch -d`; then `git worktree prune`. The order matters: a merged branch cannot be
 *      deleted while a worktree has it checked out, so the branch half runs *after* the prune and
 *      reclaims what the prune just freed.
 *   2. **clear caches** — `node_modules`, `.next`, `.turbo`, `dist` from worktrees whose card is
 *      `done`/`archived` or which have been idle past the guard. Never the primary checkout, never
 *      the worktree the run is inside.
 *   3. **report, never act on** — local-only branches older than 30 days, worktrees with no card
 *      link, dirty worktrees, stashes older than 14 days, and a `git gc` blocked by its own log.
 *   4. **write a manifest** of everything it deleted, to `archive/repo-hygiene-<date>.txt`, and end
 *      with one line: bytes freed, branches deleted, worktrees removed, items needing a human.
 *
 * ## Guard rails, and why each one exists
 *
 *   - **`-D` is never used**, not even behind a flag. A squash-merged branch is never an ancestor of
 *     `main`, so `-d` reclaims only the branches that landed as real merges, and the rest is
 *     *reported* with its ahead/behind. A branch ref costs bytes; a force-delete costs work. The
 *     worktree half of the same problem is solved properly, by two witnesses, in
 *     `scripts/worktree-prune-rules.ts`.
 *   - **No worktree written to in the last 24 h is touched** — not its caches, not the directory.
 *     The window is checked before the card's state, because a finished card's worktree is exactly
 *     where a QA server and a re-run of the gate are left standing, and a live card's worktree is
 *     touched minutes before the run. Measured on the first run: 31 of 37 worktrees had been written
 *     to 1.5 h earlier, which is the manual pass this job replaces.
 *   - **Reclaim is the `df` delta**, never a sum of `du`. pnpm's symlink farms overcount by ~20×
 *     (measured: 19.3 G claimed, ~1 G real), so an apparent-size figure would read as a very
 *     successful run and be a lie. Nothing in this script sums `du`.
 *   - **Exit 0 and a report.** "Nothing to do" is the normal outcome of a weekly job and is never a
 *     failure. Non-zero is reserved for a real failure: no `origin/main`, or a deletion that git or
 *     the filesystem refused.
 *   - **The removal rule is not re-implemented here.** `decideWorktree` already carries the three
 *     conditions, the two squash witnesses and the path exclusions, so this job runs
 *     `scripts/worktree-prune.mjs` — with `--apply` when it applies, and in its planning mode when it
 *     does not, so the dry run names the same removals the apply would make.
 *
 * ## Running it
 *
 *   node scripts/repo-hygiene.mjs                    # the report, nothing deleted (the default)
 *   node scripts/repo-hygiene.mjs --apply            # prune, clear, and write the manifest
 *   node scripts/repo-hygiene.mjs --apply --json     # the same run, machine-readable
 *   node scripts/repo-hygiene.mjs --manifest <path>  # put the manifest somewhere else
 *
 * The weekly trigger is Hermes config, not this script: run it from a cron entry under the
 * `alignsynch` profile, which is the CHO's lane. A run with nothing to do is exit 0 and one line.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CACHE_DIR_NAMES,
  decideBranch,
  decideCache,
  decideStash,
  formatAge,
  formatBytes,
  IDLE_MS,
  summaryLine,
} from "./repo-hygiene-rules.ts";

/** `node:sqlite` is optional: without it every card's state is unknown and every tree is kept. */
const require = createRequire(import.meta.url);

const USAGE = [
  "usage: node scripts/repo-hygiene.mjs [options]",
  "",
  "  --apply                 prune branches and worktrees, clear caches, write the manifest",
  "                          (default is a dry run: the same report, nothing deleted)",
  "  --manifest <path>       write the manifest here instead of archive/repo-hygiene-<date>.txt",
  "  --kanban-db <path>      the kanban database card states are read from",
  "  --json                  print the run as JSON instead of the report",
  "  --help                  this text",
  "",
  "Exit 0 with a report; non-zero only when git or the filesystem refused something.",
  "Never `git branch -D`. Never touches a worktree written to in the last 24 h.",
].join("\n");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const apply = argv.includes("--apply");
const asJson = argv.includes("--json");

/** A single-valued flag, or undefined. */
function flagValue(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`${name} wants a value`);
  }
  return value.trim();
}

/** `1 removal`, `3 removals` — the counts this report prints are never bare numbers. */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Run a command, returning `{ ok, out }` rather than throwing — a refusal is a fact, not a crash. */
function run(command, args, cwd) {
  try {
    const out = execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out.replace(/\r\n/g, "\n") };
  } catch (error) {
    const stderr =
      typeof error?.stderr === "string" ? error.stderr : String(error?.message ?? error);
    // The useful line is the last one: node prints a stack above its message, git prints `fatal:` at
    // the end, and the first line of either is a frame nobody can act on.
    const lines = stderr
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "");
    return { ok: false, out: "", why: lines.at(-1)?.trim() ?? "" };
  }
}

/** Run git through the helper above. */
function git(args, cwd) {
  return run("git", args, cwd);
}

/** Free bytes on the filesystem holding `path` — the only reclaim figure this job trusts. */
function freeBytesAt(path) {
  try {
    const stats = statfsSync(path);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/** The registered worktrees, as `git worktree list --porcelain` describes them. */
function worktreeBlocks(cwd) {
  const listed = git(["worktree", "list", "--porcelain"], cwd);
  if (!listed.ok) throw new Error(`git worktree list failed: ${listed.why}`);
  return listed.out
    .split("\n\n")
    .map((block) => block.split("\n").filter((line) => line !== ""))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const facts = { path: "", headSha: "", branch: null };
      for (const line of lines) {
        const space = line.indexOf(" ");
        const key = space === -1 ? line : line.slice(0, space);
        const value = space === -1 ? "" : line.slice(space + 1);
        if (key === "worktree") facts.path = value;
        else if (key === "HEAD") facts.headSha = value;
        else if (key === "branch") facts.branch = value.replace(/^refs\/heads\//, "");
      }
      return facts;
    });
}

/** The kanban database, first candidate that opens; `undefined` keeps every state unknown. */
function kanbanDatabasePath(primary) {
  const explicit = flagValue("--kanban-db");
  if (explicit !== undefined) return isAbsolute(explicit) ? explicit : join(primary, explicit);
  const fromEnv = process.env.HERMES_KANBAN_DB;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const home = homedir();
  const boards = join(home, ".hermes", "kanban", "boards");
  const named = process.env.HERMES_KANBAN_BOARD;
  if (named !== undefined && named !== "") return join(boards, named, "kanban.db");
  try {
    const current = readFileSync(join(home, ".hermes", "kanban", "current"), "utf8").trim();
    if (current !== "" && existsSync(join(boards, current, "kanban.db"))) {
      return join(boards, current, "kanban.db");
    }
  } catch {
    // No `current` pointer is not an error; the legacy single-database path is next.
  }
  return join(home, ".hermes", "kanban.db");
}

/** Cards by workspace path and by id. Both maps are empty when there is no readable database. */
function loadCards(path) {
  const byPath = new Map();
  const byId = new Map();
  if (path === undefined || !existsSync(path)) return { byPath, byId, source: null };
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { byPath, byId, source: null };
  }
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare("select id, status, workspace_path from tasks").all();
    db.close();
    for (const row of rows) {
      const card = { id: String(row.id), status: String(row.status) };
      byId.set(card.id, card);
      if (typeof row.workspace_path === "string" && row.workspace_path !== "") {
        const list = byPath.get(row.workspace_path) ?? [];
        list.push(card);
        byPath.set(row.workspace_path, list);
      }
    }
    return { byPath, byId, source: path };
  } catch {
    return { byPath, byId, source: null };
  }
}

/** Cards claiming one worktree path: the exact workspace first, then the `t_<id>` folder name. */
function cardsAt(path, cards) {
  const exact = cards.byPath.get(path);
  if (exact !== undefined) return exact;
  const name =
    path
      .split("/")
      .filter((part) => part !== "")
      .at(-1) ?? path;
  const id = name.match(/^t_[0-9a-f]{8}/)?.[0];
  const byId = id === undefined ? undefined : cards.byId.get(id);
  return byId === undefined ? [] : [byId];
}

/**
 * The newest real write a worktree shows, in epoch ms: the directory itself, its direct children
 * (cache directories excluded, because an old `node_modules` is not activity), and the worktree's
 * own `logs/HEAD` — the reflog git appends to on a commit, merge or checkout, and the only file in
 * there that a **read** never touches. The index is deliberately not a witness: `git status`
 * refreshes it, so a read-only sweep would mark every tree in the repository active and the guard
 * would then hold for a day against a run that deleted nothing. `null` when the tree is unreadable.
 */
function lastTouchedMs(path) {
  try {
    let newest = statSync(path).mtimeMs;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (CACHE_DIR_NAMES.includes(entry.name)) continue;
      try {
        const stats = statSync(join(path, entry.name));
        if (stats.mtimeMs > newest) newest = stats.mtimeMs;
      } catch {
        // A child that vanished mid-read is not activity.
      }
    }
    const gitDir = git(["rev-parse", "--absolute-git-dir"], path);
    if (gitDir.ok) {
      try {
        const reflog = statSync(join(gitDir.out.trim(), "logs", "HEAD"));
        if (reflog.mtimeMs > newest) newest = reflog.mtimeMs;
      } catch {
        // A worktree with no reflog has never had a commit, merge or checkout: not activity.
      }
    }
    return newest;
  } catch {
    return null;
  }
}

/** How many paths `git status` reports, untracked included; `null` when the tree is unreadable. */
function dirtyCount(path) {
  const status = git(["status", "--short", "--untracked-files=all"], path);
  if (!status.ok) return null;
  return status.out.split("\n").filter((line) => line !== "").length;
}

/** The cache directories that actually exist in a worktree right now. */
function presentCacheDirs(path) {
  const found = [];
  for (const name of CACHE_DIR_NAMES) {
    try {
      if (statSync(join(path, name)).isDirectory()) found.push(name);
    } catch {
      // Absent is the common case: most worktrees never installed.
    }
  }
  return found;
}

/** Every local branch, with its tip date and upstream, in one `for-each-ref`. */
function localBranches(primary) {
  const listed = git(
    [
      "for-each-ref",
      "--format=%(refname:short)%09%(committerdate:unix)%09%(upstream:short)",
      "refs/heads",
    ],
    primary,
  );
  if (!listed.ok) return [];
  return listed.out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [name, committedAt, upstream] = line.split("\t");
      return { name, committedAt, upstream: upstream ?? "" };
    });
}

/**
 * One local branch's facts, computed only as far as a decision needs them: the ahead/behind counts
 * are paid for only on a branch that is neither merged nor mirrored remotely, because one
 * `rev-list` per branch over 870 branches would dominate the run.
 */
function branchFacts(name, entry, primary, checkedOutByBranch) {
  const merged = git(["merge-base", "--is-ancestor", name, "origin/main"], primary).ok;
  const ageSeconds = Number(entry.committedAt);
  const ageDays = Number.isFinite(ageSeconds)
    ? Math.max(0, Math.floor((Date.now() / 1000 - ageSeconds) / 86_400))
    : 0;
  const holder = checkedOutByBranch.get(name) ?? null;
  const facts = {
    name,
    aheadOfMain: 0,
    behindMain: 0,
    ageDays,
    mergedIntoMain: merged,
    checkedOut: holder !== null,
    checkedOutIn: holder,
    hasRemoteCounterpart: entry.upstream !== "",
  };
  if (!facts.mergedIntoMain && !facts.hasRemoteCounterpart) {
    const counts = git(["rev-list", "--left-right", "--count", `origin/main...${name}`], primary);
    if (counts.ok) {
      const [behind, ahead] = counts.out.trim().split(/\s+/).map(Number);
      if (Number.isFinite(ahead) && Number.isFinite(behind)) {
        facts.aheadOfMain = ahead;
        facts.behindMain = behind;
      }
    }
  }
  return facts;
}

/** Stashes with the date they were created, oldest last. */
function stashes(primary) {
  const listed = git(["stash", "list", "--format=%gd%x09%ct%x09%gs"], primary);
  if (!listed.ok) return [];
  return listed.out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [ref, createdAt, subject] = line.split("\t");
      const created = Number(createdAt);
      const ageDays = Number.isFinite(created)
        ? Math.max(0, Math.floor((Date.now() / 1000 - created) / 86_400))
        : 0;
      return { ref, subject: subject ?? "", ageDays };
    });
}

/**
 * `.git/gc.log` is the one item here that is not a branch, a worktree or a stash: while it exists,
 * git refuses to run its own automatic cleanup and the object store only grows. Reported, never
 * cleared — `git prune` then removing the log is a deliberate act on the object store.
 */
function gcBlocker(primary) {
  const log = join(primary, ".git", "gc.log");
  if (!existsSync(log)) return null;
  let lastLine = "";
  try {
    lastLine = readFileSync(log, "utf8").trim().split("\n").at(-1) ?? "";
  } catch {
    lastLine = "unreadable";
  }
  const objects = git(["count-objects", "-v"], primary);
  const loose = objects.ok ? (objects.out.match(/^count:\s*(\d+)$/m)?.[1] ?? "?") : "?";
  return {
    path: ".git/gc.log",
    reason: `${loose} loose objects · ${lastLine || "no reason recorded"}`,
  };
}

function main() {
  const cwd = process.cwd();
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  if (!top.ok) {
    console.error(`repo-hygiene: ${cwd} is not inside a git checkout`);
    return 2;
  }
  const blocks = worktreeBlocks(cwd);
  const primary = blocks[0]?.path ?? top.out.trim();

  const originMain = git(["rev-parse", "--verify", "origin/main"], primary);
  if (!originMain.ok) {
    console.error("repo-hygiene: no origin/main — run `git fetch origin` first");
    return 2;
  }
  const originMainSha = originMain.out.trim();
  const nowMs = Date.now();
  const kanbanPath = kanbanDatabasePath(primary);
  const cards = loadCards(kanbanPath);
  const cwdResolved = resolve(cwd);
  // df is read before anything moves — the pruner runs below, and a delta measured after it would
  // silently exclude every worktree this run removes.
  const dfBefore = freeBytesAt(primary);

  // ---- worktrees ------------------------------------------------------------------------------
  const worktrees = blocks.map((block) => {
    const path = block.path;
    const relativePath = relative(primary, path).split("\\").join("/");
    // Read the guard's witness before any `git status` in this tree: a status refreshes the index
    // on a clean tree, and the run must not count its own reading as someone's work.
    const touchedMs = lastTouchedMs(path);
    const facts = {
      path,
      relativePath,
      branch: block.branch,
      headSha: block.headSha,
      isPrimary: resolve(path) === resolve(primary),
      isCwd: resolve(path) === cwdResolved,
      underWorktreesDir: path.startsWith(`${primary}/.worktrees/`),
      cards: cardsAt(path, cards),
      dirtyFiles: dirtyCount(path),
      lastTouchedMs: touchedMs,
      presentCacheDirs: presentCacheDirs(path),
    };
    return {
      facts,
      cacheDecision: decideCache({
        relativePath: facts.relativePath,
        isPrimary: facts.isPrimary,
        isCwd: facts.isCwd,
        underWorktreesDir: facts.underWorktreesDir,
        lastTouchedMs: facts.lastTouchedMs,
        nowMs,
        cardStatuses: facts.cards.map((card) => card.status),
        presentCacheDirs: facts.presentCacheDirs,
      }),
    };
  });

  // A worktree written to inside the guard window is excluded from the prune as well, so the same
  // 24 h rule governs both halves of the job.
  const guardExclusions = worktrees
    .filter(
      (row) =>
        row.facts.underWorktreesDir &&
        row.facts.lastTouchedMs !== null &&
        nowMs - row.facts.lastTouchedMs < IDLE_MS,
    )
    .map((row) => row.facts.relativePath);

  // ---- the worktree half, through its one home ------------------------------------------------
  const pruneArgs = [fileURLToPath(new URL("./worktree-prune.mjs", import.meta.url)), "--json"];
  if (apply) pruneArgs.splice(1, 0, "--apply");
  // The pruner reads card states from its own default database unless it is told otherwise, so the
  // database this run resolved is handed down: two halves of one job must not disagree about which
  // cards are finished.
  if (kanbanPath !== undefined && existsSync(kanbanPath)) {
    pruneArgs.push("--kanban-db", kanbanPath);
  }
  for (const path of guardExclusions) pruneArgs.push("--exclude", path);
  const pruneRun = run("node", pruneArgs, primary);
  let pruneJson = null;
  if (pruneRun.ok) {
    try {
      pruneJson = JSON.parse(pruneRun.out);
    } catch {
      pruneJson = null;
    }
  }

  // In apply mode the pruner has already removed them; in a dry run its plan is subtracted, so the
  // report names the same worktree removals, branch deletions and cache decisions an apply would
  // make rather than reporting against a tree that is about to change.
  const plannedRemovals = new Set(
    (pruneJson?.remove ?? []).map((row) => join(primary, String(row.path))),
  );
  const remainingPaths = new Set(
    (apply
      ? worktreeBlocks(primary)
      : blocks.filter((block) => !plannedRemovals.has(block.path))
    ).map((block) => block.path),
  );
  const survivors = worktrees.filter((row) => remainingPaths.has(row.facts.path));
  const removedWorktrees = worktrees.filter(
    (row) => !remainingPaths.has(row.facts.path) && !row.facts.isCwd,
  );
  const checkedOutByBranch = new Map(
    survivors
      .filter((row) => row.facts.branch !== null)
      .map((row) => [
        row.facts.branch,
        row.facts.relativePath === "" ? "(repository root)" : row.facts.relativePath,
      ]),
  );
  const primaryBranch = blocks[0]?.branch ?? null;

  // ---- branches: decided against the tree that survived the prune -----------------------------
  const branches = localBranches(primary)
    // The checkout's own HEAD is not a candidate: it is the tree you work in, whatever it is.
    .filter((entry) => entry.name !== primaryBranch)
    .map((entry) => {
      const facts = branchFacts(entry.name, entry, primary, checkedOutByBranch);
      return { facts, decision: decideBranch(facts) };
    });

  // ---- stashes, and the object store ----------------------------------------------------------
  const stashRows = stashes(primary).map((stash) => ({
    ...stash,
    decision: decideStash({ ageDays: stash.ageDays }),
  }));
  const gc = gcBlocker(primary);

  // ---- the lists ------------------------------------------------------------------------------
  const branchDeletes = branches.filter((row) => row.decision.action === "delete");
  const branchReports = branches.filter((row) => row.decision.action === "report");
  const cacheClears = survivors.filter((row) => row.cacheDecision.action === "clear");
  const worktreeAlerts = survivors.filter((row) => {
    if (!row.facts.underWorktreesDir || row.facts.isPrimary) return false;
    if (row.facts.cards.length === 0) return true;
    return row.facts.dirtyFiles !== null && row.facts.dirtyFiles > 0;
  });
  const stashReports = stashRows.filter((row) => row.decision === "report");

  /** Every row a human has to look at, each with the sentence that says why. */
  const needsHuman = [
    ...branchReports.map((row) => ({
      kind: "branch",
      name: row.facts.name,
      reason: row.decision.reason,
    })),
    ...worktreeAlerts.map((row) => ({
      kind: "worktree",
      name: row.facts.relativePath,
      reason:
        row.facts.cards.length === 0
          ? "no card owns this path — nothing can prove it is finished"
          : `tree is dirty (${row.facts.dirtyFiles} changed ${row.facts.dirtyFiles === 1 ? "path" : "paths"}, untracked included)`,
    })),
    ...stashReports.map((row) => ({
      kind: "stash",
      name: row.ref,
      reason: `${row.ageDays} d old · ${row.subject}`,
    })),
  ];
  if (gc !== null) needsHuman.push({ kind: "git", name: gc.path, reason: gc.reason });

  const header = [
    `repo-hygiene — ${new Date(nowMs).toISOString()}`,
    `repository:    ${primary}`,
    `origin/main:   ${originMainSha.slice(0, 8)}`,
    `kanban:        ${cards.source ?? "not readable — every card's state is unknown"}`,
    `mode:          ${apply ? "apply" : "dry run"}`,
    `guard:         worktrees written to within ${formatAge(IDLE_MS)} are never touched (${guardExclusions.length} excluded)`,
    `pruner:        ${
      pruneRun.ok
        ? `scripts/worktree-prune.mjs ok — ${plural(pruneJson?.remove?.length ?? 0, "removal")} planned`
        : `scripts/worktree-prune.mjs FAILED — ${pruneRun.why ?? "unknown"}`
    }`,
    "",
  ];

  if (!apply) {
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            repository: primary,
            originMain: originMainSha,
            kanban: cards.source,
            dfAvailableBytes: dfBefore,
            worktreesRemoved: removedWorktrees.map((row) => row.facts.relativePath),
            branchesToDelete: branchDeletes.map((row) => row.facts.name),
            cachesToClear: cacheClears.map((row) => ({
              path: row.facts.relativePath,
              dirs: row.facts.presentCacheDirs,
              reason: row.cacheDecision.reason,
            })),
            needsHuman,
          },
          null,
          2,
        ),
      );
      return 0;
    }
    console.log(
      [
        ...header,
        `df:            ${dfBefore === null ? "unknown" : `${formatBytes(dfBefore)} available`}`,
        "",
        `worktrees to remove (${removedWorktrees.length}) — via scripts/worktree-prune.mjs`,
        ...(removedWorktrees.length === 0
          ? ["  none"]
          : (pruneJson?.remove ?? []).map(
              (row) =>
                `  ${String(row.path).padEnd(34)} ${row.card?.length ? `card ${row.card.join(", ")}` : "no card"} · ${row.witness === "patch" ? `patch on origin/main as ${String(row.mergedAs).slice(0, 8)}` : row.witness}`,
            )),
        "",
        `branches to delete (${branchDeletes.length}) — \`git branch -d\`, never -D`,
        ...(branchDeletes.length === 0
          ? ["  none"]
          : branchDeletes.map((row) => `  ${row.facts.name.padEnd(52)} ${row.decision.reason}`)),
        "",
        `caches to clear (${cacheClears.length})`,
        ...(cacheClears.length === 0
          ? ["  none"]
          : cacheClears.map(
              (row) =>
                `  ${row.facts.relativePath.padEnd(30)} ${row.facts.presentCacheDirs.join(", ").padEnd(32)} ${row.cacheDecision.reason}`,
            )),
        "",
        `needs a human (${needsHuman.length})`,
        ...(needsHuman.length === 0
          ? ["  none"]
          : needsHuman.map(
              (row) => `  ${row.kind.padEnd(8)} ${row.name.padEnd(46)} ${row.reason}`,
            )),
        "",
        "  dry run — nothing deleted. Re-run with --apply to prune, clear and write the manifest.",
      ].join("\n"),
    );
    return 0;
  }

  // ---- apply ----------------------------------------------------------------------------------
  const log = (line) => {
    if (!asJson) console.log(line);
  };
  if (!pruneRun.ok) log(`worktree prune failed: ${pruneRun.why ?? "unknown"}`);

  // Branches: `-d` only, so a branch git cannot prove merged is refused here and reported above.
  const deletedBranches = [];
  const refusedBranches = [];
  for (const row of branchDeletes) {
    const result = git(["branch", "-d", "--", row.facts.name], primary);
    if (result.ok) {
      deletedBranches.push(row.facts.name);
      log(`  deleted branch   ${row.facts.name}`);
    } else {
      refusedBranches.push({ name: row.facts.name, why: result.why ?? "unknown" });
    }
  }

  // Caches, in the worktrees that survived the prune.
  const clearedCaches = [];
  const refusedCaches = [];
  for (const row of cacheClears) {
    const cleared = [];
    for (const name of row.facts.presentCacheDirs) {
      try {
        rmSync(join(row.facts.path, name), { recursive: true, force: true, maxRetries: 3 });
        cleared.push(name);
      } catch (error) {
        refusedCaches.push({
          path: `${row.facts.relativePath}/${name}`,
          why: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (cleared.length > 0) {
      clearedCaches.push({ path: row.facts.relativePath, dirs: cleared });
      log(`  cleared caches   ${row.facts.relativePath} (${cleared.join(", ")})`);
    }
  }

  // `git worktree prune` last: registrations whose directory is already gone are git's business,
  // and it must never run before a removal.
  const swept = git(["worktree", "prune"], primary);
  const dfAfter = freeBytesAt(primary);
  const freed = dfBefore === null || dfAfter === null ? 0 : dfAfter - dfBefore;
  const finishedCount = needsHuman.length + refusedBranches.length + refusedCaches.length;

  // ---- manifest -------------------------------------------------------------------------------
  const stamp = new Date(nowMs).toISOString().slice(0, 10);
  const explicitManifest = flagValue("--manifest");
  const manifestPath =
    explicitManifest === undefined
      ? join(primary, "archive", `repo-hygiene-${stamp}.txt`)
      : isAbsolute(explicitManifest)
        ? explicitManifest
        : join(primary, explicitManifest);

  const manifest = [
    ...header,
    `df before:     ${dfBefore === null ? "unknown" : `${formatBytes(dfBefore)} available`}`,
    `df after:      ${dfAfter === null ? "unknown" : `${formatBytes(dfAfter)} available`}`,
    `df delta:      ${freed >= 0 ? "+" : ""}${formatBytes(freed)} (${freed} bytes)`,
    `worktrees:     ${blocks.length} registered at the start · ${remainingPaths.size} now · \`git worktree prune\` ${swept.ok ? "ok" : (swept.why ?? "failed")}`,
    "",
    `## deleted — branches (${deletedBranches.length})`,
    ...(deletedBranches.length === 0
      ? ["  none"]
      : deletedBranches.map((name) => {
          const row = branchDeletes.find((candidate) => candidate.facts.name === name);
          return `  ${name}  ·  ${row?.decision.reason ?? "ancestor of origin/main"}`;
        })),
    "",
    `## removed — worktrees (${removedWorktrees.length})`,
    ...(removedWorktrees.length === 0
      ? ["  none"]
      : removedWorktrees.map(
          (row) =>
            `  ${row.facts.relativePath === "" ? "(repository root)" : row.facts.relativePath}  ·  ` +
            `${row.facts.branch ?? "detached"}  ·  ` +
            `${row.facts.cards.map((card) => `${card.id} (${card.status})`).join(", ") || "no card"}`,
        )),
    "",
    `## cleared — caches (${clearedCaches.length})`,
    ...(clearedCaches.length === 0
      ? ["  none"]
      : clearedCaches.map((row) => `  ${row.path}  ·  ${row.dirs.join(", ")}`)),
    "",
    `## needs a human (${finishedCount})`,
    ...(finishedCount === 0
      ? ["  none"]
      : [
          ...needsHuman.map(
            (row) => `  ${row.kind.padEnd(8)} ${row.name.padEnd(46)} ${row.reason}`,
          ),
          ...refusedBranches.map((row) => `  branch   ${row.name.padEnd(46)} refused: ${row.why}`),
          ...refusedCaches.map((row) => `  cache    ${row.path.padEnd(46)} refused: ${row.why}`),
        ]),
    "",
    "Branches are deleted with `git branch -d` only. Squash-merged residue is reported, never",
    "force-deleted. Reclaim is the df delta; no directory size is summed (pnpm symlinks overcount).",
    "",
  ].join("\n");

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, manifest, "utf8");

  const totals = {
    freedBytes: freed,
    branchesDeleted: deletedBranches.length,
    worktreesRemoved: removedWorktrees.length,
    cachesCleared: clearedCaches.length,
    needsHuman: finishedCount,
  };
  const line = summaryLine(totals);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          repository: primary,
          originMain: originMainSha,
          manifest: relative(primary, manifestPath),
          df: { before: dfBefore, after: dfAfter, delta: freed },
          worktreesRemoved: removedWorktrees.map((row) => row.facts.relativePath),
          branchesDeleted: deletedBranches,
          cachesCleared,
          refusedBranches,
          refusedCaches,
          needsHuman,
          summary: line,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      [
        "",
        `  worktrees removed  ${removedWorktrees.length}${pruneJson === null ? " (pruner output unreadable)" : ""}`,
        `  branches deleted   ${deletedBranches.length}`,
        `  caches cleared     ${clearedCaches.length}`,
        `  manifest           ${relative(primary, manifestPath)}`,
        "",
        line,
      ].join("\n"),
    );
  }

  const failed = refusedBranches.length + refusedCaches.length + (swept.ok ? 0 : 1);
  return failed === 0 ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`repo-hygiene: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
