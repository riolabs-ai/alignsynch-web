/**
 * `/glossary` — the register is the document, and the page cannot invent a term (#1289, WEB-07).
 *
 * The card's constraint is the reason this file exists in this shape: the terms are
 * `docs/glossary.md`, so what is pinned is the *parse* — that the committed document yields one
 * entry per term with its source, that the documentation's own crumb is not published, and that a
 * document which stopped being a glossary is a named failure instead of an empty page. A test that
 * asserted a hand-written list of seven definitions would be the second register the card forbids.
 *
 * What the render cases pin is what the acceptance criteria name: the term count, on the page, derived from
 * the file (`terms.length`, never a typed number), one section per term anchored on its id, and
 * the source file drawn as text rather than as a link into a checkout a reader cannot open.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GlossaryPage } from "@/components/glossary/glossary-page";
import { glossaryPageCopy } from "@/data/pages/glossary";
import { GlossaryUnreadable, glossaryAnchor, parseGlossary } from "@/lib/glossary";

/** The committed register, exactly as the page reads it. */
const DOCUMENT = readFileSync(join(process.cwd(), "docs/glossary.md"), "utf8");

describe("parsing docs/glossary.md", () => {
  const document = parseGlossary(DOCUMENT);

  it("reads one entry per term, in the document's order", () => {
    expect(document.title).toBe("Glossary");
    expect(document.terms.map((term) => term.term)).toEqual([
      "Record",
      "Item",
      "Template",
      "Session",
      "Aspect",
      "Opinion",
      "Gap",
    ]);
  });

  it("gives every term its definition and the file the definition is the comment of", () => {
    for (const term of document.terms) {
      expect(term.paragraphs.length, `${term.term} has no definition`).toBeGreaterThan(0);
      expect(term.sources.length, `${term.term} names no source`).toBeGreaterThan(0);
      for (const source of term.sources) {
        expect(source.file).toMatch(/^content\/[\w-]+\.ts$/);
      }
    }
  });

  it("keeps a named declaration when the entry has one, and null when it does not", () => {
    const template = document.terms.find((term) => term.term === "Template");
    const session = document.terms.find((term) => term.term === "Session");
    expect(template?.sources[0]?.declaration).toBe("zTemplate");
    expect(session?.sources[0]?.declaration).toBeNull();
  });

  it("does not publish the documentation's own crumb", () => {
    // `docs-nav` region: a Docs-hub link, a prev and a next, all relative markdown paths the site
    // cannot serve. The page must not render them, so they never reach the document at all.
    const prose = JSON.stringify(document);
    expect(prose).not.toContain("docs-nav");
    expect(prose).not.toContain("Docs hub");
    expect(prose).not.toContain("reference/billing.md");
  });

  it("keeps the intro paragraphs that say what the page is", () => {
    expect(document.intro.length).toBeGreaterThan(0);
    expect(document.intro.join(" ")).toContain("schema comments");
  });

  it("anchors every term on a distinct kebab id", () => {
    const anchors = document.terms.map((term) => term.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toEqual(["record", "item", "template", "session", "aspect", "opinion", "gap"]);
  });
});

describe("a document that is no longer a glossary is a named failure", () => {
  const cases: ReadonlyArray<{ name: string; markdown: string; reason: RegExp }> = [
    { name: "no title", markdown: "## Record\n\nid, slug.\n", reason: /no `# ` title/ },
    { name: "no terms", markdown: "# Glossary\n\nNothing here.\n", reason: /defines no terms/ },
    {
      name: "a term with no definition",
      markdown: "# Glossary\n\nIntro.\n\n## Record\n\nSource: [content/record.ts](../x.ts).\n",
      reason: /defines nothing/,
    },
    {
      name: "a term with no source",
      markdown: "# Glossary\n\nIntro.\n\n## Record\n\nid, slug.\n",
      reason: /names no source file/,
    },
    {
      name: "an unterminated crumb",
      markdown: "# Glossary\n\n<!-- docs-nav:begin -->\n\nCrumb.\n",
      reason: /has no <!-- docs-nav:end -->/,
    },
    {
      name: "a source line with no file link",
      markdown: "# Glossary\n\nIntro.\n\n## Record\n\nid, slug.\n\nSource: nowhere.\n",
      reason: /carries no file link/,
    },
  ];

  for (const { name, markdown, reason } of cases) {
    it(`refuses ${name}`, () => {
      expect(() => parseGlossary(markdown)).toThrow(GlossaryUnreadable);
      expect(() => parseGlossary(markdown)).toThrow(reason);
    });
  }

  it("refuses two terms that would share an anchor", () => {
    const markdown =
      "# Glossary\n\nIntro.\n\n## Aspect\n\nOne.\n\nSource: [content/a.ts](../a.ts).\n\n" +
      "## aspect\n\nTwo.\n\nSource: [content/b.ts](../b.ts).\n";
    expect(() => parseGlossary(markdown)).toThrow(/share the anchor "#aspect"/);
  });

  it("builds an anchor from the term's own characters and refuses one that has none", () => {
    expect(glossaryAnchor("In Synch")).toBe("in-synch");
    expect(() => glossaryAnchor("—")).toThrow(GlossaryUnreadable);
  });
});

describe("the rendered page", () => {
  const document = parseGlossary(DOCUMENT);
  const html = renderToStaticMarkup(<GlossaryPage copy={glossaryPageCopy} document={document} />);

  it("prints the term count it derived from the document", () => {
    expect(html).toContain(`${document.terms.length} terms`);
    expect(html).toContain("7 terms");
  });

  it("prints every term as a heading anchored on its id, and lists them in the index", () => {
    for (const term of document.terms) {
      expect(html).toContain(`id="${term.anchor}"`);
      expect(html).toContain(`href="#${term.anchor}"`);
      expect(html).toContain(`>${term.term}<`);
    }
  });

  it("names each term's source file as text, never as a link into the checkout", () => {
    expect(html).toContain("content/record.ts");
    expect(html).not.toContain('href="../content');
    expect(html).not.toContain('href="content/');
  });

  it("renders a definition's inline code as code", () => {
    expect(html).toContain("gapOf(2, 5) === 3");
    expect(html).toContain("<code");
  });

  it("draws the unreadable sentence instead of an empty list when the document is null", () => {
    const fallback = renderToStaticMarkup(<GlossaryPage copy={glossaryPageCopy} document={null} />);
    expect(fallback).toContain("docs/glossary.md");
    expect(fallback).not.toContain("0 terms");
    expect(fallback).not.toContain('role="note"');
  });
});
