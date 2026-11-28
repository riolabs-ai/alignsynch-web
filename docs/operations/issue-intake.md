# Issue intake — how freeform feedback lands classified

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › Issue intake · prev [V1 retirement](history/V1-RETIREMENT.md) · next [Iteration rhythm](iteration.md)

<!-- docs-nav:end -->

Founder feedback reaches this repository two ways, and only one of them used to arrive in a shape
anything downstream could use. Twelve issues (#1354–#1365) came in as a title, a paragraph and a
pasted screenshot: **0 labels, 0 milestone, 0 acceptance criteria**, and two of them carrying the
same title — so nothing could tell them apart or find them again.

Both paths now end in the same vocabulary, and `draft` is the entry point to it.

| Path         | What the author does                                                             | What lands                                                                               |
| ------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Form**     | New issue → **Founder feedback** (`.github/ISSUE_TEMPLATE/founder-feedback.yml`) | Labelled `draft` by the form itself; answers render under `### <field label>` headings   |
| **Freeform** | Types a title and a body                                                         | `.github/workflows/issue-intake.yml` adds `draft` and replies with a pointer at the form |

`draft` means **pre-triage proposal, not ready to card** — it is not a rejection, and it is removed
when the issue is classified into `needs-info`, `needs-decision`, an `area/*` label, `bug` or
`enhancement`. A `draft` issue is one nobody has promised to schedule.

## The form

Fields, in order — the first one is the contract with the workflow, see below:

| Field id   | Label                   | Type     | Required |
| ---------- | ----------------------- | -------- | -------- |
| `surface`  | Surface                 | input    | yes      |
| `now`      | What it says now        | textarea | yes      |
| `should`   | What it should say / do | textarea | yes      |
| `evidence` | Evidence                | textarea | no       |
| `type`     | Type                    | dropdown | yes      |

The form cannot upload files, so **Evidence** is a textarea that says to paste the screenshot after
submitting. The four `Type` options — question, requested change, decision needed, something broken
— are the four answers triage can give, and they are the only classification the form attempts.

## The workflow's decision, and which half of it matters

The job runs on `issues: [opened]` and does nothing when an issue is **both** written by a maintainer
(`author_association` ∈ `OWNER`, `MEMBER`, `COLLABORATOR`) **and** carries a `### Surface` heading.
Anything else gets the label and the reply.

The heading test is the load-bearing one, and that is measured rather than assumed: the founder is a
**`COLLABORATOR`**, so the association test alone labels none of the twelve, and none of them carry
a `### Surface` heading. The association test only keeps maintainers' own freeform issues out of the
queue.

It is idempotent by the label: the form labels its own issues at creation, so the check runs before
any write and a re-run posts no second reply. `continue-on-error` is deliberately absent — a run that
cannot write the label fails loudly, because intake that quietly stopped classifying looks exactly
like intake that works. The workflow's whole grant is `permissions: issues: write`; it needs no
checkout, no Node, no secret and no third-party action.

## Triage — the repair pass, and it is a table

`draft` is where intake stops. `pnpm triage:founder` (`scripts/triage-founder-issues.mjs`) is what
turns a `draft` — or any of the twelve already filed — into something the board can schedule. It is
**fully deterministic**: an ordered keyword table, no model in the loop, because this is the one path
that writes to someone else's issue.

```bash
pnpm triage:founder                      # the plan, as a table. Writes nothing, needs no token
pnpm triage:founder --json               # the same plan as JSON
pnpm triage:founder --issue 1363         # one issue
pnpm triage:founder --apply --issue 1363 # write that one issue
```

What a row decides, in this order:

| Question      | Answer                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Area**      | the first row of `AREA_TABLE` that matches: billing → flow → ui → product                |
| **Class**     | the first row of `CLASS_RULES` that matches: `?` → enhancement → bug                     |
| **Milestone** | the area's pool, `v2.deferred` when a parked term matched, otherwise none — by **title** |
| **Title**     | `area/<x>: <claim>`, the claim stripped of the founder's `… Questions -` prefix          |

Anything the table cannot place is `needs-info` with **no milestone** — an honest miss, never a guess.

**The milestone is a title prefix, never a number.** `DESTINATION_MILESTONE = "v2.2.0"` and
`PARKED_MILESTONE = "v2.deferred"` are resolved against the repo's open milestones at run time
(`resolveMilestone`), because a number is a local handle: the re-pool of 2026-11-26 closed #28,
moved the founder flow into `v2.2.0 — the member surface` (#32), and a table hard-coding `28` stopped
the whole workflow. A handle that resolves to nothing is a named refusal — the run prints every open
milestone it saw and exits 1, and `--apply` writes nothing rather than inventing a pool. A title
prefix survives a re-pool, because the pool keeps its name when GitHub hands it a new number. A claim
this tool already rewrote (`area/flow: …`) is normalised back to the claim, so a re-triage does not
stack a second prefix on the founder's title.

Two issues that normalise to the same claim are _named_ as possible duplicates
(`Possible duplicate of #N — …`) and get their own number as a title suffix; `duplicate` is applied to
neither, and nothing is closed. The original title is preserved verbatim in the appended block, because
the title is the one field this tool rewrites.

**The body is append-only.** The write is `original + "\n\n---\n\n" + block`, and the block goes on
the end carrying the marker `<!-- hermes-triage:v1 -->`, the class/area/surface line, whether a
decision is needed, a proposed acceptance line and the original title. `composeBody` asserts the
original prefix byte for byte before anything is written; `tests/founder-triage.test.ts` pins it. The
marker is also what makes the pass idempotent: an issue whose newest marker comment is not older than
its last edit is skipped, with a minute of grace for the write that created the marker.

**Identity.** Reads use the ambient `gh` session with `GH_TOKEN` removed from the environment; every
write goes through `~/.hermes/profiles/alignsynch/bin/gh-id.sh app …`, so comments and label changes
are attributable to the project's own identity, `alignsynch-fleet[bot]` (a GitHub App installation
token — there is no `alignsynch` PAT). Note the argument shape: `gh-id.sh` **execs `gh` itself**,
so it is `gh-id.sh app issue edit 1363 …` — adding a second `gh` runs `gh gh issue edit`, which prints
help, exits 0 and writes nothing. The identity is proved once before the first write, and the login
comes from the wrapper rather than from `gh api user`: GitHub answers `/user` with `403 Resource not
accessible by integration` for installation tokens, so that probe would refuse a credential that works.

**It never removes a label**, so a `draft` the intake workflow added is cleared by hand once triage
has classified the issue. That is deliberate: `--remove-label` on someone else's issue is not a repair
this tool is allowed to make unattended.

## Changing it

**The form's first field label and the workflow's heading check are one mechanism.** GitHub renders
an issue form's answers as `### <field label>`, so `### Surface` is a consequence of the form's label
being exactly `Surface`. Renaming the field silently turns form filings into "freeform" and the
workflow starts replying to them. Change both files or neither.

Two things intake deliberately does not do: it does not classify beyond `draft`, and it never edits,
closes or re-titles an issue that already exists — that is triage's job, not intake's.

**The triage table is edited, never bypassed.** A founder issue that classifies wrongly is a row that
is missing a noun or a keyword, and the fix is a line in `AREA_TABLE`, `CLASS_RULES` or `SURFACE_RULES`
with a test beside it — not a hand edit to the issue, which the next `--apply` would overwrite with the
table's answer. Every table is ordered and the order is asserted, because "billing before flow" is a
decision, not an accident.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › Issue intake · prev [V1 retirement](history/V1-RETIREMENT.md) · next [Iteration rhythm](iteration.md)

<!-- docs-nav:end -->
