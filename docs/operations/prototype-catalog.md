# OPERATIONS — the prototype catalogue

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The prototype catalogue · prev [Orchestration rules](orchestration.md) · next [The public site](public-surface.md)

<!-- docs-nav:end -->

**Where prototypes are published, and what the two columns mean.** `https://alignsynch-mockups.vercel.app`
lists every HTML prototype as a link back to the original path, so a deep link like
`/p/project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html#relationship-detail`
opens the artefact itself, not a copy of its text.

| Question                         | Answer                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Who builds it?                   | `scripts/build-prototype-catalog.mjs` — `index.html` + `catalog.json` beside a verbatim copy of every prototype under `p/<path>` |
| When?                            | On every push to `main`, by `.github/workflows/prototype-catalog.yml`; never from a branch or a PR                               |
| Where does it deploy?            | Vercel project `alignsynch-mockups`, team `riolabs-ais-projects`                                                                 |
| Is it indexed?                   | No — the index carries `noindex,nofollow`. The files are public, not listed                                                      |
| Can a prototype be edited there? | No. The copies are byte-identical artefacts; edit the source file and merge again                                                |

## What the two columns mean

The catalogue used to guess both. It no longer does.

| Column      | Derived from                                                                                             | When it cannot be derived                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **date**    | `git log -1 --format=%cs -- <path>` — the last commit that touched the file                              | The row falls back to the file's mtime, prints in amber with a `*`, and carries `dateSource: "mtime"` in `catalog.json` |
| **version** | `git describe --tags --abbrev=0 <sha>` on that same commit — the nearest release tag the file shipped in | The row prints `—` and carries `version: null`, `versionSource: "none"`                                                 |

`catalog.json` therefore answers _where each fact came from_, per row: `dateSource` is `git` or `mtime`,
`versionSource` is `tag` or `none`, and `untracked` is true exactly when the file is in no repository.
A filename that happens to contain `v2` is not evidence and is not read.

**`git describe` takes a commit, not a path.** `git describe --tags --abbrev=0 -- <path>` exits with
`fatal: Not a valid object name <path>`; the builder resolves the commit first and describes that.

## Running it by hand

```bash
node scripts/build-prototype-catalog.mjs --root <prototypes dir> --out .catalog-site \
  --min-entries 250 --require project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html
```

`--min-entries` and `--require` exist because a build that quietly loses most of its rows is worse than
a red workflow: the workflow passes both, so a checkout that cannot see the full set fails instead of
publishing a short catalogue over a complete one.

A root that does not exist is a **hard error** by default, for the same reason: a `--root` that was
typed and does not resolve is a broken run, and it must not read as a successful empty one. `--allow-empty`
says "an absent root means there is nothing to publish yet"; it writes no output at all — a previous
build in `--out` is left exactly where it is — and it excuses nothing else (too few rows still fails
`--min-entries`, a missing `--require` target still fails). The workflow does not pass it; it gates the
build step on the tree instead, so CI keeps the strict default.

## Secrets the workflow needs

| Name                | What it is                                    | If it is absent                                                                            |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel token scoped to `riolabs-ais-projects` | The first step fails with `::error::VERCEL_TOKEN is not set` — it does not skip the deploy |
| `VERCEL_ORG_ID`     | `team_kA2uEuTmRU2RhACF1Len0GES`               | The deploy step fails naming the missing secret                                            |
| `VERCEL_PROJECT_ID` | `prj_rr0WB1ExFvmLWgT7vZPat4Tq2iQ7`            | The deploy step fails naming the missing secret                                            |

`fetch-depth: 0` in the checkout is load-bearing: a shallow clone has neither history nor tags, and
every row would be marked as an mtime guess.

## Two absences, two answers

Only 77 of the 252 rows are in a repository (54 in `docs/`, 23 in an unrelated local tree); the other
175 — including the deep-link target above — live on one workstation. The workflow therefore expects the
prototypes at `./prototypes` (override: the repository variable `PROTOTYPE_ROOT`), and the decision that
commits them is tracked in issue 1405. Until then the default root is legitimately absent, and the
workflow has to survive a tree with nothing to publish without going quiet about a tree it cannot read.

| What the tree looks like                                             | Workflow                                                                                                                  | Builder                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `./prototypes` absent, no `PROTOTYPE_ROOT` set                       | green, one step: `::notice::prototype root absent (./prototypes) — nothing to build yet`; nothing built, nothing deployed | exit 1 — `--allow-empty` is how a caller says "nothing to build" |
| `PROTOTYPE_ROOT` set to a path that is not in the tree (a typo)      | red: `::error::PROTOTYPE_ROOT is set to '…' but that directory does not exist in this tree`                               | exit 1 — the workflow passes no flag                             |
| root present, fewer rows than `--min-entries`, or a `--require` gone | red                                                                                                                       | exit 1                                                           |
| `VERCEL_TOKEN` absent                                                | red, naming the secret                                                                                                    | n/a                                                              |
| build error, or a deploy that never converges                        | red, naming the reason                                                                                                    | exit 1                                                           |

The one judge is the `detect prototype root` step; every step that needs the tree — the token, the build,
the deploy, the smoke check — is gated on its `present` output. So the answer is one visible line in the
log rather than a stack of skipped steps, and **the two failures stay different**: "no input yet" is a
notice, "input is broken" is a failure. A named root that does not resolve is the second one, which is why
a typo fails instead of skipping — a guard that skipped on any absent directory would turn a wrong
`PROTOTYPE_ROOT` into a green run that deployed nothing, which is the state this workflow exists to make
impossible.

## What this page is not

It is not a catalogue. The live site is. This page is the mechanism — how a row gets its date, why a
version is missing, and what breaks when a token is absent.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The prototype catalogue · prev [Orchestration rules](orchestration.md) · next [The public site](public-surface.md)

<!-- docs-nav:end -->
