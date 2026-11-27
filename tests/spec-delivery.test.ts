/**
 * The register's delivery comparison (#1452) — a table of rows and issues, and the drift.
 *
 * **Why a table and not a render.** The feature is a *comparison*, so the thing that can be wrong is
 * the comparison itself: which issue state counts as delivered, whether a row nobody filed reads as
 * `false` or as "nothing to compare", whether a dropped issue is called shipped. Every case below is
 * one cell of that table, driven with the committed register's own rows (`APP-02` is `Delivered`,
 * `APP-05` is `Tentative` and rides `R1`) and a GitHub payload built by hand — no network, no cache,
 * no clock, which is what makes the module pure.
 *
 * **The four degenerate cases the card names** are here by name: no issue, an issue without the
 * marker, an issue closed beside a `Tentative` row, and a `Delivered` row beside an open issue.
 */
import { describe, expect, it } from "vitest";

import type { SpecRow } from "@/content/spec";
import {
  declaredTiersOf,
  deliveryReadingOf,
  deliveryStateOf,
  registerSaysDelivered,
  specDeliveryOf,
} from "@/lib/spec/delivery";
import { readSpecValidation } from "@/lib/spec/file";
import { specIssuesOf, type SpecIssuesReady } from "@/lib/spec/issues";

const doc = readSpecValidation();

/** One row, from the committed register — the page reads these same rows. */
function rowOf(id: string): SpecRow {
  const row = doc.rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`the register carries no row ${id}`);
  return row;
}

/** One issue as GitHub serves it. `rowId === null` files a body with no marker. */
function payloadOf(
  number: number,
  rowId: string | null,
  overrides: {
    state?: "open" | "closed";
    stateReason?: "completed" | "not_planned" | null;
    labels?: string[];
    milestone?: string | null;
  } = {},
) {
  return {
    number,
    state: overrides.state ?? "open",
    state_reason: overrides.stateReason ?? null,
    body: rowId === null ? "filed without a marker" : `<!-- spec-row:${rowId} -->`,
    html_url: `https://github.com/riolabs-ai/alignsynch-web/issues/${number}`,
    milestone:
      overrides.milestone === undefined
        ? { title: "v2.0.0 — the official release" }
        : overrides.milestone === null
          ? null
          : { title: overrides.milestone },
    labels: (overrides.labels ?? ["spec"]).map((name) => ({ name })),
  };
}

/** A ready read over the given entries. */
function readOf(entries: unknown[]): SpecIssuesReady {
  const read = specIssuesOf(entries);
  if (read === null) throw new Error("the fixture payload did not parse as a collection");
  return read;
}

/** The issue one payload entry becomes, as the page would see it. */
function issueOf(number: number, rowId: string, overrides: Parameters<typeof payloadOf>[2] = {}) {
  const issue = readOf([payloadOf(number, rowId, overrides)]).issues[rowId];
  if (issue === undefined) throw new Error(`the payload did not map to ${rowId}`);
  return issue;
}

describe("one row and its issue", () => {
  it("reads a completed close as delivered, and agrees with a row the register counts as met", () => {
    const row = rowOf("APP-02");
    expect(registerSaysDelivered(row)).toBe(true);

    const reading = deliveryReadingOf(
      row,
      issueOf(1268, "APP-02", { state: "closed", stateReason: "completed" }),
    );

    expect(reading.declaredStatus).toBe("Delivered");
    expect(reading.derived).toMatchObject({
      status: "delivered",
      tier: null,
      nextAcceptance: null,
      milestone: "v2.0.0 — the official release",
    });
    expect(reading.agreesWithDeclared).toBe(true);
    expect(reading.tierAgrees).toBeNull();
  });

  it("reads an open issue as not delivered, and agrees with a row the register does not count", () => {
    const reading = deliveryReadingOf(rowOf("APP-05"), issueOf(1268, "APP-05"));
    expect(reading.declaredStatus).toBe("Tentative");
    expect(reading.derived?.status).toBe("open");
    expect(reading.agreesWithDeclared).toBe(true);
  });

  it("a row the register calls Delivered beside an open issue is a disagreement, both ways kept", () => {
    const reading = deliveryReadingOf(rowOf("APP-02"), issueOf(1268, "APP-02"));
    expect(reading.declaredStatus).toBe("Delivered");
    expect(reading.derived?.status).toBe("open");
    expect(reading.agreesWithDeclared).toBe(false);
  });

  it("an issue closed as completed beside a Tentative row is a disagreement", () => {
    const reading = deliveryReadingOf(
      rowOf("APP-05"),
      issueOf(1268, "APP-05", { state: "closed", stateReason: "completed" }),
    );
    expect(reading.declaredStatus).toBe("Tentative");
    expect(reading.derived?.status).toBe("delivered");
    expect(reading.agreesWithDeclared).toBe(false);
  });

  it("a close recorded as not planned is a decision not to build, not a delivery", () => {
    const reading = deliveryReadingOf(
      rowOf("APP-05"),
      issueOf(1268, "APP-05", { state: "closed", stateReason: "not_planned" }),
    );
    expect(reading.derived?.status).toBe("not-planned");
    // It agrees with the register: both say this row is not delivered. Reading only `state` would
    // have called a dropped row shipped.
    expect(reading.agreesWithDeclared).toBe(true);
  });

  it("a closed issue with no recorded reason is undetermined — neither agreement nor disagreement", () => {
    const reading = deliveryReadingOf(
      rowOf("APP-02"),
      issueOf(1268, "APP-02", { state: "closed" }),
    );
    expect(reading.derived?.status).toBe("unrecorded");
    expect(reading.agreesWithDeclared).toBeNull();
  });

  it("a row with no issue has no derived reading, and null is never a disagreement", () => {
    const reading = deliveryReadingOf(rowOf("APP-05"), null);
    expect(reading.declaredStatus).toBe("Tentative");
    expect(reading.derived).toBeNull();
    expect(reading.agreesWithDeclared).toBeNull();
    expect(reading.tierAgrees).toBeNull();
  });

  it("reads the issue's tier label against the tiers the register's release map names", () => {
    const row = rowOf("APP-05");
    expect(declaredTiersOf(row)).toEqual(["R1"]);

    const same = deliveryReadingOf(row, issueOf(1268, "APP-05", { labels: ["spec", "tier/R1"] }));
    expect(same.derived?.tier).toBe("R1");
    expect(same.tierAgrees).toBe(true);

    const other = deliveryReadingOf(row, issueOf(1268, "APP-05", { labels: ["spec", "tier/R2"] }));
    expect(other.derived?.tier).toBe("R2");
    expect(other.tierAgrees).toBe(false);

    const silent = deliveryReadingOf(row, issueOf(1268, "APP-05", { labels: ["spec"] }));
    expect(silent.derived?.tier).toBeNull();
    expect(silent.tierAgrees).toBeNull();
  });

  it("does not read `rc1.2` or `#1244` as tiers, because they are not R1 and R2", () => {
    // APP-02's release map is `Shipped in rc1.2`; APP-07's rc2 reads `#1244 open`.
    expect(declaredTiersOf(rowOf("APP-02"))).toEqual([]);
    expect(declaredTiersOf(rowOf("APP-07"))).toEqual([]);
  });
});

describe("the register's whole comparison", () => {
  const rows = [rowOf("APP-02"), rowOf("APP-05"), rowOf("APP-06")];

  it("counts what has a reading, what agrees, what differs and what has no issue", () => {
    const read = readOf([
      // APP-02 is Delivered, and its issue closed as completed: agree.
      payloadOf(1268, "APP-02", { state: "closed", stateReason: "completed" }),
      // APP-05 is Tentative, and its issue closed as completed: differ.
      payloadOf(1269, "APP-05", { state: "closed", stateReason: "completed" }),
      // APP-06: nobody filed it.
    ]);

    const summary = specDeliveryOf(rows, read);

    expect(summary.withReading).toBe(2);
    expect(summary.agreeing).toBe(1);
    expect(summary.disagreeing).toEqual(["APP-05"]);
    expect(summary.withoutIssue).toBe(1);
    expect(summary.undetermined).toEqual([]);
    expect(summary.tierMismatches).toEqual([]);
    expect(Object.keys(summary.readings).sort()).toEqual(["APP-02", "APP-05", "APP-06"]);
  });

  it("names the tier mismatches separately, and a tier is not a delivery disagreement", () => {
    const read = readOf([
      payloadOf(1268, "APP-05", {
        state: "closed",
        stateReason: "completed",
        labels: ["spec", "tier/R2"],
      }),
    ]);
    const summary = specDeliveryOf([rowOf("APP-05")], read);
    expect(summary.disagreeing).toEqual(["APP-05"]);
    expect(summary.tierMismatches).toEqual(["APP-05"]);
  });

  it("an issue with no marker is a row with no issue — the marker is the only join", () => {
    const read = readOf([payloadOf(1268, null)]);
    expect(read.count).toBe(0);
    expect(read.skipped).toBe(1);

    const summary = specDeliveryOf(rows, read);
    expect(summary.withReading).toBe(0);
    expect(summary.withoutIssue).toBe(rows.length);
    expect(summary.disagreeing).toEqual([]);
  });

  it("puts the undetermined rows in their own list rather than in the disagreement list", () => {
    const read = readOf([payloadOf(1268, "APP-02", { state: "closed" })]);
    const summary = specDeliveryOf([rowOf("APP-02")], read);
    expect(summary.undetermined).toEqual(["APP-02"]);
    expect(summary.disagreeing).toEqual([]);
    expect(summary.agreeing).toBe(0);
  });

  it("reads an issue state through one function, so the page and the summary cannot disagree", () => {
    const closed = issueOf(1268, "APP-05", { state: "closed", stateReason: "completed" });
    const open = issueOf(1269, "APP-05");
    expect(deliveryStateOf(closed)).toBe("delivered");
    expect(deliveryStateOf(open)).toBe("open");
  });
});
