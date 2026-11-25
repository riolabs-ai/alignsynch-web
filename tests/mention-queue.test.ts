/**
 * `mention-queue` — who may queue a thread with `needs-agent-reply`, held still.
 *
 * The defect this closes has a timestamp, so it is written here rather than described: #1382 was
 * answered by `jadenblack` at 2026-11-25T04:21:21Z, the label was removed at 04:21:27Z, and run
 * 45546210272 put it back at 04:21:34Z because the answer names the handle — it has to, to be a
 * reply. The predicate is a named function in `scripts/mention-queue.mjs` and the workflow calls
 * it; these cases pin the four answers it can give, and the CLI contract the workflow reads.
 *
 * The one direction that looks wrong and is not: the repository owner is NOT skipped implicitly.
 * `riolabs-ai` is the account that files the founder issues and writes the mentions, so skipping
 * the owner would leave the queue permanently empty. The last case pins the opposite deployment,
 * where the owner *is* the answerer, because that is a supported configuration and not a typo.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ANSWERING_IDENTITIES,
  answeringIdentities,
  answeringJqFilter,
  isAutomationActor,
  mentionQueueDecision,
} from "../scripts/mention-queue.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/mention-queue.mjs", import.meta.url));
const OWNER = "riolabs-ai";
const ANSWERER = "jadenblack";

/** The line that re-armed the label: an answer has to name the handle to be an answer. */
const DISCLOSURE = "Answering in place of `@alignsynch`, which cannot sign in.";

function run(args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

describe("mention-queue — who may put needs-agent-reply on a thread", () => {
  it("queues a mention from the founder account — the repository owner asks the questions", () => {
    expect(mentionQueueDecision({ actor: OWNER })).toEqual({
      apply: true,
      reason: "human-mention",
      login: OWNER,
    });
  });

  it("queues a mention from any other human login", () => {
    expect(mentionQueueDecision({ actor: "octocat", actorType: "User" }).apply).toBe(true);
  });

  it("skips the answering identity's own comment, which is the #1382 regression", () => {
    const decision = mentionQueueDecision({ actor: ANSWERER, actorType: "User" });
    expect(decision).toEqual({ apply: false, reason: "answering-identity", login: ANSWERER });
    // The rule is the author, never the text: the predicate takes no body at all, because the
    // disclosure line below is what the old labeller matched, and "ignore bodies containing it"
    // is how the bug happened.
    expect(DISCLOSURE).toContain("@alignsynch");
    expect(Object.keys(mentionQueueDecision({ actor: ANSWERER }))).toEqual([
      "apply",
      "reason",
      "login",
    ]);
  });

  it("matches an answering identity whatever case the payload spells it in", () => {
    expect(mentionQueueDecision({ actor: "JadenBlack" }).reason).toBe("answering-identity");
  });

  it("skips the handle's own account — @alignsynch does not ask itself", () => {
    expect(mentionQueueDecision({ actor: "alignsynch" })).toEqual({
      apply: false,
      reason: "automation",
      login: "alignsynch",
    });
  });

  it("skips a [bot] login", () => {
    expect(mentionQueueDecision({ actor: "dependabot[bot]" }).reason).toBe("automation");
    expect(mentionQueueDecision({ actor: "github-actions[BOT]" }).reason).toBe("automation");
  });

  it("skips a payload type of Bot even when the login carries no suffix", () => {
    expect(mentionQueueDecision({ actor: "renovate", actorType: "Bot" }).reason).toBe("automation");
  });

  it("queues an event whose author cannot be read rather than silencing the thread", () => {
    expect(mentionQueueDecision({ actor: null })).toEqual({
      apply: true,
      reason: "unknown-actor",
      login: null,
    });
    expect(mentionQueueDecision({ actor: "   " }).apply).toBe(true);
  });

  it("skips the repository owner when the deployment declares the owner as the answerer", () => {
    const decision = mentionQueueDecision({
      actor: OWNER,
      answering: ["someone-else", OWNER],
    });
    expect(decision.reason).toBe("answering-identity");
  });

  it("treats a blank answering entry as absent, and folds the list to unique lower-case logins", () => {
    expect(
      answeringIdentities({ answering: [" JadenBlack ", "", "jadenblack"], target: "alignsynch" }),
    ).toEqual(["alignsynch", "jadenblack"]);
    expect(ANSWERING_IDENTITIES).toContain(ANSWERER);
  });

  it("emits a re-scan filter that names every answering identity and keeps other humans' words", () => {
    const filter = answeringJqFilter();
    for (const login of answeringIdentities()) {
      expect(filter).toContain(`!= "${login}"`);
    }
    // The workflow interpolates this inside double quotes; a jq variable would be shell-expanded.
    expect(filter).not.toContain("$");
    expect(isAutomationActor({ actor: "alignsynch", target: "alignsynch" })).toBe(true);
  });

  it("exits 3 for an answering identity and 0 for the founder, naming the reason in both", () => {
    const answered = run(["--actor", ANSWERER]);
    expect(answered.status).toBe(3);
    expect(answered.stdout).toContain("reason=answering-identity");

    const asked = run(["--actor", OWNER, "--type", "User"]);
    expect(asked.status).toBe(0);
    expect(asked.stdout).toContain("reason=human-mention");
  });

  it("prints the identity list and the jq filter on request, so the workflow has one home", () => {
    const json = run(["--answering-json"]);
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual(answeringIdentities());

    const jq = run(["--answering-jq"]);
    expect(jq.status).toBe(0);
    expect(jq.stdout).toBe(answeringJqFilter());
  });

  it("exits 2 with usage when no actor is given, so a broken call never passes as a decision", () => {
    const missing = run([]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("usage:");
  });
});
