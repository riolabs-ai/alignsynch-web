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
 * So the guard runs **before** the script, not inside it: a `prehygiene` hook executes this file with
 * a bare `node` and no flags, which even an old Node can do, and it names both versions and the
 * wrapper that supplies the right one. Putting the check *inside* the entry point would not work —
 * the `--disable-warning` flag in the same command line is itself a `bad option` on 18, so Node exits
 * before any line of the script would have run.
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

function main() {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const required = manifest?.engines?.node;
  if (typeof required !== "string" || required.trim() === "") {
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
