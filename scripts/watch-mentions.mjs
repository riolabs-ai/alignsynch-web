#!/usr/bin/env node
/**
 * watch-mentions — an `@alignsynch` mention reaches the lead with the steer attached.
 *
 * GitHub has **no `mention` event**, so no workflow can trigger on one: a workflow would have to
 * hook `issue_comment`, `issues`, `pull_request_review_comment` and `pull_request_review` and grep
 * four payload shapes, and it would only fire for repositories where the Action is installed. This
 * script takes the other reliable shape — a poller over the same objects, runnable from any machine
 * that has `gh` and an identity — and it reads one thing: a body that says `@alignsynch`.
 *
 * On 2026-11-23T08:59:51Z the owner addressed this account in a comment on #847 and nothing
 * surfaced it. The alert would have been useless as a bare URL: what makes a mention answerable is
 * the *thread* — its labels, its tier, its milestone, and the three comments that led up to it. So
 * every alert carries all of that, and one line saying what the mention asks of the lead.
 *
 * ## It extracts and reports. It never answers.
 *
 * There is no model on this path, by design: a wrong automatic reply on a founder-facing thread is
 * worse than a late one, and the reply is a judgement about scope, not a text transformation. The
 * script is also strictly read-only — it posts, edits, labels, closes and reacts to nothing. The
 * only thing it writes is its own cursor, outside the repository.
 *
 * ## Sources, each with its own `since`
 *
 *   GET /repos/{repo}/issues/comments?since=   conversation comments on issues **and** PRs
 *   GET /repos/{repo}/pulls/comments?since=    inline review comments
 *   GET /repos/{repo}/issues?since=            issue bodies (and PR bodies — deduped against /pulls)
 *   GET /repos/{repo}/pulls?since=             PR bodies
 *
 * `since` is `updated_at`-based on every one of them, which is why idempotency cannot lean on the
 * cursor alone: an edited comment is fetched again. The seen-id set is what makes a second run of
 * the same window emit nothing, which is exactly what a cron with a fixed `--since` needs.
 *
 * ## Modes
 *
 *   pnpm mentions:watch --dry-run --since 2026-11-23T08:00:00Z --json   # report, write nothing
 *   pnpm mentions:watch --apply-cursor                                  # incremental, remembers
 *   pnpm mentions:watch --state /tmp/cursor.json --repo owner/name      # a different subject
 *   pnpm mentions:watch --gh /tmp/gh-stub.mjs --json                    # the seam the suite drives
 *
 * `--dry-run` is the default and it is exclusive with `--apply-cursor`: a run that claims to be a
 * dry run never writes the cursor. Output is one JSON document on stdout, and **stdout is empty
 * when there is nothing new** — the cron wrapper delivers stdout only when it is non-empty, so an
 * empty run costs the reader nothing. The census always goes to stderr, so a human running it by
 * hand sees counts even on a silent run.
 *
 * Cursor: `~/.hermes/profiles/alignsynch/state/mentions-cursor.json` (`--state` overrides). It
 * holds the last successfully processed `updated_at` per source plus the seen ids. It is never
 * inside the repository: this is operator state about a remote, not a fixture, and a committed
 * cursor would be rewritten by every machine that ran a watch.
 *
 * ## Which login runs the watch — read this before the first cron
 *
 * The watch resolves `gh api user --jq .login` and treats that login's own comments as self-talk.
 * That is right only when the watch runs as the lead (`jadenblack`, the default `gh` config). The
 * owner has decided the lead answers in the owner's threads, and `GH_CONFIG_DIR=~/.config/gh-alt`
 * resolves as `riolabs-ai` — under that override every owner mention reads as self-authored and is
 * silently skipped. The census line always prints `identity=<login>` and the document carries it, so
 * a wrong identity is visible in the first run's output instead of being invisible. `--identity`
 * pins it when a wrapper knows better.
 *
 * Exit codes: 0 ok (including zero alerts) · 1 usage, `gh` or parse failure.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The mention this watcher answers to.
 *
 * Both sides of the pattern are the whole rule:
 *
 *   - `(?<![\w@])` rejects an address like `ops@alignsynch.example` — the `@` there is preceded by
 *     a word character — and rejects a doubled `@@alignsynch` a quoted or forwarded message carries.
 *   - `(?![\w-])` rejects the *different* accounts `@alignsynch-web` and `@alignsynch_ops`. A trailing
 *     `\b` looks right and is not: a hyphen is not a word character, so `h-` is a word boundary and
 *     `@alignsynch-web` would pass. `_` is a word character, so `\w` covers it; the hyphen needs
 *     naming. A full stop (`@alignsynch.`) is still a mention, which is the commonest way one ends.
 *
 * A near-miss is not an instruction, and alerting on one teaches the lead to ignore the alerts.
 */
export const MENTION_RE = /(?<![\w@])@alignsynch(?![\w-])/iu;

/** A comment carrying this marker is the watcher's own acknowledgement, never an instruction. */
export const ACK_MARKER = "<!-- watch-mentions:ack -->";

export const DEFAULT_REPO = "riolabs-ai/alignsynch";
export const DEFAULT_WINDOW_HOURS = 24;
export const PRECEDING_COUNT = 3;
export const PRECEDING_CHARS = 200;
export const SEEN_LIMIT = 5000;
export const MENTION_CHARS = 1200;

/** The default cursor home. Outside the repo on purpose — see the header. */
export function defaultStatePath() {
  return path.join(
    os.homedir(),
    ".hermes",
    "profiles",
    "alignsynch",
    "state",
    "mentions-cursor.json",
  );
}

/** The four reads, in the order they are reported. `state=all` is only an issue/pull parameter. */
export const SOURCES = [
  {
    key: "issues_comments",
    path: (repo) => `repos/${repo}/issues/comments`,
    catches: "conversation comments on issues and PRs",
    kind: "comment",
  },
  {
    key: "pulls_comments",
    path: (repo) => `repos/${repo}/pulls/comments`,
    catches: "inline review comments",
    kind: "review-comment",
  },
  {
    key: "issues",
    path: (repo) => `repos/${repo}/issues`,
    catches: "issue bodies",
    kind: "issue_body",
    stateful: true,
  },
  {
    key: "pulls",
    path: (repo) => `repos/${repo}/pulls`,
    catches: "pull request bodies",
    kind: "pr_body",
    stateful: true,
  },
];

/**
 * The api path one source is queried with. `since` is a literal parameter on all four endpoints,
 * and it is asserted by name in `scripts/__tests__/mention-watch.test.ts` — an incremental poller
 * that quietly dropped it would still be correct on a quiet repository and wrong on a busy one.
 */
export function sourceQuery(source, repo, since) {
  const params = new URLSearchParams();
  params.set("since", since);
  params.set("per_page", "100");
  params.set("sort", "updated");
  params.set("direction", "asc");
  if (source.stateful) params.set("state", "all");
  return `${source.path(repo)}?${params.toString()}`;
}

/** One line, whether it arrived as paragraphs or not. */
export function collapse(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The mention's own sentence(s) — the ask, not the whole essay around it.
 *
 * A body with no sentence punctuation comes back whole (capped): dropping it would be worse than
 * quoting it, because the mention is the one part of the body that must not be lost.
 */
export function mentionSentences(body) {
  const text = collapse(body);
  if (!MENTION_RE.test(text)) return "";
  const parts = text.split(/(?<=[.!?])\s+/);
  const asked = parts.filter((part) => MENTION_RE.test(part));
  return (asked.length > 0 ? asked.join(" ") : text).slice(0, MENTION_CHARS);
}

/** A preceding comment, trimmed to `PRECEDING_CHARS` — the steer, not the transcript. */
export function trimExcerpt(text, limit = PRECEDING_CHARS) {
  const body = collapse(text);
  if (body.length <= limit) return body;
  return `${body.slice(0, limit - 1).trimEnd()}…`;
}

/** `tier/*` is the field the board routes on, so it is reported separately as well as in `labels`. */
export function tierOf(labelNames) {
  const names = Array.isArray(labelNames) ? labelNames : [];
  return names.find((name) => /^tier\//i.test(String(name))) ?? null;
}

function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((name) => typeof name === "string" && name.length > 0);
}

function milestoneTitle(milestone) {
  if (!milestone) return null;
  if (typeof milestone === "string") return milestone;
  return milestone.title ?? null;
}

/**
 * Why a mention is not an instruction.
 *
 * `bot` covers the automation accounts; a mention written by the watcher's own identity is the
 * watcher talking to itself, which a first design that posted acknowledgements produced; and an
 * ack body carries `ACK_MARKER`, so an acknowledgement can never become the next instruction.
 */
export function skipReason({ body, author, identity }) {
  if (!body || !MENTION_RE.test(String(body))) return "no-mention";
  const login = author?.login ?? null;
  if (!login) return "no-author";
  if (author?.type === "Bot") return "bot";
  if (identity && login.toLowerCase() === String(identity).toLowerCase()) return "self";
  if (String(body).includes(ACK_MARKER)) return "ack";
  return null;
}

/** One line naming what is being asked of the lead — the part that must not need reading twice. */
export function askLine({ repo, kind, number, author, state, tier, milestone }) {
  const flags = [
    state ? `state ${state}` : null,
    tier ? `tier ${tier}` : null,
    milestone ? `milestone ${milestone}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const subject = kind === "comment" || kind === "review-comment" ? "a comment on" : "the body of";
  return `${author} addressed @alignsynch in ${subject} ${repo}#${number}${
    flags ? ` (${flags})` : ""
  } — answer it or re-card it; this watcher never replies.`;
}

/**
 * The alert's own shape — the fields `scripts/__tests__/mention-watch.test.ts` reads.
 *
 * @typedef {{ number: number|null, title: string, state: string|null, url: string|null,
 *   labels: string[], tier: string|null, milestone: string|null }} AlertThread
 * @typedef {{ kind: string, comment_id: number|null, comment_url: string|null, author: string|null,
 *   author_type: string|null, author_association: string|null, created_at: string|null,
 *   updated_at: string|null, thread: AlertThread, mention: string,
 *   preceding: Array<{ id: number|null, author: string|null, created_at: string|null,
 *   excerpt: string }>, ask: string }} Alert
 */

/** The alert: comment identity, thread context, the ask, and the three comments before it. */
export function buildAlert({ repo, kind, item, thread, preceding }) {
  const labels = labelNames(thread?.labels);
  const tier = tierOf(labels);
  const milestone = milestoneTitle(thread?.milestone);
  const number = thread?.number ?? numberFromUrl(item?.issue_url);
  const author = item?.user?.login ?? null;
  return {
    kind,
    comment_id: item?.id ?? null,
    comment_url: item?.html_url ?? thread?.html_url ?? null,
    author,
    author_type: item?.user?.type ?? null,
    author_association: item?.author_association ?? null,
    created_at: item?.created_at ?? null,
    updated_at: item?.updated_at ?? null,
    thread: {
      number: number ?? null,
      title: collapse(thread?.title),
      state: thread?.state ?? null,
      url: thread?.html_url ?? null,
      labels,
      tier,
      milestone,
    },
    mention: mentionSentences(item?.body),
    preceding: (preceding ?? []).slice(-PRECEDING_COUNT).map((comment) => ({
      id: comment.id ?? null,
      author: comment.user?.login ?? null,
      created_at: comment.created_at ?? null,
      excerpt: trimExcerpt(comment.body),
    })),
    ask: askLine({ repo, kind, number, author, state: thread?.state, tier, milestone }),
  };
}

/** `.../issues/847` → 847. A review comment names its pull the same way. */
export function numberFromUrl(url) {
  const match = String(url ?? "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * `gh api --slurp` wraps every answer in a page array, including a single object, so a one-object
 * read has to be unwrapped before it can be read as a thread. Absent → `{}`, never `undefined`.
 */
export function firstOf(value) {
  if (Array.isArray(value)) return value[0] ?? {};
  return value ?? {};
}

export function emptyCursor(repo) {
  return { version: 1, repo, sources: {}, seen: [] };
}

/** A cursor that will not parse is not evidence: it is treated as absent, and the run says so. */
export function readCursor(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      version: 1,
      repo: typeof parsed.repo === "string" ? parsed.repo : null,
      sources: parsed.sources && typeof parsed.sources === "object" ? parsed.sources : {},
      seen: Array.isArray(parsed.seen) ? parsed.seen.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Advance per source, never backwards, and remember every id that was alerted.
 *
 * The new stamp is the latest `updated_at` actually fetched, not the wall clock: advancing to
 * "now" would skip anything edited between the query and the write, and that is the one failure a
 * cursor cannot recover from. An empty source keeps its old stamp.
 */
export function nextCursor(prev, { repo, observed, alertedIds }) {
  const base = prev ?? emptyCursor(repo);
  const sources = { ...base.sources };
  for (const [key, iso] of Object.entries(observed ?? {})) {
    if (!iso) continue;
    const current = sources[key];
    if (!current || Date.parse(iso) > Date.parse(current)) sources[key] = iso;
  }
  const seen = new Set(base.seen ?? []);
  for (const id of alertedIds ?? []) seen.add(String(id));
  return {
    version: 1,
    repo,
    sources,
    seen: [...seen].slice(-SEEN_LIMIT),
  };
}

/**
 * @typedef {{ version: number, repo: string|null, sources: Record<string, string>, seen: string[] }} Cursor
 * @typedef {{ tool: string, version: number, generated_at: string, repo: string,
 *   identity: string|null, since: Record<string, string>, counts: Record<string, number>,
 *   skipped: Record<string, number>, alerts: Alert[] }} Report
 */

/**
 * The read pass. Pure over the `read(apiPath)` callback — the test injects a fake `gh` and asserts
 * the argv it was handed, so "each source is queried with `since`" is proved from the call, not
 * from the code.
 *
 * @param {object} options
 * @param {string} [options.repo] owner/name, defaulted to this repository
 * @param {string|null} [options.since] an explicit window; it wins over the cursor on every source
 * @param {string|null} [options.identity] the login running the watch, skipped as an author
 * @param {Cursor|null} [options.cursor]
 * @param {(apiPath: string) => Promise<unknown>} options.read one `gh api` read
 * @param {string} [options.now]
 * @returns {Promise<{ report: Report, cursor: Cursor }>}
 */
export async function runWatch({
  repo = DEFAULT_REPO,
  since,
  identity,
  cursor = null,
  read,
  now = new Date().toISOString(),
}) {
  const fallbackSince = new Date(Date.now() - DEFAULT_WINDOW_HOURS * 3600000).toISOString();
  const sinceBySource = {};
  const counts = {};
  const observed = {};
  const alerts = [];
  const seen = new Set((cursor?.seen ?? []).map(String));
  const alertedIds = [];
  const alerted = new Set();
  const threads = new Map();
  const threadComments = new Map();
  const skipped = { seen: 0, outOfWindow: 0 };

  for (const source of SOURCES) {
    const stamp = since ?? cursor?.sources?.[source.key] ?? fallbackSince;
    const cutoff = Date.parse(stamp);
    sinceBySource[source.key] = stamp;
    const items = await read(sourceQuery(source, repo, stamp));
    const list = Array.isArray(items) ? items : [];
    counts[source.key] = list.length;
    let latest = null;
    for (const item of list) {
      // `/issues/comments`, `/pulls/comments` and `/issues` honour `since`; `/pulls` does not, and
      // it answers with every pull in the repository. The same cutoff is applied to all four, so
      // the source that cannot filter server-side cannot flood the alert either.
      if (item?.updated_at && Date.parse(item.updated_at) < cutoff) {
        skipped.outOfWindow += 1;
        continue;
      }
      if (item?.updated_at && (!latest || Date.parse(item.updated_at) > Date.parse(latest))) {
        latest = item.updated_at;
      }
      if (item?.id == null) continue;
      const id = String(item.id);
      if (seen.has(id)) {
        skipped.seen += 1;
        continue;
      }
      // A PR answers from both `/issues` and `/pulls` within one run, so the same id arrives twice
      // in the same pass — the cursor's seen set cannot catch that, because it is written at the end.
      if (alerted.has(id)) {
        skipped.duplicate = (skipped.duplicate ?? 0) + 1;
        continue;
      }
      const reason = skipReason({ body: item?.body, author: item?.user, identity });
      if (reason) {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
        continue;
      }
      // A PR arrives from both `/issues` and `/pulls`; the id makes them one alert, and the
      // `pull_request` marker is what tells the two kinds apart.
      const kind = source.stateful && item?.pull_request ? "pr_body" : source.kind;
      const number = item?.number ?? numberFromUrl(item?.issue_url ?? item?.pull_request_url);
      if (!number) continue;
      if (!threads.has(number)) {
        threads.set(number, firstOf(await read(`repos/${repo}/issues/${number}`)));
      }
      const thread = threads.get(number);
      const preceding = [];
      if (kind === "comment" || kind === "review-comment") {
        if (!threadComments.has(number)) {
          const listed = await read(`repos/${repo}/issues/${number}/comments?per_page=100`);
          threadComments.set(number, Array.isArray(listed) ? listed : []);
        }
        const before = threadComments
          .get(number)
          .filter((comment) => comment.id !== item.id)
          .filter((comment) => Date.parse(comment.created_at) < Date.parse(item.created_at));
        preceding.push(...before.slice(-PRECEDING_COUNT));
      }
      alerts.push(buildAlert({ repo, kind, item, thread, preceding }));
      alerted.add(id);
      alertedIds.push(item.id);
    }
    if (latest) observed[source.key] = latest;
  }

  alerts.sort((a, b) => Date.parse(a.created_at ?? 0) - Date.parse(b.created_at ?? 0));

  return {
    report: {
      tool: "watch-mentions",
      version: 1,
      generated_at: now,
      repo,
      identity: identity ?? null,
      since: sinceBySource,
      counts,
      skipped,
      alerts,
    },
    cursor: nextCursor(cursor, { repo, observed, alertedIds }),
  };
}

/** Loads the cursor for `path`, creating nothing: a missing cursor is `null`, not an error. */
function loadCursor(file, repo) {
  const existing = readCursor(file);
  if (existing?.repo && existing.repo !== repo) {
    // A cursor for another repository's ids would suppress the wrong alerts.
    return { cursor: null, reset: `cursor is for ${existing.repo}, not ${repo}` };
  }
  return { cursor: existing, reset: null };
}

function writeCursor(file, cursor) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cursor, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function refuse(message) {
  console.error(`watch-mentions: ${message}`);
  process.exit(1);
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

/** `gh api --paginate --slurp` answers with an array of pages; a single page still nests once. */
function parseGh(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((page) => Array.isArray(page))) {
    return parsed.flat();
  }
  return parsed;
}

function main() {
  if (arg("help", false)) {
    console.log(
      [
        "pnpm mentions:watch [--since <iso>] [--apply-cursor] [--repo owner/name]",
        "                   [--state <file>] [--identity <login>] [--gh <path>] [--json] [--dry-run]",
        "",
        "Reads the four bodies/comments endpoints for an `@alignsynch` mention and prints one JSON",
        "document. Read-only: it posts, edits and labels nothing. stdout is empty when there is",
        "nothing new, so a cron can deliver it verbatim.",
      ].join("\n"),
    );
    return;
  }

  const dryRun = Boolean(arg("dry-run", false));
  const applyCursor = Boolean(arg("apply-cursor", false));
  if (dryRun && applyCursor) {
    refuse("--dry-run and --apply-cursor are exclusive — a dry run writes nothing");
  }

  const sinceArg = arg("since");
  if (sinceArg === true) refuse("--since needs an ISO instant (e.g. 2026-11-23T08:00:00Z)");
  if (sinceArg && !Number.isFinite(Date.parse(sinceArg))) {
    refuse(`--since is not a date: ${sinceArg}`);
  }

  const repoArg = arg("repo", DEFAULT_REPO);
  const repo = typeof repoArg === "string" ? repoArg : DEFAULT_REPO;
  const stateArg = arg("state");
  if (stateArg === true) refuse("--state needs a file path");
  const statePath = stateArg ? path.resolve(stateArg) : defaultStatePath();

  const ghArg = arg("gh");
  if (ghArg === true) refuse("--gh needs a path to the gh binary");
  const ghBin = typeof ghArg === "string" ? ghArg : "gh";
  // `spawnSync` with an argument array, never a shell string: the api path is built from values
  // this script owns and is passed as one argv element, so nothing here is shell-interpreted.
  const readApi = (apiPath) => {
    const result = spawnSync(ghBin, ["api", "--paginate", "--slurp", apiPath], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw new Error(`cannot run ${ghBin}: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(
        `gh api ${apiPath} failed (exit ${result.status}): ${collapse(result.stderr)}`,
      );
    }
    return parseGh(result.stdout);
  };

  let identity = typeof arg("identity", null) === "string" ? arg("identity", null) : null;
  if (!identity) {
    const who = spawnSync(ghBin, ["api", "user", "--jq", ".login"], { encoding: "utf8" });
    identity = who.status === 0 ? collapse(who.stdout) || null : null;
  }

  const { cursor, reset } = loadCursor(statePath, repo);
  if (reset) console.error(`watch-mentions: ignoring cursor — ${reset}`);

  runWatch({
    repo,
    since: typeof sinceArg === "string" ? sinceArg : null,
    identity,
    cursor,
    read: readApi,
  })
    .then(({ report, cursor: next }) => {
      const applied = applyCursor;
      if (applied) writeCursor(statePath, next);
      const document = {
        ...report,
        cursor: { path: statePath, applied, sources: next.sources, seen: next.seen.length },
      };
      console.error(
        `watch-mentions: repo=${repo} alerts=${report.alerts.length} ` +
          `${Object.entries(report.counts)
            .map(([key, n]) => `${key}=${n}`)
            .join(" ")} ` +
          `skipped=${Object.entries(report.skipped)
            .map(([key, n]) => `${key}:${n}`)
            .join(",")} seen=${cursor?.seen?.length ?? 0} cursor=${
            applied ? "written" : "dry-run"
          }`,
      );
      if (report.alerts.length > 0) console.log(JSON.stringify(document, null, 2));
    })
    .catch((error) => refuse(error.message));
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) main();
