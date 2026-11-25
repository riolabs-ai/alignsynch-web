/**
 * `/admin/dashboard` — the read-only landing's copy (#1374).
 *
 * **The page's shape is the owner's mock's, the numbers are this product's.** The mock draws a
 * kicker, an H1, an intro, a KPI row, then cards that each carry a heading, a muted help line and
 * rows. Every figure on it, though, is a measurement of the GitHub repository — commits, PRs, CI
 * runs, tags — which this app does not query, so the page keeps the *layout* and fills it with the
 * four counts the admin shelves already compute, each linking into the surface that owns it. That
 * reading is stated in full on the issue; a page that invented a delivery chart would be a second
 * source of truth for numbers nobody measures here.
 *
 * **The `{placeholders}` are numbers, never words.** `fillLabel` fills them from
 * `lib/admin/start.ts::startFigures`, so the fixture holds the sentence and the page holds the
 * arithmetic, and neither can print a count the other did not read. The inbox's total is the newest
 * page's rows plus the rows the read did not return, which is the same arithmetic `/admin/inbox`'s
 * own "older messages exist" line rests on — the read is capped, and the count says so.
 *
 * **Two states, both honest.** `figures` is what an operator sees when all four reads answered;
 * `unreadable` is what they see when one did not — a landing page that quietly drew zeroes for a
 * database it could not reach would be worse than no page, because "nothing is open" and "nothing
 * could be read" look identical.
 */
import { zPageCopy, type PageCopy } from "../../content/pages";

export const adminStartPageCopy: PageCopy = zPageCopy.parse({
  eyebrow: "Admin · signed-in landing",
  heading: "Dashboard",
  subtitle:
    "The state of the product at a glance, and one door into every surface this console already has. This page reads; it has no control that writes.",
  sections: [
    {
      id: "figures",
      heading: "At a glance",
      body: "Four counts, each one a number the shelf below already prints. Nothing here is a new query: every figure is the read that screen makes when you open it.",
      items: [
        { id: "inbox-label", label: "Inbox messages" },
        { id: "inbox-note", label: "{seats} support seats can answer them." },
        { id: "review-label", label: "Open review to-dos" },
        { id: "review-note", label: "{artifacts} artifacts · {issues} issues still open." },
        { id: "sessions-label", label: "Relationships" },
        { id: "sessions-note", label: "Every session in the system, at every stage." },
        { id: "audit-label", label: "Audit actions" },
        { id: "audit-note", label: "The newest page of the log, which keeps no total on purpose." },
      ],
    },
    {
      id: "unreadable",
      heading: "The figures could not be read",
      body: "The database did not answer, so the four counts above are absent rather than zero — a landing page that drew zeroes for a store it could not reach would read as a quiet product. The directory below still works: it is a route list, not a query.",
      items: [{ id: "unreadable-reason", label: "{reason}" }],
    },
    {
      id: "surfaces",
      heading: "Where the work is",
      body: "One row per surface under /admin. Each one opens the page that owns it, so a figure above is a number you can check rather than one you take on trust.",
      items: [
        /**
         * The empty state (#1374, E40 rule 7) — an empty list gets a bordered block and one action,
         * never blank space. The directory is a fixture, so this renders only if that fixture is
         * emptied; it exists so the screen still says what happened when it is.
         */
        { id: "empty-title", label: "No surface is registered" },
        {
          id: "empty-body",
          label: "Nothing to open",
          body: "The directory fixture is empty, so there is no surface here to link to.",
        },
        { id: "empty-action", label: "Open the console" },
      ],
    },
    {
      id: "read-only",
      heading: "This page writes nothing",
      body: "No form, no server action and no mutation reaches this render: it gates on the console's own admin check, reads four shelves, and links. A control that changes something belongs on the screen that owns the change.",
    },
  ],
});
