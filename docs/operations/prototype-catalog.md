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

## Where the prototypes come from

The site used to be a snapshot assembled by hand, so 175 of its 252 rows existed only on one
workstation and no main-branch build could reproduce it. The prototypes are now committed, and the
builder's sources are declared in one place (`DEFAULT_SOURCES` in the script):

| Source                     | Catalogue path           | Rows | What it is                                                                                                                    |
| -------------------------- | ------------------------ | ---: | ----------------------------------------------------------------------------------------------------------------------------- |
| `prototypes/project-spec/` | `project-spec/…`         |  167 | the approved design handoffs, committed byte-identical to what the live site serves                                           |
| `prototypes/project-reqs/` | `project-reqs/…`         |    3 | the requirement exhibits from the same history                                                                                |
| `docs/`                    | `quizhub/quizhub/docs/…` |   55 | this repo's docs tree; the long `quizhub/quizhub` prefix is kept because it is the path every existing deep link already uses |

225 rows in total. The old snapshot's 252 also counted 24 pages of `inbox/` — scratch, not product
history, and deliberately **not** published — and four incidental HTML files the walker picked up
(`quizhub/documentation/…` and `lib/quizhub/…` copies of the same player page). Neither is a
prototype, so neither is committed, and the live catalogue is 27 rows smaller than the snapshot for
that reason alone.

An empty prefix means a file keeps its path relative to the source directory; `--source
<dir>[:<prefix>]` declares an extra one, and two sources claiming the same catalogue path is a
refusal rather than a last-write-wins.

## What the two columns mean

The catalogue used to guess both. It no longer does.

| Column      | Derived from                                                                                                                                                                                      | When it cannot be derived                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **date**    | `git log -1 --format=%cs -- <path>` — the committer date of the last commit that touched the file                                                                                                 | The row falls back to the file's mtime, prints in amber with a `*`, and carries `dateSource: "mtime"`, `untracked: true` in `catalog.json` |
| **version** | `git describe --tags --abbrev=0 <sha>` on that same commit — the nearest release tag reachable from it — plus `git rev-list --count <tag>..<sha>`, how many commits past that tag the file landed | The row prints `—` and carries `version: null`, `versionSource: "none"`                                                                    |

A version reads `v2.0.0-rc2+40`: the file landed forty commits after `v2.0.0-rc2`. The bare tag alone
would claim the file shipped _in_ that release, which is the same kind of guess as reading `v2` out of
a filename — so the distance is part of the value, and `versionTag` / `versionDistance` carry the two
halves separately.

`catalog.json` therefore answers _where each fact came from_, per row: `dateSource` is `git` or
`mtime`, `versionSource` is `tag` or `none`, and `untracked` is true exactly when the file is in no
repository. A filename that happens to contain `v2` is not evidence and is not read.

**`git describe` takes a commit, not a path.** `git describe --tags --abbrev=0 -- <path>` exits with
`fatal: Not a valid object name <path>`; the builder resolves the commit first and describes that.

## Running it by hand

```bash
pnpm catalog:build   # node scripts/build-prototype-catalog.mjs --out .catalog-site …
```

which is exactly what CI runs: `--min-entries 220 --fail-on-untracked --require
project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html`. The three guards exist
because a build that quietly loses most of its rows, or fills a date in from a file's mtime, is worse
than a red workflow:

- `--min-entries 220` — a checkout that cannot see the tree fails instead of publishing a short
  catalogue over a complete one (225 rows ship today; the floor leaves room to retire a few).
- `--require <path>` — the deep link in the card, so the one URL the release note names can never
  fall out of the set silently.
- `--fail-on-untracked` — a prototype that git does not track gets an mtime guess. The builder marks
  that row (`dateSource: "mtime"`, amber `*`); CI refuses it outright, so a guess can never ship as
  a date.

`.catalog-site/` is gitignored: it is the deploy input, not a committed artifact.

## Secrets the workflow needs

| Name                | What it is                                    | If it is absent                                                                            |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel token scoped to `riolabs-ais-projects` | The first step fails with `::error::VERCEL_TOKEN is not set` — it does not skip the deploy |
| `VERCEL_ORG_ID`     | `team_kA2uEuTmRU2RhACF1Len0GES`               | The deploy step fails naming the missing secret                                            |
| `VERCEL_PROJECT_ID` | `prj_rr0WB1ExFvmLWgT7vZPat4Tq2iQ7`            | The deploy step fails naming the missing secret                                            |

`fetch-depth: 0` in the checkout is load-bearing: a shallow clone has neither history nor tags, so
every date and every version would be a guess. The workflow proves the clone is not shallow before
it builds, and `--fail-on-untracked` is the second net.

## What this page is not

It is not a catalogue. The live site is. This page is the mechanism — where the rows come from, how a
row gets its date, why a version carries a `+N`, and what breaks when a token is absent.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The prototype catalogue · prev [Orchestration rules](orchestration.md) · next [The public site](public-surface.md)

<!-- docs-nav:end -->
