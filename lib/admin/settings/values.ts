/**
 * The Settings write path — one read that states its precedence, and one write that is audited
 * (#1443 §9 D6-B, §11).
 *
 * **`env > setting > default`, computed in `governed.ts`, applied here.** This module is the only
 * place the `setting` table is opened, and it exists so that every reader of a governed variable
 * asks the same question and gets the same answer: `resolveSetting("RESEND_FROM")` answers with the
 * deployment's variable when there is one, the stored row when there is not, and the code default
 * when neither. The precedence itself is in `governed.ts` because it is arithmetic over two
 * strings and a default, and arithmetic belongs where a test can drive it with no database.
 *
 * **Server-only by construction.** It reaches `pg` through `@/lib/db/client`, which has no browser
 * build; `data:check` E34 walks the `"use client"` graph and fails a value import of this module,
 * and `tests/admin-settings-no-secret.test.ts` holds the same boundary from the component side. No
 * module-scope `window` throw lives here on purpose: `lib/flow/email.ts` legitimately imports this
 * file and is itself imported by fixtures a jsdom test renders, so a runtime guard would break every
 * such test while telling the bundle nothing E34 does not already enforce. Nothing here renders, so
 * nothing here is ever a prop.
 *
 * **A deployment without the table is not a broken deployment.** `process.env.DATABASE_URL`
 * unset — the gate, `pnpm build`, a fresh clone, the vitest suite — answers `absent` without
 * opening a socket, and a database that has not had `0046_setting.sql` applied answers `unmigrated`
 * from PostgreSQL's own `42P01`. Both mean the same thing to a reader: nothing is stored, so
 * `env > default` is the whole rule. That is why every mail path can call this without a new
 * failure mode on a deployment that is one migration behind.
 *
 * **Any other read failure throws.** A socket that died, a permission that was revoked, a column
 * that was renamed — none of those mean "nothing is stored", and answering `env > default` for
 * them would silently discard an override an admin had already saved. The page catches it and
 * draws a panel naming the reason; the mail paths let it propagate, because a send that ignores
 * the operator's configuration is worse than a send that fails loudly.
 *
 * **The write is `act()`'s, not this module's.** `writeSetting` validates the key and the value,
 * then hands `act()` a `mutate` callback that reads the old row `FOR UPDATE`, writes or deletes,
 * and returns both sides — so the audit row carries `before` and `after` and the role floor is read
 * inside the writing transaction (`lib/admin/act.ts` records why that order is the contract).
 *
 * **A secret is refused three times, and each refusal is by name.** The form draws no field for a
 * `vault`-sourced row (`GOVERNED_SPECS` has no entry for one); `refusalFor` answers
 * `vault-sourced` with the name in its sentence, which is what the action returns to the screen;
 * and the table's own `setting_key_governed` CHECK refuses the INSERT. Convention would be one of
 * those three; the card asks for a refusal, so there are three.
 */
import {
  DEMO_ALLOW_PRODUCTION,
  type GovernedResolution,
  type GovernedSpec,
  GOVERNED_SPECS,
  NAV_SOURCE,
  governedSpecOf,
  isGovernedKey,
  resolveGoverned,
  WRITABLE_KEYS,
} from "@/lib/admin/settings/governed";
import { type ActSql, type ActTransactionRunner, POOL_RUNNER, act } from "@/lib/admin/act";
import type { SettingRefusal } from "@/lib/admin/settings/status";
import { getPool } from "@/lib/db/client";
import { ENV_ROWS, type EnvRow } from "@/scripts/env-manifest";

/** The two variables that are governed in name only — see `governed.ts::fixedBy`. */
export const FIXED_KEYS: readonly string[] = [DEMO_ALLOW_PRODUCTION, NAV_SOURCE];

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** What the store answered. `absent` and `unmigrated` are deployment states, not failures. */
export type SettingStoreState = "read" | "absent" | "unmigrated";

/** The stored rows, and whether this request could look at all. */
export interface StoredSettings {
  readonly state: SettingStoreState;
  readonly values: Readonly<Record<string, string>>;
}

/** PostgreSQL's "undefined_table": a deployment that has not run `0046_setting.sql` yet. */
const UNDEFINED_TABLE = "42P01";

/** Is a database configured for this process? The gate, the build and the tests answer no. */
function databaseConfigured(): boolean {
  return (process.env.DATABASE_URL ?? "").trim() !== "";
}

/** PostgreSQL's error code, when the error carries one. */
function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** The pool, as this module's narrower query surface — the same adapter `act()` builds for itself. */
function poolSql(): ActSql {
  return {
    query: async <R = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const result = await getPool().query(text, values as unknown[]);
      return { rows: result.rows as R[] };
    },
  };
}

/**
 * Every stored row, read once.
 *
 * `sql` is the seam for a caller already inside a transaction (the form's write path reads through
 * `act()`); passing nothing opens the pool. The query is unparameterised and unfiltered on purpose:
 * the table holds at most the four governed keys, and a `WHERE key = ANY(...)` would make the read
 * depend on which keys the caller asked for — a resolve of six keys would then be six queries.
 */
export async function readStoredSettings(sql?: ActSql): Promise<StoredSettings> {
  if (sql === undefined && !databaseConfigured()) {
    return { state: "absent", values: {} };
  }
  const query: ActSql = sql ?? poolSql();

  let rows: readonly { key: string; value: unknown }[];
  try {
    rows = (await query.query<{ key: string; value: unknown }>("SELECT key, value FROM setting"))
      .rows;
  } catch (error) {
    if (errorCode(error) === UNDEFINED_TABLE) return { state: "unmigrated", values: {} };
    throw error;
  }

  const values: Record<string, string> = {};
  for (const row of rows) {
    // A row of a key this tree no longer governs is not a value anything reads; it is dropped
    // rather than surfaced, because a form field for it would promise an override nothing obeys.
    if (!isGovernedKey(row.key)) continue;
    if (typeof row.value === "string") values[row.key] = row.value;
  }
  return { state: "read", values };
}

/** The six resolutions, and the store state that qualified them — what the page renders. */
export interface GovernedSettings {
  readonly store: SettingStoreState;
  readonly resolutions: readonly GovernedResolution[];
}

/**
 * Resolve every governed key: one read of the store, six precedence decisions.
 *
 * `env` is a parameter with `process.env` as its default so the page and a test ask the same
 * function; `stored` exists for a caller that already holds the rows (the form's own write path
 * re-reads after a save to render the new state without a second query).
 */
export async function resolveGovernedSettings(
  options: {
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly sql?: ActSql;
  } = {},
): Promise<GovernedSettings> {
  const env = options.env ?? process.env;
  const stored = await readStoredSettings(options.sql);
  return {
    store: stored.state,
    resolutions: GOVERNED_SPECS.map((spec) =>
      resolveGoverned(spec, { env: env[spec.key], stored: stored.values[spec.key] ?? null }),
    ),
  };
}

/**
 * Every governed key resolved from the environment alone — the fallback for a store that could not
 * be read.
 *
 * A page that cannot read the table still owes the operator the six rows and the precedence: the
 * values it draws are then exactly what every reader is resolving (`env > default`), which is true
 * even while the store is broken. `store` is `absent` because nothing stored is being obeyed.
 */
export function governedSettingsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GovernedSettings {
  return {
    store: "absent",
    resolutions: GOVERNED_SPECS.map((spec) =>
      resolveGoverned(spec, { env: env[spec.key], stored: null }),
    ),
  };
}

/**
 * One key, resolved. The function every reader of a governed variable calls.
 *
 * It reads the whole table rather than the one row because the table is four rows wide and a
 * per-key query would put a round trip behind every field; a caller resolving several keys should
 * use `resolveSettingValues` so the read happens once.
 */
export async function resolveSetting(key: string): Promise<GovernedResolution> {
  const spec = requireSpec(key);
  const { values } = await readStoredSettings();
  return resolveGoverned(spec, { env: process.env[spec.key], stored: values[spec.key] ?? null });
}

/**
 * The winning value for each key asked for, with one read.
 *
 * Type is `Record<string, string>` rather than a mapped type per call site: the keys are checked
 * when the caller is written (`governedSpecOf` returns null for anything else), and a narrowed
 * record would put the governance vocabulary in every import.
 */
export async function resolveSettingValues(
  keys: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const specs = keys.map(requireSpec);
  const { values } = await readStoredSettings();
  const resolved: Record<string, string> = {};
  for (const spec of specs) {
    resolved[spec.key] = resolveGoverned(spec, {
      env: process.env[spec.key],
      stored: values[spec.key] ?? null,
    }).value;
  }
  return resolved;
}

/** The spec for a key, or a throw that names the key — a caller asked for something that is not governed. */
function requireSpec(key: string): GovernedSpec {
  const spec = governedSpecOf(key);
  if (spec === null) {
    throw new Error(
      `settings: "${key}" is not a governed setting (see lib/admin/settings/governed.ts)`,
    );
  }
  return spec;
}

/* ------------------------------------------------------------------ *
 * Refusals
 * ------------------------------------------------------------------ */

/** Why a write was refused. Defined beside the URL status channel that carries it to the screen. */
export type { SettingRefusal } from "@/lib/admin/settings/status";

/**
 * A refused write: nothing ran, nothing was written.
 *
 * A distinct type rather than a bare `Error` so the server action can map it to a sentence on the
 * screen and a test can assert the *reason* rather than the wording of one.
 */
export class SettingRefused extends Error {
  readonly reason: SettingRefusal;

  constructor(reason: SettingRefusal, message: string) {
    super(message);
    this.name = "SettingRefused";
    this.reason = reason;
  }
}

/**
 * Is this manifest row's declared source the vault, in any environment?
 *
 * `source` is the one answer that serves all three environments and `sources` is the per-environment
 * override, so a row can be vault-sourced in production and carried locally (the webhook secret is
 * exactly that shape). Both are checked: a name that is a secret anywhere is a secret.
 */
function isVaultSourced(row: EnvRow): boolean {
  const sources = [row.source, ...Object.values(row.sources ?? {})];
  return sources.some((source) => source !== undefined && "vault" in source);
}

/**
 * Can this key be written here? `null` when it can, the refusal otherwise.
 *
 * Four answers, in the order that matters:
 *
 *   - **`vault-sourced`** — the name is in the env manifest and its declared source is the vault.
 *     This is the card's "no secret is readable or writable here": `RESEND_API_KEY` is refused by
 *     name, with a sentence that says why, and never by a convention the next reader has to know.
 *   - **`fixed-by-deployment`** — governed, but `fixedBy` says a stored value could not be obeyed
 *     (`NAV_SOURCE`, `DEMO_ALLOW_PRODUCTION`). The reason is the spec's, not a second copy of it.
 *   - **`unknown-key`** — not in the governed set and not a vault secret: a typo, or a variable
 *     this surface has no business writing.
 *   - **`null`** — one of the four.
 */
export function refusalFor(key: string): SettingRefused | null {
  const spec = governedSpecOf(key);
  const row = ENV_ROWS.find((entry) => entry.name === key);
  if (row !== undefined && isVaultSourced(row)) {
    return new SettingRefused(
      "vault-sourced",
      `${key} is a vault-sourced secret, and settings never store or return one`,
    );
  }
  if (spec === null) {
    return new SettingRefused(
      "unknown-key",
      `${key} is not a governed setting, so this form has nothing it could store`,
    );
  }
  if (spec.fixedBy !== null) {
    return new SettingRefused(
      "fixed-by-deployment",
      `${key} cannot be overridden at runtime: ${spec.fixedBy}`,
    );
  }
  return null;
}

/**
 * The value to store, or a refusal.
 *
 * **An empty string clears the row** rather than storing `""`: a stored empty string is the same
 * thing as no row under the precedence (both lose to the default), but only one of them is
 * legible in the table. The form's Clear control posts an empty field, and this is what makes it
 * mean "go back to the environment or the default".
 */
export function valueToStore(
  spec: GovernedSpec,
  raw: string,
): { readonly stored: string | null } | SettingRefused {
  const trimmed = raw.trim();
  if (trimmed === "") return { stored: null };

  const problem = problemFor(spec, trimmed);
  if (problem !== null) return new SettingRefused("invalid-value", problem);
  return { stored: trimmed };
}

/** The refusal sentence for a value that does not parse, or `null`. Same vocabulary as `governed.ts`. */
function problemFor(spec: GovernedSpec, value: string): string | null {
  if (spec.kind === "count" && !/^\d+$/.test(value)) {
    return `${spec.key} takes a whole number of ${spec.unit ?? "units"}, and "${value}" is not one`;
  }
  if (spec.kind === "text" && value.length > 200) {
    return `${spec.key} takes a single token under 200 characters, and this value is ${value.length}`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** What a successful write answers. `actionId` is the audit row, so a caller can link to it. */
export interface SettingWriteResult {
  readonly actionId: string;
  readonly key: string;
  /** The stored value before this write, `null` when nothing was stored. */
  readonly before: string | null;
  /** The stored value after it, `null` when the row was cleared. */
  readonly after: string | null;
}

/** One audited write. `actorUserId` comes from the session; there is no actor role field. */
export interface SettingWriteRequest {
  readonly actorUserId: string;
  readonly key: string;
  readonly value: string;
  readonly reason?: string;
}

/** The row as it was, for the transaction's read: `null` when the key has no row. */
const SELECT_SETTING_SQL = "SELECT value FROM setting WHERE key = $1 FOR UPDATE";

const UPSERT_SETTING_SQL = `
  INSERT INTO setting (key, value, updated_at, updated_by)
  VALUES ($1, $2::jsonb, now(), $3)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
  RETURNING updated_at::text AS updated_at`;

const DELETE_SETTING_SQL =
  "DELETE FROM setting WHERE key = $1 RETURNING updated_at::text AS updated_at";

/** The stored value a `SELECT`/`RETURNING` row carries, as a string or `null`. */
function storedValueOf(row: { value?: unknown } | undefined): string | null {
  if (row === undefined) return null;
  const value = row.value;
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/**
 * Store one governed value through `act()`.
 *
 * The order is the contract: refuse a key this module has no business writing (before any
 * statement), refuse a value that would not parse (also before any statement), then let `act()`
 * read the actor's rung inside the transaction and run `mutate`, which reads the old row
 * `FOR UPDATE` so the `before` it reports is the row the write actually replaced.
 *
 * **Clearing is a delete, not an empty string** — see `valueToStore`. `after` is `null` for that
 * write, and `act()` stores it as JSONB NULL, which the audit log renders as "there is nothing
 * here" rather than as an empty value.
 */
export async function writeSetting(
  request: SettingWriteRequest,
  runner: ActTransactionRunner = POOL_RUNNER,
): Promise<SettingWriteResult> {
  const refusal = refusalFor(request.key);
  if (refusal !== null) throw refusal;

  const spec = requireSpec(request.key);
  const decided = valueToStore(spec, request.value);
  if (decided instanceof SettingRefused) throw decided;

  const result = await act<string | null>(
    {
      actorUserId: request.actorUserId,
      action: "setting.update",
      target: { table: "setting", id: spec.key },
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      mutate: async (sql) => {
        const existing = await sql.query<{ value: unknown }>(SELECT_SETTING_SQL, [spec.key]);
        const before = storedValueOf(existing.rows[0]);

        if (decided.stored === null) {
          await sql.query(DELETE_SETTING_SQL, [spec.key]);
          return { before, after: null };
        }

        const written = await sql.query<{ updated_at: string }>(UPSERT_SETTING_SQL, [
          spec.key,
          JSON.stringify(decided.stored),
          request.actorUserId,
        ]);
        if (written.rows.length === 0) {
          throw new Error("settings: the write returned no row — the transaction was rolled back");
        }
        return { before, after: decided.stored };
      },
    },
    runner,
  );

  return {
    actionId: result.actionId,
    key: spec.key,
    before: result.before as string | null,
    after: result.after,
  };
}

/** The keys a form may draw a field for, in registry order. */
export const WRITABLE_SETTING_KEYS: readonly string[] = WRITABLE_KEYS;
