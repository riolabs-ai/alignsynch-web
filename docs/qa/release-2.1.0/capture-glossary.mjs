#!/usr/bin/env node
/**
 * Capture `/glossary` on the tree being released — the still the release page carries for v2.1.0
 * (`docs/changelog/v2-1-0.md`).
 *
 * **Why this route, and why not the operator landing.** The window's subject is the operator
 * surface, and every one of those screens is behind `requireAdmin()`. The rig that photographs them
 * signs in as the demo branch's own administrator — and the `demo` branch was archived in Neon on
 * 2026-11-22, so a signed-in frame of `/admin/dashboard` cannot be produced honestly from this
 * machine. `/glossary` is public, renders from `docs/glossary.md` on this tree (#1393), and needs
 * no session, so the still is of *this* release rather than a reconstruction of another one. The
 * release page says the second, older still is from the v1.21.0 tree, in as many words.
 *
 * **What the shutter proves, in order.** Five assertions run *before* the file is written, and a
 * disagreement fails without producing an image:
 *
 *   1. `/api/version` names this tree — the version the bumped `package.json` carries and the commit
 *      `git rev-parse HEAD` answers. A still of some other server is a still of some other release.
 *   2. the frame is 1440 CSS px and something actually painted it — a page with no stylesheet
 *      renders a document, not the product, and a 200 cannot tell the difference.
 *   3. the page carries the glossary's own terms, so the frame is the page it claims to be.
 *   4. the brand is AlignSynch — the QuizHub build renders the same tree with the template's own
 *      chrome, so a still of `BRAND=quizhub` would pass 3 and show the wrong product.
 *
 * Usage (`BRAND=alignsynch`, port 3413, the release worktree):
 *
 *     pnpm dev --port 3413 --hostname 127.0.0.1
 *     node docs/qa/release-2.1.0/capture-glossary.mjs [origin] [out.png]
 *
 * The origin must be the dev server's own (`127.0.0.1`, never a public host): a cross-origin
 * `_next` request is blocked and the frame comes out unstyled.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  attach,
  configureCdp,
  evaluate,
  launchChrome,
  navigate,
  shutter,
  stopChrome,
  text,
  viewport,
} from "../../../scripts/cdp.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
const origin = process.argv[2] ?? "http://127.0.0.1:3413";
const out = process.argv[3] ?? "docs/qa/release-2.1.0/glossary-1440.png";
const WIDTH = 1440;

/** The pair `/api/version` must answer for this capture to be about this tree. */
function treeIdentity() {
  const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  return { version, commit };
}

const expected = treeIdentity();
configureCdp({ port: 9522, width: WIDTH, height: 1600, base: origin });
await launchChrome();
const { send } = await attach();

const failures = [];
try {
  const answer = await fetch(new URL("/api/version", origin)).then((r) => r.json());
  if (answer.version !== expected.version)
    failures.push(`/api/version names ${answer.version}, this tree is ${expected.version}`);
  if (answer.commit !== expected.commit)
    failures.push(`/api/version names commit ${answer.commit}, HEAD is ${expected.commit}`);

  await navigate(send, "/glossary");

  const innerWidth = await evaluate(send, "innerWidth");
  if (innerWidth !== WIDTH) failures.push(`viewport is ${innerWidth} CSS px, not ${WIDTH}`);

  const styleSheets = await evaluate(send, "document.styleSheets.length");
  if (styleSheets === 0) failures.push("no stylesheet loaded — the frame would be unstyled");

  const body = await text(send);
  for (const term of ["Glossary", "Aspect", "Template"]) {
    if (!body.includes(term)) failures.push(`the page does not name ${term}`);
  }
  if (/QuizHub/.test(body))
    failures.push("this is the QuizHub brand — run the dev server with BRAND=alignsynch");

  if (failures.length > 0) {
    console.error(`✗ glossary capture refused:\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    mkdirSync(dirname(out), { recursive: true });
    const shot = await shutter(send, out);
    console.log(
      JSON.stringify(
        {
          route: "/glossary",
          width: viewport().width,
          signedIn: false,
          tree: expected,
          asserted: [
            "/api/version names this tree",
            "Glossary",
            "Aspect",
            "Template",
            "no QuizHub",
          ],
          out,
          ...shot,
        },
        null,
        2,
      ),
    );
  }
} finally {
  stopChrome();
}
