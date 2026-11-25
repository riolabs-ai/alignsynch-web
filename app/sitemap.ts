/**
 * `/sitemap.xml` — the public site, one URL per page a crawler may index.
 *
 * **The list is derived, and it is the derivation the app already keeps.** `LEAVING_ROUTES`
 * (`lib/marketing-routes.ts`) is the runtime answer to "which addresses are the public site": every
 * dashboard link that has to leave the app in a new tab is classified by it, and `data:check`
 * **E39** holds it equal to the page files under `app/(marketing)` in both directions — a marketing
 * page that ships without a row is a red build, and so is a row with no page. A second hand-written
 * list here would be the drift this card exists to avoid, so there is not one: the fixed rows come
 * out of that table, and each `*` row is filled from the same list its own route prerenders.
 *
 * **Why the parity manifest is not this source — stated, not silently overruled.** The card points
 * at `tests/parity/manifest.txt`, and it cannot answer "which routes are public". It covers seven
 * routes per brand because seven is what a *reskin* can reach (#171), and six of the seven live in
 * `app/(mainlayout)` — the app shell — so they are not the public site at all. One of them is not
 * even a page a crawler could land on: `/leaderboard` answers **404** on purpose while
 * `community.leaderboard` is off (`data/flags.ts`), which is precisely the dead URL this card
 * forbids. Of the seven, only `/` is public, and it is below because `LEAVING_ROUTES` carries it.
 *
 * **Every dynamic URL comes from the list its own route already prerenders**, so a slug here is a
 * page that renders rather than a string somebody hoped resolves:
 *
 *   `/relationship-templates/<id>`   `templateSlugs()` — the exact call the page's own
 *                                    `generateStaticParams()` makes, so a type the shop will not
 *                                    sell cannot appear and a type it does sell cannot be missed.
 *   `…/<id>/demo`                    those same slugs, filtered by `assessmentDemo()`. The demo
 *                                    page answers 404 for a type with no authored sheet, so the
 *                                    filter is the route's own condition, not a second opinion.
 *   `/support/articles/<slug>`       `publishedArticles("kb")` and `articlePath()` — the lookup the
 *                                    article route performs, which is why a draft is not a URL.
 *
 * The result is filtered through `leavesApp()` for the same reason: a path outside the public table
 * is not published here even if some future caller passes one in.
 *
 * **`lastModified` is absent on purpose.** Nothing in the tree records when a route's content
 * changed — every fixture is a module and every page is a pure function of it — so the only instant
 * available at render time is the build clock. A `lastModified` taken from that clock tells every
 * crawler that all forty-odd URLs changed on every deploy: a fact the repository does not have,
 * wearing the shape of one. `changeFrequency` and `priority` are omitted for the same reason — the
 * crawlers that matter ignore them, and a value nobody reads is a value nobody keeps true.
 */
import type { MetadataRoute } from "next";

import { articlePath, publishedArticles } from "@/lib/article-records";
import { assessmentDemo } from "@/lib/assessment-demo";
import { relationshipTypeDemoPath, relationshipTypePath } from "@/lib/flow/paths";
import { LEAVING_ROUTES, leavesApp } from "@/lib/marketing-routes";
import { SITE_ORIGIN } from "@/lib/site-origin";
import { templateSlugs } from "@/lib/template-detail";

/**
 * The public paths that are an address rather than a prefix — every `LEAVING_ROUTES` row without
 * its `/*`. `/relationship-templates` is one of these *and* the prefix the type pages hang off, so
 * the two are not a duplicate: the catalogue is a page and the types are pages below it.
 */
const FIXED_PUBLIC_PATHS = LEAVING_ROUTES.filter((route) => !route.endsWith("/*"));

/** Every public URL, in catalogue order: the fixed pages, the type pages, their examples, articles. */
function publicPaths(): string[] {
  const typeSlugs = templateSlugs();
  const exampleSlugs = typeSlugs.filter((id) => assessmentDemo(id) !== undefined);

  return [
    ...FIXED_PUBLIC_PATHS,
    ...typeSlugs.map(relationshipTypePath),
    ...exampleSlugs.map(relationshipTypeDemoPath),
    ...publishedArticles("kb").map(articlePath),
  ].filter(leavesApp);
}

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().map((path) => ({ url: `${SITE_ORIGIN}${path}` }));
}
