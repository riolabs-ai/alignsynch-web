/**
 * #1343 — `env:sync --prune` retires a row the table marks `forbidden`, and nothing else.
 *
 * The fact this holds still is narrow and expensive to get wrong: `vercel:preview@demo` held
 * `RESEND_WEBHOOK_SECRET` — the account webhook's signing secret — and no verb in the repo could
 * take it out. The fix is a delete path, which means the cases that matter are the ones about what
 * it may *not* delete:
 *
 *   - only a name the table marks `forbidden` for that environment, and only one the target holds;
 *   - an `extra` row on the same target is a decision nobody has made, so it survives;
 *   - a `NEVER_AT_ALL` name is a finding, reported by name, not a row to delete;
 *   - and the flag refuses without `--write`, refuses `--target production` without
 *     `--confirm-production`, and refuses outside manifest mode.
 *
 * No network and no mock of the Vercel API: `pruneTarget` takes the `request` function, so a case
 * counts the verbs it was handed. The delete case was watched red by replacing the `DELETE` call in
 * `pruneTarget` with a no-op — one DELETE expected, zero issued — and green again when restored.
 *
 * #1349 is the other half of the same rule: `--prune --write` used to run the whole value pass
 * before it deleted, so one DELETE arrived with five POSTs beside it and the demo scope grew rows
 * nobody asked for. `shouldWritePass` is the guard, `runManifestPasses` is the branch the script
 * itself runs, and the case below asserts the injected `request` saw DELETEs only. It was watched
 * red the same way: with `shouldWritePass` forced to `true`, the case reports the POSTs.
 */
import { describe, expect, it } from "vitest";

import {
  NEVER_AT_ALL,
  planPrune,
  pruneRefusal,
  pruneTarget,
  runManifestPasses,
  shouldWritePass,
} from "../scripts/env-sync-plan.mjs";

const PROJECT = "prj_fixture";
const TEAM = "team_fixture";

/** The fixture target: 30 rows on the scope, of which one is the forbidden secret and one is extra. */
const present = new Map([
  [
    "RESEND_WEBHOOK_SECRET",
    { id: "env_forbidden_1", key: "RESEND_WEBHOOK_SECRET", type: "sensitive" },
  ],
  ["GOOGLE_CLIENT_SECRET", { id: "env_extra_1", key: "GOOGLE_CLIENT_SECRET", type: "sensitive" }],
  ["NEON_AUTH_BASE_URL", { id: "env_kept_1", key: "NEON_AUTH_BASE_URL", type: "encrypted" }],
  ["VERCEL_OIDC_TOKEN", { id: "env_never_1", key: "VERCEL_OIDC_TOKEN", type: "sensitive" }],
]);

/** The fixture table: one row forbidden for `preview`, one optional, one required. */
const forbidden = [
  {
    name: "RESEND_WEBHOOK_SECRET",
    environments: { local: "optional", preview: "forbidden", production: "optional" },
    why: "the demo deployment must not hold the account endpoint's secret",
  },
];
const optional = [
  {
    name: "GOOGLE_CLIENT_SECRET",
    environments: { local: "optional", preview: "optional", production: "optional" },
    why: "fixture row",
  },
];
const requiredRow = [
  {
    name: "NEON_AUTH_BASE_URL",
    environments: { local: "required", preview: "required", production: "required" },
    why: "fixture row",
  },
];

/** A request double: records each call, answers like a successful DELETE. */
function recorder() {
  const calls: Array<{ method: string; url: string; body: unknown; tok: string }> = [];
  return {
    calls,
    request: async (method: string, url: string, body: unknown, tok: string) => {
      calls.push({ method, url, body, tok });
      return {};
    },
  };
}

function collector() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("planPrune — the only names a delete may reach", () => {
  it("plans the forbidden row the target holds, by id, and prints nothing itself", () => {
    const plan = planPrune({ forbidden, present });
    expect(plan.pruned).toEqual([{ name: "RESEND_WEBHOOK_SECRET", id: "env_forbidden_1" }]);
    expect(plan.refused).toEqual([
      { name: "VERCEL_OIDC_TOKEN", why: NEVER_AT_ALL.get("VERCEL_OIDC_TOKEN") },
    ]);
  });

  it("never plans an extra key, an optional key or a required key — only `forbidden` is deletable", () => {
    const plan = planPrune({ forbidden, present });
    const names = plan.pruned.map((row) => row.name);
    expect(names).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(names).not.toContain("NEON_AUTH_BASE_URL");
    // The optional and required rows are in the same fixture table as the forbidden one: adding
    // them to `forbidden` is what would make them deletable, and that is a table change.
    const allRows = [...forbidden, ...optional, ...requiredRow];
    for (const row of allRows) {
      const deletable = plan.pruned.some((planned) => planned.name === row.name);
      const expected =
        row.environments.preview === "forbidden" && row.name !== "GOOGLE_CLIENT_SECRET";
      expect(deletable).toBe(expected);
    }
  });

  it("plans nothing for a forbidden row the target does not hold", () => {
    const empty = new Map([["NEON_AUTH_BASE_URL", { id: "env_kept_1" }]]);
    const plan = planPrune({ forbidden, present: empty });
    expect(plan.pruned).toEqual([]);
  });

  it("treats a `sensitive` row with no readable value as deletable by name", () => {
    const masked = new Map([["RESEND_WEBHOOK_SECRET", { id: "env_masked", type: "sensitive" }]]);
    const plan = planPrune({ forbidden, present: masked });
    expect(plan.pruned).toEqual([{ name: "RESEND_WEBHOOK_SECRET", id: "env_masked" }]);
  });
});

describe("pruneTarget — one DELETE per planned name, and a line per name", () => {
  it("issues exactly one DELETE for the forbidden name and prints `pruned NAME`", async () => {
    const { calls, request } = recorder();
    const { lines, log } = collector();
    const plan = planPrune({ forbidden, present });

    const result = await pruneTarget({
      project: PROJECT,
      team: TEAM,
      token: "fixture-token",
      plan,
      request,
      log,
    });

    expect(result).toEqual({ deleted: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`/v9/projects/${PROJECT}/env/env_forbidden_1?teamId=${TEAM}`);
    expect(calls[0].body).toBeNull();
    expect(
      lines.some((line) => line.includes("pruned") && line.includes("RESEND_WEBHOOK_SECRET")),
    ).toBe(true);
  });

  it("issues no DELETE for the extra key on the same target, and says why it is left alone", async () => {
    const { calls, request } = recorder();
    const { lines, log } = collector();
    const plan = planPrune({ forbidden, present });

    await pruneTarget({ project: PROJECT, team: TEAM, token: "t", plan, request, log });

    const touched = calls.map((call) => call.url);
    expect(touched.some((url) => url.includes("env_extra_1"))).toBe(false);
    expect(calls).toHaveLength(1);
    expect(
      lines.some((line) => line.includes("pruned") && line.includes("GOOGLE_CLIENT_SECRET")),
    ).toBe(false);
    // A NEVER_AT_ALL name present on the target is reported and refused, not deleted.
    expect(
      lines.some((line) => line.includes("VERCEL_OIDC_TOKEN") && line.includes("not pruned")),
    ).toBe(true);
  });

  it("keeps going after one failure and reports the count", async () => {
    const twoForbidden = [
      ...forbidden,
      { name: "ADMIN_EMAILS", environments: { preview: "forbidden" }, why: "fixture row" },
    ];
    const withBoth = new Map([
      ["RESEND_WEBHOOK_SECRET", { id: "env_a" }],
      ["ADMIN_EMAILS", { id: "env_b" }],
    ]);
    const { lines, log } = collector();
    const urls: string[] = [];
    const request = async (_method: string, url: string) => {
      urls.push(url);
      if (url.includes("env_b")) throw new Error("410 gone");
      return {};
    };

    const result = await pruneTarget({
      project: PROJECT,
      team: TEAM,
      token: "t",
      plan: planPrune({ forbidden: twoForbidden, present: withBoth }),
      request,
      log,
    });

    expect(urls).toHaveLength(2);
    expect(result).toEqual({ deleted: 1, failed: 1 });
    expect(lines.some((line) => line.includes("FAILED") && line.includes("ADMIN_EMAILS"))).toBe(
      true,
    );
  });
});

describe("pruneRefusal — a delete never happens by accident", () => {
  it("allows a preview prune that says --write", () => {
    expect(
      pruneRefusal({ prune: true, write: true, target: "preview", confirmProduction: false }),
    ).toBeNull();
  });

  it("refuses --prune without --write", () => {
    const reason = pruneRefusal({ prune: true, write: false, target: "preview" });
    expect(reason).toContain("--write");
    expect(reason).toContain("Nothing was deleted");
  });

  it("refuses --prune --target production without --confirm-production", () => {
    const reason = pruneRefusal({
      prune: true,
      write: true,
      target: "production",
      confirmProduction: false,
    });
    expect(reason).toContain("--confirm-production");
    expect(
      pruneRefusal({ prune: true, write: true, target: "production", confirmProduction: true }),
    ).toBeNull();
  });

  it("refuses --prune in file mode, where no table marks a row forbidden", () => {
    const reason = pruneRefusal({ prune: true, write: true, target: "preview", from: ".env.demo" });
    expect(reason).toContain("manifest mode");
  });

  it("is silent when --prune is not given, whatever else is missing", () => {
    expect(pruneRefusal({ prune: false, write: false, target: "production" })).toBeNull();
  });

  it("keeps all three refusals, and none of them leaves the value pass open", () => {
    const cases = [
      { flags: { prune: true, write: false, target: "preview" }, says: "--write" },
      {
        flags: { prune: true, write: true, target: "production", confirmProduction: false },
        says: "--confirm-production",
      },
      {
        flags: { prune: true, write: true, target: "preview", from: ".env.demo" },
        says: "manifest mode",
      },
    ];
    for (const { flags, says } of cases) {
      const reason = pruneRefusal(flags);
      expect(reason).toContain(says);
      expect(reason).toContain("Nothing was deleted");
      // A refused run reaches no pass at all. Checked here as well as by the script's own
      // ordering, so a caller that skipped the refusal still cannot write on a prune's behalf.
      expect(shouldWritePass(flags)).toBe(false);
    }
  });
});

/**
 * The rows a `--prune --write` run used to write on its way to one DELETE (#1349, measured on
 * `main` @ `f08552b0a`): the value pass ran before the prune block, so a one-row cleanup put five
 * optional rows on `preview@demo`. Three of the five are enough to prove the point — one create,
 * another create, and a replace so both write verbs are covered.
 */
const WRITE_TODO = [
  { verb: "create", key: "NEXT_PUBLIC_BASE_URL", value: "https://demo.example.test" },
  { verb: "create", key: "NAV_SOURCE", value: "manifest" },
  { verb: "replace", key: "APP_VERSION", value: "2.0.0-rc2", id: "env_kept_1" },
];

const targetArgs = {
  project: PROJECT,
  team: TEAM,
  target: "preview",
  branch: "demo",
  token: "fixture-token",
};

describe("shouldWritePass — `--prune` is a retire verb and nothing else", () => {
  it("is true only for a write that does not also name --prune", () => {
    expect(shouldWritePass({ prune: false, write: true })).toBe(true);
    expect(shouldWritePass({ write: true })).toBe(true);
    expect(shouldWritePass({ prune: true, write: true })).toBe(false);
    expect(shouldWritePass({ prune: true, write: false })).toBe(false);
    expect(shouldWritePass({ prune: false, write: false })).toBe(false);
  });
});

describe("runManifestPasses — `--prune --write` issues DELETEs and no write request", () => {
  it("runs the delete and zero PUT/POST, and prints that the declared rows were not written", async () => {
    const { calls, request } = recorder();
    const { lines, log } = collector();

    const result = await runManifestPasses({
      ...targetArgs,
      prune: true,
      write: true,
      todo: WRITE_TODO,
      forbidden,
      present,
      request,
      log,
    });

    // The whole of #1349: the injected request saw a DELETE and nothing else.
    expect(calls.map((call) => call.method)).toEqual(["DELETE"]);
    expect(calls.filter((call) => call.method !== "DELETE")).toEqual([]);
    expect(calls[0].url).toBe(`/v9/projects/${PROJECT}/env/env_forbidden_1?teamId=${TEAM}`);
    for (const row of WRITE_TODO) {
      expect(lines.some((line) => line.includes("wrote") && line.includes(row.key))).toBe(false);
    }
    expect(
      lines.some((line) => line.includes("pruned") && line.includes("RESEND_WEBHOOK_SECRET")),
    ).toBe(true);
    expect(result).toEqual({
      writePass: false,
      written: 0,
      failed: 0,
      pruned: 1,
      pruneFailed: 0,
    });
  });

  it("still runs the value pass when --prune is absent — create, create, replace, no DELETE", async () => {
    const { calls, request } = recorder();
    const { lines, log } = collector();

    const result = await runManifestPasses({
      ...targetArgs,
      prune: false,
      write: true,
      todo: WRITE_TODO,
      forbidden,
      present,
      request,
      log,
    });

    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "PATCH"]);
    expect(calls[0].url).toBe(`/v10/projects/${PROJECT}/env?teamId=${TEAM}`);
    expect(calls[0].body).toMatchObject({
      key: "NEXT_PUBLIC_BASE_URL",
      type: "encrypted",
      target: ["preview"],
      gitBranch: "demo",
    });
    expect(calls[2].url).toBe(`/v9/projects/${PROJECT}/env/env_kept_1?teamId=${TEAM}`);
    expect(lines.some((line) => line.includes("wrote") && line.includes("APP_VERSION"))).toBe(true);
    expect(result).toEqual({ writePass: true, written: 3, failed: 0, pruned: 0, pruneFailed: 0 });
  });
});
