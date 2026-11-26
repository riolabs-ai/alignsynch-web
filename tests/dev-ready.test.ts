/**
 * `pnpm dev:ready`'s decision (#1401).
 *
 * The four branches the command must not confuse — the first four `describe` blocks below:
 *
 * - **an empty `demo_account`** → seed (the accounts are gone and the local login cannot work),
 * - **a seeded branch** → seed nothing and print nothing that reads like a warning,
 * - **no `DATABASE_URL`** → one line, then start (no census at all),
 * - **half a pair** → start anyway and print the same sentence the seed prints, because a seat is
 *   a pair and no local run can invent the missing half. The same block covers no `ADMIN_NN_*`
 *   pair at all (CI, a fresh clone, a reviewer without the secret; `ADMIN_EMAILS` alone still
 *   grants admin at sign-in to an account that exists).
 */
import { describe, expect, it } from "vitest";

import {
  bootstrapPlan,
  censusLine,
  completeSeats,
  DEMO_ACCOUNT_TARGET,
  forwardedArgs,
  missingSeats,
  NO_DATABASE_LINE,
  readyDecision,
  type AdminSeat,
  type ReadyCensus,
} from "@/lib/dev/ready";

const SEAT_01: AdminSeat = { suffix: "01", email: "owner@alignsynch.com", hasPassword: true };
const SEAT_02: AdminSeat = { suffix: "02", email: "ops@riolabs.ai", hasPassword: true };

function census(overrides: Partial<ReadyCensus> = {}): ReadyCensus {
  return {
    contentRows: 45,
    demoAccounts: DEMO_ACCOUNT_TARGET,
    seats: [SEAT_01, SEAT_02],
    presentEmails: [SEAT_01.email, SEAT_02.email],
    ...overrides,
  };
}

describe("a branch that is already seeded", () => {
  it("seeds nothing, and prints nothing", () => {
    const decision = readyDecision(census());
    expect(decision.needed).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.notes).toEqual([]);
  });

  it("starts as-is when no seat is configured, and says why nothing is missing", () => {
    const decision = readyDecision(census({ seats: [], presentEmails: [] }));
    expect(decision.needed).toBe(false);
    expect(decision.notes).toHaveLength(1);
    expect(decision.notes[0]).toContain("ADMIN_NN_EMAIL");
  });
});

describe("an empty demo_account", () => {
  it("seeds, and says how many PIN accounts are missing", () => {
    const decision = readyDecision(census({ demoAccounts: 0 }));
    expect(decision.needed).toBe(true);
    expect(decision.reasons.some((reason) => reason.startsWith("0 of 3"))).toBe(true);
  });

  it("seeds on a half-populated set too, because /demo draws one button per account", () => {
    const decision = readyDecision(census({ demoAccounts: DEMO_ACCOUNT_TARGET - 1 }));
    expect(decision.needed).toBe(true);
    expect(decision.reasons.join(" ")).toContain("2 of 3 PIN demo accounts");
  });
});

describe("a branch with no DATABASE_URL", () => {
  it("plans one line and a start, with no census", () => {
    const plan = bootstrapPlan({ hasDatabaseUrl: false });
    expect(plan.kind).toBe("start");
    expect(plan.kind === "start" ? plan.lines : []).toEqual([NO_DATABASE_LINE]);
  });

  it("names the variable and says it starts anyway — it is never an error", () => {
    expect(NO_DATABASE_LINE).toContain("DATABASE_URL");
    expect(NO_DATABASE_LINE).toContain("starting the server as-is");
    expect(NO_DATABASE_LINE.split("\n")).toHaveLength(1);
  });

  it("censuses when a database is configured", () => {
    expect(bootstrapPlan({ hasDatabaseUrl: true })).toEqual({ kind: "census" });
  });
});

describe("a seat with only half a pair", () => {
  it("is a note, never a reason: the seed would skip it and no local run can finish it", () => {
    const decision = readyDecision(
      census({
        seats: [{ suffix: "02", email: "", hasPassword: true }],
        presentEmails: [SEAT_01.email],
      }),
    );
    expect(decision.needed).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.notes.join(" ")).toContain("ADMIN_02_EMAIL is unset");
  });

  it("names the missing half for an address with no password, as the seed does", () => {
    const decision = readyDecision(
      census({ seats: [{ suffix: "03", email: "third@riolabs.ai", hasPassword: false }] }),
    );
    expect(decision.needed).toBe(false);
    expect(decision.notes.join(" ")).toContain("ADMIN_03_PASS is unset");
  });
});

describe("a bare branch", () => {
  it("seeds when there is no content, even though the accounts look fine", () => {
    const decision = readyDecision(census({ contentRows: 0 }));
    expect(decision.needed).toBe(true);
    expect(decision.reasons[0]).toContain("no content rows");
  });

  it("seeds when a complete seat is missing from neon_auth", () => {
    const decision = readyDecision(census({ presentEmails: [] }));
    expect(decision.needed).toBe(true);
    expect(decision.reasons.join(" ")).toContain("2 of 2 admin seat(s) missing");
  });

  it("counts a partially seeded set as missing, not as done", () => {
    const decision = readyDecision(census({ presentEmails: [SEAT_01.email] }));
    expect(decision.needed).toBe(true);
    expect(decision.reasons.join(" ")).toContain("1 of 2");
  });
});

describe("the seat comparison", () => {
  it("is case-insensitive, because an address typed with a capital is the same address", () => {
    expect(
      missingSeats(census({ presentEmails: ["Owner@AlignSynch.com", "OPS@riolabs.ai"] })),
    ).toEqual([]);
  });

  it("never promises a seat with no password — the seed would skip it", () => {
    const half: AdminSeat = { suffix: "02", email: "ops@riolabs.ai", hasPassword: false };
    expect(completeSeats([SEAT_01, half])).toEqual([SEAT_01]);
    expect(missingSeats(census({ seats: [SEAT_01, half], presentEmails: [] }))).toEqual([SEAT_01]);
  });

  it("ignores a pass half with no address, which is not a seat either", () => {
    const noEmail: AdminSeat = { suffix: "02", email: "", hasPassword: true };
    expect(completeSeats([SEAT_01, noEmail])).toEqual([SEAT_01]);
  });
});

describe("forwarding arguments to the dev server", () => {
  it("drops the separator `pnpm run` leaves in argv, so `--port` is a flag and not a directory", () => {
    expect(forwardedArgs(["--", "--port", "3001"])).toEqual(["--port", "3001"]);
  });

  it("forwards a bare flag list unchanged", () => {
    expect(forwardedArgs(["--port", "3001"])).toEqual(["--port", "3001"]);
    expect(forwardedArgs([])).toEqual([]);
  });
});

describe("the census line", () => {
  it("prints the numbers the decision was made from, not only its verdict", () => {
    const line = censusLine(census({ contentRows: 33, demoAccounts: 3 }));
    expect(line).toContain("33 content row(s)");
    expect(line).toContain("3 demo account(s)");
    expect(line).toContain("2 admin seat(s) configured");
  });
});
