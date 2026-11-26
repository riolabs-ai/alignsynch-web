-- 0045_invite_note.sql — the invitation's personal note (#1275, spec row APP-22).
--
-- A short note the Initiator drafts at Stage 5, carried to the person the invitation is addressed
-- to: the email prints it and the `/invite/<token>` join step quotes it back as *"A note from
-- {initiator}"*. Until this file there was nowhere to put one — Stage 5's column carried the
-- informational card "What you can do later" (`data/pages/assessment-create.ts::invite`), the
-- draft cookie is consumed by Stage 4's write, and `session_invite` held only the addressing and
-- the token's lifecycle.
--
-- **Why this table and not `relationship`.** The note is a fact about *an invitation*, not about a
-- pairing: it is what the person addressed was told when the link reached them. `session_invite` is
-- already the row `previewInvite()` joins and `readSessionBundle()` reads for the Initiator's own
-- screen, so both the recipient's step and the sender's preview read the note with no new join. The
-- row is one per session and is **updated, not replaced, by a re-invite** (`resendInvite()`
-- overwrites `token_hash`/`expires_at` on the same primary key), so a corrected address keeps the
-- note that went with it.
--
-- **Nullable, and an empty note is NULL rather than `''`.** The note is optional. Every writer goes
-- through `lib/flow/invite-note.ts::noteToStore()`, which normalises the text and answers `null`
-- for a note of nothing but whitespace — "no note" is one value, not two spellings of one.
--
-- **The CHECK is the ceiling, in characters.** `INVITE_NOTE_MAX` is 400 and the rule is counted in
-- code points in code and in characters here: Postgres `char_length()` counts characters, so the
-- two agree for an emoji, and the browser's `maxLength` is derived from the same constant. The
-- constraint is dropped-then-added so the file is idempotent — the shape `0023` and `0043` already
-- use for a re-declared CHECK.
--
-- **No `gap` column, no second table.** The note is text on an existing row: nothing joins to it,
-- nothing scores it, and `db:verify`'s party rules are untouched.

ALTER TABLE session_invite
  ADD COLUMN IF NOT EXISTS invite_note TEXT NULL;

ALTER TABLE session_invite
  DROP CONSTRAINT IF EXISTS session_invite_note_length;

ALTER TABLE session_invite
  ADD CONSTRAINT session_invite_note_length
    CHECK (invite_note IS NULL OR char_length(invite_note) <= 400);
