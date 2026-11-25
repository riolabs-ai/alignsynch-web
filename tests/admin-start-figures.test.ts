/**
 * `/admin/dashboard`'s four figures, as arithmetic (#1374).
 *
 * The page itself needs a session, a database and four shelves, so the derivation is proved here on
 * its own: what the inbox's total is, how a review shelf's open to-dos are counted, and what happens
 * when a read did not answer at all. The shapes handed in are minimal — only the fields the fold
 * reads are populated — because these cases are about the sum and not about a valid record; the
 * casts are the price of that, and each one names what it stands in for.
 */
import { describe, expect, it } from "vitest";

import { startFigures } from "@/lib/admin/start";
import type { InboxSource } from "@/lib/db/admin-inbox";
import type { ReviewArtifactSummary } from "@/lib/db/review-artifacts";

/** An inbox read: `newest` rows returned, `hidden` rows the read did not return. */
function inbox(newest: number, hidden: number, seats: number): InboxSource {
  return {
    messages: Array.from({ length: newest }, () => ({}) as InboxSource["messages"][number]),
    seats: Array.from({ length: seats }, () => ({}) as InboxSource["seats"][number]),
    hidden,
  };
}

/** One review artifact with only the progress counts the fold reads. */
function artifact(
  todosDone: number,
  todosTotal: number,
  issuesOpen: number,
): ReviewArtifactSummary {
  return {
    progress: { todosDone, todosTotal, issuesOpen, issuesClosed: 0, updatedAt: null },
  } as unknown as ReviewArtifactSummary;
}

describe("startFigures", () => {
  it("counts the inbox as the newest page plus the rows the read did not return", () => {
    // The same arithmetic `/admin/inbox` prints: the read is capped, so `messages.length` alone
    // would under-report a queue with older messages on it.
    const figures = startFigures({ inbox: inbox(3, 7, 2), review: [], sessions: 0, auditRows: 0 });
    expect(figures.inboxMessages).toBe(10);
    expect(figures.inboxSeats).toBe(2);
  });

  it("sums the shelf's open to-dos and open issues, never the done ones", () => {
    const figures = startFigures({
      inbox: inbox(0, 0, 0),
      review: [artifact(2, 5, 3), artifact(0, 4, 1), artifact(4, 4, 0)],
      sessions: 0,
      auditRows: 0,
    });
    expect(figures.reviewArtifacts).toBe(3);
    // (5-2) + (4-0) + (4-4) = 7 — the finished artifact contributes nothing to the to-do count.
    expect(figures.reviewOpenTodos).toBe(7);
    expect(figures.reviewOpenIssues).toBe(4);
  });

  it("clamps a to-do count that disagrees with its total rather than printing a negative", () => {
    // A `todos_done` above `todos_total` is a row the store should not hold; the conversion reads it
    // as "nothing outstanding" instead of pasting `-2` into a KPI tile.
    const figures = startFigures({
      inbox: null,
      review: [artifact(6, 4, 0)],
      sessions: 0,
      auditRows: 0,
    });
    expect(figures.reviewOpenTodos).toBe(0);
  });

  it("answers zero for a read that did not answer at all", () => {
    const figures = startFigures({ inbox: null, review: null, sessions: null, auditRows: null });
    expect(figures).toEqual({
      inboxMessages: 0,
      inboxSeats: 0,
      reviewArtifacts: 0,
      reviewOpenTodos: 0,
      reviewOpenIssues: 0,
      sessions: 0,
      auditRows: 0,
    });
  });

  it("passes the two counts it cannot derive through unchanged", () => {
    const figures = startFigures({
      inbox: inbox(0, 0, 0),
      review: [],
      sessions: 41,
      auditRows: 50,
    });
    expect(figures.sessions).toBe(41);
    expect(figures.auditRows).toBe(50);
  });
});
