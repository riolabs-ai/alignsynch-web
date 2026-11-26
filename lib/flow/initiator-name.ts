/**
 * **The Initiator's own name, as a default rather than a question (#1360).**
 *
 * Stage 1 asks for both halves of the Initiator's name and, until this card, asked a signed-in
 * member to retype them every time they started a relationship. The founder's report is the whole
 * requirement — *"User would expect default it in from my profile, but leave it editable"* — and
 * `docs/specs/flow-stages.md` → *Stage 1, Details* is where that rule now lives.
 *
 * Two facts decide what the default is, and both are read here rather than in the form:
 *
 *   - **which name.** `user_profile.display_name` when the person has saved a profile, else the
 *     name the auth provider holds, else nothing. That is the chain the shell's header already
 *     resolves (`lib/auth/shell-account.ts::shellAccountOf`), minus its last resort: the header can
 *     fall back to the email's local part because a monogram needs *something*, and this prefill
 *     must not, because `walt21` is not a person's first name and a wrong name in an editable field
 *     is worse than an empty one the person fills in themselves.
 *   - **how it splits.** The form asks for first and last separately, so one display name becomes
 *     two halves: the first word is the first name and **everything after it is the last name**,
 *     because a surname is not one word (`de la Cruz`) and a `split(" ")[1]` silently loses half of
 *     it.
 *
 * **Pure, and that is the contract.** No `fs`, no `@/lib/db/**`, no `next/*`: the page reads the
 * profile row and hands it here, so `tests/stage-one-name-prefill.test.tsx` can drive every branch
 * without a database, a cookie store or a request — and the client component that draws the fields
 * can hold the resulting pair without importing a module that reaches `pg` (E34).
 *
 * The default is only ever a **default**. Nothing here decides that an answer loses to it: the
 * field component seeds its own state from this pair at mount and never re-applies it, which is
 * what makes an edit outrank the prefill on every later render.
 */
import type { NameParts } from "@/lib/flow/names";

/** Nothing to prefill: a visitor, or a member whose account holds no name at all. */
export const NO_INITIATOR_NAME: NameParts = { first: "", last: "" };

/**
 * One display name → the two halves the form asks for.
 *
 * Whitespace is collapsed before the split, so `"  Walt   de la   Cruz  "` is `Walt` / `de la Cruz`
 * rather than a last name carrying the padding it was typed with. A single word is a first name and
 * an empty last — the last half is the one the form treats as optional, and a blank first name would
 * read as "no name" to the required-field refusal that guards it.
 */
export function namePartsOf(displayName: string): NameParts {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
  const [first, ...rest] = words;
  if (first === undefined) return NO_INITIATOR_NAME;
  return { first, last: rest.join(" ") };
}

/**
 * The Initiator's prefilled pair, from a session and (optionally) the profile row read for it.
 *
 * Structural in and out — `{ name }` and `{ displayName }` are all it reads — so a caller passes
 * `SessionUser` / `UserProfile` as they are and a test passes two words. **A visitor gets nothing**:
 * no session means no profile to read and no name to default from, which is how the signed-out path
 * stays exactly what it was.
 */
export function initiatorNameFor(
  user: { readonly name: string } | null,
  profile: { readonly displayName: string } | null,
): NameParts {
  if (user === null) return NO_INITIATOR_NAME;
  const preferred = (profile?.displayName ?? "").trim();
  if (preferred !== "") return namePartsOf(preferred);
  return namePartsOf(user.name);
}
