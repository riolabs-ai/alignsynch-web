/**
 * operator-graph — the dependency arrow around the operator surface, as data.
 *
 * `docs/specs/operator-separation-adr.md` §4.2 draws one arrow and forbids the other:
 *
 * ```text
 *   operator surface  ──may read──▶  content/**  lib/operator/read.ts  data/{admin,spec,pages/admin-*}
 *   product surface   ──may NOT──▶  lib/operator/**  components/operator/**
 * ```
 *
 * A convention cannot hold that line: the interesting failures are one import line in one file,
 * they typecheck, they build, and they only show up as "why does the console break when we change
 * the dashboard". So the rule is a graph question and this module answers it — pure, over
 * `{ file → source }`, with no filesystem and no repository side effects, exactly like
 * `scripts/client-graph.ts` (E34) and `scripts/brand-word.ts` (E37). Extraction (comment
 * stripping, `import type` vs a value import, `@/` and relative resolution) is *reused* from
 * `client-graph.ts` rather than written twice: a second parser is a second place for a bug.
 *
 * Two directions, and they are not symmetric:
 *
 *   1. **operator → product is forbidden.** An operator file may not import `app/**` (any page,
 *      layout, route or action module) or a `components/**` module outside `components/admin/**`,
 *      `components/ui/**` and `components/operator/**`. This is the arrow the seam exists for: the
 *      operator tooling must be able to change without editing the user platform.
 *   2. **operator-owned code → internals is forbidden, except through the contract.** Outside
 *      `lib/operator/read.ts`, no module under `lib/operator/**` or `components/operator/**` may
 *      import `lib/db/**`, `lib/docs/**`, `lib/spec/**`, `lib/review/**`, `lib/admin/**` or `pg`.
 *      The pages themselves still read some of those today; moving them is the burn-down
 *      (`seam-3`), and the rule is already true for every module this seam owns.
 *   3. **product → operator is forbidden, value *or* type.** A product module that imports an
 *      operator type is already shaped by the tooling — the type import is the thin end of the
 *      coupling, so it is caught the same as a value import.
 *
 * A type import is otherwise treated exactly as `client-graph.ts` treats it: `import type` is
 * erased and is legal *within* the operator surface (`lib/operator/read.ts` exports types the
 * console imports), but it never escapes rule 3, because that rule is about the direction.
 *
 * The baseline is the mechanism that lets the rule land green on a tree that already violates it:
 * `tests/fixtures/operator-seam-baseline.json` lists the measured rows, `baselineDiff()` reports
 * what is new and what is stale, and the test fails on both. A baseline that can only shrink is a
 * burn-down list; a baseline that can be appended to is an allowlist, and the card forbids that.
 */
import { moduleImports, resolveSpecifier } from "./client-graph";

/** One import edge out of an operator file, resolved as far as the tree allows. */
export interface OperatorEdge {
  /** The importer, repo-relative. */
  readonly file: string;
  /** The specifier exactly as written. */
  readonly specifier: string;
  /** The repo path it names, or `null` for a bare package or an unresolvable path. */
  readonly resolved: string | null;
  /** `type` for `import type` / an all-`type` named list — erased, but still a direction. */
  readonly kind: "value" | "type";
}

/** Which rule a finding breaks. Printed, so a baseline row is readable without the test source. */
export type SeamRule =
  /** An operator file imports the product shell (`app/**`, a non-operator `components/**`). */
  | "operator-reads-product"
  /** Operator-owned code reaches an internal layer instead of going through `read.ts`. */
  | "operator-reads-internals"
  /** A product file imports `lib/operator/**` or `components/operator/**`, value or type. */
  | "product-reads-operator";

/** One violation: the rule, the file, and the edge that broke it. */
export interface SeamViolation {
  readonly rule: SeamRule;
  readonly file: string;
  readonly specifier: string;
  readonly resolved: string | null;
  readonly kind: "value" | "type";
}

/** The enumerated surface, as `lib/operator/routes.ts` states it. */
export interface OperatorSurface {
  readonly pageFiles: readonly string[];
  readonly actionFiles: readonly string[];
}

/** Directories whose modules are the operator's own — imported freely by operator code. */
export const OPERATOR_COMPONENT_ROOTS: readonly string[] = [
  "components/admin/",
  "components/operator/",
];

/** The shared primitives: a `<Button>` is not the product's domain, it is the design system's. */
export const SHARED_COMPONENT_ROOTS: readonly string[] = ["components/ui/"];

/** Operator-owned code, as opposed to an operator *page* that still reads its own layer today. */
export const OPERATOR_OWNED_ROOTS: readonly string[] = ["lib/operator/", "components/operator/"];

/** The one module allowed to reach the internals, and therefore the only door an operator has. */
export const READ_CONTRACT = "lib/operator/read.ts";

/** Layers only the read contract may import. */
export const OPERATOR_INTERNALS: readonly string[] = [
  "lib/db/",
  "lib/docs/",
  "lib/spec/",
  "lib/review/",
  "lib/admin/",
];

/** Bare packages that are the database layer, judged by name because they resolve to nothing here. */
export const INTERNAL_PACKAGES: readonly string[] = ["pg", "pg-native", "pg-pool", "pg-protocol"];

/** The product tree: the modules rule 3 walks. `tests/` and `scripts/` are not product code. */
export const PRODUCT_ROOTS: readonly string[] = ["app/", "components/", "lib/", "data/"];

/** Directories under a product root that are never part of the walk (vendored, generated). */
export const SKIPPED_ROOTS: readonly string[] = [
  "lib/quizhub/",
  "data/generated/",
  "components/operator/",
];

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value === prefix || value.startsWith(prefix));
}

/** `@/lib/x` and `lib/x` are the same module; `pg` is a package and stays as written. */
function targetOf(edge: OperatorEdge): string {
  if (edge.resolved !== null) return edge.resolved;
  return edge.specifier.startsWith("@/") ? edge.specifier.slice(2) : edge.specifier;
}

/**
 * Is this path part of the operator surface?
 *
 * Three ways in, and they are all declarative: the enumerated page and action modules, the
 * operator's own component and module directories. A file that is none of those is product code,
 * which is what rule 3 needs to know.
 */
export function isOperatorFile(file: string, surface: OperatorSurface): boolean {
  return (
    surface.pageFiles.includes(file) ||
    surface.actionFiles.includes(file) ||
    startsWithAny(file, [...OPERATOR_COMPONENT_ROOTS, ...OPERATOR_OWNED_ROOTS])
  );
}

/** Every import edge out of every operator file, in source order. */
export function operatorEdges(input: {
  readonly sources: Readonly<Record<string, string>>;
  readonly surface: OperatorSurface;
}): OperatorEdge[] {
  const known = new Set(Object.keys(input.sources));
  const edges: OperatorEdge[] = [];

  for (const [file, source] of Object.entries(input.sources)) {
    if (!isOperatorFile(file, input.surface)) continue;
    for (const found of moduleImports(source)) {
      edges.push({
        file,
        specifier: found.specifier,
        resolved: resolveSpecifier(found.specifier, file, known),
        kind: found.runtime ? "value" : "type",
      });
    }
  }

  return edges;
}

/** Which rule (if any) one operator edge breaks. `null` when the edge is legal. */
function operatorRuleOf(edge: OperatorEdge, surface: OperatorSurface): SeamRule | null {
  const target = targetOf(edge);

  // An operator page's own write module is operator code, not the product: `./actions` beside
  // billing's page is the action that page's buttons call. Both are declared in the surface, so
  // this is the one `app/**` import an operator file may make.
  if (surface.pageFiles.includes(target) || surface.actionFiles.includes(target)) return null;

  if (target.startsWith("app/")) return "operator-reads-product";
  if (
    target.startsWith("components/") &&
    !startsWithAny(target, [...OPERATOR_COMPONENT_ROOTS, ...SHARED_COMPONENT_ROOTS])
  ) {
    return "operator-reads-product";
  }

  const owned = startsWithAny(edge.file, OPERATOR_OWNED_ROOTS);
  if (!owned || edge.file === READ_CONTRACT) return null;
  if (INTERNAL_PACKAGES.includes(target) || startsWithAny(target, OPERATOR_INTERNALS)) {
    return "operator-reads-internals";
  }
  return null;
}

/**
 * Every violation in the tree, sorted by file then specifier.
 *
 * Sorted because a baseline diff read by a human should be stable across runs: an unsorted set
 * turns a one-row addition into a whole-block rewrite in the printed census.
 */
export function seamViolations(input: {
  readonly sources: Readonly<Record<string, string>>;
  readonly surface: OperatorSurface;
}): SeamViolation[] {
  const violations: SeamViolation[] = [];

  for (const edge of operatorEdges(input)) {
    const rule = operatorRuleOf(edge, input.surface);
    if (rule === null) continue;
    violations.push({ rule, ...edge });
  }

  // Rule 3 — the reverse arrow. Every product module, value or type.
  const known = new Set(Object.keys(input.sources));
  for (const [file, source] of Object.entries(input.sources)) {
    if (!startsWithAny(file, PRODUCT_ROOTS) || startsWithAny(file, SKIPPED_ROOTS)) continue;
    if (isOperatorFile(file, input.surface)) continue;
    for (const found of moduleImports(source)) {
      const resolved = resolveSpecifier(found.specifier, file, known);
      const target = resolved ?? (found.specifier.startsWith("@/") ? found.specifier.slice(2) : "");
      if (!startsWithAny(target, OPERATOR_OWNED_ROOTS)) continue;
      violations.push({
        rule: "product-reads-operator",
        file,
        specifier: found.specifier,
        resolved,
        kind: found.runtime ? "value" : "type",
      });
    }
  }

  return violations.sort((left, right) =>
    left.file === right.file
      ? left.specifier.localeCompare(right.specifier)
      : left.file.localeCompare(right.file),
  );
}

/** The baseline as the fixture states it: file → the specifiers that file may still import. */
export type SeamBaseline = Readonly<Record<string, readonly string[]>>;

/**
 * What the baseline says versus what the tree does.
 *
 * `unlisted` is a violation nobody wrote down — the failure this whole file exists for. `stale` is
 * a baseline row that is no longer a violation: the burn-down went one row further than the file
 * says, or the file rotted against a tree that moved. Both fail the test, because a baseline that
 * may be widened in place is an allowlist, and one that is never re-read is dead weight a reviewer
 * trusts for no reason.
 */
export function baselineDiff(
  violations: readonly SeamViolation[],
  baseline: SeamBaseline,
): { readonly unlisted: readonly SeamViolation[]; readonly stale: readonly string[] } {
  const allowed = new Set<string>();
  for (const [file, specifiers] of Object.entries(baseline)) {
    for (const specifier of specifiers) allowed.add(`${file}\u0000${specifier}`);
  }

  const measured = new Set<string>();
  const unlisted: SeamViolation[] = [];
  for (const violation of violations) {
    const key = `${violation.file}\u0000${violation.specifier}`;
    measured.add(key);
    if (!allowed.has(key)) unlisted.push(violation);
  }

  const stale = [...allowed]
    .filter((key) => !measured.has(key))
    .map((key) => key.replace("\u0000", " → "));
  return { unlisted, stale };
}

/** The one-line census the test prints every run: walked files, violations, allowlisted rows. */
export function censusOf(input: {
  readonly sources: Readonly<Record<string, string>>;
  readonly surface: OperatorSurface;
  readonly violations: readonly SeamViolation[];
  readonly baseline: SeamBaseline;
}): string {
  const operatorFiles = Object.keys(input.sources).filter((file) =>
    isOperatorFile(file, input.surface),
  ).length;
  const allowed = Object.values(input.baseline).reduce((sum, rows) => sum + rows.length, 0);
  return `${operatorFiles} operator files walked, ${input.violations.length} violations, ${allowed} allowlisted`;
}
