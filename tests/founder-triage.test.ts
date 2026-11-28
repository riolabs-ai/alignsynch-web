/**
 * Founder triage — the classifier's rules, pinned.
 *
 * **This file is vitest, in `tests/`, and that is deliberate.** The card that commissioned the tool
 * named `scripts/__tests__/founder-triage.test.ts`, but that directory is `node:test` compiled by
 * `tsconfig.datacheck.json` into `.datacheck/` and run inside `pnpm data:check` — a vitest import
 * landing there would break the gate rather than add a suite, and vitest's own `include` is
 * `tests/**` only, so a file in `scripts/__tests__` would never run under `pnpm test` either. The
 * behaviour asked for is unchanged; the runner is the one this repo has for a script import.
 *
 * What is asserted, in the order the card asks for it: the table's *order* (not today's answers),
 * the `needs-info` fallback, title normalisation and the 72-character cut, the duplicate Jaccard, and
 * that the composed body's prefix equals the original byte for byte.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AREA_TABLE,
  BODY_SEPARATOR,
  CLASS_RULES,
  CLAIM_MAX,
  DESTINATION_MILESTONE,
  DUPLICATE_THRESHOLD,
  FOUNDER_LOGINS,
  MARKER,
  MARKER_GRACE_MS,
  PARKED_MILESTONE,
  acceptanceFor,
  applyRow,
  assertMilestonesOpen,
  assertWriteIdentity,
  buildPlan,
  classifyArea,
  classifyClass,
  classifyIssue,
  collapse,
  composeBlock,
  composeBody,
  cutToWidth,
  duplicateComment,
  duplicatePairs,
  ghEnv,
  isParked,
  jaccard,
  needsDecision,
  normaliseClaim,
  planTable,
  resolveMilestone,
  shouldTriage,
  stripPrefixes,
  surfaceFor,
  titleFor,
  titleHasHandle,
  titleTokens,
  triageGhArgs,
  writesFor,
} from "../scripts/triage-founder-issues.mjs";

/** One issue in the shape `gh issue list --json` returns, with every field the plan reads. */
function issue(
  number: number,
  title: string,
  body: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number,
    title,
    body,
    state: "open",
    updatedAt: "2026-11-23T08:00:00Z",
    url: `https://github.com/riolabs-ai/alignsynch/issues/${number}`,
    author: { login: "WaltJohnsonIII" },
    labels: [],
    milestone: null,
    comments: [],
    ...extra,
  };
}

describe("the area table is ordered, and the order decides the answer", () => {
  test("billing outranks flow, flow outranks ui, ui outranks product", () => {
    // "the plan price on the stage screen" is a billing issue, not a flow one.
    expect(classifyArea("Our plan says the stage screen should show pricing")?.area).toBe(
      "billing",
    );
    expect(classifyArea("The stage modal colours are wrong")?.area).toBe("flow");
    expect(classifyArea("The colour on this label is wrong")?.area).toBe("ui");
    expect(classifyArea("The wording of this name is odd")?.area).toBe("product");
  });

  test("the table itself is in that order, so a reorder is a visible diff", () => {
    expect(AREA_TABLE.map((row) => row.area)).toEqual(["billing", "flow", "ui", "product"]);
    expect(AREA_TABLE.map((row) => row.milestone)).toEqual([
      DESTINATION_MILESTONE,
      DESTINATION_MILESTONE,
      DESTINATION_MILESTONE,
      DESTINATION_MILESTONE,
    ]);
  });

  test("keywords match whole words only — `plan` must not fire on `explain`", () => {
    expect(classifyArea("Let me explain the namesake")).toBeNull();
    expect(classifyArea("The plan is wrong")?.area).toBe("billing");
  });

  test("a parked term adds the label and moves the milestone, and is not an area", () => {
    const klass = classifyIssue(issue(1, "Aspects we should do later", "Nice to have: aspects."));
    expect(klass.parked).toBe(true);
    expect(klass.area).toBe("flow");
    expect(klass.labels).toContain("parked");
    expect(klass.milestoneHandle).toBe(PARKED_MILESTONE);
    expect(isParked("nothing deferred here")).toBe(false);
  });
});

describe("the class rules are ordered too", () => {
  test("a question mark beats `should`, and `should` beats `broken`", () => {
    expect(classifyClass("The button should be greyed out, right?")).toBe("question");
    expect(classifyClass("We should fix this, it is broken")).toBe("enhancement");
    expect(classifyClass("This is broken")).toBe("bug");
  });

  test("the order is the table's, so flipping two rows is a visible diff", () => {
    expect(CLASS_RULES.map((rule) => rule.class)).toEqual(["question", "enhancement", "bug"]);
  });

  test("an opening how/what/why is a question with no question mark", () => {
    expect(classifyClass("How do they get back without an account")).toBe("question");
    expect(classifyClass("What is this page called")).toBe("question");
  });

  test("nothing matches → needs-info, and no class label is invented", () => {
    const klass = classifyClass("APP-02 Prod Website App has a Button To Take You to Demo Website");
    expect(klass).toBe("needs-info");
  });

  test("needs-info carries no milestone even when the area is placed", () => {
    // area/flow is real here (the word `relationships`), the class is not: half-triaged is not done.
    const klass = classifyIssue(
      issue(
        1364,
        "Prod button to the demo site",
        "Completed Demo Relationships — want to look first.",
      ),
    );
    expect(klass.area).toBe("flow");
    expect(klass.class).toBe("needs-info");
    expect(klass.labels).toEqual(["area/flow", "needs-info"]);
    expect(klass.milestoneHandle).toBeNull();
  });
});

describe("needs-decision is a question asking the owner to rule", () => {
  test("a decision phrase on a question carries it", () => {
    expect(
      needsDecision(
        "Was that difficult to implement or just a decision to keep it simple?",
        "question",
      ),
    ).toBe(true);
  });

  test("the same phrase on a non-question does not", () => {
    expect(needsDecision("This is a decision to keep it simple.", "enhancement")).toBe(false);
  });

  test("a plain question does not", () => {
    expect(needsDecision("What is this page called?", "question")).toBe(false);
  });
});

describe("title normalisation", () => {
  test("the founder's routing prefixes come off, once", () => {
    expect(
      normaliseClaim("Counterparty Workflow Questions - How do they get back without account?"),
    ).toBe("How do they get back without account?");
    expect(normaliseClaim("Initiator Workflow Questions - Aspect Title")).toBe("Aspect Title");
    expect(normaliseClaim("Question: Pricing Choices")).toBe("Pricing Choices");
  });

  test("a prefix is not stripped from the middle of a claim", () => {
    expect(stripPrefixes("The stage questions - answered")).toBe("The stage questions - answered");
  });

  test("whitespace collapses to one space", () => {
    expect(collapse("  a\n\n  b\t c  ")).toBe("a b c");
  });

  test("the cut is at 72 characters on a word boundary, with no ellipsis", () => {
    const long = `${"word ".repeat(30)}end`;
    const cut = cutToWidth(collapse(long), CLAIM_MAX);
    expect(cut.length).toBeLessThanOrEqual(CLAIM_MAX);
    expect(cut.endsWith(" ")).toBe(false);
    expect(long.startsWith(cut)).toBe(true);
    // The character after the cut is a space, i.e. the cut landed between words, never inside one.
    expect(long[cut.length]).toBe(" ");
    expect(cut).not.toContain("…");
  });

  test("a short claim is untouched, and a single long word is hard-cut", () => {
    expect(cutToWidth("Aspect Title", CLAIM_MAX)).toBe("Aspect Title");
    expect(cutToWidth("x".repeat(100), CLAIM_MAX)).toHaveLength(CLAIM_MAX);
  });

  test("the title is `area/<x>: <claim>`, and needs-info when there is no area", () => {
    expect(titleFor("flow", "Aspect Title")).toBe("area/flow: Aspect Title");
    expect(titleFor(null, "Aspect Title")).toBe("needs-info: Aspect Title");
  });

  test("a title this tool already rewrote normalises to the same claim — re-triage is idempotent", () => {
    // Re-triage reads the title the previous pass wrote; stacking a second prefix on it would
    // rewrite a founder's issue to `area/flow: area/flow: …` on every edit.
    expect(normaliseClaim("area/flow: What is this page called?")).toBe(
      "What is this page called?",
    );
    expect(normaliseClaim("needs-info: APP-02 button to the demo site")).toBe(
      "APP-02 button to the demo site",
    );
    expect(titleFor("flow", normaliseClaim("area/flow: What is this page called?"))).toBe(
      "area/flow: What is this page called?",
    );
  });
});

describe("duplicates are named, never closed", () => {
  const twins = [
    {
      number: 1356,
      claim: "What is this page called?",
      tokens: titleTokens("What is this page called?"),
    },
    {
      number: 1357,
      claim: "What is this page called?",
      tokens: titleTokens("What is this page called?"),
    },
  ];

  test("identical claims score 1.0 and pair up, naming the earlier issue", () => {
    expect(jaccard(twins[0].tokens, twins[1].tokens)).toBe(1);
    const pairs = duplicatePairs(twins);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ of: 1356, issue: 1357, score: 1 });
  });

  test("different claims on the same screen stay under the threshold", () => {
    const other = {
      number: 1359,
      claim: "Is this page identical if I am a visitor?",
      tokens: titleTokens("Is this page identical if I am a visitor?"),
    };
    expect(jaccard(twins[0].tokens, other.tokens)).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(duplicatePairs([twins[0], other])).toEqual([]);
  });

  test("an issue with no title is never a duplicate of another bare title", () => {
    expect(jaccard(titleTokens(""), titleTokens(""))).toBe(0);
  });

  test("the comment names the pair and closes nothing, and `duplicate` is applied to neither", () => {
    const [pair] = duplicatePairs(twins);
    const body = duplicateComment(pair, "What is this page called?");
    expect(body).toContain("Possible duplicate of #1356");
    expect(body).toContain("never closed");
    const plan = buildPlan(
      [
        issue(
          1356,
          "Counterparty Workflow Questions - What is this page called?",
          "What is this page called?",
        ),
        issue(
          1357,
          "Counterparty Workflow Questions - What is this page called?",
          "What is this page called?",
        ),
      ],
      {
        milestones: [{ number: 32, title: "v2.2.0 — the member surface" }],
        knownLabels: ["area/flow", "area/product", "question", "duplicate"],
      },
    );
    expect(plan.duplicates).toHaveLength(1);
    for (const row of plan.issues) {
      expect(row.labels).not.toContain("duplicate");
      // Both normalise to the same claim, so both carry their own number rather than `(2)`.
      expect(row.proposedTitle).toMatch(/\((1356|1357)\)$/);
    }
    expect(new Set(plan.issues.map((row) => row.proposedTitle)).size).toBe(2);
  });
});

describe("the body is append-only, and the prefix is proved", () => {
  const original =
    "# The founder's own words\n\n> with a quote, a screenshot and a `code span`\n\n" +
    '<img width="703" alt="image" src="https://github.com/user-attachments/assets/abc" />\n';

  const klass = {
    class: "question",
    areaLabel: "area/flow",
    surface: "counterparty stage screens",
    decisionNeeded: false,
    acceptance: "none — question only",
  };

  test("the composed body's original prefix is byte-for-byte the original", () => {
    const composed = composeBody(original, composeBlock({ title: "Old title" }, klass));
    expect(Buffer.from(composed.slice(0, original.length), "utf8")).toEqual(
      Buffer.from(original, "utf8"),
    );
    expect(composed.startsWith(original)).toBe(true);
    expect(composed.slice(original.length).startsWith(BODY_SEPARATOR)).toBe(true);
    // Nothing after the separator is the founder's text: the original appears exactly once.
    expect(composed.split(original)).toHaveLength(2);
  });

  test("the block carries the marker, the class line and the original title verbatim", () => {
    const block = composeBlock(
      { title: "Counterparty Workflow Questions - What is this page called?" },
      klass,
    );
    expect(block.startsWith(MARKER)).toBe(true);
    expect(block).toContain(
      "**Class:** question · **Area:** area/flow · **Surface:** counterparty stage screens",
    );
    expect(block).toContain("**Decision needed:** no");
    expect(block).toContain("**Proposed acceptance:** none — question only");
    expect(block).toContain(
      "**Original title:** Counterparty Workflow Questions - What is this page called?",
    );
    expect(block).toContain("the founder's text and screenshots above are untouched");
  });

  test("an unplaced issue still renders a block", () => {
    const block = composeBlock(
      { title: "T" },
      { ...klass, areaLabel: null, acceptance: acceptanceFor("needs-info", "not stated") },
    );
    expect(block).toContain("**Area:** unplaced");
  });
});

describe("the write path never guesses an identity and never removes a label", () => {
  test("gh-id.sh execs gh itself, so the argument list carries no second `gh`", () => {
    const args = triageGhArgs(["issue", "edit", "1363", "--add-label", "question"]);
    expect(args[0]).toBe("app");
    expect(args).not.toContain("gh");
    expect(args).toEqual(["app", "issue", "edit", "1363", "--add-label", "question"]);
  });

  test("an ambient GH_TOKEN is never inherited by a gh call", () => {
    const env = ghEnv({
      GH_TOKEN: "leak",
      GITHUB_TOKEN: "leak",
      GITHUB_ENTERPRISE_TOKEN: "leak",
      PATH: "/bin",
    });
    expect(env).toEqual({ PATH: "/bin" });
  });

  test("writesFor adds labels, names a milestone only when there is one, and rewrites only a changed title", () => {
    const row = {
      number: 1363,
      repo: "riolabs-ai/alignsynch",
      originalTitle: "Initiator Workflow Questions - Note: Some Aspects Need To Specify the Party.",
      proposedTitle: "area/flow: Note: Some Aspects Need To Specify the Party.",
      titleChanged: true,
      labels: ["area/flow", "question"],
      class: "question",
      areaLabel: "area/flow",
      surface: "initiator stage screens",
      decisionNeeded: false,
      acceptance: "none — question only",
    };
    const { block, args } = writesFor(row, "v2.2.0 — the member surface");
    expect(args).toContain("--add-label");
    expect(args.join(" ")).not.toContain("--remove-label");
    expect(args.join(" ")).not.toContain("--close");
    expect(args.join(" ")).not.toContain("close");
    expect(args.slice(args.indexOf("--milestone"), args.indexOf("--milestone") + 2)).toEqual([
      "--milestone",
      "v2.2.0 — the member surface",
    ]);
    expect(args[args.indexOf("--title") + 1]).toBe(row.proposedTitle);
    expect(block).toContain(`**Original title:** ${row.originalTitle}`);

    const untitled = writesFor({ ...row, titleChanged: false, labels: ["needs-info"] }, null);
    expect(untitled.args).not.toContain("--title");
    expect(untitled.args).not.toContain("--milestone");
  });

  test("the write identity is proved through the wrapper, never through `GET /user`", () => {
    // A GitHub App installation token is answered 403 by /user, so a `gh api user` probe reports a
    // missing credential for one that works. The login comes from the wrapper; the token is then
    // proved with a repo-scoped read.
    const dir = mkdtempSync(join(tmpdir(), "triage-identity-"));
    const log = join(dir, "gh.log");
    const gh = join(dir, "gh");
    writeFileSync(
      gh,
      `#!/usr/bin/env bash\nprintf 'gh %s\\n' "$*" >> "$TRIAGE_LOG"\nif [ "$1" = "api" ] && [ "$2" = "user" ]; then exit 1; fi\nexit 0\n`,
    );
    chmodSync(gh, 0o755);
    const wrapper = join(dir, "gh-id.sh");
    writeFileSync(
      wrapper,
      `#!/usr/bin/env bash\nprintf 'gh-id %s\\n' "$*" >> "$TRIAGE_LOG"\nif [ "$1" = "app" ] && [ "$2" = "--whoami" ]; then echo 'alignsynch-fleet[bot]'; exit 0; fi\nshift\nexec gh "$@"\n`,
    );
    chmodSync(wrapper, 0o755);
    writeFileSync(log, "");
    vi.stubEnv("TRIAGE_LOG", log);
    vi.stubEnv("GH_ID", wrapper);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);

    expect(assertWriteIdentity("riolabs-ai/alignsynch")).toBe("alignsynch-fleet[bot]");

    const calls = readFileSync(log, "utf8").trim().split("\n");
    expect(calls).toContain("gh-id app --whoami");
    expect(calls).toContain("gh api repos/riolabs-ai/alignsynch --jq .full_name");
    expect(calls.join("\n")).not.toContain("api user");
  });

  test("an unresolvable identity throws before anything is written", () => {
    const dir = mkdtempSync(join(tmpdir(), "triage-identity-"));
    const wrapper = join(dir, "gh-id.sh");
    writeFileSync(wrapper, "#!/usr/bin/env bash\necho 'gh-id: refusing mode' >&2\nexit 78\n");
    chmodSync(wrapper, 0o755);
    vi.stubEnv("GH_ID", wrapper);

    expect(() => assertWriteIdentity("riolabs-ai/alignsynch")).toThrow(/--whoami failed/);
  });
});

describe("selection and re-triage", () => {
  const marked = {
    updatedAt: "2026-11-23T09:00:00Z",
    comments: [{ body: `${MARKER}\nTriaged: …`, createdAt: "2026-11-23T08:59:00Z" }],
  };

  test("no marker → due", () => {
    expect(shouldTriage({ updatedAt: "2026-11-23T09:00:00Z", comments: [] }, null)).toBe(true);
  });

  test("a marker written a second after the edit is not a re-triage", () => {
    // The write that adds the marker also bumps `updatedAt`; that is the ordering the grace covers.
    expect(shouldTriage(marked, "2026-11-23T08:59:00Z")).toBe(false);
    expect(shouldTriage({ updatedAt: "2026-11-23T08:59:30Z" }, "2026-11-23T08:59:00Z")).toBe(false);
  });

  test("an edit later than the marker is", () => {
    expect(shouldTriage({ updatedAt: "2026-11-24T09:00:00Z" }, "2026-11-23T08:59:00Z")).toBe(true);
    expect(MARKER_GRACE_MS).toBe(60_000);
  });
});

describe("the plan over the founder's twelve", () => {
  /** The twelve as their titles read on the repo; bodies are the phrases that decide them. */
  const twelve = [
    issue(
      1354,
      "Counterparty Workflow Questions - How do they get back without account?",
      "I went thru the Counterparty onboarding. My only way back is the link in email, right?",
    ),
    issue(
      1355,
      "Counterparty Workflow Questions - Changeable Opinion/Answers",
      "At various stages the Opinions/Answers are not changeable. Why would we not?",
    ),
    issue(
      1356,
      "Counterparty Workflow Questions - What is this page called?",
      "What is this page called?",
    ),
    issue(
      1357,
      "Counterparty Workflow Questions - What is this page called?",
      "What is this page called?",
    ),
    issue(
      1358,
      'Counterparty Workflow Questions - "Continue Assessment"',
      "It is paused, but offers Continue Assessment. The button should be greyed out, right?",
    ),
    issue(
      1359,
      "Initiator Workflow Questions - Is this page identical if I am a visitor?",
      "Is this page identical if I am a visitor?",
    ),
    issue(
      1360,
      "Initiator Workflow Questions - Name Choices",
      "Do I really get a choice on my name?",
    ),
    issue(
      1361,
      "Initiator Workflow Questions - Aspect Title",
      "If it is not editable, why let me try?",
    ),
    issue(
      1362,
      "Initiator Workflow Questions - 4 Key Questions",
      "Not a question, but a required change. Extremely key.",
    ),
    issue(
      1363,
      "Initiator Workflow Questions - Note: Some Aspects Need To Specify the Party.",
      "Which party are we talking about? How would you answer?",
    ),
    issue(
      1364,
      "APP-02 Prod Website App has a Button To Take You to Demo Website",
      "Completed Demo Relationships.",
    ),
    issue(1365, "Pricing Choices Reduced to 1", "One plan. Was that a decision to keep it simple?"),
  ];

  const plan = buildPlan(twelve, {
    milestones: [
      { number: 25, title: "v2.deferred" },
      { number: 32, title: "v2.2.0 — the member surface" },
    ],
    knownLabels: [
      "area/billing",
      "area/flow",
      "area/ui",
      "area/product",
      "question",
      "enhancement",
      "bug",
      "needs-info",
      "needs-decision",
      "parked",
    ],
  });

  test("all twelve are selected, and the plan writes nothing", () => {
    expect(plan.issues).toHaveLength(12);
    expect(plan.writes).toBe(0);
    expect(plan.issues.map((row) => row.number)).toEqual(twelve.map((row) => row.number));
  });

  test("every row carries a class, a label set, a milestone or null, and a proposed title", () => {
    for (const row of plan.issues) {
      expect(row.class).toBeTruthy();
      expect(row.labels.length).toBeGreaterThan(0);
      expect(row.proposedTitle).toMatch(/^(area\/[a-z]+|needs-info): /);
      expect([null, 32, 25]).toContain(row.milestone);
    }
  });

  test("the two identical titles are named as duplicates and numbered apart", () => {
    expect(plan.duplicates.map((pair) => [pair.of, pair.issue])).toEqual([[1356, 1357]]);
    const row = plan.issues.filter((candidate) => candidate.number === 1357)[0];
    expect(row.duplicateOf).toContain(1356);
    expect(row.proposedTitle.endsWith("(1357)")).toBe(true);
  });

  test("the pricing issue is the one that asks the owner to decide", () => {
    const billing = plan.issues.filter((row) => row.number === 1365)[0];
    expect(billing.area).toBe("billing");
    expect(billing.labels).toContain("needs-decision");
    expect(billing.milestoneTitle).toBe("v2.2.0 — the member surface");
    expect(plan.issues.filter((row) => row.decisionNeeded).map((row) => row.number)).toEqual([
      1365,
    ]);
  });

  test("the table prints one row per issue and names the ledger action", () => {
    const table = planTable(plan.issues);
    expect(table.split("\n")).toHaveLength(14); // header, rule, twelve rows
    expect(table).toContain("1354");
    expect(plan.ledger.rows).toBe(12);
    expect(plan.ledger.action).toBe("create");
  });
});

/**
 * The destination is a *title*, never a number.
 *
 * The re-pool of 2026-11-26 closed milestone #28 and moved the founder flow into a freshly numbered
 * pool, and a table carrying `milestone: 28` stopped the whole workflow dead. These cases pin the
 * replacement: a title-prefix handle resolves against whatever open milestones the repo has, and a
 * missing pool is a refusal that names itself and prints what it saw — never an invented number.
 */
describe("the destination pool is resolved by title, not by number", () => {
  const open = [
    { number: 25, title: "v2.deferred" },
    { number: 32, title: "v2.2.0 — the member surface" },
    { number: 35, title: "v2.0.0 — the acceptance certificate" },
  ];

  const labels = [
    "area/billing",
    "area/flow",
    "question",
    "enhancement",
    "bug",
    "needs-decision",
    "parked",
  ];

  test("the table and PARKED_MILESTONE carry title handles, not milestone numbers", () => {
    for (const row of AREA_TABLE) expect(typeof row.milestone).toBe("string");
    expect(typeof PARKED_MILESTONE).toBe("string");
    expect(DESTINATION_MILESTONE).toBe("v2.2.0");
    expect(PARKED_MILESTONE).toBe("v2.deferred");
  });

  test("a handle resolves to whatever number the pool currently has", () => {
    expect(resolveMilestone("v2.2.0", open)).toEqual({
      number: 32,
      title: "v2.2.0 — the member surface",
    });
    // The same pool, renumbered by a later re-pool, still resolves — the number is not the handle.
    expect(
      resolveMilestone("v2.2.0", [{ number: 61, title: "v2.2.0 — the member surface" }]),
    ).toEqual({ number: 61, title: "v2.2.0 — the member surface" });
    expect(resolveMilestone("v2.deferred", [{ number: 77, title: "v2.deferred" }])).toEqual({
      number: 77,
      title: "v2.deferred",
    });
  });

  test("a handle never matches a longer version token, and a missing pool resolves to null", () => {
    expect(titleHasHandle("v2.2.01 — a later pool", "v2.2.0")).toBe(false);
    expect(titleHasHandle("v2.2.0 — the member surface", "v2.2.0")).toBe(true);
    expect(resolveMilestone("v2.2.0", [{ number: 1, title: "v2.2.01 — a later pool" }])).toBeNull();
    expect(resolveMilestone("v2.2.0", [])).toBeNull();
  });

  test("with no v2.2.0 pool the run fails by name and lists the milestones it saw", () => {
    // The pool that a re-pool closed is gone; what remains is the parked pool.
    const seen = [{ number: 25, title: "v2.deferred" }];
    const plan = buildPlan([issue(1400, "The stage modal is broken", "It is broken.")], {
      milestones: seen,
      knownLabels: labels,
    });
    expect(plan.issues[0].milestoneHandle).toBe("v2.2.0");
    expect(plan.issues[0].milestone).toBeNull();
    expect(() => assertMilestonesOpen(plan.issues, "riolabs-ai/alignsynch-web", seen)).toThrow(
      'milestone "v2.2.0" is not open on riolabs-ai/alignsynch-web — refusing to invent it',
    );
    expect(() => assertMilestonesOpen(plan.issues, "riolabs-ai/alignsynch-web", seen)).toThrow(
      "open milestones: v2.deferred (#25)",
    );
  });

  test("with the pool present the same issue lands there, at the number it carries", () => {
    const plan = buildPlan([issue(1400, "The stage modal is broken", "It is broken.")], {
      milestones: [{ number: 61, title: "v2.2.0 — the member surface" }],
      knownLabels: labels,
    });
    expect(() =>
      assertMilestonesOpen(plan.issues, "riolabs-ai/alignsynch-web", [
        { number: 61, title: "v2.2.0 — the member surface" },
      ]),
    ).not.toThrow();
    expect(plan.issues[0].milestone).toBe(61);
    expect(plan.issues[0].milestoneTitle).toBe("v2.2.0 — the member surface");
  });

  test("a parked issue lands in v2.deferred by title, and only when that pool is open", () => {
    const parked = issue(1401, "Aspects we should do later", "Nice to have: aspects.");
    const withParked = buildPlan([parked], { milestones: open, knownLabels: labels });
    expect(withParked.issues[0].milestoneHandle).toBe("v2.deferred");
    expect(withParked.issues[0].milestone).toBe(25);
    expect(withParked.issues[0].milestoneTitle).toBe("v2.deferred");

    const withoutParked = buildPlan([parked], {
      milestones: [{ number: 32, title: "v2.2.0 — the member surface" }],
      knownLabels: labels,
    });
    expect(() =>
      assertMilestonesOpen(withoutParked.issues, "riolabs-ai/alignsynch-web", [
        { number: 32, title: "v2.2.0 — the member surface" },
      ]),
    ).toThrow('milestone "v2.deferred" is not open');
  });

  test("an issue with no milestone at all is not a refusal", () => {
    // needs-info carries no handle, so a repo with no pools open still plans it — and writes none.
    const plan = buildPlan(
      [issue(1402, "APP-02 button to the demo site", "Completed Demo Relationships.")],
      { milestones: [], knownLabels: ["area/flow", "needs-info"] },
    );
    expect(plan.issues[0].milestone).toBeNull();
    expect(plan.issues[0].milestoneHandle).toBeNull();
    expect(() => assertMilestonesOpen(plan.issues, "riolabs-ai/alignsynch-web", [])).not.toThrow();
  });
});

describe("surface and acceptance are derived, never invented", () => {
  test("a real route in the text wins over any keyword", () => {
    expect(
      surfaceFor(
        "https://alignsynch.com/assessment/instances/5fdff17a-4d3a-4003-87f8-94c0fd1c4689/accept",
      ),
    ).toBe("/assessment/instances/[id]/accept");
  });

  test("then the founder's own noun, then `not stated`", () => {
    expect(surfaceFor("The pricing page says one plan")).toBe("/pricing");
    expect(surfaceFor("Counterparty onboarding")).toBe("counterparty stage screens");
    expect(surfaceFor("APP-02 button")).toBe("not stated");
  });

  test("a question proposes no acceptance line", () => {
    expect(acceptanceFor("question", "not stated")).toBe("none — question only");
    expect(acceptanceFor("bug", "/pricing")).toContain("/pricing");
  });

  test("the founder logins default to the one founder, and can be widened", () => {
    expect(FOUNDER_LOGINS).toEqual(["WaltJohnsonIII"]);
  });
});

/**
 * The write path, end to end, against a stub `gh` and a stub `gh-id.sh`.
 *
 * This is the proof that needs no credential: the wrapper stub mirrors the real one exactly — log the
 * arguments, `shift` the mode, `exec gh "$@"` — so an argument list that carried a second `gh` would
 * show up here as `gh-id app gh issue edit …` and then as gh receiving `gh` as its first word. What it
 * establishes is the composition: read the body, compose the append, remember the file, post it, then
 * comment with the marker — and every write routed through the wrapper, never through `gh` directly.
 */
describe("applyRow, driven against a stub gh and a stub gh-id.sh", () => {
  const original =
    '# The founder\'s words\n\n<img width="703" alt="image" src="https://github.com/user-attachments/assets/abc" />\n\nWhich party are we talking about?\n';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubs() {
    const dir = mkdtempSync(join(tmpdir(), "triage-stub-"));
    const log = join(dir, "gh.log");
    const view = join(dir, "view.json");

    const gh = join(dir, "gh");
    writeFileSync(
      gh,
      `#!/usr/bin/env bash\nprintf 'gh %s\\n' "$*" >> "$TRIAGE_LOG"\nif [ "$1" = "issue" ] && [ "$2" = "view" ]; then cat "$TRIAGE_VIEW"; fi\nexit 0\n`,
    );
    chmodSync(gh, 0o755);

    const wrapper = join(dir, "gh-id.sh");
    writeFileSync(
      wrapper,
      `#!/usr/bin/env bash\nprintf 'gh-id %s\\n' "$*" >> "$TRIAGE_LOG"\nshift\nexec gh "$@"\n`,
    );
    chmodSync(wrapper, 0o755);

    writeFileSync(
      view,
      JSON.stringify({ body: original, title: "Initiator Workflow Questions - Party" }),
    );
    writeFileSync(log, "");
    vi.stubEnv("TRIAGE_LOG", log);
    vi.stubEnv("TRIAGE_VIEW", view);
    vi.stubEnv("GH_ID", wrapper);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    return { dir, log };
  }

  test("it appends to the live body, then comments, and every write goes through the wrapper", () => {
    const { log } = stubs();
    const row = {
      number: 1363,
      repo: "riolabs-ai/alignsynch",
      originalTitle: "Initiator Workflow Questions - Party",
      proposedTitle: "area/flow: Party",
      titleChanged: true,
      labels: ["area/flow", "question"],
      class: "question",
      areaLabel: "area/flow",
      surface: "initiator stage screens",
      decisionNeeded: false,
      acceptance: "none — question only",
      bodySeen: original,
      milestoneTitle: null,
    };

    const result = applyRow(row, { milestoneTitle: "v2.2.0 — the member surface" });
    expect(result.ok).toBe(true);

    const calls = readFileSync(log, "utf8").trim().split("\n");
    // Three gh invocations, five lines: the wrapper logs its own arguments and then `exec gh`, so each
    // write appears twice — once as `gh-id app …` and once as the `gh …` it replaced itself with.
    expect(calls).toHaveLength(5);
    expect(calls[0]).toMatch(/^gh issue view 1363 /);
    const wrapperCalls = calls.filter((line) => line.startsWith("gh-id "));
    expect(wrapperCalls).toHaveLength(2);
    expect(wrapperCalls[0]).toMatch(/^gh-id app issue edit 1363 /);
    expect(wrapperCalls[1]).toMatch(/^gh-id app issue comment 1363 /);
    // What gh itself received carries no mode word: the wrapper consumed it before exec.
    expect(calls[2]).toMatch(/^gh issue edit 1363 /);
    expect(calls[4]).toMatch(/^gh issue comment 1363 /);

    const edit = wrapperCalls[0];
    // The wrapper is exec'd with gh's own args: a second `gh` here would be gh's first positional word.
    expect(calls.join("\n")).not.toContain("gh-id app gh ");
    expect(edit).not.toContain("--remove-label");
    expect(edit).toContain("--add-label area/flow --add-label question");
    expect(edit).toContain("--milestone v2.2.0 — the member surface");

    const bodyFile = /--body-file (\S+)/.exec(edit)?.[1] ?? "";
    const written = readFileSync(bodyFile, "utf8");
    expect(Buffer.from(written.slice(0, original.length), "utf8")).toEqual(
      Buffer.from(original, "utf8"),
    );
    expect(written.slice(original.length).startsWith(BODY_SEPARATOR)).toBe(true);
    expect(written).toContain("**Original title:** Initiator Workflow Questions - Party");

    const commentFile = /--body-file (\S+)/.exec(wrapperCalls[1])?.[1] ?? "";
    expect(readFileSync(commentFile, "utf8")).toContain(MARKER);
  });

  test("a body that moved since the plan was built is refused, and nothing is written", () => {
    const { log } = stubs();
    const row = {
      number: 1363,
      repo: "riolabs-ai/alignsynch",
      originalTitle: "Initiator Workflow Questions - Party",
      proposedTitle: "area/flow: Party",
      titleChanged: true,
      labels: ["area/flow", "question"],
      class: "question",
      areaLabel: "area/flow",
      surface: "initiator stage screens",
      decisionNeeded: false,
      acceptance: "none — question only",
      bodySeen: "the body the plan was built from, which is not what the issue says now",
    };

    const result = applyRow(row, { milestoneTitle: null });
    expect(result).toMatchObject({ number: 1363, ok: false });
    expect(String(result.reason)).toMatch(/body changed since the plan/);
    // One read and nothing else: a refused row is a row nobody wrote.
    expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
  });
});

/**
 * The whole CLI, `--apply`, against a stubbed `gh` and a stubbed `gh-id.sh`.
 *
 * The unit cases above prove the pieces; this proves the wiring the card actually asked for — the
 * CLI fetches the open milestones, resolves `v2.2.0` and `v2.deferred` **by title**, and the write
 * that lands carries the pool's own title (which is what `gh issue edit --milestone` takes). No
 * network, no token, no founder issue touched.
 */
describe("the CLI applies by title, through a stubbed gh", () => {
  const LABELS = ["area/flow", "bug", "enhancement", "parked", "needs-info"];

  function issueRow(number: number, title: string, body: string): Record<string, unknown> {
    return {
      number,
      title,
      body,
      author: { login: "WaltJohnsonIII" },
      state: "OPEN",
      updatedAt: "2026-11-27T08:00:00Z",
      labels: [],
      milestone: null,
      comments: [],
      url: `https://github.com/riolabs-ai/alignsynch/issues/${number}`,
    };
  }

  const rows = [
    issueRow(1400, "The stage modal is broken", "It is broken when I open the stage screen."),
    issueRow(1401, "Aspects we should do later", "Nice to have: aspects in the editor."),
  ];

  const OPEN_MILESTONES = [
    { number: 25, title: "v2.deferred" },
    { number: 32, title: "v2.2.0 — the member surface" },
  ];

  function runCli(repo: string, milestones = OPEN_MILESTONES) {
    const dir = mkdtempSync(join(tmpdir(), "triage-cli-"));
    const fixtures = join(dir, "fixtures");
    mkdirSync(fixtures);
    const log = join(dir, "gh.log");

    writeFileSync(join(fixtures, "milestones.json"), JSON.stringify(milestones));
    writeFileSync(join(fixtures, "labels.json"), JSON.stringify(LABELS.map((name) => ({ name }))));
    writeFileSync(join(fixtures, "issues.json"), JSON.stringify(rows));
    for (const row of rows) {
      writeFileSync(
        join(fixtures, `view-${row.number}.json`),
        JSON.stringify({ body: row.body, title: row.title }),
      );
    }

    const gh = join(dir, "gh");
    writeFileSync(
      gh,
      `#!/usr/bin/env bash
printf 'gh %s\\n' "$*" >> "$TRIAGE_LOG"
case "$1" in
  api)
    case "$2" in
      *milestones*) cat "$TRIAGE_FIXTURES/milestones.json" ;;
      *) printf '"owner/repo"\\n' ;;
    esac
    ;;
  label) cat "$TRIAGE_FIXTURES/labels.json" ;;
  issue)
    case "$2" in
      list)
        case "$*" in
          *in:title*) printf '[]\\n' ;;
          *) cat "$TRIAGE_FIXTURES/issues.json" ;;
        esac
        ;;
      view) cat "$TRIAGE_FIXTURES/view-$3.json" ;;
    esac
    ;;
esac
exit 0
`,
    );
    chmodSync(gh, 0o755);

    const wrapper = join(dir, "gh-id.sh");
    writeFileSync(
      wrapper,
      `#!/usr/bin/env bash
printf 'gh-id %s\\n' "$*" >> "$TRIAGE_LOG"
if [ "$1" = "app" ] && [ "$2" = "--whoami" ]; then echo 'alignsynch-fleet[bot]'; exit 0; fi
shift
exec gh "$@"
`,
    );
    chmodSync(wrapper, 0o755);
    writeFileSync(log, "");

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/triage-founder-issues.mjs"), "--apply", "--repo", repo],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ""}`,
          TRIAGE_LOG: log,
          TRIAGE_FIXTURES: fixtures,
          GH_ID: wrapper,
        },
      },
    );
    return { result, calls: readFileSync(log, "utf8").trim().split("\n") };
  }

  test("--apply lands a founder issue in v2.2.0 and a parked one in v2.deferred, by title", () => {
    const { result, calls } = runCli("riolabs-ai/alignsynch-web");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied 2 of 2 on riolabs-ai/alignsynch-web: #1400, #1401");

    const edits = calls.filter((line) => /^gh-id app issue edit \d+ /.test(line));
    expect(edits).toHaveLength(2);

    const live = edits.find((line) => line.startsWith("gh-id app issue edit 1400 ")) ?? "";
    expect(live).toContain("--milestone v2.2.0 — the member surface");
    expect(live).toContain("--add-label area/flow --add-label bug");
    expect(live).toContain("--title area/flow: The stage modal is broken");
    // The prefix is not stacked: the claim is the founder's, once.
    expect(live).not.toContain("area/flow: area/flow:");

    const parked = edits.find((line) => line.startsWith("gh-id app issue edit 1401 ")) ?? "";
    expect(parked).toContain("--milestone v2.deferred");
    expect(parked).toContain("--add-label parked");

    // Every write goes through the wrapper: `gh-id app gh …` would be gh's help text, not a write.
    expect(calls.join("\n")).not.toContain("gh-id app gh ");
  });

  test("a repo whose v2.2.0 pool is gone refuses by name, exits 1, and writes nothing", () => {
    // Same CLI, same stubs, only the milestone list differs: the pool the table routes into is closed.
    const { result, calls } = runCli("riolabs-ai/alignsynch-web", [
      { number: 25, title: "v2.deferred" },
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'milestone "v2.2.0" is not open on riolabs-ai/alignsynch-web — refusing to invent it',
    );
    expect(result.stderr).toContain("open milestones: v2.deferred (#25)");
    expect(calls.filter((line) => line.startsWith("gh-id app issue edit"))).toHaveLength(0);
  });
});
