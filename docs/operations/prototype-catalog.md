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

225 rows in total. Beside those pages sit **329 asset files** (stylesheets, scripts, fonts, images
and the markdown the docs preview links to) — imported only because a page names them, never by
copying a tree. The catalogue carries them into the site; see
[the assets beside the pages](#the-assets-beside-the-pages-1436).

The old snapshot's 252 also counted 24 pages of `inbox/` — scratch, not product
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
- the **asset gate** — every published page's asset refs must resolve in the built output, and the
  counts print on every run (see [the assets beside the pages](#the-assets-beside-the-pages-1436)).
  A gate that resolved nothing is a red build, not a pass.

`.catalog-site/` is gitignored: it is the deploy input, not a committed artifact.

## The assets beside the pages (#1436)

A page on its own is an unstyled draft. `prototypes/` was committed as **170 `.html` files and
nothing else**, so `spec-design-v2-bundles/04-spec-design-page-align-v2/align.html` asked for
`css/tokens.css`, `images/alignsynch-icon.png`, `js/proto.js` and `js/tw-config.js` and got four
404s — and every V2 prototype rendered as bare text. The gate stayed green because the only check
counted rows: a page can be published, counted, and have every stylesheet 404.

Three pieces close it, and each is a separate answer to a separate question:

| Piece                            | Question it answers                                                | Where it lives                        |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `scripts/prototype-assets.mjs`   | which files are the catalogue's to carry?                          | the committed tree, once per import    |
| the builder                      | does the built site serve them where the page looks for them?      | `scripts/build-prototype-catalog.mjs` |
| the asset gate                   | does any published page load a 404 in the built site?              | `scripts/prototype-asset-gate.mjs`    |

**Importing.** Only what a **tracked** page references is committed — resolving every relative ref
on the 170 pages, one hop through each stylesheet's `url()` for the fonts, is **329 files /
21.6 MB** (135 png · 57 js · 45 css · 42 woff2 · 41 linked markdown · 8 avif · 1 json). The
exported source tree is 370 MB and is never committed, nor are the `.bak-*` snapshots in it. The
copy lands on the **page's own spelling**, because the export came from macOS and the deploy is
case-sensitive.

```bash
# re-import after a prototype is re-exported; --check is read-only and exits 1 on drift
node scripts/prototype-assets.mjs \
  --from ~/Desktop/dev.local/alignsynch/project-spec:project-spec \
  --from ~/Desktop/dev.local/alignsynch/project-reqs:project-reqs --check
```

**Carrying.** The builder resolves each page's relative refs against the tree the page came from
and copies every target into `.catalog-site/p/<path the page asks for>`, plus one hop through a
stylesheet's `url()` — that hop is the only way a `@font-face` source is named. A page that names
an asset no tree has is a build error, not a warning: nothing is invented to silence one.

**Gating.** After writing, the gate resolves every published page's refs against the built site
and prints its population before its verdict:

```
asset gate: 225 page(s) · 978 asset ref(s) + 175 stylesheet url() ref(s) · 2586 page ref(s) · broken = 0
asset gate: dead page refs = 33 on 6 page(s), 10 distinct target(s) […] · root-absolute refs = 5497 (276 assets) — reported, not gated
```

| Ref                                                            | Verdict                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| relative, an asset, missing from the built site                 | **red** — this is the defect the gate exists for, and the counts prove it looked      |
| relative, a page, missing                                       | red unless it is one of the recorded dead refs, which print by name                   |
| recorded dead ref that resolves again                          | reported here, **fails `tests/prototype-catalog-assets.test.ts`** (an allowance that rotted is a finding) |
| root-absolute (`/assets/x.png`)                                | counted and reported, never gated                                                     |
| no refs at all resolved                                        | **red** — a gate that checked nothing is not a pass                                   |

The **33 dead refs** (6 pages, 10 distinct targets) are prototype-owner evidence: six pages in
`spec-design-v2-rc1.3-bundle/**` were exported as single screens with their siblings' nav links and
without the sibling pages, so each links to a page that was never in the bundle. Nothing is missing
that was ever there, and no file is invented to silence one.

The **root-absolute** family is a different defect and deliberately out of this fix's scope: every
one of them is in `spec-docs-v2/_preview/**`, a docs preview sub-site whose root was `_preview/` in
the export. Mounted under `/p/`, `/assets/…` and `/guides/…` resolve against the catalogue's own
domain root. Satisfying them means serving that tree at the root or rewriting the refs — and the
issue forbids rewriting. The census is printed on every build so the number is never silent.

The deploy is smoked on those four files too, not only on the deep link: a page that answers 200
while its stylesheet answers 404 is precisely what shipped as "documented" the first time.

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
