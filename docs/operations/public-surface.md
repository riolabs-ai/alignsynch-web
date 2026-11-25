# The public site, and what the sitemap publishes

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The public site · prev [Orchestration rules](orchestration.md) · next [Release-train card template](release-train.md)

<!-- docs-nav:end -->

Issue: [#1290](https://github.com/riolabs-ai/alignsynch-web/issues/1290) asked the public
pages to be indexable and the internal ones not. Titles, descriptions, the OpenGraph image
and `noindex` on the admin routes already existed; two files a crawler asks for did not.
This page records where "public" is decided, so the next person adding a route does not
have to guess which list owns the answer.

## The one answer to "which routes are public"

`lib/marketing-routes.ts::LEAVING_ROUTES`. It exists for a different question — a dashboard
link to a public page has to open a new tab — which is exactly why it can be trusted here:
`data:check` **E39** derives the same set from the page files under `app/(marketing)` and
fails when the runtime table and the filesystem disagree in either direction. A marketing
page that ships without a row is a red build, and so is a row with no page.

The route group is that boundary, and it is about **chrome and audience**, not auth:

| Route group    | Who it is for                       | Examples                        |
| -------------- | ----------------------------------- | ------------------------------- |
| `(marketing)`  | A stranger, before any account      | `/`, `/help`, `/pricing`        |
| `(auth)`       | Someone signing in or resetting     | `/login`, `/register`, reset    |
| `(mainlayout)` | A member or an operator, in the app | `/dashboard`, `/admin`, `/news` |

## What the sitemap publishes

`app/sitemap.ts` is a Next metadata route: prerendered at build time, served at
`/sitemap.xml`. Its rows are derived, never hand-listed:

| Rows                                 | Source                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| every fixed path in `LEAVING_ROUTES` | the rows without a `/*`                                                                |
| `/relationship-templates/<id>`       | `templateSlugs()` — the same call the page's own `generateStaticParams()` makes        |
| `…/<id>/demo`                        | those slugs filtered by `assessmentDemo()`, which is the demo page's own 404 condition |
| `/support/articles/<slug>`           | `publishedArticles("kb")` through `articlePath()` — the article route's own lookup     |

Every row then passes `leavesApp()`, so a path outside the public table is not published
even if a future caller hands one in. The count is a property of the build, because the
help articles are brand-scoped by the fixture the article route already reads:

| Build        | URLs | Composition                                            |
| ------------ | ---- | ------------------------------------------------------ |
| `quizhub`    | 44   | 7 fixed · 27 type pages · 2 examples · 8 help articles |
| `alignsynch` | 39   | 7 fixed · 27 type pages · 2 examples · 3 help articles |

**`lastModified` is absent on purpose.** Nothing in the tree records when a route's content
changed — every fixture is a module and every page is a pure function of it — so the only
instant available at render time is the build clock. A `lastModified` from that clock tells
a crawler that all forty-odd URLs changed on every deploy, which is a fact the repository
does not have wearing the shape of one. `changeFrequency` and `priority` are omitted for the
same reason: the crawlers that matter ignore them.

## What `robots.txt` refuses, and what it does not

`app/robots.ts` allows the site, disallows `/admin`, `/dashboard` and `/api`, and points at
the sitemap. Those three are the surfaces **behind a session**, and each already refuses a
crawler that ignored the file — the admin pages carry `robots: { index: false, follow:
false }` in their own metadata and `/admin/spec` adds an `X-Robots-Tag` header from
`next.config.mjs` — because `robots.txt` is a request, not a gate.

`/login`, `/register`, the reset flow, `/demo` and `/invite/<token>` are neither disallowed
nor listed. Keeping a crawler out of a page a person is linked to from an inbox — the reset
mail and the invitation are both that shape — is not what `disallow` is for; the instruction
that removes a page from results is `noindex` in that page's own metadata, which is a
metadata change and not this one.

## The parity manifest is not a list of public routes

`tests/parity/manifest.txt` is the first place a reader looks for one, and it cannot answer
the question. It covers seven routes per brand because seven is what a **reskin** can reach
(#171), and six of the seven render inside `app/(mainlayout)` — the app shell. One of them
is not even a page a crawler could land on: `/leaderboard` answers 404 on purpose while
`community.leaderboard` is off in `data/flags.ts`, which is precisely the dead URL a sitemap
must not carry. Only `/` is public, and it is in the sitemap because `LEAVING_ROUTES` holds
it.

## Proving it

```bash
pnpm build && pnpm start --port 3001
curl -s localhost:3001/robots.txt
curl -s localhost:3001/sitemap.xml | grep -c '<loc>'
# every listed URL must answer 200, not 404
curl -s localhost:3001/sitemap.xml | grep -o '<loc>[^<]*</loc>' \
  | sed 's|<loc>https://[^/]*||; s|</loc>||' \
  | while read -r p; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "localhost:3001$p")" "$p"; done
```

`BRAND=alignsynch pnpm build` then the same two `curl`s proves the other origin and the other
article set; CI builds both brands in its matrix, so a route count that only holds on one of
them is a red run rather than a silent claim.

## Known limit

The shell is not an auth wall. `/news`, `/news/<slug>`, `/creator-tips`, `/categories`,
`/explore` and `/search` all answer **200 to an anonymous request** — they are in
`(mainlayout)` for their chrome, not for a session — and none of them is in the sitemap,
because the derived source of publicness is the route group and these are outside it. A
crawler that finds them through a link will still index them (robots does not disallow
them), which is why the honest next step is a decision about which of those content surfaces
belong to the public site, not a second hand-kept list here.

<!-- docs-nav:begin -->

[Docs hub](../README.md) › **Operations** › The public site · prev [Orchestration rules](orchestration.md) · next [Release-train card template](release-train.md)

<!-- docs-nav:end -->
