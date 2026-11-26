// @vitest-environment jsdom
/**
 * A sheet that closes **under** an open page — #1355.
 *
 * The founder's report is one sentence long: they took the time to change their answers, and only
 * then read "You have accepted this session, so an answer cannot be changed." Reproduced at
 * `fae1b12e` on `assessment-instance-theo-lena`: after the party's own acceptance, an open sheet's
 * pick comes back `409 {"code":"frozen"}` and the whole-sheet POST answers a bare HTML refusal page.
 * A fresh load is honest — it draws the sealed pane and no controls — so the defect is the page that
 * was already open, which kept its scale and printed `Not Saved · Pick Again` over a write that can
 * never succeed.
 *
 * Four claims:
 *
 *   frozen     a `frozen` refusal swaps the card for the sealed pane and the fixture's own sentence,
 *              and leaves no radio behind for a second attempt;
 *   voided     a `voided` refusal draws the voided sentence and no form — and never the "you have
 *              accepted" pane, which would be a fact about a session nobody accepted;
 *   transient  a failure with no such code is still a failed save, chip and scale intact, so the fix
 *              cannot swallow a real one;
 *   words      both sentences are the fixture's, never typed into the component.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerSheet } from "@/components/assessment-flow/answer-sheet";
import { SCORE_MAX, SCORE_MIN } from "@/content/record";
import { assessmentAnswerPageCopy } from "@/data/pages/assessment-answer";
import type { AnswerGate } from "@/lib/flow/answer-gate";
import { positionOf } from "@/lib/flow/answer-position";
import type { FlowAspect } from "@/lib/flow/screen";
import { itemLabel, sectionOf } from "@/lib/page-copy";

declare global {
  // React reads this to know it is inside `act()`; without it every update is unmocked.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const INSTANCE_ID = "session-sealed-refusal-test";

/** Five unanswered Aspects: the sheet a counterparty opens at the start of a round. */
const UNANSWERED: readonly FlowAspect[] = Array.from({ length: 5 }, (_, index) => ({
  itemId: `aspect-${index + 1}`,
  prompt: `Aspect ${index + 1}`,
  leftValue: "Apart",
  rightValue: "Together",
  min: SCORE_MIN,
  max: SCORE_MAX,
  own: null,
}));

const SHEET: AnswerGate = {
  state: "sheet",
  role: "counterparty",
  action: `/assessment/instances/${INSTANCE_ID}/answers`,
  answered: 0,
  aspects: UNANSWERED.length,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Mount the live sheet, as the route hands it to a viewer who may answer. */
async function mount(): Promise<void> {
  await act(async () => {
    root.render(
      createElement(AnswerSheet, {
        copy: assessmentAnswerPageCopy,
        aspects: UNANSWERED,
        gate: SHEET,
        viewer: { role: "counterparty", name: "Lena" },
        mode: "basic",
        backHref: `/assessment/instances/${INSTANCE_ID}`,
        sheetPath: `/assessment/instances/${INSTANCE_ID}/answer`,
        draftAction: `/assessment/instances/${INSTANCE_ID}/answers/draft`,
        answersAction: `/assessment/instances/${INSTANCE_ID}/answers`,
        otherName: "Theo",
        position: positionOf(UNANSWERED, undefined),
      }),
    );
  });
}

/** The draft write's answer, as the route returns it. */
function stubWrite(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

/** One pick on the first Feel row, with the transition and the request flushed. */
async function pickFeel(): Promise<void> {
  const radio = container.querySelector<HTMLInputElement>('input[type="radio"]');
  if (radio === null) throw new Error("the live sheet draws no scale to pick from");
  await act(async () => {
    radio.click();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("a sheet the server has closed stops inviting picks (#1355)", () => {
  it("a frozen refusal draws the sealed pane and the fixture's sentence, with no scale left", async () => {
    stubWrite(409, {
      ok: false,
      code: "frozen",
      reason: "the counterparty has accepted this session",
    });
    await mount();
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(10);

    await pickFeel();

    expect(
      container.querySelectorAll('input[type="radio"]').length,
      "no control invites a retry",
    ).toBe(0);
    expect(
      container.querySelector("[data-frozen-status]"),
      "the sealed pane is drawn",
    ).not.toBeNull();
    const band = container.querySelector("[data-refused]");
    expect(band?.getAttribute("data-refused")).toBe("frozen");
    expect(band?.textContent).toContain(
      itemLabel(sectionOf(assessmentAnswerPageCopy, "refusals"), "frozen"),
    );
    // The lie the issue is about: advice that cannot work over a write that cannot succeed.
    expect(container.textContent).not.toContain(
      itemLabel(sectionOf(assessmentAnswerPageCopy, "progress"), "save-failed"),
    );
  });

  it("a voided refusal names the void, and does not claim an acceptance nobody made", async () => {
    stubWrite(409, { ok: false, code: "voided", reason: "this session was voided" });
    await mount();

    await pickFeel();

    expect(container.querySelectorAll('input[type="radio"]').length).toBe(0);
    const band = container.querySelector("[data-refused]");
    expect(band?.getAttribute("data-refused")).toBe("voided");
    expect(band?.textContent).toContain(
      itemLabel(sectionOf(assessmentAnswerPageCopy, "refusals"), "voided"),
    );
    expect(container.querySelector("[data-frozen-status]")).toBeNull();
  });

  it("a transient failure is still a failed save, with the scale still offered", async () => {
    stubWrite(500, { ok: false, code: "unknown", reason: "the write did not land" });
    await mount();

    await pickFeel();

    expect(container.querySelectorAll('input[type="radio"]').length).toBe(10);
    expect(container.querySelector("[data-refused]")).toBeNull();
    expect(container.textContent).toContain(
      itemLabel(sectionOf(assessmentAnswerPageCopy, "progress"), "save-failed"),
    );
  });
});
