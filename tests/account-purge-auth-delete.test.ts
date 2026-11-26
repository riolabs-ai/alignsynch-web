/**
 * #1384 — with the config this repo ships, the deletion reaches the auth-user `DELETE`.
 *
 * The defect: `lib/account/purge.ts` hard-required `NEON_PROJECT_ID`, no row wrote it, the three
 * env files did not carry it, and the Vercel production scope did not hold it — so a person who
 * typed the confirmation phrase and pressed Delete got *"NEON_PROJECT_ID is not set and GET
 * /projects answered …"* after their session had already been spent on the request.
 *
 * So the cases below are not about the sweep (that is `tests/account-purge.test.ts`); they are the
 * three claims the fix makes, each one a thing a reader cannot check by reading the file:
 *
 *   1. **the table ships the value** — `NEON_PROJECT_ID` is `required` in all three environments and
 *      its source is a literal, so `env:render` writes it and `env:sync` pushes it. A row that is
 *      `optional`/`carried` is a row nothing writes, which is how the variable went missing;
 *   2. **the shipped config makes the call** — with the value the table declares and the branch the
 *      deployment's own auth host names, `deleteAuthUser` issues the `DELETE` for that project and
 *      that branch, and `runAccountDeletion`'s default path (the real `deleteAuthUser`) reaches it
 *      rather than answering `auth-failed`;
 *   3. **a label that names no branch cannot kill it** — production's `.env` carries
 *      `NEON_BRANCH=production`, and the project has no such branch (`main`, `demo`, `demo-base`;
 *      measured 2026-11-26), so the branch is resolved from the endpoint in `NEON_AUTH_BASE_URL`.
 *
 * No network and no database: `fetch` is stubbed with the two API answers the control plane gives,
 * and the `pg` client is the recorder below. The live half stays in
 * `tests/account-deletion-live.test.ts`, which needs a real branch.
 */
import type { QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthUserDeleteError, deleteAuthUser, runAccountDeletion } from "@/lib/account/purge";

import { ENVIRONMENTS, ENV_ROWS, sourceFor, type EnvironmentId } from "../scripts/env-manifest";
import { LIVE_PROJECT } from "../scripts/neon-endpoints.mjs";

/** The branch ids the project actually has, as the control plane answers them. */
const MAIN_BRANCH = "br-fancy-sea-bd6mbufz";
const DEMO_BRANCH = "br-frosty-river-bdv71bpj";

/** Production's and the demo's endpoints, from `scripts/neon-endpoints.mjs`. */
const MAIN_HOST = "ep-square-glade-bd2fcmjv.c-8.us-east-2.aws.neon.tech";
const DEMO_HOST = "ep-fancy-bar-bd0pzuz0.c-8.us-east-2.aws.neon.tech";

/** What `NEON_PROJECT_ID` resolves to for one environment, or `undefined` when nothing writes it. */
function shippedProjectId(environment: EnvironmentId): string | undefined {
  const row = ENV_ROWS.find((entry) => entry.name === "NEON_PROJECT_ID");
  if (row === undefined) return undefined;
  const source = sourceFor(row, environment);
  return source !== undefined && "literal" in source ? source.literal : undefined;
}

/** One recorded API request. */
interface Call {
  readonly method: string;
  readonly path: string;
}

/**
 * The control plane, as the two endpoints this path reads answer it: the branch list, the endpoint
 * → branch map, and a `204` for the delete. Anything else is a failure the case should see.
 */
function stubNeonApi(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : String(input));
      const method = init?.method ?? "GET";
      calls.push({ method, path: url.pathname.replace("/api/v2", "") });

      if (method === "GET" && url.pathname.endsWith("/branches")) {
        return Response.json({
          branches: [
            { id: MAIN_BRANCH, name: "main", default: true },
            { id: DEMO_BRANCH, name: "demo", default: false },
          ],
        });
      }
      if (method === "GET" && url.pathname.endsWith("/endpoints")) {
        return Response.json({
          endpoints: [
            { host: MAIN_HOST, branch_id: MAIN_BRANCH, type: "read_write" },
            { host: DEMO_HOST, branch_id: DEMO_BRANCH, type: "read_write" },
          ],
        });
      }
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ message: `unexpected ${method} ${url.pathname}` }), {
        status: 500,
      });
    },
  );
  return calls;
}

/** A `pg`-shaped client: the reads the deletion does before anything is destroyed. */
class RecordingClient {
  readonly statements: string[] = [];

  async query(text: string) {
    this.statements.push(text);
    if (text.includes("information_schema.tables")) {
      return { rows: [{ table_name: "user" } as QueryResultRow], rowCount: 1 };
    }
    if (text.includes('FROM neon_auth."user"')) {
      return {
        rows: [{ id: "acct-1", email: "avery@example.test" } as QueryResultRow],
        rowCount: 1,
      };
    }
    return { rows: [] as QueryResultRow[], rowCount: 0 };
  }

  release(): void {
    // Nothing to release: the fake holds no socket.
  }
}

const TOUCHED = ["NEON_PROJECT_ID", "NEON_API_KEY", "NEON_BRANCH", "NEON_AUTH_BASE_URL"] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]));
  process.env.NEON_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("the env table ships the project id", () => {
  it("declares NEON_PROJECT_ID as required in every environment, from a literal", () => {
    const row = ENV_ROWS.find((entry) => entry.name === "NEON_PROJECT_ID");
    expect(row, "no NEON_PROJECT_ID row — the variable the purge refuses without").toBeDefined();
    for (const environment of ENVIRONMENTS) {
      expect(row?.environments[environment], `${environment} requirement`).toBe("required");
      // The source is what `env:render` writes. `carried` is the shape that failed: it writes
      // nothing when the deployment does not already hold the value.
      expect(shippedProjectId(environment), `${environment} source`).toBe(LIVE_PROJECT);
    }
  });

  it("names the project the endpoints table says both branches belong to", () => {
    // One project, every branch: production's `main` and the `demo`, which is why the value can be
    // the same in all three environments.
    expect(shippedProjectId("production")).toBe(LIVE_PROJECT);
    expect(shippedProjectId("preview")).toBe(LIVE_PROJECT);
    expect(shippedProjectId("local")).toBe(LIVE_PROJECT);
  });
});

describe("deleteAuthUser with the shipped config", () => {
  it("issues the DELETE for the shipped project and the demo branch", async () => {
    process.env.NEON_PROJECT_ID = shippedProjectId("local") ?? "";
    process.env.NEON_BRANCH = "demo";
    process.env.NEON_AUTH_BASE_URL = `https://${DEMO_HOST}/neondb/auth`;
    const calls = stubNeonApi();

    await deleteAuthUser("acct-1");

    expect(calls[0]).toEqual({
      method: "GET",
      path: `/projects/${LIVE_PROJECT}/branches`,
    });
    expect(calls.at(-1)).toEqual({
      method: "DELETE",
      path: `/projects/${LIVE_PROJECT}/branches/${DEMO_BRANCH}/auth/users/acct-1`,
    });
  });

  it("resolves the branch from the auth host when the typed label names none", async () => {
    // Production's `.env` carries NEON_BRANCH=production and the project has no such branch. The
    // host is the fact — the same rule the demo writers enforce — so the delete still lands.
    process.env.NEON_PROJECT_ID = shippedProjectId("production") ?? "";
    process.env.NEON_BRANCH = "production";
    process.env.NEON_AUTH_BASE_URL = `https://${MAIN_HOST}/neondb/auth`;
    const calls = stubNeonApi();

    await deleteAuthUser("acct-1");

    expect(calls.at(-1)).toEqual({
      method: "DELETE",
      path: `/projects/${LIVE_PROJECT}/branches/${MAIN_BRANCH}/auth/users/acct-1`,
    });
  });

  it("refuses to pick a branch when the label and the host disagree", async () => {
    process.env.NEON_PROJECT_ID = shippedProjectId("local") ?? "";
    process.env.NEON_BRANCH = "demo";
    process.env.NEON_AUTH_BASE_URL = `https://${MAIN_HOST}/neondb/auth`;
    const calls = stubNeonApi();

    const failure = await deleteAuthUser("acct-1").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthUserDeleteError);
    expect((failure as Error).message).toContain('NEON_BRANCH names "demo"');
    expect((failure as Error).message).toContain('names "main"');
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("names the missing variable instead of asking the API, when nothing ships it", async () => {
    delete process.env.NEON_PROJECT_ID;
    process.env.NEON_BRANCH = "demo";
    process.env.NEON_AUTH_BASE_URL = `https://${DEMO_HOST}/neondb/auth`;
    const calls = stubNeonApi();

    await expect(deleteAuthUser("acct-1")).rejects.toThrow(/NEON_PROJECT_ID is not set/);
    // The list fallback this function used to try answered 404 (project-scoped key) or 400
    // (`org_id is required`); neither can name a project, so nothing is asked.
    expect(calls).toEqual([]);
  });
});

describe("runAccountDeletion reaches the delete call", () => {
  it("deletes the auth user and commits the scrub", async () => {
    process.env.NEON_PROJECT_ID = shippedProjectId("production") ?? "";
    process.env.NEON_BRANCH = "production";
    process.env.NEON_AUTH_BASE_URL = `https://${MAIN_HOST}/neondb/auth`;
    const calls = stubNeonApi();
    const client = new RecordingClient();

    const outcome = await runAccountDeletion("acct-1", { connect: async () => client });

    expect(outcome.kind).toBe("deleted");
    // The acceptance: the default path (the real `deleteAuthUser`) reached the API's delete, so the
    // failure is not `auth-failed` on a guard sentence.
    expect(calls.at(-1)).toEqual({
      method: "DELETE",
      path: `/projects/${LIVE_PROJECT}/branches/${MAIN_BRANCH}/auth/users/acct-1`,
    });
    expect(client.statements.filter((text) => text === "COMMIT")).toHaveLength(1);
  });
});
