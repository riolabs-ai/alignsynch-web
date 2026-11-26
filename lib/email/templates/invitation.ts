/**
 * Template #2 — the counterparty invitation (#548, band v0.9).
 *
 * **What this mail is for.** The recipient is not a user of this app and has no screen to read
 * the fact on: the invitation is the one message in the product that has to reach someone who is
 * not in it yet (#146). It carries exactly one link — the invitation — and nothing else that can
 * identify a session.
 *
 * **Text first.** `invitationDocument()` returns an `EmailDocument`; the band composes the plain
 * text and derives the HTML from it (`lib/email/band.ts`). No sentence is written here that the
 * text half does not carry.
 *
 * **Nothing is invented.** The opening line is the one `content/email-bodies.md` holds for this
 * template, drafted from the facts the record carries — who invited whom, which template, and the
 * link — and three sentences of product behaviour that are true of this build: the link works once,
 * answers stay blind until both parties answer and accept, and the answers are frozen after that.
 * There is no metric, no testimonial and no promise of an outcome.
 *
 * **The note is the sender's, and it is not this file's prose** (#1275). When Stage 5 collected one,
 * `facts.note` carries it and the document quotes it under a line that names who wrote it. It is
 * deliberately **not** a `{{note}}` placeholder in `content/email-bodies.md`: that body is the
 * owner's, replaceable by an admin override (#1138), while the note is a person's own paragraph —
 * a body override must not be able to drop it, spell it or reword it, and the note must not go
 * missing because somebody edited the template's opening line. So the block is composed here, after
 * the body, from the row's text: the band treats it as prose (no escaping, no interpretation), and
 * a note of nothing but whitespace is no block at all rather than an empty quotation.
 */
import type { EmailDocument } from "@/lib/email/band";
import { bodyBlocks, type EmailBodySpec } from "@/lib/email/body";

/** This template's section in `content/email-bodies.md`, and the facts it may say. */
export const INVITATION_BODY = {
  id: "counterparty-invitation",
  placeholders: ["inviter", "counterparty", "template", "link"],
} as const satisfies EmailBodySpec;

/** Everything the words need: who, which template, the one link, and what the sender wrote. */
export interface InvitationFacts {
  /** The person who started the assessment — the Initiator's name, from the record. */
  readonly inviter: string;
  /** The person being invited — the Counterparty's name, from the record. */
  readonly counterparty: string;
  /** The template's title, from the record. */
  readonly template: string;
  /** The invitation link, the only address the message carries. */
  readonly link: string;
  /**
   * #1275 — the Initiator's personal note, as `session_invite.invite_note` holds it, or `null`.
   *
   * Optional as well as nullable so every fixture, sample and test written before the note existed
   * stays a valid set of facts: absent and `null` both mean "no note", and the document draws
   * nothing for either.
   */
  readonly note?: string | null;
}

/** `{{inviter}} invited you to a {{template}} assessment` — the spec's subject, filled. */
export function invitationSubject(facts: InvitationFacts): string {
  return `${facts.inviter} invited you to a ${facts.template} assessment`;
}

export function invitationDocument(facts: InvitationFacts, body?: string): EmailDocument {
  const note = facts.note?.trim() ?? "";
  return {
    subject: invitationSubject(facts),
    preheader: `${facts.inviter} invited ${facts.counterparty} to answer ${facts.template}.`,
    blocks: [
      ...bodyBlocks(
        INVITATION_BODY,
        {
          inviter: facts.inviter,
          counterparty: facts.counterparty,
          template: facts.template,
          link: facts.link,
        },
        body,
      ),
      // The sender's own paragraph, before the mechanical sentences. `verbatim` and not
      // `paragraph`: a note keeps the line breaks the person typed, and a note re-flowed into one
      // block is not the shape they wrote.
      ...(note === ""
        ? []
        : [
            { kind: "paragraph" as const, text: `A note from ${facts.inviter}:` },
            { kind: "verbatim" as const, lines: note.split("\n") },
          ]),
      {
        kind: "paragraph",
        text: `${facts.inviter} has started an assessment called ${facts.template} and invited ${facts.counterparty} to answer it.`,
      },
      { kind: "paragraph", text: `Open your invitation: ${facts.link}` },
      {
        kind: "paragraph",
        text: "The link works once. Neither of you can see the other's answers until you have both answered and accepted them, and after that the answers are frozen.",
      },
    ],
  };
}
