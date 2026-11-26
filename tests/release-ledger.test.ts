/**
 * The release entry is **assembled from the update ledger**, not only from commit subjects (#1351).
 *
 * The census was the rc2 note's whole content — "4 commits: …" — while the facts a reader needed
 * (who notices, and where the rule now lives) sat in card comments. The ledger
 * (`data/changelog/updates/<pr>.json`, #1346) holds exactly those two fields per merged PR, so
 * `scripts/release.sh` joins them into the bullet it generates.
 *
 * `scripts/release.sh` is the only generation path in the repo (`scripts/release-cut.mjs --prepare`
 * shells out to its `--dry-run`), so the format is pinned here by running the real script against a
 * throwaway tree — `release.sh`, the version classifier, the ledger reader, `lib/docs/updates.ts`, a
 * `package.json`, a `CHANGELOG.md` and real git history with a real tag. Nothing here touches the
 * repository's own `package.json`, `CHANGELOG.md`, ledger or tags.
 *
 * What each case proves:
 *
 *   1. **golden** — a fixture range's whole entry, byte for byte: the joined bullet, and a preamble
 *      that names the `feat`/`fix` commits the range carries without a record. The format cannot
 *      drift between cuts without failing here;
 *   2. `--check` is green on the regenerated entry, and red — naming the bullet — when that bullet
 *      loses its `reader_impact`;
 *   3. `--check` is red when a ledger row's `specs[]` document is not in the tree: the release-note
 *      link would 404, and this surfaces before the tag rather than after it;
 *   4. a curated entry's `### Commits` block is provenance, so the check does not demand a joined
 *      clause from a bullet that block names;
 *   5. an unreadable ledger is a `--check` finding and **not** a blocked cut: `--dry-run` still
 *      writes the entry, with the preamble saying nothing was joined;
 *   6. `release.sh`'s `LEDGER_DIR` and `lib/docs/updates.ts`'s `UPDATES_DIR` are one spelling.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { UPDATES_DIR } from "../lib/docs/updates";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RELEASE_SH = fileURLToPath(new URL("../scripts/release.sh", import.meta.url));
const DATE = "2026-11-22";

/**
 * Every child runs without the caller's `GIT_*` variables.
 *
 * A probe is a standalone repository, and a `GIT_DIR` inherited from a caller would point the
 * probe's `git init`/`commit` — and the script's own `log`/`describe` — at the repository being
 * scripted into. Measured: the pre-push hook runs the suite with `GIT_DIR` exported, and the probe
 * then wrote into the real checkout instead of the throwaway one.
 */
const CHILD_ENV: NodeJS.ProcessEnv = { ...process.env, RELEASE_DATE: DATE };
for (const key of Object.keys(CHILD_ENV)) {
  if (key.startsWith("GIT_")) delete CHILD_ENV[key];
}

const trees: string[] = [];
afterEach(() => {
  for (const dir of trees.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Fixture {
  /** `data/changelog/updates/<pr>.json`, keyed by PR number; `null` writes a broken file. */
  readonly ledger?: Record<number, unknown>;
  /** The `## [1.0.0]` base entry's Known limits bullets. */
  readonly limits?: string;
}

const BASE_LIMITS = "- the probe is the whole tree";
const LIMITS_FILE = "- the probe limit, which ships verbatim";

const ONE_DOC = "docs/specs/one.md";
const TWO_DOC = "docs/specs/two.md";

/** One entry, valid by `lib/docs/updates.ts` — the shape a PR authors. */
function entry(pr: number, impact: string, specs: string[]) {
  return {
    pr,
    date: "2026-11-21",
    area: "admin",
    summary: `the change in #${pr}`,
    reader_impact: impact,
    specs,
    risk: "low",
  };
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", env: CHILD_ENV });
}

function commit(dir: string, subject: string) {
  git(dir, ["add", "-A"]);
  // `--allow-empty`: the generator reads subjects, not diffs, and two consecutive subjects may
  // legitimately leave the tree where it was.
  git(dir, ["commit", "-q", "--allow-empty", "-m", subject]);
}

/** A throwaway release tree: the real scripts, real git history, one tag, one ledger. */
function makeTree(fixture: Fixture = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "release-ledger-"));
  trees.push(dir);
  for (const sub of ["scripts", "lib/docs", "data/changelog/updates", "docs/specs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  cpSync(RELEASE_SH, join(dir, "scripts", "release.sh"));
  cpSync(join(ROOT, "scripts/release-version.mjs"), join(dir, "scripts", "release-version.mjs"));
  cpSync(join(ROOT, "scripts/release-ledger.mjs"), join(dir, "scripts", "release-ledger.mjs"));
  cpSync(join(ROOT, "lib/docs/updates.ts"), join(dir, "lib", "docs", "updates.ts"));
  writeFileSync(join(dir, "docs", ONE_DOC.slice("docs/".length)), "one\n");
  writeFileSync(join(dir, "docs", TWO_DOC.slice("docs/".length)), "two\n");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "probe", version: "1.0.0" })}\n`,
  );

  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "probe@example.test"]);
  git(dir, ["config", "user.name", "Probe"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  // A remote, so the entry's PR links and `specs[]` links are the real thing rather than absent.
  git(dir, ["remote", "add", "origin", "https://github.com/example/probe.git"]);

  writeFileSync(
    join(dir, "CHANGELOG.md"),
    `# Changelog\n\n## [1.0.0] - 2026-11-20\n\n### Added\n\n- \`feat(core)\` — the base release\n\n### Known limits\n\n${fixture.limits ?? BASE_LIMITS}\n`,
  );
  for (const [pr, record] of Object.entries(fixture.ledger ?? {})) {
    const name = `${pr}.json`;
    writeFileSync(
      join(dir, UPDATES_DIR, name),
      typeof record === "string" ? record : `${JSON.stringify(record, null, 2)}\n`,
    );
  }
  commit(dir, "feat(core) · the base release (#1)");
  git(dir, ["tag", "-a", "v1.0.0", "-m", "v1.0.0"]);

  // The range under test. `#12` has an entry; `#13` and `feat(nav)` with no marker have none, and
  // `#14` is a chore that owes no entry — the three cases the preamble and the sections distinguish.
  writeFileSync(join(dir, "docs", "specs", "one.md"), "one, revised\n");
  commit(dir, "feat(admin) · the joined bullet gains who notices (#12)");
  commit(dir, "fix(flow) — a bullet with no ledger entry (#13)");
  commit(dir, "feat(nav) · a subject with no pull request marker");
  commit(dir, "chore(ci) · housekeeping that owes no entry (#14)");

  writeFileSync(join(dir, "limits.md"), `${LIMITS_FILE}\n`);
  return dir;
}

function release(dir: string, args: string[]) {
  const run = spawnSync("bash", [join(dir, "scripts", "release.sh"), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: CHILD_ENV,
  });
  return { status: run.status ?? -1, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

/** The entry `--dry-run` would write: its stdout, without the plan (which the script sends to stderr). */
function dryRun(dir: string, version = "1.1.0"): string {
  const run = release(dir, ["--dry-run", version, "--limits", join(dir, "limits.md")]);
  expect(run.status, run.stderr).toBe(0);
  return run.stdout;
}

/** Put a generated entry in the CHANGELOG and bump package.json, the way a release PR would. */
function prepare(dir: string, version = "1.1.0") {
  const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
  const at = changelog.indexOf("## [1.0.0]");
  const entryText = dryRun(dir, version);
  writeFileSync(
    join(dir, "CHANGELOG.md"),
    `${changelog.slice(0, at)}${entryText}\n${changelog.slice(at)}`,
  );
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "probe", version })}\n`);
  writeFileSync(join(dir, "limits.md"), `${LIMITS_FILE}\n`);
}

const IMPACT_TWELVE = "An admin sees one merge, its document and who notices it.";
const IMPACT_TWELVE_EDITED = "An admin sees the joined clause and nothing else.";

/* ------------------------------------------------------------------ *\
 * 1. The golden entry
 * ------------------------------------------------------------------ */

describe("the entry joins the update ledger", () => {
  it("renders the joined bullet and names the unrecorded feat/fix commits, byte for byte", () => {
    const dir = makeTree({
      ledger: {
        12: entry(12, IMPACT_TWELVE, [ONE_DOC]),
      },
    });

    // Compared with trailing blank lines trimmed, which is what `--prepare` writes: `dry.stdout` ends
    // with the limits file's own newline plus the generator's, and the entry's body is the contract.
    expect(dryRun(dir).trimEnd()).toBe(`## [1.1.0] - ${DATE}

> **Ledger coverage — 2 \`feat\`/\`fix\` commit(s) in this range carry no \`data/changelog/updates/<pr>.json\` entry:** \`a subject with no pull request marker\`, #13. Their bullets read as the commit subject alone. The ledger entry — its \`reader_impact\` and the \`specs[]\` the rule now lives in — is written in the pull request that makes the change, so this is a finding about the range, never a refusal of the cut.

### Added

- \`feat(nav)\` — a subject with no pull request marker
- \`feat(admin)\` — the joined bullet gains who notices ([#12](https://github.com/example/probe/pull/12)) · Who notices: ${IMPACT_TWELVE} · Rule: [${ONE_DOC}](https://github.com/example/probe/blob/v1.1.0/${ONE_DOC})

### Fixed

- \`fix(flow)\` — a bullet with no ledger entry ([#13](https://github.com/example/probe/pull/13))

### Maintenance

- \`chore(ci)\` — housekeeping that owes no entry ([#14](https://github.com/example/probe/pull/14))

### Known limits

${LIMITS_FILE}`);
  });

  it("links every specs[] path, and stays silent when the range is fully recorded", () => {
    const dir = makeTree({
      ledger: {
        12: entry(12, IMPACT_TWELVE, [ONE_DOC, TWO_DOC]),
        13: entry(13, "A flow author sees the new refusal.", [TWO_DOC]),
      },
    });
    const out = dryRun(dir);
    // `feat(nav)` has no PR marker, so it can never be recorded: the preamble still fires, and that
    // is correct — it is the one commit whose record is unknowable from its subject.
    expect(out).toContain("**Ledger coverage — 1 `feat`/`fix` commit(s) in this range");
    expect(out).toContain(`[${ONE_DOC}](https://github.com/example/probe/blob/v1.1.0/${ONE_DOC})`);
    expect(out).toContain(`[${TWO_DOC}](https://github.com/example/probe/blob/v1.1.0/${TWO_DOC})`);
    expect(out).toContain("A flow author sees the new refusal.");
  });
});

/* ------------------------------------------------------------------ *\
 * 2. --check: the join, proven before the tag
 * ------------------------------------------------------------------ */

describe("--check proves the join", () => {
  it("is green on a regenerated entry", () => {
    const dir = makeTree({ ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC]) } });
    prepare(dir);
    const run = release(dir, ["--check"]);
    expect(run.stderr).toBe("");
    expect(run.status, run.stdout).toBe(0);
    expect(run.stdout).toContain("joins 1 ledger row(s)");
  });

  it("names the bullet that lost its reader_impact", () => {
    const dir = makeTree({ ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC]) } });
    prepare(dir);
    const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    // The bullet keeps its PR marker and loses the clause: the drift a hand-patched entry produces.
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      changelog.replace(` · Who notices: ${IMPACT_TWELVE}`, ""),
    );

    const run = release(dir, ["--check"]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      "entry [1.1.0] names #12 but does not carry that PR's ledger reader_impact",
    );
  });

  it("fails when the row's reader_impact changed after the entry was generated", () => {
    const dir = makeTree({ ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC]) } });
    prepare(dir);
    writeFileSync(
      join(dir, UPDATES_DIR, "12.json"),
      `${JSON.stringify(entry(12, IMPACT_TWELVE_EDITED, [ONE_DOC]), null, 2)}\n`,
    );

    const run = release(dir, ["--check"]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("names #12 but does not carry that PR's ledger reader_impact");
  });

  it("fails on a specs[] document the tree does not carry — the broken link, before the tag", () => {
    const dir = makeTree({
      ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC, "docs/specs/moved-away.md"]) },
    });
    prepare(dir);

    const run = release(dir, ["--check"]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("names docs/specs/moved-away.md, which this tree does not carry");
  });

  it("does not judge a curated entry's ### Commits block as a bullet that forgot the ledger", () => {
    const dir = makeTree({ ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC]) } });
    prepare(dir);
    const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    // A curated entry: its own prose, then the generated provenance block that names every PR.
    const curated = `## [1.1.0] - ${DATE}

### Added

- \`feat(admin)\` — the record a reader needs, in the owner's own words

### Commits

- \`feat(admin)\` — the joined bullet gains who notices (#12) ([#12](https://github.com/example/probe/pull/12))

### Known limits

${LIMITS_FILE}
`;
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      `${changelog.slice(0, changelog.indexOf("## [1.1.0]"))}${curated}\n${changelog.slice(changelog.indexOf("## [1.0.0]"))}`,
    );

    const run = release(dir, ["--check"]);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("joins 0 ledger row(s)");
  });

  it("keeps a published entry fixed text: a tagged entry is not re-judged", () => {
    const dir = makeTree({ ledger: { 12: entry(12, IMPACT_TWELVE, [ONE_DOC]) } });
    prepare(dir);
    commit(dir, "chore(release): 1.1.0");
    git(dir, ["tag", "-a", "v1.1.0", "-m", "v1.1.0"]);
    // The tag fixes the range; the entry is now a published document, so the join is history.
    const run = release(dir, ["--check"]);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("the ledger join was checked while v1.1.0 was untagged");
  });
});

/* ------------------------------------------------------------------ *\
 * 3. The warning is never a gate
 * ------------------------------------------------------------------ */

describe("an unrecorded change is a finding, not a stop", () => {
  it("generates the entry when the ledger is unreadable, and says so in the preamble", () => {
    const dir = makeTree({ ledger: { 12: "{ this is not JSON" } });

    const entryText = dryRun(dir);
    expect(entryText).toContain("## [1.1.0]");
    // Every feat/fix in range is unrecorded, because nothing could be read — the honest reading.
    // Newest first, as `git log` hands the range over: the markerless `feat(nav)` leads.
    expect(entryText).toContain("**Ledger coverage — 3 `feat`/`fix` commit(s) in this range");
    expect(entryText).toContain("`a subject with no pull request marker`, #13, #12");

    // …and `--check` refuses the same tree: by then a human is signing it.
    prepare(dir);
    const run = release(dir, ["--check"]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("could not be read — no bullet can be shown to join it");
  });

  it("cuts a release with no ledger at all (a pre-ledger range) instead of refusing", () => {
    const dir = makeTree({ ledger: {} });
    const entryText = dryRun(dir);
    expect(entryText).toContain("## [1.1.0]");
    expect(entryText).toContain("carry no `data/changelog/updates/<pr>.json` entry");
    expect(entryText).toContain("never a refusal of the cut");
  });
});

/* ------------------------------------------------------------------ *\
 * 4. One spelling of the ledger's home
 * ------------------------------------------------------------------ */

describe("the ledger's home is one string", () => {
  it("agrees between release.sh and lib/docs/updates.ts", () => {
    const script = readFileSync(RELEASE_SH, "utf8");
    expect(script).toContain(`LEDGER_DIR="${UPDATES_DIR}"`);
    expect(UPDATES_DIR).toBe("data/changelog/updates");
  });
});
