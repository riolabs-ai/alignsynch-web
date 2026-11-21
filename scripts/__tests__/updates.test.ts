/**
 * The update ledger's rules — `data:check` E44, the rule the spec calls **E-updates**.
 *
 * Three layers, each driven without the thing below it: the per-entry predicates
 * (`updateEntryProblems`) over every malformed shape, the ledger join (`updateRows`) over a fake
 * manifest, and the whole check (`updatesCheck`) over a fake `git` — then, last, the real tree,
 * because a walk that found nothing is worth nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coverageProblem,
  parseUpdateEntry,
  parseUpdateLedger,
  requiresUpdateEntry,
  specDocPath,
  updateEntryProblems,
  updateFileNumber,
  updateRows,
  updateSpecHref,
} from "../../lib/docs/updates";
import { updatesCheck, type CommandResult } from "../updates-check";

/** A valid entry, as the fixture writes one. Each case varies exactly one field. */
const GOOD = {
  pr: 1341,
  date: "2026-11-21",
  area: "admin",
  summary: "The update ledger renders one entry per merged pull request.",
  reader_impact: "An admin reading /admin/docs/updates sees what each merge changed.",
  specs: ["docs/specs/admin-updates.md"],
};

/** The same entry with one field replaced or removed. */
function variant(patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...GOOD, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next;
}

test("a valid entry has no problems, and parses", () => {
  assert.deepEqual(updateEntryProblems("1341.json", GOOD), []);
  const entry = parseUpdateEntry("1341.json", GOOD);
  assert.equal(entry.pr, 1341);
  assert.deepEqual(entry.specs, ["docs/specs/admin-updates.md"]);
});

test("the filename names the PR: a non-numeric name and a disagreeing `pr` are both refused", () => {
  assert.match(updateEntryProblems("notes.json", GOOD).join("\n"), /not a pull request number/);
  assert.match(updateEntryProblems("1342.json", GOOD).join("\n"), /`pr` is 1341 but the file is 1342/);
  assert.equal(updateFileNumber("1341.json"), 1341);
  assert.equal(updateFileNumber("0.json"), null);
  assert.equal(updateFileNumber("1341.json.bak"), null);
});

test("`date` is an ISO-8601 calendar date, and an impossible one is refused", () => {
  assert.match(
    updateEntryProblems("1341.json", variant({ date: "21/11/2026" })).join("\n"),
    /ISO-8601/,
  );
  // `Date` parses this as March, so only a round trip refuses it.
  assert.match(updateEntryProblems("1341.json", variant({ date: "2026-02-31" })).join("\n"), /ISO-8601/);
  assert.deepEqual(updateEntryProblems("1341.json", variant({ date: "2026-11-21T09:30:00Z" })), []);
});

test("`specs` must be non-empty and every path must be a document under docs/", () => {
  assert.match(updateEntryProblems("1341.json", variant({ specs: [] })).join("\n"), /at least one document/);
  assert.match(updateEntryProblems("1341.json", variant({ specs: undefined })).join("\n"), /`specs` is missing/);
  assert.match(
    updateEntryProblems("1341.json", variant({ specs: ["scripts/demo-env.mjs"] })).join("\n"),
    /not a `docs\/…` path/,
  );
  assert.match(
    updateEntryProblems("1341.json", variant({ specs: ["docs/../etc/passwd"] })).join("\n"),
    /not a `docs\/…` path/,
  );
});

test("the two sentences are required, single-line and bounded", () => {
  assert.match(updateEntryProblems("1341.json", variant({ summary: "  " })).join("\n"), /must not be empty/);
  assert.match(updateEntryProblems("1341.json", variant({ summary: "a\nb" })).join("\n"), /one line/);
  assert.match(
    updateEntryProblems("1341.json", variant({ reader_impact: "x".repeat(241) })).join("\n"),
    /one sentence, at most 240/,
  );
});

test("`Nobody` in the impact is a claim that needs `risk: none`", () => {
  assert.match(
    updateEntryProblems("1341.json", variant({ reader_impact: "Nobody", risk: "low" })).join("\n"),
    /must be `none`/,
  );
  assert.deepEqual(updateEntryProblems("1341.json", variant({ reader_impact: "Nobody", risk: "none" })), []);
});

test("unknown keys and unknown risk words are refused", () => {
  assert.match(updateEntryProblems("1341.json", variant({ author: "someone" })).join("\n"), /unknown key/);
  assert.match(updateEntryProblems("1341.json", variant({ risk: "severe" })).join("\n"), /`risk` is one of/);
});

test("the ledger refuses two entries for one PR, and a file that is not an entry", () => {
  assert.deepEqual(parseUpdateLedger([{ name: "1341.json", raw: GOOD }]).length, 1);
  assert.throws(
    () => parseUpdateLedger([{ name: "1341.json", raw: GOOD }, { name: "1341.json", raw: GOOD }]),
    /two entries/,
  );
  assert.throws(() => parseUpdateLedger([{ name: "README.md", raw: GOOD }]), /is not a `<pr>.json` entry/);
});

test("the ledger is newest first, and a spec link is an address only when the hub carries it", () => {
  const older = { ...GOOD, pr: 1200, date: "2026-01-02" };
  const newer = { ...GOOD, pr: 1300, date: "2026-02-03" };
  const sameDayLow = { ...GOOD, pr: 1400, date: "2026-02-03" };
  const rows = updateRows(
    parseUpdateLedger([
      { name: "1200.json", raw: older },
      { name: "1300.json", raw: newer },
      { name: "1400.json", raw: sameDayLow },
    ]),
    new Set(["specs/admin-updates.md"]),
  );
  assert.deepEqual(
    rows.map((row) => row.pr),
    [1400, 1300, 1200],
  );
  assert.deepEqual(rows[0]?.specLinks, [
    { path: "docs/specs/admin-updates.md", href: "/admin/docs/specs/admin-updates.md", inHub: true },
  ]);

  const outsideHub = updateRows(parseUpdateLedger([{ name: "1341.json", raw: GOOD }]), new Set());
  assert.deepEqual(outsideHub[0]?.specLinks, [
    { path: "docs/specs/admin-updates.md", href: null, inHub: false },
  ]);
  assert.equal(specDocPath("docs/guides/x.md"), "guides/x.md");
  assert.equal(updateSpecHref("docs/specs/admin-updates.md"), "/admin/docs/specs/admin-updates.md");
});

test("a feat or a fix owes an entry; a chore, a docs change and a release commit do not", () => {
  assert.equal(requiresUpdateEntry(["feat(admin) · the update ledger (#1341)"]), true);
  assert.equal(requiresUpdateEntry(["fix(ci,docs) · point the demo reset at the live project"]), true);
  assert.equal(requiresUpdateEntry(["feat: a bare subject"]), true);
  assert.equal(requiresUpdateEntry(["chore(release): 2.0.0-rc2 (#1340)"]), false);
  assert.equal(requiresUpdateEntry(["docs(specs) · write the rule down"]), false);
  assert.equal(requiresUpdateEntry([]), false);
});

test("the coverage problem names the commit that owed the entry, and clears on an added file", () => {
  const subjects = ["chore(x): something", "feat(admin) · the update ledger (#1341)"];
  assert.match(
    coverageProblem(subjects, ["app/(mainlayout)/admin/docs/updates/page.tsx"]) ?? "",
    /docs\/changelog\/updates\/<pr>\.json is missing.*feat\(admin\)/,
  );
  assert.equal(coverageProblem(subjects, ["docs/changelog/updates/1341.json"]), null);
  // The caller supplies *added* paths only (`git diff --diff-filter=A`), so a change that adds no
  // entry is the failing case however much of the ledger it touches.
  assert.match(coverageProblem(subjects, ["lib/docs/updates.ts"]) ?? "", /is missing/);
  assert.equal(coverageProblem(["chore(x): housekeeping"], []), null);
});

/** A fake `git`: the same answers for every call, so `updatesCheck` needs no repository. */
function fakeGit(answers: Record<string, CommandResult>) {
  return (args: readonly string[]): CommandResult => {
    const key = args.join(" ");
    const hit = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
    return hit?.[1] ?? { status: 1, stdout: "" };
  };
}

test("the check fails a feat commit with no added entry, and passes one with it", () => {
  const root = process.cwd();
  const base = {
    "rev-parse --verify --quiet HEAD": { status: 0, stdout: "abc123\n" },
    "rev-parse --verify --quiet origin/main^{commit}": { status: 0, stdout: "def456\n" },
  };
  const failing = updatesCheck({
    root,
    run: fakeGit({
      ...base,
      "log --format=%s": { status: 0, stdout: "chore(x): tidy\nfeat(admin): the ledger\n" },
      "diff --name-only": { status: 0, stdout: "lib/docs/updates.ts\n" },
    }),
  });
  assert.equal(failing.skipped, null);
  assert.ok(failing.problems.some((problem) => /is missing/.test(problem)));
  assert.ok(failing.problems.every((problem) => typeof problem === "string" && problem.length > 0));

  const passing = updatesCheck({
    root,
    run: fakeGit({
      ...base,
      "log --format=%s": { status: 0, stdout: "feat(admin): the ledger\n" },
      "diff --name-only": { status: 0, stdout: "docs/changelog/updates/9999.json\n" },
    }),
  });
  assert.deepEqual(passing.problems, []);
  assert.equal(passing.skipped, null);
});

test("an unresolvable base is reported, never silently passed", () => {
  const check = updatesCheck({
    root: process.cwd(),
    run: fakeGit({
      "rev-parse --verify --quiet HEAD": { status: 0, stdout: "abc123\n" },
      "rev-parse --verify --quiet origin/main^{commit}": { status: 1, stdout: "" },
    }),
  });
  assert.match(check.skipped ?? "", /origin\/main is not in this clone/);
  assert.deepEqual(check.problems, []);
});

test("the real tree's ledger is valid, and its entries are all accounted for", () => {
  const check = updatesCheck({ root: process.cwd(), run: fakeGit({}) });
  assert.deepEqual(check.problems, []);
  assert.ok(check.entries >= 1, "the ledger ships with at least one entry");
  assert.ok(check.skipped !== null, "no git answers were given, so coverage says so");
});
