/**
 * The register's delivery half, derived at read time (#1452) — the model, and nothing else.
 *
 * **The register carries two kinds of fact, and only one of them can be live.**
 *
 *   agreement record   quote, pages, requirement, Definition of Done, approval, parity basis —
 *                      what the 2024 agreement *said*. It is a snapshot by nature: it changes when
 *                      `VALIDATION.csv` changes, never when GitHub does.
 *   delivery state     whether the row is done, the tier it rides, what comes next, its milestone —
 *                      what the build is *doing*. GitHub answers this today.
 *
 * `data/spec/validation.json` carries both, because it was generated from a file where both were
 * written down. That is why the matrix prints `Tentative` beside an issue that closed last week and
 * nothing on the page says the two disagree. This module turns the second kind into a second
 * reading, so the page can show both and name the drift — the comparison is the feature, and
 * overwriting either side with the other would lose it.
 *
 * **What GitHub actually answers, and what it does not.** An issue carries `state` and, for a
 * closed one, `state_reason` (`completed` = the work shipped, `not_planned` = it was dropped).
 * Those are the delivery facts, and they are read as four readings, not two:
 *
 *   delivered     closed, `completed`  — the work is on `main`
 *   not-planned   closed, `not_planned` — the work was dropped; **a closed issue is not a shipped
 *                                       one**, and a comparison that read only `state` would call
 *                                       APP-05 delivered on the day it was dropped
 *   open          open                 — not delivered yet
 *   unrecorded    closed, no reason    — nobody can say which of the two it was, so this module
 *                                       refuses to guess and the page prints it as unknown
 *
 * The **agreement** (`agreesWithDeclared`) is compared on the one axis both sides can answer: is
 * the row delivered. `Delivered`, `Over-Delivered` and `Offset` are the register's met statuses
 * (`SPEC_MET_STATUSES`); everything else is not met. Comparing the *words* would invent a
 * precision GitHub does not have — an open issue cannot say whether a row is `Tentative` or
 * `Partial`, and demanding it match one of them would report 21 rows as disagreements when they
 * agree about the only thing the issue knows.
 *
 * **`nextAcceptance` is null, deliberately.** An issue has no structured next-acceptance field,
 * and the `**Next**` prose in its body was written at filing time — parsing it would present a
 * week-old sentence as a live reading, which is exactly the "one freshness date for two sources"
 * defect this card exists to prevent. The register's own `next` sentence is printed under the
 * *declared* label; the issue's live contribution to "what next" is that it is still open.
 *
 * **No fetch, no cache, no clock, no filesystem.** Inputs are a register row and the issue the
 * existing 60 s `SPEC_ISSUES_TAG` read already joined to it; output is the reading. That is what
 * makes `tests/spec-delivery.test.ts` a table of rows and issues instead of a mock.
 */
import { SPEC_MET_STATUSES, type SpecRow, type SpecStatus } from "@/content/spec";

import { SPEC_TIER_PREFIX, type SpecIssue, type SpecIssuesReady } from "./issues";

/**
 * The tier vocabulary the register's release map and the issue's `tier/*` label share. One list, so
 * a tier the register gains is a `tsc` error here rather than a string nothing compares.
 */
export const SPEC_TIER_TOKENS = ["R1", "R2", "Later"] as const;

export type SpecTierToken = (typeof SPEC_TIER_TOKENS)[number];

/** Word-bounded, because `rc1.2` and `#1244` are not tier R1 and R2. */
const TIER_PATTERNS: Readonly<Record<SpecTierToken, RegExp>> = {
  R1: /\bR1\b/,
  R2: /\bR2\b/,
  Later: /\bLater\b/,
};

/** The four readings a linked issue can give. Tokens, not copy: the page holds the words. */
export const SPEC_DELIVERY_STATES = ["delivered", "not-planned", "open", "unrecorded"] as const;

export type SpecDeliveryState = (typeof SPEC_DELIVERY_STATES)[number];

/** What the issue says about delivery — never what the register says, and never merged with it. */
export interface DerivedDelivery {
  /** The issue's own delivery state, as a token (`delivered`, `not-planned`, `open`, `unrecorded`). */
  readonly status: SpecDeliveryState;
  /** The `tier/*` label with its prefix stripped (`R1`), or `null` when the issue carries none. */
  readonly tier: string | null;
  /** Always `null`: GitHub has no structured next-acceptance — see the module note. */
  readonly nextAcceptance: null;
  /** The milestone's title as GitHub carries it, or `null`. Live, and the register has no column. */
  readonly milestone: string | null;
}

/** One row's two readings, and whether they agree. */
export interface DeliveryReading {
  /** The register's own status for the row — the *declared* value, carried so a list of
   *  disagreements can print both readings without a second lookup back into the register. */
  readonly declaredStatus: SpecStatus;
  /** The issue's reading, or `null` when the row has no linked issue. */
  readonly derived: DerivedDelivery | null;
  /**
   * Does the issue agree with the register about delivery? `null` means *there is nothing to
   * compare*: the row was never filed, or the issue is closed with no recorded reason and nobody
   * can say which way it went. Never `false` for "no issue" — those are different facts.
   */
  readonly agreesWithDeclared: boolean | null;
  /**
   * The issue's tier label against the tiers the register's release map names. `null` when either
   * side is silent, which is the common case and not a disagreement.
   */
  readonly tierAgrees: boolean | null;
}

/** The whole register's comparison — the four counts the page prints, in register order. */
export interface DeliverySummary {
  readonly readings: Readonly<Record<string, DeliveryReading>>;
  /** Rows whose issue supplied a reading. */
  readonly withReading: number;
  /** …of those, the ones that agree with the register about delivery. */
  readonly agreeing: number;
  /** …and the ones that do not, named by row id, in register order. */
  readonly disagreeing: readonly string[];
  /** …and the ones nobody can call, because the issue closed with no reason. */
  readonly undetermined: readonly string[];
  /** Rows with no marker-bearing issue at all: the register's word stands alone. */
  readonly withoutIssue: number;
  /** Rows whose tier label names a tier the register's release map does not carry. */
  readonly tierMismatches: readonly string[];
}

/**
 * Is this row met, by the register's own count? `Delivered`, `Over-Delivered` and `Offset` are the
 * three met statuses, and `Offset` counts as met because the agreement's scope moved rather than
 * the work being undone — the same reading the gauge uses, from the same constant.
 */
export function registerSaysDelivered(row: SpecRow): boolean {
  return SPEC_MET_STATUSES.has(row.status);
}

/** The tier tokens the register's own release map names for a row. */
export function declaredTiersOf(row: SpecRow): readonly SpecTierToken[] {
  const release = [row.release.v200, row.release.rc2, row.release.rc3, row.release.beta];
  return SPEC_TIER_TOKENS.filter((token) =>
    release.some((value) => TIER_PATTERNS[token].test(value)),
  );
}

/**
 * The issue's delivery state — the four readings, and the reason `state_reason` is read at all: a
 * `not_planned` close is a decision not to build, and calling it delivered would put a shipped word
 * on work nobody did.
 */
export function deliveryStateOf(issue: SpecIssue): SpecDeliveryState {
  if (issue.state === "open") return "open";
  if (issue.stateReason === "completed") return "delivered";
  if (issue.stateReason === "not_planned") return "not-planned";
  return "unrecorded";
}

/** Does this reading say the row is delivered? `null` when the issue closed without saying why. */
function deliveredFrom(state: SpecDeliveryState): boolean | null {
  if (state === "delivered") return true;
  if (state === "unrecorded") return null;
  return false;
}

/** One row and its joined issue, as the page reads them. */
export function deliveryReadingOf(row: SpecRow, issue: SpecIssue | null): DeliveryReading {
  if (issue === null) {
    return {
      declaredStatus: row.status,
      derived: null,
      agreesWithDeclared: null,
      tierAgrees: null,
    };
  }

  const status = deliveryStateOf(issue);
  const derived: DerivedDelivery = {
    status,
    tier: issue.tier === null ? null : issue.tier.slice(SPEC_TIER_PREFIX.length),
    nextAcceptance: null,
    milestone: issue.milestone,
  };

  const delivered = deliveredFrom(status);
  const declaredTiers = declaredTiersOf(row);
  const tierAgrees =
    derived.tier === null || declaredTiers.length === 0
      ? null
      : declaredTiers.some((token) => token === derived.tier);

  return {
    declaredStatus: row.status,
    derived,
    agreesWithDeclared: delivered === null ? null : delivered === registerSaysDelivered(row),
    tierAgrees,
  };
}

/**
 * The whole register, against one **ready** read.
 *
 * A read that is not `ready` must not reach this function: `unavailable` and `stale`-without-a-set
 * mean nobody knows which rows were filed, and summarising that as "88 rows with no issue" would be
 * a claim about GitHub that was never made. The page passes the read only when it is `ready`, and
 * draws no comparison otherwise.
 */
export function specDeliveryOf(rows: readonly SpecRow[], read: SpecIssuesReady): DeliverySummary {
  const readings: Record<string, DeliveryReading> = {};
  const disagreeing: string[] = [];
  const undetermined: string[] = [];
  const tierMismatches: string[] = [];
  let withReading = 0;
  let agreeing = 0;
  let withoutIssue = 0;

  for (const row of rows) {
    const issue = read.issues[row.id] ?? null;
    const reading = deliveryReadingOf(row, issue);
    readings[row.id] = reading;

    if (reading.derived === null) {
      withoutIssue += 1;
      continue;
    }

    withReading += 1;
    if (reading.agreesWithDeclared === true) agreeing += 1;
    else if (reading.agreesWithDeclared === null) undetermined.push(row.id);
    else disagreeing.push(row.id);
    if (reading.tierAgrees === false) tierMismatches.push(row.id);
  }

  return {
    readings,
    withReading,
    agreeing,
    disagreeing,
    undetermined,
    withoutIssue,
    tierMismatches,
  };
}
