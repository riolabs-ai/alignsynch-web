/**
 * `prototype-catalog.yml` — "no input" is a notice, "broken input" is still red (#1419).
 *
 * The workflow reddened `main` on every push before `prototypes/` was committed: the builder refused
 * a source that did not exist, which is right for a run that was *given* a path and wrong for a tree
 * that has nothing to publish. The repair is a single judge step — `detect prototype root` — whose
 * `present` output gates every step that needs the tree.
 *
 * Two properties are asserted here, and they fail in opposite directions:
 *
 *   1. **the guard exists and gates everything that needs the tree** — a step that reads the token,
 *      checks history, runs the builder, deploys, or smokes the deploy but is not behind `present`
 *      would either deploy from a tree that has nothing to publish or skip silently, and a quiet job
 *      read as a deploy is the failure mode the card exists to prevent;
 *   2. **nothing was removed to get there** — the token check still exits 1 naming the secret, the
 *      builder still gets the floor, `--fail-on-untracked` and its `--require` deep link, and the
 *      workflow still runs on a push to `main`. Removing the workflow or softening those is the one
 *      thing the card forbids, and a green-but-quiet `main` is built out of exactly that.
 *
 * The assertion is over the step blocks rather than the rendered YAML, so a step that gains a second
 * conditional is still read as gated from the text of its own block.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "prototype-catalog.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

interface Step {
  name: string;
  block: string;
}

/** The step list under `jobs.deploy.steps`, split on the `- name:` / `- uses:` items at six spaces. */
function steps(text: string): Step[] {
  const found: Step[] = [];
  let current: Step | null = null;
  for (const line of text.split("\n")) {
    const head = line.match(/^ {6}- (name|uses): (.*)$/);
    if (head) {
      if (current) found.push(current);
      current = { name: head[2].replace(/^["']|["']$/g, ""), block: "" };
      continue;
    }
    if (current) current.block += `${line}\n`;
  }
  if (current) found.push(current);
  return found;
}

const STEP_LIST = steps(WORKFLOW);
const GATE = "steps.root.outputs.present == 'true'";

function step(match: string): Step {
  const found = STEP_LIST.filter(
    (candidate) => candidate.name.includes(match) || candidate.block.includes(match),
  );
  expect(found.length, `exactly one step must match ${match}`).toBe(1);
  return found[0];
}

describe("the prototype catalog workflow", () => {
  it("still runs on a push to main — the mechanism is not removed", () => {
    expect(WORKFLOW).toMatch(/^name: prototype catalog$/m);
    expect(WORKFLOW).toMatch(/on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
    expect(WORKFLOW).toContain("npx --yes vercel@latest deploy");
  });

  it("judges the tree once, in a step that publishes its verdict", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("id: root");
    expect(detect.block).toContain('echo "present=true" >> "$GITHUB_OUTPUT"');
    expect(detect.block).toContain('echo "present=false" >> "$GITHUB_OUTPUT"');
  });

  it("names the absent root in a notice, so a quiet job cannot be read as a deploy", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("::notice::");
    expect(detect.block).toContain("prototype root absent (./prototypes)");
    expect(detect.block).toContain("nothing to build");
  });

  it("fails a source that should be in every checkout — a broken tree is not an empty one", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("::error::the docs source (docs/) is missing");
    expect(detect.block).toMatch(/exit 1/);
  });

  it("gates every step that needs the tree behind that one output", () => {
    const gated = [
      "VERCEL_TOKEN is not set",
      "actions/setup-node",
      "check out full history",
      "scripts/build-prototype-catalog.mjs",
      "npx --yes vercel@latest deploy",
      "smoke every published path",
    ];
    for (const marker of gated) {
      const owner = step(marker);
      expect(owner.block, `${owner.name} must be gated on the tree`).toContain(GATE);
    }
  });

  it("keeps the failures loud: the secret check exits 1 and names the secret", () => {
    const token = step("VERCEL_TOKEN is not set");
    expect(token.name).toBe("require VERCEL_TOKEN");
    expect(token.block).toContain("exit 1");
    const deploy = step("npx --yes vercel@latest deploy");
    expect(deploy.block).toContain("::error::VERCEL_ORG_ID / VERCEL_PROJECT_ID are not set");
    expect(deploy.block).toContain("exit 1");
  });

  it("keeps the floor, the untracked refusal and the deep link on the build", () => {
    const build = step("scripts/build-prototype-catalog.mjs");
    expect(build.block).toContain('--min-entries "$MIN_ENTRIES"');
    expect(build.block).toContain("--fail-on-untracked");
    expect(build.block).toContain('--require "$DEEP_LINK"');
    expect(WORKFLOW).toContain(
      "DEEP_LINK: project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html",
    );
    const floor = WORKFLOW.match(/^\s*MIN_ENTRIES: (\d+)$/m);
    expect(floor, "MIN_ENTRIES must be declared").not.toBeNull();
    expect(Number(floor?.[1])).toBeGreaterThan(0);
  });

  it("does not quietly pass --allow-empty to the builder", () => {
    const build = step("scripts/build-prototype-catalog.mjs");
    expect(build.block).not.toContain("--allow-empty");
  });

  it("fails the smoke check rather than reporting a short deploy as fine", () => {
    const smoke = step("smoke every published path");
    expect(smoke.block).toContain('[ "$rows" -ge "$MIN_ENTRIES" ]');
    expect(smoke.block).toContain("::error::catalog deploy did not converge");
  });

  it("smokes the example page's assets, not only the page (#1436)", () => {
    // A page that answers 200 while `css/tokens.css` answers 404 was the whole defect: the row
    // count and the deep link both stayed green while every V2 prototype rendered unstyled.
    expect(WORKFLOW).toContain(
      "SMOKE_PAGE: project-spec/spec-design-v2-bundles/04-spec-design-page-align-v2/align.html",
    );
    const assets = WORKFLOW.match(/^\s*SMOKE_ASSETS: (.*)$/m);
    expect(assets, "SMOKE_ASSETS must be declared").not.toBeNull();
    for (const file of [
      "css/tokens.css",
      "images/alignsynch-icon.png",
      "js/proto.js",
      "js/tw-config.js",
    ]) {
      expect(assets?.[1]).toContain(file);
    }
    const smoke = step("smoke every published path");
    expect(smoke.block).toContain('[ "$broken" -eq 0 ]');
    expect(smoke.block).toContain('"$SITE/p/$page_dir/$asset"');
  });
});
