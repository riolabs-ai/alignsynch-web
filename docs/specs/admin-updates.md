# Spec: the update ledger — one validated entry per pull request

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › The update ledger · prev [Specifications index](README.md) · next [AS2 redesign — asset sources and credits](spec-as2-style-home-redesign/ASSET-SOURCES.md)

<!-- docs-nav:end -->

Owner ask (2026-11-21): _"better stakeholder/admin updates for each commit and links to the Admin
Specs."_ This is the document that ask produced, and the first entry in the ledger it describes
points here.

## Recommendation (read this first)

**One JSON entry per pull request, authored in the PR and validated by a required check, rendered at
`/admin/docs/updates`.** Not a bot commit per merge, and not a mail per merge:

| Question                    | Answer                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Where does the record live? | `docs/changelog/updates/<pr>.json` — in the tree, in the PR that makes the change   |
| What makes it true?         | `data:check` E44 (the rule this document calls **E-updates**) refuses a bad entry   |
| Where does it surface?      | `/admin/docs/updates`, newest first, with each `specs[]` path linked or marked      |
| What does a release add?    | `/admin/docs/releases` lists each entry's merges with their ledger rows beside them |
| What does the mail do?      | One line, `Per-commit record: /admin/docs/updates` — the digest stays per tag       |

## What existed before this (measured on `main` 626ed6eb1)

| Surface                | Source                                              | Granularity |
| ---------------------- | --------------------------------------------------- | ----------- |
| `/admin/docs` hub      | `docs/docs.json` → `docs/**/*.md`                   | a document  |
| `/admin/docs/features` | `CHANGELOG.md` + `releases.json` + `docs/docs.json` | per release |
| `/admin/docs/releases` | `CHANGELOG.md`, a section per version               | per release |
| Stakeholder mail       | `scripts/release-notify.mjs`, the tag's entry       | **per tag** |

The gap was exactly what the owner named: **nothing recorded what a single merge changed, and
nothing connected a merge to the document its rule now lives in.** A reader could see a release
theme and a list of documents; they could not see "PR #1337 changed the demo writer guard on
2026-11-21, and the rule now lives in `docs/getting-started/demo.md`".

## The entry

```json
{
  "pr": 1337,
  "sha": "8c57a1864",
  "date": "2026-11-21",
  "area": "db",
  "summary": "One endpoint table replaces the derived production marker, so every script that can write to a Neon branch refuses a production endpoint before it connects.",
  "reader_impact": "Nobody yet — the change is a refusal in the scripts, and the first person it stops is an operator whose .env.local says demo while the host is production.",
  "specs": ["docs/getting-started/demo.md"],
  "risk": "low"
}
```

| Field           | Rule                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| filename        | `<pr>.json` — the number is the pull request, and `pr` must agree with it                      |
| `sha`           | optional; 7–40 hex characters                                                                  |
| `date`          | ISO-8601 (`YYYY-MM-DD`, or that date with a time and an offset); an impossible date is refused |
| `area`          | one conventional-commit scope, lowercase (`admin`, `ci,docs`)                                  |
| `summary`       | one sentence, what changed, no adjectives, at most 240 characters                              |
| `reader_impact` | one sentence, who notices and where; `Nobody` is legal **only** with `risk` set to `none`      |
| `specs`         | one or more real documents under `docs/` — the link a reader follows                           |
| `risk`          | optional: `none` / `low` / `medium` / `high`                                                   |

Unknown keys are refused, the same rule every fixture in `data/` follows.

## The check — E44, the spec's E-updates

`scripts/data-check.ts` runs `scripts/updates-check.ts` over the ledger on every gate run:

- every `<pr>.json` parses, names its own PR, and satisfies the table above;
- every `specs[]` path exists in the tree;
- a `feat` or `fix` commit in `<base>..HEAD` must have **added** an entry — a modified one is not the
  record of this change;
- when the base ref cannot be resolved, the gate prints the reason instead of passing quietly.

A check nobody has seen fail is not a check, so the PR that landed this rule ran `pnpm data:check`
against a deliberately broken entry (a non-ISO `date` and a `specs` path that does not exist) and
pasted that output beside the green run.

## The screen

`/admin/docs/updates` renders the ledger newest first: date · area · PR · summary · reader impact ·
**spec links** · risk. Two gates in the order every console screen uses —
`requireAdminProduct()` then `requireAdmin()` — `force-dynamic`, and no clock in the render.

A spec in `docs/docs.json` links to `/admin/docs/<path>`. A spec the hub does not carry is printed
with a visible **not in the hub** marker rather than linked: a link to a 404 is worse than a path a
reader can search for.

## The release page

`/admin/docs/releases` gained, per release, the merges its entry names — each with the ledger row for
that PR beside it: who notices, where the rule lives, and a link to the entry. A merge whose PR wrote
no entry says so; the ledger starts at its first merge, so an older release is short there and that
is the record, not a gap.

## The mail

The per-tag digest is unchanged except for one line: `Per-commit record: /admin/docs/updates`.

The written spec said "appends one line". It is rendered **above** the Known limits block instead of
after it, because the note's own rule — it must end on what does not work yet — is older than this
spec, and a navigation hint below the limits would be the last thing a reader reads. The line itself
is the spec's sentence, verbatim.

## Explicitly not built

- **Per-commit stakeholder email.** A commit is an implementation unit, not a reader unit; mailing
  each one trains people to ignore the list and buries the release note that matters. The ledger plus
  the per-tag mail is the cadence.
- **A backfill of the last N commits.** The ledger starts at the first merge after it landed.
  Retro-fitted entries are invented entries.
- **Editing an entry in the app.** The file is the record; an admin editing history in a UI is a
  different product.
- **A bot commit per merge.** It puts a commit on `main` per merge, re-triggers the gate and races the
  next merge on the same file. The entry is authored by the person who made the change, which is also
  the only version of it that carries a judgement (`reader_impact`, `risk`).

## Failure that produced this

`t_8cb020e2` found the shared checkout's `.env.local` pointing at production while labelled `demo`,
and `demo:verify` passing on production data. Merges `#1335` and `#1337` fixed it. Nothing in
`/admin/docs` recorded either change, and no document gained the rule — the finding lived in a card
and a PR description, which is where knowledge goes to die. `#1337` is the ledger's first entry, and
this document is what it points at.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › The update ledger · prev [Specifications index](README.md) · next [AS2 redesign — asset sources and credits](spec-as2-style-home-redesign/ASSET-SOURCES.md)

<!-- docs-nav:end -->
