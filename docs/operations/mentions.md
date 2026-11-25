# Mentions — how an `@alignsynch` comment reaches the lead

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › Mentions · prev [Iteration rhythm](iteration.md) · next [Migrations](migrations.md)

<!-- docs-nav:end -->

On 2026-11-23 at 08:59:51Z the owner addressed this account in a comment on
[#847](https://github.com/riolabs-ai/alignsynch/issues/847#issuecomment-7096092208) and **nothing
surfaced it** — no alert, no notification to read, no draft. It was found only because the owner
pasted the link. That is the gap this page describes the closure of: an `@alignsynch` mention is an
instruction, and it has to reach the lead with enough context to answer or triage.

GitHub has **no `mention` event**. A workflow cannot trigger on one — it would have to hook
`issue_comment`, `issues`, `pull_request_review_comment` and `pull_request_review` and grep four
payload shapes, and it would only fire where an Action is installed, which is not the identity that
answers here. So the mechanism is a poller: `scripts/watch-mentions.mjs` (`pnpm mentions:watch`).

## What it reads

Four sources, each queried with its own `since`, so a run is cheap and incremental:

| Endpoint                            | Catches                                     |
| ----------------------------------- | ------------------------------------------- |
| `GET /repos/{repo}/issues/comments` | conversation comments on issues **and** PRs |
| `GET /repos/{repo}/pulls/comments`  | inline review comments                      |
| `GET /repos/{repo}/issues`          | issue bodies (and PR bodies)                |
| `GET /repos/{repo}/pulls`           | PR bodies                                   |

Only `issues/comments`, `pulls/comments` and `issues` honour `since` server-side; `/pulls` ignores it
and answers with every pull in the repository, so the same cutoff is applied to all four locally. A
pull that answers from both collections is one alert, deduped by id.

**The match:** `/(?<![\w@])@alignsynch(?![\w-])/i`. Both sides matter — `ops@alignsynch.example` is an
address, `@alignsynch-web` and `@alignsynch_ops` are different accounts, and `@@alignsynch` is a
quoted mention. A near-miss is not an instruction, and alerting on one teaches the lead to stop
reading the alerts.

**What is never an instruction:** a mention in a bot-authored comment, a mention written by the
identity running the watch, and a comment carrying the watcher's own acknowledgement marker.

## What an alert carries

The point is context — a bare URL is not answerable:

- the comment: `html_url`, id, author, `author_association`, `created_at`;
- the thread: number, title, state, `labels[]`, `milestone.title`, and the `tier/*` label if present;
- the mention's own sentence(s), not the whole essay;
- the **three comments before it**, trimmed to 200 characters each — the steer, not just the mention;
- one line saying what is being asked of the lead.

## Running it

```bash
pnpm mentions:watch --dry-run --since 2026-11-23T08:00:00Z --json   # report, write nothing
pnpm mentions:watch --apply-cursor                                  # incremental, remembers
pnpm mentions:watch --help
```

`--dry-run` is the default and it is exclusive with `--apply-cursor`: a run that claims to be a dry
run never writes the cursor. Output is **one JSON document on stdout, and stdout is empty when there
is nothing new** — a cron wrapper delivers stdout only when it is non-empty, so a silent run costs the
reader nothing. The census (counts per source, what was skipped and why, the identity) always goes to
stderr.

The cursor lives at `~/.hermes/profiles/alignsynch/state/mentions-cursor.json` and is **never inside
the repository**: it is operator state about a remote, not a fixture, and a committed cursor would be
rewritten by every machine that ran a watch. It holds the last successfully processed `updated_at`
per source plus the seen-id set; a missing cursor means the run starts from `--since`.

The cron line a wrapper should run — hourly, and only the alert is delivered:

```cron
17 * * * * cd /home/jadenblack/Desktop/dev.local/alignsynch/quizhub/quizhub && pnpm mentions:watch --apply-cursor --json 2>>/tmp/mentions-watch.log
```

## The thread label — who may queue one

`.github/workflows/mention-queue.yml` is the durable half: it runs on GitHub's runners, so a
`@alignsynch` comment labels the thread `needs-agent-reply` even when the machine running this poller
is off. The label means _unanswered_, and that word is the whole rule: **an answer does not queue a
thread**, because an answer has to name the handle to be an answer. Measured on #1382 — replied at
2026-11-25T04:21:21Z, label cleared six seconds later, and put back by run `45546210272` — because
the labeller read the body and never the author.

The guard is a named function in `scripts/mention-queue.mjs`, and the workflow calls it rather than
carrying a copy of the rule in YAML. It skips an answering identity (`jadenblack`), any `[bot]`
account and `@alignsynch` itself, and queues everyone else: the founder asking, the reviewer asking,
any human whose comment names the handle. **The repository owner is not skipped implicitly** — the
owner account here is the founder's, and it is the one that writes the mentions, so skipping it would
leave the queue permanently empty. Where the owner _is_ the answerer, that install declares it on the
script's `--answering` line. Clearing is never behind the guard: an answerer may not queue a thread
and must still be able to clear one, so the verdict gates `add_label` and nothing else, and a guard
that cannot decide fails the run instead of skipping it silently.

## Two rules that are not negotiable

**It never answers.** There is no model anywhere on this path: the script extracts and reports, and
the lead writes the reply. A wrong automatic reply on a founder-facing thread is worse than a late
one.

**It never writes to GitHub.** It posts, edits, labels, closes and reacts to nothing. Replying is a
separate card, and the identity is the lead's (`jadenblack`, the plain `gh` default) — GitHub cannot
re-author a comment, so a reply under the wrong account can only be deleted and reposted.

**Which login runs the watch matters.** The watch resolves `gh api user --jq .login` and treats that
login's own comments as self-talk. `GH_CONFIG_DIR=~/.config/gh-alt` resolves as `riolabs-ai`, and
under that override every owner mention reads as self-authored and is silently skipped. The census
line prints `identity=<login>` on every run so a wrong identity is visible in the first output instead
of being invisible; `--identity` pins it when a wrapper knows better.

## Proving it

```bash
pnpm exec vitest run scripts/__tests__/mention-watch.test.ts   # the regex, the skips, the cursor, `since` on every source
pnpm exec vitest run tests/mention-queue.test.ts               # who may queue a thread, and the CLI contract the workflow reads
bash scripts/verify.sh                                         # the gate
```

The card that landed this pinned the #847 comment as the fixture: comment `7096092208`, thread
`#847`, `area/billing`, `area/admin`, `needs-decision`, `tier/R1`, milestone `v2.0.0-rc2 — the pool`.
It also proves idempotency the way the cron depends on it — the same window with the cursor applied a
second time prints **0 bytes**.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › Mentions · prev [Iteration rhythm](iteration.md) · next [Migrations](migrations.md)

<!-- docs-nav:end -->
