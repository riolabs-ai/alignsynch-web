/**
 * The governed settings — the six non-secret variables an operator would want to move without a
 * deploy, and the precedence rule that decides which of three answers wins (#1443 §9 D6-B, §11).
 *
 * **Pure, and it has to stay pure.** Nothing here imports `node:fs`, `pg` or `process`: the
 * registry, the parsers and the precedence decision are data and arithmetic, so `tests/` can drive
 * every branch with a plain object, `data:check` can compile it under plain node, and the form on
 * `/admin/settings` can be derived from it without a server-only marker. The one module that opens
 * the store is `lib/admin/settings/values.ts`, and it is built on top of these functions rather
 * than beside them.
 *
 * **The precedence is `env > setting > default`, and nothing else is ever true.**
 *
 *   1. the deployment's environment variable, when it carries a non-empty value — a restart is the
 *      way to change it, and no form in this app can move it;
 *   2. the row in the `setting` table, written through `act()`;
 *   3. the application's own default, which is the value in code.
 *
 * The order is not a preference: the environment is what the platform operator controls (a Vercel
 * env var, a container's `-e`), the table is what an admin controls from a browser, and the default
 * is what the tree says when nobody said anything. Inverting the first two would mean a form edit
 * silently outranks a deployment variable that the operator set deliberately, which is exactly the
 * failure this module exists to make impossible.
 *
 * **A stored value can lose invisibly, so `shadowedByEnv` exists.** When the environment also
 * carries the key, the resolution is the environment's *and* it says so: the form draws
 * `shadowed by env` beside that field, and its edit is recorded (the audit is real) while changing
 * nothing that renders. That badge is the whole point — an edit that silently loses is worse than a
 * field that refuses.
 *
 * **Two of the six can never honour a stored value, and they are in the registry anyway.**
 * `NAV_SOURCE` is read at build time and inlined into both bundles, and `DEMO_ALLOW_PRODUCTION` is
 * read once at process start. A runtime override for either would be a value the form accepts and
 * no reader can obey, so `fixedBy` carries the reason and the form draws a refused row with no
 * field. They are listed here — not omitted — because a reader asking "can I change NAV_SOURCE
 * without a deploy?" must get an answer with a reason, not an absence.
 *
 * **An unparseable value never becomes the answer.** A count that is not a whole number falls to
 * the default and carries the sentence the reader would have printed (`…="five" is not a whole
 * number of commits; the default applies`), so the health screen can keep rendering the operator's
 * mistake instead of pretending their knob worked. `resolveGoverned` composes the sentence; the
 * callers do not invent a second vocabulary for the same bad value.
 */

/** The variable names, as the environment and the form spell them. One home. */
export const PLATFORM_HEALTH_DRIFT_LIMIT = "PLATFORM_HEALTH_DRIFT_LIMIT";
export const PLATFORM_HEALTH_FRESHNESS_HOURS = "PLATFORM_HEALTH_FRESHNESS_HOURS";
export const RESEND_FROM = "RESEND_FROM";
export const RESEND_ENDPOINT = "RESEND_ENDPOINT";
export const DEMO_ALLOW_PRODUCTION = "DEMO_ALLOW_PRODUCTION";
export const NAV_SOURCE = "NAV_SOURCE";

/**
 * The defaults — the third arm of the precedence, each named so the module that reads it can
 * derive its own constant instead of restating the value.
 *
 * `lib/admin/platform-health.ts` keeps `DEFAULT_DRIFT_LIMIT` / `DEFAULT_FRESHNESS_HOURS` (numbers,
 * because the panel prints them) and `lib/flow/email.ts` keeps `DEFAULT_FROM` / `RESEND_ENDPOINT`
 * (the From header and the provider's URL) — all four parsed or copied from here, so moving a
 * default is one edit and `tests/admin-settings-values.test.ts` holds the two spellings equal.
 */
export const PLATFORM_HEALTH_DRIFT_LIMIT_FALLBACK = "5";
export const PLATFORM_HEALTH_FRESHNESS_HOURS_FALLBACK = "72";
export const RESEND_FROM_FALLBACK = "onboarding@resend.dev";
export const RESEND_ENDPOINT_FALLBACK = "https://api.resend.com/emails";

/** How a governed value is checked before it is obeyed. */
export type GovernedKind = "count" | "text";

/** Where the winning value came from. `setting` is the only one a form can produce. */
export type SettingSource = "env" | "setting" | "default";

/**
 * One governed variable.
 *
 * `fallback` is the default — the third arm of the precedence — and it is a string because every
 * governed value in v1 is one: the two counts are parsed by the readers that own them
 * (`lib/admin/platform-health.ts`), the sender and the endpoint are consumed verbatim.
 */
export interface GovernedSpec {
  readonly key: string;
  readonly kind: GovernedKind;
  /** The noun a count's refusal sentence uses: "commits", "hours". Unused for `text`. */
  readonly unit: string | null;
  readonly fallback: string;
  /** The module and screen that read it, so the form can say what an edit moves. */
  readonly readBy: string;
  /** Why a stored override cannot be honoured, or `null` when one can. */
  readonly fixedBy: string | null;
}

/**
 * The governed set, in the order the form draws them: the two health knobs first (they are read by
 * a screen in this app), then the mail pair, then the two that are refused.
 */
export const GOVERNED_SPECS: readonly GovernedSpec[] = [
  {
    key: PLATFORM_HEALTH_DRIFT_LIMIT,
    kind: "count",
    unit: "commits",
    fallback: PLATFORM_HEALTH_DRIFT_LIMIT_FALLBACK,
    readBy: "lib/admin/platform-health.ts — the deploy-drift panel on /admin/health",
    fixedBy: null,
  },
  {
    key: PLATFORM_HEALTH_FRESHNESS_HOURS,
    kind: "count",
    unit: "hours",
    fallback: PLATFORM_HEALTH_FRESHNESS_HOURS_FALLBACK,
    readBy: "lib/admin/platform-health.ts — the freshness window on /admin/health",
    fixedBy: null,
  },
  {
    key: RESEND_FROM,
    kind: "text",
    unit: null,
    fallback: RESEND_FROM_FALLBACK,
    readBy: "lib/flow/email.ts, lib/contact/mail.ts, lib/contact/reply.ts — the From header",
    fixedBy: null,
  },
  {
    key: RESEND_ENDPOINT,
    kind: "text",
    unit: null,
    fallback: RESEND_ENDPOINT_FALLBACK,
    readBy: "lib/flow/email.ts, lib/contact/mail.ts, lib/contact/reply.ts — where a send posts",
    fixedBy: null,
  },
  {
    key: DEMO_ALLOW_PRODUCTION,
    kind: "text",
    unit: null,
    fallback: "",
    readBy: "instrumentation.ts, then demoModeFor() at six call sites including /login",
    fixedBy:
      "read once when the process starts, because it is the second switch on the demo door in production. A value written here cannot reach a process that is already running, so this row refuses rather than promising an override that would lose.",
  },
  {
    key: NAV_SOURCE,
    kind: "text",
    unit: null,
    fallback: "both",
    readBy: "lib/nav-menu.ts::BUILD_NAV_SOURCE, inlined into both bundles by next.config.mjs",
    fixedBy:
      "read at build time and inlined into the client bundle. A runtime read would render one navigation on the server and another in the browser — a React #418 hydration mismatch — so changing it is a rebuild, never a form.",
  },
];

/** Every governed key, by name. */
export const GOVERNED_KEYS: readonly string[] = GOVERNED_SPECS.map((spec) => spec.key);

/** The keys a form may write: the registry minus the two that cannot honour a stored value. */
export const WRITABLE_KEYS: readonly string[] = GOVERNED_SPECS.filter(
  (spec) => spec.fixedBy === null,
).map((spec) => spec.key);

/** Is this string a governed key? The runtime half of the closed union a form posts. */
export function isGovernedKey(value: string): boolean {
  return GOVERNED_KEYS.includes(value);
}

/** The spec for a key, or `null`. Callers that render a form need the whole spec, not just the name. */
export function governedSpecOf(key: string): GovernedSpec | null {
  return GOVERNED_SPECS.find((spec) => spec.key === key) ?? null;
}

/**
 * The resolution of one key against the two sources a caller has in hand.
 *
 * `value` is always usable: it is the winner, or the default when the winner could not be parsed.
 * `problem` names the value that was refused, so a screen can keep showing the operator what they
 * typed instead of a silent fallback. `stored` is the row that exists, whatever won — the form
 * needs it to draw "stored: … " beside a field that is shadowed.
 */
export interface GovernedResolution {
  readonly key: string;
  readonly value: string;
  readonly source: SettingSource;
  /** A stored row exists and the environment also carries the key, so the row cannot win. */
  readonly shadowedByEnv: boolean;
  /** The stored value, when a row exists. `null` when nothing is stored. */
  readonly stored: string | null;
  readonly problem: string | null;
  /** `false` for the two keys `fixedBy` names; a form draws those rows without a field. */
  readonly writable: boolean;
}

/** The two sources a resolution is computed from. `env` and `stored` are `undefined` when absent. */
export interface GovernedSources {
  readonly env: string | undefined;
  readonly stored: string | null;
}

/** A non-empty, trimmed string, or `undefined` — the shape "this source carried nothing". */
function present(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The precedence decision and the parse, for one spec.
 *
 * **The winner is chosen before it is checked**, and a winner that does not parse falls to the
 * default rather than to the next source down. That is deliberate: a deployment that says
 * `PLATFORM_HEALTH_DRIFT_LIMIT=five` has told the app something it cannot use, and quietly obeying
 * an older stored row instead would make the precedence depend on the *validity* of a higher
 * source — a rule nobody can state. The sentence says what was refused and the default applies.
 */
export function resolveGoverned(spec: GovernedSpec, sources: GovernedSources): GovernedResolution {
  const fromEnv = present(sources.env);
  const fromStore = present(sources.stored);
  const writable = spec.fixedBy === null;
  const shadowedByEnv = fromStore !== undefined && fromEnv !== undefined;

  const winner: { value: string; source: SettingSource } =
    fromEnv !== undefined
      ? { value: fromEnv, source: "env" }
      : fromStore !== undefined
        ? { value: fromStore, source: "setting" }
        : { value: spec.fallback, source: "default" };

  // A row fixed by the deployment cannot refuse a value it would never obey: `DEMO_ALLOW_PRODUCTION`'s
  // default is the empty string, and printing "is empty; the default applies" beside a row that has
  // no control would describe a mistake the operator never made. `problem` is about a *winning*
  // source, and for a fixed row there is no contest to lose.
  const problem = writable ? problemWith(spec, winner) : null;

  if (problem !== null) {
    return {
      key: spec.key,
      value: spec.fallback,
      source: "default",
      shadowedByEnv,
      stored: sources.stored,
      problem,
      writable,
    };
  }

  return {
    key: spec.key,
    value: winner.value,
    source: winner.source,
    shadowedByEnv,
    stored: sources.stored,
    problem: null,
    writable,
  };
}

/**
 * Why a candidate value cannot be obeyed, or `null` when it can.
 *
 * The sentence is the reader's own — `lib/admin/platform-health.ts` printed
 * `PLATFORM_HEALTH_DRIFT_LIMIT="five" is not a whole number of commits; the default applies` before
 * this module existed, and the health screen still renders exactly that, so there is one vocabulary
 * for a bad count rather than two.
 */
export function problemWith(
  spec: GovernedSpec,
  candidate: { value: string; source: SettingSource },
): string | null {
  if (spec.kind === "count") {
    if (/^\d+$/.test(candidate.value)) return null;
    return `${spec.key}="${candidate.value}" is not a whole number of ${spec.unit ?? "units"}; the default applies`;
  }
  if (candidate.value.trim() !== "") return null;
  return `${spec.key} is empty; the default applies`;
}

/**
 * The resolution for one key from an env record alone — no store, no database.
 *
 * This is what a deployment without the `setting` table resolves to (`pnpm build`, the gate, a
 * fresh clone), and what a pure test drives. The shape is identical to a stored resolution's, so a
 * caller can be handed either without knowing which it got.
 */
export function resolveFromEnv(
  spec: GovernedSpec,
  env: Readonly<Record<string, string | undefined>>,
): GovernedResolution {
  return resolveGoverned(spec, { env: env[spec.key], stored: null });
}

/**
 * The value a reader should use, as a string, from an env record alone.
 *
 * The convenience the four non-DB call sites use (`lib/admin/platform-health.ts`'s two parsers keep
 * using `resolveFromEnv` because they need the source and the problem, not just the value).
 */
export function valueFromEnv(
  spec: GovernedSpec,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return resolveFromEnv(spec, env).value;
}
