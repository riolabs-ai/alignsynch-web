/**
 * #1133 — **the Aspect drawer**, the one editor for an Aspect on all three screens.
 *
 * The claims, and why each one is worth a test rather than a screenshot:
 *
 *   closed      no drawer on arrival. A sheet that renders its fields into the document while shut
 *               is a tab stop on every row, and the lists this mounts on are long.
 *   four        Title, Prompt, 1 Means, 5 Means — the artifact's fields, in the artifact's words
 *   fields      (`06-spec-design-page-templates-v2/js/proto.js::aspectDrawer()`). Title is the one
 *               the model cannot carry: an Aspect is named by its id, which is the handle every
 *               `opinion` row is keyed by, so the drawer *prints* the name and offers no input for
 *               it. That is asserted here, because "a field that looks editable and drops its value
 *               on save" is the defect this shape exists to avoid.
 *   the title   **drawn as text, never as a box** (#1361). The rule is (b) of that card: a title is
 *   is text     not editable, because no `title` column exists and a rename would strand the
 *               answers keyed to the id. So the surface must not advertise an edit — and a
 *               `readOnly` input does exactly that: it still draws an I-beam over the text and a
 *               selection highlight, which is the cursor the founder reported. The name is printed
 *               on a `cursor-default select-none` element with no input, no `readonly` and no
 *               `aria-readonly`, and the drawer says where the name comes from and where it shows.
 *   the band    the 1–5 cells are a painted `role="img"`, never five inputs: the scale is the
 *               product's one locked band, and a second way to answer is how it stops being locked.
 *   a refusal   a save that is refused keeps the drawer open. The inline editor this replaced
 *               collapsed over a failed write, which is the bug in the artifact's own notes.
 *   new / edit  the eyebrow and the heading are the artifact's, and Save says what it does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AspectDrawer,
  aspectNameOf,
  ASPECT_SCALE_STEPS,
} from "@/components/assessment-flow/aspect-drawer";
import { assessmentCreatePageCopy } from "@/data/pages/assessment-create";

const ROW = {
  id: "aspect-contact-frequency",
  prompt: "How often do you want to be in touch?",
  leftValue: "Never enough",
  rightValue: "Plenty",
};

function html(aspect: typeof ROW | null, open = true): string {
  return renderToStaticMarkup(
    createElement(AspectDrawer, {
      copy: assessmentCreatePageCopy,
      open,
      aspect,
      count: 5,
      onCancel: () => {},
      onSave: async () => ({ ok: true as const }),
    }),
  );
}

function fieldNames(markup: string): string[] {
  return [...markup.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1] ?? "");
}

/** The Title row, cut out of the drawer: it holds no nested `div`, so the first close ends it. */
function titleBlock(markup: string): string {
  const start = markup.indexOf("data-aspect-drawer-title");
  expect(start).toBeGreaterThan(-1);
  return markup.slice(start, markup.indexOf("</div>", start));
}

describe("#1133 — the drawer is closed until a row asks for it", () => {
  it("renders nothing at all when shut", () => {
    const markup = html(ROW, false);
    expect(markup).toBe("");
    expect(markup).not.toContain("data-aspect-drawer");
  });

  it("is a modal dialog with an accessible name when open", () => {
    const markup = html(ROW);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("aria-labelledby=");
  });
});

describe("#1133 — the artifact's four fields, and the one the model cannot carry", () => {
  it("draws Title, Prompt, 1 Means and 5 Means in the artifact's words", () => {
    const markup = html(ROW);
    for (const label of ["Title", "Prompt", "1 Means", "5 Means"]) {
      expect(markup).toContain(label);
    }
  });

  it("posts exactly three fields — prompt, left, right — and never a title", () => {
    expect(fieldNames(html(ROW)).sort()).toEqual(["left", "prompt", "right"]);
    expect(fieldNames(html(ROW))).not.toContain("title");
  });

  it("prints the name the id carries, and posts never a title", () => {
    const markup = html(ROW);
    expect(markup).toContain("Contact Frequency");
    // The name is drawn once, as a value, and no field offers to change it.
    expect(markup.match(/<input[^>]*name="title"/g) ?? []).toHaveLength(0);
  });

  it("reads an id back as words, and leaves a real name alone", () => {
    expect(aspectNameOf("aspect-contact-frequency")).toBe("Contact Frequency");
    expect(aspectNameOf("old_roles")).toBe("Old Roles");
    expect(aspectNameOf("new-3")).toBe("3");
  });
});

/**
 * #1361 — **the rule, and the drawing that has to match it.**
 *
 * The decision is (b) of the card: an existing Aspect's Title is **not** editable. There is no
 * `title` column, the id is the handle every `opinion` row is keyed by, and a rename would strand
 * the answers. So the surface must stop advertising the edit — and the middle state it shipped
 * (`<input readOnly>`) is the opposite of honest: a read-only input still draws an I-beam over the
 * text and a selection highlight, so the founder hovered it, clicked it and typed into nothing.
 *
 * These cases fail if the box comes back (either flavour): a `readOnly` input fails the "no
 * readonly" case, and a writable input fails both the "no input" and the "no `name=`" ones.
 */
describe("#1361 — Title is drawn, not written, and the drawing is not a field", () => {
  it("prints the name as text — no input, no textarea, no read-only box", () => {
    const block = titleBlock(html(ROW));
    expect(block).toContain("Contact Frequency");
    expect(block).not.toContain("<input");
    expect(block).not.toContain("<textarea");
    // The middle state this card removed: the attribute is the marker of an input that refuses.
    expect(block.toLowerCase()).not.toContain("readonly");
  });

  it("draws no text cursor and no selection over it", () => {
    const block = titleBlock(html(ROW));
    expect(block).toContain("cursor-default");
    expect(block).toContain("select-none");
  });

  it("keeps the row's id on the printed name, and names no field", () => {
    const markup = html(ROW);
    expect(titleBlock(markup)).toContain('data-aspect-drawer-name="aspect-contact-frequency"');
    expect(fieldNames(markup)).not.toContain("title");
  });

  it("says where the name comes from, and where it shows", () => {
    const block = titleBlock(html(ROW));
    expect(block).toContain("Derived from the stored Aspect id");
    expect(block).toContain("cannot be renamed here");
    expect(block).toContain("titles this sheet");
  });

  it("makes the same promise about a row that does not exist yet", () => {
    const block = titleBlock(html(null));
    expect(block).toContain("Named when it is created");
    expect(block).not.toContain("<input");
    expect(block).toContain("cursor-default");
  });
});

describe("#1133 — the 1–5 band is locked, and it is not a field", () => {
  it("paints five cells and no input or button inside them", () => {
    const markup = html(ROW);
    const scale = markup.slice(markup.indexOf("data-aspect-drawer-scale"));
    const band = scale.slice(0, scale.indexOf("</div></div>"));
    expect(band).toContain('role="img"');
    for (const step of ASPECT_SCALE_STEPS) {
      expect(band).toContain(`>${step}</span>`);
    }
    expect(band).not.toContain("<input");
    expect(band).not.toContain("name=");
  });

  it("states the rule in the artifact's own sentence", () => {
    expect(html(ROW)).toContain("Scale Locked · 1–5 for every Aspect");
  });

  it("previews the two pole words under the band", () => {
    const markup = html(ROW);
    expect(markup).toContain("Never enough");
    expect(markup).toContain("Plenty");
    expect(markup).toContain('data-aspect-drawer-pole="left"');
    expect(markup).toContain('data-aspect-drawer-pole="right"');
  });
});

describe("#1133 — new and edit are the same drawer, addressed by the row", () => {
  it("says New Aspect / Add an Aspect when nothing is being edited", () => {
    const markup = html(null);
    expect(markup).toContain("New Aspect");
    expect(markup).toContain("Add an Aspect");
    expect(markup).toContain("Add Aspect");
    expect(markup).toContain('data-aspect-drawer="new"');
  });

  it("says Edit Aspect / the row's name and Save Aspect when one is", () => {
    const markup = html(ROW);
    expect(markup).toContain("Edit Aspect");
    expect(markup).toContain("Save Aspect");
    expect(markup).toContain('data-aspect-drawer="edit"');
  });

  it("prefills the three writable fields from the row", () => {
    const markup = html(ROW);
    expect(markup).toContain('value="Never enough"');
    expect(markup).toContain('value="Plenty"');
    expect(markup).toContain(ROW.prompt);
  });
});

describe("#1133 — a refused save never closes the drawer", () => {
  it("keeps the row when the writer answers not-ok", () => {
    /*
     * The component's own rule, read from its source because the branch is async and this suite
     * renders statically: a refusal returns before `onCancel()` is reachable, so the sheet stays
     * open with the typed words still in the form. The alternative — closing on every submit — is
     * exactly what the artifact's notes call out as the bug it repaired.
     */
    const source = readFileSync(
      join(process.cwd(), "components/assessment-flow/aspect-drawer.tsx"),
      "utf8",
    );
    const refusal = source.slice(source.indexOf("if (!answer.ok)"));
    expect(refusal.slice(0, refusal.indexOf("}"))).toContain("return");
    expect(refusal.slice(0, refusal.indexOf("}"))).not.toContain("onCancel");
  });

  it("asks before throwing typed words away", () => {
    const source = readFileSync(
      join(process.cwd(), "components/assessment-flow/aspect-drawer.tsx"),
      "utf8",
    );
    expect(source).toContain("window.confirm");
    expect(source).toContain('itemLabel(words, "unsaved")');
  });
});
