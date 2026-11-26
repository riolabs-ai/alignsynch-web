/**
 * **Stage 5 draws the note, and the note is the row's** (#1275, spec APP-22).
 *
 * The card that filed this (APP-22) measured the gap at one line: stage 5's column said *What you
 * can do later* and carried no field, so the invitation — the one place a person can say why they
 * are asking — had nowhere to say it. What this suite pins is that the surface now exists and that
 * it is the **stored** value, not a component's memory:
 *
 *   the field      a textarea with an accessible name, the fixture's placeholder, and a `maxLength`
 *                  derived from `INVITE_NOTE_MAX` — so the browser's cap and the column's CHECK are
 *                  one number, not two.
 *   the initial    `initialNote` (the page's `readFlowScreen()` value) is the field's starting
 *                  content: a reload arrives with the paragraph somebody already wrote.
 *   the preview    what the recipient will read is quoted back in *What {name} Sees*, and nothing
 *                  is drawn for an absent note — an empty quotation signed with a person's name is
 *                  worse than no quotation.
 *   the counter    how much of the ceiling is used, from the fixture, not a literal.
 *
 * Rendered with `renderToStaticMarkup`, like the rest of the flow's tests: no database, no server,
 * no session, no clock. The write itself is `tests/invite-note.test.ts` (the rules) and the two
 * store functions; a fetch cannot be exercised here, so this suite says what the surface *draws*.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CreateRelationship } from "@/components/assessment-flow/create-relationship";
import { assessmentCreatePageCopy } from "@/data/pages/assessment-create";
import { EMPTY_CREATE_DRAFT, type CreateDraft } from "@/lib/flow/create-draft";
import { INVITE_NOTE_MAX } from "@/lib/flow/invite-note";
import { fillLabel, itemLabel, sectionOf } from "@/lib/page-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

const INVITE = sectionOf(assessmentCreatePageCopy, "invite");

const TEMPLATE = {
  slug: "brother-a-brother-b",
  recordId: "assessment-brother",
  title: "Brother A-Brother B",
  summary: "Five Aspects about how the two of them work.",
  aspectCount: 5,
};

const FILLED: CreateDraft = {
  ...EMPTY_CREATE_DRAFT,
  initiatorFirst: "Daniel",
  initiatorLast: "Mercer",
  counterpartyFirst: "Rowan",
  counterpartyLast: "Hale",
  email: "rowan@example.com",
  title: "Staying Close Through Busy Seasons",
};

const NOTE = "I keep meaning to ask you about the last few months.\nNo score, just curious.";

function stage5(note: string | null): string {
  return renderToStaticMarkup(
    createElement(CreateRelationship, {
      copy: assessmentCreatePageCopy,
      stage: 5,
      template: TEMPLATE,
      draft: FILLED,
      aspects: [{ id: "aspect-1", prompt: "Aspect One", leftValue: "Low", rightValue: "High" }],
      backHref: "/back",
      problem: null,
      sessionRecordId: "assessment-instance-brother",
      relationshipId: "relationship-brother",
      trialEndsAt: "2026-11-23T12:00:00.000Z",
      inviteNote: note,
    }),
  );
}

describe("stage 5's note field", () => {
  it("draws the field, labelled and capped by the one constant", () => {
    const html = stage5(null);
    expect(html).toContain('data-invite-note-field="true"');
    expect(html).toContain(`maxLength="${INVITE_NOTE_MAX}"`);
    expect(html).toContain(itemLabel(INVITE, "note-label"));
    expect(html).toContain(itemLabel(INVITE, "note-placeholder"));
  });

  it("heads the field with the Counterparty's own name", () => {
    expect(stage5(null)).toContain(fillLabel(itemLabel(INVITE, "note-heading"), { name: "Rowan" }));
  });

  it("starts empty when the row holds no note, and shows the whole ceiling", () => {
    const html = stage5(null);
    expect(html).not.toContain('data-preview-note="true"');
    expect(html).toContain(
      fillLabel(itemLabel(INVITE, "note-count"), {
        count: "0",
        max: String(INVITE_NOTE_MAX),
      }),
    );
  });

  it("starts from the stored note, so a reload keeps the paragraph", () => {
    const html = stage5(NOTE);
    // The value is the row's, rendered into the textarea: this is the assertion that the field is
    // not component state dressed as one.
    expect(html).toContain("I keep meaning to ask you about the last few months.");
    expect(html).toContain(
      fillLabel(itemLabel(INVITE, "note-count"), {
        count: String([...NOTE].length),
        max: String(INVITE_NOTE_MAX),
      }),
    );
  });

  it("quotes the note back in What {name} Sees, under its caption", () => {
    const html = stage5(NOTE);
    expect(html).toContain('data-preview-note="true"');
    expect(html).toContain("No score, just curious.");
    expect(html).toContain(itemLabel(INVITE, "preview-note-caption"));
  });
});
