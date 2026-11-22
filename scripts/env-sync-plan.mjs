/**
 * The decisions `scripts/env-sync.mjs` makes, as pure functions.
 *
 * The script itself talks to Vercel at module scope (it awaits `manifestMode()` on import), so a
 * test cannot import it. These four things are the whole of the policy it applies — which keys may
 * never be synced, which rows `--prune` may delete, when `--prune` must refuse, and what a prune
 * says while it runs — and they are the part worth holding still with a case. The network stays in
 * the script; a caller passes its own `request`.
 *
 * Nothing here reads a clock, a file, an argument vector or a value: `pruneRefusal` takes the flags
 * it judges, `planPrune` takes the table rows and the target's entries, and `pruneTarget` takes the
 * request function. That is what lets `tests/env-sync-prune.test.ts` state the rule without a mock
 * of the Vercel API, and what keeps a value out of every line this file prints.
 */

/**
 * Keys that must never be synced to a preview/demo target, even when the file carries
 * them. The value is the reason printed beside the decision, so the argument is visible
 * where the rule fires instead of living only in this comment.
 *
 *   ADMIN_EMAILS — the console's operator allowlist. A demo target is signed into by demo
 *   identities and shown to whoever is being shown the product; inheriting the real
 *   operators' addresses would put a working console account behind a demo login. The
 *   demo carries its own allowlist, or none.
 */
export const NEVER_PREVIEW = new Map([
  ["ADMIN_EMAILS", "operator allowlist — a demo target must not admit the real operators"],
]);

/**
 * Never app configuration, at any target. Each entry is a local tool credential or a
 * stray field from a pasted curl. Syncing one hands the deployment a credential the app
 * does not use, and hides a real configuration mistake behind a key that looks set.
 *
 *   VERCEL_OIDC_TOKEN        minted per deployment by Vercel for the build to call Vercel
 *                            APIs. A copy in a local file is a captured, short-lived
 *                            credential — stale by the next deploy, and a secret the
 *                            deployment already mints for itself.
 *   BWS_ACCESS_TOKEN         Bitwarden Secrets Manager token: a local tool credential.
 *                            The deployment reads its secrets from Vercel, not Bitwarden,
 *                            so nothing there has a consumer for it.
 *   STRIPE_TEST_WEBHOOK_URL  the Stripe dashboard owns the endpoint URL and the app reads
 *                            only the signing secret. Syncing the URL lets a local value
 *                            silently disagree with the endpoint Stripe posts to.
 *   client_id, client_secret, scope, grant_type
 *                            request parameters from an OAuth token exchange that was
 *                            pasted into a scratch file as a curl. They are not app env,
 *                            and encrypted they would look like configuration.
 */
export const NEVER_AT_ALL = new Map([
  ["VERCEL_OIDC_TOKEN", "minted per deployment — a local copy is stale, not config"],
  ["BWS_ACCESS_TOKEN", "Bitwarden access token — a local tool credential"],
  ["STRIPE_TEST_WEBHOOK_URL", "Stripe owns the endpoint URL; the app reads the signing secret"],
  ["client_id", "OAuth parameter left over from a pasted curl — never app env"],
  ["client_secret", "OAuth parameter left over from a pasted curl — never app env"],
  ["scope", "OAuth parameter left over from a pasted curl — never app env"],
  ["grant_type", "OAuth parameter left over from a pasted curl — never app env"],
]);

/**
 * Why a `--prune` run must not proceed, or `null` when it may.
 *
 * `--prune` deletes rows off a live target, so it carries the same two guards as a value write
 * and one more of its own:
 *
 *   - it is manifest-only. The table is what marks a row `forbidden` for an environment; a bare
 *     `--from <file>` knows nothing about that, so there is no safe name set to delete from.
 *   - it is a writer. Without `--write` the run is a check and deletes nothing — a flag that
 *     removes a production signing secret from a preview scope must never be the accident of a
 *     forgotten `--check`.
 *   - `--target production` additionally needs `--confirm-production`, exactly as the value write
 *     does, because the live project's environment is the one mistake a typo makes expensive.
 *
 * @param {object} flags
 * @param {boolean} flags.prune
 * @param {boolean} [flags.write]
 * @param {string} [flags.target]
 * @param {boolean} [flags.confirmProduction]
 * @param {string|null} [flags.from]
 * @returns {string|null}
 */
export function pruneRefusal({ prune, write, target, confirmProduction = false, from = null }) {
  if (!prune) return null;
  if (from) {
    return (
      "--prune belongs to manifest mode (no --from) — the table is what marks a row forbidden, " +
      "and a bare file does not name one. Nothing was deleted."
    );
  }
  if (!write) {
    return (
      "--prune deletes rows from the target and is a writer — add --write to mean it. " +
      "Nothing was deleted."
    );
  }
  if (target === "production" && !confirmProduction) {
    return (
      "--prune --target production deletes from the live project; add --confirm-production to " +
      "mean it. Nothing was deleted."
    );
  }
  return null;
}

/**
 * Which of the target's rows `--prune` may delete, and which it must leave alone and say so.
 *
 * The only deletable name is one the table marks `forbidden` **for that environment** and the
 * target actually holds. Two neighbours are deliberately not covered:
 *
 *   - an `extra` row (on the target, no row declares it) is a decision nobody has made yet —
 *     `GOOGLE_CLIENT_SECRET` and `NEON_AUTH_JWKS_URL` on `preview@demo` are exactly that — so it
 *     is reported by the check and never deleted by this verb;
 *   - a `NEVER_AT_ALL` name is not app configuration, so its presence is already a finding, and
 *     deleting it would hide the file or paste that put it there. It is reported by name and
 *     refused.
 *
 * A name is matched by key, never by value: Vercel can withhold a `sensitive` value entirely, and
 * a delete needs no comparison to make — so a hidden entry is as prunable as a readable one.
 */
export function planPrune({ forbidden, present, neverAtAll = NEVER_AT_ALL }) {
  const refused = [];
  for (const name of present.keys()) {
    if (neverAtAll.has(name)) refused.push({ name, why: neverAtAll.get(name) });
  }
  const pruned = [];
  for (const row of forbidden) {
    const entry = present.get(row.name);
    if (!entry) continue;
    if (neverAtAll.has(row.name)) continue; // already refused above, by name and reason
    pruned.push({ name: row.name, id: entry.id });
  }
  return { pruned, refused };
}

/**
 * Run a plan: one `DELETE /v9/projects/{project}/env/{id}?teamId=…` per pruned name, and a line
 * per name — never a value, because a delete never receives one and a failure message is scrubbed
 * by the caller's `request`.
 *
 * `request` is the script's own `call`, injected so a case can count the verbs without a network.
 * A failure on one name does not stop the rest: a prune run that removed three of four forbidden
 * rows is still progress, and the summary says exactly how many moved.
 */
export async function pruneTarget({ project, team, token, plan, request, log = console.log }) {
  for (const { name, why } of plan.refused) {
    log(`  policy  ${name.padEnd(38)} never a deployment's config — not pruned (${why})`);
  }
  let deleted = 0;
  let failed = 0;
  for (const { name, id } of plan.pruned) {
    try {
      await request("DELETE", `/v9/projects/${project}/env/${id}?teamId=${team}`, null, token);
      deleted += 1;
      log(`  pruned  ${name}`);
    } catch (error) {
      failed += 1;
      log(`  FAILED  ${name}: ${error.message}`);
    }
  }
  return { deleted, failed };
}
