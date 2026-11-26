"use client";

// template-ancestor: components/assessment-flow/create-relationship.tsx   (variation: the last stage is one column of one act — a four-step walk whose last step is the send — instead of a payment walk gated against a send card beside it)

/**
 * `StageInvite` — stage 5, **Invite** (#825), with the act at the end of the walk (#1014) and the
 * invitation's personal note in the column beside it (#1275).
 *
 * **Why this is a client component.** It owns the two facts the column and the walk both read: the
 * membership is live, which is what opens the act, and the note, which is text being drafted. Both
 * have to live where both surfaces can see them, and the alternative — a server-rendered column
 * with a client panel beside it — could only be gated by a second request per keystroke.
 *
 * **The act is inside the walk (#1014).** This stage used to draw the send in the right column and a
 * `Continue as Draft` link under it, while the walk's thank-you carried a sentence telling the
 * reader that the control was *beside* the walk. The card put both controls in the walk's last step
 * and removed that sentence: one act, one control, on the surface that earned it. What is left in
 * the column is what the column was for — what the recipient will read, the plan that was carried,
 * and the two sentences that make keeping a draft safe to choose.
 *
 * **The note is drafted here and stored on the invitation (#1275).** It is the one field on this
 * stage whose value is prose rather than a choice, so it is the one field that has to survive a
 * reload on its own: `initialNote` is the row's value (read by the page through `readFlowScreen()`,
 * never a cookie — the create's draft cookie was consumed when stage 4 wrote the relationship), and
 * every committed gesture writes it back through `POST /assessment/instances/<id>/note`. The send
 * then mails what the row holds, so the mailbox and the recipient's page quote one value.
 *
 * **Nothing typed is lost by pressing send.** `flushNote()` is handed to the walk as
 * `onBeforeSend` and awaited before its POST: the debounce exists to keep the endpoint honest, not
 * to make a person wait for it, and a note saved a moment ago is already `savedNote` and costs
 * nothing to re-check.
 *
 * **The gate is real, and it is enforced twice.** In the walk, the act is one step past the
 * thank-you and the thank-you is only reachable once the membership is live, so an unpaid walk has
 * no send control to press at all. On the server, `sendDraftInvitation()` refuses a relationship
 * whose Initiator holds no live membership (`no-payment-method`) and `saveInviteNote()` refuses a
 * note from anybody who is not the Initiator. The first half is the courtesy — a person should
 * never be offered an act that will be refused — and the second is the rule: a crafted POST cannot
 * publish an unpaid draft or annotate somebody else's invitation.
 *
 * **The foot carries no advance.** Stages 1–4 advance from the foot; stage 5's advance *is* the
 * walk's last step, which is the whole of #1014. `Back` and `Cancel` stay where the foot's shape
 * puts them.
 *
 * Every reader-visible word is `data/pages/assessment-create.ts` (`invite`, `review`) — E23 counts
 * what a component writes, and this one writes none. The note's own text is the person's, and it is
 * printed the way they typed it.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { PageCopy } from "@/content/pages";
import { billingPlan } from "@/data/billing-plans";
import type { CreateDraft } from "@/lib/flow/create-draft";
import { INVITE_NOTE_MAX, plainNote } from "@/lib/flow/invite-note";
import type { CarriedPlan } from "@/lib/flow/plan-intent";
import { inviteNotePath, PRICING_PATH } from "@/lib/flow/paths";
import { fillLabel, itemLabel, sectionOf } from "@/lib/page-copy";
import { type CheckoutHandlers, InviteWalk } from "./invite-walk";
import { StageFoot } from "./stage-foot";

const CARD =
  "space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900";
const HEADING = "text-lg font-semibold text-gray-900 dark:text-gray-100";
const SMALL = "text-xs text-gray-600 dark:text-gray-300";
const LABEL = "text-sm font-medium text-gray-900 dark:text-gray-100";
/**
 * The field — the same control anatomy the flow's other text inputs use (`w-full`, `min-w-0`,
 * `border-gray-300`), sized for prose rather than for a name: four rows, and a line break the
 * browser keeps.
 */
const NOTE_FIELD =
  "w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";

/** How long after the last keystroke the note is written, when the field has not been left yet. */
const NOTE_SAVE_DELAY_MS = 700;

/** What the field's status line is saying — one state, drawn once. */
type NoteState = "idle" | "saving" | "saved" | "failed";

export function StageInvite({
  copy,
  draft,
  sessionRecordId,
  relationshipId,
  initialNote,
  initialPaid,
  planIncluded,
  carriedPlan,
  checkout,
  trialEndsAt,
  backHref,
  cancelHref,
  cancelLabel,
}: {
  copy: PageCopy;
  draft: CreateDraft;
  /** The session stage 4 wrote the relationship from — the send posts to its own address. */
  sessionRecordId: string;
  /**
   * The relationship's own row id — what the membership addresses, and where the walk lands.
   *
   * The send addresses the **session** (`?instance=`), the membership addresses the
   * **relationship**, and handing the membership the session's record id is a refusal the person
   * reads as a broken card form: the membership acts answer "no relationship holds the id". Two
   * ids, two jobs — and both end the walk on the relationship's own screen.
   */
  relationshipId: string;
  /**
   * #1275 — the note the invitation row already holds, or `null`/absent for none.
   *
   * The page reads it through `readFlowScreen()` (`screen.invite.note`), so this is the stored
   * value rather than anything this browser remembers: a reload, a Back, or a different device
   * arrives with the same paragraph in the field.
   */
  initialNote?: string | null;
  /**
   * The membership is already live — the returning state. A person who paid and came back lands on
   * the thank-you with the act one press away, instead of being asked to pay twice.
   */
  initialPaid?: boolean;
  /** What the account's plan already covers (#870) — the walk's plan panel reads it. */
  planIncluded?: { readonly name: string; readonly entitled: boolean };
  /**
   * The plan chosen on `/pricing`, measured by the page from the carried cookie (#1043). The walk
   * opens with that row selected; absent means nothing was carried and the panel is the choice.
   */
  carriedPlan?: CarriedPlan;
  /** The server's membership actions. Absent in a render-only test. */
  checkout?: CheckoutHandlers;
  /**
   * **The trial's end, as the page measured it** (#1115).
   *
   * The instant `trialStateOf()` read for the creating account, handed through untouched so the
   * walk can print it as a date. Its presence is what makes the walk the card-free create panel:
   * the create path supplies no `checkout`, so no stage of this flow can reach the adapter.
   */
  trialEndsAt?: string;
  backHref: string;
  cancelHref: string;
  cancelLabel: string;
}) {
  const invite = sectionOf(copy, "invite");
  const draftFact = sectionOf(copy, "review");
  /** The preview's values, trimmed once: the draft is raw form text, never a normalised row. */
  const counterpartyFirst = draft.counterpartyFirst.trim();
  const initiatorFirst = draft.initiatorFirst.trim();
  /** A blank row is worse than a dash — the copy file's own rule for the review column. */
  const none = itemLabel(draftFact, "none");

  const [paid, setPaid] = useState(initialPaid === true);

  /**
   * The note, and the value the row is believed to hold.
   *
   * Two states rather than one, because "is this dirty?" is the question the debounce and the send
   * both ask: `note` is what the person is looking at, `savedNote` is what the last successful
   * write stored (normalised by the server, so the comparison runs the same `plainNote()` the
   * server ran). Comparing against `initialNote` alone would mark a note dirty the first time
   * somebody typed a trailing space.
   */
  const [note, setNote] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(plainNote(initialNote ?? ""));
  const [noteState, setNoteState] = useState<NoteState>("idle");

  /**
   * Write the field's current value, and answer whether the row now holds it.
   *
   * A refusal is drawn, not thrown: the endpoint answers a code (`not-initiator`,
   * `already-published`, `too-long`) and the field prints the one sentence this fixture gives it,
   * because a person who has just typed two sentences needs to know they are not stored — not which
   * HTTP status said so.
   */
  const persistNote = useCallback(
    async (value: string): Promise<boolean> => {
      // A stage rendered without a session (`relationshipId` absent, a refusal screen, a
      // render-only test) has no row to annotate; the send is refused elsewhere, and a POST to an
      // empty id would be a request to a screen that does not exist.
      if (sessionRecordId === "") return true;
      setNoteState("saving");
      try {
        const response = await fetch(inviteNotePath(sessionRecordId), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: value }),
          credentials: "same-origin",
        });
        const answer = (await response.json().catch(() => null)) as {
          readonly ok?: boolean;
          readonly note?: string | null;
        } | null;
        if (!response.ok || answer?.ok !== true) {
          setNoteState("failed");
          return false;
        }
        setSavedNote(plainNote(answer.note ?? ""));
        setNoteState("saved");
        return true;
      } catch {
        // The request never reached the app: nothing was stored, and the field says so rather than
        // pretending the paragraph is safe.
        setNoteState("failed");
        return false;
      }
    },
    [sessionRecordId],
  );

  /**
   * The quiet save. Seven hundred milliseconds after the last keystroke, the note goes; the timer
   * is cleared by the next keystroke, so a paragraph costs one write rather than one per character.
   * A clean field schedules nothing at all.
   */
  useEffect(() => {
    if (plainNote(note) === savedNote) return;
    const timer = setTimeout(() => {
      void persistNote(note);
    }, NOTE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [note, savedNote, persistNote]);

  /**
   * **The send's guard, handed to the walk** (#1275). The walk awaits this before its POST, so a
   * note typed in the last few hundred milliseconds is stored before the invitation that carries it
   * goes out — and a write that fails stops the send with a sentence instead of mailing an
   * invitation the sender had already edited.
   */
  const flushNote = useCallback(async (): Promise<boolean> => {
    if (plainNote(note) === savedNote) return true;
    return persistNote(note);
  }, [note, savedNote, persistNote]);

  const noteText = note.trim();
  const noteSaved = plainNote(note) === savedNote && savedNote !== "";

  return (
    <>
      {/* One column at 390, in the order the decision needs: the plan, the card, the thank-you, the
          act — then what the recipient reads, and the sentences that make the draft a real choice. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <InviteWalk
          copy={copy}
          sessionRecordId={sessionRecordId}
          relationshipId={relationshipId}
          paid={paid}
          onPaid={() => setPaid(true)}
          onBeforeSend={flushNote}
          {...(checkout === undefined ? {} : { checkout })}
          {...(planIncluded === undefined ? {} : { planIncluded })}
          {...(carriedPlan === undefined ? {} : { carriedPlan })}
          {...(trialEndsAt === undefined ? {} : { trialEndsAt })}
        />

        <aside className="space-y-5">
          {/*
            The reference's **What {name} Sees** panel (v2 rectification, bundle 01-wizard).
            A person pressing send is deciding what a second person will read, so the panel states
            the facts the invitation carries — from whom, about what, to which address — and, since
            #1275, the note itself, quoted as it will be read. The email's own subject and body stay
            in `lib/email/templates/`, because a preview that spelled them again is the copy that
            drifts first. Every word is `data/pages/assessment-create.ts` (`invite`), and every value
            is the draft's or the field's.
          */}
          <section aria-labelledby="create-invite-preview-heading" className={CARD}>
            <h2 id="create-invite-preview-heading" className={HEADING}>
              {counterpartyFirst === ""
                ? itemLabel(invite, "preview-heading-unnamed")
                : fillLabel(itemLabel(invite, "preview-heading"), { name: counterpartyFirst })}
            </h2>
            <p className={SMALL}>{itemLabel(invite, "preview-body")}</p>
            <ul className="space-y-1">
              <li className={SMALL}>
                {fillLabel(itemLabel(invite, "preview-from"), {
                  name: initiatorFirst === "" ? none : initiatorFirst,
                })}
              </li>
              <li className={SMALL}>
                {fillLabel(itemLabel(invite, "preview-title"), {
                  title: draft.title.trim() === "" ? none : draft.title.trim(),
                })}
              </li>
              <li className={SMALL}>
                {fillLabel(itemLabel(invite, "preview-to"), {
                  email: draft.email.trim() === "" ? none : draft.email.trim(),
                })}
              </li>
            </ul>
            {/* #1275 — the paragraph the recipient will read, under a caption that says whose it
                is. The field below is what writes it, and this is what it will look like: the two
                are one gesture apart, so a sender never has to imagine the result. */}
            {noteText === "" ? null : (
              <figure data-preview-note="true" className="border-l-2 border-gray-200 pl-3">
                <blockquote className="whitespace-pre-line text-sm text-gray-800 dark:text-gray-200">
                  {note}
                </blockquote>
                <figcaption className={`mt-1 ${SMALL}`}>
                  {itemLabel(invite, "preview-note-caption")}
                </figcaption>
              </figure>
            )}
          </section>

          {/*
            #1127 — **the plan the reader chose on `/pricing`, stated once on the stage that sells.**
            The v2 bundle draws this as a chip beside the invite action: the tier's own name from
            `data/billing-plans.ts`, the one sentence that says when it starts and what it costs
            (nothing, until a card is added), and a way back to change the choice. Drawn only when
            a plan was actually carried — a stage that printed "no plan" would be a question the
            visitor already answered.
          */}
          {carriedPlan === undefined ? null : (
            <section
              aria-labelledby="create-invite-plan-heading"
              className={CARD}
              data-plan-chip={carriedPlan.planId}
            >
              <h2 id="create-invite-plan-heading" className={SMALL}>
                {fillLabel(itemLabel(invite, "plan-chip"), {
                  plan: billingPlan(carriedPlan.planId)?.name ?? carriedPlan.planId,
                })}
              </h2>
              <Link
                className="text-xs font-semibold text-action underline underline-offset-4"
                href={PRICING_PATH}
              >
                {itemLabel(invite, "plan-change")}
              </Link>
            </section>
          )}

          {/*
            #1275 — **the note.** This card used to say "What you can do later" and offer nothing
            to do; the issue behind it (APP-22) is that the invitation is the one place a person can
            say why, in their own words, and it had no field. The heading names the recipient, the
            body says the three things a person deciding needs (optional, theirs, carried on both
            surfaces), and the field writes as it goes.

            The counter and the status share one line so the card does not grow a second paragraph
            for a number: `{count} of {max}` while typing, `Saving…`/`Saved` once the write is
            underway or done, and the refusal sentence in that same place when it failed.
          */}
          <section aria-labelledby="create-invite-note-heading" className={CARD}>
            <h2 id="create-invite-note-heading" className={HEADING}>
              {counterpartyFirst === ""
                ? itemLabel(invite, "note-heading-unnamed")
                : fillLabel(itemLabel(invite, "note-heading"), { name: counterpartyFirst })}
            </h2>
            <p className={SMALL}>
              {fillLabel(itemLabel(invite, "note-body"), {
                name: counterpartyFirst === "" ? none : counterpartyFirst,
              })}
            </p>
            <label htmlFor="create-invite-note" className={LABEL}>
              {itemLabel(invite, "note-label")}
            </label>
            <textarea
              id="create-invite-note"
              data-invite-note-field="true"
              data-note-state={noteState}
              className={NOTE_FIELD}
              rows={4}
              maxLength={INVITE_NOTE_MAX}
              placeholder={itemLabel(invite, "note-placeholder")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => {
                // Leaving the field is a committed gesture: the debounce is a convenience, not the
                // contract, so a blur writes immediately rather than waiting out the timer.
                if (plainNote(note) !== savedNote) void persistNote(note);
              }}
              aria-describedby="create-invite-note-status"
            />
            <p id="create-invite-note-status" className={SMALL} role="status">
              {noteState === "failed" ? (
                <span className="text-red-600 dark:text-red-400">
                  {itemLabel(invite, "note-refused")}
                </span>
              ) : (
                <>
                  {/* The counter is always drawn: it is the field's own measurement, and the one
                      number a person writing to a ceiling needs before they reach it. */}
                  <span data-note-count={[...plainNote(note)].length}>
                    {fillLabel(itemLabel(invite, "note-count"), {
                      count: String([...plainNote(note)].length),
                      max: String(INVITE_NOTE_MAX),
                    })}
                  </span>
                  {noteState === "saving" ? (
                    <span className="ml-1">{itemLabel(invite, "note-saving")}</span>
                  ) : noteSaved && noteState === "saved" ? (
                    <span className="ml-1">{itemLabel(invite, "note-saved")}</span>
                  ) : null}
                </>
              )}
            </p>
          </section>

          {/* The three sentences that make keeping a draft safe to choose, as a footnote block —
              they were the "What you can do later" card's body, and they are about the draft
              control in the walk's foot rather than about the note, so the note's heading does not
              sit above them any more. */}
          <div className={CARD} data-draft-facts="true">
            <p className={SMALL}>{itemLabel(invite, "reassure")}</p>
            <p className={SMALL}>{itemLabel(invite, "draft-help")}</p>
            <p className={SMALL}>
              {itemLabel(invite, "sent-to")} {draft.email.trim() || itemLabel(draftFact, "none")}
            </p>
          </div>
        </aside>
      </div>

      <StageFoot
        backHref={backHref}
        backLabel={itemLabel(invite, "back")}
        cancelHref={cancelHref}
        cancelLabel={cancelLabel}
      />
    </>
  );
}
