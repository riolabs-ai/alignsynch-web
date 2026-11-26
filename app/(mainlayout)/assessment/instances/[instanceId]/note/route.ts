/**
 * `POST /assessment/instances/[instanceId]/note` — Stage 5's personal note, saved as it is
 * drafted (#1275).
 *
 * **Why a write of its own, when the send already exists.** The note is the one thing on Stage 5
 * that is the Initiator's own prose rather than a choice from a catalogue, and a paragraph typed
 * into a field that only reached the server with the send would be lost by a reload, a Back, or a
 * closed tab — the same defect `lib/flow/create-draft.ts` was written to prevent for stages 1–3. So
 * the field saves on its own committed gesture, the stage reads it back from the row on every
 * render, and the send then mails what the row holds rather than a second copy that travelled in a
 * post body.
 *
 * **The endpoint carries no identity, exactly as `/send` does not.** Who is asking is resolved
 * inside `saveInviteNote()` from this browser's `flow_party_*` token and then the signed-in account;
 * the body carries one field (`note`) and a crafted one can only annotate a draft this browser
 * already answers as the Initiator of.
 *
 * **JSON in, JSON out, and that is the point.** This is an annotation on a client surface — the
 * field keeps focus and the page does not move — where the send is a navigation. The reply is
 * `{ ok, note }` on success, or a refusal code with the same shape the walk already renders
 * (`toast`/`band` is not needed: the field draws one sentence of its own).
 *
 * A refusal is a code, never a sentence: the words are `data/pages/assessment-create.ts` (`invite`),
 * counted by E23, and composed by `components/assessment-flow/stage-invite.tsx`.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUserIfConfigured } from "@/lib/auth/session";
import { partyTokensFrom } from "@/lib/flow/session";
import { INVITE_NOTE_REFUSALS, saveInviteNote } from "@/lib/flow/store";

/** The body this endpoint accepts. Anything else is a `400`, never a coercion. */
interface NoteBody {
  readonly note?: unknown;
}

/** The status each refusal deserves: who may not write is 403, which state is 409. */
const REFUSAL_STATUS: Record<string, number> = {
  "not-initiator": 403,
  "no-invitation": 404,
  "already-published": 409,
  "too-long": 400,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> },
): Promise<Response> {
  const { instanceId } = await params;

  let body: NoteBody;
  try {
    body = (await request.json()) as NoteBody;
  } catch {
    return NextResponse.json({ ok: false, code: "body" }, { status: 400 });
  }
  if (typeof body.note !== "string") {
    return NextResponse.json({ ok: false, code: "body" }, { status: 400 });
  }

  const jar = await cookies();
  const viewer = await currentUserIfConfigured();

  const saved = await saveInviteNote({
    sessionRecordId: instanceId,
    raw: body.note,
    viewerTokens: partyTokensFrom(jar),
    viewerUserId: viewer?.userId ?? null,
  });

  if (!saved.ok) {
    // The vocabulary is the store's; this map only says which status carries it. A code the map
    // has not met is a `409` and still names itself rather than becoming an "unknown error".
    const known = (INVITE_NOTE_REFUSALS as readonly string[]).includes(saved.code);
    return NextResponse.json(
      { ok: false, code: saved.code },
      { status: known ? (REFUSAL_STATUS[saved.code] ?? 409) : 409 },
    );
  }

  return NextResponse.json({ ok: true, note: saved.note });
}
