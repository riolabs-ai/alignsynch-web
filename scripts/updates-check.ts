/**
 * The update ledger's filesystem and git half — what `data:check` E44 knows that the pure layer
 * cannot (`lib/docs/updates.ts`).
 *
 * **Three questions, one report.** Which entries are on disk and does each one parse; does every
 * `specs[]` path it names actually exist; and does *this change* owe an entry it did not write. The
 * first two are `fs`; the third is `git`, and it is the half the spec calls **E-updates**.
 *
 * **The coverage half never guesses.** It reads `base..HEAD`'s commit subjects and the change's
 * added files. When the base ref cannot be resolved — a fresh clone with no `origin/main`, a tree
 * that is not a repository — it says so in `skipped` and the gate prints that line. A silent pass
 * would be a check that cannot fail, which is the thing the ledger exists to stop.
 *
 * **A failing check must be shown failing.** `scripts/__tests__/updates.test.ts` drives the pure
 * predicates over every malformed shape, and the PR that lands this rule pastes a deliberately bad
 * entry's `data:check` output beside a good one's.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UPDATES_DIR,
  coverageProblem,
  parseUpdateLedger,
  updateEntryProblems,
  type UpdateEntry,
  type UpdateFile,
} from "../lib/docs/updates";

/** One command's outcome. `status === 0` is the only success; a spawn failure is `null`. */
export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
}

/** The seam a test drives: every git call this module makes goes through one runner. */
export type Runner = (args: readonly string[], cwd: string) => CommandResult;

export interface UpdatesCheckOptions {
  /** The repository root the ledger and its spec paths are read from. */
  readonly root?: string;
  /** The ref this change is read against. Defaults to `UPDATES_BASE`, then `origin/main`. */
  readonly base?: string;
  /** Injected for tests; the real one runs `git`. */
  readonly run?: Runner;
}

/** What the gate prints and what it fails on. */
export interface UpdatesCheck {
  /** One sentence per problem. Empty means the ledger is whole. */
  readonly problems: readonly string[];
  /** How many entries were read — the census line. */
  readonly entries: number;
  /** Why the coverage half did not run, or `null` when it did. */
  readonly skipped: string | null;
  /** How many commit subjects the coverage half classified. */
  readonly subjects: number;
}

/** `git <args>` in `cwd`, stdout captured, never throwing. */
const runGit: Runner = (args, cwd) => {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "" };
};

/** Newline-separated stdout as rows. Empty output is zero rows, not one empty row. */
function lines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
}

/** The ledger's files, parsed — or the problem that stopped it. */
function readLedger(
  root: string,
): { entries: UpdateEntry[]; files: UpdateFile[]; problems: string[] } | { problems: string[] } {
  const dir = join(root, UPDATES_DIR);
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return {
      problems: [`${UPDATES_DIR} could not be read — the ledger's home is missing from this tree`],
    };
  }
  const problems: string[] = [];
  const files: UpdateFile[] = [];
  for (const name of names) {
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch {
      problems.push(`${UPDATES_DIR}/${name}: the file could not be read`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      problems.push(`${UPDATES_DIR}/${name}: the file is not valid JSON`);
      continue;
    }
    problems.push(...updateEntryProblems(name, raw));
    files.push({ name, raw });
  }
  if (problems.length > 0) return { problems };

  let entries: UpdateEntry[];
  try {
    entries = parseUpdateLedger(files);
  } catch (error) {
    return { problems: [error instanceof Error ? error.message : `${UPDATES_DIR} is invalid`] };
  }
  // A path the entry names must be a file in this tree: the whole point of the field is that a
  // reader can follow it, and the check is here rather than in the pure layer because it needs `fs`.
  for (const [index, file] of files.entries()) {
    const entry = entries[index];
    if (entry === undefined) continue;
    for (const spec of entry.specs) {
      if (!existsSync(join(root, spec))) {
        problems.push(`${UPDATES_DIR}/${file.name}: \`specs\` names ${spec}, which does not exist`);
      }
    }
  }
  return { entries, files, problems };
}

/**
 * The whole check: the ledger on disk, every spec path, and whether this change owes an entry.
 *
 * The coverage half is skipped — and says so — when the base ref or `HEAD` cannot be resolved, or
 * when the changed-file list cannot be read. It is never skipped quietly: `skipped` is printed by
 * `data-check.ts` beside the census line.
 */
export function updatesCheck(options: UpdatesCheckOptions = {}): UpdatesCheck {
  const root = options.root ?? process.cwd();
  const run = options.run ?? runGit;
  const ledger = readLedger(root);
  const entries = "entries" in ledger ? ledger.entries : [];
  const problems = [...ledger.problems];

  const base = (options.base ?? process.env.UPDATES_BASE ?? "origin/main").trim();
  const head = run(["rev-parse", "--verify", "--quiet", "HEAD"], root);
  if (head.status !== 0) {
    return { problems, entries: entries.length, skipped: "not a git tree, so no change to classify", subjects: 0 };
  }
  const baseRef = run(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], root);
  if (baseRef.status !== 0) {
    return {
      problems,
      entries: entries.length,
      skipped: `${base} is not in this clone, so this change's commits cannot be read`,
      subjects: 0,
    };
  }
  const subjectsResult = run(["log", "--format=%s", `${base}..HEAD`], root);
  const addedResult = run(["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`], root);
  if (subjectsResult.status !== 0 || addedResult.status !== 0) {
    return {
      problems,
      entries: entries.length,
      skipped: `git could not diff ${base}...HEAD, so this change's scope is unknown`,
      subjects: 0,
    };
  }

  const subjects = lines(subjectsResult.stdout);
  const owed = coverageProblem(subjects, lines(addedResult.stdout));
  if (owed !== null) problems.push(owed);

  return { problems, entries: entries.length, skipped: null, subjects: subjects.length };
}
