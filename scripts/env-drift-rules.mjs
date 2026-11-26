/**
 * The decisions behind `scripts/env-drift.mjs`, as pure functions.
 *
 * The problem this file exists for is dated, not imagined. The Neon account moved on
 * **2026-11-24**; Vercel's production environment was re-sourced by hand on **2026-11-26**, and
 * every Neon-derived value had been stale for between four and twenty-six days:
 *
 *   NEON_API_KEY            2026-11-04      DATABASE_URL, DATABASE_URL_UNPOOLED,
 *   NEON_AUTH_COOKIE_SECRET 2026-10-30      NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL 2026-11-21
 *   NEON_BRANCH             2026-11-01
 *
 * Production kept serving the whole time — the deployment held a working connection string — so
 * nothing failed loudly and no surface said anything. The same class had already broken the demo
 * reset for four days through a stale `NEON_API_KEY` repository secret.
 *
 * `pnpm env:check` cannot see this. It validates the *manifest*: which names the app expects. It
 * never sees a value, because Vercel masks 21 of the 48 production variables as `[SENSITIVE]`, so
 * drift is invisible by reading. **The only observable is time**: a value last written before the
 * last account or credential change is suspect, and that is a comparison two dates can make.
 *
 * So this module holds the comparison and nothing else — no network, no clock, no file, no
 * `process.env`, no argument vector. `scripts/env-drift.mjs` fetches; this decides; a case in
 * `tests/env-drift.test.ts` holds each rule still.
 *
 * ## Dates only, and the file says so
 *
 * `data/env/rotations.json` records **when** a credential set was rotated, never what it rotated
 * to. `parseRotations` enforces that by shape rather than by trust: an unknown key is a problem
 * (so a hand-pasted `"value"` is refused by name), and coverage entries must look like env names
 * (so a pasted secret cannot arrive disguised as one). Nothing here prints a value, and a value has
 * nowhere to be stored even if a caller tried.
 *
 * ## Why the coverage list is per rotation
 *
 * A rotation is a *set*: the Neon account move re-sourced the connection strings and the auth
 * service, and a Stripe key rotation re-sources nothing else. One global "credentials last rotated"
 * date would accuse every unrelated variable in the project of being stale the day anything moved,
 * which is the signal-to-noise shape that gets a check switched off. Each entry therefore names the
 * variables it governs, in three lists:
 *
 *   `names`     variables the application reads — every one is a row in `scripts/env-manifest.ts`
 *   `platform`  variables the deployment must hold that **no app code reads**, because the
 *               provider's own runtime consumes them (`NEON_AUTH_JWKS_URL` is the auth service's
 *               JWKS endpoint: the deployment carries it, the auth service fetches it, and no
 *               module here names it). They are kept apart from `names` so the cross-check in
 *               `tests/env-drift.test.ts` can hold each list to its own claim — a name in `names`
 *               that the manifest does not declare, or a `platform` value it does, is a mistake.
 *   `prefixes`  a family, for the values the integration writes as a group (`NEON_OBJSTORE_`)
 */

/** Where the declared rotations live, repo-relative. Read by the script, never by this module. */
export const DEFAULT_ROTATIONS_PATH = "data/env/rotations.json";

/** The keys a rotations file may hold, at the top level. */
export const FILE_KEYS = ["$comment", "rotations"];

/** The keys one rotation may hold. Every other key is a problem, by name. */
export const ROTATION_KEYS = ["id", "changedAt", "why", "names", "platform", "prefixes"];

/** An env name: what a coverage entry must look like, so a value cannot be written as one. */
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** `YYYY-MM-DD`, and a real calendar day (2026-02-30 is not one). */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is this a real calendar day in the one spelling the file uses? */
export function isDay(value) {
  if (typeof value !== "string") return false;
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * A timestamp as a UTC calendar day, in the same spelling the file uses.
 *
 * Vercel's env API reports `createdAt` / `updatedAt` as epoch milliseconds. A captured listing may
 * carry either shape, so both are accepted and both land on the same day string — which is also all
 * that is ever printed. UTC rather than local: a stamp compared against a hand-declared date must
 * not move with the machine's timezone, or the same tree would report drift in one shell and not in
 * the next.
 */
export function dayOf(stamp) {
  if (typeof stamp === "number" && Number.isFinite(stamp)) {
    return new Date(stamp).toISOString().slice(0, 10);
  }
  if (typeof stamp === "string") {
    const numeric = Number(stamp);
    if (stamp.trim() !== "" && Number.isFinite(numeric)) {
      return new Date(numeric).toISOString().slice(0, 10);
    }
    const parsed = Date.parse(stamp);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * `data/env/rotations.json`, as the rule sees it: the rotations plus every problem.
 *
 * Collected rather than thrown, so one run reports a misspelled date and a leftover `"value"` key
 * together instead of the first one. An empty `rotations` array is *not* a problem: a repository
 * that has never recorded a rotation has nothing to compare, and the report says so out loud rather
 * than passing silently (see `summary`).
 */
export function parseRotations(text) {
  const problems = [];
  let body;
  try {
    body = JSON.parse(String(text));
  } catch {
    return { rotations: [], problems: [{ where: "(file)", message: "is not JSON" }] };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { rotations: [], problems: [{ where: "(file)", message: "is not a JSON object" }] };
  }
  for (const key of Object.keys(body)) {
    if (!FILE_KEYS.includes(key)) {
      problems.push({
        where: key,
        message:
          "is not a key this file may hold — `rotations` and `$comment` only, dates never values",
      });
    }
  }
  if (!Array.isArray(body.rotations)) {
    problems.push({
      where: "rotations",
      message: "is absent — the file must name a list of rotations",
    });
    return { rotations: [], problems };
  }

  const rotations = [];
  const seen = new Set();
  body.rotations.forEach((entry, index) => {
    const at = `rotations[${index}]`;
    const before = problems.length;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push({ where: at, message: "is not an object" });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!ROTATION_KEYS.includes(key)) {
        problems.push({
          where: `${at}.${key}`,
          message: `is not a rotation key (${ROTATION_KEYS.join(", ")}) — dates only, never a credential`,
        });
      }
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      problems.push({ where: `${at}.id`, message: "must be kebab-case, like `neon-account`" });
    } else if (seen.has(id)) {
      problems.push({ where: `${at}.id`, message: `declares \`${id}\` twice` });
    } else {
      seen.add(id);
    }
    if (!isDay(entry.changedAt)) {
      problems.push({
        where: `${at}.changedAt`,
        message: "must be a real calendar day, `YYYY-MM-DD` — the day the credential set changed",
      });
    }
    const why = typeof entry.why === "string" ? entry.why.trim() : "";
    if (why === "") {
      problems.push({ where: `${at}.why`, message: "is absent — one line saying what moved" });
    }
    const names = entry.names === undefined ? [] : entry.names;
    const platform = entry.platform === undefined ? [] : entry.platform;
    const prefixes = entry.prefixes === undefined ? [] : entry.prefixes;
    if (!Array.isArray(names) || !Array.isArray(platform) || !Array.isArray(prefixes)) {
      problems.push({
        where: at,
        message: "`names`, `platform` and `prefixes` must be lists when present",
      });
      return;
    }
    const bad = [...names, ...platform, ...prefixes].filter(
      (name) => typeof name !== "string" || !ENV_NAME.test(name),
    );
    if (bad.length > 0) {
      problems.push({
        where: `${at}.names`,
        message: `${bad.length} entr(ies) are not env names — an upper-case name only, never a value`,
      });
    }
    const both = names.filter((name) => platform.includes(name));
    if (both.length > 0) {
      problems.push({
        where: `${at}.platform`,
        message: `${both.join(", ")} is declared as both a name the app reads and a platform value`,
      });
    }
    if (names.length === 0 && platform.length === 0 && prefixes.length === 0) {
      problems.push({
        where: at,
        message: "covers no variable — list the `names` (or `prefixes`) this rotation governs",
      });
    }
    if (problems.length === before) {
      rotations.push({
        id,
        changedAt: entry.changedAt,
        why,
        names: [...new Set(names.filter((name) => typeof name === "string"))],
        platform: [...new Set(platform.filter((name) => typeof name === "string"))],
        prefixes: [...new Set(prefixes.filter((name) => typeof name === "string"))],
      });
    }
  });
  return { rotations, problems };
}

/**
 * The rotation that governs a name: an exact `names` entry beats a `prefixes` one, and the longest
 * prefix wins between two. Deterministic, because a variable is covered by at most one rotation —
 * a name claimed twice would print two accusations for one stale value, and the fix for that is a
 * narrower prefix, not a merged message.
 */
export function rotationFor(name, rotations) {
  const exact = rotations.find(
    (entry) => entry.names.includes(name) || entry.platform.includes(name),
  );
  if (exact) return exact;
  let best = null;
  for (const entry of rotations) {
    for (const prefix of entry.prefixes) {
      if (!name.startsWith(prefix)) continue;
      if (best === null || prefix.length > best.prefix.length) best = { entry, prefix };
    }
  }
  return best === null ? null : best.entry;
}

/**
 * The Vercel env listing, projected to the four fields this check reads.
 *
 * **This is the boundary, and it is the whole of the never-print-a-value rule.** The API's response
 * carries a `value` on some rows — `plain` rows return theirs outright, and the listing is fetched
 * with a token that can decrypt — so a row is copied field by field rather than spread. A caller
 * holding this projection has no value to leak: not the secret, not a prefix of it, not a hash. A
 * test feeds it a listing with a `value` on every row and asserts the projection drops it.
 */
export function projectRows(listing) {
  const rows = Array.isArray(listing) ? listing : (listing?.envs ?? []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((entry) => entry !== null && typeof entry === "object" && typeof entry.key === "string")
    .map((entry) => ({
      key: entry.key,
      target: Array.isArray(entry.target) ? entry.target.map(String) : [],
      type: typeof entry.type === "string" ? entry.type : "unknown",
      createdAt: dayOf(entry.createdAt),
      updatedAt: dayOf(entry.updatedAt),
    }));
}

/**
 * The report: which of a target's variables were last written before the rotation that governs
 * them.
 *
 * One row per variable, and only for variables a rotation covers — an uncovered variable is counted
 * and never accused, because "nobody has declared when this should have moved" is not evidence that
 * it is stale. A row with no readable `updatedAt` is `unknown` and is reported as such rather than
 * counted as fresh: a timestamp that cannot be read is not a timestamp that agrees.
 */
export function findDrift(rows, rotations, { target = "production" } = {}) {
  const onTarget = rows.filter((row) => row.target.includes(target));
  const stale = [];
  const unknown = [];
  let compared = 0;
  let uncovered = 0;
  for (const row of onTarget) {
    const rotation = rotationFor(row.key, rotations);
    if (rotation === null) {
      uncovered += 1;
      continue;
    }
    compared += 1;
    if (row.updatedAt === null) {
      unknown.push({ key: row.key, rotation: { id: rotation.id, changedAt: rotation.changedAt } });
      continue;
    }
    if (row.updatedAt < rotation.changedAt) {
      stale.push({
        key: row.key,
        updatedAt: row.updatedAt,
        rotation: { id: rotation.id, changedAt: rotation.changedAt },
      });
    }
  }
  const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return {
    stale: stale.sort(byKey),
    unknown: unknown.sort(byKey),
    compared,
    uncovered,
    onTarget: onTarget.length,
  };
}

/**
 * One line per stale variable: the name, when it was last written, and the rotation it predates.
 *
 * Nothing else is ever printed for a row — not its type, not its byte length, not a fingerprint.
 * The name and two dates are the whole vocabulary of this report.
 */
export function staleLines(stale) {
  const width = Math.max(0, ...stale.map((row) => row.key.length));
  return stale.map(
    (row) =>
      `  ${row.key.padEnd(width)}  last updated ${row.updatedAt} · predates ${row.rotation.id} ` +
      `(changed ${row.rotation.changedAt})`,
  );
}

/** The census line every run prints, green or red. */
export function summary(report, rotations, { target = "production" } = {}) {
  const declared = rotations.reduce(
    (total, entry) => total + entry.names.length + entry.platform.length + entry.prefixes.length,
    0,
  );
  return (
    `env-drift: ${target} · ${report.onTarget} variable(s) on the target · ${rotations.length} ` +
    `rotation(s) declared (${declared} name/prefix entr(ies)) · ${report.compared} compared · ` +
    `${report.uncovered} uncovered · ${report.stale.length} stale` +
    (report.unknown.length > 0 ? ` · ${report.unknown.length} with no readable timestamp` : "")
  );
}

/**
 * The remedy, in the refusal's own words. It names the act and refuses the shortcut: editing the
 * date in `rotations.json` is a reviewed commit that must be true, not a way to make a check green.
 */
export function remedy(stale) {
  const rotations = [...new Set(stale.map((row) => row.rotation.id))];
  return [
    `${stale.length} production variable(s) predate ${rotations.join(", ")} — re-source the value ` +
      "for each one named above, then run this again",
    "the write is the owner's: nothing in this repository rotates a value, because a wrong write to " +
      "production is worse than a stale one",
    "do not move the date in data/env/rotations.json to clear this line — the date is a claim about " +
      "when the credential set changed, and a check that is silenced once is silenced for good",
  ].join("\n");
}
