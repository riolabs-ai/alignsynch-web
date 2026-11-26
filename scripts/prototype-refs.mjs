/**
 * Reading the references a prototype page makes, and deciding what each one is.
 *
 * One home for the rule, shared by the three callers that need it (#1436):
 *
 *   scripts/prototype-assets.mjs           imports the assets a page looks for
 *   scripts/build-prototype-catalog.mjs    carries them into the built site and gates them
 *   tests/prototype-catalog-assets.test.ts proves the committed tree satisfies itself
 *
 * Why a second extractor when `scripts/ui-refs.ts` exists: that one reads the **app's** tree and
 * answers "is this route in the manifest". These pages are artifacts — hand-authored HTML whose
 * refs point at files beside them — so the questions are different: where does this file sit, and
 * does it exist. The two must never share a matcher, or an app-route rule starts deciding what a
 * prototype page may look at.
 *
 * WHAT COUNTS. Only what a browser loads, read from markup:
 *   - `src`, `href`, `poster`, `data-src` attributes (case-insensitive), `srcset` candidates;
 *   - `url(…)` in a `style` attribute or a `<style>` block;
 *   - the same `url(…)` inside a stylesheet, one hop, for `@font-face` sources (#1436).
 * **Script bodies are dropped before reading.** Measured on this tree: reading them invented 64
 * phantom refs on the docs pages (`'+repo+p+'`, `URL.createObjectURL(blob)`, `demo data`) — a ref
 * assembled at runtime is not a file the build can publish, and gating it would be gating a
 * template string. An external `<script src>` keeps its `src`; only its body is removed.
 *
 * WHAT DOES NOT. `https://`, `//host`, `mailto:`, `#anchor`, `data:` — nothing the catalog serves.
 * A **root-absolute** ref (`/assets/x.png`) is kept and classified, never resolved: it names a
 * domain root, and these pages are mounted under `/p/`. See `ROOT_ABSOLUTE_NOTE`.
 */

import fs from "node:fs";
import path from "node:path";

const readText = (file) => fs.readFileSync(file, "utf8");

/** Extensions that name a file the browser downloads rather than navigates to. */
export const ASSET_EXT = new Set([
  ".avif",
  ".css",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".md",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

/** Extensions that name a page. A missing one is dead navigation, not a broken asset. */
export const PAGE_EXT = new Set([".htm", ".html", ".xhtml"]);

/**
 * The refs that name a page which exists nowhere — not in the committed tree, not in the source
 * tree the pages were exported from. Published as evidence for the prototype's owner, never as a
 * build error and never silenced with an invented file (#1436). `key` is
 * `<page relative to prototypes/> → <ref>`.
 *
 * Measured: **33 distinct refs, 6 pages, 10 distinct targets** (`index.html`, `start.html`,
 * `my-relationships.html`, `templates.html`, `chat.html`, `settings.html`,
 * `relationship-templates.html`, `align.html`, `relationship-template.html`, `pricing.html`). All
 * six pages are in `spec-design-v2-rc1.3-bundle/**`, one-file screenshots exported as a bundle with
 * their siblings' nav links and without the sibling pages, so each links to a page that was never
 * in the bundle. Nothing is missing that was ever there.
 *
 * `tests/prototype-catalog-assets.test.ts` asserts this list is exactly what the tree says, both
 * ways: a new dead ref fails, and so does an entry the tree no longer has — an allowance that has
 * rotted is a finding, not a stale line to keep.
 */
export const KNOWN_DEAD_PAGE_REFS = [
  "project-spec/spec-design-v2-rc1.3-bundle/01-answer-screen-paused-1223/assessment.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → align.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → chat.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → my-relationships.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → relationship-templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → settings.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → start.html",
  "project-spec/spec-design-v2-rc1.3-bundle/02-relationship-detail-pause-reason-1224/relationship-detail.html → templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → chat.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → my-relationships.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → relationship-templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → settings.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → start.html",
  "project-spec/spec-design-v2-rc1.3-bundle/04-create-failed-screen-1226/create-failed.html → templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/07-wizard-stage5-family-full-1229/wizard.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/07-wizard-stage5-family-full-1229/wizard.html → pricing.html",
  "project-spec/spec-design-v2-rc1.3-bundle/07-wizard-stage5-family-full-1229/wizard.html → relationship-template.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → chat.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → my-relationships.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → relationship-templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → settings.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → start.html",
  "project-spec/spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/payment.html → templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → chat.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → index.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → my-relationships.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → relationship-templates.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → settings.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → start.html",
  "project-spec/spec-design-v2-rc1.3-bundle/10-admin-crud-permissions-1232/admin-crud-matrix.html → templates.html",
];

/** Remove what a browser never loads: comments, and the *bodies* of script elements. */
export function markupOf(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>")
    .replace(/<script\b[^>]*\/>/gi, " ");
}

/**
 * A page's refs are read from `src`, `href` and `poster`, from `srcset` candidates, and from
 * `url(…)` in a `style` attribute or a `<style>` block. `data-src` is deliberately **not** read:
 * on these pages it is a copy-provenance annotation (`data-src="data/pages/payment.ts:42"`, the
 * line a string came from), not a file the browser fetches — reading it invented 54 phantom refs
 * on one docs page.
 */
const ATTRIBUTE = /(?<![-\w])(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SRCSET = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const URL_FN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;

const first = (...values) => values.find((value) => value !== undefined) ?? "";

/** Every raw ref a page names, in document order, script bodies excluded. */
export function refsInHtml(html) {
  return refsInText(markupOf(html), { srcset: true });
}

/** Every `url(…)` a stylesheet names — the one hop that reaches `@font-face` sources. */
export function refsInCss(css) {
  return refsInText(css, { srcset: false });
}

function refsInText(text, { srcset }) {
  const found = [];
  for (const match of text.matchAll(ATTRIBUTE)) {
    const value = first(match[1], match[2], match[3]).trim();
    if (value) found.push(value);
  }
  if (srcset) {
    for (const match of text.matchAll(SRCSET)) {
      for (const candidate of first(match[1], match[2]).split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) found.push(url);
      }
    }
  }
  for (const match of text.matchAll(URL_FN)) {
    const value = first(match[1], match[2], match[3]).trim();
    if (value) found.push(value);
  }
  return found;
}

/**
 * What a raw ref is.
 *
 *   "external"  — nothing the catalog serves (`https:`, `//host`, `mailto:`, `data:`)
 *   "fragment"  — `#anchor` or empty: an in-page jump
 *   "root"      — `/path`: relative to a **domain root**, which these pages no longer have
 *   "relative"  — `path` or `../path`: the only kind the catalog can satisfy in place
 *
 * `path` is decoded, query- and hash-free. `failures` carries a `%`-escape that will not decode.
 */
export function classifyRef(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { kind: "fragment", path: "" };
  if (trimmed.startsWith("#")) return { kind: "fragment", path: "" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return { kind: "external", path: "" };
  }
  const bare = trimmed.replace(/[?#].*$/, "");
  if (!bare) return { kind: "fragment", path: "" };
  let decoded;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // A page whose ref is not valid percent-encoding still names something; keep it literal
    // rather than dropping it, so the report can name the page.
    decoded = bare;
  }
  if (decoded.startsWith("/")) return { kind: "root", path: decoded.replace(/^\/+/, "") };
  return { kind: "relative", path: decoded };
}

const extensionOf = (refPath) => {
  const name = refPath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
};

/** A ref that names a download rather than a page. Extensionless refs are treated as pages. */
export function isAssetRef(refPath) {
  return ASSET_EXT.has(extensionOf(refPath));
}

export function isPageRef(refPath) {
  const extension = extensionOf(refPath);
  return extension === "" || PAGE_EXT.has(extension);
}

/**
 * Everything one page looks at, from its own tree: assets, refs that resolve nowhere, and refs
 * that climb out of the tree they belong to.
 *
 * `resolve(baseDir, refPath)` is the caller's rule — the importer resolves tolerantly (the source
 * trees came from macOS), the build resolves exactly (the deploy is case-sensitive). Everything
 * else is shared, so the importer and the gate cannot disagree about what a page needs.
 *
 * `assets` carries every distinct target once, in discovery order; a `.css` target is walked for
 * its own refs exactly once, which is the hop that reaches `@font-face` sources.
 */
export function collectLocalRefs(startFile, { sourceRoot, resolve }) {
  const assets = new Map(); // target -> ref the page asked for
  const dead = []; // { ref, kind }
  const outside = []; // { ref, target }
  const walked = new Set([startFile]);
  const queue = [{ file: startFile, html: true }];
  while (queue.length) {
    const { file, html } = queue.shift();
    const text = readText(file);
    for (const raw of html ? refsInHtml(text) : refsInCss(text)) {
      const { kind, path: refPath } = classifyRef(raw);
      if (kind !== "relative") continue;
      const target = resolve(path.dirname(file), refPath);
      if (!target) {
        dead.push({ ref: refPath, kind: isAssetRef(refPath) ? "asset" : "page" });
        continue;
      }
      const relative = path.relative(sourceRoot, target).split(path.sep).join("/");
      if (relative.startsWith("..")) {
        outside.push({ ref: refPath, target });
        continue;
      }
      if (!isAssetRef(refPath)) continue; // a page: published already, or not an asset's business
      if (!assets.has(target)) assets.set(target, refPath);
      if (/\.css$/i.test(target) && !walked.has(target)) {
        walked.add(target);
        queue.push({ file: target, html: false });
      }
    }
  }
  return { assets: [...assets].map(([target, ref]) => ({ target, ref })), dead, outside };
}

/**
 * A page mounted under `/p/` cannot resolve a ref written for a domain root. Reported, never
 * gated: satisfying one means serving that page's tree at the domain root or rewriting the ref,
 * and the issue this module serves forbids both (#1436, "do not rewrite the prototypes' asset
 * paths"). Measured on this tree they are one family — `spec-docs-v2/_preview/**`, a docs
 * preview sub-site whose root is `_preview/` — so the report names that family rather than
 * listing five thousand refs.
 */
export const ROOT_ABSOLUTE_NOTE =
  "root-absolute refs are reported, not gated: they name a domain root, and these pages are mounted under /p/";
