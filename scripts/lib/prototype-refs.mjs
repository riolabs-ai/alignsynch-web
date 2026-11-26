/**
 * The one place that decides what a prototype page's local references are.
 *
 * Used by `scripts/build-prototype-catalog.mjs` (which copies what the pages point at and then
 * checks the built site) and `scripts/import-prototype-assets.mjs` (which pulls the same set out of
 * the authoring tree outside this repository). Two implementations of "which refs count" is how the
 * catalogue came to publish 170 pages and none of their stylesheets: a builder that only globbed
 * `.html` and a check that only counted rows.
 *
 * The vocabulary is deliberately narrow, because a prototype is an artefact and its refs are the
 * page's own words:
 *
 *   - **kept** — a relative reference: `css/tokens.css`, `../img/logo.png`, `proto.js?v=2#x`.
 *   - **dropped** — anything with a scheme (`https:`, `mailto:`, `data:`, `javascript:`),
 *     protocol-relative (`//cdn…`), a bare fragment (`#relationship-detail`), or empty.
 *   - **out of the catalogue** — a root-relative path (`/pricing`, `/admin/docs`). Those are the
 *     *app's* routes written into the prototype's nav; the catalogue cannot serve them and does
 *     not pretend to. They are not counted, not copied, and not failed.
 *   - **escaping** — a relative reference whose dot-segments climb above the catalogue root. There
 *     is nothing above `p/` to resolve against, so it is not an asset either.
 *
 * `<script src>` and `<style>` bodies are not scanned for `href`/`src`, and comments are removed
 * first: prototype pages carry inline JS that builds markup with `href="…"` strings, and counting
 * those as references is how a measurement reports 5 000 dead links on 80 pages.
 */
import path from "node:path";

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const ATTRIBUTE = /(?:^|[\s"'])(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** Strip what cannot carry a reference: comments, `<style>` bodies, `<script>` bodies. */
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
}

/**
 * Every local reference on a page, de-duplicated, in document order.
 *
 * Each entry says what it is: `relative` (checkable inside the catalogue), `root` (an app route),
 * or `escaping` (climbs out of the catalogue). `target` is the catalogue-relative path for
 * `relative` refs and `null` otherwise.
 */
export function localRefs(html, pagePath) {
  const seen = new Set();
  const refs = [];
  const dir = path.posix.dirname(pagePath);
  for (const match of stripNoise(html).matchAll(ATTRIBUTE)) {
    let raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!raw) continue;
    if (raw.startsWith("#")) continue;
    if (SCHEME.test(raw)) continue;
    raw = raw.split("#")[0].split("?")[0];
    if (!raw) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    if (decoded.startsWith("//")) continue;
    if (decoded.startsWith("/")) {
      if (seen.has(`root:${decoded}`)) continue;
      seen.add(`root:${decoded}`);
      refs.push({ ref: decoded, target: null, kind: "root" });
      continue;
    }
    const target = path.posix.normalize(path.posix.join(dir, decoded));
    if (target.startsWith("..") || target === "." || target === "..") {
      if (seen.has(`esc:${decoded}`)) continue;
      seen.add(`esc:${decoded}`);
      refs.push({ ref: decoded, target: null, kind: "escaping" });
      continue;
    }
    if (target.endsWith("/")) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    refs.push({ ref: decoded, target, kind: "relative" });
  }
  return refs;
}

/**
 * `url(…)` targets inside a stylesheet, resolved the same way. Fonts are the reason this exists:
 * the tokens stylesheet points at `../fonts/inter-1.woff2`, so copying the CSS alone leaves every
 * page styled in a fallback face while the asset gate — which reads pages, not stylesheets — stays
 * green.
 */
export function styleRefs(css, stylePath) {
  const seen = new Set();
  const refs = [];
  const dir = path.posix.dirname(stylePath);
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]+))\s*\)/gi)) {
    let raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || SCHEME.test(raw) || raw.startsWith("//")) continue;
    raw = raw.split("#")[0].split("?")[0];
    if (!raw || raw.startsWith("/")) continue;
    const target = path.posix.normalize(path.posix.join(dir, raw));
    if (target.startsWith("..") || seen.has(target)) continue;
    seen.add(target);
    refs.push({ ref: raw, target, kind: "relative" });
  }
  return refs;
}

/** A page or a stylesheet, by extension — the two kinds whose refs are followed. */
export function isHtml(p) {
  return /\.html?$/i.test(p);
}

export function isStyle(p) {
  return /\.css$/i.test(p);
}
