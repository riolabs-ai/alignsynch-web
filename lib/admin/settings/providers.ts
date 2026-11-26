/**
 * The settings directory — the words-to-rows half (#1443).
 *
 * **What the page answers.** For every provider this application actually depends on: who the
 * account is, whether every variable it needs is declared, present and fresh, and where a person
 * would go to change it. Three questions, no fourth — it is not a secret reader, not a secret
 * writer, and not a second source of truth.
 *
 * **Project-agnostic by construction (spec §5a).** This module imports **no** registry and no
 * fixture: the integrations arrive as `SettingsInput.integrations`, the rows as
 * `SettingsInput.rows`, and the two readings as `census` and `rotations`. Nothing here names
 * `data/integrations.ts`, this tree's routes or its tables, which is what makes the surface
 * transferable to the next expression of the core — a second client passes its own registry and its
 * own tables and gets the same directory. `SettingsIntegration` below is the whole contract a
 * registry has to satisfy, and `data/integrations.ts` satisfies it structurally, without importing
 * this file and without this file importing it.
 *
 * **This module touches no filesystem and no network.** `lib/admin/settings/read.ts` owns the three
 * reads (`scripts/env-manifest.ts`'s table, `docs/operations/env-stores.md`'s census and
 * `data/env/rotations.json`'s ledger); this half is pure so the row shape, the badges and the counts
 * are derivable and testable without a tree — the same split `lib/admin/crud-matrix.ts` /
 * `crud-matrix-file.ts` makes, and for the same E34 reason: a `"use client"` module that
 * value-imports the reader pulls `node:fs` into the browser graph and every route behind the shell
 * answers 500 at request time while `next build` stays green.
 *
 * **Grouping is total, and an unplaceable row fails by name.** `providerOf` is the only way a row
 * becomes a variable on the page: a row naming no provider, or naming an id the registry passed in
 * does not carry, throws `SettingsUnplaceable` with the row's own name. There is no `general`
 * bucket, for the reason `lib/admin/crud-matrix.ts` refuses an unknown column — a fallback makes a
 * forgotten edit look like a finished screen. `pnpm env:check` already holds the other two
 * directions of this table honest (a name read and not declared, a row nothing reads); this is the
 * third, and `tests/admin-settings-providers.test.ts` drives it over the real table as well as over
 * a synthetic one.
 *
 * **Four badges, each from one source, and none of them invented.**
 *
 * | badge      | source                   | rule                                                                      |
 * | ---------- | ------------------------ | ------------------------------------------------------------------------- |
 * | `declared` | the manifest             | the row exists, so the code reads it and this table owns it                |
 * | `present`  | the store census         | that environment's own file (or the vault) holds the name                  |
 * | `fresh`    | the rotation ledger      | the census was recorded on or after the rotation that governs the name     |
 * | `valid`    | the census's vault walk  | `readable` / `empty` / `unreachable` / `absent` — a fact, never `ok`       |
 *
 * `valid` is the vault half of "is this credential usable", and it needs no provider call: the
 * census already walked the Bitwarden project and wrote a cell per name (`+` readable, `o` present
 * and empty, `·` absent, `?` store unread), plus one `Vault: N secret(s) readable` line for the
 * project itself. So the badge is a **measurement with a date**, not a probe: it says what the vault
 * answered on the census's day. A live check that Resend or Neon *accepts* the key is phase 2
 * (spec §8.2) and this screen never implies one ran.
 *
 * `fresh` is the other badge with an honest limit, and it says so rather than guessing: the census
 * is a **snapshot** with a date, and the ledger records *when a credential set changed*. So a name
 * the ledger governs is `current` only when the census was recorded at or after that change —
 * otherwise the snapshot predates the rotation and the page prints `stale`, which is exactly what it
 * can prove. A name no rotation governs is `not measured`, never `fresh`: nobody measured it.
 *
 * **Presence is per environment, and "unchecked" is a state.** A declared row that the census does
 * not list is `unknown` (the census records a subset of the table's names, so absence from it is
 * common and is not a claim that the value is missing). An out-of-scope name is `unknown` too, and
 * says why: it is a knob, a CI variable or a platform value, so no deployment's file holds it.
 */
import type { EnvironmentId, Requirement, Source } from "@/scripts/env-manifest";

/** The three deployments, in the manifest's order. The contract a registry's `account` satisfies. */
export const SETTINGS_ENVIRONMENTS: readonly EnvironmentId[] = ["local", "preview", "production"];

/**
 * One provider, as this module needs it — the **structural** contract `data/integrations.ts`
 * satisfies. Deliberately local: a generic module that imported the registry would be this tree's
 * directory rather than a directory.
 */
export interface SettingsIntegration {
  readonly id: string;
  readonly label: string;
  readonly actor: string;
  readonly tool: string;
  /** One line: what the account holds, in the product's own words. */
  readonly holds: string;
  /** Who the account is, per deployment. Never a secret. */
  readonly account: Readonly<Record<EnvironmentId, string>>;
  /** Where its keys are managed — an address that leaves the app. */
  readonly console: string;
  /** The provider's own documentation. */
  readonly docs: string;
}

/**
 * What a row's value is *not*. Never a value, never a truncation, never a length — a source label
 * names where it lives, which is the whole of what this screen may say about a secret.
 */
export type SourceKind = "vault" | "literal" | "derived" | "carried" | "default" | "mixed";

/** Whether a store holds the name for one deployment. `unknown` is not `absent`. */
export type Presence = "present" | "empty" | "absent" | "unknown";

/** The freshness rule's three answers. `not measured` is a statement, not a failure. */
export type Freshness = "current" | "stale" | "not measured";

/**
 * The vault's answers about a name, read from the census — plus `not measured` when there is no
 * census at all. A provider probe is phase 2; this badge never implies one ran.
 */
export type Validity = "readable" | "empty" | "unreachable" | "absent" | "not measured";

/** A row the table knows and no provider can be named for. The failure this module exists to raise. */
export class SettingsUnplaceable extends Error {
  constructor(
    readonly name: string,
    readonly reason: string,
  ) {
    super(`settings: ${name} — ${reason}`);
    this.name = "SettingsUnplaceable";
  }
}

/** One rotation set, as `data/env/rotations.json` records it: dates and names, never a value. */
export interface RotationSet {
  readonly id: string;
  /** ISO date the credential set changed. */
  readonly changedAt: string;
  readonly why: string;
  readonly names: readonly string[];
  readonly platform: readonly string[];
  readonly prefixes: readonly string[];
}

/** One store-census row: what the generated page says about one name, for one store column. */
export interface CensusRow {
  readonly name: string;
  /** `cells[store]` is `+` (present), `o` (present but empty), `·` (absent) or `?` (unread). */
  readonly cells: Readonly<Record<string, string>>;
  /** The census's own `row` column: whether a manifest row declares the name. */
  readonly declaredByRow: boolean;
}

/** The census as read: its own recorded date, its matrix and its findings table. */
export interface CensusSnapshot {
  /** The `Generated <date>` line's instant — the snapshot's own date, printed on the page. */
  readonly recordedAt: string;
  readonly names: readonly CensusRow[];
  /** `finding → number`, in the page's own order. */
  readonly findings: readonly { readonly finding: string; readonly count: number }[];
  /** How many store columns the census walked. */
  readonly stores: number;
  /**
   * The census's own `Vault: N secret(s) readable in project …` line: `null` when the line is
   * absent, which is the one honest answer to "could this deployment read the vault at all".
   */
  readonly vaultReadable: number | null;
}

/** The manifest's two tables and the two readings — the reader's output, and this module's input. */
export interface SettingsInput {
  readonly integrations: readonly SettingsIntegration[];
  readonly rows: readonly {
    readonly name: string;
    readonly boot: boolean;
    readonly environments: Readonly<Record<EnvironmentId, Requirement>>;
    readonly source?: Source;
    readonly sources?: Partial<Record<EnvironmentId, Source>>;
    readonly why: string;
    readonly provider?: string;
  }[];
  readonly outOfScope: readonly {
    readonly name: string;
    readonly why: string;
    readonly provider?: string;
  }[];
  readonly census: CensusSnapshot | null;
  readonly rotations: readonly RotationSet[];
}

/** One variable on the page: its source and its four badges, and no value of any kind. */
export interface SettingsVariable {
  readonly name: string;
  readonly provider: string;
  /** True when a manifest row declares it; false for an out-of-scope name. */
  readonly declared: boolean;
  readonly boot: boolean;
  readonly environments: Readonly<Record<EnvironmentId, Requirement>>;
  /** `vault ALIGNSYNCH_X`, `literal`, `derived · package.json:version`, … — never a value. */
  readonly source: string;
  readonly sourceKind: SourceKind;
  readonly why: string;
  readonly presence: Readonly<Record<EnvironmentId, Presence>>;
  readonly fresh: Freshness;
  /** The rotation set that governs it, by id — `null` when none does. */
  readonly rotation: string | null;
  readonly valid: Validity;
}

/** One provider's card: the registry row plus its variables and derived counts. */
export interface SettingsCard {
  readonly integration: SettingsIntegration;
  readonly variables: readonly SettingsVariable[];
  readonly counts: {
    readonly variables: number;
    /** Rows the manifest declares (the rest are out-of-scope names). */
    readonly declared: number;
    /** Names at least one store column holds. */
    readonly present: number;
    readonly stale: number;
    /** Vault keys the census read: the `valid` badge's `readable` state. */
    readonly readable: number;
    /** Names whose vault cell could not be read — the state a token fault shows up as. */
    readonly unreachable: number;
    readonly boot: number;
  };
}

/** One rotation set as the ledger band prints it: the dates and names, and how many rows it governs. */
export interface SettingsLedgerSet {
  readonly id: string;
  readonly changedAt: string;
  readonly why: string;
  /** Rows in this table the set governs — by name, by platform list, or by family prefix. */
  readonly governed: number;
}

/** Everything the page renders, derived once. */
export interface SettingsDirectory {
  readonly cards: readonly SettingsCard[];
  /** Census rows that no manifest row declares — the panel that would have caught incident 1. */
  readonly undeclared: readonly string[];
  readonly ledger: readonly SettingsLedgerSet[];
  readonly totals: {
    readonly variables: number;
    readonly declared: number;
    readonly outOfScope: number;
    readonly providers: number;
    readonly stale: number;
    readonly readable: number;
    readonly unreachable: number;
  };
  /** The date the census was recorded, or `null` when it could not be read. */
  readonly recordedAt: string | null;
  /** The census's own vault line, or `null` when it was not read. */
  readonly vaultReadable: number | null;
  /** How many names the census lists, or `null` when it could not be read. */
  readonly names: number | null;
  readonly stores: number | null;
  readonly findings: readonly { readonly finding: string; readonly count: number }[];
}

/**
 * The provider a row belongs to — the only door a row has onto the page.
 *
 * Total over the registry by construction and refusing by name otherwise: no provider is
 * `SettingsUnplaceable(<name>, "names no provider …")`, and an id no `SettingsIntegration` carries is
 * `SettingsUnplaceable(<name>, "names provider <id>, which the integration registry does not
 * carry")`. Both quote the row, because a diagnostic that says "an unknown provider" sends the
 * reader to a search.
 */
export function providerOf(
  row: { readonly name: string; readonly provider?: string },
  integrations: readonly SettingsIntegration[],
): string {
  if (row.provider === undefined) {
    throw new SettingsUnplaceable(row.name, "names no provider — add it to its run in ENV_ROWS");
  }
  const known = integrations.some((integration) => integration.id === row.provider);
  if (!known) {
    throw new SettingsUnplaceable(
      row.name,
      `names provider "${row.provider}", which the integration registry does not carry`,
    );
  }
  return row.provider;
}

/** One source, as the screen may say it: the kind, and the vault key or derivation it names. */
function describeSource(source: Source | undefined): { label: string; kind: SourceKind } {
  if (source === undefined)
    return { label: "no source · the application's own default", kind: "default" };
  if ("vault" in source) return { label: `vault ${source.vault}`, kind: "vault" };
  if ("literal" in source)
    return { label: "literal · this repository owns the value", kind: "literal" };
  if ("derived" in source) return { label: `derived · ${source.derived}`, kind: "derived" };
  return { label: "carried · the environment's own file", kind: "carried" };
}

/**
 * The row's source cell, over all three deployments.
 *
 * One answer serves three environments unless the row splits — `DATABASE_URL` is the case the row
 * type exists for. A split row prints each distinct answer with the deployments it covers, which is
 * what makes "production reads a different vault key" visible on one line without a second table.
 */
export function sourceSummary(row: SettingsInput["rows"][number]): {
  label: string;
  kind: SourceKind;
} {
  const perEnvironment = SETTINGS_ENVIRONMENTS.map(
    (environment) => row.sources?.[environment] ?? row.source,
  );
  const described = perEnvironment.map(describeSource);
  const distinct = new Map<string, { kind: SourceKind; environments: EnvironmentId[] }>();
  described.forEach((entry, index) => {
    const environment = SETTINGS_ENVIRONMENTS[index];
    if (environment === undefined) return;
    const existing = distinct.get(entry.label);
    if (existing === undefined)
      distinct.set(entry.label, { kind: entry.kind, environments: [environment] });
    else existing.environments.push(environment);
  });

  if (distinct.size === 1) {
    const [only] = [...distinct.values()];
    const [label] = [...distinct.keys()];
    if (only === undefined || label === undefined) {
      return { label: "no source · the application's own default", kind: "default" };
    }
    return { label, kind: only.kind };
  }

  const parts = [...distinct.entries()].map(
    ([label, entry]) => `${label} (${entry.environments.join(", ")})`,
  );
  return { label: parts.join(" · "), kind: "mixed" };
}

/** One census cell, as the census wrote it — `unknown` when the store could not be read. */
function censusCell(census: CensusSnapshot, name: string, store: string): Presence {
  const row = census.names.find((entry) => entry.name === name);
  if (row === undefined) return "unknown";
  const cell = row.cells[store];
  if (cell === undefined || cell === "?") return "unknown";
  if (cell === "+") return "present";
  if (cell === "o") return "empty";
  return "absent";
}

/** Does this rotation set govern the name — by its own row, the platform list, or a family prefix? */
export function governs(rotation: RotationSet, name: string): boolean {
  return (
    rotation.names.includes(name) ||
    rotation.platform.includes(name) ||
    rotation.prefixes.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * The freshness badge: `current` only when a rotation governs the name *and* the census was
 * recorded no earlier than that change; `stale` when the snapshot predates it; `not measured` when
 * nobody has recorded a rotation for it. Never `fresh` on no evidence.
 */
export function freshnessOf(
  name: string,
  rotations: readonly RotationSet[],
  recordedAt: string | null,
): { fresh: Freshness; rotation: string | null } {
  const governing = rotations.filter((rotation) => governs(rotation, name));
  const latest = governing.reduce<RotationSet | null>(
    (newest, rotation) =>
      newest === null || rotation.changedAt > newest.changedAt ? rotation : newest,
    null,
  );
  if (latest === null) return { fresh: "not measured", rotation: null };
  if (recordedAt === null) return { fresh: "not measured", rotation: latest.id };
  // ISO dates compare lexically; the ledger and the census both write `YYYY-MM-DD`.
  return { fresh: recordedAt >= latest.changedAt ? "current" : "stale", rotation: latest.id };
}

/**
 * The vault half of validity, from the census alone.
 *
 * `unreachable` is the state a token fault shows up as, and it is derived two ways because the
 * census records it two ways: a `?` cell for one name, and — when the whole project could not be
 * read — no `Vault: N secret(s) readable` line at all. Either way the page prints the fact and never
 * `ok`: nobody has asked the *provider* anything.
 */
export function validityOf(name: string, census: CensusSnapshot | null): Validity {
  if (census === null) return "not measured";
  if (census.vaultReadable === null) return "unreachable";
  const row = census.names.find((entry) => entry.name === name);
  if (row === undefined) return "absent";
  const cell = row.cells.BWS;
  if (cell === undefined || cell === "?") return "unreachable";
  if (cell === "+") return "readable";
  if (cell === "o") return "empty";
  return "absent";
}

/** One declared row, as the page sees it. */
function variableOf(row: SettingsInput["rows"][number], input: SettingsInput): SettingsVariable {
  const source = sourceSummary(row);
  const { census } = input;
  const { fresh, rotation } = freshnessOf(row.name, input.rotations, census?.recordedAt ?? null);
  // The census's three file columns are the three deployments' own files: `.env.local` is the local
  // checkout, `.env.demo` the preview, `.env` production. Named by the column's own header, never by
  // position.
  const presence: Record<EnvironmentId, Presence> = {
    local: census === null ? "unknown" : censusCell(census, row.name, ".env.local"),
    preview: census === null ? "unknown" : censusCell(census, row.name, ".env.demo"),
    production: census === null ? "unknown" : censusCell(census, row.name, ".env"),
  };

  return {
    name: row.name,
    provider: providerOf(row, input.integrations),
    declared: true,
    boot: row.boot,
    environments: row.environments,
    source: source.label,
    sourceKind: source.kind,
    why: row.why,
    presence,
    fresh,
    rotation,
    valid: validityOf(row.name, census),
  };
}

/** One out-of-scope name, as the page sees it: not a deployment's, and not in any store. */
function outOfScopeVariable(
  row: SettingsInput["outOfScope"][number],
  input: SettingsInput,
): SettingsVariable {
  return {
    name: row.name,
    provider: providerOf(row, input.integrations),
    declared: false,
    boot: false,
    environments: { local: "optional", preview: "optional", production: "optional" },
    source: "not a deployment value · read by tooling, CI or the platform",
    sourceKind: "default",
    why: row.why,
    presence: { local: "unknown", preview: "unknown", production: "unknown" },
    fresh: "not measured",
    rotation: null,
    valid: validityOf(row.name, input.census),
  };
}

/**
 * The whole page, derived from the passes. Nothing here is authored twice: the cards are the
 * registry's order, a card's variables are the manifest's order inside that provider, and every
 * number in a counts line is a count over those rows.
 *
 * A provider registered with no variable keeps its card and says so in words — it is legal
 * (Google's OAuth client lives in Neon Auth, not in this tree) but it must not vanish from the page,
 * because "not listed" and "listed and empty" are different facts.
 */
export function buildDirectory(input: SettingsInput): SettingsDirectory {
  const variables: SettingsVariable[] = [
    ...input.rows.map((row) => variableOf(row, input)),
    ...input.outOfScope.map((row) => outOfScopeVariable(row, input)),
  ];

  const cards: SettingsCard[] = input.integrations.map((integration) => {
    const owned = variables.filter((variable) => variable.provider === integration.id);
    const present = owned.filter((variable) =>
      SETTINGS_ENVIRONMENTS.some((environment) => variable.presence[environment] === "present"),
    );
    return {
      integration,
      variables: owned,
      counts: {
        variables: owned.length,
        declared: owned.filter((variable) => variable.declared).length,
        present: present.length,
        stale: owned.filter((variable) => variable.fresh === "stale").length,
        readable: owned.filter((variable) => variable.valid === "readable").length,
        unreachable: owned.filter((variable) => variable.valid === "unreachable").length,
        boot: owned.filter((variable) => variable.boot).length,
      },
    };
  });

  const undeclared =
    input.census?.names.filter((row) => !row.declaredByRow).map((row) => row.name) ?? [];

  return {
    cards,
    undeclared,
    ledger: input.rotations.map((rotation) => ({
      id: rotation.id,
      changedAt: rotation.changedAt,
      why: rotation.why,
      governed: variables.filter((variable) => variable.rotation === rotation.id).length,
    })),
    totals: {
      variables: variables.length,
      declared: variables.filter((variable) => variable.declared).length,
      outOfScope: variables.filter((variable) => !variable.declared).length,
      providers: cards.length,
      stale: variables.filter((variable) => variable.fresh === "stale").length,
      readable: variables.filter((variable) => variable.valid === "readable").length,
      unreachable: variables.filter((variable) => variable.valid === "unreachable").length,
    },
    recordedAt: input.census?.recordedAt ?? null,
    vaultReadable: input.census?.vaultReadable ?? null,
    names: input.census?.names.length ?? null,
    stores: input.census?.stores ?? null,
    findings: input.census?.findings ?? [],
  };
}
