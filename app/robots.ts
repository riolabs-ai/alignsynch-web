/**
 * `/robots.txt` — what a crawler is asked to leave alone, and where the sitemap is.
 *
 * **The three disallowed prefixes are the surfaces behind a session**, not merely surfaces that are
 * unlisted: `/admin` is the console, `/dashboard` is the member's own shell, and `/api` is the
 * app's endpoints. Each already refuses a crawler that ignored this file — the admin pages carry
 * `robots: { index: false, follow: false }` in their own metadata and `/admin/spec` adds an
 * `X-Robots-Tag` header from `next.config.mjs` — because `robots.txt` is a request, not a gate. The
 * surfaces that matter do not rely on it, and neither should a reader of this file.
 *
 * **What is deliberately absent from the list.** `/login`, `/register`, the password-reset flow,
 * `/demo` and `/invite/<token>` are not disallowed here and are not in `app/sitemap.ts` either.
 * Keeping a crawler out of a page a person may be linked to from an inbox — the reset mail and the
 * invitation are both exactly that shape — is not what `disallow` is for, and the instruction that
 * actually removes a page from results is `noindex` in the page's own metadata. `/demo` and every
 * `/admin` route carry one today; the auth screens do not, and adding it there is a metadata change
 * this card is explicitly not the place for.
 *
 * `sitemap` is absolute because the protocol requires it, and the origin is `lib/site-origin.ts` —
 * the same value `metadataBase` resolves against and `app/sitemap.ts` publishes, so the two cannot
 * name different hosts.
 */
import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/site-origin";

/** The session surfaces. A prefix, so one row covers `/admin/console/users` and `/api/auth/…`. */
const PRIVATE_PREFIXES = ["/admin", "/dashboard", "/api"] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PREFIXES] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
