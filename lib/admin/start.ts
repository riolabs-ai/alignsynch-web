/**
 * `/admin/start` — the read-only landing's figures, and the address it is mounted at.
 *
 * **Every number here is one a shelf already computes.** The page adds no query of its own: it
 * asks the four reads that `/admin/inbox`, `/admin/review`, `/admin/instances` and `/admin/audit`
 * make, and prints the same facts those screens print. A landing page that invented a count — or
 * that summed rows a screen would not show — would be the second source of truth this console
 * exists to prevent, which is why nothing below opens a connection.
 *
 * **Pure, so `tests/admin-start-figures.test.ts` can drive it without a database.** The reads stay
 * in the page module (`app/(mainlayout)/admin/start/page.tsx`), where the gate has already run; this
 * module only folds what they answer. The `import type`s are erased at build time, so a client
 * module that ever imported this file would still carry no `pg`.
 */
import type { InboxSource } from "@/lib/db/admin-inbox";
import type { ReviewArtifactSummary } from "@/lib/db/review-artifacts";

/**
 * The four counts the page prints, as numbers — never as sentences and never as strings.
 *
 * A string here would be a number the fixture had already formatted, and the two would drift the
 * first time a count changed. The words are `data/pages/admin-start.ts`'s; this is only the
 * arithmetic behind their `{placeholders}`.
 */
export interface StartFigures {
  /** Messages the inbox holds: the newest page plus the rows the read did not return. */
  readonly inboxMessages: number;
  /** Support seats an inbound message can be addressed to. */
  readonly inboxSeats: number;
  /** Artifacts on the review shelf. */
  readonly reviewArtifacts: number;
  /** To-dos no artifact has marked done — `todosTotal - todosDone`, summed across the shelf. */
  readonly reviewOpenTodos: number;
  /** Issues still open across the shelf. */
  readonly reviewOpenIssues: number;
  /** Rows on the operator's relationship registry. */
  readonly sessions: number;
  /** Rows on the newest page of the audit log — the log's own read, which is capped and has no total. */
  readonly auditRows: number;
}

/**
 * Fold the four reads into the numbers the page prints.
 *
 * `review` is `null` when the shelf could not be read even though the other three could — the page
 * reads them independently, and a shelf that failed must not take the three that answered with it.
 * The callers that pass `null` still get counts for what answered; the page's failure panel names
 * the surfaces that did not.
 */
export function startFigures(input: {
  readonly inbox: InboxSource | null;
  readonly review: readonly ReviewArtifactSummary[] | null;
  readonly sessions: number | null;
  readonly auditRows: number | null;
}): StartFigures {
  const inbox = input.inbox;
  const review = input.review;
  return {
    // `hidden` is how many rows the read did not return, so the inbox's own total is the two added:
    // the same arithmetic `/admin/inbox`'s "older messages exist" line rests on.
    inboxMessages: inbox === null ? 0 : inbox.messages.length + inbox.hidden,
    inboxSeats: inbox === null ? 0 : inbox.seats.length,
    reviewArtifacts: review === null ? 0 : review.length,
    reviewOpenTodos:
      review === null
        ? 0
        : review.reduce(
            (total, summary) =>
              total + Math.max(0, summary.progress.todosTotal - summary.progress.todosDone),
            0,
          ),
    reviewOpenIssues:
      review === null
        ? 0
        : review.reduce((total, summary) => total + summary.progress.issuesOpen, 0),
    sessions: input.sessions ?? 0,
    auditRows: input.auditRows ?? 0,
  };
}
