/**
 * The update ledger — one validated entry per pull request (`data/changelog/updates/<pr>.json`).
 *
 * **The ledger is the app's record, not the published tree (#1413).** Its rows moved out of
 * `docs/` and into `data/` so a physical split of the published tree cannot take the ledger with
 * it: `docs/` is what `scripts/docs-bundle.ts` packs and `DOCS_SOURCE=bundle` serves, and an admin
 * screen that renders one row per merge belongs to the app that ships it. `UPDATES_SPEC_PREFIX`
 * deliberately did **not** move — a row still cites the `docs/` document its rule now lives in, and
 * that path is resolved against the docs tree (`lib/docs/source.ts`), never against the ledger's own
 * directory.
 *
 * **Why a ledger and not per-commit mail.** A commit is an implementation unit; a reader unit is
 * "what changed, who notices, where the rule now lives". Mailing every commit trains people to
 * ignore the list and buries the release note that matters, so the record is a file in the PR —
 * authored by the person who made the change, validated at PR time — and `/admin/docs/updates`
 * renders it. The spec is `alignsynch-admin-updates-spec.md`; the rule's code is `E44` in
 * `scripts/data-check.ts` and the spec calls the rule **E-updates**.
 *
 * **Pure, and that is a contract.** No `fs`, no clock, no `@/` alias, no `zod`: the files arrive as
 * `{ name, raw }` and the manifest's paths arrive as a `Set`, so `scripts/data-check.ts` can compile
 * this module (it is listed in `tsconfig.datacheck.json`) and drive every malformed shape without a
 * tree — and `/admin/docs/updates` can parse the same text the reader in `lib/docs/tree.ts` opened.
 * The filesystem half (reading the directory, checking a spec path exists, asking git what this
 * change carries) is `scripts/updates-check.ts`, which imports the predicates below.
 *
 * **`specs` is the point of the file.** An entry that does not name the document its rule now lives
 * in is the state the owner complained about: the knowledge lived in a card and a PR description.
 * So `specs` must be non-empty, every path must resolve to a real file under `docs/specs/`, and the
 * screen renders each as a link — to the hub's own address when `docs/docs.json` carries it, and as
 * a marked raw path when it does not. A link to a 404 is worse than an unlinked path.
 *
 * **Newest first, and the order is derived.** `date` then `pr`, never file order: two entries written
 * the same day are ordered by the PR that made them, so the ledger never depends on a directory's
 * iteration order.
 */

/** Where an entry lives, relative to the repository root. The one spelling of it. */
export const UPDATES_DIR = "data/changelog/updates";

/**
 * Every `specs[]` path starts here — a document in the tree, never an arbitrary file.
 *
 * The written spec says "paths under `docs/specs/`". This is the honest version of that sentence:
 * the rule a merged change established sometimes lives in a guide rather than a spec document
 * (`#1337`'s endpoint guard is written down in `docs/getting-started/demo.md`), and forcing a
 * `docs/specs/` path for it would put an invented link in the one field whose value is that a
 * reader can follow it. So the field names a real document under `docs/`, and the screen marks the
 * ones `docs/docs.json` does not carry rather than hiding them.
 */
export const UPDATES_SPEC_PREFIX = "docs/";

/** The hub's address, mirrored from `lib/docs/rows.ts::ADMIN_DOCS_PATH` (that module is out of the
 *  `data:check` compile, so the one string is repeated rather than imported — `tests/admin-docs-updates`
 *  asserts the two agree). */
const ADMIN_DOCS_PATH = "/admin/docs";

/** Where the ledger lives. The one spelling of it, so a link and a route cannot drift. */
export const ADMIN_DOCS_UPDATES_PATH = `${ADMIN_DOCS_PATH}/updates`;

/** An entry's whole vocabulary. Unknown keys are refused, the same rule every fixture follows. */
export interface UpdateEntry {
  /** The pull request. Equals the file's number — the filename is not decorative. */
  readonly pr: number;
  /** The merged commit, when the author knows it. Absent in the PR that introduces the entry. */
  readonly sha?: string;
  /** `YYYY-MM-DD`, or a full ISO-8601 instant. The entry's own date, never a clock's. */
  readonly date: string;
  /** The conventional-commit scope the change sits in — `admin`, `flow`, `ci,docs`. */
  readonly area: string;
  /** One sentence: what changed, no adjectives. */
  readonly summary: string;
  /** One sentence: who notices, and where. `Nobody` is legal only with `risk: none`. */
  readonly reader_impact: string;
  /** One or more `docs/specs/…` paths — where the rule this change made now lives. */
  readonly specs: readonly string[];
  /** `none` / `low` / `medium` / `high`, when the author wants to say. */
  readonly risk?: string;
}

/** One `specs[]` path, resolved for the screen. */
export interface UpdateSpecLink {
  /** The path as the entry wrote it: `docs/specs/<file>.md`. */
  readonly path: string;
  /** `/admin/docs/specs/<file>.md` when the hub carries it, `null` when it does not. */
  readonly href: string | null;
  /** Does `docs/docs.json` carry it? `false` renders the path with the "not in the hub" marker. */
  readonly inHub: boolean;
}

/** An entry as the screen draws it: the record plus the resolved spec links. */
export interface UpdateRow extends Omit<UpdateEntry, "specs"> {
  /** `1341.json` — the file the row came from, so a bad row is traceable from the screen. */
  readonly file: string;
  readonly specLinks: readonly UpdateSpecLink[];
}

/** One file, as `fs` handed it over: the name and the parsed JSON (or the parse failure). */
export interface UpdateFile {
  readonly name: string;
  readonly raw: unknown;
}

/** The failures a screen draws and the gate reports — one class, one reason sentence. */
export class UpdateLedgerUnreadable extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "UpdateLedgerUnreadable";
    this.reason = reason;
  }
}

/** `1341.json` → `1341`; anything else → `null` (a stray file is the author's mistake, not a row). */
export function updateFileNumber(name: string): number | null {
  const match = /^([1-9][0-9]*)\.json$/.exec(name);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** A real calendar date in ISO-8601 form: `YYYY-MM-DD`, or that date with a time and an offset. */
function isIsoDate(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (match === null) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // `2026-02-31` parses as March under `Date`, so the round trip is what refuses it.
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

/** A path that stays inside `docs/specs/` — relative, no empty, `.` or `..` segment. */
function isSpecPath(value: string): boolean {
  if (!value.startsWith(UPDATES_SPEC_PREFIX)) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** One sentence per problem — the gate's message and the screen's panel use the same words. */
function sentence(name: string, message: string): string {
  return `${UPDATES_DIR}/${name}: ${message}`;
}

const SUMMARY_MAX = 240;
const IMPACT_MAX = 240;

/** A required one-sentence field: present, single line, not blank, not an essay. */
function sentenceProblem(value: unknown, field: string, max: number): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  const text = value.trim();
  if (text === "") return `${field} must not be empty`;
  if (text.includes("\n")) return `${field} must be one line`;
  if (text.length > max)
    return `${field} is ${text.length} characters — one sentence, at most ${max}`;
  return null;
}

/**
 * Everything wrong with one entry, as sentences. Empty means valid.
 *
 * The rules, in the order a reader hits them: the filename names a PR; `pr` agrees with it; `date`
 * is ISO-8601; `area` is a conventional-commit scope; `summary` and `reader_impact` are one
 * sentence each; `specs` is non-empty and every path is a `docs/specs/` path; `Nobody` in the
 * impact requires `risk: none`; and no key is one the schema does not know.
 */
export function updateEntryProblems(name: string, raw: unknown): string[] {
  const problems: string[] = [];
  const number = updateFileNumber(name);
  if (number === null) {
    return [sentence(name, "the filename is not a pull request number (`<pr>.json`)")];
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [sentence(name, "the file is not a JSON object")];
  }

  const record = raw as Record<string, unknown>;
  const known = new Set(["pr", "sha", "date", "area", "summary", "reader_impact", "specs", "risk"]);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) problems.push(sentence(name, `unknown key \`${key}\``));
  }

  if (record.pr !== number) {
    problems.push(
      sentence(name, `\`pr\` is ${JSON.stringify(record.pr)} but the file is ${number}`),
    );
  }

  if (record.date === undefined) problems.push(sentence(name, "`date` is missing"));
  else if (typeof record.date !== "string" || !isIsoDate(record.date)) {
    problems.push(sentence(name, "`date` is not an ISO-8601 date (`YYYY-MM-DD`)"));
  }

  if (record.sha !== undefined) {
    if (typeof record.sha !== "string" || !/^[0-9a-f]{7,40}$/.test(record.sha)) {
      problems.push(sentence(name, "`sha` is not a hex commit id"));
    }
  }

  if (record.area === undefined) problems.push(sentence(name, "`area` is missing"));
  else if (typeof record.area !== "string" || !/^[a-z][a-z0-9,.-]*$/.test(record.area)) {
    problems.push(
      sentence(name, "`area` is one conventional-commit scope, lowercase (`admin`, `ci,docs`)"),
    );
  }

  for (const [field, max] of [
    ["summary", SUMMARY_MAX],
    ["reader_impact", IMPACT_MAX],
  ] as const) {
    if (record[field] === undefined) problems.push(sentence(name, `\`${field}\` is missing`));
    else {
      const wrong = sentenceProblem(record[field], field, max);
      if (wrong !== null) problems.push(sentence(name, wrong));
    }
  }

  const impact = typeof record.reader_impact === "string" ? record.reader_impact.trim() : "";
  const risk = record.risk;
  if (
    risk !== undefined &&
    (typeof risk !== "string" || !["none", "low", "medium", "high"].includes(risk))
  ) {
    problems.push(sentence(name, "`risk` is one of `none`, `low`, `medium`, `high`"));
  }
  if (impact.toLowerCase() === "nobody" && risk !== "none") {
    problems.push(sentence(name, "`reader_impact` says Nobody, so `risk` must be `none`"));
  }

  if (record.specs === undefined) problems.push(sentence(name, "`specs` is missing"));
  else if (!Array.isArray(record.specs) || record.specs.length === 0) {
    problems.push(
      sentence(name, "`specs` must name at least one document — the link a reader follows"),
    );
  } else {
    for (const spec of record.specs) {
      if (typeof spec !== "string" || !isSpecPath(spec)) {
        problems.push(
          sentence(
            name,
            `\`specs\` carries ${JSON.stringify(spec)}, not a \`${UPDATES_SPEC_PREFIX}…\` path`,
          ),
        );
      }
    }
  }

  return problems;
}

/** One entry, parsed — or the first problem as the reason a screen prints. */
export function parseUpdateEntry(name: string, raw: unknown): UpdateEntry {
  const problems = updateEntryProblems(name, raw);
  if (problems.length > 0) throw new UpdateLedgerUnreadable(problems[0] ?? `${name} is invalid`);
  const record = raw as Record<string, unknown>;
  const entry: UpdateEntry = {
    pr: record.pr as number,
    date: (record.date as string).trim(),
    area: (record.area as string).trim(),
    summary: (record.summary as string).trim(),
    reader_impact: (record.reader_impact as string).trim(),
    specs: (record.specs as string[]).map((spec) => spec.trim()),
    ...(record.sha === undefined ? {} : { sha: record.sha as string }),
    ...(record.risk === undefined ? {} : { risk: record.risk as string }),
  };
  return entry;
}

/**
 * The whole ledger, parsed.
 *
 * Every file is validated before any row is returned: a ledger that drew the readable half would
 * hide the entry the reader most needs to know is broken. Files whose name is not a PR number are
 * refused too — a stray `notes.md` in this directory is a mistake, not an unread row.
 */
export function parseUpdateLedger(files: readonly UpdateFile[]): UpdateEntry[] {
  const entries: UpdateEntry[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) {
      throw new UpdateLedgerUnreadable(sentence(file.name, "is not a `<pr>.json` entry"));
    }
    entries.push(parseUpdateEntry(file.name, file.raw));
  }
  const seen = new Map<number, string>();
  for (const [index, file] of files.entries()) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const previous = seen.get(entry.pr);
    if (previous !== undefined) {
      throw new UpdateLedgerUnreadable(
        `PR #${entry.pr} has two entries: ${previous} and ${file.name}`,
      );
    }
    seen.set(entry.pr, file.name);
  }
  return entries;
}

/** `docs/specs/maintenance-fields.md` → `specs/maintenance-fields.md` — the manifest's own spelling. */
export function specDocPath(path: string): string {
  return path.startsWith("docs/") ? path.slice("docs/".length) : path;
}

/** Where a spec link goes: the hub's address for that document. */
export function updateSpecHref(path: string): string {
  return `${ADMIN_DOCS_PATH}/${specDocPath(path)}`;
}

/**
 * The ledger as rows, newest first, with each spec resolved against the hub.
 *
 * `hubPaths` is `docs/docs.json`'s set of `docs/`-relative paths (`lib/docs/rows.ts::docsRows`).
 * A spec the hub does not carry keeps its path and loses its link — the screen prints it with the
 * marker, because an anchor to a 404 is worse than a path a reader can search for.
 */
export function updateRows(
  entries: readonly UpdateEntry[],
  hubPaths: ReadonlySet<string>,
): UpdateRow[] {
  return [...entries]
    .sort((left, right) => {
      const byDate = right.date.localeCompare(left.date);
      return byDate !== 0 ? byDate : right.pr - left.pr;
    })
    .map((entry) => ({
      pr: entry.pr,
      date: entry.date,
      area: entry.area,
      summary: entry.summary,
      reader_impact: entry.reader_impact,
      ...(entry.sha === undefined ? {} : { sha: entry.sha }),
      ...(entry.risk === undefined ? {} : { risk: entry.risk }),
      file: `${entry.pr}.json`,
      specLinks: entry.specs.map((path) => {
        const inHub = hubPaths.has(specDocPath(path));
        return { path, href: inHub ? updateSpecHref(path) : null, inHub };
      }),
    }));
}

/**
 * Is this change one the ledger owes an entry for?
 *
 * A `feat` or `fix` commit changes what a reader can do or what the product gets wrong, so it owes
 * the record. A `chore`, `docs`, `test`, `ci` or `release` commit does not: the entry would be a
 * sentence about housekeeping, and the ledger's value is that every row matters. The subject's
 * *first line* is what counts, and both the bare and the parenthesised forms are accepted, which is
 * the shape `scripts/release.sh` already reads.
 */
export function requiresUpdateEntry(subjects: readonly string[]): boolean {
  return subjects.some((subject) => /^(feat|fix)(\(|!?:)/.test(subject.trim()));
}

/**
 * Why this change owes an entry it did not write, or `null`.
 *
 * `addedPaths` are the files the change *adds* (not modifies): an entry is written once, in the PR
 * that makes the change, so an edit to an earlier PR's entry is never the record of this one. The
 * message names the commit that triggered it, because "you owe an entry" without the reason is the
 * sort of error a person works around instead of fixing.
 */
export function coverageProblem(
  subjects: readonly string[],
  addedPaths: readonly string[],
): string | null {
  if (!requiresUpdateEntry(subjects)) return null;
  const added = addedPaths.some(
    (path) => path.startsWith(`${UPDATES_DIR}/`) && path.endsWith(".json"),
  );
  if (added) return null;
  const subject = subjects.find((candidate) => /^(feat|fix)(\(|!?:)/.test(candidate.trim())) ?? "";
  return `${UPDATES_DIR}/<pr>.json is missing — this change carries \`${subject.trim()}\`, and a feat or fix PR owes the ledger one entry (E-updates)`;
}
