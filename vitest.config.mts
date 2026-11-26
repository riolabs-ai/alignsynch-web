import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest — the unit-test runner for what `node --test` cannot reach.
 *
 * Two runners, on purpose (#8): `scripts/__tests__/**` is compiled by
 * `tsconfig.datacheck.json` into `.datacheck/` and runs under plain node inside
 * `pnpm data:check`, because it exists to prove the content model. Those tests are
 * not rewritten here. This config is for tests that import the *app* side
 * (`lib/quiz-cards.ts`, `data/searchdata.ts`) and need the `@/` alias resolved.
 *
 * `.tsx` is included for the one test that needs a DOM: the media resolver's `onError` is a
 * browser event, so `tests/media-fallback.test.tsx` opts into `jsdom` with its own
 * `@vitest-environment` docblock and dispatches a real `error` on the `<img>` the component
 * rendered (#155). Every other file stays on node, which is the cheap default.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      // The one suite that lives under `scripts/` because its subject does: `scripts/**` is the
      // config lane, so this test gates without paying for `next build`. It is named here because
      // everything else under `scripts/__tests__/` is a node:test suite compiled by
      // `tsconfig.datacheck.json` (which excludes this file for the same reason).
      "scripts/__tests__/mention-watch.test.ts",
    ],
    environment: "node",
    /**
     * Vitest's default is 5 s, and this suite has several cases whose cost is *work* — a `next`
     * render per document, a PNG inflate per raster, a `git` subprocess — not a wait. On the
     * full suite (~385 files, ~16 fork workers on an 8-core box, `user` time ≈ 3.6 × `real`) those
     * measurements run 3–4.6× slower than they do alone: measured, `tests/docs-source.test.ts`
     * 1.9 s alone → 5.9 s in the run, `tests/release-ledger.test.ts` 1.3 s → 5.2 s. Both crossed
     * the default and were reported as red tests, which is how a CPU-bound measurement turns into
     * a "flake" that blocks a release cut.
     *
     * 20 s is ~10× the slowest case's solo cost and 3.4× its worst observed cost inside the run —
     * enough that the box's load can no longer decide the verdict, small enough that a genuinely
     * hung case still fails.
     */
    testTimeout: 20_000,
  },
});
