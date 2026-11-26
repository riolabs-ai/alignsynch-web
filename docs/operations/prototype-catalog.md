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

## Secrets the workflow needs

| Name                | What it is                                    | If it is absent                                                                            |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel token scoped to `riolabs-ais-projects` | The first step fails with `::error::VERCEL_TOKEN is not set` — it does not skip the deploy |
| `VERCEL_ORG_ID`     | `team_kA2uEuTmRU2RhACF1Len0GES`               | The deploy step fails naming the missing secret                                            |
| `VERCEL_PROJECT_ID` | `prj_rr0WB1ExFvmLWgT7vZPat4Tq2iQ7`            | The deploy step fails naming the missing secret                                            |

`fetch-depth: 0` in the checkout is load-bearing: a shallow clone has neither history nor tags, and
every row would be marked as an mtime guess.

## The open question

Only 77 of the 252 rows are in a repository (54 in `docs/`, 23 in an unrelated local tree); the other
175 — including the deep-link target above — live on one workstation. The workflow therefore expects
the prototypes at `./prototypes` (override: the repository variable `PROTOTYPE_ROOT`). Until they are
there, the first `main` run after this lands is red by design, which is the honest state: the decision
is tracked in issue 1405.

## What this page is not

It is not a catalogue. The live site is. This page is the mechanism — how a row gets its date, why a
version is missing, and what breaks when a token is absent.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The prototype catalogue · prev [Orchestration rules](orchestration.md) · next [The public site](public-surface.md)

<!-- docs-nav:end -->
