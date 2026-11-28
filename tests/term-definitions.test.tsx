/** @vitest-environment jsdom */

/**
 * The flow's key terms are glossed once, and the affordance reads that record (#1270,
 * `spec(APP-11)`).
 *
 * `spec` and `grill` both landed on the same rule: a definition typed into a component is a second
 * copy of a sentence `content/` already owns, and a second copy drifts. So the claim tested here is
 * not "the words look right", it is **"there is one record and the UI prints it"**:
 *
 *   1. the record is complete and short — six terms, each with a label, an accessible name and a
 *      gloss that stays a gloss;
 *   2. the two definitions the model already authored are **composed from it**, not retyped:
 *      `SETTING_DEFINITIONS` and `OPINION_DEFINITIONS` appear verbatim inside the record, which is
 *      the only way "these are the same words" survives an edit to either side;
 *   3. `TermHelp` renders the record's text and nothing beside it — the popover's whole text is
 *      the label followed by the definition, so a paraphrase in the component would fail here;
 *   4. the trigger is a real `<button type="button">` with an accessible name, it opens on a
 *      click (which is what a tap and Enter/Space both produce) and closes on Escape — the
 *      keyboard and touch requirement, stated as behaviour rather than as a `tabIndex`;
 *   5. every term in the record is **mounted by a surface**, read off the component tree: a
 *      definition nothing draws is a paragraph waiting to drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TermHelp } from "@/components/assessment-flow/term-help";
import { OPINION_DEFINITIONS, OPINION_LABELS, SETTING_DEFINITIONS } from "@/content/assessment";
import { TERM_DEFINITIONS, TERM_HELP_NAMES, TERM_IDS, TERM_LABELS } from "@/content/terms";

/** The repo root. `process.cwd()`, because a jsdom `import.meta.url` is not a file URL. */
const ROOT = process.cwd();

/** Every `.tsx` under `components/`, for the mount census at the end. */
function componentSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) componentSources(path, found);
    else if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

/**
 * A gloss is a gloss. 320 characters is generous on purpose — the two composed entries carry their
 * source sentences whole — and still short enough that pasting `docs/glossary.md`'s paragraphs in
 * would fail rather than pass.
 */
const GLOSS_MAX = 320;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  /** Popper measures its content; jsdom has no `ResizeObserver`, and the stub observes nothing. */
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** The trigger for one term, found by its accessible name — the same handle a reader has. */
function trigger(term: keyof typeof TERM_HELP_NAMES): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === TERM_HELP_NAMES[term],
  );
  if (match === undefined) throw new Error(`no trigger named "${TERM_HELP_NAMES[term]}"`);
  return match;
}

describe("the record", () => {
  it("glosses every term, briefly, with a name that says the term out loud", () => {
    expect(TERM_IDS).toEqual(["mode", "setting", "aspect", "opinion", "gap", "round"]);
    for (const term of TERM_IDS) {
      const definition = TERM_DEFINITIONS[term];
      expect(definition.length, `${term} is empty`).toBeGreaterThan(0);
      expect(definition.length, `${term} is not a gloss`).toBeLessThanOrEqual(GLOSS_MAX);
      // The accessible name names the term, so a screen reader says which word is being explained.
      expect(TERM_HELP_NAMES[term]).toContain(TERM_LABELS[term]);
    }
  });

  it("composes the model's own sentences instead of restating them", () => {
    const setting = TERM_DEFINITIONS.setting;
    for (const value of Object.values(SETTING_DEFINITIONS)) expect(setting).toContain(value);

    const opinion = TERM_DEFINITIONS.opinion;
    for (const value of Object.values(OPINION_DEFINITIONS)) expect(opinion).toContain(value);
    for (const value of Object.values(OPINION_LABELS)) expect(opinion).toContain(value);
  });
});

describe("the affordance", () => {
  it("renders the record's words, and nothing beside them", () => {
    for (const term of TERM_IDS) {
      act(() => {
        root.render(createElement(TermHelp, { term }));
      });
      const button = trigger(term);
      act(() => {
        button.click();
      });
      const dialog = document.querySelector("[role='dialog']");
      expect(dialog, `${term} drew no popover`).not.toBeNull();
      // The whole of the popover is the label and the definition: no copy lives in the component.
      expect(dialog?.textContent).toBe(`${TERM_LABELS[term]}${TERM_DEFINITIONS[term]}`);
      // Escape is the keyboard's way out, and focus goes back to the trigger it came from.
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector("[role='dialog']"), `${term} did not close`).toBeNull();
    }
  });

  it("is a button, so Enter, Space and a tap all reach it", () => {
    act(() => {
      root.render(createElement(TermHelp, { term: "gap" }));
    });
    const button = trigger("gap");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    // Radix's own contract: the trigger names the surface it opens, and the surface says "dialog".
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the mounts", () => {
  it("draws every term on a surface that shows it", () => {
    const files = componentSources(join(ROOT, "components")).map((path) => ({
      path: path.slice(ROOT.length),
      source: readFileSync(path, "utf8"),
    }));
    for (const term of TERM_IDS) {
      // Two shapes, one claim: a mount in JSX — `term={"gap"}`, the expression form the E23 leaf
      // rule does not count, because an id is a handle — and one through a prop the page builds
      // (`term: "mode"` — stage 2 hands the id down with the group it labels).
      const mounted = files.filter(
        (file) =>
          file.source.includes(`term={"${term}"}`) || file.source.includes(`term: "${term}"`),
      );
      expect(mounted.length, `no component mounts the "${term}" gloss`).toBeGreaterThan(0);
    }
  });
});
