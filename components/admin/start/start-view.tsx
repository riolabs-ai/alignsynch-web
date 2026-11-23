/**
 * template-ancestor: components/admin/platform-health.tsx   (variation: four read-only stat cards become a landing page's KPI row — the same `label / value / source` triple, plus the directory of surfaces underneath that turns each number into a door)
 *
 * `/admin/start` — the read-only landing (#1374).
 *
 * **The mock, and where this page keeps it.** The owner's mock draws a kicker, an H1, an intro, a
 * four-tile KPI row, then cards that each carry a heading, a muted help line and rows. Its figures
 * are GitHub measurements — 772 commits, 769 merged PRs, 11 min median merge, a throughput chart —
 * which this app does not query and a hotfix lane must not add. So the *shape* is the mock's and
 * the *numbers* are the four shelves this console already reads; the full reading is on #1374, and
 * a page that drew a delivery chart would be reporting numbers nobody here measures.
 *
 * **No `"use client"`.** Every value is decided on the server by the page module (four existing
 * reads), nothing here holds state, and there is no event handler anywhere in it — so the landing
 * ships no JavaScript and the parity harness can render it.
 *
 * **Zero literals, by construction (E23).** Every word comes from `data/pages/admin-start.ts`
 * through `sectionOf`/`itemLabel`/`fillLabel`; the directory's titles and notes are
 * `data/admin/start-surfaces.ts`. `className` and `href` are markup attributes and are not counted,
 * and an href that no route answers is still a red build (E10) — which is the check that matters
 * for a page whose whole job is to link.
 *
 * **The failure is a sentence, not four zeroes.** `figures === null` draws the fixture's
 * `unreadable` panel with the database's own reason; a card that printed 0 for a store it could not
 * reach would be the one lie this console exists to prevent.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminStartSurface } from "@/data/admin/start-surfaces";
import type { PageCopy } from "@/content/pages";
import type { StartFigures } from "@/lib/admin/start";
import { fillLabel, itemBody, itemLabel, sectionBody, sectionOf } from "@/lib/page-copy";
import { Activity, ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** One KPI tile: the label, the number, the note under it, and the door it is also a link to. */
function Figure({
  href,
  label,
  value,
  note,
}: {
  href: string;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-action hover:bg-muted/40"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-action"
        />
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">{value}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{note}</span>
    </Link>
  );
}

/** One row of the directory: the surface's title, its sentence, and the address it opens. */
function SurfaceRow({ surface }: { surface: AdminStartSurface }) {
  return (
    <Link
      href={surface.href}
      className="flex flex-col gap-1 rounded-md border-b px-2 py-3 last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
    >
      <span className="text-sm font-medium text-foreground">{surface.title}</span>
      <span className="text-xs text-muted-foreground sm:max-w-[60%] sm:text-right">
        {surface.note}
      </span>
    </Link>
  );
}

export function AdminStartView({
  copy,
  figures,
  unreadable,
  surfaces,
}: {
  copy: PageCopy;
  /** `null` when a shelf could not be read — the page then draws the fixture's failure panel. */
  figures: StartFigures | null;
  /** The database's own reason, when there is one. Rendered only inside the failure panel. */
  unreadable: string | null;
  surfaces: readonly AdminStartSurface[];
}): ReactNode {
  const figuresSection = sectionOf(copy, "figures");
  const unreadableSection = sectionOf(copy, "unreadable");
  const surfacesSection = sectionOf(copy, "surfaces");
  const readOnlySection = sectionOf(copy, "read-only");

  /**
   * The four tiles, in the order the fixture declares them. `{newest}`/`{hidden}`/etc. are filled
   * from the same numbers the value prints, so a note can never describe a different read.
   */
  const tiles: readonly {
    href: string;
    label: string;
    value: number;
    note: string;
  }[] =
    figures === null
      ? []
      : [
          {
            href: "/admin/inbox",
            label: itemLabel(figuresSection, "inbox-label"),
            value: figures.inboxMessages,
            note: fillLabel(itemLabel(figuresSection, "inbox-note"), {
              seats: figures.inboxSeats,
            }),
          },
          {
            href: "/admin/review",
            label: itemLabel(figuresSection, "review-label"),
            value: figures.reviewOpenTodos,
            note: fillLabel(itemLabel(figuresSection, "review-note"), {
              artifacts: figures.reviewArtifacts,
              issues: figures.reviewOpenIssues,
            }),
          },
          {
            href: "/admin/instances",
            label: itemLabel(figuresSection, "sessions-label"),
            value: figures.sessions,
            note: itemLabel(figuresSection, "sessions-note"),
          },
          {
            href: "/admin/audit",
            label: itemLabel(figuresSection, "audit-label"),
            value: figures.auditRows,
            note: itemLabel(figuresSection, "audit-note"),
          },
        ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-action">{copy.eyebrow}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{copy.heading}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
      </header>

      {figures === null ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity aria-hidden="true" className="size-4 text-destructive" />
              {unreadableSection.heading}
            </CardTitle>
            <CardDescription>{sectionBody(unreadableSection)}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xs text-destructive">
              {fillLabel(itemLabel(unreadableSection, "unreadable-reason"), {
                reason: unreadable ?? "",
              })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">{figuresSection.heading}</h2>
            <p className="max-w-3xl text-xs text-muted-foreground">{sectionBody(figuresSection)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <Figure
                key={tile.href}
                href={tile.href}
                label={tile.label}
                value={tile.value}
                note={tile.note}
              />
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{surfacesSection.heading}</CardTitle>
          <CardDescription>{sectionBody(surfacesSection)}</CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          {surfaces.length === 0 ? (
            /*
              E40 rule 7 (#1374): an empty list gets an explicit bordered block and one action,
              never blank space. The directory is a fixture, so this renders only if it is emptied —
              and when it is, the screen says so and hands the operator a working door.
            */
            <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
              <p className="text-sm font-medium text-foreground">
                {itemLabel(surfacesSection, "empty-title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {itemBody(surfacesSection, "empty-body")}
              </p>
              <Link
                href="/admin/console"
                className="text-sm font-medium text-action underline-offset-4 hover:underline"
              >
                {itemLabel(surfacesSection, "empty-action")}
              </Link>
            </div>
          ) : (
            surfaces.map((surface) => <SurfaceRow key={surface.id} surface={surface} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
            {readOnlySection.heading}
          </CardTitle>
          <CardDescription>{sectionBody(readOnlySection)}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
