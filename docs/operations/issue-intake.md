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

## Changing it

**The form's first field label and the workflow's heading check are one mechanism.** GitHub renders
an issue form's answers as `### <field label>`, so `### Surface` is a consequence of the form's label
being exactly `Surface`. Renaming the field silently turns form filings into "freeform" and the
workflow starts replying to them. Change both files or neither.

Two things this deliberately does not do: it does not classify beyond `draft`, and it never edits,
closes or re-titles an issue that already exists — that is triage's job, not intake's.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › Issue intake · prev [V1 retirement](history/V1-RETIREMENT.md) · next [Iteration rhythm](iteration.md)

<!-- docs-nav:end -->
