/**
 * The integration registry — the one hand-authored file behind `/admin/settings` (#1443).
 *
 * **What it is not.** It is not a second table of variables. Every variable, its environment, its
 * requirement and its source are `scripts/env-manifest.ts`'s, and every "does the store hold it"
 * answer is `docs/operations/env-stores.md`'s. What no generator knows is the small, stable set of
 * facts about the *account*: who is it, what is it for, and where would a person go to change it.
 * That is this file, and nothing else is.
 *
 * **`provider` on a manifest row is an id from `INTEGRATIONS`.** `scripts/env-manifest.ts` types the
 * field as `ProviderId`, so a row naming a provider that is not here is a type error, and a row
 * naming none is refused by name when the directory is built (`lib/admin/settings/providers.ts`).
 * The grouping is total: a variable the tree reads but nobody can place is a finding, never a
 * "general" bucket, for the reason `lib/admin/crud-matrix.ts` refuses an unknown column — a
 * fallback bucket turns a forgotten edit into a screen that looks complete.
 *
 * **Why `repo` is one of them.** Seven of these are vendors somebody else runs. A literal
 * (`BRAND`), a derived value (`APP_VERSION`) and a tooling knob (`PARITY_UPDATE`) have no vendor
 * console at all: the place you change them is a row in this tree. Calling that "no provider"
 * would mean the directory silently drops them, so it is a card like any other, with the manifest
 * as its console. The spec's §4 table carries the same eighth row (`settings-integrations.md`).
 *
 * **No value ever lives here, or anywhere this screen can reach.** Handles, project ids, branches
 * and URLs are names — the same class of fact `scripts/neon-endpoints.mjs` commits — and the page
 * prints sources and statuses, never a secret. A handle that this tree does not record says so in
 * words rather than being guessed: "not recorded in this tree" is a fact, and a plausible address
 * an operator would then paste into a login form is the one thing worse than a blank.
 *
 * **Accounts are per environment where the deployment really differs.** Neon is one project with a
 * `demo` branch and a `main` branch; Vercel is one project with three environment scopes. Where the
 * account is the same in all three, the three cells say the same thing on purpose — the column
 * exists so a difference is visible, not so a difference can be implied.
 *
 * Pure data: no imports at runtime, no reads, no network. `data:check` compiles this module with the
 * rest of `data/`, and `tests/admin-settings-providers.test.ts` holds every manifest row to it.
 */

/** The three deployments a handle is recorded for. The ids are `scripts/env-manifest.ts`'s. */
export const INTEGRATION_ENVIRONMENTS = ["local", "preview", "production"] as const;

export type IntegrationEnvironment = (typeof INTEGRATION_ENVIRONMENTS)[number];

/**
 * Who the credential belongs to. The spec's missing axis, hand-typed because nothing in the tree
 * records it: a person's own login, a service's key, an agent's token, or a cron's shared secret.
 */
export const INTEGRATION_ACTORS = ["human", "service", "agent", "cron"] as const;

export type IntegrationActor = (typeof INTEGRATION_ACTORS)[number];

/** How a change reaches the account: the provider's own console, or a command. */
export const INTEGRATION_TOOLS = ["console", "cli", "webhook", "git"] as const;

export type IntegrationTool = (typeof INTEGRATION_TOOLS)[number];

/** One provider — the account facts, and no variable of its own. */
export interface Integration {
  /** The id `scripts/env-manifest.ts` rows name. Stable: a row's `provider` is this string. */
  readonly id: string;
  /** The name the card prints. */
  readonly label: string;
  readonly actor: IntegrationActor;
  readonly tool: IntegrationTool;
  /** One line: what this account holds, in the product's own words. */
  readonly holds: string;
  /** Who the account is, per deployment. Never a secret, never a guess. */
  readonly account: Readonly<Record<IntegrationEnvironment, string>>;
  /** Where its keys are managed — an address that leaves the app, drawn by `LeavingLink`. */
  readonly console: string;
  /** The provider's own documentation for the thing this app uses. */
  readonly docs: string;
}

/**
 * The accounts, ordered by what breaks first if it is wrong: no Neon, no application at all; no
 * BWS, no way to re-source anything else; the last row is this tree, which owns the literals and
 * the tooling knobs no vendor issues.
 */
export const INTEGRATIONS = [
  {
    id: "neon",
    label: "Neon",
    actor: "service",
    tool: "console",
    holds:
      "The Postgres branch and its connection strings, Managed Auth, and object storage — one project, two branches.",
    account: {
      local: "morning-bonus-76597456 · demo branch",
      preview: "morning-bonus-76597456 · demo branch",
      production: "morning-bonus-76597456 · main branch",
    },
    console: "https://console.neon.tech/app/projects/morning-bonus-76597456",
    docs: "https://neon.tech/docs/manage/projects",
  },
  {
    id: "vercel",
    label: "Vercel",
    actor: "service",
    tool: "cli",
    holds: "The three environment scopes this app is rendered from, and the deployment itself.",
    account: {
      local: "localhost:3000 · this checkout",
      preview: "riolabs-ai/alignsynch · demo branch",
      production: "riolabs-ai/alignsynch · main branch",
    },
    console: "https://vercel.com/riolabs-ai/alignsynch/settings/environment-variables",
    docs: "https://vercel.com/docs/projects/environment-variables",
  },
  {
    id: "bws",
    label: "Bitwarden Secrets Manager",
    actor: "service",
    tool: "cli",
    holds:
      "Project alignsynch-web — every secret this repo sources, including the token that opens the project.",
    account: {
      local: "project alignsynch-web",
      preview: "project alignsynch-web",
      production: "project alignsynch-web",
    },
    console: "https://vault.bitwarden.com",
    docs: "https://bitwarden.com/help/secrets-manager-overview/",
  },
  {
    id: "resend",
    label: "Resend",
    actor: "service",
    tool: "webhook",
    holds: "The sending key, the From address and the inbound webhook this deployment answers.",
    account: {
      local: "not recorded in this tree · sending domain alignsynch.com",
      preview: "not recorded in this tree · sending domain alignsynch.com",
      production: "not recorded in this tree · sending domain alignsynch.com",
    },
    console: "https://resend.com/api-keys",
    docs: "https://resend.com/docs/dashboard/api-keys/introduction",
  },
  {
    id: "github",
    label: "GitHub",
    actor: "agent",
    tool: "webhook",
    holds:
      "The alignsynch-fleet App installation, the docs-feedback token, and the inbound webhook that files an issue.",
    account: {
      local: "riolabs-ai · App alignsynch-fleet",
      preview: "riolabs-ai · App alignsynch-fleet",
      production: "riolabs-ai · App alignsynch-fleet",
    },
    console: "https://github.com/organizations/riolabs-ai/settings/installations",
    docs: "https://docs.github.com/en/apps/maintaining-github-apps/managing-github-apps",
  },
  {
    id: "google",
    label: "Google",
    actor: "human",
    tool: "console",
    holds:
      "The OAuth client behind Google sign-in — configured in Neon Auth, so this tree holds no row for it.",
    account: {
      local: "held by the Neon auth provider",
      preview: "held by the Neon auth provider",
      production: "held by the Neon auth provider",
    },
    console: "https://console.cloud.google.com/apis/credentials",
    docs: "https://neon.tech/docs/guides/neon-auth",
  },
  {
    id: "stripe",
    label: "Stripe",
    actor: "service",
    tool: "webhook",
    holds:
      "Two test key sets (venture, alignsynch) and the webhook secret each endpoint signs with.",
    account: {
      local: "test mode · both key sets",
      preview: "test mode · both key sets",
      production: "test mode · both key sets",
    },
    console: "https://dashboard.stripe.com/test/apikeys",
    docs: "https://docs.stripe.com/keys",
  },
  {
    id: "repo",
    label: "This repository",
    actor: "agent",
    tool: "git",
    holds:
      "The literals, derived values and tooling knobs no vendor issues: a change is a pull request to the manifest row.",
    account: {
      local: "a checkout of this tree",
      preview: "the demo deployment's build",
      production: "the production deployment's build",
    },
    console: "https://github.com/riolabs-ai/alignsynch/blob/main/scripts/env-manifest.ts",
    docs: "https://github.com/riolabs-ai/alignsynch/blob/main/docs/operations/env-manifest.md",
  },
] as const satisfies readonly Integration[];

/** Every provider id, in the registry's own order — the only list a grouping may read. */
export type ProviderId = (typeof INTEGRATIONS)[number]["id"];

/**
 * The ids as a value, for a runtime lookup — a `ProviderId` that arrived from a manifest row is
 * narrowed here, so nothing has to trust a string comparison written twice.
 */
export const PROVIDER_IDS: readonly ProviderId[] = INTEGRATIONS.map(
  (integration) => integration.id,
);

/** One provider's row of the registry, by id. Total over `PROVIDER_IDS` by construction. */
export function integrationOf(id: ProviderId): Integration {
  const found = INTEGRATIONS.find((integration) => integration.id === id);
  // Unreachable through the type; a registry edited into a duplicate id is the one way here.
  if (found === undefined)
    throw new Error(`data/integrations.ts: no provider is registered as ${id}`);
  return found;
}

/** Is this string a registered provider id? The narrowing a manifest row goes through. */
export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
