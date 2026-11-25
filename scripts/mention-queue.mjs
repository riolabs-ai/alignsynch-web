#!/usr/bin/env node
/**
 * mention-queue — who may put `needs-agent-reply` on a thread, and who may not.
 *
 * `needs-agent-reply` means *unanswered*. It used to mean *a mention exists somewhere in a comment
 * body*, and an answer has to name the handle to be a reply — so answering re-armed the label:
 *
 *   #1382   answer posted by `jadenblack` at 2026-11-25T04:21:21Z (comment 7152767044, the one
 *           carrying "answering in place of `@alignsynch`, which cannot sign in")
 *           label removed at 04:21:27Z, put back by run 45546210272 at 04:21:34Z
 *
 * A queue whose marker is set by the answer is a queue that never drains. `.github/workflows/
 * mention-queue.yml` therefore asks this file who wrote the event, and skips *queueing* for an
 * answerer. The rule is here, and not in the YAML, so that it is a named function with a test
 * rather than a shell case statement nobody can exercise: tests/mention-queue.test.ts.
 *
 * ## The rule
 *
 *   queue    any human who is not an answerer — the founder asking, the reviewer asking, anyone
 *   skip     an answering identity (`--answering`, default ANSWERING_IDENTITIES)
 *   skip     any `[bot]` login, a payload `type: Bot`, or the mention target itself
 *   queue    an event with no readable author — an unreadable login is not an answer
 *
 * ## Why the repository owner is not skipped implicitly
 *
 * The owner account here (`riolabs-ai`) is the one that *files* the issues and writes the mentions —
 * #1382's body and its 04:05:59Z comment are both that account — so a guard that skipped the owner
 * would leave the queue permanently empty and pass every test written against an answerer. The
 * guard is about who answers, not about ignoring mentions. A deployment where the owner *is* the
 * answerer says so (`--answering riolabs-ai`), and the suite pins that direction too.
 *
 * ## Two entry points, one predicate
 *
 *   node scripts/mention-queue.mjs --actor jadenblack --type User    # exit 3, prints `skip …`
 *   node scripts/mention-queue.mjs --actor riolabs-ai               # exit 0, prints `queue …`
 *
 * `--answering-jq` prints the jq filter that keeps every body *not* authored by an answerer. The
 * workflow's re-scan (an edit that removed a mention) greps the whole thread, and the answer in it
 * mentions us — so the filter is what stops the same defect reappearing on the removal path. The
 * identity list has exactly one home: this file.
 *
 * Exit codes are the contract the workflow reads: 0 may queue, 3 may not, 2 the caller is wrong,
 * anything else means this guard is broken — and the step fails rather than guessing.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The account the label is about. */
export const MENTION_TARGET = "alignsynch";

/**
 * Logins that answer in this repository.
 *
 * `jadenblack` posts the replies (owner decision 2026-11-23, and the measurement above).
 * `alignsynch` is the handle's own account — it cannot ask itself a question — and is also refused
 * by the target rule; it is listed so the re-scan filter and the guard cannot drift apart.
 */
export const ANSWERING_IDENTITIES = ["jadenblack", "alignsynch"];

/** 0 = this event may queue the thread. */
export const EXIT_QUEUE = 0;
/** 3 = deliberate skip: the author does not queue a thread (and may still clear one). */
export const EXIT_SKIP = 3;
/** 2 = the caller asked for something this guard does not do. */
export const EXIT_USAGE = 2;

/** Logins compare case-insensitively on GitHub, so they compare that way here. */
export function normalizeLogin(login) {
  return String(login ?? "")
    .trim()
    .toLowerCase();
}

/**
 * A machine account: a `[bot]` login, a payload `type: Bot`, or the mention target itself.
 *
 * @param {{ actor?: string|null, actorType?: string|null, target?: string }} [input]
 * @returns {boolean}
 */
export function isAutomationActor({ actor, actorType = null, target = MENTION_TARGET } = {}) {
  const login = normalizeLogin(actor);
  if (!login) return false;
  if (normalizeLogin(actorType) === "bot") return true;
  if (login.endsWith("[bot]")) return true;
  return login === normalizeLogin(target);
}

/**
 * Should this event put `needs-agent-reply` on the thread?
 *
 * @param {{ actor?: string|null, actorType?: string|null, target?: string,
 *   answering?: string[] }} input
 * @returns {{ apply: boolean, reason: string, login: string|null }} `reason` is one of
 *   `unknown-actor`, `automation`, `answering-identity`, `human-mention`.
 */
export function mentionQueueDecision({
  actor,
  actorType = null,
  target = MENTION_TARGET,
  answering = ANSWERING_IDENTITIES,
} = {}) {
  const login = normalizeLogin(actor);
  if (!login) return { apply: true, reason: "unknown-actor", login: null };
  if (isAutomationActor({ actor: login, actorType, target })) {
    return { apply: false, reason: "automation", login };
  }
  const answerers = answeringIdentities({ answering, target });
  if (answerers.includes(login)) return { apply: false, reason: "answering-identity", login };
  return { apply: true, reason: "human-mention", login };
}

/** Every login whose own words may not queue a thread, folded, deduped, in a stable order. */
export function answeringIdentities({
  answering = ANSWERING_IDENTITIES,
  target = MENTION_TARGET,
} = {}) {
  const logins = [...answering, target].map(normalizeLogin).filter(Boolean);
  return [...new Set(logins)].sort();
}

/**
 * The jq filter the workflow's re-scan applies to each body source.
 *
 * One inequality per answering identity, joined with `and`, so the answer's own mention is not
 * evidence of an unanswered mention. Deliberately free of `$`-variables: the workflow interpolates
 * this string inside double quotes, and a jq variable there would be expanded by the shell.
 */
export function answeringJqFilter({
  answering = ANSWERING_IDENTITIES,
  target = MENTION_TARGET,
} = {}) {
  const clauses = answeringIdentities({ answering, target }).map(
    (login) => `(((.user.login // "") | ascii_downcase) != ${JSON.stringify(login)})`,
  );
  return `select(${clauses.join(" and ")})`;
}

/** `--flag value` or `--flag=value`; `null` when the flag is absent. */
function arg(argv, name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1) return argv[index + 1] ?? "";
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

const USAGE = `usage: node scripts/mention-queue.mjs --actor <login> [--type <User|Bot>]
                                        [--target <handle>] [--answering <login,login>]
       node scripts/mention-queue.mjs --answering-jq | --answering-json

  exit 0  this event may queue the thread
  exit 3  it may not (the author answers, or is a machine)
  exit 2  the flags do not say what to decide`;

export function main(argv = process.argv.slice(2), io = { log: console.log, err: console.error }) {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.log(USAGE);
    return EXIT_QUEUE;
  }

  const answering = arg(argv, "answering", null);
  const target = arg(argv, "target", MENTION_TARGET);
  const declared =
    typeof answering === "string" && answering.length > 0
      ? answering
          .split(",")
          .map((login) => login.trim())
          .filter(Boolean)
      : ANSWERING_IDENTITIES;

  if (argv.includes("--answering-json")) {
    io.log(JSON.stringify(answeringIdentities({ answering: declared, target })));
    return EXIT_QUEUE;
  }
  if (argv.includes("--answering-jq")) {
    io.log(answeringJqFilter({ answering: declared, target }));
    return EXIT_QUEUE;
  }

  const actor = arg(argv, "actor", null);
  if (actor === null) {
    io.err(USAGE);
    return EXIT_USAGE;
  }

  const decision = mentionQueueDecision({
    actor,
    actorType: arg(argv, "type", null),
    target,
    answering: declared,
  });
  // The run log has to say *why* a thread did not queue: a silent skip is the failure mode that
  // made the label a liar in the first place.
  const verdict = decision.apply ? "queue" : "skip";
  io.log(`${verdict} actor=${decision.login ?? "unknown"} reason=${decision.reason}`);
  return decision.apply ? EXIT_QUEUE : EXIT_SKIP;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) process.exit(main());
