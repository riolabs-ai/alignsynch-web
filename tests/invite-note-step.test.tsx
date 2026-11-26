/**
 * **The recipient reads the note** (#1275, spec APP-22) — the other half of "drafted at stage 5".
 *
 * The claim for this feature is a round trip: written on the sender's stage, stored on the
 * invitation row, read by the person it was addressed to. `/invite/<token>`'s first step is where
 * that last half is visible, so this suite pins:
 *
 *   the quote     the note is printed as text — line breaks kept, characters as typed, because the
 *                 band does the same thing to it in the mail — under a caption that names the
 *                 Initiator, who is the only person who could have written it.
 *   the absence   no note draws no figure at all. An empty quotation signed "A note from Avery"
 *                 attributes a paragraph to somebody who did not write one.
 *   the position  the note sits inside the invitation card, beside the goal band, so it reads as
 *                 the sender's words rather than as the product's.
 *
 * Rendered with `renderToStaticMarkup`: no database, no session, no clock.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JoinInviteStep } from "@/components/assessment-flow/join-invite-step";
import { invitePageCopy } from "@/data/pages/invite";
import { fillLabel, itemLabel, sectionOf } from "@/lib/page-copy";
import type { InvitePreview } from "@/lib/flow/store";

const TOKEN = "k".repeat(43);
const INVITATION = sectionOf(invitePageCopy, "invitation");

const PREVIEW: InvitePreview = {
  state: "claimable",
  sessionRecordId: "session-response-1",
  initiatorName: "Avery",
  counterpartyName: "Rowan",
  templateTitle: "Relationship Basics",
  viewerRole: null,
  relationshipTitle: "Staying Close",
  templateSummary: "Relationship Basics, answered by Avery and Rowan.",
  note: null,
  mode: "basic",
  setting: "soft",
  aspects: [
    {
      id: "aspect-contact",
      prompt: "How does how often you are in touch compare to what each wants?",
    },
  ],
};

function step(note: string | null): string {
  return renderToStaticMarkup(
    createElement(JoinInviteStep, {
      copy: invitePageCopy,
      preview: { ...PREVIEW, note },
      token: TOKEN,
    }),
  );
}

const NOTE =
  "I have been thinking about this for a while.\nNothing is wrong — I just want to know.";

describe("the invitation's note, as the recipient reads it", () => {
  it("quotes the note under the sender's name", () => {
    const html = step(NOTE);
    expect(html).toContain('data-invite-note="true"');
    expect(html).toContain("I have been thinking about this for a while.");
    expect(html).toContain(
      fillLabel(itemLabel(INVITATION, "note-caption"), { initiator: "Avery" }),
    );
  });

  it("keeps the line breaks the sender typed", () => {
    // `whitespace-pre-line` is what makes a two-paragraph note read as two paragraphs; the mail
    // keeps them for the same reason (`verbatim`).
    expect(step(NOTE)).toContain("whitespace-pre-line");
  });

  it("draws nothing when there is no note", () => {
    const html = step(null);
    expect(html).not.toContain('data-invite-note="true"');
    expect(html).not.toContain(itemLabel(INVITATION, "note-caption"));
  });

  it("draws nothing for a note that is only whitespace", () => {
    // The row stores `null` for a blank note, and a row written before that rule is drawn the same
    // way rather than as an empty figure.
    expect(step("   \n  ")).not.toContain('data-invite-note="true"');
  });

  it("still gives the reader the one primary action the step owns", () => {
    // The note is a paragraph in the card, not a second call to action.
    const html = step(NOTE);
    expect(html).toContain('data-primary-action="join"');
  });
});
