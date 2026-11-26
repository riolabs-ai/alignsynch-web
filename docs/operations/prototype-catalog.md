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

## The assets beside the pages (#1436)

A prototype page is an artefact and its `src`/`href` are its own words, so the catalogue adapts to
them: the file a page points at is published **at the path the page looks for**, not one the builder
chose. Until #1436 only `.html` was carried, so 170 pages published with none of their `css/`, `js/`,
`images/` or `fonts/` — every V2 prototype rendered unstyled on the live site while the row count
stayed green.

| Question                | Answer                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is committed?      | only what a tracked page references: **329 files, 22.7 MB** (135 png · 57 js · 45 css · 42 woff2 · 8 avif · 41 linked md · 1 json). The authoring tree is 370 MB — `.bak-*`, `reference/` and unlinked files stay out |
| How is it imported?     | `node scripts/import-prototype-assets.mjs --from ~/Desktop/dev.local/alignsynch` (the directory that _contains_ `project-spec/`); `--dry-run` prints the plan, `--report <file>` writes the page → target JSON        |
| What does the build do? | copies each page, then resolves every relative ref on it and copies that file to the same catalogue path; a stylesheet is followed one hop for `url(…)` so `@font-face` fonts arrive with the CSS                     |
| What is not an asset?   | root-relative refs (`/pricing`, `/admin/docs`) are the app's routes and are neither copied nor checked; `#anchor` fragments and external URLs are ignored                                                             |

Two failure modes, deliberately different:

| Ref                                                      | Verdict    | What happens                                                                                               |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| points at a css/js/image/font/json that nothing provides | **broken** | build exits 1 naming `page -> target`. Budget is zero — this is the class #1436 shipped                    |
| points at a sibling `.html` that exists nowhere          | **dead**   | printed as `dead: page -> target`, build still exits 0. No copy can fix it; it is prototype-owner evidence |

Every build prints the counts it judged, so a catalogue whose pages have nothing to check cannot pass
by having nothing to check:

```
assets: 411 copied (27.1 MB) | pages with no local refs: 49
assets checked: 1664 | assets broken: 0 | dead refs: 33 (reported, not failing)
```

`--min-assets 300` is the floor under those numbers (CI passes it); it is well below today's count and
still refuses a build whose copy pass found no pages to read.

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

which is exactly what CI runs: `--min-entries 220 --min-assets 300 --fail-on-untracked --require
project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html`. The guards exist
because a build that quietly loses most of its rows, or fills a date in from a file's mtime, or
publishes pages whose stylesheets 404, is worse than a red workflow:

- `--min-entries 220` — a checkout that cannot see the tree fails instead of publishing a short
  catalogue over a complete one (225 rows ship today; the floor leaves room to retire a few).
- `--min-assets 300` — the asset gate must have judged something: 1 664 refs are resolved today, and
  a build that checked none of them is a broken copy pass, not a clean catalogue.
- `--require <path>` — the deep link in the card, so the one URL the release note names can never
  fall out of the set silently.
- `--fail-on-untracked` — a prototype that git does not track gets an mtime guess. The builder marks
  that row (`dateSource: "mtime"`, amber `*`); CI refuses it outright, so a guess can never ship as
  a date.

Broken asset refs are not a flag: they are a hard exit 1 with `page -> target` named, and the only
budget is zero.

`.catalog-site/` is gitignored: it is the deploy input, not a committed artifact.

## Two absences, two answers

`prototypes/` is a tree that arrives by decision (#1405), so the workflow has to survive a checkout
that does not have it yet without going quiet about a checkout that is broken. One step decides — the
`detect prototype root` step — and everything that needs the tree is gated on its `present` output.

| What the tree looks like                                  | Workflow                                                                                                        | Builder                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `prototypes/` absent                                      | green: `::notice::prototype root absent (./prototypes) — nothing to build yet`; nothing built, nothing deployed | exit 1 — `--allow-empty` is how a caller says "nothing to build" |
| `docs/` absent                                            | red: `::error::the docs source (docs/) is missing from this checkout` — a broken tree, not an empty one         | exit 1                                                           |
| a declared source that does not resolve, in a hand run    | n/a                                                                                                             | exit 1 — a typo in `--source` is broken input, not missing input |
| root present, rows under the floor, or a `--require` gone | red                                                                                                             | exit 1                                                           |
| `VERCEL_TOKEN` absent                                     | red, naming the secret                                                                                          | n/a                                                              |
| build error, or a deploy that never converges             | red, naming the reason                                                                                          | exit 1                                                           |

The two failures stay different on purpose, and the quiet direction is the dangerous one: a guard that
skipped on _any_ absent directory would turn a wrong `--source` into a green run that deployed nothing.
So the default is the hard error, and `--allow-empty` is the caller's statement about its own tree —
it writes no output at all (a previous build in `--out` is left where it is), and a run where some
sources survive still has to clear `--min-entries`, `--require` and `--fail-on-untracked`. CI does not
pass the flag; it gates the steps instead, so the builder keeps its strict default there.

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
