#!/usr/bin/env node
/**
 * scripts/release-ledger.mjs — the update ledger, as `scripts/release.sh` needs it.
 *
 * **What this is for.** An entry generated from commit subjects is a census: it says four commits
 * happened and nothing about who noticed. The ledger (`data/changelog/updates/<pr>.json`) carries,
 * per merged pull request, the `reader_impact` and the `specs[]` the rule now lives in — the two
 * things a subject cannot say and a reader needs. So the generator joins the ledger into each
 * bullet, and `--check` proves the join afterwards.
 *
 * **The read is one call, not one per commit.** `table` prints every entry as one TSV row
 * (`pr<TAB>reader_impact<TAB>spec paths`) and `release.sh` keeps it in a variable, so a 40-commit
 * range costs one node process rather than forty. The shell half is `ledger_impact` /
 * `ledger_specs` in `scripts/release.sh`; the parsing and validation live in
 * `lib/docs/updates.ts`, the same module `data:check` E44 compiles, so the release lane and the gate
 * can never disagree about what a valid entry is.
 *
 * **A ledger that cannot be read is reported, never invented.** Exit 1 with the reason on stderr.
 * The generator treats that as "no rows" and still writes the entry — a cut is not blocked by the
 * record, only by the tree (`--check` turns the same failure into a refusal, because by then the
 * tree is what a human is being asked to sign).
 *
 * **No row is not a defect here.** A `chore`/`docs`/`ops` PR owes no entry, and a release that
 * predates the ledger has none at all; `release.sh` names the unrecorded `feat`/`fix` commits in the
 * entry's preamble instead of refusing, which is the finding the card asked for.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { UPDATES_DIR, parseUpdateLedger } from "../lib/docs/updates.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** One row per entry, tab-separated — the shape `scripts/release.sh` reads with `IFS=$'\t'`. */
function table(root) {
  const dir = join(root, UPDATES_DIR);
  let names;
  try {
    names = readdirSync(dir).sort();
  } catch {
    throw new Error(
      `${UPDATES_DIR} could not be read — the ledger's home is missing from this tree`,
    );
  }
  const files = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      throw new Error(`${UPDATES_DIR}/${name}: the file is not valid JSON`);
    }
    files.push({ name, raw });
  }
  const entries = parseUpdateLedger(files);
  const rows = [];
  for (const entry of entries) {
    // A tab or a newline in prose would break the row; the schema already refuses a newline
    // (`summary`/`reader_impact` are one line), so only a tab needs to be said out loud.
    if (entry.reader_impact.includes("\t")) {
      throw new Error(`${UPDATES_DIR}/${entry.pr}.json: reader_impact carries a tab`);
    }
    rows.push(`${entry.pr}\t${entry.reader_impact}\t${entry.specs.join(" ")}`);
  }
  return rows.join("\n");
}

const COMMANDS = {
  table: () => table(ROOT),
};

const command = process.argv[2] ?? "";
if (!(command in COMMANDS)) {
  process.stderr.write(
    `release-ledger: usage: scripts/release-ledger.mjs table\n` +
      `  table   every ${UPDATES_DIR}/<pr>.json as one TSV row: pr, reader_impact, specs\n`,
  );
  process.exit(2);
}

try {
  const out = COMMANDS[command]();
  if (out !== "") process.stdout.write(`${out}\n`);
} catch (error) {
  process.stderr.write(
    `release-ledger: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
