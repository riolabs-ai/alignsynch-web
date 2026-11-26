/**
 * `scripts/require-node.mjs` — refuse to run a script on a Node older than `engines.node` declares,
 * in one sentence, before the real script has a chance to fail in a way that reads as a code defect.
 *
 * Why this exists (#1410). `pnpm hygiene` on the system Node here (18.19.1) printed
 * `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` out of Node's module
 * loader: the script imports a `.ts` rules module, which Node 24 loads by stripping types and Node 18
 * cannot load at all. The script was fine, the tree was fine — the runtime was below the engine
 * `package.json` declares (`24.x`, `.nvmrc` `24`) — and nothing said so. Ten minutes went into the
 * wrong file. `pnpm release:check` fails the same host with `node: bad option:
 * --disable-warning=…`, which reads like the changelog disagreeing with the tree.
 *
 * The check has to happen in **two places**, because the command reaches the script two ways (#1410).
 *
 *   1. `pnpm <script>` runs a `pre<script>` hook first — a bare `node` with no flags, which even an
 *      old Node can do. That is the only layer that can refuse a command line carrying
 *      `--disable-warning=…`, because Node 18 treats that flag as a `bad option` and exits while
 *      parsing argv, before any file is read. Measured: pnpm 12.16.1 (this repo's pin) runs pre/post
 *      hooks by default, colon scripts included (`prehygiene:apply` fires for `hygiene:apply`).
 *   2. A **direct** `node scripts/repo-hygiene.mjs` has no hook at all, so each entry point calls
 *      `requireDeclaredNode()` itself — and loads its `.ts` rules module with a dynamic import
 *      *after* that call. The ordering is the whole point: Node resolves a static import while it
 *      links the module, before the first statement of the script body runs, so an entry point that
 *      held `import … from "./rules.ts"` still died in the loader with `ERR_UNKNOWN_FILE_EXTENSION`
 *      on 18 — the guard in #1412 could not fire on the path it was written for.
 *
 * Silent when the runtime is the declared one: this is a hook, not a banner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `24.x`, `24.*`, `24`, `^24.1.0`, `~24.1.0`, `>=20.9.0`, `24.1.0`. */
const RANGE = /^(?:(>=|\^|~)\s*)?v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/;

/**
 * `24.x` → `{ mode: "major", major: 24 }`; `>=20.9.0` → `{ mode: "min", … }`;
 * `~24.1.0` → `{ mode: "patch", … }`; `24.1.0` → `{ mode: "exact", … }`; anything else → `null`,
 * which the caller refuses on.
 *
 * @param {string} required The `engines.node` string.
 * @returns {{ mode: "major" | "min" | "patch" | "exact", major: number, minor: number, patch: number } | null}
 */
export function parseNodeRange(required) {
  const match = RANGE.exec(String(required ?? "").trim());
  if (match === null) return null;
  const [, prefix, rawMajor, rawMinor, rawPatch] = match;
  const wildcard = (part) => part === undefined || /^[xX*]$/.test(part);
  const major = Number(rawMajor);
  if (!Number.isInteger(major)) return null;
  const minor = wildcard(rawMinor) ? 0 : Number(rawMinor);
  const patch = wildcard(rawPatch) ? 0 : Number(rawPatch);
  if (!Number.isInteger(minor) || !Number.isInteger(patch)) return null;
  // `24` and `24.x` are wildcards on minor/patch, which is semver's `24.x`; `>=` is a floor, `~` is
  // a floor inside one minor, and `^` is a floor inside one major.
  if (wildcard(rawMinor)) return { mode: "major", major, minor, patch };
  if (prefix === ">=") return { mode: "min", major, minor, patch };
  if (prefix === "~") return { mode: "patch", major, minor, patch };
  if (prefix === "^" || wildcard(rawPatch)) return { mode: "major", major, minor, patch };
  return { mode: "exact", major, minor, patch };
}

/** `18.19.1` → `{ major: 18, minor: 19, patch: 1 }`, or `null` when it is not a version. */
export function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? "").trim());
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * The sentence to print, or `null` when this runtime satisfies the range.
 *
 * Unreadable input **fails**: a version guard that guesses is worse than one that stops, because the
 * guess is invisible and the stop is not.
 *
 * @param {string} required The `engines.node` string.
 * @param {string} actual `process.versions.node`.
 * @returns {string | null}
 */
export function nodeVersionProblem(required, actual) {
  const range = parseNodeRange(required);
  const version = parseVersion(actual);
  if (range === null) {
    return `engines.node is ${JSON.stringify(String(required ?? ""))}, which this guard cannot read — refusing to guess whether ${actual} satisfies it`;
  }
  if (version === null) {
    return `this is not a readable Node version (${JSON.stringify(String(actual ?? ""))}) — ${required} is declared`;
  }

  const satisfied =
    range.mode === "major"
      ? version.major === range.major &&
        (version.minor > range.minor ||
          (version.minor === range.minor && version.patch >= range.patch))
      : range.mode === "min"
        ? version.major > range.major ||
          (version.major === range.major &&
            (version.minor > range.minor ||
              (version.minor === range.minor && version.patch >= range.patch)))
        : range.mode === "patch"
          ? version.major === range.major &&
            version.minor === range.minor &&
            version.patch >= range.patch
          : version.major === range.major &&
            version.minor === range.minor &&
            version.patch === range.patch;

  // The `major` mode compares the version *inside* the declared major (`24.x`), so a newer major is
  // a refusal too — `engines.node` is a pin here, not a floor, and Node 25 is untested by this gate.
  if (satisfied) return null;
  return `this tree requires Node ${required} (engines.node in package.json) and this is Node ${actual}`;
}

/** The wrapper that supplies the pinned runtime, quoted in the refusal so the reader can act. */
const HINT =
  "run it through ~/.hermes/profiles/alignsynch/bin/node24.sh — e.g. `node24.sh pnpm <script>`";

/** `engines.node` as written, or `null` when the manifest declares nothing to check against. */
function declaredRange() {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const required = manifest?.engines?.node;
  return typeof required === "string" && required.trim() !== "" ? required : null;
}

/**
 * The **entry-point** form: refuse and exit non-zero unless this runtime satisfies `engines.node`,
 * say nothing when it does.
 *
 * An entry point calls this before it loads its `.ts` module — with a *dynamic* import, because a
 * static one is resolved at link time, before this call would run. Exits rather than returns: the
 * caller has nothing to do with a refused runtime, and a returned code somebody forgets to check is
 * the failure this file exists to remove.
 */
export function requireDeclaredNode() {
  const required = declaredRange();
  if (required === null) {
    console.error("require-node: package.json declares no engines.node — nothing to check against");
    process.exit(1);
  }
  const problem = nodeVersionProblem(required, process.versions.node);
  if (problem === null) return;
  console.error(`require-node: ${problem}`);
  console.error(`require-node: ${HINT}`);
  process.exit(1);
}

function main() {
  const required = declaredRange();
  if (required === null) {
    console.error("require-node: package.json declares no engines.node — nothing to check against");
    return 1;
  }
  const problem = nodeVersionProblem(required, process.versions.node);
  if (problem === null) return 0;
  console.error(`require-node: ${problem}`);
  console.error(`require-node: ${HINT}`);
  return 1;
}

// Only when this file *is* the command: the suite imports `nodeVersionProblem` from here, and an
// unguarded `process.exit` would have taken the test runner down with it.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
