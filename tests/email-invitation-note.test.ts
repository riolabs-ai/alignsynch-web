/**
 * **The invitation mail carries the note** (#1275, spec APP-22).
 *
 * The note reaches the recipient two ways — the join step and the mailbox — and this suite holds
 * the second one to the same text: the sender's paragraph, under a line that names who wrote it,
 * with the line breaks the person typed, and **nothing at all when there is no note**.
 *
 * Three properties are deliberate and each is measured:
 *
 *   it is composed here, not in `content/email-bodies.md`   that body belongs to the owner and is
 *       replaceable by an admin override; the note is a person's paragraph and neither may reword
 *       or drop it. So `INVITATION_BODY.placeholders` is unchanged and the block is appended by the
 *       document.
 *   it is text   the band derives the HTML from the text, so the assertion runs on `.text` — which
 *       is also the half that survives a text-only client.
 *   it is absent when empty   an empty quotation is a paragraph attributed to somebody who wrote
 *       nothing.
 */
import { describe, expect, it } from "vitest";

import { invitationTemplate, renderTemplate } from "@/lib/email/templates";
import { INVITATION_BODY } from "@/lib/email/templates/invitation";

const FACTS = {
  inviter: "Robin Vale",
  counterparty: "Elena Marsh",
  template: "How We Make Decisions",
  link: "https://app.alignsynch.example/invite/sample-token",
};

const NOTE = "We keep circling the same argument.\nWant to look at it properly, together?";

function textOf(note: string | null | undefined): string {
  return renderTemplate(invitationTemplate, { ...FACTS, note }).text;
}

describe("the invitation mail's note", () => {
  it("quotes the note under the sender's name, before the mechanical sentences", () => {
    const text = textOf(NOTE);
    expect(text).toContain("A note from Robin Vale:");
    expect(text).toContain("We keep circling the same argument.");
    expect(text).toContain("Want to look at it properly, together?");
    // Before the sentence that describes the message: the person's words come first.
    expect(text.indexOf("A note from Robin Vale:")).toBeLessThan(
      text.indexOf("Robin Vale has started an assessment"),
    );
  });

  it("keeps the note's own line breaks", () => {
    expect(textOf(NOTE)).toContain("We keep circling the same argument.\nWant to look at it");
  });

  it("draws no note block when the row holds none", () => {
    for (const empty of [null, undefined, "", "   \n  "]) {
      expect(textOf(empty)).not.toContain("A note from");
    }
  });

  it("does not add a placeholder to the owner's body", () => {
    // The note is not `{{note}}`: the body in `content/email-bodies.md` stays as the owner wrote
    // it, and an admin override of that body cannot drop or reword the sender's paragraph.
    expect(INVITATION_BODY.placeholders).not.toContain("note");
  });

  it("carries the note's characters as typed into the HTML too", () => {
    const rendered = renderTemplate(invitationTemplate, {
      ...FACTS,
      note: "One thing: 50/50 & no rush.",
    });
    expect(rendered.text).toContain("50/50 & no rush.");
    // The band escapes the HTML entities, so the reader's characters survive in both halves.
    expect(rendered.html).toContain("50/50 &amp; no rush.");
  });
});
