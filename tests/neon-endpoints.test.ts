/**
 * The endpoint table, and every refusal derived from it (#1336).
 *
 * The hole this file closes was not a missing rule — `productionRefusal()` existed and was tested —
 * it was a **stale fact**: the one marker it refused was the retired project's endpoint, so after
 * the project moved, a checkout whose `.env.local` still said `NEON_BRANCH=demo` opened the new
 * production branch and every demo writer accepted it. So the cases below are written against the
 * table, not against a list of ids copied into this file: deleting `ep-square-glade` from
 * `scripts/neon-endpoints.mjs` empties the loop and reds the first case, which is the "prove the
 * test bites" half of the card.
 *
 * No database, no Neon key, no environment: the table is data and the rule is a function.
 */
import { describe, expect, it } from "vitest";

import {
  DEMO_ENDPOINT,
  DEMO_PROJECT,
  KNOWN_ENDPOINTS,
  PRODUCTION_ENDPOINTS,
  endpointBranch,
  productionEndpointsIn,
} from "../scripts/neon-endpoints.mjs";
import { PRODUCTION_HOST_MARKERS, productionRefusal } from "../scripts/demo-verify-rules.mjs";

/** A connection string for an endpoint, with a fake credential — nothing here ever connects. */
const urlFor = (endpoint: string) =>
  `postgresql://neondb_owner:***@${endpoint}.c-8.us-east-2.aws.neon.tech/neondb`;

/** The same branch through the pooler: a second host, the same endpoint. */
const pooledFor = (endpoint: string) => urlFor(`${endpoint}-pooler`);

describe("the endpoint table", () => {
  it("names both production rows — the live project and the retired one", () => {
    const live = PRODUCTION_ENDPOINTS.filter((entry) => !entry.retired);
    const retired = PRODUCTION_ENDPOINTS.filter((entry) => entry.retired);

    expect(live.map((entry) => entry.endpoint)).toContain("ep-square-glade-bd2fcmjv");
    expect(retired.map((entry) => entry.endpoint)).toContain("ep-winter-block-b4bkk1xc");
    // Two rows, and the live one is the project that exists: a table that kept only the retired
    // project is exactly the state #1336 was filed against.
    expect(PRODUCTION_ENDPOINTS).toHaveLength(2);
    expect(PRODUCTION_ENDPOINTS.filter((entry) => !entry.retired)).toHaveLength(1);
  });

  it("puts the demo branch on the project that is live, not the retired one", () => {
    const demo = KNOWN_ENDPOINTS.find((entry) => entry.role === "demo");
    expect(demo?.endpoint).toBe(DEMO_ENDPOINT);
    expect(demo?.project).toBe(DEMO_PROJECT);
    expect(demo?.retired).toBe(false);
  });

  it("derives the refusal markers from the table instead of typing them again", () => {
    expect(PRODUCTION_HOST_MARKERS).toEqual(PRODUCTION_ENDPOINTS.map((entry) => entry.endpoint));
  });
});

describe("productionRefusal, against every row of the table", () => {
  it("refuses each production endpoint under each label an operator can carry", () => {
    for (const entry of PRODUCTION_ENDPOINTS) {
      for (const neonBranch of ["demo", undefined, "production"] as const) {
        const message = productionRefusal({
          databaseUrls: [pooledFor(entry.endpoint)],
          neonBranch,
        });
        expect(message, `${entry.endpoint} with NEON_BRANCH=${String(neonBranch)}`).not.toBeNull();
        expect(message).toContain("Nothing was changed.");
        // The label refusal names the branch; the host refusal names the endpoint. Either way the
        // reader gets the fact that stopped them.
        expect(message).toContain(
          neonBranch === "production" ? "NEON_BRANCH=production" : entry.endpoint,
        );
      }
    }
  });

  it("names the disagreement first when the shell says demo and the host is production", () => {
    const live = PRODUCTION_ENDPOINTS.find((entry) => !entry.retired) ?? PRODUCTION_ENDPOINTS[0];
    const message = productionRefusal({
      databaseUrls: [urlFor(live.endpoint)],
      neonBranch: "demo",
    });

    // The operator's fix is `.env.local`, not a `NEON_BRANCH` that is already correct — so the
    // sentence has to lead with the disagreement rather than with the endpoint.
    expect(message?.split("\n")[0]).toBe(
      `the shell says NEON_BRANCH=demo, but ${live.endpoint}.c-8.us-east-2.aws.neon.tech is production's endpoint (${live.endpoint}, ${live.project} · ${live.branch}).`,
    );
  });

  it("says nothing about a label when there is none, and still names the host", () => {
    const live = PRODUCTION_ENDPOINTS.find((entry) => !entry.retired) ?? PRODUCTION_ENDPOINTS[0];
    const message = productionRefusal({ databaseUrls: [urlFor(live.endpoint)] });
    expect(message?.split("\n")[0]?.startsWith(`${live.endpoint}.c-8`)).toBe(true);
    expect(message).not.toContain("the shell says");
  });

  it("allows the demo branch — direct and pooled — and a branch the table does not know", () => {
    expect(
      productionRefusal({ databaseUrls: [urlFor(DEMO_ENDPOINT)], neonBranch: "demo" }),
    ).toBeNull();
    expect(
      productionRefusal({ databaseUrls: [pooledFor(DEMO_ENDPOINT)], neonBranch: "demo" }),
    ).toBeNull();
    // A scratch branch cut from `demo` has its own endpoint. Refusing it would break `db:verify`'s
    // probe workflow, so the rule is a denylist and this is the case that says so.
    expect(
      productionRefusal({
        databaseUrls: [urlFor("ep-hidden-moon-a1b2c3d4")],
        neonBranch: "demo",
      }),
    ).toBeNull();
  });
});

describe("productionEndpointsIn", () => {
  it("matches a pooler host and a direct host to the same row, with the host it was found on", () => {
    const live = PRODUCTION_ENDPOINTS[0];
    const matches = productionEndpointsIn([pooledFor(live.endpoint), urlFor(live.endpoint)]);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.endpoint).toBe(live.endpoint);
    expect(matches[0]?.host).toBe(`${live.endpoint}-pooler.c-8.us-east-2.aws.neon.tech`);
  });

  it("returns nothing for a demo host, an empty value or a URL that does not parse", () => {
    expect(productionEndpointsIn([urlFor(DEMO_ENDPOINT)])).toEqual([]);
    expect(productionEndpointsIn(["", "not a url", undefined])).toEqual([]);
    expect(productionEndpointsIn()).toEqual([]);
  });
});

describe("endpointBranch", () => {
  it("names the role of every row, from a host or a whole connection string", () => {
    expect(endpointBranch("ep-fancy-bar-bd0pzuz0-pooler.c-8.us-east-2.aws.neon.tech")).toBe("demo");
    expect(endpointBranch("ep-square-glade-bd2fcmjv.c-8.us-east-2.aws.neon.tech")).toBe(
      "production-live",
    );
    expect(endpointBranch("ep-winter-block-b4bkk1xc.c-6.us-east-2.aws.neon.tech")).toBe(
      "production-retired",
    );
    expect(endpointBranch(urlFor("ep-crimson-truth-b4ppwxrp"))).toBe("retired-demo");
  });

  it("answers null for a branch nobody has told it about", () => {
    expect(endpointBranch("ep-hidden-moon-a1b2c3d4.c-8.us-east-2.aws.neon.tech")).toBeNull();
    expect(endpointBranch("")).toBeNull();
    expect(endpointBranch(undefined)).toBeNull();
    expect(endpointBranch("not a url")).toBeNull();
  });
});
