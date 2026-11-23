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
  },
});
