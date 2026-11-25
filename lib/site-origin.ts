/**
 * The public origin, composed in one place.
 *
 * Three consumers need the same absolute origin, and they fail in three different ways when they
 * disagree:
 *
 *   `app/layout.tsx`  `metadataBase` — a relative `og:image` with no origin to resolve against is
 *                     dropped by every crawler, so a wrong origin costs the share card on every
 *                     route.
 *   `app/sitemap.ts`  the sitemap protocol requires absolute URLs.
 *   `app/robots.ts`   the `Sitemap:` directive is absolute too.
 *
 * The composition is `https://` + `brand.domain`, and `content/brand.ts` requires `domain` to be a
 * bare host with no scheme — so this file, not a page, is where the scheme is added. It used to be
 * one line inside `app/layout.tsx` whose docstring said it was "the one place in the tree that
 * composes a URL out of `domain`". Two metadata routes now need the same value, and a second and
 * third copy of that template is exactly the drift this module exists to prevent: a brand that
 * changes `domain` must move the share card, the sitemap and robots together, or none of them.
 *
 * The scheme is `https` in every environment, including the local production build these routes
 * are proved on. A sitemap is published to crawlers, so an `http://` origin in it is not a local
 * convenience — it is a claim about the deployed site, and the deployed site is https.
 */
import { brand } from "@/data/brand";

/** e.g. `https://alignsynch.com` — no trailing slash, so a caller appends its own path. */
export const SITE_ORIGIN = `https://${brand.domain}`;
