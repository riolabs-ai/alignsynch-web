/**
 * The answer screen asks the four questions in the founder's own wording (#1362).
 *
 * The founder's primary screenshot of this flow is the `/answer` sheet's aspect card — its
 * annotated `ROUND 1 · ASPECT 1 OF 7` band — and it asks a paraphrase: FEEL was glossed
 * `How it is now`, WISH `How you want it`, and THINK and GUESS carried no gloss at all, because
 * the card's lookup was a two-branch ternary. The four sentences are the home band's own
 * (`data/pages/home-alignsynch.ts` → `bread-line-*` bodies), so this suite holds the two fixtures
 * character-identical rather than trusting a copy-paste, and reads the rendered card so the proof
 * is what a reader gets and not what the fixture was meant to say.
 *
 * What must not move: the bold word before each sentence is the glossary's (`OPINION_LABELS`), the
 * kinds asked are `opinionKindsFor(mode)` — Basic Mode still asks and draws exactly two rows — and
 * nothing else on the card (chips, scale labels, pole words, pick hint) is re-worded here.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnswerSheet } from "@/components/assessment-flow/answer-sheet";
import { OPINION_LABELS, type AssessmentMode, type OpinionKind } from "@/content/assessment";
import { SCORE_MAX, SCORE_MIN } from "@/content/record";
import { assessmentAnswerPageCopy } from "@/data/pages/assessment-answer";
import { alignSynchHomeAs2Copy } from "@/data/pages/home-alignsynch";
import type { AnswerGate } from "@/lib/flow/answer-gate";
import { positionOf } from "@/lib/flow/answer-position";
import type { FlowAspect } from "@/lib/flow/screen";
import { itemBody, itemLabel, sectionOf } from "@/lib/page-copy";

const INSTANCE_ID = "session-question-wording-test";

/** Two Aspects, none answered: this suite reads one card, so one is enough and the second is context. */
const ASPECTS: readonly FlowAspect[] = Array.from({ length: 2 }, (_, index) => ({
  itemId: `aspect-${index + 1}`,
  prompt: `Aspect ${index + 1}`,
  leftValue: "Apart",
  rightValue: "Together",
  min: SCORE_MIN,
  max: SCORE_MAX,
  own: null,
}));

/** The live sheet — the state a reader answers in. */
const SHEET: AnswerGate = {
  state: "sheet",
  role: "initiator",
  action: `/assessment/instances/${INSTANCE_ID}/answers`,
  answered: 0,
  aspects: ASPECTS.length,
};

/** The sheet as a browser receives it, at one mode. */
function render(mode: AssessmentMode): string {
  return renderToStaticMarkup(
    createElement(AnswerSheet, {
      copy: assessmentAnswerPageCopy,
      aspects: ASPECTS,
      gate: SHEET,
      viewer: { role: "initiator", name: "Rowan" },
      mode,
      backHref: `/assessment/instances/${INSTANCE_ID}`,
      sheetPath: `/assessment/instances/${INSTANCE_ID}/answer`,
      draftAction: `/assessment/instances/${INSTANCE_ID}/answers/draft`,
      answersAction: `/assessment/instances/${INSTANCE_ID}/answers`,
      otherName: "Avery",
      position: positionOf(ASPECTS, undefined),
    }),
  );
}

/** The aspect card only: a sentence anywhere else in the sheet is not the claim under test. */
function aspectCard(html: string): string {
  const start = html.indexOf("data-aspect-card=");
  expect(start, "the sheet drew no aspect card").toBeGreaterThan(-1);
  const end = html.indexOf("</form>", start);
  expect(end, "the aspect card was not closed").toBeGreaterThan(start);
  return html.slice(start, end);
}

/** The `<span>`s inside one kind's legend: the bold opinion word, then its sentence. */
function legend(card: string, kind: OpinionKind): string[] | undefined {
  const fieldset = card.match(new RegExp(`data-kind="${kind}"[\\s\\S]*?</legend>`));
  if (fieldset === null) return undefined;
  return [...fieldset[0].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((span) => span[1].trim());
}

/** How many rows the card drew. */
function rows(card: string): number {
  return card.split("data-kind=").length - 1;
}

/** The four sentences, in the glossary's order, read out of one fixture. */
function fixtureSentences(): string[] {
  const section = sectionOf(assessmentAnswerPageCopy, "aspect");
  return (["feel", "wish", "think", "guess"] as const).map((kind) =>
    itemLabel(section, `${kind}-gloss`),
  );
}

describe("the aspect card asks the four questions in the founder's wording", () => {
  it("draws all four legends in Advanced Mode, each as the opinion word then its sentence", () => {
    const card = aspectCard(render("advanced"));

    expect(rows(card)).toBe(4);
    for (const kind of ["feel", "wish", "think", "guess"] as const) {
      expect(legend(card, kind), `advanced: ${kind} row`).toEqual([
        OPINION_LABELS[kind],
        itemLabel(sectionOf(assessmentAnswerPageCopy, "aspect"), `${kind}-gloss`),
      ]);
    }

    // The founder's sentences, verbatim, in the rendered card.
    expect(card).toContain("How do YOU FEEL it is now?");
    expect(card).toContain("How do YOU WISH it to SLOWLY change?");
    expect(card).toContain("How do YOU THINK THEY FEEL it is now?");
    expect(card).toContain("How do YOU GUESS THEY WISH it to SLOWLY change?");
  });

  it("no longer draws the paraphrase the bundle carried", () => {
    const card = aspectCard(render("advanced"));
    expect(card).not.toContain("How it is now");
    expect(card).not.toContain("How you want it");
  });

  it("asks and draws exactly two rows in Basic Mode — Feel and Wish, nothing else", () => {
    const card = aspectCard(render("basic"));

    expect(rows(card)).toBe(2);
    expect(legend(card, "feel")).toEqual([
      OPINION_LABELS.feel,
      itemLabel(sectionOf(assessmentAnswerPageCopy, "aspect"), "feel-gloss"),
    ]);
    expect(legend(card, "wish")).toEqual([
      OPINION_LABELS.wish,
      itemLabel(sectionOf(assessmentAnswerPageCopy, "aspect"), "wish-gloss"),
    ]);
    expect(legend(card, "think")).toBeUndefined();
    expect(legend(card, "guess")).toBeUndefined();
    expect(card).not.toContain("THINK THEY FEEL");
    expect(card).not.toContain("GUESS THEY WISH");
  });

  it("prints the home band's sentences character-identically — one copy, two surfaces", () => {
    // `alignSynchHomeAs2Copy` is the fixture `app/(marketing)/page.tsx` renders, which is where
    // #1427 put the four sentences; the older `alignSynchHomeCopy` carries no `bread-line-*` rows.
    const bread = sectionOf(alignSynchHomeAs2Copy, "questions");
    const home = (["feel", "wish", "think", "guess"] as const).map((kind) =>
      itemBody(bread, `bread-line-${kind}`),
    );

    expect(fixtureSentences()).toEqual(home);
  });
});
