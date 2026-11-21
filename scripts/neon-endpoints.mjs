/**
 * The Neon endpoints this repo's demo tooling can meet, as data (#1336).
 *
 * One table, because two of them disagreed. `PRODUCTION_HOST_MARKER` named the **retired** project's
 * endpoint, so when the project moved, every demo writer kept refusing the old host and silently
 * accepted the new production one: `pnpm demo:verify` on a checkout whose `.env.local` still said
 * `NEON_BRANCH=demo` opened the live branch and passed. `pnpm db:seed` had no refusal at all.
 *
 * The facts in the table are endpoint ids and project names only — no credential, no host suffix —
 * so it is safe to commit, quote in a failure message and diff in a review. A project move is one
 * edit here, and every refusal in `scripts/` follows, because they all read this module instead of
 * typing a marker of their own.
 *
 * **A denylist, never an allowlist.** The rows below are the endpoints a writer must *not* touch;
 * everything else is welcome, which is what keeps a scratch branch cut from `demo` seedable
 * (`db:verify`'s probe workflow) without a second table to maintain. `PRODUCTION_ENDPOINTS` holds
 * the two production rows — the live project's `main` branch and the retired project's
 * `production` branch — and `DEMO_ENDPOINT` holds the one branch the health record may name.
 *
 * Pure by construction: no I/O, no `process.env`, no imports. The same module is loaded by
 * `node:` scripts and by vitest files, so the table cannot be right in one and stale in the other.
 */

/**
 * Every endpoint this table knows, with the role it plays. `role` is the sentence a reporter
 * prints; `retired` is the one machine-readable fact a refusal adds — the retired project is
 * read-only, so "never" means never there, not "only when the label is unclear".
 */
export const KNOWN_ENDPOINTS = [
  {
    endpoint: "ep-square-glade-bd2fcmjv",
    project: "morning-bonus-76597456",
    branch: "main",
    role: "production-live",
    retired: false,
  },
  {
    endpoint: "ep-fancy-bar-bd0pzuz0",
    project: "morning-bonus-76597456",
    branch: "demo",
    role: "demo",
    retired: false,
  },
  {
    endpoint: "ep-winter-block-b4bkk1xc",
    project: "fragrant-glade-99460966",
    branch: "production",
    role: "production-retired",
    retired: true,
  },
  {
    endpoint: "ep-crimson-truth-b4ppwxrp",
    project: "fragrant-glade-99460966",
    branch: "demo",
    role: "retired-demo",
    retired: true,
  },
];

/**
 * The endpoints a demo writer must never write to: both projects' production branches. Filtered
 * from the table rather than authored again, so a row cannot be in one list and missing from the
 * other.
 */
export const PRODUCTION_ENDPOINTS = KNOWN_ENDPOINTS.filter((entry) =>
  entry.role.startsWith("production"),
);

/**
 * The demo branch the platform record is recorded from, and the one every demo writer is *welcome*
 * on. `ep-crimson-truth-b4ppwxrp` was the demo until the project moved; leaving it here made
 * `pnpm health:record` refuse the only demo branch that exists.
 */
export const DEMO_ENDPOINT = "ep-fancy-bar-bd0pzuz0";

/** The project the demo branch belongs to. */
export const DEMO_PROJECT = "morning-bonus-76597456";

/** The retired project's demo branch: evidence lives here, never a writer. */
export const RETIRED_DEMO_ENDPOINT = "ep-crimson-truth-b4ppwxrp";

/**
 * The endpoint id a host names: the first label, without the `-pooler` suffix. Two URLs that pool
 * and bypass the pooler for one branch share it, and two branches never do. `null` when there is
 * no label to read, so a caller can stay total instead of throwing on a malformed URL.
 */
function endpointOfHost(host) {
  if (typeof host !== "string") return null;
  const trimmed = host.trim();
  if (trimmed === "") return null;
  let value = trimmed;
  if (trimmed.includes("://")) {
    try {
      value = new URL(trimmed).hostname;
    } catch {
      return null;
    }
  }
  const label = value.split(".")[0]?.replace(/-pooler$/, "");
  return label === undefined || label === "" ? null : label;
}

/** The host of a connection string, or `null` when it does not parse. Never the URL itself. */
function hostOfUrl(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") return null;
  try {
    return new URL(databaseUrl.trim()).hostname;
  } catch {
    return null;
  }
}

/**
 * The known role of the endpoint a host names — `production-live`, `production-retired`, `demo`,
 * `retired-demo` — or `null` for a host this table does not know (a scratch branch, a copy of
 * `demo`, an endpoint created after this file was written).
 *
 * Accepts a host (`ep-fancy-bar-bd0pzuz0-pooler.c-8.…`) or a whole connection string, because a
 * failure message and a reporter both want to ask about the thing the reader is looking at.
 */
export function endpointBranch(host) {
  const label = endpointOfHost(host);
  if (label === null) return null;
  const entry = KNOWN_ENDPOINTS.find(
    (candidate) => label === candidate.endpoint || label.startsWith(`${candidate.endpoint}-`),
  );
  return entry?.role ?? null;
}

/**
 * Which production endpoints these connection strings open, as the matched table rows — each with
 * the `host` it was found on, which is what a refusal prints.
 *
 * Every URL is read, not just the first: a run that seeded through `DATABASE_URL_UNPOOLED` while
 * the app it drives reads `DATABASE_URL` on the live branch would write demo rows nowhere and then
 * diff production's pages against a dataset it never saw. An unparseable or empty URL matches
 * nothing — "no database" is a different state with its own answer.
 */
export function productionEndpointsIn(databaseUrls = []) {
  const matches = [];
  for (const databaseUrl of databaseUrls) {
    const host = hostOfUrl(databaseUrl);
    const label = endpointOfHost(host);
    if (label === null) continue;
    const entry = PRODUCTION_ENDPOINTS.find(
      (candidate) => label === candidate.endpoint || label.startsWith(`${candidate.endpoint}-`),
    );
    if (entry !== undefined) matches.push({ ...entry, host });
  }
  return matches;
}
