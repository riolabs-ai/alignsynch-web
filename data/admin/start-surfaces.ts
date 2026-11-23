/**
 * The admin surfaces `/admin/start` links into — the landing page's directory, as data.
 *
 * **Why a fixture and not markup.** Every row is a title, an address and one sentence, and E23's
 * rule is that reader-visible copy lives in `data/`, never in a component. A list the component
 * spelled itself would be sixteen literals in the JSX and a red budget.
 *
 * **Why it is not `data/pages/admin-start.ts`.** `PageCopyItem` is `{id, label, value?, body?}` and
 * `strict()` — it has no `href`, deliberately, because a copy fixture is words and a destination is
 * a route. So the addresses live here beside them, and the page copy fixture carries the page's own
 * headings and the two `{placeholder}` sentences the counts fill.
 *
 * **`/admin/brand` is deliberately absent.** It is the one console page gated by *two* products —
 * `requireAdminProduct()` **and** the alignment product — so a quiz-only build answers it the
 * unknown-URL 404 (`content/routes.ts` records that at its row). This page is mounted under
 * `product.admin` alone, which both brands claim, so a row here would be a door that opens on one
 * brand and 404s on the other.
 *
 * Titles are the headings those pages already print (`data/pages/admin-*.ts`), so a rename upstream
 * is a delete-and-replace here rather than a second name for the same surface.
 */
export interface AdminStartSurface {
  /** Stable handle, also the React key. */
  readonly id: string;
  /** The route — one of `content/routes.ts`'s static admin rows, checked by E10. */
  readonly href: string;
  /** The words that page's own heading uses. */
  readonly title: string;
  /** One sentence: what an operator opens it for. */
  readonly note: string;
}

/**
 * The directory, in the order an operator works it: the surface that answers "is it up", the four
 * the counts above the list come from, then the work surfaces, then the reference shelves.
 */
export const ADMIN_START_SURFACES: readonly AdminStartSurface[] = [
  {
    id: "health",
    href: "/admin/health",
    title: "Platform health",
    note: "The last recorded gate, release and deployment measurements, and the alarm when they disagree.",
  },
  {
    id: "instances",
    href: "/admin/instances",
    title: "Relationships",
    note: "Every session in the system: who holds it, which stage it reached, and what it still owes.",
  },
  {
    id: "review",
    href: "/admin/review",
    title: "Review artifacts",
    note: "The review shelves: each artifact's open to-dos and its issue threads.",
  },
  {
    id: "inbox",
    href: "/admin/inbox",
    title: "Support inbox",
    note: "Inbound messages, the support seats they can be answered from, and the sends already made.",
  },
  {
    id: "audit",
    href: "/admin/audit",
    title: "Audit log",
    note: "Every recorded admin action, newest first, filterable by actor, area and instant.",
  },
  {
    id: "billing",
    href: "/admin/billing",
    title: "Billing",
    note: "Subscription state per relationship, the plan in force, and the owner's comp.",
  },
  {
    id: "console",
    href: "/admin/console",
    title: "Console",
    note: "The operator's overview of the store the console screens read.",
  },
  {
    id: "gaps",
    href: "/admin/gaps",
    title: "The Gap",
    note: "The Gap across completed relationships, aggregated from the completed opinions.",
  },
  {
    id: "growth",
    href: "/admin/growth",
    title: "Growth model",
    note: "The funnel an operator reads the business by, in one screen.",
  },
  {
    id: "broadcast",
    href: "/admin/broadcast",
    title: "Broadcast",
    note: "Compose, dry-run and send a broadcast, and read the sends already made.",
  },
  {
    id: "templates",
    href: "/admin/templates",
    title: "Templates",
    note: "Every assessment template, its drafts and the versions it has shipped.",
  },
  {
    id: "email-templates",
    href: "/admin/email-templates",
    title: "Email Templates",
    note: "The transactional mail bodies this deployment sends, one per template.",
  },
  {
    id: "permissions",
    href: "/admin/permissions",
    title: "CRUD & Permissions",
    note: "What each role may read, create, update and delete, and the floor each write re-asks.",
  },
  {
    id: "docs",
    href: "/admin/docs",
    title: "Documentation",
    note: "The documentation tree this repo ships, rendered from the manifest the gate walks.",
  },
  {
    id: "spec",
    href: "/admin/spec",
    title: "Project Spec",
    note: "The specification the build is measured against, group by group.",
  },
];
