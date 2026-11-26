/**
 * #1404 — the weekly offboarding job's decision table, case by case.
 *
 * `scripts/repo-hygiene-rules.ts` is the half that decides; `scripts/repo-hygiene.mjs` is the half
 * that reads git, the kanban database and the filesystem. Everything below exercises the decision
 * alone, because a repository cannot be arranged to prove it on demand: a dirty worktree, a branch
 * whose merge cannot be proved, a tree written to two hours ago and a stash nobody has opened in
 * three weeks all have to exist *at the moment of the run* to test the rule, and no fixture survives
 * the week.
 *
 * The cases that matter are the **refusals**. A wrong `clear` costs an install; a wrong `delete`
 * costs work, which is why `decideBranch` has no path to `delete` that does not go through
 * `mergedIntoMain`, and why the guard window is checked before the card's state.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type BranchFacts,
  CACHE_DIR_NAMES,
  type CacheFacts,
  decideBranch,
  decideCache,
  decideStash,
  FINISHED_CARD_STATUSES,
  formatAge,
  formatBytes,
  IDLE_MS,
  STALE_BRANCH_DAYS,
  STALE_STASH_DAYS,
  summaryLine,
} from "../repo-hygiene-rules";
import { FINISHED_CARD_STATUSES as WORKTREE_FINISHED_CARD_STATUSES } from "../worktree-prune-rules";

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;

/** A worktree whose caches may be cleared; each case below spoils exactly one fact. */
const clearableCache: CacheFacts = {
  relativePath: ".worktrees/t_1a2b3c4d",
  isPrimary: false,
  isCwd: false,
  underWorktreesDir: true,
  lastTouchedMs: NOW - 30 * HOUR_MS,
  nowMs: NOW,
  cardStatuses: ["done"],
  presentCacheDirs: ["node_modules", ".next"],
};

describe("decideCache — what may be emptied", () => {
  it("clears a finished card's caches once the tree is past the guard", () => {
    const decision = decideCache(clearableCache);
    assert.equal(decision.action, "clear");
    assert.match(decision.reason, /card done and untouched for 1 d/);
  });

  it("clears an idle tree even when its card never finished — a cancelled run is not a reason to keep 1 GB", () => {
    const decision = decideCache({ ...clearableCache, cardStatuses: ["running"] });
    assert.equal(decision.action, "clear");
    assert.match(decision.reason, /untouched for 1 d/);
  });

  it("keeps a tree written to inside 24 h, whatever its card says", () => {
    const decision = decideCache({
      ...clearableCache,
      lastTouchedMs: NOW - 2 * HOUR_MS,
      cardStatuses: ["done", "archived"],
    });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /inside the 24 h guard/);
  });

  it("is inclusive at the boundary: exactly 24 h idle is clearable", () => {
    assert.equal(decideCache({ ...clearableCache, lastTouchedMs: NOW - IDLE_MS }).action, "clear");
    assert.equal(
      decideCache({ ...clearableCache, lastTouchedMs: NOW - IDLE_MS + 1 }).action,
      "keep",
    );
  });

  it("never empties the primary checkout", () => {
    const decision = decideCache({ ...clearableCache, isPrimary: true });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /primary checkout/);
  });

  it("never empties the worktree the run is inside", () => {
    const decision = decideCache({ ...clearableCache, isCwd: true });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /running in/);
  });

  it("leaves worktrees registered outside .worktrees/ alone", () => {
    const decision = decideCache({ ...clearableCache, underWorktreesDir: false });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /outside \.worktrees\//);
  });

  it("keeps a worktree with nothing to clear, so the report stays quiet about it", () => {
    const decision = decideCache({ ...clearableCache, presentCacheDirs: [] });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /no cache directories/);
  });

  it("fails closed when the tree's last write cannot be read", () => {
    const decision = decideCache({ ...clearableCache, lastTouchedMs: null });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /could not be read/);
  });

  it("fails closed when the clock and the tree disagree", () => {
    const decision = decideCache({ ...clearableCache, lastTouchedMs: NOW + HOUR_MS });
    assert.equal(decision.action, "keep");
    assert.match(decision.reason, /disagree/);
  });

  it("names exactly the four regenerable directories", () => {
    assert.deepEqual([...CACHE_DIR_NAMES], ["node_modules", ".next", ".turbo", "dist"]);
  });
});

/** A branch that must be reported: local-only, old, nobody has it checked out. */
const staleLocalBranch: BranchFacts = {
  name: "wt/orphaned",
  aheadOfMain: 3,
  behindMain: 1,
  ageDays: 40,
  mergedIntoMain: false,
  checkedOut: false,
  checkedOutIn: null,
  hasRemoteCounterpart: false,
};

describe("decideBranch — the only delete is a proved merge", () => {
  it("deletes a branch that is an ancestor of origin/main", () => {
    const decision = decideBranch({ ...staleLocalBranch, mergedIntoMain: true });
    assert.equal(decision.action, "delete");
    assert.match(decision.reason, /ancestor of origin\/main/);
  });

  it("reports a merged branch a worktree still holds, naming the worktree", () => {
    const decision = decideBranch({
      ...staleLocalBranch,
      mergedIntoMain: true,
      checkedOut: true,
      checkedOutIn: ".worktrees/t_1a2b3c4d",
    });
    assert.equal(decision.action, "report");
    assert.match(decision.reason, /\.worktrees\/t_1a2b3c4d still has it checked out/);
  });

  it("reports a local-only branch older than 30 days with its ahead/behind", () => {
    const decision = decideBranch(staleLocalBranch);
    assert.equal(decision.action, "report");
    assert.match(decision.reason, /local-only · 3 ahead \/ 1 behind · 40 d old/);
  });

  it("is inclusive at 30 days", () => {
    assert.equal(
      decideBranch({ ...staleLocalBranch, ageDays: STALE_BRANCH_DAYS }).action,
      "report",
    );
    assert.equal(
      decideBranch({ ...staleLocalBranch, ageDays: STALE_BRANCH_DAYS - 1 }).action,
      "ignore",
    );
  });

  it("leaves a local-only branch alone while it is still recent", () => {
    const decision = decideBranch({ ...staleLocalBranch, ageDays: 3 });
    assert.equal(decision.action, "ignore");
    assert.match(decision.reason, /recent/);
  });

  it("leaves a branch the remote still carries to the remote", () => {
    const decision = decideBranch({ ...staleLocalBranch, hasRemoteCounterpart: true });
    assert.equal(decision.action, "ignore");
    assert.match(decision.reason, /remote decides/);
  });

  it("cannot delete anything whose merge is unproved, at any age or shape", () => {
    for (const ageDays of [0, 29, 30, 400]) {
      for (const checkedOut of [false, true]) {
        for (const hasRemoteCounterpart of [false, true]) {
          const decision = decideBranch({
            ...staleLocalBranch,
            ageDays,
            checkedOut,
            checkedOutIn: checkedOut ? ".worktrees/t_x" : null,
            hasRemoteCounterpart,
          });
          assert.notEqual(decision.action, "delete", `age ${ageDays} leaked a delete`);
        }
      }
    }
  });
});

describe("decideStash — a stash is the only copy", () => {
  it("reports one older than 14 days", () => {
    assert.equal(decideStash({ ageDays: STALE_STASH_DAYS }), "report");
    assert.equal(decideStash({ ageDays: 21 }), "report");
  });

  it("says nothing about a fresh one", () => {
    assert.equal(decideStash({ ageDays: STALE_STASH_DAYS - 1 }), "ignore");
    assert.equal(decideStash({ ageDays: 0 }), "ignore");
  });
});

describe("formatting and the summary line", () => {
  it("formats bytes the way df prints them", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(1000), "1.0 KB");
    assert.equal(formatBytes(1_500_000), "1.5 MB");
    assert.equal(formatBytes(19_300_000_000), "19.3 GB");
    assert.equal(formatBytes(-2048), "-2.0 KB");
    assert.equal(formatBytes(Number.NaN), "unknown");
  });

  it("formats an age in the unit an operator judges it by", () => {
    assert.equal(formatAge(30 * 60 * 1000), "30 min");
    assert.equal(formatAge(5 * HOUR_MS), "5 h");
    assert.equal(formatAge(3 * 24 * HOUR_MS), "3 d");
    assert.equal(formatAge(90 * 24 * HOUR_MS), "3 mo");
    assert.equal(formatAge(-1), "unknown");
  });

  it("prints one line, with the df figure first", () => {
    const line = summaryLine({
      freedBytes: 12_300_000_000,
      branchesDeleted: 11,
      worktreesRemoved: 4,
      cachesCleared: 7,
      needsHuman: 9,
    });
    assert.equal(
      line,
      "repo-hygiene: freed 12.3 GB (df delta) · 11 branches deleted · 4 worktrees removed · 7 cache sets cleared · 9 need a human",
    );
  });

  it("says 0 B and stays singular where it should", () => {
    const line = summaryLine({
      freedBytes: 0,
      branchesDeleted: 1,
      worktreesRemoved: 1,
      cachesCleared: 1,
      needsHuman: 1,
    });
    assert.equal(
      line,
      "repo-hygiene: freed 0 B (df delta) · 1 branch deleted · 1 worktree removed · 1 cache set cleared · 1 needs a human",
    );
  });

  it("says 0 B for a negative delta too — another process moved while the job ran", () => {
    const line = summaryLine({
      freedBytes: -393_216,
      branchesDeleted: 0,
      worktreesRemoved: 0,
      cachesCleared: 0,
      needsHuman: 5,
    });
    assert.match(line, /^repo-hygiene: freed 0 B/);
    assert.doesNotMatch(line, /freed -/);
  });
});

describe("the finished-card list matches the worktree pruner's", () => {
  it("is the same two states", () => {
    // Duplicated in `repo-hygiene-rules.ts` on purpose (a `.ts` importing a sibling `.ts` would have
    // to pick an extension one of the two resolvers rejects). This is the guard that they agree.
    assert.deepEqual([...FINISHED_CARD_STATUSES], [...WORKTREE_FINISHED_CARD_STATUSES]);
  });
});
