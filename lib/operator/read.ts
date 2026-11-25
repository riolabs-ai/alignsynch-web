/**
 * lib/operator/read.ts — the operator seam's one read contract.
 *
 * **The arrow.** Operator tooling may read through this module and nothing else: the pages, the
 * action modules, `components/admin/**` and `components/operator/**` are allowed to call
 * `*Facts()`, and they are not allowed to reach `lib/db/**`, `lib/docs/**`, `lib/spec/**`,
 * `lib/review/**` or `lib/admin/**` themselves (phase 2's burn-down cards move the call sites;
 * this file is the door they move to). The reverse is a hard rule from day one and this module is
 * why it can be: no product file imports `lib/operator/**`, because the product has no reason to
 * — the facts a page needs are its own, and the facts the console needs are here.
 *
 * **Facts, never handles.** Every export is plain data or a promise of it:
 *
 *   - no `pg` pool, no query builder, no `lib/db/**` type in a signature that a caller must pass
 *     back in, no connection string;
 *   - no component and no `ReactNode` — a fact is not a screen, and a module that exported one
 *     could not be lifted into a package without dragging React with it;
 *   - no path a caller can write through. `specFacts()` returns the parsed register, not the file
 *     path it read.
 *
 * **Failures are values.** `{ ok: true, rows } | { ok: false, reason }` — the shape
 * `/dashboard/templates` already uses for `DatabaseUnavailableError`, for the same reason: a
 * database or a file that does not answer must draw one panel, not a 500. Only the layer's own
 * "could not read" errors are answered this way, and anything else is rethrown, so a genuine bug
 * still surfaces instead of being reported as a missing file (the rule
 * `lib/spec/file.ts::readSpecValidationSafe` already keeps).
 *
 * **A thin pass-through on purpose.** This card's job is the boundary, not the rewrite: each
 * function below wraps the read the pages call today. Moving the pages onto it (seam-3) then
 * changes one import line per page, and the day a read has to change shape it changes in one
 * place.
 *
 * Server-only by construction: it reaches `lib/db/**` and the filesystem, so it must never be in a
 * client graph. The guard below turns a mistaken `"use client"` import into a named error at
 * import time rather than a bundle that fails to resolve at request time.
 */
import { CrudMatrixUnreadable, type CrudMatrixDocument } from "@/lib/admin/crud-matrix";
import { readCrudMatrix } from "@/lib/admin/crud-matrix-file";
import { type EmailTemplateListRow, listEmailTemplates } from "@/lib/admin/email-templates";
import type { AdminActionRow, AuditFilter } from "@/lib/admin/audit-log";
import type { SpecValidation } from "@/content/spec";
import { DatabaseUnavailableError } from "@/lib/db/client";
import { readAuditLog } from "@/lib/db/admin-audit";
import { type TemplateVersionSummary, listTemplateVersions } from "@/lib/db/template-versions";
import {
  type ReviewManifestEntry,
  ReviewManifestUnreadable,
  readReviewManifest,
} from "@/lib/review/artifacts";
import { readSpecValidationSafe } from "@/lib/spec/file";
import { type OperatorRouteFact, OPERATOR_ROUTES } from "@/lib/operator/routes";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/operator/read.ts is server-only: it reads the database and the filesystem. Read the facts in a server component and pass them down as props.",
  );
}

/**
 * One read's answer: the facts, or the reason there are none.
 *
 * A caller cannot receive a partial row set through this type — the union has no middle state,
 * which is the point. `rows` carries the payload for every read, including the two that return one
 * document rather than a list, so a renderer that draws "why is this empty" handles one shape.
 */
export type OperatorRead<T> =
  | { readonly ok: true; readonly rows: T }
  | { readonly ok: false; readonly reason: string };

/** The error's own sentence, which is what the panel prints. Never a stack and never a class name. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The operator surface itself — the route inventory, as facts.
 *
 * Synchronous and infallible: the set is code (`lib/operator/routes.ts`), so "the inventory could
 * not be read" is not a state that exists. A console that lists its own screens reads this rather
 * than the filesystem.
 */
export function routeFacts(): readonly OperatorRouteFact[] {
  return OPERATOR_ROUTES;
}

/**
 * The audit log, newest first, one page deep — the filter becomes `WHERE` clauses inside the
 * database layer, never a scan in a render.
 *
 * `reason` is the database layer's sentence (`DATABASE_URL is not set`, a statement timeout, a
 * connection reset), which is the one thing an operator can act on.
 */
export async function auditFacts(
  filter: AuditFilter,
): Promise<OperatorRead<readonly AdminActionRow[]>> {
  try {
    return { ok: true, rows: await readAuditLog(filter) };
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    return { ok: false, reason: reasonOf(error) };
  }
}

/** The project spec register — the parsed document, or the reason it could not be read. */
export function specFacts(): OperatorRead<SpecValidation> {
  const read = readSpecValidationSafe();
  if (read.doc === null) {
    return { ok: false, reason: read.reason ?? "the project spec register could not be read" };
  }
  return { ok: true, rows: read.doc };
}

/**
 * One template's published versions, newest first.
 *
 * Templates are product-authored but their *versions* are what an operator audits when a publish
 * has to be explained, so this is an operator fact: identifiers and timestamps, never a handle to
 * the row.
 */
export async function templateVersionFacts(
  templateRecordId: string,
): Promise<OperatorRead<readonly TemplateVersionSummary[]>> {
  try {
    return { ok: true, rows: await listTemplateVersions(templateRecordId) };
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    return { ok: false, reason: reasonOf(error) };
  }
}

/**
 * The review shelf — every published review artifact and the release it belongs to.
 *
 * The manifest is read against the artifact catalogue, so a row that describes an artifact nobody
 * published (or a published artifact nobody describes) is a failure, not a partial shelf: the
 * reason names which.
 */
export function reviewFacts(): OperatorRead<readonly ReviewManifestEntry[]> {
  try {
    return { ok: true, rows: [...readReviewManifest().values()] };
  } catch (error) {
    if (!(error instanceof ReviewManifestUnreadable)) throw error;
    return { ok: false, reason: reasonOf(error) };
  }
}

/** The CRUD and permissions matrix, parsed from its committed source. */
export function permissionsMatrixFacts(): OperatorRead<CrudMatrixDocument> {
  try {
    return { ok: true, rows: readCrudMatrix() };
  } catch (error) {
    if (!(error instanceof CrudMatrixUnreadable)) throw error;
    return { ok: false, reason: reasonOf(error) };
  }
}

/**
 * The transactional-mail register: one row per member-facing template, with the state of its most
 * recent override.
 *
 * A database that cannot answer is a failure and not an empty register — "no template has an
 * override" and "the overrides could not be read" are different statements, and the register half
 * of every row is code, so an empty list would look complete while the statuses were invented.
 */
export async function emailTemplateFacts(): Promise<OperatorRead<readonly EmailTemplateListRow[]>> {
  try {
    return { ok: true, rows: await listEmailTemplates() };
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    return { ok: false, reason: reasonOf(error) };
  }
}
