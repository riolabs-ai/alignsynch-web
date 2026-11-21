/**
 * template-ancestor: components/admin/docs/features-index.tsx   (variation: a flat, newest-first ledger of one row per merged pull request — date, area, summary, reader impact and the documents the rule now lives in — instead of a stat grid over feature areas with a card per area)
 *
 * `/admin/docs/updates` — the update ledger (the owner ask of 2026-11-21).
 *
 * **A server component, and it has to be.** The rows are derived on the request from
 * `docs/changelog/updates/*.json` and `docs/docs.json` (`lib/docs/tree.ts`, `lib/docs/updates.ts`);
 * there is no state, no filter and no control, so shipping the entries to the browser to re-render
 * what the server already drew would be a cost this screen does not have to pay.
 *
 * **The row is the unit, and it carries the two sentences the release note cannot.** `summary` is
 * what changed; `reader_impact` is who notices and where — the field that stops this being a commit
 * log. The spec links are the point of the file: `/admin/docs/<path>` when the hub carries the
 * document, and the path with the fixture's marker when it does not, because an anchor to a 404 is
 * the silent failure this ledger exists to remove.
 *
 * **Nothing is authored here.** There is no entry list, no scope vocabulary and no date: the rows
 * arrive from the files, and a new PR adds one without an edit to this file. Every word that is not
 * a record comes from `data/pages/admin-docs.ts` (E23 budget 0).
 */
import { History, ScrollText } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PageCopy, PageCopySection } from "@/content/pages";
import { REPO_URL } from "@/lib/docs/changelog";
import type { UpdateRow } from "@/lib/docs/updates";
import { fillLabel, itemLabel, sectionBody, sectionOf } from "@/lib/page-copy";

export interface UpdatesLedgerProps {
  copy: PageCopy;
  /** Every entry, newest first — derived from the files, never listed. */
  rows: readonly UpdateRow[];
  /** Why the ledger could not be read, or `null`. Drawn instead of the rows. */
  unreadable: string | null;
}

/** `{count} entries` vs `{count} entry` — the pair the fixture declares, never a plural `s`. */
function counted(index: PageCopySection, count: number): string {
  return fillLabel(itemLabel(index, count === 1 ? "entry-count-one" : "entry-count"), { count });
}

export function UpdatesLedger({ copy, rows, unreadable }: UpdatesLedgerProps) {
  const index = sectionOf(copy, "ledger");

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <History className="h-5 w-5 text-action" aria-hidden />
          <h1 className="text-2xl font-bold text-foreground">{copy.heading}</h1>
          <Badge variant="muted" data-entry-count={rows.length}>
            {counted(index, rows.length)}
          </Badge>
        </div>
        {copy.subtitle === undefined ? null : (
          <p className="max-w-3xl text-sm text-muted-foreground">{copy.subtitle}</p>
        )}
        {copy.cta === undefined ? null : (
          <Link href={copy.cta.href} className="text-sm font-medium text-action hover:underline">
            {copy.cta.label}
          </Link>
        )}
      </header>

      {unreadable === null ? null : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-foreground" data-unreadable="true">
            {fillLabel(itemLabel(index, "unreadable"), { reason: unreadable })}
          </p>
        </div>
      )}

      {unreadable !== null ? null : rows.length === 0 ? (
        <p
          data-empty="true"
          className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
        >
          {itemLabel(index, "empty")}
        </p>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-4">
            {rows.map((row) => (
              <li key={row.pr}>
                <Card id={`pr-${row.pr}`} data-entry={row.pr} className="h-full">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
                        <span className="font-mono text-sm text-muted-foreground">{row.date}</span>
                        <span className="font-mono text-action">{row.area}</span>
                        <span className="text-sm text-muted-foreground">
                          {itemLabel(index, "pull-request-label")}
                        </span>
                        <a
                          href={`${REPO_URL}/pull/${row.pr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm text-action underline underline-offset-2"
                        >
                          #{row.pr}
                        </a>
                      </CardTitle>
                      {row.risk === undefined ? null : (
                        <Badge variant={row.risk === "none" ? "muted" : "warning"}>
                          {itemLabel(index, "risk-label")} {row.risk}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-foreground" data-entry-summary={row.pr}>
                      {row.summary}
                    </p>

                    <section className="space-y-1">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {itemLabel(index, "impact-label")}
                      </h2>
                      <p className="text-sm text-foreground">{row.reader_impact}</p>
                    </section>

                    <section className="space-y-1">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {itemLabel(index, "specs-label")}
                      </h2>
                      <ul className="space-y-1">
                        {row.specLinks.map((spec) => (
                          <li key={spec.path} className="text-sm">
                            {spec.href === null ? (
                              <span
                                className="flex flex-wrap items-baseline gap-2 text-muted-foreground"
                                data-spec-not-in-hub={spec.path}
                              >
                                <ScrollText className="h-3.5 w-3.5" aria-hidden />
                                <span className="font-mono text-xs">{spec.path}</span>
                                <Badge variant="warning">{itemLabel(index, "not-in-hub")}</Badge>
                              </span>
                            ) : (
                              <Link
                                href={spec.href}
                                data-spec-link={spec.path}
                                className="flex flex-wrap items-baseline gap-2 text-action hover:underline"
                              >
                                <ScrollText className="h-3.5 w-3.5" aria-hidden />
                                <span className="font-mono text-xs">{spec.path}</span>
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <p className="text-xs text-muted-foreground">{sectionBody(index)}</p>
        </div>
      )}
    </div>
  );
}
