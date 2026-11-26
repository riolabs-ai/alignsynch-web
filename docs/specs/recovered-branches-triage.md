# Recovered branches — the unlinked set, triaged

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Recovered branches · prev [Prototype wiring](prototype-wiring.md) · next [Specifications index](README.md)

<!-- docs-nav:end -->

> **Status:** triage only. Measured against `origin/main` `0ebca6823` (2026-11-25 08:23 -0300).
> **Nothing in this card merged a branch, deleted a branch, or changed a line of the tree.**
> The one live branch below became an issue; the rest are recorded so the next audit does not re-probe them.

## Why this exists

The 2026-11-25 repo audit covered the **271 branches tied to a card** and found 2 salvageable
artefacts (issue #1400). It skipped the branches with no card link on the guess that they were
"mostly old release prep". This card measured that guess instead of trusting it.

| | count |
| --- | --- |
| local branches in the audit's census | 858 |
| …with no card link (`branches.csv`, `card` empty) | 587 |
| …of those, holding commits `main` does not have | **587** |
| …that merge into `origin/main` with no textual conflict (`git merge-tree`) | **55** |
| …that conflict | 532 |

**Delta against the card's 568 / 53.** This recount is 19 branches and 2 clean branches larger. The
audit's two numbers came from a filter that was not kept with its output and could not be
reconstructed; the census in `~/local/rio/archive/alignsynch-salvage-2026-11-25/` lists 587 no-card
branches with commits outside `main`. Rather than re-derive a definition to match a remembered
number, **all 55 were classified** — a superset of the card's 53 — and the 19 extra branches are in
the table below. Nothing is lost either way.

**A clean merge is not a wanted merge.** `merge-tree` says git found no conflicting hunk. It says
nothing about intent, and the numbers below show why that matters: of 55 branches that merge
cleanly, **51 are superseded** — 45 landed under their own commit message, one more landed under a
different message, four are demo mirrors with no unique file, one records a decision already taken —
3 are experiments or captures nobody owns, and **1 is real**.

## Result

| class | count | meaning |
| --- | --- | --- |
| **WANT** | 1 | still valuable, nothing on `main` does it — became an issue |
| **SUPERSEDED** | 51 | `main` already does it: landed through a squash, relocated by the `docs/` reorg, or a demo mirror with no unique file |
| **ABANDONED** | 3 | an experiment or a capture nobody owns; the surface it measured is gone |

## Method

Per branch, in this order — each step can only downgrade the previous one:

1. **`git merge-tree --write-tree origin/main <branch>`** — the probe the audit used. It decides the
   candidate set and nothing else.
2. **Is the tip's tree identical to its merge base?** A branch of merges only has nothing to salvage
   however clean it applies. That is `demo`, `work/demo-onto-main`, `wt/demo-refresh-1201`,
   `feat/p2-wu-10-battle-daily-modes`, `fix/demo-panel-signin-message-216` and `probe/preview-suppression`.
3. **Does `main` carry this branch's own commit subject?** A squash landing keeps the message and
   appends `(#N)`. `git log main --grep <subject> --fixed-strings` found the landing commit for
   **45 of 55**; `card/zod4-migration` landed under a different message (`1d8f0d495`, #578), which
   step 4 found. The `Evidence` column names each sha.
4. **For the rest, does `main` have the file at all, and does it carry the text?** A missing path can
   mean "never landed" or "the #965 docs reorg moved it"; the reorg's own hub says
   `operations/history/` is where superseded records go, so every relocated document is
   SUPERSEDED with its new path. For code, the branch's added lines were tested against `main`'s
   copy of the same file.
5. **Only then, read the change.** The one survivor was read in full.

**Limits, stated plainly.** Steps 3 and 4 prove what `main` contains, not that the surviving content
is the same change — a rewritten fix with the same intent scores as landed, which is the correct
answer for a salvage list and the wrong one for a code review. Text presence is evidence, never
proof: the `finish/brand-mark-icons` branch is marked landed because `main` states the transparent
ground in different words, not because its lines are there.

## The one WANT — `feat/dev-ready-seats`

| | |
| --- | --- |
| branch | `feat/dev-ready-seats` (1 ahead, 291 behind, last commit 2026-11-11) |
| source | `29a55fe3d` — feat(dev): pnpm dev:ready seeds the accounts a local login needs (#822) |
| size | 4 files, +385: `lib/dev/ready.ts` (120), `scripts/dev-ready.mjs` (158), `tests/dev-ready.test.ts`, one script row |
| still applies | yes — `merge-tree` clean, and it imports `loadEnv`/`repoRoot` from `scripts/load-env.mjs`, which `main` still exports |

The loop it removes: start the server, open `/demo`, type the PIN, get no role buttons because
`demo_account` is empty, remember the fix is `pnpm db:seed` — which takes the fleet-wide `algn/1`
advisory lock even when nothing is wrong, parking a second worktree's `pnpm dev` behind
`SEED_LOCK_WAIT_SECONDS`. The branch is a three-count census with no lock, a **pure** decision
function (`lib/dev/ready.ts`, tested without a database or `process.env`), then a seed only when the
census says so, then `next dev` with the caller's stdio.

`main` has half of this: `pnpm db:seed:check` (#865) is already the lock-free read, and
`pnpm db:seed --demo-accounts` (#919) already creates the three PIN accounts. What no command does
is **decide**: answer "seed or start" without a person reading a drift report, and name the missing
`ADMIN_NN` seats that a seed cannot create because only half the pair is set. So the issue is scoped
to the residual and told to reuse `--check` rather than add a second census — see #1401.

## All 55, classified

`ahead/behind` and `last commit` are against `origin/main` at `0ebca6823`. `files` is the count of
paths the branch changes relative to its merge base.

| branch | ahead/behind | last commit | files | what it was for | class | evidence on `main` |
| --- | --- | --- | --- | --- | --- | --- |
| `feat/dev-ready-seats` | 1/291 | 2026-11-11 | 4 | `pnpm dev:ready` — start the dev server on a branch whose accounts exist, seeding only when a lock-free census says to. | **WANT** | Nothing like it is on main: no `dev:ready` script, no `predev` hook, no `lib/dev/`. `scripts/load-env.mjs` still exports both functions it imports, and `pg` is a dependency, so it ports cleanly. Issue #1401. |
| `feat/p2-wu-10-battle-daily-modes` | 7/741 | 2026-10-29 | 0 | P2 WU-10: battle modes and daily-challenge rewards as records, copy via `PageCopy`. | **SUPERSEDED** | Landed as `e99d6debb` (#57). Tree is now byte-identical to the first parent it merged, so the branch holds no unique file. |
| `docs/p2-inventory` | 4/768 | 2026-10-29 | 2 | P2 literal-string and media inventory: 12 ranked work units, plus the `hits.csv` extraction. | **SUPERSEDED** | Landed as `ba0292bba` (#59); the #965 docs reorg moved it to `docs/operations/history/P2-INVENTORY.md` + `history/p2-inventory/hits.csv`. The branch would re-add both at their October paths. |
| `wt/p1-pm-pin` | 2/749 | 2026-10-29 | 3 | Pin `packageManager` to pnpm 12.16.1 so the workspace stops resolving two versions. | **SUPERSEDED** | Landed as `88c142a31` (#87); `package.json` on main reads `"packageManager": "pnpm@12.16.1"`. |
| `chore/ignore-worktrees` | 1/747 | 2026-10-29 | 1 | Ignore `.worktrees/` so a git worktree per card stops showing up as untracked. | **SUPERSEDED** | Landed as `361ca7ae8` (#93); `.gitignore` on main carries `.worktrees/` at line 45. |
| `docs/agents-ci-sentence` | 1/763 | 2026-10-29 | 1 | Rejoin the CI sentence a stray blank line had split in `AGENTS.md`. | **SUPERSEDED** | Landed as `a57a2057c` (#69); `AGENTS.md:95` on main reads `queue group; the job name is \`typecheck / lint / build\`.` on one line. |
| `docs/wu-7-8-9-landed` | 1/738 | 2026-10-29 | 1 | Mark P2 WU-7/8/9 landed in the inventory (#54/#55/#56). | **SUPERSEDED** | Landed as `320f463df`; the file now lives at `docs/operations/history/P2-INVENTORY.md`. |
| `feat/188-lexicon-s1a` | 5/683 | 2026-10-30 | 3 | Lexicon stage 1a: the platform's own words in `content/metrics.ts`, `content/record.ts`, `scripts/data-check.ts`. | **SUPERSEDED** | Landed as `c0e9c74cd` (#188); main's `content/record.ts` carries "Every template is a record" and `metrics.ts` "per-record completion". |
| `fix/demo-panel-signin-message-216` | 5/667 | 2026-10-30 | 0 | A refused demo sign-in says what happened instead of "wrong PIN" (#216). | **SUPERSEDED** | Landed as `346c766a0` (#216). Tree identical to its merge base — nothing left to merge. |
| `chore/139-issue-templates` | 2/711 | 2026-10-30 | 3 | The three issue templates: feature, bug, template type. | **SUPERSEDED** | Landed as `baf35fbca` (#140); all three files are on main, and this card's issue is written from `feature.md`. |
| `lexicon-s1b/components-app` | 2/648 | 2026-10-30 | 6 | Lexicon stage 1b: `components/` and `app/` name the record, not the quiz. | **SUPERSEDED** | Landed as `27736b6f5` (#188); every one of its 28 added lines is present on main. |
| `docs/spec-drift` | 3/638 | 2026-10-31 | 1 | SPEC-DRIFT: the specification against the build, tiered. | **SUPERSEDED** | Landed as `0dfcd3cf1` (#268); now `docs/operations/spec-drift.md`. |
| `fix/271-pricing-security-claims` | 3/634 | 2026-10-31 | 1 | The pricing FAQ's security answer states what the app does, not what it never did (#271). | **SUPERSEDED** | Landed as `a871c0d88`; `components/pricing/pricing-faq.tsx` on main carries the corrected sentence. |
| `feat/265-marketing-database` | 2/635 | 2026-10-31 | 1 | The marketing page stops denying the database (#265). | **SUPERSEDED** | Landed as `3a4c45e48` (#279); `data/pages/marketing.ts` on main carries the copy. |
| `fix/news-championship-monetization` | 2/615 | 2026-10-31 | 1 | The championship article stops selling a tab and a plan; the monetization article drops invented creators. | **SUPERSEDED** | Landed as `2cf0147b4`; all six changed lines in `data/news-data.ts` are on main. |
| `probe/preview-suppression` | 2/595 | 2026-10-31 | 0 | Two probe commits: a preview with no opt-in marker, then an explicit `[preview]` request. | **SUPERSEDED** | Tree identical to the merge base — the probe answered its question and wrote nothing. |
| `docs/reference-mockups` | 1/640 | 2026-10-31 | 10 | The specification's 10 mockups plus an index saying what is worth borrowing. | **SUPERSEDED** | Landed as `6ff49441c`; the reorg moved the index to `docs/reference/mockup-index.md`, the images to `docs/reference/mockups/`. |
| `card/demo-branch-build` | 2/573 | 2026-11-01 | 1 | One branch builds besides production, and its name is in `vercel.json`. | **SUPERSEDED** | Landed as `8423cd6c8`; `vercel.json` on main carries the `ignoreCommand` that names `demo`. |
| `card/google-flow-measure` | 1/570 | 2026-11-01 | 4 | Measure the Google flow cookie's age and the verifier fingerprint at the finish (#351 follow-up). | **SUPERSEDED** | Landed as `62a7d2869`; all 49 added lines across `lib/auth/google-flow.ts` and the finish route are on main. |
| `docs/prototype-wiring` | 1/587 | 2026-11-01 | 1 | The prototype wiring plan: one screen exists, four cohorts never did. | **SUPERSEDED** | Landed as `cc8b331ea`; now `docs/specs/prototype-wiring.md`. |
| `docs/ui-divergence` | 1/593 | 2026-11-01 | 1 | The divergence table: every bespoke surface, one verdict per file. | **SUPERSEDED** | Landed as `87663a5e9`; its judgement half is now `data/ui-registry.ts` and the generated `docs/ui-registry.md`, which `verify.sh` checks against the tree. |
| `fix/not-found-brand-copy` | 1/577 | 2026-11-01 | 2 | The 404 renders the brand's heading and drops the empty suggestion band (#351). | **SUPERSEDED** | Landed as `70a4c7c1e`; `app/not-found.tsx` on main carries it. |
| `quizhub/QUIZHUB-CAPABILITY-MAP` | 1/591 | 2026-11-01 | 1 | The quiz capability map: every surface, what it is made of, what full-stack costs. | **SUPERSEDED** | Landed as `cb862e5cf`; now `docs/reference/quizhub-capability-map.md`. |
| `card/og-owner-png` | 4/500 | 2026-11-02 | 3 | Ship the owner's supplied share card PNG byte-identical and retire the drawn one. | **SUPERSEDED** | Landed as `aadbfd2d3` (#472); `app/opengraph-image.png` is on main and `app/opengraph-image.tsx` is gone. |
| `card/v1gate` | 2/529 | 2026-11-02 | 2 | Gate the prototype route group behind a session or the demo unlock. | **SUPERSEDED** | Landed as `a3d236e87` (#478); the whole `(prototype)` group was then deleted by #492, so the branch adds files for a route that no longer exists. |
| `card/registry-answer-inbound` | 1/486 | 2026-11-03 | 1 | The answer sheet's inbound paths name the report's CTA in `data/surface-registry.ts`. | **SUPERSEDED** | Landed as `7799c4fc7`; `data/surface-registry.ts:149-153` on main carries the "Answer your Aspects" clause. |
| `card/v1-disposition` | 1/491 | 2026-11-03 | 1 | Disposition all 118 `/v1` items into `docs/V1-RETIREMENT.md` (#478). | **SUPERSEDED** | Landed as `ad87993e8`; now `docs/operations/history/V1-RETIREMENT.md`. |
| `finish/brand-mark-icons` | 1/472 | 2026-11-03 | 4 | The icon docs name the transparent ground; parity only moves on a path. | **SUPERSEDED** | Landed as `e03eba84b`; `app/manifest.ts:14` and `app/layout.tsx:90` on main carry the transparency statement, `docs/operations/brand-release.md:52` the 64 % rule. |
| `fix/help-two-column` | 3/441 | 2026-11-04 | 25 | A sticky category rail beside the help answers and the person band beside the form (#547). | **SUPERSEDED** | Landed as `7d4c859b0`; `components/support/help-page.tsx` on main has `md:sticky md:top-24` and the two-panel shape. |
| `chore/branch-triage` | 1/432 | 2026-11-06 | 1 | The twelve non-main branches triaged by what proves each removal safe. | **SUPERSEDED** | Landed as `7b2368cec`; now `docs/operations/branch-triage.md`. |
| `qa/flow-validation-2026-11-07` | 3/404 | 2026-11-07 | 1 | The assessment flow walked end to end on demo, with its first breakpoint (#617-#619). | **SUPERSEDED** | Landed as `364bea28e`; the record now lives under `docs/qa/`, one directory per measurement. |
| `card/zod4-migration` | 2/430 | 2026-11-07 | 15 | Migrate `content/` to zod 4 and bump the dependency. | **SUPERSEDED** | Landed as `1d8f0d495` (#578); `package.json` on main reads `"zod": "^4.6.6"` and all 61 added lines are present. |
| `docs/org-move-ard` | 1/407 | 2026-11-07 | 1 | An ARD for moving AlignSynch into a dedicated GitHub organization. | **SUPERSEDED** | The move has happened: this checkout's remote is `riolabs-ai/alignsynch`. The record itself was dropped by the #965 reorg and is not in the hub. |
| `docs/pay-to-complete` | 1/394 | 2026-11-07 | 5 | Research, PRD, spec and ADR for pay-to-complete (v1.6.0). | **SUPERSEDED** | Landed as `1dd6ac4f5` (#619/#623); now `docs/specs/pay-to-complete/`, extended since with `PAYER-PRESENT.md` and `COPY-INVENTORY.md`. |
| `docs/v160-reminder-correction` | 1/386 | 2026-11-07 | 1 | v1.6.0's changelog entry stops claiming its reminders send in that tag (#638). | **SUPERSEDED** | Landed as `bcc3bd66d` (#648); the corrected line is in `CHANGELOG.md`. |
| `docs/agents-precard-proof` | 1/366 | 2026-11-08 | 1 | AGENTS.md: prove the tree before the first edit — the detached-HEAD trap. | **SUPERSEDED** | Landed as `2a532dc0e`; `AGENTS.md` on main carries the "prove the tree" block. |
| `docs/card-shadow-default` | 1/352 | 2026-11-08 | 1 | AGENTS.md: Card carries no shadow — elevation is a border, not the primitive's default. | **SUPERSEDED** | Landed as `02071992c`; the rule is in `AGENTS.md`. |
| `chore/notes-lapsed-ref` | 1/332 | 2026-11-09 | 2 | 1.10.0's lapsed-fix reference points at the issue that fixed it. | **SUPERSEDED** | Landed as `bb810348d`; the release page and `CHANGELOG.md` carry it. |
| `docs/mockup-795-one-card-one-detail` | 1/308 | 2026-11-11 | 1 | The approval artifact for #795: one card, one detail. | **SUPERSEDED** | Landed as `89beff684` (#797); now `docs/reference/mockups/one-card-one-detail-v1.html`, with a v2 beside it. |
| `docs/prototype-v8-round3` | 1/316 | 2026-11-11 | 1 | The v8 review artifact's draft path reads "Continue as Draft" (#780). | **SUPERSEDED** | Landed as `6c3688bda`; `docs/review/artifacts/prototype-relationship-lifecycle-v8.html` on main carries it. |
| `docs/v1-15-0-stage-4-says-what-the-tag-does` | 1/286 | 2026-11-12 | 1 | v1.15.0's release page says what stage 4 actually does. | **SUPERSEDED** | Landed as `5f658ac31` (#832). |
| `fix/relationship-edit-dialog-focus-wait` | 1/226 | 2026-11-12 | 1 | The relation-edit dialog's Escape close waits for Radix's focus restore. | **SUPERSEDED** | Landed as `70ba2660d` (#950); `tests/relationship-edit-dialog.test.tsx` on main carries the wait. |
| `fix/stage-one-input-overflow` | 1/290 | 2026-11-12 | 2 | A Stage 1 control fills its cell, so the name pair stops overflowing (#825). | **SUPERSEDED** | Landed as `8bf4caabf`; all 18 added lines in `components/assessment-flow/stage-one-fields.tsx` are on main. |
| `rev1039` | 2/167 | 2026-11-14 | 1 | flow:e2e follows the gates that exist — the membership stand-in and the checkout route. | **SUPERSEDED** | Landed as `6015efecc`; `scripts/flow-e2e.mjs` on main contains the repair (churned six times since). |
| `work/demo-onto-main` | 10/136 | 2026-11-15 | 0 | An earlier attempt at putting the demo deployment onto main (10 merges). | **SUPERSEDED** | Tree identical to the merge base — zero changed files. |
| `wt/demo-refresh-1201` | 8/141 | 2026-11-15 | 0 | A second demo refresh (8 merges, v1.20.1). | **SUPERSEDED** | Tree identical to the merge base — zero changed files. |
| `wt/v2-1120` | 2/118 | 2026-11-16 | 3 | Port the v2.0 token layer: calm party palette, locked 1-5 answer scale. | **SUPERSEDED** | Landed as `568e79e8e`; `app/globals.css`, `tailwind.config.ts` and `tests/v2-tokens.test.ts` on main carry it. |
| `chore/release-1220-reissue` | 1/105 | 2026-11-17 | 5 | Re-issue 1.22.0's entry and release page for the three v2.0 landings. | **SUPERSEDED** | Landed as `f344a3275`; superseded again by 2.0.0-rc1/rc2 (#1340). |
| `fix/docs-1189-chat-clause` | 1/91 | 2026-11-17 | 1 | The rc1 release page says the chat screen warns — only the docstring does. | **SUPERSEDED** | Landed as `7e65936a4`; `docs/changelog/v2-0-0-rc1.md` on main carries the correction. |
| `demo` | 19/26 | 2026-11-21 | 0 | The demo deployment branch: merges of main, nothing of its own. | **SUPERSEDED** | Tree is identical to the merge base — 19 commits, zero changed files. **It is the branch `vercel.json` names as the second deployment target, so it must not be deleted**; this triage classes it, it does not remove it. |
| `wt/env-matrix-refresh` | 1/24 | 2026-11-21 | 2 | Refresh the environment store census after the env render (#1338, #1339). | **SUPERSEDED** | Landed as `81883f1ee` (#1348); `docs/operations/env-stores.md` on main is the later census. |
| `wt/release-ledger-entry` | 2/19 | 2026-11-22 | 6 | Assemble the changelog entry from the update ledger — `scripts/release-ledger.mjs` plus its test. | **SUPERSEDED** | Landed as `767c489e6`; `scripts/release-ledger.mjs` and `tests/release-ledger.test.ts` are on main. |
| `docs/screenshots-160` | 3/699 | 2026-10-30 | 8 | Before/after captures for the token-density card (#160), 1440 and 390. | **ABANDONED** | 8 PNGs, never landed. `docs/qa/<issue>/` is the convention that replaced it, and the screens it captured have been redrawn twice since. |
| `docs/screenshots-187` | 1/684 | 2026-10-30 | 16 | Stage-1 chrome captures for #187, both brands, 1440 and 390. | **ABANDONED** | 16 PNGs, never landed; same replaced convention. `docs/qa/` holds the captures that came after. |
| `probe/lane-code` | 1/728 | 2026-10-30 | 1 | A one-line probe proving the code lane classifies in CI. | **ABANDONED** | One added line in `lib/utils.ts` that exists nowhere on main; it answered a CI question in October and has no owner. |

## Not in scope

- **The 532 conflicting branches** are not classified here. They need a different probe (a per-file
  ours/theirs read, not `merge-tree`), and the audit's own lesson is that "conflicts" and "wanted"
  are unrelated facts.
- **Deletion.** No branch was deleted. `allrefs.bundle` in
  `~/local/rio/archive/alignsynch-salvage-2026-11-25/` is the only current record of 868 refs and is
  not yet off-machine; deletion waits for that bundle to be verified somewhere else.
- **`demo`** is a deployment branch that `vercel.json` names. It has no unique file, and it still may
  not be deleted — the classification is about content, not about what the platform builds.

## Reproducing this

```bash
# 1. the candidate set: no-card branches with commits outside origin/main, probed with merge-tree
python3 measure.py measure.json     # 587 unlinked -> 55 clean, 532 conflict
# 2. per-branch evidence: files, subjects, main's churn on the same paths
python3 detail.py > detail.txt
# 3. does main already carry the branch's text?
python3 verify.py
# 4. which main commit carries the branch's subject?
python3 landedby.py
```

The four scripts are the harness this page was produced from. They are deliberately not in the repo:
they are a one-off census, and the durable output is this page.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Specs & design briefs** › Recovered branches · prev [Prototype wiring](prototype-wiring.md) · next [Specifications index](README.md)

<!-- docs-nav:end -->
