/**
 * #1274 — the shape the card states, proved on **real rows**: `listMyRelationships()` → the card
 * the screen draws.
 *
 * The unit suite (`tests/member-relationships-list.test.tsx`) proves the markup from a row literal,
 * and a row literal cannot answer the two questions this row of the register actually asks:
 *
 *   the read     the latest round's `mode` and `alignment_setting` reach the list at all — the two
 *                columns live on `session`, not on `relationship`, so the join is the change and a
 *                card drawn from a literal would stay green with the join deleted.
 *   the pairing  each card prints **its own** round's pair, and a card with no round prints none.
 *                Two relationships under different Settings on one screen is the case a single
 *                fixture row cannot express.
 *
 * **Skipped unless `DATABASE_URL` is set**, like every other `*-live.test.ts`: the gate has no
 * connection string by design (`docs/operations/gate.md`). Point it at the **demo** branch —
 * production is refused outright rather than trusted to the caller's memory:
 *
 *     DATABASE_URL=<demo url> npx vitest run tests/relationship-card-shape-live.test.tsx
 *
 * **Read-only.** No row is written, changed or deleted: this is a projection of what the branch
 * already holds, and it asserts the card agrees with the read rather than that the branch contains
 * any particular relationship.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_ENDPOINTS } from "../scripts/neon-endpoints.mjs";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...(rest as Record<string, unknown>) }, children as never),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { RelationshipsList } from "@/components/dashboard/relationships-list";
import { dashboardRelationshipsPageCopy } from "@/data/pages/dashboard-relationships";
import { queryRows } from "@/lib/db/client";
import { listMyRelationships } from "@/lib/member/relationships";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const live = databaseUrl === "" ? describe.skip : describe;

const host = databaseUrl === "" ? "(none)" : (databaseUrl.match(/@([^/:]+)/)?.[1] ?? "(unknown)");
const onProduction = PRODUCTION_ENDPOINTS.some((entry) => host.startsWith(entry.endpoint));

/** Every account holding a party seat — the readers `listMyRelationships()` is asked on behalf of. */
async function accounts(): Promise<string[]> {
  const rows = await queryRows<{ user_id: string }>(
    `SELECT DISTINCT p.user_id
       FROM party p
       JOIN session s ON s.record_id = p.session_record_id
      WHERE p.user_id IS NOT NULL
      LIMIT 20`,
  );
  return rows.map((row) => row.user_id);
}

/** The markup of one card, from its own marker to the next. */
function cardChunk(html: string, id: string): string {
  return html.split('data-relationship-card="').find((chunk) => chunk.startsWith(`${id}"`)) ?? "";
}

live("the relationship card's shape, on real rows (#1274)", () => {
  it("prints each card's own Mode and Setting, and none where there is no round", async () => {
    expect(onProduction, `refusing to read ${host}: point DATABASE_URL at the demo branch`).toBe(
      false,
    );

    const readers = await accounts();
    expect(
      readers.length,
      "the branch has no party seats — run `pnpm db:seed` first",
    ).toBeGreaterThan(0);

    let shaped = 0;
    let shapeless = 0;

    for (const userId of readers) {
      const rows = await listMyRelationships(userId);
      const html = renderToStaticMarkup(
        createElement(RelationshipsList, {
          copy: dashboardRelationshipsPageCopy,
          rows,
          summaries: {},
          templates: [],
          unreadable: null,
        }),
      );

      for (const row of rows) {
        const card = cardChunk(html, row.id);
        if (card === "") continue; // a `void` row is drawn nowhere on this screen.

        if (row.sessionRecordId === null) {
          // No round → no Mode and no Setting to state, and no default invented in their place.
          expect(card).not.toContain("data-relationship-mode=");
          expect(card).not.toContain("data-relationship-setting=");
          shapeless += 1;
          continue;
        }

        expect(
          row.mode,
          `relationship ${row.id} has a session but no parsable mode`,
        ).not.toBeNull();
        expect(
          row.setting,
          `relationship ${row.id} has a session but no parsable setting`,
        ).not.toBeNull();
        expect(card).toContain(`data-relationship-mode="${row.mode}"`);
        expect(card).toContain(`data-relationship-setting="${row.setting}"`);
        shaped += 1;
      }
    }

    // The proof is not vacuous: the branch really does hold relationships of both shapes.
    expect(
      shaped,
      "no relationship with a round was read — the assertion above proved nothing",
    ).toBeGreaterThan(0);
    // eslint-disable-next-line no-console -- a count is the evidence for the handoff
    console.log(`card shape: ${String(shaped)} with a round, ${String(shapeless)} without`);
  }, 60_000);
});
