/**
 * action-gates — the capability gate a page's write endpoints inherit (#1391).
 *
 * A page gate closes an **address**; a server action is a **POST endpoint with an id of its own**.
 * `#1391` gated twenty-three page modules with `requireAdminProduct()` + `requireOperator()`, and
 * the five `actions.ts` files beside them carried no `require*()` at all: a caller who had the
 * action id from an older build reached the write path on a build that had closed the page. A 404
 * on `/admin/billing` is not a refusal of `performComp`.
 *
 * So the rule this module checks is the page's own rule, one level down:
 *
 *   - **every exported async function in an `actions.ts` opens with the capability gates its
 *     sibling page opens with**, in the same order — `requireAdminProduct()` first, and
 *     `requireOperator()` second when that page closes with the operator capability;
 *   - **the role gate stays where it was** and moves no further down than third; the capability
 *     gates are what this asserts, because a role gate is the page's own policy and already there.
 *
 * ## Why the expectation is *derived* and not a list
 *
 * The card that asked for this named a table to maintain by hand and said, in the same breath,
 * that a hand-maintained list is the defect. So the expected gates are read off the sibling
 * `page.tsx`: if the page calls `requireOperator()`, its actions must; if it does not (the
 * template authoring pages, which are a product surface and deliberately outside the operator
 * set), its actions must not be forced to. Add a gate to a page and this check asks the same of
 * its actions in the same commit. Add an `actions.ts` and it is discovered, gated or red — no
 * list to forget.
 *
 * Everything here is pure: the tree arrives as `{ path → source }` and the findings come back as
 * data, so `tests/admin-action-gates.test.ts` drives every shape with strings *and* audits the
 * real tree in one suite.
 */

/** Strip `//` and block comments, so a docstring that *names* a gate is not read as a call. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** One exported server action, and the gate calls its body opens with. */
export type ActionGate = {
  /** The exported function's name — the id a client resolves the action to. */
  name: string;
  /** `require*()` calls in the leading run of the body, in source order, without `()`. */
  gates: string[];
};

/** `requireOperator(); // #1391 — …` → `requireOperator`. Anything else is `null`. */
function gateOf(line: string): string | null {
  const code = line.replace(/\/\/.*$/, "").trim();
  const match = /^(require[A-Za-z0-9_]+)\(\);$/.exec(code);
  return match === null ? null : match[1];
}

/** Is this the line that opens a function body? `): Promise<X> {`, or a one-line signature. */
function opensBody(line: string): boolean {
  const text = line.trim();
  if (!text.endsWith("{")) return false;
  // `): Promise<X> {` and `}): Promise<X> {` — the signature's own closing paren or brace.
  if (/^[})]/.test(text)) return true;
  // A whole signature on one line. A parameter that is itself an object literal
  // (`export async function f(post: {`) ends with `{` too, and is not the body.
  return /^export\s+(async\s+)?function\s+[A-Za-z0-9_]+\([^()]*\)[^{]*\{$/.test(text);
}

/**
 * Every exported async function in a `"use server"` module, with the gate calls its body opens
 * with. Stops at the first statement that is not a gate — a gate third in the body is not a gate
 * that runs before the session read.
 */
export function exportedActions(source: string): ActionGate[] {
  const lines = stripComments(source).split("\n");
  const actions: ActionGate[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const signature = /^export async function ([A-Za-z0-9_]+)\(/.exec(lines[i]);
    if (signature === null) continue;

    let open = i;
    while (open < lines.length && !opensBody(lines[open])) {
      // A signature that never opens is not a function this check can read — stop rather than
      // walk into the next one and read its gates as this one's.
      if (open > i && /^export\s/.test(lines[open])) break;
      open += 1;
    }
    if (open >= lines.length || !opensBody(lines[open])) {
      actions.push({ name: signature[1], gates: [] });
      continue;
    }

    const gates: string[] = [];
    for (let line = open + 1; line < lines.length; line += 1) {
      if (lines[line].trim() === "") continue;
      const gate = gateOf(lines[line]);
      if (gate === null) break;
      gates.push(gate);
    }

    actions.push({ name: signature[1], gates });
  }

  return actions;
}

/**
 * The capability gates a page opens with, in order — the list its `actions.ts` must match.
 *
 * `requireAdminProduct()` is not conditioned on anything: every surface under `admin/**` is a
 * console surface, and a build that does not claim `product.admin` must answer the same 404 for
 * the write as for the page. `requireOperator()` is conditional because it is conditional on the
 * page too — the template authoring pages are product surfaces the issue excludes by name, and
 * forcing the operator gate on their actions would close a write on a build where the page still
 * renders.
 */
export function expectedActionGates(pageSource: string): string[] {
  const code = stripComments(pageSource);
  const gates = ["requireAdminProduct"];
  if (/\brequireOperator\(\)/.test(code)) gates.push("requireOperator");
  return gates;
}

/** A module (or one action in it) whose gates are not the page's. */
export type ActionGateFinding = {
  /** Repo-relative module path. */
  module: string;
  /** The exported function, or `*` when the module itself has no exported action. */
  action: string;
  /** What is wrong, in one line — the sentence a reviewer acts on. */
  reason: string;
  /** What the tree has, and what the sibling page asks for. */
  found: string[];
  expected: string[];
};

/** The audit's two products: every finding, and the census the summary line prints. */
export type ActionGateAudit = {
  findings: ActionGateFinding[];
  census: {
    modules: number;
    actions: number;
    /** Actions whose gates equal their page's, i.e. the ones this check can vouch for. */
    gated: number;
    /** Modules that close with the operator capability — the ones the card named. */
    operatorModules: number;
  };
};

/**
 * Audit `{ path → source }` maps of action modules and their sibling pages.
 *
 * A module with no sibling page is a finding: the expectation is derived from the page, so an
 * action module under a directory with no page has nothing to be measured against and could only
 * be trusted by judgement — which is the failure this check exists to remove.
 */
export function auditActionModules(input: {
  /** `app/(mainlayout)/admin/<route>/actions.ts` → source. */
  modules: Record<string, string>;
  /** The sibling `page.tsx` of each module → source. */
  pages: Record<string, string>;
}): ActionGateAudit {
  const findings: ActionGateFinding[] = [];
  let actions = 0;
  let gated = 0;
  let operatorModules = 0;

  for (const [path, source] of Object.entries(input.modules)) {
    const pagePath = path.replace(/actions\.ts$/, "page.tsx");
    const page = input.pages[pagePath];
    const expected = page === undefined ? null : expectedActionGates(page);
    if (expected?.includes("requireOperator")) operatorModules += 1;

    const found = exportedActions(source);
    if (found.length === 0) {
      findings.push({
        module: path,
        action: "*",
        reason: 'a `"use server"` module with no exported action is a module the gate cannot check',
        found: [],
        expected: expected ?? [],
      });
      continue;
    }

    if (expected === null) {
      findings.push({
        module: path,
        action: "*",
        reason: `no sibling ${pagePath.replace(/^.*\/admin\//, "")} to derive the gates from`,
        found: found[0].gates,
        expected: [],
      });
      continue;
    }

    for (const action of found) {
      actions += 1;
      const matches =
        action.gates.length === expected.length &&
        expected.every((gate, index) => action.gates[index] === gate);
      if (matches) {
        gated += 1;
        continue;
      }
      findings.push({
        module: path,
        action: action.name,
        reason:
          action.gates.length === 0
            ? "the action opens with no capability gate — the page's 404 closes the HTML, not this POST endpoint"
            : `the gates are [${action.gates.join(", ")}] but the page asks for [${expected.join(", ")}]`,
        found: action.gates,
        expected,
      });
    }
  }

  return {
    findings,
    census: { modules: Object.keys(input.modules).length, actions, gated, operatorModules },
  };
}
