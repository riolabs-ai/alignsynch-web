/** @vitest-environment jsdom */

/**
 * **Stage 1's Initiator arrives with the viewer's own name, and the person still owns it (#1360).**
 *
 * The founder's report is one sentence — *"User would expect default it in from my profile, but
 * leave it editable."* — and `docs/specs/flow-stages.md` → *Stage 1, Details* is where the rule now
 * lives. A rule about a *default* is a rule about two states, and only one of them is a first
 * render, so this file asserts both:
 *
 *   1. a signed-in viewer's profile name seeds the two Initiator halves, and the title — which
 *      derives from fields 2–5 — starts from it;
 *   2. a visitor's halves are empty, exactly as they were before this card: the prefill is a
 *      *session* fact, never a fixture, a cookie or a stored default;
 *   3. **an answer beats the default twice over** — a draft the flow already saved wins over the
 *      prefill, and a keystroke wins over both, surviving a re-render that hands the same prefill
 *      down again. That is the card's "no clobber" line, and it is the reason the seed is
 *      component *initial* state rather than a value the render recomputes.
 *
 * The split of one display name into two halves is the same rule, one layer down, so its cases sit
 * here too: they are what the page hands the client, and a name with three parts is the case a
 * naive `split(" ")` gets wrong.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  StageOneFields,
  type StageOneCopy,
  type StageOneValues,
} from "@/components/assessment-flow/stage-one-fields";
import { assessmentCreatePageCopy } from "@/data/pages/assessment-create";
import { initiatorNameFor, namePartsOf } from "@/lib/flow/initiator-name";
import { itemLabel, sectionOf } from "@/lib/page-copy";

const WHO = sectionOf(assessmentCreatePageCopy, "who");

/** The copy object the page composes — resolved from the fixture, so no word is typed here. */
const COPY: StageOneCopy = {
  titleLabel: itemLabel(WHO, "title-label"),
  titleHelp: itemLabel(WHO, "title-help"),
  initiatorFirstLabel: itemLabel(WHO, "initiator-first-label"),
  initiatorLastLabel: itemLabel(WHO, "initiator-last-label"),
  initiatorLastPlaceholder: itemLabel(WHO, "initiator-last-placeholder"),
  initiatorHelp: itemLabel(WHO, "initiator-help"),
  counterpartyFirstLabel: itemLabel(WHO, "counterparty-first-label"),
  counterpartyFirstPlaceholder: itemLabel(WHO, "counterparty-first-placeholder"),
  counterpartyLastLabel: itemLabel(WHO, "counterparty-last-label"),
  counterpartyLastPlaceholder: itemLabel(WHO, "counterparty-last-placeholder"),
  counterpartyHelp: itemLabel(WHO, "counterparty-help"),
  emailLabel: itemLabel(WHO, "email-label"),
  emailPlaceholder: itemLabel(WHO, "email-placeholder"),
  descriptionLabel: itemLabel(WHO, "description-label"),
  descriptionPlaceholder: itemLabel(WHO, "description-placeholder"),
  descriptionHelp: itemLabel(WHO, "description-help"),
  requiredNote: itemLabel(WHO, "required-note"),
};

const EMPTY_VALUES: StageOneValues = {
  initiatorFirst: "",
  initiatorLast: "",
  counterpartyFirst: "",
  counterpartyLast: "",
  title: "",
  email: "",
  description: "",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // React 19 warns (and skips flushing) unless the environment says a test is driving it.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Type into a controlled input the way the browser does: set the value, then fire `input`. */
function type(id: string, value: string): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (element === null) throw new Error(`no input #${id} on the form`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function field(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}

function render(
  values: StageOneValues = EMPTY_VALUES,
  initiatorPrefill?: { readonly first: string; readonly last: string },
): void {
  act(() =>
    root.render(
      <StageOneFields
        copy={COPY}
        values={values}
        descriptionDefault="Ten Aspects about how a working relationship feels."
        {...(initiatorPrefill === undefined ? {} : { initiatorPrefill })}
      />,
    ),
  );
}

/* ------------------------------------------------------------------ *\
 * One display name → the two halves the form asks for
 * ------------------------------------------------------------------ */

describe("a profile name splits into the two halves stage 1 asks for", () => {
  it("puts the first word in the first half and the rest in the last", () => {
    expect(namePartsOf("Walt Underwood")).toEqual({ first: "Walt", last: "Underwood" });
  });

  it("keeps a multi-word surname whole, because a last name is not one word", () => {
    expect(namePartsOf("  Walt   de la   Cruz  ")).toEqual({ first: "Walt", last: "de la Cruz" });
  });

  it("answers a single word as a first name and an empty last, never a blank first", () => {
    expect(namePartsOf("Walt")).toEqual({ first: "Walt", last: "" });
  });

  it("answers nothing for a name that is empty or only spaces", () => {
    expect(namePartsOf("")).toEqual({ first: "", last: "" });
    expect(namePartsOf("   ")).toEqual({ first: "", last: "" });
  });
});

describe("which name the prefill comes from", () => {
  it("prefers the saved profile's display name over the one the provider holds", () => {
    expect(initiatorNameFor({ name: "walt21" }, { displayName: "Walt Underwood" })).toEqual({
      first: "Walt",
      last: "Underwood",
    });
  });

  it("falls back to the auth provider's name when no profile row exists yet", () => {
    // A brand-new account has a `user` and no `user_profile` row until it first saves `/settings`.
    expect(initiatorNameFor({ name: "Walt Underwood" }, null)).toEqual({
      first: "Walt",
      last: "Underwood",
    });
  });

  it("prefills nothing when neither source holds a name", () => {
    expect(initiatorNameFor({ name: "" }, null)).toEqual({ first: "", last: "" });
    expect(initiatorNameFor({ name: "" }, { displayName: "  " })).toEqual({ first: "", last: "" });
  });

  it("prefills nothing for a visitor, because there is no session to read", () => {
    expect(initiatorNameFor(null, null)).toEqual({ first: "", last: "" });
    // A profile passed without a session cannot turn a visitor into a member.
    expect(initiatorNameFor(null, { displayName: "Walt Underwood" })).toEqual({
      first: "",
      last: "",
    });
  });
});

/* ------------------------------------------------------------------ *\
 * The rule on the screen
 * ------------------------------------------------------------------ */

describe("the Initiator arrives prefilled for a signed-in member", () => {
  it("seeds both halves from the profile name and derives the title from it", () => {
    render(EMPTY_VALUES, { first: "Walt", last: "Underwood" });

    expect(field("create-initiator-first")).toBe("Walt");
    expect(field("create-initiator-last")).toBe("Underwood");
    // Fields 2–3 are two of the four the title derives from, so the default reaches the title too.
    expect(field("create-title")).toBe("Walt U");
  });

  it("leaves the fields editable: a keystroke replaces the prefilled half", () => {
    render(EMPTY_VALUES, { first: "Walt", last: "Underwood" });

    type("create-initiator-first", "Walter");
    expect(field("create-initiator-first")).toBe("Walter");
    expect(field("create-initiator-last")).toBe("Underwood");
    expect(field("create-title")).toBe("Walter U");
  });

  it("starts the Counterparty empty — the prefill is about the viewer, not about them", () => {
    render(EMPTY_VALUES, { first: "Walt", last: "Underwood" });

    expect(field("create-counterparty-first")).toBe("");
    expect(field("create-counterparty-last")).toBe("");
    expect(field("create-email")).toBe("");
  });
});

describe("a visitor sees the form exactly as it was", () => {
  it("draws empty Initiator halves when no prefill is handed down", () => {
    render();

    expect(field("create-initiator-first")).toBe("");
    expect(field("create-initiator-last")).toBe("");
    expect(field("create-title")).toBe("");
  });

  it("draws empty halves when the prefill itself is empty", () => {
    render(EMPTY_VALUES, { first: "", last: "" });

    expect(field("create-initiator-first")).toBe("");
    expect(field("create-initiator-last")).toBe("");
  });
});

describe("an answer beats the default", () => {
  it("keeps the draft's own name over the prefill", () => {
    render(
      { ...EMPTY_VALUES, initiatorFirst: "Daniel", initiatorLast: "Vance" },
      { first: "Walt", last: "Underwood" },
    );

    expect(field("create-initiator-first")).toBe("Daniel");
    expect(field("create-initiator-last")).toBe("Vance");
  });

  it("fills only the half the draft leaves empty", () => {
    // Both halves are required and are saved together, so this is the defence-in-depth case: a
    // half that was answered is never overwritten by the profile.
    render({ ...EMPTY_VALUES, initiatorFirst: "Daniel" }, { first: "Walt", last: "Underwood" });

    expect(field("create-initiator-first")).toBe("Daniel");
    expect(field("create-initiator-last")).toBe("Underwood");
  });

  it("does not clobber a keystroke when the stage re-renders with the same prefill", () => {
    render(EMPTY_VALUES, { first: "Walt", last: "Underwood" });
    type("create-initiator-first", "Robin");

    // The same props arrive again — a re-render, not a remount. The seed is initial state, so the
    // person's answer survives it.
    render(EMPTY_VALUES, { first: "Walt", last: "Underwood" });
    expect(field("create-initiator-first")).toBe("Robin");
    expect(field("create-initiator-last")).toBe("Underwood");
  });

  it("holds a stored title while the Initiator is prefilled", () => {
    // The draft already carries a title, so the derivation stays off — a prefill is not a keystroke.
    render(
      { ...EMPTY_VALUES, initiatorFirst: "Daniel", initiatorLast: "Vance", title: "Ours" },
      { first: "Walt", last: "Underwood" },
    );

    expect(field("create-title")).toBe("Ours");
  });
});
