/**
 * `prototype-catalog.yml` — "no input" is a notice, "broken input" is still red (#1419).
 *
 * The workflow reddened `main` on every push because `prototypes/` is not committed yet: the builder
 * refused a root that does not exist, which is right for a run that was *given* a path and wrong for
 * a tree that has nothing to publish. The repair is a single judge step — `detect prototype root` —
 * whose `present` output gates every step that needs the tree.
 *
 * Two properties are asserted here, and they fail in opposite directions:
 *
 *   1. **the guard exists and gates everything that needs the tree** — a step that reads the token,
 *      runs the builder, deploys, or smokes the deploy but is not behind `present` would either
 *      deploy from a tree that has nothing to publish or skip silently (the failure mode the card
 *      exists to prevent: a quiet job read as a deploy);
 *   2. **nothing was removed to get there** — the token check still exits 1 naming the secret, the
 *      builder still gets `--min-entries 250` and its `--require` deep link, and the workflow still
 *      runs on a push to `main`. Removing the workflow or softening those is the one thing the card
 *      forbids, and it is exactly what a green-but-quiet `main` would be built out of.
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
  });

  it("judges the tree once, in a step that publishes its verdict", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("id: root");
    expect(detect.block).toContain('echo "present=true" >> "$GITHUB_OUTPUT"');
    expect(detect.block).toContain('echo "present=false" >> "$GITHUB_OUTPUT"');
    expect(detect.block).toContain('echo "configured=');
  });

  it("names the absent root in a notice, so a quiet job cannot be read as a deploy", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("::notice::");
    expect(detect.block).toMatch(/prototype root absent \(\.\/\$root\)/);
    expect(detect.block).toContain("nothing to build");
  });

  it("fails when a configured root does not exist — a typo is broken input, not missing input", () => {
    const detect = step("detect prototype root");
    expect(detect.block).toContain("::error::PROTOTYPE_ROOT");
    expect(detect.block).toMatch(/broken input, not missing input/);
    expect(detect.block).toMatch(/exit 1/);
  });

  it("gates every step that needs the tree behind that one output", () => {
    const gated = [
      "VERCEL_TOKEN is not set",
      "scripts/build-prototype-catalog.mjs",
      "npx --yes vercel@latest deploy",
      "smoke every published path",
      "actions/setup-node",
    ];
    for (const marker of gated) {
      const owner = step(marker);
      expect(owner.block, `${owner.name} must be gated on the tree`).toContain(GATE);
    }
  });

  it("keeps the failures loud: the secret check exits 1 and names the secret", () => {
    const token = step("VERCEL_TOKEN is not set");
    expect(token.block).toContain("exit 1");
    expect(token.name).toBe("require VERCEL_TOKEN");
    const deploy = step("npx --yes vercel@latest deploy");
    expect(deploy.block).toContain("::error::VERCEL_ORG_ID / VERCEL_PROJECT_ID are not set");
    expect(deploy.block).toContain("exit 1");
  });

  it("keeps the floor and the deep link on the build", () => {
    const build = step("scripts/build-prototype-catalog.mjs");
    expect(build.block).toContain("--min-entries 250");
    expect(build.block).toContain('--require "$DEEP_LINK"');
    expect(WORKFLOW).toContain(
      "DEEP_LINK: project-spec/spec-design-page-relationship-detail/alignsynch-ui-specs.html",
    );
  });

  it("does not quietly pass --allow-empty to the builder", () => {
    const build = step("scripts/build-prototype-catalog.mjs");
    expect(build.block).not.toContain("--allow-empty");
  });

  it("fails the smoke check rather than reporting a short deploy as fine", () => {
    const smoke = step("smoke every published path");
    expect(smoke.block).toContain('[ "$rows" -ge 250 ]');
    expect(smoke.block).toContain("::error::catalog deploy did not converge");
  });
});
