/**
 * `.env.local` → `process.env`, for the node scripts (#145).
 *
 * Next loads `.env*` itself; a plain `node scripts/x.mjs` does not. The file is gitignored and
 * is written by `neon env pull` (bare values) and by `pnpm env:render` (single-quoted values), so
 * this reader is the only thing that has to know its shape — it is deliberately not a dotenv: no
 * expansion, no `export` keywords, and the quoting rule is the renderer's own. See
 * `formatEnvLine` / `parseEnvValue` in `scripts/env-manifest.ts`: a value is a **single-quoted
 * shell literal**, an embedded `'` written `'\''`, and this reader undoes exactly that. Bare and
 * double-quoted values are still read literally, because `neon env pull` writes bare ones.
 *
 * Getting this wrong is not cosmetic: the file is also sourced by bash (`withenv.sh`,
 * `set -a; . ./.env.local`), so a value the reader accepts but the shell truncates is a
 * half-loaded environment — which is how the v2.1.0 cut's check 8 failed on a URL's `&` (#1422).
 *
 * Nothing here prints a value. A missing variable is reported by name only.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root — every path in a `db:*` script is relative to this. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * One value, in the syntax `formatEnvLine` in `scripts/env-manifest.ts` writes — the authority for
 * this file's shape, and the reason this reader is not a dotenv.
 *
 * `pnpm env:render` writes every value single-quoted (`NAME='…'`) so that `. ./.env.local` in bash
 * loads it whole; an embedded `'` is written `'\''`. Bare values stay bare, because `neon env pull`
 * writes those too.
 */
function unquote(raw) {
  const value = raw.trim();
  if (value.length < 2) return value;
  const first = value[0];
  if (value[value.length - 1] !== first) return value;
  if (first === "'") return value.slice(1, -1).replaceAll("'\\''", "'");
  if (first === '"') return value.slice(1, -1).replaceAll('\\"', '"');
  return value;
}

function parseEnv(text) {
  const entries = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!KEY.test(key)) continue;
    entries.set(key, unquote(line.slice(separator + 1)));
  }
  return entries;
}

/**
 * Loads `.env.local` then `.env`, in that order. An already-set variable wins unless
 * `override` is true, so `DATABASE_URL=… pnpm db:migrate` tests one branch without editing the
 * file.
 */
export function loadEnv({ files = [".env.local", ".env"], override = false } = {}) {
  const loaded = [];
  for (const file of files) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of parseEnv(readFileSync(path, "utf8"))) {
      const current = process.env[key];
      if (!override && current !== undefined && current !== "") continue;
      process.env[key] = value;
    }
    loaded.push(file);
  }
  return loaded;
}

/** The first of these variables that is set and non-empty; otherwise a named error. */
export function requireVariable(names) {
  for (const name of [names].flat()) {
    const value = process.env[name]?.trim();
    if (value !== undefined && value !== "") return value;
  }
  throw new Error(
    `${[names].flat().join(" / ")} is not set — run \`neon env pull\` in the repo root, or export it`,
  );
}

/**
 * The connection string for a write path.
 *
 * `db:migrate` and `db:seed` want the **unpooled** (direct) URL: a migration is a transaction
 * over DDL and a seed wants plain `INSERT … ON CONFLICT`, neither of which belongs behind a
 * transaction-mode pooler. The runtime pool uses the pooled one.
 */
export function writeDatabaseUrl() {
  return requireVariable(["DATABASE_URL_UNPOOLED", "DATABASE_URL"]);
}
