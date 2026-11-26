#!/usr/bin/env node
/**
 * spec-register-coverage — the register's GitHub half, counted.
 *
 * THE QUESTION THIS ANSWERS. The register (`VALIDATION.csv`) is the consulting agreement's own
 * record: `agreement_quote`, `pdf_pages` and the two approval columns cannot come from an issue, and
 * they are why the CSV lives outside this checkout. GitHub is the *second* column — the delivery
 * record — and the two join by one key: the body marker in `lib/spec/issues.ts`
 * (`<!-- spec-row:APP-05 -->`). So the question is not "regenerate the CSV from issues"; it is
 * "how many rows does an issue actually name", and that number is this script's whole job.
 *
 * THE KEY IS THE MARKER, NEVER A TITLE AND NEVER A LABEL. `lib/spec/issues.ts` refuses a text
 * heuristic on purpose, and this script inherits the refusal: an issue without a marker is
 * **skipped and counted**, never guessed at. The pattern is re-declared here because a `.mjs` script
 * cannot import a TypeScript module without the loader — and the duplication is made safe rather
 * than trusted: `assertMarkerContract()` reads `lib/spec/issues.ts` and stops the run if the
 * pattern there has moved, so the day the two disagree the script fails instead of joining on a
 * key nothing else uses.
 *
 * THE MARKER NEEDS A SHAPE, NOT ONLY A PATTERN. `specIssueOf` takes the first match anywhere in a
 * body and keeps the id it finds without checking it against the register, so prose that *quotes*
 * the syntax becomes a row claim — this card's own finding issue did exactly that and joined as a
 * row id of `ID`. The report therefore counts both readings: the first match anywhere (what the
 * parser does), and the first line of the body (what a shape rule would do), plus every marker that
 * names no row the register has. Coverage itself is always counted the safe way — a row is covered
 * only when the register has the id — so a phantom can never inflate the number.
 *
 * WHAT IS DERIVED AND WHAT IS DECLARED. `status` is the register's declaration (☐ Tentative,
 * ◐ Partial, ☑ Delivered). An issue is open or closed. They are compared, never merged: a closed
 * issue under a non-Delivered row is a **disagreement**, reported with both values, because the
 * register is what the counterparty reads and GitHub is what the team closes.
 *
 * NO AGREEMENT TEXT LEAVES THIS SCRIPT. The committed report is public to everyone who reads the
 * repo; `agreement_quote` is Exhibit C. The guard at the end of a run fails loudly if any quote
 * column's value reaches either output — the same discipline as `quotesIncluded: false` in
 * `data/spec/validation.json`, enforced instead of assumed.
 *
 * NOT IN THE GATE, ON PURPOSE. This run needs the network and a file that is deliberately not in
 * this checkout, so a `--check` wired into `scripts/verify.sh` would be red on a plane and red in
 * CI. It fails loudly at the point of use instead: no GitHub answer, no page written.
 *
 * Usage:
 *   node scripts/spec-register-coverage.mjs
 *   SPEC_VALIDATION_CSV=/path/to/VALIDATION.csv node scripts/spec-register-coverage.mjs
 *   pnpm docs:nav        # the page is a docs page: the hub row and the nav block are generated
 *
 * Reads GitHub with the `gh` CLI's current identity (`gh api`, paginated, `state=all`). The repo is
 * `riolabs-ai/alignsynch-web` — the same constant `lib/spec/issues.ts` carries; the checkout's own
 * `origin` points at `riolabs-ai/alignsynch`, which GitHub redirects to it.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The repository the rows are filed in — one spelling, as `lib/spec/issues.ts` has it. */
const REPO = process.env.SPEC_COVERAGE_REPO ?? "riolabs-ai/alignsynch-web";

/** Where the register lives when nobody says otherwise: the project folder, outside the checkout. */
const CSV_PATH =
  process.env.SPEC_VALIDATION_CSV ??
  join(homedir(), "Desktop/dev.local/alignsynch/project-spec/spec-scope-v2/VALIDATION.csv");

const OUT_MD = join(ROOT, "docs/specs/spec-register-coverage.md");
const OUT_JSON = join(ROOT, "docs/specs/spec-register-coverage.json");
const ISSUES_SOURCE = join(ROOT, "lib/spec/issues.ts");

/** The marker, byte for byte as `lib/spec/issues.ts` declares it. */
const MARKER_SOURCE = String.raw`<!--\s*spec-row:\s*([A-Za-z0-9._-]+)\s*-->`;
const MARKER = new RegExp(MARKER_SOURCE);

/** The register columns this script is allowed to read. `agreement_quote` is not one of them. */
const READ_COLUMNS = ["id", "section", "group", "status", "v2_0_0", "next_acceptance"];

/** A row that is delivered — the only status a closed issue can agree with. */
const DELIVERED = "Delivered";

function die(message) {
  process.stderr.write(`spec-register-coverage: ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * The inputs
 * ------------------------------------------------------------------ */

/** The marker is the key. If `lib/spec/issues.ts` moved it, this script is joining on the wrong one. */
function assertMarkerContract() {
  if (!existsSync(ISSUES_SOURCE))
    die(`missing ${ISSUES_SOURCE} — cannot prove the marker contract`);
  const source = readFileSync(ISSUES_SOURCE, "utf8");
  if (!source.includes(MARKER_SOURCE)) {
    die(
      `the spec-row marker in lib/spec/issues.ts is not ${MARKER_SOURCE} — ` +
        "the contract moved; update MARKER_SOURCE here before trusting a join",
    );
  }
}

/** RFC 4180, enough of it: quoted fields, doubled quotes inside them, CRLF. No library, no guessing. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function readRegister() {
  if (!existsSync(CSV_PATH)) {
    die(
      `the register is not at ${CSV_PATH} — set SPEC_VALIDATION_CSV to the agreement's VALIDATION.csv`,
    );
  }
  const bytes = readFileSync(CSV_PATH);
  const [header, ...body] = parseCsv(bytes.toString("utf8"));
  if (!header || body.length === 0) die(`${CSV_PATH} has no header or no rows`);

  const index = new Map(header.map((name, at) => [name.trim(), at]));
  for (const column of READ_COLUMNS) {
    if (!index.has(column)) die(`${CSV_PATH} has no \`${column}\` column`);
  }

  const rows = body.map((cells) =>
    Object.fromEntries(
      READ_COLUMNS.map((column) => [column, (cells[index.get(column)] ?? "").trim()]),
    ),
  );
  if (rows.length === 0) die(`${CSV_PATH} parsed to zero rows`);
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    die(`${CSV_PATH} has a repeated row id`);

  const quotesAt = index.get("agreement_quote");
  const quotes = quotesAt === undefined ? [] : body.map((cells) => (cells[quotesAt] ?? "").trim());

  return {
    rows,
    quoteValues: quotes.filter((value) => value.length > 12),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** One paginated read of every issue in the repo; a pull request is not an issue and is counted out. */
function readIssues() {
  const jq =
    ".[] | {number,state,title,milestone:.milestone.title," +
    "labels:[.labels[].name],pr:(.pull_request!=null),body,updatedAt:.updated_at}";
  let raw;
  try {
    raw = execFileSync(
      "gh",
      ["api", "--paginate", `repos/${REPO}/issues?state=all&per_page=100`, "--jq", jq],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const detail = (error.stderr ?? "").toString().trim() || error.message;
    die(`gh api could not read ${REPO}: ${detail}`);
  }

  const entries = raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return die(`gh api returned a line that is not JSON: ${line.slice(0, 120)}`);
      }
    });

  if (entries.length === 0)
    die(`gh api returned no entries for ${REPO} — refusing to write an empty table`);

  const issues = entries.filter((entry) => !entry.pr);
  if (issues.length === 0) die(`${REPO} returned ${entries.length} entries and not one issue`);

  const joined = [];
  const unmarked = [];
  for (const issue of issues) {
    const body = issue.body ?? "";
    const match = body.match(MARKER);
    if (!match) {
      unmarked.push(issue);
      continue;
    }
    // THE SHAPE, not just the pattern. `lib/spec/issues.ts` takes the first match anywhere in the
    // body and keeps whatever id it finds, so prose that *quotes* the syntax becomes a row claim —
    // measured once on the card's own finding issue, which joined as a row id of `ID`. Where the
    // comment sits is the difference between data and documentation, so the report counts both: the
    // reading the parser does today, and the reading a first-line rule would do.
    const trimmed = body.trim();
    const lineStart = trimmed.lastIndexOf("\n", match.index) + 1;
    const lineEndAt = trimmed.indexOf("\n", match.index);
    const line = trimmed.slice(lineStart, lineEndAt === -1 ? trimmed.length : lineEndAt);
    joined.push({
      ...issue,
      rowId: match[1],
      firstLine: trimmed.startsWith(match[0]),
      ownLine: line.trim() === match[0],
    });
  }
  if (joined.length === 0) {
    die(
      `${issues.length} issues in ${REPO} and not one carries a spec-row marker — ` +
        "the contract this report exists to measure has gone",
    );
  }

  const updated = issues
    .map((issue) => issue.updatedAt ?? "")
    .filter(Boolean)
    .sort();

  return {
    entries: entries.length,
    issues: issues.length,
    pullRequests: entries.length - issues.length,
    unmarked: unmarked.length,
    joined,
    asOf: (updated.at(-1) ?? "").slice(0, 10),
  };
}

/* ------------------------------------------------------------------ *
 * The join, the classes, the drift
 * ------------------------------------------------------------------ */

/** `Fills Gap · R1` → `tier/R1`; `On Roadmap · Later` → `tier/Later`. Null when the cell says neither. */
function expectedTier(release) {
  const match = release.match(/\b(R1|R2|Later)\b/);
  return match ? `tier/${match[1]}` : null;
}

/**
 * What an uncovered row is, keyed on the register's own status and escalated by its own promise.
 *
 * status is the declaration; `next_acceptance` is the row saying something is still owed. A row that
 * owes nothing and is not delivered is a records question, not a delivery one — which is why the
 * class is read off those two cells and not off a sentence in this file.
 */
function classify(row) {
  const owes = row.next_acceptance !== "—" && row.next_acceptance !== "";
  if (row.status === "Tentative" || row.status === "Partial") return "needs-issue";
  if (owes) return "needs-issue";
  if (row.status === DELIVERED || row.status === "Over-Delivered") return "delivered-record";
  return "off-agreement";
}

function buildReport() {
  assertMarkerContract();
  const register = readRegister();
  const github = readIssues();

  const byId = new Map();
  const duplicates = [];
  for (const issue of github.joined) {
    const held = byId.get(issue.rowId);
    if (held) duplicates.push({ rowId: issue.rowId, numbers: [held.number, issue.number] });
    else byId.set(issue.rowId, issue);
  }

  const known = new Set(register.rows.map((row) => row.id));
  const orphans = [...byId.entries()]
    .filter(([rowId]) => !known.has(rowId))
    .map(([rowId, issue]) => ({
      rowId,
      number: issue.number,
      firstLine: issue.firstLine,
      ownLine: issue.ownLine,
    }))
    .sort((a, b) => a.rowId.localeCompare(b.rowId));

  // How the 28 write it, and how many of them a first-line rule would lose. A rule that costs
  // nothing today is the one worth adopting before a document about the syntax is filed.
  const shape = {
    firstLine: github.joined.filter((issue) => issue.firstLine).length,
    ownLineOnly: github.joined.filter((issue) => issue.ownLine && !issue.firstLine).length,
    inline: github.joined
      .filter((issue) => !issue.ownLine)
      .map((issue) => ({ number: issue.number, rowId: issue.rowId })),
  };

  const drift = [];
  const tierMismatch = [];
  const missingSpecLabel = [];
  const missingTierLabel = [];
  const missingMilestone = [];

  const rows = register.rows.map((row) => {
    const issue = byId.get(row.id) ?? null;
    const cls = classify(row);
    if (!issue) return { ...row, issue: null, class: cls };

    if (issue.state === "closed" && row.status !== DELIVERED) {
      drift.push({
        rowId: row.id,
        status: row.status,
        number: issue.number,
        state: issue.state,
        agrees: false,
      });
    } else if (issue.state === "open" && row.status === DELIVERED) {
      drift.push({
        rowId: row.id,
        status: row.status,
        number: issue.number,
        state: issue.state,
        agrees: false,
      });
    }

    const tier = (issue.labels ?? []).find((label) => label.startsWith("tier/")) ?? null;
    const want = expectedTier(row.v2_0_0);
    if (tier && want && tier !== want)
      tierMismatch.push({ rowId: row.id, number: issue.number, release: row.v2_0_0, label: tier });
    if (!(issue.labels ?? []).includes("spec")) missingSpecLabel.push(issue.number);
    if (!tier) missingTierLabel.push(issue.number);
    if (!issue.milestone) missingMilestone.push({ rowId: row.id, number: issue.number });

    return {
      ...row,
      class: cls,
      issue: {
        number: issue.number,
        state: issue.state,
        tier,
        milestone: issue.milestone ?? null,
        reviewed: (issue.labels ?? []).includes("spec:reviewed"),
        approved: (issue.labels ?? []).includes("spec:approved"),
        url: `https://github.com/${REPO}/issues/${issue.number}`,
      },
    };
  });

  const covered = rows.filter((row) => row.issue !== null);
  const uncovered = rows.filter((row) => row.issue === null);
  const classes = {
    "needs-issue": uncovered.filter((row) => row.class === "needs-issue").map((row) => row.id),
    "delivered-record": uncovered
      .filter((row) => row.class === "delivered-record")
      .map((row) => row.id),
    "off-agreement": uncovered.filter((row) => row.class === "off-agreement").map((row) => row.id),
  };

  const milestones = new Map();
  for (const row of covered) {
    const name = row.issue.milestone ?? "(none)";
    milestones.set(name, (milestones.get(name) ?? 0) + 1);
  }

  // Two milestones claiming one version is a file-into row a reader cannot answer: `v2.0.0`
  // carried both "the official release" and "the acceptance certificate" when this first ran.
  const byVersion = new Map();
  for (const name of milestones.keys()) {
    if (name === "(none)") continue;
    const version = name.split(" — ")[0].trim();
    byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
  }
  const milestoneCollisions = [...byVersion.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([version, names]) => ({ version, names }));

  return {
    version: 1,
    asOf: github.asOf,
    register: { file: "VALIDATION.csv", rows: rows.length, sha256: register.sha256 },
    source: {
      repo: REPO,
      entries: github.entries,
      issues: github.issues,
      pullRequests: github.pullRequests,
      withMarker: github.joined.length,
      withoutMarker: github.unmarked,
    },
    coverage: { rows: rows.length, covered: covered.length, uncovered: uncovered.length },
    join: { duplicateMarkers: duplicates, orphanMarkers: orphans, shape },
    labels: {
      missingSpec: missingSpecLabel,
      missingTier: missingTierLabel,
      tierMismatch,
      missingMilestone,
      milestones: [...milestones.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      milestoneCollisions,
      reviewed: covered.filter((row) => row.issue.reviewed).length,
      approved: covered.filter((row) => row.issue.approved).length,
    },
    drift,
    classes,
    rows,
    quoteValues: register.quoteValues,
  };
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

const CELL = (value) => String(value).replace(/\|/g, "\\|");

function issueCell(issue) {
  if (!issue) return "—";
  return `#${issue.number}`;
}

function stateCell(issue) {
  if (!issue) return "—";
  return issue.state === "closed" ? "closed" : "open";
}

/** The register's status as the page draws it: ☐ declared to be undone, ◐ part-done, ☑ delivered. */
function statusCell(row) {
  const box =
    row.status === DELIVERED || row.status === "Over-Delivered"
      ? "☑"
      : row.status === "Partial"
        ? "◐"
        : "☐";
  return `${box} ${row.status}`;
}

function renderMarkdown(report) {
  const lines = [];
  const push = (...items) => lines.push(...items);
  const { coverage, source, classes, drift } = report;
  const pct = Math.round((coverage.covered / coverage.rows) * 100);

  push(
    "# The spec register's GitHub join — coverage, and the backfill plan",
    "",
    `Generated by \`scripts/spec-register-coverage.mjs\` from \`VALIDATION.csv\` (\`sha256:${report.register.sha256.slice(0, 12)}\`, ` +
      `${coverage.rows} rows) and every issue in \`${source.repo}\` (newest issue update ${report.asOf}). ` +
      "Re-run the script; do not edit this page.",
    "",
    "## The answer, before the detail",
    "",
    `**${coverage.covered} of ${coverage.rows} rows (${pct} %) are named by an issue that carries the marker; ${coverage.uncovered} are not.** ` +
      (report.join.duplicateMarkers.length === 0 && report.join.orphanMarkers.length === 0
        ? "The join itself is clean — no row is claimed twice, no marker names a row the register does not have — " +
          "so the shortfall is population, not duplication."
        : `The join itself is not clean: ${report.join.duplicateMarkers.length} row(s) are claimed twice and ` +
          `${report.join.orphanMarkers.length} marker(s) name a row the register does not have, so part of the ` +
          "shortfall is a join defect before it is a population one."),
    "",
    "An issues-first regeneration would therefore cover at most those rows and would drop every column an issue " +
      "cannot answer: `agreement_quote`, `pdf_pages`, `approval_jaden`, `approval_walt`. **The register is the record; " +
      "issues are the delivery layer joined onto it by one key.**",
    "",
    "## The counts",
    "",
    "| fact | number |",
    "| --- | --- |",
    `| register rows | ${coverage.rows} |`,
    `| issues read (\`state=all\`, every page) | ${source.issues} |`,
    `| pull requests excluded from that collection | ${source.pullRequests} |`,
    `| issues carrying a \`spec-row\` marker | ${source.withMarker} |`,
    `| issues carrying no marker (skipped, never guessed) | ${source.withoutMarker} |`,
    `| rows named by an issue | ${coverage.covered} of ${coverage.rows} (${pct} %) |`,
    `| rows named by no issue | ${coverage.uncovered} |`,
    `| markers naming a row the register does not have | ${report.join.orphanMarkers.length}${
      report.join.orphanMarkers.length === 0
        ? ""
        : ` (${report.join.orphanMarkers.map((item) => `\`${item.rowId}\` in #${item.number}`).join(", ")})`
    } |`,
    `| rows claimed by two issues | ${report.join.duplicateMarkers.length} |`,
    "",
    "**How this number is counted.** A row counts as covered only when the register has that id and an issue's marker " +
      "names it. A marker is never trusted to say what the register contains, because nothing on the read side checks " +
      "it: `specIssueOf` keeps whatever id the first match returns, so a marker naming a row that does not exist " +
      "changes the count and draws nothing. " +
      (report.join.orphanMarkers.length === 0
        ? "This run found none — but it found none because the prose was rewritten, not because the parser refused it " +
          "(see the shape rule below)."
        : `${report.join.orphanMarkers.length} marker(s) name a row the register does not have, so the page draws ` +
          "nothing for them while a count of marker-bearing issues would be that much too high."),
    "",
    "## Every row, and the issue that names it",
    "",
    "| row | section | status | tier (register) | issue | issue state | milestone |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const row of report.rows) {
    push(
      `| ${CELL(row.id)} | ${CELL(row.section)} | ${CELL(statusCell(row))} | ${CELL(row.v2_0_0)} | ` +
        `${issueCell(row.issue)} | ${stateCell(row.issue)} | ${CELL(row.issue?.milestone ?? "—")} |`,
    );
  }

  push(
    "",
    "## Where an issue and the register disagree",
    "",
    drift.length === 0
      ? "None: every closed issue sits on a Delivered row and every open one on a row that is not."
      : `A closed issue says the work is finished; the register says it is not. ${drift.length} of ` +
          `${coverage.covered} covered rows disagree, and both values are shown because the register is what the ` +
          "counterparty reads while GitHub is what the team closes.",
    "",
  );

  if (drift.length > 0) {
    push(
      "| row | register status | issue | issue state | disagreement |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const item of drift) {
      const what =
        item.state === "closed" ? "closed issue, undelivered row" : "open issue, delivered row";
      push(
        `| ${CELL(item.rowId)} | ${CELL(item.status)} | #${item.number} | ${item.state} | ${what} |`,
      );
    }
    push("");
  }

  push(
    "## The 28 issues' own order",
    "",
    "| check | finding |",
    "| --- | --- |",
    `| missing the \`spec\` label | ${report.labels.missingSpec.length || "none"} |`,
    `| missing a \`tier/R1\\|R2\\|Later\` label | ${report.labels.missingTier.length || "none"} |`,
    `| tier label disagreeing with the register's \`v2_0_0\` cell | ${
      report.labels.tierMismatch.length === 0
        ? "none"
        : report.labels.tierMismatch
            .map(
              (item) =>
                `${item.rowId} #${item.number} (register: ${item.release}, label: ${item.label})`,
            )
            .join("; ")
    } |`,
    `| no milestone | ${
      report.labels.missingMilestone.length === 0
        ? "none"
        : report.labels.missingMilestone.map((item) => `${item.rowId} #${item.number}`).join(", ")
    } |`,
    `| issues carrying \`spec:reviewed\` | ${report.labels.reviewed} of ${coverage.covered} |`,
    `| issues carrying \`spec:approved\` | ${report.labels.approved} of ${coverage.covered} |`,
    "",
    "Milestones in use:",
    "",
    "| milestone | issues |",
    "| --- | --- |",
  );

  for (const entry of report.labels.milestones) push(`| ${CELL(entry.name)} | ${entry.count} |`);

  if (report.labels.milestoneCollisions.length > 0) {
    push(
      "",
      'Two milestones claim one version, so "file it into v2.0.0" has no single answer: ' +
        report.labels.milestoneCollisions
          .map(
            (item) =>
              `**${item.version}** is both ${item.names.map((name) => `\"${name}\"`).join(" and ")}`,
          )
          .join("; ") +
        ".",
    );
  }

  push(
    "",
    "## The uncovered rows, by class",
    "",
    "The class is read off the register's own two cells — `status` and `next_acceptance` — and never off a sentence " +
      "in this page. A row that still owes something is delivery work whatever its section says.",
    "",
    `| class | count | what it means |`,
    "| --- | --- | --- |",
    `| needs an issue | ${classes["needs-issue"].length} | open delivery work: not delivered, or still owes an acceptance |`,
    `| delivered, record only | ${classes["delivered-record"].length} | shipped in the register's own words; a closed issue would echo it, not prove it |`,
    `| off the agreement | ${classes["off-agreement"].length} | offset or out of scope under the agreement's own wording |`,
    "",
  );

  for (const [name, ids] of Object.entries(classes)) {
    push(
      `**${name}** (${ids.length}): ${ids.length === 0 ? "none" : ids.map((id) => `\`${id}\``).join(", ")}`,
      "",
    );
  }

  push(
    "## The marker contract a backfill would have to honour",
    "",
    "One HTML comment, in the issue body, on the first line of it:",
    "",
    "```html",
    "<!-- spec-row:APP-05 -->",
    "```",
    "",
    "The key is the register's `id` cell, byte for byte. `lib/spec/issues.ts` matches it with " +
      `\`/${MARKER_SOURCE}/\` and says why in its own words: *"the marker is the key, never a title and never a ` +
      "label … a body without one is skipped and counted, never guessed at from its text: a heuristic that reads a " +
      'title is a parser this repo has already been burned by, and it fails silently on the day someone edits a title."*',
    "",
    "A title match is refused for three reasons this repository has already paid for: a retitle silently unjoins the " +
      "row, two rows can share a title fragment, and the fallback is invisible — the register would simply lose a " +
      "column with no error anywhere. A marker is editable text a human can see and a script can prove.",
    "",
    "The read is one call — `labels=spec&state=all&per_page=100` — so a new issue must carry the `spec` label and a " +
      "`tier/R1|R2|Later` label to be read as the register expects, and a 101st issue would return a full page the " +
      "read refuses rather than truncates.",
    "",
    "One trap, measured rather than imagined. The issue that carries *this* report described the marker syntax in its " +
      "own prose, inside backticks, and the run joined it as a row id of `ID` — no register row has that id, so the " +
      "page drew nothing while the count of marker-bearing issues read one too high. Backticks are not an escape: the " +
      "pattern reads the raw body, and `specIssueOf` never checks the id it finds against the register. The issue was " +
      "reworded, so this run is clean — but nothing in the parser changed, and the next author who documents the " +
      "syntax re-creates it.",
    "",
    "**The contract needs a shape rule, not only a pattern.** A marker should be the first line of the body, alone on " +
      `its line. That is already how every issue in this batch writes it: ${report.join.shape.firstLine} of ` +
      `${source.withMarker} are the first line, ${report.join.shape.ownLineOnly} sit alone but not first, and ` +
      `${report.join.shape.inline.length} sit inline in prose. A first-line rule therefore costs nothing today and ` +
      'makes "an issue that talks about the marker" and "an issue that claims a row" two different things — which ' +
      "is the difference between a number and a claim. Escaping the example in a code span would work too, but it puts " +
      "the guarantee in the author's hands rather than the parser's, and the parser is the thing that never forgets.",
    "",
    "## The decision this leaves",
    "",
    "**Declare the register authoritative for the delivered rows; do not backfill them.** The numbers make the case " +
      `on their own: ${classes["needs-issue"].length} of the ${coverage.uncovered} uncovered rows is delivery work, so a ` +
      `backfill of ${coverage.uncovered} issues would create ${coverage.uncovered} closed issues — ` +
      `${classes["delivered-record"].length} recording a delivery the register already states and a code path already ` +
      `evidences, ${classes["off-agreement"].length} recording a non-obligation the agreement's own wording already ` +
      "carries. Nothing they add changes the derived reading — a closed issue on a Delivered row derives the status the " +
      "row already declares.",
    "",
    "What a backfill would cost, and what it would buy:",
    "",
    "| option | issues created | effort | what changes on the surface |",
    "| --- | --- | --- | --- |",
    `| backfill the ${coverage.uncovered} | ${coverage.uncovered}, every one closed | a generator run (~15 min) plus a read of ${coverage.uncovered} bodies, an hour or two | coverage 28 → 88, and ${coverage.uncovered} derived readings identical to the declared ones |`,
    "| declare authoritative | 0 | ~1 h to write the rule beside `lib/spec/issues.ts` and test the four degenerate cases, " +
      "plus the first-line shape rule and its test | coverage stays " +
      `${coverage.covered} of ${coverage.rows}; the other ${coverage.uncovered} draw the "no linked issue" state |`,
    "",
    `The failure mode is already visible in the ${coverage.covered}: ${drift.length} closed issues sit on rows the register ` +
      "still calls Partial or Tentative. Closing an issue does not move the register, and creating more issues does not " +
      "either. The one thing that would move it is fixing those rows — and that is a human decision per row, not a " +
      "backfill.",
    "",
    "If the owner wants a GitHub-visible record for the rows where the counterparty is the audience rather than the " +
      "team — the `B-01`–`B-12` beyond-agreement deliverables — that is 12 closed issues, not 60, and this page should " +
      "be regenerated to carry them.",
    "",
    "## How to re-run this page",
    "",
    "```bash",
    "node scripts/spec-register-coverage.mjs          # reads the register and every issue, writes both files",
    "pnpm docs:nav                                    # the hub row and the nav block are generated, not authored",
    "```",
    "",
    "`SPEC_VALIDATION_CSV` points the run at a different copy of the register; `SPEC_COVERAGE_REPO` at a different " +
      "repository. The run needs the network and the CSV, which is why it is a report and not a gate step: it fails " +
      "loudly here rather than turning every CI run red. It stops without writing when `gh` cannot answer, when the " +
      "repository returns no issues, or when not one issue carries a marker — an empty table is the one outcome a " +
      "silent failure would produce.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ *
 * The run — nothing is written until every input has answered
 * ------------------------------------------------------------------ */

const report = buildReport();

const json = `${JSON.stringify(
  {
    version: report.version,
    asOf: report.asOf,
    register: report.register,
    source: report.source,
    coverage: report.coverage,
    join: report.join,
    labels: report.labels,
    drift: report.drift,
    classes: report.classes,
    rows: report.rows,
  },
  null,
  2,
)}\n`;
const markdown = renderMarkdown(report);

/* The NDA guard: a quote from Exhibit C must reach neither file, whatever a later edit does. */
for (const [name, output] of [
  [OUT_MD, markdown],
  [OUT_JSON, json],
]) {
  for (const quote of report.quoteValues) {
    if (output.includes(quote)) die(`refusing to write ${name}: it would carry an agreement_quote`);
  }
}

for (const [path, content] of [
  [OUT_MD, markdown],
  [OUT_JSON, json],
]) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

const total =
  report.classes["needs-issue"].length +
  report.classes["delivered-record"].length +
  report.classes["off-agreement"].length;
if (total !== report.coverage.uncovered) {
  die(
    `classes cover ${total} rows and the register has ${report.coverage.uncovered} uncovered — refusing`,
  );
}

process.stdout.write(
  `spec-register-coverage: ${report.coverage.covered}/${report.coverage.rows} rows named by an issue, ` +
    `${report.coverage.uncovered} not (needs-issue ${report.classes["needs-issue"].length}, ` +
    `delivered-record ${report.classes["delivered-record"].length}, ` +
    `off-agreement ${report.classes["off-agreement"].length}); drift ${report.drift.length}. ` +
    "Wrote docs/specs/spec-register-coverage.md and .json\n",
);
