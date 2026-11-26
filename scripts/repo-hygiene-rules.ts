/**
 * The decision half of `scripts/repo-hygiene.mjs`: given the facts about one branch, one cached
 * directory or one stash, say what the weekly offboarding job may do to it — or which condition
 * saved it. Pure, so the rules are tested without a repository, a git call or a clock
 * (`scripts/__tests__/repo-hygiene.test.ts`).
 *
 * Three actions, and the middle one is the point:
 *
 *   - `clear` / `delete` — the job acts;
 *   - `report` — the job prints the item and touches nothing, because a human has to decide;
 *   - `ignore` — nothing worth a line.
 *
 * Everything here fails **closed**. An unreadable timestamp keeps a cache, a branch with no proof
 * of merge is reported rather than deleted, and no rule can produce a force-delete. The worktree
 * half is not in this file at all: it is `decideWorktree` from `scripts/worktree-prune-rules.ts`,
 * which already carries the three conditions and the two squash witnesses — one rule, one home.
 */

/**
 * A card occupies its worktree only in these states before the job will touch it.
 *
 * Deliberately a copy of `FINISHED_CARD_STATUSES` in `scripts/worktree-prune-rules.ts` rather than
 * an import: that module is loaded by Node's type stripping from a `.mjs` runner, and a runtime
 * import of one `.ts` from another would have to pick an extension that either Node's ESM resolver
 * or `tsconfig.datacheck.json` rejects. The parity is pinned by a test instead — change one without
 * the other and `pnpm data:check` names it.
 */
export const FINISHED_CARD_STATUSES: readonly string[] = ["done", "archived"];

/** The directories the job empties. Everything under them is regenerable by an install or a build. */
export const CACHE_DIR_NAMES: readonly string[] = ["node_modules", ".next", ".turbo", "dist"];

/** The guard rail: no worktree written to inside this window is touched, whatever its card says. */
export const IDLE_MS = 24 * 60 * 60 * 1000;

/** A local-only branch older than this is printed for a human, never deleted. */
export const STALE_BRANCH_DAYS = 30;

/** A stash older than this is printed for a human: a stash is the only copy of what it holds. */
export const STALE_STASH_DAYS = 14;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** `clear` or `keep`, with the sentence an operator reads. */
export interface HygieneDecision {
  readonly action: "clear" | "keep";
  readonly reason: string;
}

/** One registered worktree, as the cache half sees it. Nothing here calls git. */
export interface CacheFacts {
  /** Repository-relative path with `/` separators. */
  readonly relativePath: string;
  /** The primary checkout — the tree a person works in. */
  readonly isPrimary: boolean;
  /** The worktree this command is running in. */
  readonly isCwd: boolean;
  /** Under `<primary>/.worktrees/`, the only place the job manages. */
  readonly underWorktreesDir: boolean;
  /** The newest write the tree shows: directory, children (caches excluded), or index. */
  readonly lastTouchedMs: number | null;
  readonly nowMs: number;
  /** Every finished-or-not card whose workspace is this path. */
  readonly cardStatuses: readonly string[];
  /** Which of `CACHE_DIR_NAMES` exist in the tree right now. */
  readonly presentCacheDirs: readonly string[];
}

/** `2 d`, `5 h`, `3 min` — the age an operator needs to judge a window, not a timestamp. */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)} h`;
  const days = Math.floor(ms / DAY_MS);
  if (days < 60) return `${days} d`;
  return `${Math.floor(days / 30)} mo`;
}

/** `0 B`, `999 B`, `1.4 KB`, `19.3 GB` — decimal units, the ones `df -h` reports. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown";
  const sign = bytes < 0 ? "-" : "";
  const value = Math.abs(bytes);
  if (value < 1000) return `${sign}${Math.round(value)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1000;
  let index = 0;
  while (scaled >= 1000 && index < units.length - 1) {
    scaled /= 1000;
    index += 1;
  }
  const rounded = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${sign}${rounded} ${units[index]}`;
}

const keep = (reason: string): HygieneDecision => ({ action: "keep", reason });
const clear = (reason: string): HygieneDecision => ({ action: "clear", reason });

/**
 * May the caches in this worktree be emptied?
 *
 * The 24-hour guard is checked **before** the card's state, because a finished card's worktree is
 * exactly where a re-run of the gate or a QA server is left running — and an idle worktree of a
 * card that is still `running` is a cancelled run nobody will resume. Both readings converge on the
 * same window, so the order is what makes the tool safe rather than what makes it permissive.
 */
export function decideCache(facts: CacheFacts): HygieneDecision {
  if (facts.presentCacheDirs.length === 0) return keep("holds no cache directories");
  if (facts.isPrimary) return keep("the primary checkout — its caches are the tree you work in");
  if (facts.isCwd) return keep("the worktree this command is running in");
  if (!facts.underWorktreesDir) return keep("registered outside .worktrees/ — not managed here");
  if (facts.lastTouchedMs === null) return keep("the tree's last write could not be read");
  if (!Number.isFinite(facts.nowMs) || facts.nowMs < facts.lastTouchedMs) {
    return keep("the clock and the tree disagree — treated as active");
  }

  const age = facts.nowMs - facts.lastTouchedMs;
  if (age < IDLE_MS) {
    return keep(`touched ${formatAge(age)} ago — inside the 24 h guard`);
  }
  const finished = facts.cardStatuses.find((status) => FINISHED_CARD_STATUSES.includes(status));
  if (finished !== undefined) {
    return clear(`card ${finished} and untouched for ${formatAge(age)}`);
  }
  return clear(`untouched for ${formatAge(age)} — idle past 24 h`);
}

/** One branch, as the branch half sees it. */
export interface BranchFacts {
  readonly name: string;
  /** Commits in this branch and not in `origin/main`. */
  readonly aheadOfMain: number;
  /** Commits in `origin/main` and not in this branch. */
  readonly behindMain: number;
  /** Days since the branch's own last commit. */
  readonly ageDays: number;
  /** The branch tip is an ancestor of `origin/main` — the only proof this job accepts. */
  readonly mergedIntoMain: boolean;
  /** Checked out in any registered worktree, including the primary checkout. */
  readonly checkedOut: boolean;
  /** The worktree holding it checked out, repo-relative, or `null` when nothing does. */
  readonly checkedOutIn: string | null;
  /** A `refs/remotes/origin/<name>` exists, so the remote still knows this branch. */
  readonly hasRemoteCounterpart: boolean;
}

/** `delete`, `report` or `ignore`, with the sentence an operator reads. */
export interface BranchDecision {
  readonly action: "delete" | "report" | "ignore";
  readonly reason: string;
}

/**
 * What may happen to one local branch.
 *
 * `delete` is only reachable through `mergedIntoMain`, and the caller deletes with `git branch -d`
 * — the safe form, which refuses anything git cannot prove is merged. **`-D` is never used,**
 * not even for a branch whose patch is provably on `origin/main`: the squash residue this repo
 * leaves behind needs a witness only `worktree-prune-rules.ts` computes, and a branch ref costs
 * bytes, so the trade is a report rather than a second proof nobody reviews. That is why the
 * local-only list below is a report and not a sweep.
 */
export function decideBranch(facts: BranchFacts): BranchDecision {
  if (facts.mergedIntoMain && facts.checkedOut) {
    return {
      action: "report",
      reason: `merged into origin/main, but ${facts.checkedOutIn ?? "a worktree"} still has it checked out`,
    };
  }
  if (facts.mergedIntoMain) {
    return {
      action: "delete",
      reason: `ancestor of origin/main · ${
        facts.ageDays === 0
          ? "its last commit is today"
          : `${facts.ageDays} d since its last commit`
      }`,
    };
  }
  if (facts.hasRemoteCounterpart) {
    return { action: "ignore", reason: "the remote still carries it — the remote decides" };
  }
  if (facts.ageDays >= STALE_BRANCH_DAYS) {
    return {
      action: "report",
      reason: `local-only · ${facts.aheadOfMain} ahead / ${facts.behindMain} behind · ${facts.ageDays} d old`,
    };
  }
  return { action: "ignore", reason: `local-only but recent (${facts.ageDays} d)` };
}

/** One stash, as the report sees it. */
export interface StashFacts {
  readonly ageDays: number;
}

/**
 * A stash is printed, never dropped: it is the only copy of what it holds, and dropping one is
 * unrecoverable. `>= STALE_STASH_DAYS` is the threshold; the boundary is inclusive so a 14-day
 * stash appears rather than waiting one more week.
 */
export function decideStash(facts: StashFacts): "report" | "ignore" {
  return facts.ageDays >= STALE_STASH_DAYS ? "report" : "ignore";
}

/** Everything the summary line reports. */
export interface HygieneTotals {
  readonly freedBytes: number;
  readonly branchesDeleted: number;
  readonly worktreesRemoved: number;
  readonly cachesCleared: number;
  readonly needsHuman: number;
}

/**
 * The one line the run ends with. Bytes come from the `df` delta and from nothing else — summing
 * `du` over `node_modules` overcounts pnpm's symlink farms by ~20× (measured: 19.3 G claimed,
 * ~1 G real), so the figure printed is the filesystem's own answer.
 */
export function summaryLine(totals: HygieneTotals): string {
  // A run that deleted nothing can still show a negative delta — another process on the box freed or
  // took space while it ran. `freed -393 KB` would read as a bug in the job, so the line says 0 B and
  // the manifest keeps the raw bytes beside `df before` / `df after`.
  const bytes = totals.freedBytes > 0 ? formatBytes(totals.freedBytes) : "0 B";
  return (
    `repo-hygiene: freed ${bytes} (df delta) · ` +
    `${totals.branchesDeleted} branch${totals.branchesDeleted === 1 ? "" : "es"} deleted · ` +
    `${totals.worktreesRemoved} worktree${totals.worktreesRemoved === 1 ? "" : "s"} removed · ` +
    `${totals.cachesCleared} cache set${totals.cachesCleared === 1 ? "" : "s"} cleared · ` +
    `${totals.needsHuman} need${totals.needsHuman === 1 ? "s" : ""} a human`
  );
}
