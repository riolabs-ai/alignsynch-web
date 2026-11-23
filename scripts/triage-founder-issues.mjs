#!/usr/bin/env node
/**
 * `pnpm triage:founder` — classify the founder's freeform issues, deterministically.
 *
 * WHY THIS EXISTS
 * Twelve issues (#1354–#1365) arrived as a title, a paragraph and a pasted screenshot: no label, no
 * milestone, no acceptance criteria, and two of them carrying the same title. `.github/workflows/
 * issue-intake.yml` labels *new* freeform issues `draft`; it deliberately classifies no further and
 * never edits an issue that already exists. This script is the other half — the repair pass — and it
 * runs on the twelve that were already filed as well as on anything that lands `draft` later.
 *
 * **No model, no network call outside `gh`.** A classifier that phones a model is a classifier that
 * answers differently on Tuesday, and this one writes to someone else's issue. Every decision below
 * is a table read in a fixed order: same input, same output, every run. The tables are ordered and
 * exported so `tests/founder-triage.test.ts` can assert the order rather than the current answers.
 *
 * TWO IDENTITIES, AND ONLY ONE OF THEM WRITES
 * Reads go through the ambient `gh` session with `GH_TOKEN`/`GITHUB_TOKEN` *removed* from the
 * environment (`ghEnv`), so an ambient token can never decide who this runs as. Writes go through
 * `~/.hermes/profiles/alignsynch/bin/gh-id.sh bot …`, i.e. the `alignsynch` account — never
 * `jadenblack`, whose PRs and comments must stay distinguishable from the project's own.
 *
 * **`gh-id.sh` execs `gh` itself.** The wrapper resolves the token for one call and *replaces itself*
 * with `gh`, so the correct argument list is `gh-id.sh bot issue edit …`. Writing `gh-id.sh bot gh
 * issue edit …` runs `gh gh issue edit`, which prints gh's help text and exits 0 — it looks like a
 * successful write and files nothing. `triageGhArgs` is therefore a one-line function with a test
 * asserting `"gh"` never appears in its output.
 *
 * WHAT IT WILL NEVER DO
 * There is no `close`, no `delete`, no `lock` and no `--remove-label` anywhere in this file. A founder's
 * sentence, title and screenshot markdown are append-only: the body this writes is
 * `original + separator + block`, composed by `composeBody`, which throws rather than write a body
 * that does not start with the original byte-for-byte. The original title is preserved verbatim in
 * the appended block, because the title *is* rewritten (`area/<x>: <claim>`) and a rewrite that loses
 * the founder's words is a rewrite nobody can audit.
 *
 * MODES
 *   node scripts/triage-founder-issues.mjs                  plan for every founder issue (dry run)
 *   node scripts/triage-founder-issues.mjs --json           the same plan as JSON
 *   node scripts/triage-founder-issues.mjs --issue 1363     scoped to one issue
 *   node scripts/triage-founder-issues.mjs --apply          write it
 *
 * `--dry-run` is the default and the only mode that works with no write credential at all.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/* ------------------------------------------------------------------------------------------------
 * Constants — every one of these is an input to the classifier, and none is read from the network.
 * ---------------------------------------------------------------------------------------------- */

/** The rail the appended block carries. Selection reads it; nothing else can mark an issue triaged. */
export const MARKER = "<!-- hermes-triage:v1 -->";

/** Appended between the founder's text and the block. Two newlines either side, one rule. */
export const BODY_SEPARATOR = "\n\n---\n\n";

/** Who counts as a founder. `FOUNDER_LOGINS=logina,loginb` overrides it for a second voice. */
export const FOUNDER_LOGINS = String(process.env.FOUNDER_LOGINS ?? "WaltJohnsonIII")
  .split(",")
  .map((login) => login.trim())
  .filter((login) => login !== "");

/** The ledger: one standing issue, regenerated in place. Both values already exist on the repo. */
export const LEDGER_TITLE = "Founder issue ledger";
export const LEDGER_LABEL = "standing";

/**
 * The area table, **ordered, first match wins**. Billing before flow because "the plan price on the
 * stage screen" is a billing issue; flow before UI because "the stage modal" is about the stage; UI
 * before product because "the label on the colour picker" is a visual defect.
 *
 * `keywords` are matched as whole words (`wholeWord`) on the title and body, so `plan` does not fire
 * on `explain` and `name` does not fire on `namesake`.
 *
 * The flow row carries the product's own model nouns (`assessment`, `relationship`, `session`,
 * `party`, `opinion`, `answer`) beside the card's six. That is not a widening of the rule for
 * convenience: without them seven of the twelve classify `needs-info` on issues whose body is a
 * screenshot of a flow screen, which is the tool failing rather than an honest miss.
 */
export const AREA_TABLE = [
  {
    area: "billing",
    milestone: 28,
    keywords: ["pricing", "plan", "billing", "checkout", "stripe"],
  },
  {
    area: "flow",
    milestone: 28,
    keywords: [
      "aspect",
      "aspects",
      "initiator",
      "counterparty",
      "stage",
      "invite",
      "workflow",
      "assessment",
      "relationship",
      "relationships",
      "session",
      "party",
      "opinion",
      "opinions",
      "answer",
      "answers",
    ],
  },
  {
    area: "ui",
    milestone: 28,
    keywords: ["color", "colour", "font", "layout", "spacing", "modal", "appearance"],
  },
  {
    area: "product",
    milestone: 28,
    keywords: ["copy", "wording", "name", "called", "label", "lexicon"],
  },
];

/** A parked issue is deferred, not classified elsewhere: the row adds the label and moves the milestone. */
export const PARKED_TERMS = ["later", "not now", "someday", "nice to have"];
export const PARKED_MILESTONE = 25;

/**
 * Class rules, **ordered, first match wins**: a question phrased as a report is still a question, so
 * `?` is tested before `should`, and `should` before `broken`. The order is the point — every one of
 * the founder's twelve contains more than one signal.
 */
export const CLASS_RULES = [
  {
    class: "question",
    test: (text) => /\?/.test(text) || /^(how|what|why)\b/i.test(text.trim()),
  },
  {
    class: "enhancement",
    test: (text) => /\b(should|needs?|change|changes|reduce|add)\b/i.test(text),
  },
  {
    class: "bug",
    test: (text) => /\b(broken|wrong|errors?|doesn['’]t|does not)\b/i.test(text),
  },
];

/** No class label when nothing matches — `needs-info` is the honest miss, never a guess. */
export const UNCLASSIFIED = "needs-info";

/**
 * A *question* that asks the owner to rule on product direction also carries `needs-decision`.
 * Only questions qualify: "should this be greyed out?" is a defect report, "is that a decision to
 * keep it simple?" is a product call.
 */
export const DECISION_TERMS = [
  "should we",
  "do you want",
  "your call",
  "your decision",
  "you decide",
  "which do you prefer",
  "would you rather",
  "decision to",
  "is that ok",
  "ok with you",
  "want me to",
];

/**
 * Surface is a best guess at the page, or `not stated`. Routes first (a real path in the text beats
 * any keyword), then the screen the founder's own noun names.
 */
export const SURFACE_RULES = [
  {
    path: "/assessment/instances/",
    suffix: "/accept",
    surface: "/assessment/instances/[id]/accept",
  },
  { path: "/assessment/instances", surface: "/assessment/instances" },
  { pattern: /\bpricing\b/i, surface: "/pricing" },
  { pattern: /\bcounterparty\b/i, surface: "counterparty stage screens" },
  { pattern: /\binitiator\b/i, surface: "initiator stage screens" },
  { pattern: /\baspects?\b/i, surface: "aspect editor (stage 3)" },
];

/** The claim is cut at 72 characters on a word boundary — a title, not a paragraph. */
export const CLAIM_MAX = 72;

/** Two titles that normalise to ≥ this Jaccard overlap are named as possible duplicates. */
export const DUPLICATE_THRESHOLD = 0.7;

/**
 * A triage write bumps the issue's own `updatedAt` and then the marker comment's `createdAt` follows
 * within the same second, so a strict `updatedAt > markerAt` test would re-triage the issue forever.
 * One minute of grace is the smallest window that is honest about that ordering.
 */
export const MARKER_GRACE_MS = 60_000;

/** One line per class. `question` is the only one that proposes nothing. */
export const ACCEPTANCE = {
  question: "none — question only",
  enhancement: (surface) => `The requested change ships on ${surface} and nothing else moves.`,
  bug: (surface) => `The defect reproduces on ${surface} before the fix and is gone after it.`,
  [UNCLASSIFIED]: "none — triage needs the surface and the expected behaviour.",
};

/* ------------------------------------------------------------------------------------------------
 * Pure layer — every function below is a total function of its arguments. No I/O, no clock, no env.
 * ---------------------------------------------------------------------------------------------- */

/** `term` as a whole-word, case-insensitive matcher. `plan` must not fire on `explain`. */
export function wholeWord(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
}

/** True when any term in `terms` appears in `text` as a whole word. */
export function mentions(text, terms) {
  return terms.some((term) => wholeWord(term).test(text));
}

/**
 * The founder prefixes, stripped once. `Counterparty Workflow Questions - `, `Initiator Workflow
 * Questions - `, `Question:` and `Questions:` are the shapes the twelve actually carry; the prefix is
 * routing metadata, not the claim.
 *
 * Every word before the separator must be capitalised, because that is what makes a prefix a prefix:
 * a claim that merely contains the word "questions" (`The stage questions - answered`) is left alone.
 */
export function stripPrefixes(title) {
  return String(title ?? "")
    .replace(/^(?:[A-Z][\w'’-]*\s+){0,3}[Qq]uestions?\s*[-–—:]\s*/, "")
    .replace(/^\s*question:\s*/i, "");
}

/** Collapse every run of whitespace to one space and trim. */
export function collapse(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cut at `max` characters on a word boundary, never mid-word and never with an ellipsis (an ellipsis
 * would be a character the founder did not write, and this string is quoted back to them).
 */
export function cutToWidth(text, max = CLAIM_MAX) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const boundary = slice.lastIndexOf(" ");
  if (boundary > 0) return slice.slice(0, boundary).trimEnd();
  return text.slice(0, max).trimEnd();
}

/** title → claim: prefixes stripped, whitespace collapsed, cut at 72 on a word boundary. */
export function normaliseClaim(title) {
  return cutToWidth(collapse(stripPrefixes(title)));
}

/** `area/flow: What is this page called?` — the area slug is the label without its `area/` prefix. */
export function titleFor(area, claim) {
  return area === null || area === undefined
    ? `${UNCLASSIFIED}: ${claim}`
    : `area/${area}: ${claim}`;
}

/**
 * The class label from the ordered rules, or `UNCLASSIFIED` when no rule places it.
 * @param {string} text
 * @returns {string}
 */
export function classifyClass(text) {
  for (const rule of CLASS_RULES) {
    if (rule.test(text)) return rule.class;
  }
  return UNCLASSIFIED;
}

/**
 * The first area row that matches, or `null`. Returns the row, so the milestone travels with it.
 * @param {string} text
 * @returns {{area: string, milestone: number, keywords: string[]} | null}
 */
export function classifyArea(text) {
  for (const row of AREA_TABLE) {
    if (mentions(text, row.keywords)) return row;
  }
  return null;
}

/** Does the text name a deferred timeframe? `parked` is a modifier, not an area. */
export function isParked(text) {
  return mentions(text, PARKED_TERMS);
}

/** A question that asks the owner to rule on direction. Non-questions never carry `needs-decision`. */
export function needsDecision(text, klass) {
  return klass === "question" && DECISION_TERMS.some((term) => wholeWord(term).test(text));
}

/**
 * The best-guess surface for the block, or `not stated`.
 * @param {string} text
 * @returns {string}
 */
export function surfaceFor(text) {
  for (const rule of SURFACE_RULES) {
    if (rule.path !== undefined) {
      if (!text.includes(rule.path)) continue;
      if (rule.suffix !== undefined && !text.includes(rule.suffix)) continue;
      return rule.surface;
    }
    if (rule.pattern.test(text)) return rule.surface;
  }
  return "not stated";
}

/** Title tokens for the duplicate test: lowercased, punctuation dropped, empties removed. */
export function titleTokens(title) {
  return String(title ?? "")
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter((token) => token !== "");
}

/** Jaccard over two token sets. Both empty → 0, so "no title" never reads as "a duplicate". */
export function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * One issue's classification. `text` is the founder's own words: the original title **and** the body,
 * because the founder's body is where the nouns are and the title is where the routing prefix is.
 */
export function classifyIssue(issue) {
  const text = `${issue.title ?? ""}\n${issue.body ?? ""}`;
  const row = classifyArea(text);
  const klass = classifyClass(text);
  const parked = isParked(text);

  // Two independent placements. The area table and the class rules can each fail, and what we do
  // know is kept: an issue placed in an area but with no readable class still carries `area/flow`,
  // it just gets `needs-info` instead of a class label and **no milestone** — nothing downstream may
  // read a milestone that was guessed, and a milestone on a half-triaged issue reads as finished.
  const area = row === null ? null : row.area;
  const placed = row !== null && klass !== UNCLASSIFIED;
  const milestone = placed ? (parked ? PARKED_MILESTONE : row.milestone) : null;

  const labels = [];
  if (area !== null) labels.push(`area/${area}`);
  labels.push(klass === UNCLASSIFIED ? UNCLASSIFIED : klass);
  if (parked && placed) labels.push("parked");
  if (needsDecision(text, klass)) labels.push("needs-decision");

  return {
    class: klass,
    area,
    areaLabel: area === null ? null : `area/${area}`,
    parked,
    milestone,
    labels,
    decisionNeeded: needsDecision(text, klass),
    surface: surfaceFor(text),
    acceptance: acceptanceFor(klass, surfaceFor(text)),
  };
}

/** The proposed acceptance line for a class. */
export function acceptanceFor(klass, surface) {
  const make = ACCEPTANCE[klass] ?? ACCEPTANCE[UNCLASSIFIED];
  return typeof make === "function" ? make(surface) : make;
}

/**
 * The appended block. `originalTitle` is verbatim — the title is the one field this tool rewrites, so
 * the block is the only place the founder's own words survive on the issue.
 */
export function composeBlock(issue, klass) {
  return [
    MARKER,
    "## Triage",
    "",
    `**Class:** ${klass.class} · **Area:** ${klass.areaLabel ?? "unplaced"} · **Surface:** ${klass.surface}`,
    `**Decision needed:** ${klass.decisionNeeded ? "yes" : "no"}`,
    `**Proposed acceptance:** ${klass.acceptance}`,
    `**Original title:** ${issue.title ?? ""}`,
    "",
    "_Automated triage; the founder's text and screenshots above are untouched._",
  ].join("\n");
}

/**
 * `original + separator + block`, and the prefix is asserted **before** the string leaves this
 * function. Throwing here is the whole safety property: a body that does not start with the founder's
 * text is a body that rewrote it.
 */
export function composeBody(original, block) {
  const body = String(original ?? "");
  const composed = body + BODY_SEPARATOR + block;
  if (!composed.startsWith(body)) {
    throw new Error(
      "triage: refusing to write a body whose prefix is not the original, byte for byte",
    );
  }
  return composed;
}

/**
 * Is this issue due a (re-)triage? An issue with no marker is always due. An issue with a marker is
 * due only when someone edited it since — with `MARKER_GRACE_MS` of slack for the write that created
 * the marker, which bumps `updatedAt` at the same instant.
 */
export function shouldTriage(issue, markerAt) {
  if (!markerAt) return true;
  const updated = Date.parse(issue.updatedAt ?? "");
  const marked = Date.parse(markerAt);
  if (Number.isNaN(updated) || Number.isNaN(marked)) return true;
  return updated > marked + MARKER_GRACE_MS;
}

/** The newest marker timestamp among an issue's comments, or `null`. The body block carries no clock. */
export function markerAtOf(issue) {
  const stamps = (issue.comments ?? [])
    .filter((comment) => String(comment.body ?? "").includes(MARKER))
    .map((comment) => comment.createdAt)
    .filter(Boolean)
    .sort();
  return stamps.length === 0 ? null : stamps[stamps.length - 1];
}

/**
 * Duplicate pairs at or above the threshold, one row per pair, naming the *earlier* issue as the one
 * the later resembles. `duplicate` is applied to neither: naming a duplicate is a note for a human,
 * and a label would be the tool closing something the founder never had a chance to answer.
 */
export function duplicatePairs(rows) {
  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const score = jaccard(rows[i].tokens, rows[j].tokens);
      if (score >= DUPLICATE_THRESHOLD) {
        const [older, newer] =
          rows[i].number < rows[j].number ? [rows[i], rows[j]] : [rows[j], rows[i]];
        pairs.push({ of: older.number, issue: newer.number, score, claim: older.claim });
      }
    }
  }
  return pairs;
}

/** The duplicate comment body. Named, never closed. */
export function duplicateComment(pair, olderTitle) {
  const percent = Math.round(pair.score * 100);
  return [
    `Possible duplicate of #${pair.of} — both normalise to the claim “${pair.claim}” ` +
      `(${percent}% of title tokens in common with #${pair.of} “${olderTitle}”).`,
    "",
    "_Named by triage; never closed and never merged — the two may still be two different surfaces._",
  ].join("\n");
}

/** The triage comment body — the marker plus the one line a reader needs. */
export function triageComment(row, milestoneTitle) {
  const parts = [
    MARKER,
    `Triaged: \`${row.labels.join("`, `")}\`${
      row.milestone === null
        ? ", no milestone"
        : `, milestone ${milestoneTitle ?? `#${row.milestone}`}`
    }, title rewritten to \`${row.proposedTitle}\`.`,
    "",
    "_The founder's title is preserved verbatim in the block above; `--apply` appends and never rewrites._",
  ];
  return parts.join("\n");
}

/** The ledger's table, regenerated from every founder issue on each `--apply`. */
export function ledgerBody(rows, nowIso) {
  const lines = [
    MARKER,
    "# Founder issue ledger",
    "",
    `Every issue the founder has filed, regenerated by \`pnpm triage:founder --apply\`. ${rows.length} rows, ${nowIso}.`,
    "",
    "| # | Class | Area | Milestone | State | Triaged at |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of [...rows].sort((a, b) => a.number - b.number)) {
    const milestone = row.milestone === null ? "—" : `#${row.milestone}`;
    lines.push(
      `| #${row.number} | ${row.class} | ${row.area ?? "unplaced"} | ${milestone} | ${row.state ?? "open"} | ${
        row.triagedAt ?? "untriaged"
      } |`,
    );
  }
  lines.push(
    "",
    "_Generated; edit the issues, not this table. `Class` and `Area` come from the ordered table in_",
    "_`scripts/triage-founder-issues.mjs`, so a row that reads wrong is a row the table does not place._",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------------------------------------
 * Process layer — `gh`, identity, and the write path.
 * ---------------------------------------------------------------------------------------------- */

/** Where the per-call identity wrapper lives. One default, resolved per call so a test can stub it. */
export const DEFAULT_GH_ID = join(homedir(), ".hermes/profiles/alignsynch/bin/gh-id.sh");

/** The wrapper path in force: `GH_ID` when set, else the profile's own. */
export function ghIdPath(env = process.env) {
  return env.GH_ID ?? DEFAULT_GH_ID;
}

/**
 * The environment a `gh` call gets: everything except a token, so the identity is never inherited
 * from whatever spawned us. `--dry-run` therefore needs no token at all — only a logged-in `gh`.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, string | undefined>}
 */
export function ghEnv(env = process.env) {
  const out = { ...env };
  for (const name of [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GH_ENTERPRISE_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
  ]) {
    delete out[name];
  }
  return out;
}

/**
 * The argument list for a write: `gh-id.sh bot <gh args>`.
 *
 * **Not** `gh-id.sh bot gh <gh args>` — the wrapper `exec`s `gh` itself, so a second `gh` becomes gh's
 * first positional argument, prints help and exits 0. That mistake looks like a successful write.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
export function triageGhArgs(args) {
  return ["bot", ...args];
}

/** Run `gh` and return stdout, or throw with gh's own stderr. Reads never write. */
export function gh(args, { input } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: ghEnv(),
    timeout: 120_000,
    input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Run a *write* as the project's own account, through the per-call wrapper. */
export function ghWrite(args) {
  const result = spawnSync(ghIdPath(), triageGhArgs(args), {
    encoding: "utf8",
    env: ghEnv(),
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `gh-id.sh bot ${args.join(" ")} failed (exit ${result.status}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/**
 * The write identity, proved before the first write. `gh-id.sh` answers exit 78 when the vault has no
 * token for `bot`, and a batch pass that discovers that per-issue refuses twelve times and writes
 * nothing — which looks like twelve broken issues instead of one missing credential. So the identity
 * is resolved once, up front, and `--apply` stops before it touches anything if it cannot.
 * @returns {string} the login the write path resolves to, e.g. `alignsynch`
 */
export function assertWriteIdentity() {
  return ghWrite(["api", "user", "--jq", ".login"]).trim();
}

/** The repo this runs against: `--repo`, else `GH_REPO`, else the remote's slug. */
export function repoSlug(args = {}) {
  if (args.repo) return args.repo;
  if (process.env.GH_REPO) return process.env.GH_REPO;
  const url = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).stdout ?? "";
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/.exec(url.trim());
  if (!match) throw new Error("triage: cannot resolve the repository — pass --repo OWNER/REPO");
  return `${match[1]}/${match[2]}`;
}

const ISSUE_FIELDS = "number,title,body,author,state,updatedAt,labels,milestone,comments,url";

/** Every issue a founder filed, open or closed — the ledger needs the closed ones too. */
export function fetchFounderIssues(repo, logins = FOUNDER_LOGINS) {
  const seen = new Map();
  for (const login of logins) {
    const raw = gh([
      "issue",
      "list",
      "--repo",
      repo,
      "--author",
      login,
      "--state",
      "all",
      "--limit",
      "300",
      "--json",
      ISSUE_FIELDS,
    ]);
    for (const issue of JSON.parse(raw)) {
      if (issue.author?.login !== login) continue;
      // `gh` reports the GraphQL enum (`OPEN`), the plan and the ledger speak lower case.
      seen.set(issue.number, { ...issue, state: String(issue.state ?? "").toLowerCase() });
    }
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

/** The labels that exist on the repo. A label not in here is never applied — no invention. */
export function fetchLabels(repo) {
  const raw = gh(["label", "list", "--repo", repo, "--limit", "200", "--json", "name"]);
  return JSON.parse(raw).map((row) => row.name);
}

/** Open milestones by number, so a milestone in the table is resolved, never guessed. */
export function fetchMilestones(repo) {
  const raw = gh(["api", `repos/${repo}/milestones?state=open&per_page=100`]);
  const out = {};
  for (const row of JSON.parse(raw)) out[row.number] = row.title;
  return out;
}

/** The standing ledger issue, if the repo has one. */
export function fetchLedger(repo) {
  const raw = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--search",
    `"${LEDGER_TITLE}" in:title`,
    "--limit",
    "10",
    "--json",
    "number,title,state,body",
  ]);
  return JSON.parse(raw).find((issue) => issue.title === LEDGER_TITLE) ?? null;
}

/**
 * The whole plan, offline from the caller's point of view: read the issues, classify, pair the
 * duplicates, resolve titles. No write, no clock in the output (the plan must be diffable run to run).
 *
 * @param {any[]} issues
 * @param {{scope?: number[], milestones?: Record<number, string>, knownLabels?: string[], ledger?: any}} [options]
 */
export function buildPlan(
  issues,
  { scope = [], milestones = {}, knownLabels = [], ledger = null } = {},
) {
  const scoped =
    scope.length === 0 ? issues : issues.filter((issue) => scope.includes(issue.number));
  const open = scoped.filter((issue) => issue.state === "open");

  const skipped = [];
  const selected = [];
  for (const issue of open) {
    const markerAt = markerAtOf(issue);
    if (!shouldTriage(issue, markerAt)) {
      skipped.push({ number: issue.number, reason: `triaged at ${markerAt} and not edited since` });
      continue;
    }
    selected.push({ issue, markerAt });
  }

  const claims = selected.map(({ issue, markerAt }) => {
    const klass = classifyIssue(issue);
    const claim = normaliseClaim(issue.title);
    return {
      issue,
      markerAt,
      klass,
      claim,
      tokens: titleTokens(claim),
      proposedTitle: titleFor(klass.area, claim),
      titleChanged: titleFor(klass.area, claim) !== issue.title,
      state: issue.state,
      number: issue.number,
    };
  });

  // Two issues that normalise to the same claim each get their own number, so neither reads as a
  // second copy of the other. `(2)` is forbidden: it names a position nobody can look up.
  const byClaim = new Map();
  for (const row of claims) {
    const key = row.claim.toLowerCase();
    byClaim.set(key, [...(byClaim.get(key) ?? []), row.number]);
  }
  for (const row of claims) {
    const sharing = byClaim.get(row.claim.toLowerCase()) ?? [];
    if (sharing.length > 1) {
      row.proposedTitle = `${row.proposedTitle} (${row.number})`;
      row.titleChanged = row.proposedTitle !== row.issue.title;
    }
  }

  const pairs = duplicatePairs(claims);
  for (const row of claims) {
    const of = pairs.filter((pair) => pair.issue === row.number).map((pair) => pair.of);
    row.duplicateOf = pairs
      .filter((pair) => pair.issue === row.number || pair.of === row.number)
      .map((pair) => (pair.issue === row.number ? pair.of : pair.issue));
    row.duplicatesByPair = of;
  }

  const all = issues.map((issue) => {
    const known = claims.find((row) => row.number === issue.number);
    if (known) return known;
    const klass = classifyIssue(issue);
    return {
      issue,
      number: issue.number,
      klass,
      claim: normaliseClaim(issue.title),
      proposedTitle: issue.title,
      state: issue.state,
      triagedAt: markerAtOf(issue),
      duplicateOf: [],
    };
  });

  const rows = claims.map((row) => ({
    number: row.number,
    url: row.issue.url,
    state: row.state,
    originalTitle: row.issue.title,
    claim: row.claim,
    proposedTitle: row.proposedTitle,
    titleChanged: row.titleChanged,
    class: row.klass.class,
    area: row.klass.area,
    areaLabel: row.klass.areaLabel,
    surface: row.klass.surface,
    labels: row.klass.labels,
    milestone: row.klass.milestone,
    milestoneTitle: row.klass.milestone === null ? null : (milestones[row.klass.milestone] ?? null),
    decisionNeeded: row.klass.decisionNeeded,
    acceptance: row.klass.acceptance,
    parked: row.klass.parked,
    duplicateOf: row.duplicateOf,
    markerAt: row.markerAt,
    reTriage: row.markerAt !== null,
    comments: (row.issue.comments ?? []).length,
  }));

  const used = [...new Set(rows.flatMap((row) => row.labels))].sort();
  const unknown = used.filter((label) => !knownLabels.includes(label));

  const ledgerRows = all.map((row) => ({
    number: row.number,
    class: row.klass.class,
    area: row.klass.area,
    milestone: row.klass.milestone,
    state: row.state,
    triagedAt: row.triagedAt ?? (row.markerAt ? String(row.markerAt).slice(0, 10) : null),
  }));

  return {
    mode: "dry-run",
    scope: scope.length === 0 ? null : scope,
    founders: FOUNDER_LOGINS,
    marker: MARKER,
    identity: { read: "ambient gh session, GH_TOKEN removed", write: "gh-id.sh bot (alignsynch)" },
    selection: {
      considered: scoped.length,
      open: open.length,
      selected: rows.length,
      skipped,
    },
    milestones: Object.fromEntries(
      [...new Set(rows.map((row) => row.milestone).filter((n) => n !== null))].map((n) => [
        n,
        milestones[n] ?? null,
      ]),
    ),
    labels: { known: knownLabels.length, used, unknown },
    issues: rows,
    duplicates: pairs,
    ledger: {
      number: ledger?.number ?? null,
      title: LEDGER_TITLE,
      action: ledger === null ? "create" : "regenerate",
      rows: ledgerRows.length,
      entries: ledgerRows,
      body: ledgerBody(ledgerRows, "<apply-time>"),
    },
    writes: 0,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Output
 * ---------------------------------------------------------------------------------------------- */

/** The plan as a fixed-width table. Columns never move, so two runs diff cleanly. */
export function planTable(rows) {
  const header = ["#", "CLASS", "AREA", "MILESTONE", "LABELS", "PROPOSED TITLE"];
  const body = rows.map((row) => [
    `${row.number}`,
    row.class,
    row.area ?? "unplaced",
    row.milestone === null ? "—" : `#${row.milestone}`,
    row.labels.join(","),
    row.proposedTitle,
  ]);
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...body.map((line) => String(line[i]).length)),
  );
  const render = (line) =>
    line
      .map((cell, i) => String(cell).padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [render(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(render)].join(
    "\n",
  );
}

/* ------------------------------------------------------------------------------------------------
 * The write path. One issue, one read-back, one assertion, then `gh-id.sh bot`.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Compose the exact writes for one row. Pure, so a test can assert the argv without a network.
 * @param {any} row
 * @param {string | null} milestoneTitle
 * @returns {{block: string, args: string[]}}
 */
export function writesFor(row, milestoneTitle) {
  const block = composeBlock(
    { title: row.originalTitle },
    {
      class: row.class,
      areaLabel: row.areaLabel,
      surface: row.surface,
      decisionNeeded: row.decisionNeeded,
      acceptance: row.acceptance,
    },
  );
  const args = ["issue", "edit", `${row.number}`, "--repo", row.repo];
  for (const label of row.labels) args.push("--add-label", label);
  if (milestoneTitle) args.push("--milestone", milestoneTitle);
  if (row.titleChanged) args.push("--title", row.proposedTitle);
  return { block, args };
}

/**
 * Apply one row. The read-back is not paranoia: the plan was built from a fetch seconds ago, and a
 * body that moved in between would be clobbered by the append. A refused row is a row nobody wrote.
 */
export function applyRow(row, { milestoneTitle }) {
  const live = JSON.parse(
    gh(["issue", "view", `${row.number}`, "--repo", row.repo, "--json", "body,title"]),
  );
  const original = live.body ?? "";
  if (row.bodySeen !== undefined && original !== row.bodySeen) {
    return { number: row.number, ok: false, reason: "body changed since the plan was built" };
  }

  const { block, args } = writesFor(row, milestoneTitle);
  const composed = composeBody(original, block);

  const dir = mkdtempSync(join(tmpdir(), "triage-founder-"));
  const bodyFile = join(dir, `body-${row.number}.md`);
  writeFileSync(bodyFile, composed, "utf8");
  args.push("--body-file", bodyFile);
  ghWrite(args);

  const commentFile = join(dir, `comment-${row.number}.md`);
  writeFileSync(commentFile, triageComment(row, milestoneTitle), "utf8");
  ghWrite(["issue", "comment", `${row.number}`, "--repo", row.repo, "--body-file", commentFile]);

  return { number: row.number, ok: true, bodyFile };
}

/** Post the duplicate notes. Named, never closed, never labelled. */
export function applyDuplicates(pairs, rows, repo) {
  const byNumber = new Map(rows.map((row) => [row.number, row]));
  const posted = [];
  for (const pair of pairs) {
    const older = byNumber.get(pair.of);
    const newer = byNumber.get(pair.issue);
    if (!older || !newer) continue;
    const dir = mkdtempSync(join(tmpdir(), "triage-dup-"));
    const file = join(dir, `dup-${pair.issue}.md`);
    writeFileSync(file, duplicateComment(pair, older.originalTitle), "utf8");
    ghWrite(["issue", "comment", `${pair.issue}`, "--repo", repo, "--body-file", file]);
    posted.push(pair);
  }
  return posted;
}

/** Regenerate or create the standing ledger. It is our own issue: a rewrite in place is the point. */
export function applyLedger(ledger, rows, repo) {
  const dir = mkdtempSync(join(tmpdir(), "triage-ledger-"));
  const file = join(dir, "ledger.md");
  writeFileSync(file, ledgerBody(rows, new Date().toISOString().slice(0, 10)), "utf8");
  if (ledger.number === null) {
    return ghWrite([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      LEDGER_TITLE,
      "--label",
      LEDGER_LABEL,
      "--body-file",
      file,
    ]);
  }
  return ghWrite(["issue", "edit", `${ledger.number}`, "--repo", repo, "--body-file", file]);
}

/* ------------------------------------------------------------------------------------------------
 * CLI
 * ---------------------------------------------------------------------------------------------- */

/** `--flag value`, repeated flags, and the booleans this script takes. Nothing else is accepted. */
export function parseArgs(argv) {
  const args = { apply: false, json: false, issue: [], repo: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    /** The value of a flag that takes one, and the cursor past it. */
    const value = () => {
      i += 1;
      return argv[i];
    };
    switch (token) {
      case "--apply":
        args.apply = true;
        break;
      case "--dry-run":
        args.apply = false;
        break;
      case "--json":
        args.json = true;
        break;
      case "--issue":
        args.issue.push(Number(value()));
        break;
      case "--repo":
        args.repo = value();
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`triage: unknown argument '${token}' (see --help)`);
    }
  }
  if (args.issue.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error("triage: --issue takes an issue number");
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      `${[
        "pnpm triage:founder [--dry-run | --apply] [--issue N ...] [--json] [--repo OWNER/REPO]",
        "",
        "  --dry-run  (default) print the plan and the JSON plan; writes nothing, needs no token",
        "  --apply    write: labels, milestone, rewritten title, appended block, triage comment,",
        "             duplicate notes, and the standing ledger",
        "  --issue N  scope either mode to one issue (repeatable)",
        "  --json     print the plan as JSON instead of a table",
      ].join("\n")}\n`,
    );
    return 0;
  }

  const repo = repoSlug(args);
  const milestones = fetchMilestones(repo);
  const knownLabels = fetchLabels(repo);
  const ledger = fetchLedger(repo);
  const issues = fetchFounderIssues(repo);
  const plan = buildPlan(issues, { scope: args.issue, milestones, knownLabels, ledger });
  plan.repo = repo;
  plan.mode = args.apply ? "apply" : "dry-run";
  for (const row of plan.issues) {
    row.repo = repo;
    row.bodySeen = issues.find((issue) => issue.number === row.number)?.body ?? "";
  }

  if (plan.labels.unknown.length > 0) {
    throw new Error(
      `triage: the table names labels this repo does not carry: ${plan.labels.unknown.join(", ")}`,
    );
  }
  const missing = plan.issues.filter(
    (row) => row.milestone !== null && row.milestoneTitle === null,
  );
  if (missing.length > 0) {
    throw new Error(
      `triage: milestone #${missing[0].milestone} is not open on ${repo} — refusing to invent it`,
    );
  }

  if (!args.apply) {
    if (args.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      process.stdout.write(
        `${plan.issues.length} founder issue(s) due triage on ${repo} (${plan.selection.skipped.length} already triaged)\n\n`,
      );
      process.stdout.write(`${planTable(plan.issues)}\n\n`);
      if (plan.duplicates.length > 0) {
        process.stdout.write(
          `possible duplicates (named, never closed):\n${plan.duplicates
            .map(
              (pair) =>
                `  #${pair.issue} ~ #${pair.of} — ${Math.round(pair.score * 100)}% ${pair.claim}`,
            )
            .join("\n")}\n\n`,
        );
      }
      process.stdout.write(
        `ledger: ${plan.ledger.action} “${plan.ledger.title}” (${plan.ledger.rows} rows)\nwrites: 0 (dry run)\n`,
      );
    }
    return 0;
  }

  // The write identity first, before a single issue is touched: a missing credential must read as
  // one gap at the door, not as twelve refused issues.
  let writeLogin;
  try {
    writeLogin = assertWriteIdentity();
  } catch (error) {
    process.stderr.write(
      `triage: no write credential for the triage identity — nothing was written.\n${error.message}\n` +
        "  needed: BWS ALIGNSYNCH_GH_USER_TOKEN (a token for the `alignsynch` account), resolved by\n" +
        `  ${ghIdPath()} bot\n`,
    );
    return 1;
  }
  process.stdout.write(`write identity: ${writeLogin}\n`);

  const applied = [];
  const refused = [];
  for (const row of plan.issues) {
    try {
      const result = applyRow(row, { milestoneTitle: row.milestoneTitle });
      if (result.ok) applied.push(result.number);
      else refused.push(result);
    } catch (error) {
      refused.push({ number: row.number, ok: false, reason: error.message });
    }
  }
  const duplicates = applyDuplicates(plan.duplicates, plan.issues, repo);
  // The ledger is written from the rows the plan built, so the issues this run just triaged are
  // stamped now — otherwise every batch would file a ledger that calls its own work untriaged.
  const today = new Date().toISOString().slice(0, 10);
  for (const entry of plan.ledger.entries) {
    if (applied.includes(entry.number)) entry.triagedAt = today;
  }
  applyLedger(ledger === null ? { number: null } : ledger, plan.ledger.entries, repo);

  process.stdout.write(
    `applied ${applied.length} of ${plan.issues.length} on ${repo}: ${applied.map((n) => `#${n}`).join(", ") || "none"}\n`,
  );
  if (duplicates.length > 0) {
    process.stdout.write(
      `duplicate notes posted: ${duplicates.map((p) => `#${p.issue} ~ #${p.of}`).join(", ")}\n`,
    );
  }
  process.stdout.write(`ledger: ${plan.ledger.action} (${plan.ledger.rows} rows)\n`);
  if (refused.length > 0) {
    for (const row of refused) {
      process.stderr.write(`refused #${row.number}: ${row.reason}\n`);
    }
    return 1;
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`triage: ${error.message}\n`);
    process.exitCode = 1;
  }
}
