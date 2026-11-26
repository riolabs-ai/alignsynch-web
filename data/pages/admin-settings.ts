/**
 * `/admin/settings` — the integration directory's copy (#1443).
 *
 * Every word the screen prints lives here, and the rule the fixture encodes is the spec's: **a
 * number without a source is a defect**. So each counts line is a template with its placeholders
 * named, every badge is a word with its own id (a badge is a state, and a state is copy), and the
 * panel that draws a failure has a sentence of its own rather than reusing the empty state.
 *
 * **Three sentences that must never merge.** `not checked` (phase 2 has no probe), `not measured in
 * this deployment` (the census was not readable here) and `0 findings` (the census was read and
 * found nothing) are three different facts; the ids `valid`, `unmeasured` and `finding-none` keep
 * them apart on the screen and in review.
 *
 * **`values-note` is the load-bearing line.** The page is a directory of *where* things are, and
 * this is the one sentence that says the screen never reads or prints a value — it is printed once
 * above the cards, not repeated per row, because a warning beside every row is a warning nobody
 * reads.
 *
 * Nothing here is derived from a fixture at build time: the templates' placeholders are filled from
 * `SettingsDirectory`, so moving a count moves the sentence and no string on this page can disagree
 * with the table it describes.
 */
import { zPageCopy, type PageCopy } from "../../content/pages";

export const adminSettingsPageCopy: PageCopy = zPageCopy.parse({
  heading: "Settings",
  subtitle:
    "Every provider this deployment depends on: who the account is, whether each variable it owns is declared, in a store and fresh, and where a change happens. A directory of names, sources and dates — this screen never reads, prints or writes a value.",
  sections: [
    {
      id: "integrations",
      heading: "Integrations",
      body: "One card per account, ordered by what breaks first if it is wrong. Each row is a variable: the source it resolves from, and four badges — declared, present, fresh and valid — each derived from one table, never typed.",
      items: [
        { id: "provider-total", label: "{providers} providers" },
        {
          id: "variable-total",
          label:
            "{variables} variables · {declared} declared · {outOfScope} read outside this table",
        },
        {
          id: "card-counts",
          label:
            "{variables} variables · {present} in a store · {readable} vault keys readable · {stale} stale",
        },
        { id: "account-label", label: "Account" },
        { id: "console-label", label: "Console" },
        { id: "docs-label", label: "Documentation" },
        { id: "actor-label", label: "Credential holder" },
        { id: "tool-label", label: "Changed through" },
        { id: "boot-label", label: "Boot" },
        { id: "variables-heading", label: "Variables" },
        {
          id: "empty",
          label: "No variable in this table names this account.",
          body: "That is the correct reading for a provider configured outside this tree — Google's OAuth client lives in the Neon auth provider — and it is also what an unplaced row would look like, which is why a row with no provider fails the build rather than landing here.",
        },
        {
          id: "no-cards",
          label: "No provider is registered in data/integrations.ts.",
          body: "Every variable names a provider from that one file, so an empty directory means the registry itself could not be read — not that this deployment has no integrations.",
        },
        {
          id: "values-note",
          label:
            "Names, sources and dates only. A secret is never read, never printed and never written by this screen. The one value it can show is a governed non-secret setting, drawn in its own band below.",
        },
        { id: "unsplit", label: "one answer serves all three deployments" },
        { id: "split", label: "two answers, split by deployment" },
      ],
    },
    {
      id: "variable",
      heading: "What the badges mean",
      body: "Four badges, four sources, four dates. Declared, present and fresh come from the manifest, the store census and the rotation ledger; valid is what the census's vault walk answered about that name — readable, present and empty, or a store it could not read. A live check that the provider *accepts* the key is phase 2, and this screen never implies one ran.",
      items: [
        { id: "declared", label: "declared" },
        { id: "not-declared", label: "not a deployment value" },
        { id: "present", label: "present" },
        { id: "empty", label: "empty" },
        { id: "absent", label: "absent" },
        { id: "unknown", label: "no census entry" },
        { id: "fresh-current", label: "current" },
        { id: "fresh-stale", label: "stale" },
        { id: "not-measured", label: "not measured" },
        {
          id: "vault-readable",
          label: "readable",
          body: "The census's vault walk resolved this name on its recorded date. It says the secret is there and readable — it does not say the provider accepts it.",
        },
        {
          id: "vault-empty",
          label: "present, empty",
          body: "The vault holds the name and the value is empty — an absence a missing key would hide.",
        },
        {
          id: "vault-unreachable",
          label: "vault unread",
          body: "The census could not read the store for this name, or for the whole project. That is a fact about the token, not about the key.",
        },
        {
          id: "vault-absent",
          label: "not in the vault",
          body: "The census read the store and the name is not in it, which is the expected answer for a literal, a derived value or a platform variable.",
        },
        { id: "source-label", label: "Source" },
        { id: "column-name", label: "Variable" },
        { id: "column-source", label: "Source" },
        { id: "column-fresh", label: "Freshness" },
        { id: "column-valid", label: "Vault key" },
        { id: "requirement-label", label: "Required" },
        { id: "required", label: "required" },
        { id: "optional", label: "optional" },
        { id: "forbidden", label: "forbidden" },
        { id: "local", label: "local" },
        { id: "preview", label: "preview" },
        { id: "production", label: "production" },
      ],
    },
    {
      id: "census",
      heading: "The store census",
      body: "Where each name actually lands, read from the generated census rather than re-typed. It is a snapshot with its own date: the numbers below are true of that day, and the page prints the day beside them.",
      items: [
        { id: "recorded", label: "Recorded {at} — {names} names across {stores} stores." },
        {
          id: "unmeasured",
          label: "not measured in this deployment",
          body: "The census is generated by `pnpm env:matrix --write`, which needs a vault token and a Vercel session this deployment does not hold. This is not a table with no findings — no table was read.",
        },
        { id: "finding-row", label: "{finding}" },
        { id: "finding-count", label: "{count}" },
        { id: "finding-none", label: "0 findings", body: "The census was read and reported none." },
        {
          id: "vault-read",
          label: "{secrets} vault secret(s) readable on that day",
          body: "The census's own project-level line. It is the evidence behind every `readable` badge on this page.",
        },
        {
          id: "vault-unmeasured",
          label: "the vault was not read by that census",
          body: "A census written without a vault line is not a census that read zero secrets — it is a census that could not read the store, so every vault badge on this page reads `vault unread`.",
        },
        { id: "undeclared-heading", label: "In a store, declared by no row" },
        { id: "undeclared-empty", label: "Every name a store holds is declared by a row." },
        { id: "census-path", label: "docs/operations/env-stores.md" },
      ],
    },
    {
      id: "ledger",
      heading: "The rotation ledger",
      body: "When each credential set last changed — dates and the names they govern, never a value. A name the ledger governs is fresh only when the census was recorded at or after that change, so a snapshot older than a rotation reads stale rather than current.",
      items: [
        { id: "changed", label: "Changed {at}" },
        { id: "governs", label: "{variables} variables governed" },
        { id: "governs-none", label: "No name in this table" },
        { id: "ledger-none", label: "No rotation set is recorded in this tree." },
        { id: "ledger-path", label: "data/env/rotations.json" },
      ],
    },
    {
      id: "governance",
      heading: "Settings an admin may change without a deploy",
      body: "Four deployment variables can be stored here and win over the application's default. One rule decides which answer is used, and it is never inverted: the deployment's environment variable first, then a stored value, then the default in code. The two rows under them are read before a process serves a request or when the tree is built, so a stored value could never be obeyed — they say so instead of offering a field that would lose.",
      items: [
        {
          id: "precedence",
          label: "env > setting > default",
          body: "An environment variable always wins. A stored value wins over the default in code and loses to the environment.",
        },
        { id: "source-env", label: "environment" },
        { id: "source-setting", label: "stored setting" },
        { id: "source-default", label: "default" },
        {
          id: "env-wins",
          label: "shadowed by env",
          body: "The environment also carries this variable, so the environment's value is the one in use. A save here is recorded in the audit log and changes nothing this deployment renders until the variable is removed.",
        },
        { id: "writable", label: "writable" },
        {
          id: "fixed",
          label: "not writable at runtime",
          body: "Read before the process serves a request, or when the tree is built. A stored value could not reach the reader, so this row refuses rather than promising an override that would lose.",
        },
        { id: "current-label", label: "Current value" },
        { id: "field-label", label: "{key}" },
        { id: "read-by", label: "Read by {where}" },
        { id: "stored", label: "Stored: {value}" },
        { id: "not-stored", label: "No stored value — the default or the environment answers." },
        { id: "save", label: "Save" },
        { id: "clear", label: "Clear stored value" },
        {
          id: "none",
          label: "No governed setting is registered in this tree.",
          body: "The registry in `lib/admin/settings/governed.ts` is the whole list, so an empty one means the module could not be read — not that this deployment has nothing an admin can set.",
        },
        {
          id: "env-wins-note",
          label:
            "An edit to a shadowed row is refused by nothing and changes nothing — the environment still wins.",
        },
        {
          id: "store-absent",
          label: "No setting store in this deployment, so nothing can be stored here yet.",
          body: "The table exists once the migration has run against this deployment's database. Until then the precedence is the same rule with the middle arm empty: env > default.",
        },
        {
          id: "store-unmigrated",
          label: "The setting table is not in this database yet.",
          body: "`pnpm db:migrate` applies it. Until then nothing is stored, so env > default is what every reader resolves.",
        },
        {
          id: "store-unreadable",
          label: "The setting table could not be read: {reason}",
          body: "A value is never resolved from a partial read, so the values below are the environment's and the code's — nothing stored is being obeyed. A save will fail until the store answers again.",
        },
        { id: "saved", label: "{key} saved. The audit log carries the value it replaced." },
        { id: "cleared", label: "{key} cleared. The environment or the default answers now." },
        {
          id: "refused-vault-sourced",
          label: "That key is a secret. Settings never store or return one.",
        },
        { id: "refused-unknown-key", label: "That name is not a governed setting." },
        {
          id: "refused-fixed-by-deployment",
          label: "That setting cannot be overridden at runtime. The reason is on its row.",
        },
        { id: "refused-invalid-value", label: "That value is not one this setting accepts." },
      ],
    },
    {
      id: "change",
      heading: "Where a change happens",
      body: "Computed from the source, so the answer moves with the table. A secret's change is a pull request or a provider console; the governed non-secret settings above are the only ones this screen writes.",
      items: [
        {
          id: "vault",
          label: "vault — the Bitwarden project alignsynch-web, then `pnpm env:sync`",
        },
        { id: "literal", label: "literal — a pull request to scripts/env-manifest.ts" },
        { id: "derived", label: "derived — nothing to change; the value is computed at render" },
        {
          id: "carried",
          label: "carried — this environment's own file, written by `neon env pull`",
        },
        { id: "default", label: "no source — the application's own default, in code" },
        { id: "mixed", label: "two answers — each deployment's own, named on the row" },
      ],
    },
    {
      id: "unreadable",
      heading: "The sources could not be read",
      body: "This screen renders three committed sources. This request did not get them, so no count below was guessed, reused or rendered as a zero.",
      items: [{ id: "reason-label", label: "{reason}" }],
    },
  ],
});
