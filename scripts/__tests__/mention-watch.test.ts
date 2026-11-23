/**
 * `watch-mentions` — the @mention poller, held still.
 *
 * The subject of this suite is `scripts/watch-mentions.mjs`, which is why the file lives under
 * `scripts/__tests__/` and runs on the other runner: every other suite here is a node:test suite
 * compiled by `tsconfig.datacheck.json` and run inside `pnpm data:check`, and a `vitest` import in
 * that lane has no runner to attach to. `vitest.config.mts` names this file, and the datacheck
 * tsconfig excludes it, so it gates in `pnpm test` like any other vitest suite.
 *
 * What it pins, in the order the card asks for it:
 *
 *   1. the mention regex — a near-miss (`@alignsynch-web`, an address, `@@`) is not an instruction,
 *      because alerting on one teaches the lead to stop reading the alerts;
 *   2. the skip rules — a bot-authored or self-authored mention is never an instruction;
 *   3. the cursor — it advances per source, never backwards, and the seen-id set is what makes a
 *      second run of the same window silent;
 *   4. `since` — every one of the four sources is queried with it, asserted against the argv the
 *      script hands `gh`, not against the code that builds it.
 *
 * Idempotency is checked twice on purpose: once against `runWatch` with an injected reader, and
 * once end to end through the CLI driving a stub `gh` on `--gh`, because the property the
 * cron depends on is *stdout is empty*, which only the real entry point can prove.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACK_MARKER,
  MENTION_RE,
  SOURCES,
  buildAlert,
  mentionSentences,
  nextCursor,
  readCursor,
  runWatch,
  skipReason,
  sourceQuery,
  tierOf,
  trimExcerpt,
} from "../../scripts/watch-mentions.mjs";

const REPO = "riolabs-ai/alignsynch";
const SINCE = "2026-11-23T08:00:00Z";

/** The real thread the card names, trimmed to the fields the alert reads. */
const THREAD = {
  number: 847,
  title: "feat(billing): the adapter accepts a live key — explicit mode, paired guards",
  state: "open",
  html_url: "https://github.com/riolabs-ai/alignsynch/issues/847",
  labels: [
    { name: "enhancement" },
    { name: "area/billing" },
    { name: "area/admin" },
    { name: "needs-decision" },
    { name: "tier/R1" },
  ],
  milestone: { title: "v2.0.0-rc2 — the pool" },
};

const COMMENT = {
  id: 7096092208,
  html_url: "https://github.com/riolabs-ai/alignsynch/issues/847#issuecomment-7096092208",
  user: { login: "riolabs-ai", type: "User" },
  author_association: "OWNER",
  created_at: "2026-11-23T08:59:51Z",
  updated_at: "2026-11-23T08:59:51Z",
  issue_url: "https://api.github.com/repos/riolabs-ai/alignsynch/issues/847",
  body:
    "@alignsynch this would be resolved when AlignSynch live and text secrets are available in bws? " +
    "what scope and type of API key in bws will allow a versioned provisioner, and an Admin " +
    "dashboard stripe/billing settings surface conforming to Stripe best practice?",
};

const EARLIER = [1, 2, 3, 4].map((n) => ({
  id: 6881918500 + n,
  user: { login: "jadenblack", type: "User" },
  created_at: `2026-11-1${n}T10:00:0${n}Z`,
  updated_at: `2026-11-1${n}T10:00:0${n}Z`,
  body: `preceding comment ${n} — the steer that led to the mention`,
}));

const THREAD_COMMENTS = [...EARLIER, COMMENT];

/** A reader that answers by api path and records the argv it was asked for. */
function recorder(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const read = async (apiPath: string) => {
    calls.push(apiPath);
    const key = keys.find((candidate) => apiPath.startsWith(candidate));
    return key ? routes[key] : [];
  };
  return { calls, read };
}

function oneCommentRoutes() {
  return recorder({
    [`repos/${REPO}/issues/847/comments`]: THREAD_COMMENTS,
    [`repos/${REPO}/issues/847`]: THREAD,
    [`repos/${REPO}/issues/comments`]: [COMMENT],
    [`repos/${REPO}/pulls/comments`]: [],
    [`repos/${REPO}/issues`]: [],
    [`repos/${REPO}/pulls`]: [],
  });
}

describe("the mention regex", () => {
  const cases: Array<[string, boolean, string]> = [
    ["@alignsynch this would be resolved when AlignSynch live?", true, "a plain mention"],
    ["Thinking — @AlignSynch over to you.", true, "case is not the discriminator"],
    ["ping @alignsynch", true, "end of line is a boundary"],
    ["ask @alignsynch.", true, "followed by a full stop"],
    ["@alignsynch-web please look", false, "a different account"],
    ["@alignsynch_ops please look", false, "a different handle"],
    ["ops@alignsynch.example", false, "an address, not a mention"],
    ["alignsynch@example.com", false, "an address on the left"],
    ["@@alignsynch", false, "a quoted double mention is not a ping"],
    ["alignsynch", false, "the bare word is not a mention"],
  ];

  for (const [body, expected, why] of cases) {
    it(`${expected ? "matches" : "rejects"}: ${why}`, () => {
      expect(MENTION_RE.test(body)).toBe(expected);
    });
  }

  it("is case-insensitive without being global (a global regex would carry lastIndex)", () => {
    expect(MENTION_RE.global).toBe(false);
    expect(MENTION_RE.flags).toContain("i");
  });
});

describe("the mention's own sentence", () => {
  it("quotes the sentence with the mention, not the whole body", () => {
    const asked = mentionSentences(COMMENT.body);
    expect(asked.startsWith("@alignsynch this would be resolved")).toBe(true);
    expect(asked.includes("Stripe best practice")).toBe(false);
  });

  it("keeps a body with no sentence punctuation rather than dropping it", () => {
    expect(mentionSentences("@alignsynch ship it now please")).toBe(
      "@alignsynch ship it now please",
    );
  });

  it("returns nothing when there is no mention", () => {
    expect(mentionSentences("a body that never names the account")).toBe("");
  });
});

describe("what is not an instruction", () => {
  it("skips a bot-authored mention", () => {
    expect(
      skipReason({
        body: "@alignsynch deployed",
        author: { login: "github-actions[bot]", type: "Bot" },
        identity: "jadenblack",
      }),
    ).toBe("bot");
  });

  it("skips a mention written by the identity running the watch", () => {
    expect(
      skipReason({
        body: "@alignsynch fyi",
        author: { login: "JadenBlack", type: "User" },
        identity: "jadenblack",
      }),
    ).toBe("self");
  });

  it("skips the watcher's own acknowledgement", () => {
    expect(
      skipReason({
        body: `${ACK_MARKER}\n@alignsynch acknowledged`,
        author: { login: "riolabs-ai", type: "User" },
        identity: "jadenblack",
      }),
    ).toBe("ack");
  });

  it("treats the owner's comment as an instruction", () => {
    expect(skipReason({ body: COMMENT.body, author: COMMENT.user, identity: "jadenblack" })).toBe(
      null,
    );
  });
});

describe("the alert payload", () => {
  const alert = buildAlert({
    repo: REPO,
    kind: "comment",
    item: COMMENT,
    thread: THREAD,
    preceding: EARLIER,
  });

  it("carries the comment's identity", () => {
    expect(alert.comment_id).toBe(7096092208);
    expect(alert.author).toBe("riolabs-ai");
    expect(alert.author_association).toBe("OWNER");
    expect(alert.created_at).toBe("2026-11-23T08:59:51Z");
    expect(alert.comment_url).toContain("#issuecomment-7096092208");
  });

  it("carries the thread: number, title, state, labels, tier and milestone", () => {
    expect(alert.thread.number).toBe(847);
    expect(alert.thread.state).toBe("open");
    expect(alert.thread.labels).toContain("area/billing");
    expect(alert.thread.labels).toContain("needs-decision");
    expect(alert.thread.tier).toBe("tier/R1");
    expect(alert.thread.milestone).toBe("v2.0.0-rc2 — the pool");
    expect(alert.thread.title).toContain("the adapter accepts a live key");
  });

  it("keeps the three comments before the mention, 200 characters each", () => {
    expect(alert.preceding).toHaveLength(3);
    for (const row of alert.preceding) {
      expect(row.excerpt.length).toBeLessThanOrEqual(200);
    }
    expect(alert.preceding.at(-1)?.id).toBe(EARLIER.at(-1)?.id);
  });

  it("says in one line what is being asked of the lead", () => {
    expect(alert.ask).toContain("riolabs-ai addressed @alignsynch");
    expect(alert.ask).toContain("#847");
    expect(alert.ask).toContain("tier/R1");
    expect(alert.ask).toContain("v2.0.0-rc2 — the pool");
    expect(alert.ask.split("\n")).toHaveLength(1);
  });

  it("marks no tier rather than inventing one", () => {
    expect(tierOf(["enhancement", "blocked"])).toBeNull();
    expect(tierOf(undefined)).toBeNull();
  });
});

describe("the excerpt", () => {
  it("trims with an ellipsis and leaves a short body whole", () => {
    expect(trimExcerpt("short")).toBe("short");
    const long = trimExcerpt("x".repeat(400));
    expect(long.length).toBe(200);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("each source is queried with `since`", () => {
  it("puts the stamp on all four api paths", () => {
    for (const source of SOURCES) {
      const query = sourceQuery(source, REPO, SINCE);
      expect(query).toContain(`since=${encodeURIComponent(SINCE)}`);
      expect(query).toContain("per_page=100");
    }
  });

  it("asks for every state on the collections that hold closed threads", () => {
    const issues = sourceQuery(SOURCES[2], REPO, SINCE);
    const pulls = sourceQuery(SOURCES[3], REPO, SINCE);
    expect(issues).toContain("state=all");
    expect(pulls).toContain("state=all");
    expect(sourceQuery(SOURCES[0], REPO, SINCE)).not.toContain("state=all");
  });

  it("hands the stamp to gh on all four reads, and nowhere else", async () => {
    const { calls, read } = oneCommentRoutes();
    await runWatch({ repo: REPO, since: SINCE, identity: "jadenblack", read });
    const stamped = calls.filter((call) => call.includes("since="));
    expect(stamped).toHaveLength(SOURCES.length);
    for (const call of calls.filter((c) => c.includes("since="))) {
      expect(call).toContain(encodeURIComponent(SINCE));
    }
  });
});

describe("the run", () => {
  it("emits the fixture alert with the steer attached", async () => {
    const { read } = oneCommentRoutes();
    const { report } = await runWatch({ repo: REPO, since: SINCE, identity: "jadenblack", read });
    expect(report.alerts).toHaveLength(1);
    const alert = report.alerts[0];
    expect(alert.comment_id).toBe(7096092208);
    expect(alert.thread.number).toBe(847);
    expect(alert.thread.milestone).toBe("v2.0.0-rc2 — the pool");
    expect(alert.preceding).toHaveLength(3);
  });

  it("keeps a pull that answers from both collections as one alert", async () => {
    const body = {
      body: "@alignsynch is this still blocked?",
      user: { login: "riolabs-ai", type: "User" },
    };
    const pull = {
      ...body,
      id: 9001,
      number: 847,
      state: "open",
      title: "a pull",
      updated_at: "2026-11-23T08:30:00Z",
      created_at: "2026-11-23T08:30:00Z",
      pull_request: { url: "https://api.github.com/repos/x/y/pulls/847" },
    };
    const { read } = recorder({
      [`repos/${REPO}/issues/847`]: { ...THREAD, number: 847 },
      [`repos/${REPO}/issues/comments`]: [],
      [`repos/${REPO}/pulls/comments`]: [],
      [`repos/${REPO}/issues`]: [pull],
      [`repos/${REPO}/pulls`]: [pull],
    });
    const { report } = await runWatch({ repo: REPO, since: SINCE, identity: "jadenblack", read });
    expect(report.alerts).toHaveLength(1);
    expect(report.alerts[0].kind).toBe("pr_body");
  });

  it("ignores a mention outside the window on a source that cannot filter server-side", async () => {
    const stale = {
      ...COMMENT,
      id: 1234,
      updated_at: "2026-11-01T00:00:00Z",
      created_at: "2026-11-01T00:00:00Z",
    };
    const { read } = recorder({
      [`repos/${REPO}/issues/847`]: THREAD,
      [`repos/${REPO}/issues/comments`]: [],
      [`repos/${REPO}/pulls/comments`]: [],
      [`repos/${REPO}/issues`]: [stale],
      [`repos/${REPO}/pulls`]: [],
    });
    const { report } = await runWatch({ repo: REPO, since: SINCE, identity: "jadenblack", read });
    expect(report.alerts).toHaveLength(0);
  });
});

describe("the cursor", () => {
  it("advances per source and never backwards", () => {
    const first = nextCursor(null, {
      repo: REPO,
      observed: { issues_comments: "2026-11-23T09:00:00Z" },
      alertedIds: [7096092208],
    });
    expect(first.sources.issues_comments).toBe("2026-11-23T09:00:00Z");
    expect(first.seen).toEqual(["7096092208"]);

    const older = nextCursor(first, {
      repo: REPO,
      observed: { issues_comments: "2026-11-22T09:00:00Z" },
      alertedIds: [],
    });
    expect(older.sources.issues_comments).toBe("2026-11-23T09:00:00Z");
  });

  it("keeps a source's stamp when nothing came back for it", () => {
    const prev = nextCursor(null, {
      repo: REPO,
      observed: { pulls: "2026-11-23T08:33:58Z" },
      alertedIds: [],
    });
    const next = nextCursor(prev, { repo: REPO, observed: {}, alertedIds: [] });
    expect(next.sources.pulls).toBe("2026-11-23T08:33:58Z");
  });

  it("makes a second run of the same window silent", async () => {
    const first = oneCommentRoutes();
    const one = await runWatch({
      repo: REPO,
      since: SINCE,
      identity: "jadenblack",
      read: first.read,
    });
    expect(one.report.alerts).toHaveLength(1);

    const second = oneCommentRoutes();
    const two = await runWatch({
      repo: REPO,
      since: SINCE,
      identity: "jadenblack",
      cursor: one.cursor,
      read: second.read,
    });
    expect(two.report.alerts).toHaveLength(0);
    expect(two.report.skipped.seen).toBeGreaterThan(0);
  });
});

describe("the CLI", () => {
  let dir = "";
  let stub = "";
  let log = "";

  // The stub is written per test with its own paths baked in: a `gh` shim driven by environment
  // variables would put three undeclared names in the tree, and `env:check` reads this file.
  function stubSource(root: string) {
    return `#!/usr/bin/env node
import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(root, "gh.log"))}, args.join(" ") + "\\n");
if (args[0] === "user") { process.stdout.write("jadenblack\\n"); process.exit(0); }
const path = args[args.length - 1];
const fixtures = JSON.parse(fs.readFileSync(${JSON.stringify(join(root, "fixtures.json"))}, "utf8"));
const keys = Object.keys(fixtures).sort((a, b) => b.length - a.length);
const key = keys.find((candidate) => path.startsWith(candidate));
process.stdout.write(JSON.stringify(key ? fixtures[key] : []));
`;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mention-watch-"));
    stub = join(dir, "gh-stub.mjs");
    log = join(dir, "gh.log");
    writeFileSync(stub, stubSource(dir));
    chmodSync(stub, 0o755);
    writeFileSync(
      join(dir, "fixtures.json"),
      JSON.stringify({
        [`repos/${REPO}/issues/847/comments`]: THREAD_COMMENTS,
        [`repos/${REPO}/issues/847`]: [THREAD],
        [`repos/${REPO}/issues/comments`]: [COMMENT],
        [`repos/${REPO}/pulls/comments`]: [],
        [`repos/${REPO}/issues`]: [],
        [`repos/${REPO}/pulls`]: [],
      }),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(extra: string[]) {
    return spawnSync(
      process.execPath,
      [join("scripts", "watch-mentions.mjs"), "--since", SINCE, "--gh", stub, ...extra],
      { encoding: "utf8" },
    );
  }

  it("prints one JSON document and writes nothing in --dry-run", () => {
    const statePath = join(dir, "state", "cursor.json");
    const result = run(["--dry-run", "--json", "--state", statePath]);
    expect(result.status).toBe(0);
    const doc = JSON.parse(result.stdout);
    expect(doc.alerts).toHaveLength(1);
    expect(doc.alerts[0].comment_id).toBe(7096092208);
    expect(doc.cursor.applied).toBe(false);
    expect(readCursor(statePath)).toBeNull();
  });

  it("queries gh with --paginate --slurp and the stamp on every source", () => {
    const result = run(["--dry-run", "--json", "--state", join(dir, "cursor.json")]);
    expect(result.status).toBe(0);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    const apiCalls = calls.filter(
      (line) => line.startsWith("api ") && !line.startsWith("api user"),
    );
    expect(apiCalls.every((line) => line.includes("--paginate") && line.includes("--slurp"))).toBe(
      true,
    );
    const stamped = apiCalls.filter((line) => line.includes("since="));
    expect(stamped).toHaveLength(SOURCES.length);
  });

  it("is silent on the second run with the cursor applied", () => {
    const statePath = join(dir, "cursor.json");
    const first = run(["--apply-cursor", "--json", "--state", statePath]);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout).alerts).toHaveLength(1);
    expect(readCursor(statePath)?.seen).toContain("7096092208");

    const second = run(["--apply-cursor", "--json", "--state", statePath]);
    expect(second.status).toBe(0);
    expect(second.stdout.trim()).toBe("");
  });

  it("refuses a dry run that would write the cursor", () => {
    const result = run(["--dry-run", "--apply-cursor", "--state", join(dir, "cursor.json")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--dry-run and --apply-cursor are exclusive");
  });

  it("refuses a --since it cannot parse", () => {
    const result = spawnSync(
      process.execPath,
      [
        join("scripts", "watch-mentions.mjs"),
        "--since",
        "yesterday",
        "--state",
        join(dir, "c.json"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--since is not a date");
  });
});
