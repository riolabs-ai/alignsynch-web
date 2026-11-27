// template-ancestor: components/admin/spec/spec-issues.tsx   (variation: the block is a comparison rather than a fact list — two readings of one register row, side by side under their own source labels, with the disagreement named instead of one side quietly preferred)
/**
 * The register's delivery comparison, drawn (#1452) — two readings of one row, and the drift.
 *
 * **This is the only place on the page where two sources meet.** Everything else on the matrix
 * prints one: the register columns are the agreement's snapshot, the issue block is the GitHub
 * reading. A row's *delivery* was the one fact both sides claimed, and until now only the snapshot
 * was shown — so a row whose issue closed last week still read `Tentative` and no line said the two
 * disagreed.
 *
 * **One source label per column, and no preference.** The left cell prints the register's status
 * under *Declared by the register*; the right prints what the issue says under *From the linked
 * issue*. Neither is styled as the winner, and a row where they disagree carries the marker in
 * words (`Differs from the register`) as well as a tone — a colour alone would be the defect AS-07
 * names.
 *
 * **A row nobody filed says so.** The right cell reads *No linked issue* rather than an empty cell
 * or an em dash, because "the register's word stands alone here" is a fact the reader needs, and an
 * empty cell is indistinguishable from a block that failed to draw.
 *
 * **The dates are per source and they are never merged.** The register's is the CSV's
 * `generatedAt`; the issue read's freshness is the cache's (`60 s`, refresh on demand) and it
 * carries **no date**, because the read does not report one — printing "just now" for it would be
 * the same defect in a friendlier voice.
 *
 * Server components: no state, no handler, no clock.
 */
import type { PageCopy } from "@/content/pages";
import type { SpecRow, SpecValidation } from "@/content/spec";
import type { DeliveryReading, DeliverySummary, SpecDeliveryState } from "@/lib/spec/delivery";
import { specDateLabel } from "@/lib/spec/evidence";
import { fillLabel, pageItemOf } from "@/lib/page-copy";
import { Chip } from "@/components/ui/badge";

/**
 * The issue's reading as the page's word. `open` is the register's own `issues-open` label rather
 * than a second spelling of it; the other three are this surface's.
 */
function specDeliveryWord(copy: PageCopy, state: SpecDeliveryState): string {
  switch (state) {
    case "delivered":
      return pageItemOf(copy, "delivery-delivered").label;
    case "not-planned":
      return pageItemOf(copy, "delivery-not-planned").label;
    case "open":
      return pageItemOf(copy, "issues-open").label;
    case "unrecorded":
      return pageItemOf(copy, "delivery-unrecorded").label;
  }
}

/** The row's marker: `none` for a row nobody filed, `differs` where the two readings disagree. */
function deliveryMarkerOf(reading: DeliveryReading): "agrees" | "differs" | "none" {
  if (reading.derived === null) return "none";
  return reading.agreesWithDeclared === false ? "differs" : "agrees";
}

/** The two readings, side by side, under their own labels — the per-row block. */
export function SpecDeliveryComparison({
  copy,
  row,
  reading,
}: {
  copy: PageCopy;
  row: SpecRow;
  reading: DeliveryReading;
}) {
  const marker = deliveryMarkerOf(reading);
  const derived = reading.derived;

  return (
    <div
      data-spec-delivery={marker}
      data-spec-declared-status={row.status}
      data-spec-derived-status={derived === null ? "none" : derived.status}
      className="min-w-0"
    >
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {pageItemOf(copy, "delivery-heading").label}
      </span>
      <div className="mt-0.5 grid grid-cols-2 gap-1.5">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
            {pageItemOf(copy, "delivery-declared").label}
          </span>
          <span className="block text-xs font-medium">{row.status}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
            {pageItemOf(copy, "delivery-derived").label}
          </span>
          <span className="block text-xs font-medium">
            {derived === null
              ? pageItemOf(copy, "delivery-no-issue").label
              : specDeliveryWord(copy, derived.status)}
          </span>
        </div>
      </div>

      {marker === "differs" ? (
        <Chip
          variant="soft"
          data-spec-delivery-marker="differs"
          className="mt-1 gap-1 border-small-gap-mark bg-small-gap-tint text-small-gap"
        >
          <span aria-hidden="true">◐ </span>
          <span>{pageItemOf(copy, "delivery-differs").label}</span>
        </Chip>
      ) : null}

      {reading.tierAgrees === false ? (
        <span data-spec-delivery-tier="differs" className="mt-1 block text-[11px] text-gap">
          {pageItemOf(copy, "delivery-tier-differs").label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The four counts, the two source labels with their own freshness, and the disagreement list —
 * drawn once, above the sections.
 *
 * Every number here comes from `specDeliveryOf` over a **ready** read, so it is a measurement of
 * what GitHub answered. When the read is unavailable the page draws no comparison at all rather
 * than a row of zeroes, which would read as "nobody filed anything".
 */
export function SpecDeliverySummary({
  copy,
  doc,
  summary,
}: {
  copy: PageCopy;
  /** The register, for its own date and CSV digest — the declared source's freshness. */
  doc: SpecValidation;
  summary: DeliverySummary;
}) {
  const words = (id: string) => pageItemOf(copy, id).label;

  return (
    <section
      data-spec-delivery-summary=""
      aria-labelledby="spec-delivery-heading"
      className="mb-4 rounded-lg border bg-card p-3"
    >
      <h2 id="spec-delivery-heading" className="text-sm font-semibold">
        {words("delivery-summary-heading")}
      </h2>

      <div className="mt-1 grid gap-0.5 text-[11px] leading-snug text-muted-foreground">
        <p data-spec-delivery-source="register">
          {fillLabel(words("delivery-register-source"), {
            date: specDateLabel(doc.register.generatedAt),
            sha: doc.register.csvSha256.slice(0, 8),
          })}
        </p>
        <p data-spec-delivery-source="issue">
          {words("delivery-derived")}
          <span aria-hidden="true"> · </span>
          {words("issues-live")}
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <li data-spec-delivery-count="read">
          <span className="font-semibold tabular-nums">{summary.withReading}</span>
          <span aria-hidden="true"> </span>
          {fillLabel(words("delivery-summary-read"), {
            rows: summary.withReading + summary.withoutIssue,
          })}
        </li>
        <li data-spec-delivery-count="agree">
          <span className="font-semibold tabular-nums">{summary.agreeing}</span>
          <span aria-hidden="true"> </span>
          {words("delivery-summary-agree")}
        </li>
        <li data-spec-delivery-count="differ">
          <span className="font-semibold tabular-nums">{summary.disagreeing.length}</span>
          <span aria-hidden="true"> </span>
          {words("delivery-summary-differ")}
        </li>
        <li data-spec-delivery-count="none">
          <span className="font-semibold tabular-nums">{summary.withoutIssue}</span>
          <span aria-hidden="true"> </span>
          {words("delivery-summary-none")}
        </li>
      </ul>

      <p className="mt-2 max-w-prose text-[11px] text-muted-foreground">
        {words("delivery-summary-note")}
      </p>

      <p className="mt-2 text-xs font-semibold">{words("delivery-list-heading")}</p>
      {summary.disagreeing.length === 0 ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {summary.withReading === 0
            ? words("delivery-list-none-issues")
            : words("delivery-list-none")}
        </p>
      ) : (
        <ul data-spec-delivery-disagreements="" className="mt-0.5 grid gap-0.5 text-xs">
          {summary.disagreeing.map((rowId) => {
            const reading = summary.readings[rowId];
            const state = reading?.derived?.status ?? null;
            return (
              <li key={rowId} data-spec-delivery-differs={rowId}>
                <span className="font-mono font-semibold">{rowId}</span>
                <span aria-hidden="true"> · </span>
                {fillLabel(words("delivery-list-row"), {
                  declared: reading?.declaredStatus ?? words("delivery-no-issue"),
                  derived:
                    state === null ? words("delivery-no-issue") : specDeliveryWord(copy, state),
                })}
              </li>
            );
          })}
        </ul>
      )}

      {summary.tierMismatches.length === 0 ? null : (
        <p
          data-spec-delivery-tier-list={summary.tierMismatches.length}
          className="mt-1 text-[11px] text-gap"
        >
          {fillLabel(words("delivery-list-tier"), { ids: summary.tierMismatches.join(", ") })}
        </p>
      )}
    </section>
  );
}
