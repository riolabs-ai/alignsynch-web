/**
 * The invitation's personal note (#1275) — one short paragraph, plain text, in the Initiator's own
 * words, carried to the person the invitation is addressed to.
 *
 * **Why this is a module and not a `maxLength` on a textarea.** A `maxLength` is a browser
 * courtesy: the note reaches three surfaces that never see the form — the `session_invite` row, the
 * invitation mail, and the recipient's `/invite/<token>` step — and two of them are written from the
 * row rather than from the post. So the rule that decides what a note *is* has one home (here), the
 * two writers call it (`saveInviteNote()` for the draft, `sendDraftInvitation()` for the mail), and
 * the browser attribute is derived from the same constant rather than typed beside it.
 *
 * **Plain text, and that is a promise the mail keeps too.** The note is not markdown and not HTML:
 * the band composes every mail's text first and derives the HTML from it (`lib/email/band.ts`), so a
 * note full of `<b>` reaches the recipient as the characters the person typed. Nothing here
 * escapes, and nothing here interprets — the render is React's (the join step) and the band's (the
 * mail), both of which print text as text.
 *
 * **Length is counted in characters a person sees**, not in UTF-16 units: `[...note].length` is code
 * points, so an emoji is one character, and it agrees with the `char_length()` CHECK the migration
 * puts on the column. A cap measured two ways is a cap that refuses a note the database would take.
 */

/**
 * The ceiling, in characters — about four lines of prose in the stage's textarea.
 *
 * Short on purpose: a note that needs more than a paragraph is the relationship's own title and
 * summary, and the invitation already carries those. It is one constant so the textarea's
 * `maxLength`, the refusal sentence's `{max}`, and the column's CHECK cannot drift apart.
 */
export const INVITE_NOTE_MAX = 400;

/**
 * Why a note was refused, as a code rather than a sentence.
 *
 * `too-long` is the only one, and it is reachable only by a post that ignored the browser's own
 * `maxLength` — a crafted one, or a note the schema trimmed into a different shape. There is no
 * `required`: the note is optional, and a blank one is `null` on the row, never a refusal.
 */
export const INVITE_NOTE_PROBLEMS = ["too-long"] as const;

export type InviteNoteProblem = (typeof INVITE_NOTE_PROBLEMS)[number];

/** The control characters a note may keep: tab and newline. Everything else is dropped. */
const NOTE_KEEPS_CONTROL = new Set([0x09, 0x0a]);

/**
 * Drop every control character except tab and newline.
 *
 * A loop rather than a regex range, because `biome`'s `noControlCharactersInRegex` refuses the
 * `[\u0000-\u001f]` spelling — and it is right to: a control character in a pattern is almost always
 * a mis-typed escape. The rule is stated as the character set it is, and `for…of` walks code points
 * so an emoji survives whole.
 */
function withoutControlCharacters(value: string): string {
  let kept = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x7f) continue;
    if (code < 0x20 && !NOTE_KEEPS_CONTROL.has(code)) continue;
    kept += character;
  }
  return kept;
}

/**
 * The note as it is stored: one line ending, no control characters, no runaway blank runs.
 *
 * **Normalised on the way in, so every reader sees the same text.** The value is compared, printed
 * and mailed; a note stored with `\r\n` would break the mail's line reading (`lib/email/body.ts`
 * splits on `\n`) and a note stored with a trailing newline would draw an empty line in the
 * recipient's blockquote. Tabs survive — a person may indent a list — but every other control
 * character is dropped rather than stored and escaped later.
 *
 * `trim()` runs last so a note of nothing but whitespace is `""`, which every writer stores as
 * `null`: an empty note is an absent note, never an empty paragraph.
 */
export function plainNote(raw: string): string {
  return withoutControlCharacters(raw.replace(/\r\n?/g, "\n"))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Is this (already plain) note inside the ceiling? `null` means it may be stored. */
export function noteProblem(note: string): InviteNoteProblem | null {
  return [...note].length > INVITE_NOTE_MAX ? "too-long" : null;
}

/**
 * The note a writer should store, or the reason it may not.
 *
 * One call for both writers, so a note the stage accepted cannot be refused by the send: the two run
 * the same normalisation over the same ceiling, and the only difference between them is *when* the
 * write happens — the stage while it is still a draft, the send as it publishes.
 */
export function noteToStore(
  raw: string,
):
  | { readonly ok: true; readonly note: string | null }
  | { readonly ok: false; readonly problem: InviteNoteProblem } {
  const note = plainNote(raw);
  const problem = noteProblem(note);
  if (problem !== null) return { ok: false, problem };
  return { ok: true, note: note === "" ? null : note };
}
