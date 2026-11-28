/**
 * `data:check` E42's negative cases — the project spec's register as *data* (#1252).
 *
 * The schema answers "is this a register"; `specRegisterProblems` answers the three questions a
 * schema cannot, and this file is the proof that each is actually asked. The house rule is the one
 * `data-model.test.ts` and `promotion-invariants.test.ts` follow: one case per defect, built from a
 * sound document, so a rule that stops firing fails here rather than going quiet in the gate.
 *
 * The positive case reads the committed register, so the file that ships is also the file these
 * cases call sound — a generated file that drifts out of a story's reach fails at the same moment
 * `pnpm data:check` does.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  specRegisterProblems,
  zSpecValidation,
  SPEC_BEYOND_GROUP,
  SPEC_SECTIONS,
  SPEC_STORY_GROUPS,
  type SpecRow,
  type SpecValidation,
} from "../../content/spec";

/** A register carrying one row per story, plus one beyond the agreement. */
function sound(): SpecValidation {
  const row = (id: string, group: string): SpecRow => ({
    id,
    section: SPEC_SECTIONS[0],
    group,
    check: "☑",
    status: "Delivered",
    pdfPages: null,
    quote: null,
    requirement: "a requirement",
    definitionOfDone: "a definition",
    today: "what v2.0 says today",
    release: { v200: "Delivered", rc2: "Delivered", rc3: "Delivered", beta: "Delivered" },
    evidence: [{ kind: "code", ref: "lib/example.ts:1" }],
    parity: "Yes",
    parityBasis: "the same route under both brands",
    review: { pm: "Pending", design: "Pending" },
    approval: { jaden: "Pending", walt: "Pending" },
    next: null,
    note: null,
  });
  const prefix = ["WEB", "APP", "ADMIN", "OPS"];
  return {
    version: 1,
    register: {
      release: "2.0.0-rc1.2",
      main: "601ce26",
      generatedAt: "2026-11-19",
      csvSha256: "a".repeat(64),
    },
    quotesIncluded: false,
    rows: [
      ...SPEC_STORY_GROUPS.map((story, at) =>
        row(`${prefix[at % prefix.length]}-${String(at + 1).padStart(2, "0")}`, story.name),
      ),
      row("B-01", SPEC_BEYOND_GROUP),
    ],
  };
}

describe("specRegisterProblems", () => {
  it("calls the committed register sound", () => {
    const parsed = zSpecValidation.parse(
      JSON.parse(readFileSync(join(process.cwd(), "data/spec/validation.json"), "utf8")),
    );
    assert.deepEqual(specRegisterProblems(parsed), []);
  });

  it("calls a well-formed two-row document sound", () => {
    assert.deepEqual(specRegisterProblems(sound()), []);
  });

  it("refuses an ID that appears twice", () => {
    const doc = sound();
    doc.rows.push({ ...doc.rows[0] });
    const problems = specRegisterProblems(doc);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /WEB-01 appears twice/);
  });

  it("refuses a group no story and no Beyond the Agreement claims", () => {
    const doc = sound();
    doc.rows.push({ ...doc.rows[0], id: "APP-99", group: "12 Nonsense" });
    const problems = specRegisterProblems(doc);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /12 Nonsense/);
  });

  it("refuses a story page that would render empty", () => {
    const doc = sound();
    assert.deepEqual(specRegisterProblems(doc), []);
    const lost = SPEC_STORY_GROUPS[3];
    doc.rows = doc.rows.filter((row) => row.group !== lost.name);
    const problems = specRegisterProblems(doc);
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`${lost.name}.*has no row`));
  });

  it("refuses a register that carries quotes", () => {
    const withQuotes = { ...sound(), quotesIncluded: true };
    const parsed = zSpecValidation.safeParse(withQuotes);
    assert.equal(parsed.success, false);
    const row = { ...sound().rows[0], quote: "an agreement sentence" };
    const parsedRow = zSpecValidation.safeParse({ ...sound(), rows: [row] });
    assert.equal(parsedRow.success, false);
  });

  /**
   * The shape the badges misread (#1439). A register still carrying `release` at the top level is
   * the file that printed `2.0.0-rc1.2` where the app's version belongs, so the schema refuses it
   * by name rather than loading it and leaving a component to pick the wrong key again.
   */
  it("refuses the old top-level release/main shape", () => {
    const { register, ...rest } = sound();
    const legacy = { ...rest, release: register.release, main: register.main };
    const parsed = zSpecValidation.safeParse(legacy);
    assert.equal(parsed.success, false);
    assert.match(JSON.stringify(parsed.error?.issues), /register/);

    const bothShapes = { ...legacy, register };
    assert.equal(zSpecValidation.safeParse(bothShapes).success, false);
  });
});

/**
 * The guard that can see a hand-edit (#1441).
 *
 * Everything above asserts properties a hand-edited register can satisfy — that is exactly how PR
 * #1432 wrote APP-20's two cells into the JSON and passed the gate: the schema was happy, the rows
 * were structurally fine, and `csvSha256` still described a CSV nobody had touched. The only check
 * that sees it is the one that derives the file again, so these cases drive
 * `scripts/spec-validation-json.py --check` over a two-line register of their own: a clean file
 * passes, one edited cell fails by row and field, and re-deriving is idempotent.
 *
 * The CSV here is synthetic on purpose — the real register carries Exhibit C quotes and is not in
 * this checkout, so a case that needed it would skip or lie on most machines.
 */
describe("the derivation guard (E42 --check)", () => {
  const HEADER = [
    "section,group,id,check,status,pdf_pages,agreement_quote,requirement,definition_of_done,",
    "v2_today,v2_0_0,rc2,rc3,beta,evidence,parity,parity_basis,review_pm,review_design,",
    "approval_jaden,approval_walt,next_acceptance,notes",
  ].join("");
  const ROW = [
    "Unfinished Work: TBD,Register,APP-20,◐,Partial,p17,",
    '"a quote that never leaves the CSV",',
    '"the relationship list shows Gap counts per relationship",',
    '"each card shows the Gap count",',
    '"what ships today",',
    "On Roadmap · R2,—,R2,—,guides/initiator/my-relationships-and-start.md,n.a.,",
    '"because both halves must exist",Pending,Pending,Pending,Pending,—,—',
  ].join("");

  /** The generator, run the way `data:check` runs it — from the repository root. */
  const generate = (csv: string, json: string, ...extra: string[]) =>
    spawnSync(
      "python3",
      [join(process.cwd(), "scripts/spec-validation-json.py"), csv, json, ...extra],
      {
        encoding: "utf8",
        cwd: process.cwd(),
      },
    );

  const workspace = () => {
    const directory = mkdtempSync(join(tmpdir(), "spec-register-"));
    const csv = join(directory, "VALIDATION.csv");
    const json = join(directory, "validation.json");
    writeFileSync(csv, `${HEADER}\n${ROW}\n`, "utf8");
    return { directory, csv, json };
  };

  it("derives, then refuses a file whose cell was edited by hand", () => {
    const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
    if (probe.error) {
      // No interpreter, no derivation — say so instead of passing a check that did not run.
      return;
    }

    const { csv, json } = workspace();
    const written = generate(csv, json);
    assert.equal(written.status, 0, written.stderr);
    assert.equal(
      generate(csv, json, "--check").status,
      0,
      "a freshly derived register must check clean",
    );

    const sound = readFileSync(json, "utf8");
    const edited = sound.replace('"what ships today"', '"what ships, edited by hand"');
    assert.notEqual(edited, sound);
    writeFileSync(json, edited, "utf8");

    const checked = generate(csv, json, "--check");
    assert.equal(checked.status, 1, "a hand-edited cell must fail the check");
    assert.match(`${checked.stdout}${checked.stderr}`, /APP-20\.today/);
    assert.match(`${checked.stdout}${checked.stderr}`, /edited by hand/);

    // Re-deriving is the fix, and it is idempotent: the second write changes nothing.
    assert.equal(generate(csv, json).status, 0);
    const derived = readFileSync(json, "utf8");
    assert.equal(generate(csv, json).status, 0);
    assert.equal(readFileSync(json, "utf8"), derived);
    assert.equal(generate(csv, json, "--check").status, 0);
  });
});
